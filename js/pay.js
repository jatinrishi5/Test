(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var form = $('#pay-form');
  var success = $('#pay-success');
  if (!form) return;

  // ---------- Payment connection ----------
  // Paste the payment link into data-payment-link on #pay-form to go live.
  // Without one the page runs in preview mode and no payment is taken.
  var paymentLink = (form.getAttribute('data-payment-link') || '').trim();
  var isLive = /^https:\/\/[A-Za-z0-9.-]+\/[A-Za-z0-9_\-\/]+$/.test(paymentLink);
  var submitBtn = $('#pay-submit');
  if (!isLive) {
    $('#pay-preview').hidden = false;
    submitBtn.innerHTML = 'Simulate payment <span class="arrow" aria-hidden="true">→</span>';
  }

  // ---------- Storage (per browser, optional) ----------
  var STORE_KEY = 'jrishicpas-payment';
  function save(data) { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch (e) { /* ignore */ } }
  function load() { try { return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null'); } catch (e) { return null; } }

  // ---------- Validation ----------
  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var clientPattern = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
  var invoicePattern = /^[A-Z0-9][A-Z0-9-]{0,29}$/;

  function digits(v) { return v.replace(/\D/g, ''); }

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

  Object.keys(rules).forEach(function (name) {
    var input = form.elements[name];
    input.addEventListener('blur', function () {
      if (name === 'phone') formatPhone(input);
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
    var service = form.elements.service.value;
    return {
      name: form.elements.name.value.trim(),
      email: form.elements.email.value.trim(),
      phone: form.elements.phone.value.trim(),
      clientId: form.elements.clientId.value.trim().toUpperCase(),
      invoice: form.elements.invoice.value.trim().toUpperCase(),
      service: service
    };
  }

  function fillSummary(dl, v) {
    dl.textContent = '';
    [['Name', v.name], ['Email', v.email], ['Phone', v.phone], ['Client ID', v.clientId],
      ['Invoice', v.invoice], ['Payment for', v.service]].forEach(function (row) {
      if (!row[1]) return;
      var wrap = document.createElement('div');
      var dt = document.createElement('dt'); dt.textContent = row[0];
      var dd = document.createElement('dd'); dd.textContent = row[1];
      wrap.appendChild(dt); wrap.appendChild(dd); dl.appendChild(wrap);
    });
  }

  $('[data-pay-next]', form).addEventListener('click', function () {
    var first = null;
    Object.keys(rules).forEach(function (name) {
      var input = form.elements[name];
      if (name === 'phone') formatPhone(input);
      if (!validate(input) && !first) first = input;
    });
    if (!confirmBox.checked) {
      $('#pay-confirm-error').textContent = 'Please confirm your details before continuing.';
      if (!first) first = confirmBox;
    }
    if (first) { first.focus(); return; }
    fillSummary($('#pay-summary'), values());
    showStep(2);
  });

  $('[data-pay-back]', form).addEventListener('click', function () { showStep(1); });

  // Reference sent to the payment processor: CLIENTID__INVOICE__PHONEDIGITS (letters, digits, dashes, underscores only)
  function reference(v) {
    var clean = function (s) { return s.replace(/[^A-Za-z0-9-]/g, ''); };
    var parts = [clean(v.clientId) || 'NOID', clean(v.invoice) || 'NOINV', digits(v.phone)];
    return parts.join('__').slice(0, 200);
  }

  function showSuccess(data, previewRun) {
    form.hidden = true;
    $('#pay-preview').hidden = true;
    success.hidden = false;
    var first = data && data.name ? data.name.split(/\s+/)[0] : '';
    if (previewRun) {
      $('#pay-success-title').textContent = 'Preview: payment step reached';
      $('#pay-success-text').textContent = 'In live mode, ' + (first || 'the client') + ' would now pay on the secure checkout page and come back to this confirmation. ' +
        'A "Payment received" email from JRishiCPAs then goes to ' + (data && data.email ? data.email : 'their email') + '.';
    } else {
      $('#pay-success-title').textContent = 'Payment received' + (first ? ', thank you ' + first : '');
      $('#pay-success-text').textContent = 'Your payment was successful. A confirmation email is on its way to ' +
        (data && data.email ? data.email : 'you') + '. Keep it for your records.';
    }
    if (data) {
      var dl = $('#pay-success-summary');
      fillSummary(dl, { name: data.name, email: '', phone: '', clientId: data.clientId, invoice: data.invoice, service: data.service });
      dl.hidden = false;
    }
    success.focus();
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (current !== 2) return;
    var v = values();
    save({ name: v.name, email: v.email, clientId: v.clientId, invoice: v.invoice, service: v.service, at: Date.now() });

    if (!isLive) { showSuccess(v, true); return; }

    var url = new URL(paymentLink);
    url.searchParams.set('prefilled_email', v.email);
    url.searchParams.set('client_reference_id', reference(v));
    submitBtn.disabled = true;
    submitBtn.textContent = 'Opening secure checkout…';
    window.location.assign(url.toString());
  });

  // ---------- Return from checkout ----------
  var params = new URLSearchParams(window.location.search);
  if (params.get('status') === 'success') {
    showSuccess(load(), false);
  }

  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
