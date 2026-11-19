(function () {
  'use strict';

  // ---------- Mobile navigation ----------
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('site-nav');

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
      if (nav.classList.contains('open') && !nav.contains(e.target) && !toggle.contains(e.target)) {
        setNav(false);
      }
    });

    window.matchMedia('(min-width: 901px)').addEventListener('change', function (mq) {
      if (mq.matches) setNav(false);
    });
  }

  // ---------- Header shadow on scroll ----------
  var header = document.querySelector('.site-header');
  function onScroll() {
    header.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---------- FAQ accordion ----------
  var triggers = Array.prototype.slice.call(document.querySelectorAll('.acc-trigger'));

  triggers.forEach(function (btn, index) {
    var panel = document.getElementById(btn.getAttribute('aria-controls'));

    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      panel.hidden = expanded;
    });

    // Arrow / Home / End navigation between accordion headers
    btn.addEventListener('keydown', function (e) {
      var target = null;
      if (e.key === 'ArrowDown') target = triggers[(index + 1) % triggers.length];
      else if (e.key === 'ArrowUp') target = triggers[(index - 1 + triggers.length) % triggers.length];
      else if (e.key === 'Home') target = triggers[0];
      else if (e.key === 'End') target = triggers[triggers.length - 1];
      if (target) {
        e.preventDefault();
        target.focus();
      }
    });
  });

  // ---------- Contact form validation ----------
  var form = document.getElementById('contact-form');
  var success = document.getElementById('form-success');
  var resetBtn = document.getElementById('form-reset');

  var emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  var phonePattern = /^[+()\-.\s\d]{7,20}$/;

  var rules = {
    name: function (v) {
      if (!v) return 'Please enter your name.';
      if (v.length < 2) return 'Name must be at least 2 characters.';
      return '';
    },
    email: function (v) {
      if (!v) return 'Please enter your email address.';
      if (!emailPattern.test(v)) return 'Please enter a valid email, e.g. name@example.com.';
      return '';
    },
    phone: function (v) {
      if (v && !phonePattern.test(v)) return 'Please enter a valid phone number.';
      return '';
    },
    service: function (v) {
      return v ? '' : 'Please choose a service.';
    },
    message: function (v) {
      if (!v) return 'Please tell us how we can help.';
      if (v.length < 10) return 'Please add a little more detail (10+ characters).';
      return '';
    }
  };

  function validateField(input) {
    var rule = rules[input.name];
    if (!rule) return true;
    var msg = rule(input.value.trim());
    var field = input.closest('.field');
    var error = document.getElementById(input.name + '-error');
    field.classList.toggle('invalid', !!msg);
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    error.textContent = msg;
    return !msg;
  }

  if (form) {
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!rules[el.name]) return;
      el.addEventListener('blur', function () {
        if (el.value.trim() || el.closest('.field').classList.contains('invalid')) validateField(el);
      });
      el.addEventListener('input', function () {
        if (el.closest('.field').classList.contains('invalid')) validateField(el);
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var firstInvalid = null;
      Object.keys(rules).forEach(function (name) {
        var input = form.elements[name];
        if (!validateField(input) && !firstInvalid) firstInvalid = input;
      });

      if (firstInvalid) {
        firstInvalid.focus();
        return;
      }

      // No backend: simulate a successful submission.
      form.hidden = true;
      success.hidden = false;
      success.focus();
    });

    resetBtn.addEventListener('click', function () {
      form.reset();
      Array.prototype.forEach.call(form.querySelectorAll('.field'), function (f) { f.classList.remove('invalid'); });
      Array.prototype.forEach.call(form.querySelectorAll('[aria-invalid]'), function (el) { el.removeAttribute('aria-invalid'); });
      success.hidden = true;
      form.hidden = false;
      form.elements.name.focus();
    });
  }

  // ---------- Footer year ----------
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();
})();
