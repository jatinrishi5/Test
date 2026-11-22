// POST /api/subscribe
// Adds an email address to the newsletter list in Supabase.
const { cors, send, clean, body, insert, EMAIL } = require('./_supabase');
const { sendAlert, torontoTime } = require('./_notify');

const FAILED = 'We couldn’t subscribe you just now. Please try again later.';

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { error: 'Method not allowed' });
  }

  const b = body(req);
  if (clean(b.company, 200)) return send(res, 200, { ok: true }); // bot trap

  const email = clean(b.email, 254);
  if (!EMAIL.test(email)) return send(res, 400, { error: 'Enter a valid email, for example name@example.com.' });

  try {
    const source = clean(b.source, 300) || null;
    const result = await insert('newsletter_subscribers', { email, source });
    // 23505 = this email is already on the list. Treat it as success, without a new alert.
    if (result.code === '23505') return send(res, 200, { ok: true });
    if (result.ok) {
      await sendAlert({
        subject: `New newsletter subscriber: ${email}`,
        title: 'New newsletter subscriber',
        rows: [['Email', email], ['Subscribed', `${torontoTime()} from ${source || 'the website'}`]]
      });
      return send(res, 201, { ok: true });
    }
    console.error('subscribe insert failed', result.status, result.code, result.message);
    return send(res, 502, { error: FAILED });
  } catch (err) {
    console.error('subscribe handler error', err.message);
    return send(res, 500, { error: FAILED });
  }
};
