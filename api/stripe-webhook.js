// POST /api/stripe-webhook
// Stripe calls this after someone pays through the website's Stripe Payment Link.
// It emails the client a "Payment received" confirmation and alerts the firm.
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

// The payment page sends client_reference_id = CLIENTID__INVOICE__PHONEDIGITS.
function parseReference(ref) {
  const [clientId = '', invoice = '', phone = ''] = String(ref || '').split('__');
  const safe = (v, max) => (/^[A-Za-z0-9-]+$/.test(v) ? v.slice(0, max) : '');
  return {
    clientId: clientId === 'NOID' ? '' : safe(clientId, 20),
    invoice: invoice === 'NOINV' ? '' : safe(invoice, 30),
    phone: /^\d{7,15}$/.test(phone) ? phone : ''
  };
}

function torontoDate(unixSeconds) {
  return new Date((unixSeconds || Date.now() / 1000) * 1000)
    .toLocaleString('en-CA', { timeZone: 'America/Toronto', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';
}

async function handlePaid(session, livemode) {
  const details = session.customer_details || {};
  const ref = parseReference(session.client_reference_id);
  const payment = {
    name: details.name || '',
    email: details.email || session.customer_email || '',
    amount: session.amount_total,
    currency: session.currency,
    paidAt: torontoDate(session.created),
    clientId: ref.clientId,
    invoice: ref.invoice,
    reference: typeof session.payment_intent === 'string' ? session.payment_intent : session.id
  };
  const stripeUrl = typeof session.payment_intent === 'string'
    ? `https://dashboard.stripe.com/${livemode ? '' : 'test/'}payments/${session.payment_intent}`
    : `https://dashboard.stripe.com/${livemode ? '' : 'test/'}payments`;

  await Promise.all([
    sendPaymentConfirmation(payment),
    sendAlert({
      subject: `Payment received: ${formatMoney(payment.amount, payment.currency)} from ${oneLine(payment.name || payment.email, 80)}`,
      title: livemode ? 'Online payment received' : 'Test payment received (not real money)',
      replyTo: payment.email || undefined,
      rows: [
        ['Amount', formatMoney(payment.amount, payment.currency)],
        ['Client ID', ref.clientId],
        ['Invoice', ref.invoice],
        ['Name', payment.name],
        ['Email', payment.email],
        ['Phone', details.phone || ref.phone],
        ['Paid', payment.paidAt],
        ['Stripe reference', payment.reference]
      ],
      link: { href: stripeUrl, label: 'Open in Stripe' },
      footer: 'The client has been emailed a payment confirmation.'
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
    const session = event.data && event.data.object;
    if (event.type === 'checkout.session.completed' && session && session.payment_status === 'paid') {
      await handlePaid(session, event.livemode);
    } else if (event.type === 'checkout.session.async_payment_succeeded' && session) {
      await handlePaid(session, event.livemode);
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
module.exports._test = { verifySignature, parseReference };
