// POST /api/create-payment
// Creates a card payment (PaymentIntent) for the amount the client entered and
// returns its client secret, which the page uses to confirm the payment in the
// embedded card form. The client's details travel with the payment as metadata so
// /api/stripe-webhook can email the confirmation once the payment succeeds.
//
// Needs STRIPE_SECRET_KEY (a restricted key with "PaymentIntents: write" is enough).
const crypto = require('crypto');
const { cors, send, clean, body, EMAIL } = require('./_supabase');

const STRIPE_VERSION = '2024-06-20';
const MIN_CENTS = 100;          // $1.00
const MAX_CENTS = 5000000;      // $50,000.00
const FAILED = 'We couldn’t start the payment just now. Please try again, or contact us.';

// "1,234.5" -> 123450 cents; anything else -> NaN
function toCents(value) {
  const s = String(value == null ? '' : value).replace(/[$,\s]/g, '');
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(s)) return NaN;
  const [dollars, cents = ''] = s.split('.');
  return Number(dollars) * 100 + Number((cents + '00').slice(0, 2));
}

async function createPaymentIntent(params) {
  const form = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') form.append(k, String(v)); });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': STRIPE_VERSION,
        'Idempotency-Key': crypto.randomUUID()
      },
      body: form.toString(),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: response.status, code: (data.error && (data.error.code || data.error.type)) || '' };
    return { ok: true, clientSecret: data.client_secret, id: data.id };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { error: 'Method not allowed' });
  }
  if (!/^(sk|rk)_(live|test)_/.test(process.env.STRIPE_SECRET_KEY || '')) {
    return send(res, 503, { error: 'Online payments aren’t available yet. Please contact us.' });
  }

  const b = body(req);
  if (clean(b.company, 200)) return send(res, 200, { ok: true }); // honeypot

  const p = {
    name: clean(b.name, 120),
    email: clean(b.email, 254),
    phone: clean(b.phone, 40),
    clientId: clean(b.clientId, 20).toUpperCase(),
    invoice: clean(b.invoice, 30).toUpperCase(),
    service: clean(b.service, 80),
    note: clean(b.note, 200).replace(/\s+/g, ' '),
    cents: toCents(b.amount)
  };

  const fields = {};
  if (p.name.length < 2) fields.name = 'Please enter your full name.';
  if (!EMAIL.test(p.email)) fields.email = 'Enter a valid email, for example name@example.com.';
  const digits = p.phone.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) fields.phone = 'Enter a valid phone number.';
  if (p.clientId && !/^[A-Z0-9][A-Z0-9-]{2,19}$/.test(p.clientId)) fields.clientId = 'Client IDs are 3–20 letters, numbers or dashes.';
  if (p.invoice && !/^[A-Z0-9][A-Z0-9-]{0,29}$/.test(p.invoice)) fields.invoice = 'Invoice numbers use letters, numbers and dashes only.';
  if (!Number.isFinite(p.cents) || p.cents < MIN_CENTS || p.cents > MAX_CENTS) fields.amount = 'Enter an amount between $1.00 and $50,000.00.';
  if (Object.keys(fields).length) return send(res, 400, { error: 'Please check the highlighted fields.', fields });

  try {
    const result = await createPaymentIntent({
      amount: p.cents,
      currency: 'cad',
      'payment_method_types[]': 'card',
      description: p.invoice ? `JRishiCPAs invoice payment ${p.invoice}` : `JRishiCPAs payment${p.service ? `: ${p.service}` : ''}`,
      'metadata[name]': p.name,
      'metadata[email]': p.email,
      'metadata[phone]': p.phone,
      'metadata[client_id]': p.clientId,
      'metadata[invoice]': p.invoice,
      'metadata[service]': p.service,
      'metadata[note]': p.note,
      'metadata[source]': 'website payment page'
    });
    if (!result.ok) {
      // Log Stripe's error code only (e.g. account not activated), never the client's details.
      console.error('create-payment failed', result.status, result.code);
      return send(res, 502, { error: FAILED });
    }
    return send(res, 200, { clientSecret: result.clientSecret });
  } catch (err) {
    console.error('create-payment error', err.name);
    return send(res, 500, { error: FAILED });
  }
};

module.exports._test = { toCents };
