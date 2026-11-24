// Emails through Resend (https://resend.com).
// - sendAlert: tells the firm about a new booking or subscriber.
// - sendClientConfirmation: "Thanks, we got your request" to the person who booked.
// Neither ever throws: a failed or slow email must not lose a submission that
// has already been saved to Supabase.

// Plain-English labels for the booking form's "What applies to you?" options.
const SITUATION_LABELS = {
  employment: 'Employment income (T4)',
  investments: 'Investments or savings income',
  student: 'Student or recent graduate',
  newcomer: 'New to Canada',
  rental: 'Rental property',
  selfemployed: 'Self-employed or side business',
  sold: 'Sold property, shares or crypto',
  behind: 'Behind on filing or got a CRA letter (personal)',
  soleprop: 'Sole proprietor',
  corp: 'Incorporated',
  planning: 'Planning to start or incorporate',
  books: 'Needs monthly bookkeeping',
  gst: 'GST/HST registered',
  payroll: 'Has employees',
  cfo: 'Wants forecasts or CFO support',
  cra: 'Behind on filing or got a CRA letter (business)'
};
const TYPE_LABELS = { personal: 'Personal', business: 'Business', both: 'Personal and business' };

const SITE_URL = () => process.env.SITE_URL || 'https://jrishicpas.vercel.app';

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function oneLine(value, max) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, max || 150);
}

function torontoTime() {
  return new Date().toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';
}

// Link straight to the Supabase table editor for this project.
function dashboardUrl() {
  try {
    const ref = new URL(process.env.SUPABASE_URL).hostname.split('.')[0];
    return `https://supabase.com/dashboard/project/${ref}/editor`;
  } catch (e) {
    return 'https://supabase.com/dashboard';
  }
}

