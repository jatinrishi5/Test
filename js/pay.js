(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var form = $('#pay-form');
  var success = $('#pay-success');
  if (!form) return;

  // On Vercel the API is same-origin. The GitHub Pages copy calls the Vercel site.
  var API_BASE = /\.github\.io$/.test(location.hostname) ? 'https://jrishicpas.vercel.app' : '';
  var submitBtn = $('#pay-submit');
  var payError = $('#pay-error');

  // ---------- Payment connection ----------
  // The server says whether payments are on (both keys set in Vercel). If it's off,
  // unreachable, or the page is opened as a local file, the page runs in preview mode.
  var processor = null;   // card-form library instance
  var elements = null;
  var cardForm = null;     // credit card box
  var expressForm = null;  // Apple Pay / Google Pay box
  var mode = 'loading';   // 'loading' | 'live' | 'preview'

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function withTimeout(promise, ms) {
    return Promise.race([promise, new Promise(function (_, reject) { setTimeout(function () { reject(new Error('timeout')); }, ms); })]);
  }

  var ready = withTimeout(fetch(API_BASE + '/api/payment-config', { headers: { Accept: 'application/json' } }), 6000)
    .then(function (r) { return r.ok ? r.json() : { enabled: false }; })
    .then(function (cfg) {
      if (!cfg || !cfg.enabled || !cfg.publishableKey) throw new Error('off');
      return loadScript('https://js.stripe.com/v3/').then(function () {
        processor = window.Stripe(cfg.publishableKey);
        mode = 'live';
        if (cfg.testMode) $('#pay-testmode').hidden = false;
      });
    })
    .catch(function () {
      mode = 'preview';
      $('#pay-preview').hidden = false;
    });

  // ---------- Storage (per browser, optional) ----------
  var STORE_KEY = 'jrishicpas-payment';
  function save(data) { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }
  function load() { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } }

  // ---------- Validation ----------
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var clientPattern = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
  var invoicePattern = /^[A-Z0-9][A-Z0-9-]{0,29}$/;
  function digits(v) { return v.replace(/\D/g, ''); }

  // "1,234.5" -> 123450 cents; invalid -> NaN
  function toCents(v) {
    var s = String(v || '').replace(/[$,\s]/g, '');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return NaN;
    var parts = s.split('.');
    return Number(parts[0]) * 100 + Number(((parts[1] || '') + '00').slice(0, 2));
  }
  function money(cents) {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(cents / 100) + ' CAD';
  }

  var rules = {
    name: function (v) {
      if (!v) return 'Please enter your full name.';
      if (v.length < 2 || !/[A-Za-zÀ-ÿ]/.test(v)) return 'Please enter your full name as it appears on your invoice.';
      return '';
    },
    email: function (v) {
      if (!v) return 'Please enter your email address.';
      if (!emailPattern.test(v)) return 'Enter a valid email, for example name@example.com.';
      return '';
    },
    phone: function (v) {
      var d = digits(v);
      if (!d) return 'Please enter your phone number.';
      if (d.length < 10 || d.length > 15) return 'Enter a valid phone number, for example (416) 555-0100.';
      return '';
    },
    clientId: function (v) {
      if (v && !clientPattern.test(v.toUpperCase())) return 'Client IDs are 3–20 letters, numbers or dashes, for example JR-1042.';
      return '';
    },
    invoice: function (v) {
      if (v && !invoicePattern.test(v.toUpperCase())) return 'Invoice numbers use letters, numbers and dashes only.';
      return '';
    },
    service: function (v) {
      if (!v && !hasInvoice()) return 'Please choose what this payment is for.';
      return '';
    },
    note: function (v) {
      if (v.length > 200) return 'Please keep the note under 200 characters.';
      return '';
    },
    amount: function (v) {
      if (!v) return hasInvoice() ? 'Please enter the total shown on your invoice.' : 'Please enter the amount to pay.';
      var c = toCents(v);
      if (!isFinite(c)) return 'Enter an amount like 250 or 1,234.56.';
      if (c < 100 || c > 5000000) return 'Enter an amount between $1.00 and $50,000.00.';
      return '';
    }
  };

  function setError(input, msg) {
    var field = input.closest('.field');
    if (field) field.classList.toggle('invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    var err = document.getElementById(input.id + '-error');
    if (err) err.textContent = msg;
  }
  function validate(input) {
    var rule = rules[input.name];
    if (!rule) return true;
    var msg = rule(input.value.trim());
    setError(input, msg);
    return !msg;
  }
  function formatPhone(input) {
    var d = digits(input.value);
    if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
    if (d.length === 10) input.value = '(' + d.slice(0, 3) + ') ' + d.slice(3, 6) + '-' + d.slice(6);
  }
  function formatAmount(input) {
    var c = toCents(input.value);
    if (isFinite(c)) input.value = (c / 100).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // ---------- Amount box ----------
  // With an invoice number the box asks for the invoice total. Without one it asks
  // for an amount, what the payment is for (required) and an optional note.
  function hasInvoice() { return !!form.elements.invoice.value.trim(); }
  function updateAmountBox() {
    var inv = form.elements.invoice.value.trim().toUpperCase();
    var box = $('#pay-amount-box');
    box.setAttribute('data-invoice', inv ? 'yes' : 'no');
    $('#pay-amount-title').textContent = inv ? 'Invoice total' : 'Enter an amount';
    $('#pay-amount-sub').textContent = inv
      ? 'Enter the total shown on invoice ' + inv + ', including any GST/HST.'
      : 'No invoice number? Tell us what the payment is for and how much you\u2019d like to pay.';
    $('#pay-amount-label').textContent = inv ? 'Invoice total (CAD)' : 'Amount to pay (CAD)';
    $('#pay-for-req').hidden = !!inv;
    $('#pay-for-optional').hidden = !inv;
    $('#pay-note-field').hidden = !!inv;
    if (inv) { setError(form.elements.service, ''); setError(form.elements.note, ''); }
  }
  form.elements.invoice.addEventListener('input', updateAmountBox);
  updateAmountBox();

  Object.keys(rules).forEach(function (name) {
    var input = form.elements[name];
    if (name === 'service') input.addEventListener('change', function () { validate(input); });
    input.addEventListener('blur', function () {
      if (name === 'phone') formatPhone(input);
      if (name === 'amount') formatAmount(input);
      if (name === 'clientId' || name === 'invoice') input.value = input.value.trim().toUpperCase();
      if (input.value.trim() || input.closest('.field').classList.contains('invalid')) validate(input);
    });
    input.addEventListener('input', function () {
      if (input.closest('.field').classList.contains('invalid')) validate(input);
    });
  });

  var confirmBox = $('#pay-confirm');
  confirmBox.addEventListener('change', function () { if (confirmBox.checked) $('#pay-confirm-error').textContent = ''; });

  // ---------- Steps ----------
  var steps = $$('.step', form);
  var current = 1;
  function showStep(n) {
    current = n;
    steps.forEach(function (s) { s.hidden = +s.getAttribute('data-step') !== n; });
    $('#pay-step-label').textContent = 'Step ' + n + ' of ' + steps.length;
    $('#pay-step-name').textContent = steps[n - 1].getAttribute('data-name');
    $('.progress-fill', form).style.width = (n / steps.length * 100) + '%';
    $('.progress-track', form).setAttribute('aria-valuenow', String(n));
    $('.step-title', steps[n - 1]).focus();
  }

  function values() {
    return {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      clientId: form.elements.clientId.value.trim().toUpperCase(),
      invoice: form.elements.invoice.value.trim().toUpperCase(),
      service: form.elements.service.value,
      note: hasInvoice() ? '' : form.elements.note.value.trim().replace(/\s+/g, ' '),
      cents: toCents(form.elements.amount.value)
    };
  }

  function fillSummary(dl, v) {
    dl.textContent = '';
    [['Name', v.name], ['Email', v.email], ['Phone', v.phone], ['Client ID', v.clientId],
      ['Invoice', v.invoice], ['Payment for', v.service], ['Note', v.note], ['Amount', v.amountText]].forEach(function (row) {
      if (!row[1]) return;
      var wrap = document.createElement('div');
      var dt = document.createElement('dt'); dt.textContent = row[0];
      var dd = document.createElement('dd'); dd.textContent = row[1];
      wrap.appendChild(dt); wrap.appendChild(dd); dl.appendChild(wrap);
    });
  }

  // Card form styled to match the site
  var appearance = {
    theme: 'stripe',
    variables: {
      colorPrimary: '#7d5f2e',
      colorBackground: '#fffdf9',
      colorText: '#1c2233',
      colorTextSecondary: '#5a5f6e',
      colorDanger: '#b5391f',
      fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
      fontSizeBase: '15px',
      borderRadius: '10px',
      spacingUnit: '4px'
    },
    rules: {
      '.Input': { border: '1.5px solid #cbbfa9', boxShadow: 'none' },
      '.Input:focus': { borderColor: '#7d5f2e', boxShadow: '0 0 0 4px #f0e6d3' },
      '.Label': { fontWeight: '600', color: '#101a30' }
    }
  };

  function mountCardForm(v) {
    if (mode !== 'live') {
      $('#pay-element-placeholder').hidden = false;
      return;
    }
    $('#pay-element-placeholder').hidden = true;
    if (!elements) {
      elements = processor.elements({
        mode: 'payment', amount: v.cents, currency: 'cad', paymentMethodTypes: ['card'],
        appearance: appearance,
        fonts: [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap' }]
      });

      // Credit card box: card fields only
      cardForm = elements.create('payment', {
        layout: 'tabs',
        business: { name: 'JRishiCPAs' },
        defaultValues: { billingDetails: { name: v.name, email: v.email, phone: v.phone } },
        wallets: { applePay: 'never', googlePay: 'never' },
        terms: { card: 'never' }
      });
      cardForm.mount('#payment-element');

      // Express pay box: Apple Pay / Google Pay buttons, shown only on devices that support them
      expressForm = elements.create('expressCheckout', {
        paymentMethods: { applePay: 'auto', googlePay: 'auto', link: 'never' },
        buttonType: { applePay: 'plain', googlePay: 'plain' },
        buttonTheme: { applePay: 'black', googlePay: 'black' },
        buttonHeight: 46
      });
      expressForm.on('ready', function (e) {
        var m = e && e.availablePaymentMethods;
        var any = !!(m && (m.applePay || m.googlePay));
        $('#pay-express').hidden = !any;
        $('#pay-or').hidden = !any;
      });
      expressForm.on('confirm', function (event) {
        startPayment(values(), function () {
          if (event && typeof event.paymentFailed === 'function') event.paymentFailed({ reason: 'fail' });
        });
      });
      expressForm.mount('#express-element');
    } else {
      elements.update({ amount: v.cents });
    }
  }

  $('[data-pay-next]', form).addEventListener('click', function () {
    var first = null;
    Object.keys(rules).forEach(function (name) {
      var input = form.elements[name];
      if (name === 'phone') formatPhone(input);
      if (name === 'amount') formatAmount(input);
      if (!validate(input) && !first) first = input;
    });
    if (!confirmBox.checked) {
      $('#pay-confirm-error').textContent = 'Please confirm your details before continuing.';
      if (!first) first = confirmBox;
    }
    if (first) { first.focus(); return; }
    var v = values();
    fillSummary($('#pay-summary'), v);
    $('#pay-total').textContent = money(v.cents);
    $('#pay-submit-amount').textContent = money(v.cents).replace(' CAD', '');
    payError.textContent = '';
    showStep(2);
    ready.then(function () { mountCardForm(v); });
  });

  $('[data-pay-back]', form).addEventListener('click', function () { showStep(1); });

  // ---------- Outcome ----------
  function showOutcome(kind, data) {
    form.hidden = true;
    $('#pay-preview').hidden = true;
    $('#pay-testmode').hidden = true;
    success.hidden = false;
    var first = data && data.name ? data.name.split(/\s+/)[0] : '';
    var email = data && data.email ? data.email : '';
    var title = $('#pay-success-title'), text = $('#pay-success-text');
    if (kind === 'preview') {
      title.textContent = 'Preview: payment complete';
      text.textContent = 'In live mode, ' + (first || 'the client') + '’s card would be charged here and a “Payment received” email from JRishiCPAs would go to ' + (email || 'their email') + '.';
    } else if (kind === 'processing') {
      title.textContent = 'Payment processing';
      text.textContent = 'Your payment is being processed. We’ll email ' + (email || 'you') + ' as soon as it’s confirmed.';
    } else {
      title.textContent = 'Payment received' + (first ? ', thank you ' + first : '');
      text.textContent = 'Your payment was successful. A confirmation email is on its way to ' + (email || 'you') + '. Keep it for your records.';
    }
    if (data) {
      var dl = $('#pay-success-summary');
      fillSummary(dl, { name: data.name, clientId: data.clientId, invoice: data.invoice, service: data.service, note: data.note, amountText: data.cents ? money(data.cents) : '' });
      dl.hidden = false;
    }
    success.focus();
  }

  function setBusy(busy, label) {
    submitBtn.disabled = busy;
    if (busy) submitBtn.textContent = label || 'Processing…';
    else submitBtn.innerHTML = 'Pay <span id="pay-submit-amount">' + money(values().cents).replace(' CAD', '') + '</span>';
  }

  // Shared by the credit card box ("Pay" button) and the express pay buttons.
  function startPayment(v, onFail) {
    payError.textContent = '';
    save({ name: v.name, email: v.email, clientId: v.clientId, invoice: v.invoice, service: v.service, note: v.note, cents: v.cents });
    setBusy(true);
    elements.submit()
      .then(function (r) {
        if (r.error) throw { shown: r.error.message };
        return fetch(API_BASE + '/api/create-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: v.name, email: v.email, phone: v.phone, clientId: v.clientId, invoice: v.invoice,
            service: v.service, note: v.note, amount: (v.cents / 100).toFixed(2), company: form.elements.company.value
          })
        });
      })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.clientSecret) {
          if (res.d && res.d.fields) {
            showStep(1);
            Object.keys(res.d.fields).forEach(function (k) { if (form.elements[k]) setError(form.elements[k], res.d.fields[k]); });
          }
          throw { shown: (res.d && res.d.error) || 'We couldn\u2019t start the payment. Please try again.' };
        }
        return processor.confirmPayment({
          elements: elements,
          clientSecret: res.d.clientSecret,
          confirmParams: { return_url: location.origin + location.pathname + '?status=return' },
          redirect: 'if_required'
        });
      })
      .then(function (result) {
        if (result.error) throw { shown: result.error.message };
        var status = result.paymentIntent && result.paymentIntent.status;
        if (status === 'succeeded') showOutcome('succeeded', v);
        else if (status === 'processing') showOutcome('processing', v);
        else throw { shown: 'Your payment wasn\u2019t completed. Please try again or use a different card.' };
      })
      .catch(function (err) {
        payError.textContent = (err && err.shown) || 'Something went wrong. Please try again, or contact us.';
        setBusy(false);
        if (onFail) onFail();
      });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (current !== 2) return;
    var v = values();
    ready.then(function () {
      if (mode !== 'live') {
        save({ name: v.name, email: v.email, clientId: v.clientId, invoice: v.invoice, service: v.service, note: v.note, cents: v.cents });
        showOutcome('preview', v);
        return;
      }
      startPayment(v);
    });
  });

  // ---------- Return from a bank check (3-D Secure) ----------
  var params = new URLSearchParams(window.location.search);
  var returnSecret = params.get('payment_intent_client_secret');
  if (params.get('status') === 'return' && returnSecret) {
    ready.then(function () {
      if (mode !== 'live') return;
      processor.retrievePaymentIntent(returnSecret).then(function (r) {
        var status = r.paymentIntent && r.paymentIntent.status;
        if (status === 'succeeded') showOutcome('succeeded', load());
        else if (status === 'processing') showOutcome('processing', load());
        else {
          var alert = $('#pay-alert');
          alert.textContent = 'Your payment wasn’t completed and you haven’t been charged. Please check your details and try again.';
          alert.hidden = false;
        }
        history.replaceState(null, '', location.pathname);
      });
    });
  }

  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
