// POST /api/stripe-webhook
// Stripe calls this when a payment made on the website's payment page succeeds
// (event payment_intent.succeeded). It emails the client a "Payment received"
// confirmation and alerts the firm.
//
// Needs STRIPE_WEBHOOK_SECRET (the endpoint's signing secret, "whsec_…").
// Without it the endpoint refuses every request, so nothing happens by accident.
const crypto = require('crypto');
const { sendAlert, sendPaymentConfirmation, formatMoney, oneLine } = require('./_notify');

// Read the body exactly as Stripe sent it: the signature covers the raw bytes.
function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(typeof c === 'string' ? Buffer.from(c) : c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Stripe-Signature: t=<timestamp>,v1=<hex hmac>[,v1=…]
function verifySignature(raw, header, secret, toleranceSeconds) {
  if (!header || !secret) return false;
  const pairs = String(header).split(',').map((p) => p.split('='));
  const t = (pairs.find(([k]) => k === 't') || [])[1];
  const signatures = pairs.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !signatures.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', secret)
    .update(Buffer.concat([Buffer.from(t + '.'), raw]))
    .digest('hex');
  return signatures.some((s) => s.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

function torontoDate(unixSeconds) {
  return new Date((unixSeconds || Date.now() / 1000) * 1000)
    .toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';
}

// Values set by /api/create-payment; re-checked here because metadata is free text.
function fromMetadata(m) {
  const md = m || {};
  const pick = (v, re, max) => (typeof v === 'string' && re.test(v) ? v.slice(0, max) : '');
  return {
    name: typeof md.name === 'string' ? md.name.slice(0, 120) : '',
    email: pick(md.email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 254),
    phone: typeof md.phone === 'string' ? md.phone.slice(0, 40) : '',
    clientId: pick(md.client_id, /^[A-Z0-9][A-Z0-9-]{2,19}$/, 20),
    invoice: pick(md.invoice, /^[A-Z0-9][A-Z0-9-]{0,29}$/, 30),
    service: typeof md.service === 'string' ? md.service.slice(0, 80) : ''
  };
}

async function handleSucceeded(pi, livemode) {
  const m = fromMetadata(pi.metadata);
  const amount = pi.amount_received || pi.amount;
  const payment = {
    name: m.name,
    email: m.email,
    amount,
    currency: pi.currency,
    paidAt: torontoDate(pi.created),
    clientId: m.clientId,
    invoice: m.invoice,
    reference: pi.id
  };
  const stripeUrl = `https://dashboard.stripe.com/${livemode ? '' : 'test/'}payments/${pi.id}`;

  await Promise.all([
    sendPaymentConfirmation(payment),
    sendAlert({
      subject: `Payment received: ${formatMoney(amount, pi.currency)} from ${oneLine(m.name || m.email || 'a client', 80)}`,
      title: livemode ? 'Online payment received' : 'Test payment received (not real money)',
      replyTo: m.email || undefined,
      rows: [
        ['Amount', formatMoney(amount, pi.currency)],
        ['Client ID', m.clientId],
        ['Invoice', m.invoice],
        ['Payment for', m.service],
        ['Name', m.name],
        ['Email', m.email],
        ['Phone', m.phone],
        ['Paid', payment.paidAt],
        ['Reference', pi.id]
      ],
      link: { href: stripeUrl, label: 'Open in Stripe' },
      footer: m.email ? 'The client has been emailed a payment confirmation.' : 'No client email on file, so no confirmation was sent.'
    })
  ]);
}

async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('stripe webhook: STRIPE_WEBHOOK_SECRET not set');
    return res.status(503).json({ error: 'Not configured' });
  }

  let raw;
  try { raw = await readRaw(req); } catch (e) { return res.status(400).json({ error: 'Bad request' }); }
  if (!verifySignature(raw, req.headers['stripe-signature'], secret, 300)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch (e) { return res.status(400).json({ error: 'Bad JSON' }); }

  try {
    const obj = event.data && event.data.object;
    // Only payments created by this website's payment page (they carry our metadata).
    if (event.type === 'payment_intent.succeeded' && obj && obj.object === 'payment_intent' &&
        obj.metadata && obj.metadata.source === 'website payment page') {
      await handleSucceeded(obj, event.livemode);
    }
  } catch (err) {
    // Log the error type only, never the payer's details.
    console.error('stripe webhook handler error', err.message);
  }
  // Always 200 once the signature checks out, so Stripe doesn't resend (and the
  // client doesn't get duplicate emails) because of a slow or failed email.
  return res.status(200).json({ received: true });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
module.exports._test = { verifySignature, fromMetadata };