// Low-level send with a 5-second cap. Returns true when Resend accepted it.
async function sendEmail({ from, to, subject, html, text, replyTo, label }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.warn(`${label} skipped: RESEND_API_KEY not set`); return false; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: oneLine(subject), html, text, reply_to: replyTo || undefined }),
      signal: controller.signal
    });
    if (!response.ok) {
      let detail = {};
      try { detail = await response.json(); } catch (e) { /* empty body */ }
      console.error(`${label} failed`, response.status, detail.name || '');
      return false;
    }
    return true;
  } catch (err) {
    console.error(`${label} error`, err.name);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Send through Gmail (SMTP with an App Password). Used for client confirmations
// until a domain is verified in Resend. Capped at 8 seconds.
let gmailTransport = null;
async function sendViaGmail({ to, subject, html, text, replyTo, label }) {
  const user = process.env.GMAIL_USER;
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  if (!user || !pass) { console.warn(`${label} skipped: Gmail not configured`); return false; }
  try {
    if (!gmailTransport) {
      const nodemailer = require('nodemailer');
      gmailTransport = nodemailer.createTransport({
        host: 'smtp.gmail.com', port: 465, secure: true, auth: { user, pass },
        connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 8000
      });
    }
    const send = gmailTransport.sendMail({
      from: { name: process.env.GMAIL_FROM_NAME || 'JRishiCPAs', address: user },
      to, subject: oneLine(subject), html, text, replyTo: replyTo || undefined
    });
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
    await Promise.race([send, timeout]);
    return true;
  } catch (err) {
    // err.code is e.g. EAUTH (bad App Password) or ETIMEDOUT; no personal data logged.
    console.error(`${label} via Gmail failed`, err.code || err.message);
    return false;
  }
}

function shell(inner) {
  return '<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Segoe UI,Helvetica,Arial,sans-serif">' +
    '<div style="max-width:600px;margin:0 auto;padding:24px 16px">' +
    '<div style="background:#101a30;color:#c5a46d;padding:16px 20px;border-radius:10px 10px 0 0;font-family:Georgia,serif;font-size:20px">JRishi<i>CPAs</i></div>' +
    `<div style="background:#ffffff;border-radius:0 0 10px 10px;padding:22px 22px 24px;color:#1c2233;font-size:15px;line-height:1.6">${inner}</div>` +
    '</div></body></html>';
}

// ---------- Alert to the firm ----------
async function sendAlert({ subject, title, rows, replyTo, footer, link }) {
  const to = process.env.NOTIFY_EMAIL;
  if (!to) { console.warn('alert skipped: NOTIFY_EMAIL not set'); return false; }
  const button = link && link.href ? link : { href: dashboardUrl(), label: 'Open in Supabase' };
  const cells = rows.map(([label, value]) => (
    `<tr><td style="padding:10px 14px;border-bottom:1px solid #ece6da;color:#6b6e78;font-size:13px;width:150px;vertical-align:top">${esc(label)}</td>` +
    `<td style="padding:10px 14px;border-bottom:1px solid #ece6da;color:#1c2233;font-size:14px;white-space:pre-wrap">${esc(value || '—')}</td></tr>`
  )).join('');
  const html = shell(
    `<h1 style="margin:0 0 14px;font-size:20px;color:#101a30">${esc(title || subject)}</h1>` +
    `<table style="width:100%;border-collapse:collapse">${cells}</table>` +
    `<p style="margin:18px 0 0"><a href="${esc(button.href)}" style="display:inline-block;background:#c5a46d;color:#101a30;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px">${esc(button.label)}</a></p>` +
    (footer ? `<p style="margin:16px 0 0;color:#6b6e78;font-size:13px">${esc(footer)}</p>` : '')
  );
  const text = rows.map(([label, value]) => `${label}: ${value || '-'}`).join('\n') +
    `\n\n${button.label}: ${button.href}` + (footer ? `\n\n${footer}` : '');
  return sendEmail({
    from: process.env.RESEND_FROM || 'JRishiCPAs Website <onboarding@resend.dev>',
    to, subject, html, text, replyTo, label: 'alert email'
  });
}

// ---------- Confirmation to the client ----------
// Anyone can type any address into a public form, so this email contains only
// fixed wording, a first name that passes a strict check, and labels from the
// fixed list above. The visitor's free-text message is never echoed back.
function safeFirstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || '';
  return /^[\p{L}][\p{L}'’.-]{0,29}$/u.test(first) ? first : '';
}

async function sendClientConfirmation(row) {
  // Sender, in order of preference:
  //   1. CLIENT_FROM: an address on a domain verified in Resend (the long-term setup)
  //   2. GMAIL_USER + GMAIL_APP_PASSWORD: send through Gmail for the time being
  // With neither set, confirmations are off.
  const resendFrom = process.env.CLIENT_FROM;
  const viaGmail = !resendFrom && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;
  if (!resendFrom && !viaGmail) return false;

  const first = safeFirstName(row.name);
  const situations = (row.situations || []).map((s) => SITUATION_LABELS[s]).filter(Boolean);
  const type = TYPE_LABELS[row.client_type] || '';
  const site = SITE_URL();
  // When self-scheduling is on (BOOKING_URL = the Cal.com booking page), say so
  // and offer a button for anyone who closed the page before picking a time.
  const bookingUrl = /^https:\/\//.test(process.env.BOOKING_URL || '') ? process.env.BOOKING_URL : '';
  const intro = bookingUrl
    ? 'Thank you for booking a free 20-minute consultation with JRishiCPAs. Your request has reached us. If you picked a time, your calendar invitation is on its way. If not, you can choose one anytime:'
    : 'Thank you for booking a free 20-minute consultation with JRishiCPAs. Your request has reached us, and we’ll email you shortly to arrange a time for your call.';
  const step1 = bookingUrl ? 'Pick a time for your call, if you haven’t already.' : 'We’ll email you to arrange a time that suits you.';

  const told = [type ? `Who it’s for: ${type}` : '', ...situations].filter(Boolean);
  const html = shell(
    `<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:500;font-size:24px;color:#101a30">Thanks${first ? ', ' + esc(first) : ''}! We’ve got your request.</h1>` +
    `<p style="margin:0 0 14px">${esc(intro)}</p>` +
    (bookingUrl ? `<p style="margin:0 0 16px"><a href="${esc(bookingUrl)}" style="display:inline-block;background:#101a30;color:#ffffff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:6px">Choose a time</a></p>` : '') +
    (told.length
      ? '<p style="margin:18px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7d5f2e;font-weight:600">What you told us</p>' +
        `<ul style="margin:0 0 6px;padding-left:20px">${told.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>`
      : '') +
    '<p style="margin:18px 0 6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#7d5f2e;font-weight:600">What happens next</p>' +
    '<ol style="margin:0 0 14px;padding-left:20px">' +
    `<li>${esc(step1)}</li>` +
    '<li>Your free 20-minute call, by phone or video.</li>' +
    '<li>We’ll confirm which services fit and the next steps.</li>' +
    '</ol>' +
    '<p style="margin:0 0 14px">Need to add something? Just reply to this email.</p>' +
    '<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #ece6da;color:#6b6e78;font-size:12.5px">' +
    `JRishiCPAs · Tax &amp; accounting, online across Canada · <a href="${esc(site)}" style="color:#7d5f2e">${esc(site.replace(/^https?:\/\//, ''))}</a><br>` +
    'You’re receiving this because a consultation was requested on our website with this address. Didn’t request it? You can ignore this email.</p>'
  );
  const text = [
    `Thanks${first ? ', ' + first : ''}! We've got your request.`,
    '',
    intro,
    ...(bookingUrl ? [bookingUrl] : []),
    ...(told.length ? ['', 'What you told us:', ...told.map((t) => `- ${t}`)] : []),
    '',
    'What happens next:',
    `1. ${step1}`,
    '2. Your free 20-minute call, by phone or video.',
    '3. We\'ll confirm which services fit and the next steps.',
    '',
    'Need to add something? Just reply to this email.',
    '',
    `JRishiCPAs - Tax & accounting, online across Canada - ${site}`,
    'You\'re receiving this because a consultation was requested on our website with this address. Didn\'t request it? You can ignore this email.'
  ].join('\n');

  const message = {
    to: row.email,
    subject: 'We’ve received your consultation request – JRishiCPAs',
    html, text,
    replyTo: process.env.NOTIFY_EMAIL || undefined,
    label: 'client confirmation'
  };
  return resendFrom ? sendEmail({ from: resendFrom, ...message }) : sendViaGmail(message);
}

// ---------- Payment received (to the client) ----------
// Sent by /api/stripe-webhook after Stripe confirms a payment. Contains only fixed
// wording, a first name that passes a strict check, the amount from Stripe, and
// the Client ID / invoice number (already limited to letters, digits and dashes).
function formatMoney(amountMinor, currency) {
  const code = String(currency || 'cad').toUpperCase();
  try {
    return new Intl.NumberFormat('en-CA', { style: 'currency', currency: code }).format((amountMinor || 0) / 100) + ' ' + code;
  } catch (e) {
    return ((amountMinor || 0) / 100).toFixed(2) + ' ' + code;
  }
}

async function sendPaymentConfirmation(p) {
  const resendFrom = process.env.CLIENT_FROM;
  const viaGmail = !resendFrom && process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD;
  if (!resendFrom && !viaGmail) return false;
  if (!p.email) return false;

  const first = safeFirstName(p.name);
  const site = SITE_URL();
  const amount = formatMoney(p.amount, p.currency);
  const rows = [
    ['Amount paid', amount],
    ['Date', p.paidAt],
    ['Client ID', p.clientId],
    ['Invoice', p.invoice],
    ['Payment for', p.service],
    ['Payment reference', p.reference]
  ].filter(([, v]) => v);

  const html = shell(
    `<h1 style="margin:0 0 12px;font-family:Georgia,serif;font-weight:500;font-size:24px;color:#101a30">Payment received${first ? ', thank you ' + esc(first) : ''}.</h1>` +
    `<p style="margin:0 0 16px">We’ve received your payment of <strong>${esc(amount)}</strong>. Thank you for paying online.</p>` +
    '<table style="width:100%;border-collapse:collapse;margin:0 0 16px">' +
    rows.map(([label, value]) => (
      `<tr><td style="padding:9px 12px;border-bottom:1px solid #ece6da;color:#6b6e78;font-size:13px;width:150px">${esc(label)}</td>` +
      `<td style="padding:9px 12px;border-bottom:1px solid #ece6da;color:#1c2233;font-size:14px;font-weight:600">${esc(value)}</td></tr>`
    )).join('') +
    '</table>' +
    '<p style="margin:0 0 14px">Keep this email for your records.</p>' +
    '<p style="margin:0 0 14px">Questions about this payment or your invoice? Just reply to this email.</p>' +
    '<p style="margin:22px 0 0;padding-top:14px;border-top:1px solid #ece6da;color:#6b6e78;font-size:12.5px">' +
    `JRishiCPAs · Tax &amp; accounting, online across Canada · <a href="${esc(site)}" style="color:#7d5f2e">${esc(site.replace(/^https?:\/\//, ''))}</a><br>` +
    'You’re receiving this because a payment was made to JRishiCPAs with this email address.</p>'
  );
  const text = [
    `Payment received${first ? ', thank you ' + first : ''}.`,
    '',
    `We've received your payment of ${amount}. Thank you for paying online.`,
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    'Keep this email for your records.',
    'Questions about this payment or your invoice? Just reply to this email.',
    '',
    `JRishiCPAs - Tax & accounting, online across Canada - ${site}`
  ].join('\n');

  const message = {
    to: p.email,
    subject: `Payment received: ${amount} – JRishiCPAs`,
    html, text,
    replyTo: process.env.NOTIFY_EMAIL || undefined,
    label: 'payment confirmation'
  };
  return resendFrom ? sendEmail({ from: resendFrom, ...message }) : sendViaGmail(message);
}

module.exports = { sendAlert, sendClientConfirmation, sendPaymentConfirmation, formatMoney, SITUATION_LABELS, TYPE_LABELS, torontoTime, oneLine };
