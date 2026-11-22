// Alert emails through Resend (https://resend.com).
// sendAlert never throws: a failed or slow email must not lose a submission
// that has already been saved to Supabase.

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

function render(title, rows, footer) {
  const cells = rows.map(([label, value]) => (
    `<tr><td style="padding:10px 14px;border-bottom:1px solid #ece6da;color:#6b6e78;font-size:13px;width:150px;vertical-align:top">${esc(label)}</td>` +
    `<td style="padding:10px 14px;border-bottom:1px solid #ece6da;color:#1c2233;font-size:14px;white-space:pre-wrap">${esc(value || '—')}</td></tr>`
  )).join('');
  return '<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Segoe UI,Helvetica,Arial,sans-serif">' +
    '<div style="max-width:600px;margin:0 auto;padding:24px 16px">' +
    '<div style="background:#101a30;color:#c5a46d;padding:16px 20px;border-radius:10px 10px 0 0;font-weight:600;letter-spacing:.04em">JRishiCPAs · Website</div>' +
    '<div style="background:#ffffff;border-radius:0 0 10px 10px;padding:20px">' +
    `<h1 style="margin:0 0 14px;font-size:20px;color:#101a30">${esc(title)}</h1>` +
    `<table style="width:100%;border-collapse:collapse">${cells}</table>` +
    `<p style="margin:18px 0 0"><a href="${esc(dashboardUrl())}" style="display:inline-block;background:#c5a46d;color:#101a30;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:6px">Open in Supabase</a></p>` +
    (footer ? `<p style="margin:16px 0 0;color:#6b6e78;font-size:13px">${esc(footer)}</p>` : '') +
    '</div></div></body></html>';
}

async function sendAlert({ subject, title, rows, replyTo, footer }) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!key || !to) {
    console.warn('alert skipped: RESEND_API_KEY or NOTIFY_EMAIL not set');
    return false;
  }
  const from = process.env.RESEND_FROM || 'JRishiCPAs Website <onboarding@resend.dev>';
  const text = rows.map(([label, value]) => `${label}: ${value || '-'}`).join('\n') +
    `\n\nOpen in Supabase: ${dashboardUrl()}` + (footer ? `\n\n${footer}` : '');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: oneLine(subject),
        html: render(title || subject, rows, footer),
        text,
        reply_to: replyTo || undefined
      }),
      signal: controller.signal
    });
    if (!response.ok) {
      let detail = {};
      try { detail = await response.json(); } catch (e) { /* empty body */ }
      console.error('alert email failed', response.status, detail.name || '', detail.message || '');
      return false;
    }
    return true;
  } catch (err) {
    console.error('alert email error', err.name);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendAlert, SITUATION_LABELS, torontoTime, oneLine };
