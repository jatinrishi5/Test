// GET /api/payment-config
// Tells the payment page whether online payments are switched on, and gives it
// the publishable key (safe to share: it can only be used to collect card details).
// Payments are on only when both STRIPE_PUBLISHABLE_KEY and STRIPE_SECRET_KEY are set.
const { cors, send } = require('./_supabase');

module.exports = (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return send(res, 405, { error: 'Method not allowed' });
  }
  const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY || '';
  const enabled = /^pk_(live|test)_/.test(publishableKey) && /^(sk|rk)_(live|test)_/.test(process.env.STRIPE_SECRET_KEY || '');
  return send(res, 200, enabled
    ? { enabled: true, publishableKey, testMode: publishableKey.startsWith('pk_test_') }
    : { enabled: false });
};
