(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------- Mobile navigation ----------
  var toggle = $('.nav-toggle');
  var nav = $('#site-nav');

  function setNav(open) {
    toggle.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('open', open);
  }

  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      setNav(toggle.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setNav(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setNav(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) setNav(false);
    });
    window.matchMedia('(min-width: 901px)').addEventListener('change', function (mq) {
      if (mq.matches) setNav(false);
    });
  }

  // ---------- Header shadow on scroll ----------
  var header = $('.site-header');
  function onScroll() { header.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- Tabs (pricing, checklist) ----------
  function selectTab(tab, focus) {
    var list = tab.closest('[role="tablist"]');
    $$('[role="tab"]', list).forEach(function (t) {
      var selected = t === tab;
      t.setAttribute('aria-selected', String(selected));
      t.tabIndex = selected ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) tab.focus();
  }

  $$('[role="tablist"]').forEach(function (list) {
    var tabs = $$('[role="tab"]', list);
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { selectTab(tab); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); selectTab(next, true); }
      });
    });
  });

  // Hero shortcuts open the matching pricing tab
  $$('[data-open-tab]').forEach(function (link) {
    link.addEventListener('click', function () {
      var tab = document.getElementById(link.getAttribute('data-open-tab'));
      if (tab) selectTab(tab);
    });
  });

  // ---------- FAQ accordion ----------
  var triggers = $$('.acc-trigger');
  triggers.forEach(function (btn, index) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
    });
    btn.addEventListener('keydown', function (e) {
      var target = null;
      if (e.key === 'ArrowDown') target = triggers[(index + 1) % triggers.length];
      else if (e.key === 'ArrowUp') target = triggers[(index - 1 + triggers.length) % triggers.length];
      else if (e.key === 'Home') target = triggers[0];
      else if (e.key === 'End') target = triggers[triggers.length - 1];
      if (target) { e.preventDefault(); target.focus(); }
    });
  });

  // ---------- CRA deadlines: mark past and next ----------
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var nextMarked = false;
  $$('#deadlines li').forEach(function (li) {
    var parts = li.getAttribute('data-date').split('-');
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    if (d < today) {
      li.classList.add('is-past');
    } else if (!nextMarked) {
      nextMarked = true;
      li.classList.add('is-next');
      var pill = document.createElement('span');
      pill.className = 'next-pill';
      pill.textContent = 'Next';
      li.querySelector('time').appendChild(pill);
    }
  });

  // ---------- Document checklist counters ----------
  $$('.checklist').forEach(function (panel) {
    var boxes = $$('input[type="checkbox"]', panel);
    var count = $('.cl-count span', panel);
    panel.addEventListener('change', function () {
      count.textContent = boxes.filter(function (b) { return b.checked; }).length;
    });
  });

  // ---------- Intake form (3 steps) ----------
  var form = $('#intake');
  var success = $('#intake-success');
  var steps = $$('.step', form);
  var fill = $('.progress-fill', form);
  var track = $('.progress-track', form);
  var stepLabel = $('#step-label');
  var stepName = $('#step-name');
  var planNote = $('#plan-note');
  var fitResult = $('#fit-result');
  var current = 1;
  var chosenPlan = '';

  var PACKAGES = {
    personal: { Basic: '$89', Standard: '$179', Comprehensive: 'from $349' },
    business: { Accountant: '$299/month', Controller: '$799/month', CFO: 'from $1,999/month' }
  };

  function clientType() {
    var r = $('input[name="clientType"]:checked', form);
    return r ? r.value : '';
  }

  function checked(name) {
    return $$('input[name="' + name + '"]:checked', form).map(function (c) { return c.value; });
  }

  function suggestPersonal() {
    var p = checked('personal');
    if (!p.length) return '';
    var complex = ['rental', 'selfemployed', 'sold', 'foreign'].filter(function (v) { return p.indexOf(v) > -1; });
    if (p.indexOf('selfemployed') > -1 || complex.length >= 2) return 'Comprehensive';
    if (complex.length === 1 || p.indexOf('investments') > -1 || p.indexOf('newcomer') > -1) return 'Standard';
    return 'Basic';
  }

  function suggestBusiness() {
    var b = checked('business');
    if (!b.length) return '';
    if (b.indexOf('cfo') > -1) return 'CFO';
    if (b.indexOf('payroll') > -1 || (b.indexOf('corp') > -1 && b.indexOf('books') > -1)) return 'Controller';
    return 'Accountant';
  }

  function suggestion() {
    var type = clientType();
    var out = [];
    if (type === 'personal' || type === 'both') {
      var p = suggestPersonal();
      if (p) out.push('Personal · ' + p + ' (' + PACKAGES.personal[p] + ')');
    }
    if (type === 'business' || type === 'both') {
      var b = suggestBusiness();
      if (b) out.push('Business · ' + b + ' (' + PACKAGES.business[b] + ')');
    }
    return out.join(' + ');
  }

  function updateFit() {
    fitResult.textContent = suggestion() || 'Select what applies to see a suggestion';
  }

  function updateGroups() {
    var type = clientType();
    $$('.check-group', form).forEach(function (g) {
      var group = g.getAttribute('data-group');
      g.hidden = !(type === 'both' || type === group);
    });
    updateFit();
  }

  function showStep(n, focus) {
    current = n;
    steps.forEach(function (s) { s.hidden = +s.getAttribute('data-step') !== n; });
    var step = steps[n - 1];
    stepLabel.textContent = 'Step ' + n + ' of ' + steps.length;
    stepName.textContent = step.getAttribute('data-name');
    fill.style.width = (n / steps.length * 100) + '%';
    track.setAttribute('aria-valuenow', String(n));
    if (focus) $('.step-title', step).focus();
  }

  function setError(id, msg) {
    var el = document.getElementById(id);
    if (el) el.textContent = msg;
  }

  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var phonePattern = /^[+()\-.\s\d]{7,20}$/;

  var fieldRules = {
    name: function (v) {
      if (!v) return 'Please enter your name.';
      if (v.length < 2) return 'Name must be at least 2 characters.';
      return '';
    },
    email: function (v) {
      if (!v) return 'Please enter your email address.';
      if (!emailPattern.test(v)) return 'Enter a valid email, for example name@example.com.';
      return '';
    },
    phone: function (v) {
      if (v && !phonePattern.test(v)) return 'Enter a valid phone number, for example (555) 010-0000.';
      return '';
    }
  };

  function validateField(input) {
    var msg = fieldRules[input.name](input.value.trim());
    input.closest('.field').classList.toggle('invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    setError(input.name + '-error', msg);
    return !msg;
  }

  function validateStep(n) {
    if (n === 1) {
      var ok = !!clientType();
      setError('clientType-error', ok ? '' : 'Please choose who this is for.');
      if (!ok) $('input[name="clientType"]', form).focus();
      return ok;
    }
    if (n === 2) {
      var ok2 = !!suggestion();
      setError('situation-error', ok2 ? '' : 'Select at least one option that applies to you.');
      return ok2;
    }
    var first = null;
    Object.keys(fieldRules).forEach(function (name) {
      var input = form.elements[name];
      if (!validateField(input) && !first) first = input;
    });
    if (first) first.focus();
    return !first;
  }

  if (form) {
    $$('input[name="clientType"]', form).forEach(function (r) {
      r.addEventListener('change', function () {
        setError('clientType-error', '');
        updateGroups();
      });
    });

    $$('.check-group input', form).forEach(function (c) {
      c.addEventListener('change', function () {
        setError('situation-error', '');
        updateFit();
      });
    });

    $$('[data-next]', form).forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (validateStep(current)) showStep(current + 1, true);
      });
    });

    $$('[data-back]', form).forEach(function (btn) {
      btn.addEventListener('click', function () { showStep(current - 1, true); });
    });

    Object.keys(fieldRules).forEach(function (name) {
      var input = form.elements[name];
      input.addEventListener('blur', function () {
        if (input.value.trim() || input.closest('.field').classList.contains('invalid')) validateField(input);
      });
      input.addEventListener('input', function () {
        if (input.closest('.field').classList.contains('invalid')) validateField(input);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (current !== steps.length) {
        if (validateStep(current)) showStep(current + 1, true);
        return;
      }
      if (!validateStep(3)) return;

      // No backend: show a confirmation instead of sending data.
      var firstName = form.elements.name.value.trim().split(/\s+/)[0];
      var pkg = chosenPlan || suggestion();
      $('#success-title').textContent = 'Thanks, ' + firstName + '!';
      $('#success-text').textContent =
        'We received your request' + (pkg ? ' for ' + pkg : '') + '. We\'ll email ' +
        form.elements.email.value.trim() + ' within one business day to schedule your free call.';
      form.hidden = true;
      success.hidden = false;
      success.focus();
    });

    $('#intake-reset').addEventListener('click', function () {
      form.reset();
      chosenPlan = '';
      planNote.hidden = true;
      $$('.field', form).forEach(function (f) { f.classList.remove('invalid'); });
      $$('[aria-invalid]', form).forEach(function (el) { el.removeAttribute('aria-invalid'); });
      $$('.error', form).forEach(function (el) { el.textContent = ''; });
      updateGroups();
      showStep(1);
      success.hidden = true;
      form.hidden = false;
      $('.step-title', steps[0]).focus();
    });

    // Pricing buttons pre-fill the intake form
    $$('[data-plan]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        chosenPlan = btn.getAttribute('data-plan');
        var type = btn.getAttribute('data-type');
        var radio = $('input[name="clientType"][value="' + type + '"]', form);
        if (radio) radio.checked = true;
        setError('clientType-error', '');
        updateGroups();
        planNote.textContent = 'You chose ' + chosenPlan + '. We\'ll confirm the right fit on your call.';
        planNote.hidden = false;
        if (!form.hidden) showStep(clientType() ? 2 : 1);
      });
    });

    updateGroups();
    showStep(1);
  }

  // ---------- Newsletter ----------
  var nl = $('#newsletter-form');
  if (nl) {
    var nlInput = $('#nl-email');
    nl.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = nlInput.value.trim();
      var msg = !v ? 'Please enter your email address.' : (!emailPattern.test(v) ? 'Enter a valid email, for example name@example.com.' : '');
      setError('nl-error', msg);
      nlInput.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) { nlInput.focus(); return; }
      nl.reset();
      nlInput.removeAttribute('aria-invalid');
      $('#nl-success').hidden = false;
    });
  }

  // ---------- Hide the mobile contact bar while the booking form is on screen ----------
  var mobileCta = $('#mobile-cta');
  var book = $('#book');
  if (mobileCta && book && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      mobileCta.classList.toggle('is-hidden', entries[0].isIntersecting);
    }, { threshold: 0.15 }).observe(book);
  }

  // ---------- Footer year ----------
  var year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
