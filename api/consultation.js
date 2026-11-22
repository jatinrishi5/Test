// POST /api/consultation
// Saves a free-consultation request from the booking form to Supabase.
const { cors, send, clean, body, insert, EMAIL } = require('./_supabase');
const { sendAlert, sendClientConfirmation, SITUATION_LABELS, TYPE_LABELS, torontoTime, oneLine } = require('./_notify');

const CLIENT_TYPES = ['personal', 'business', 'both'];
const FAILED = 'We couldn’t save your request just now. Please email us instead.';

module.exports = async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return send(res, 405, { error: 'Method not allowed' });
  }

  const b = body(req);

  // Hidden "company" field: people never see it, bots fill it in. Pretend it worked.
  if (clean(b.company, 200)) return send(res, 200, { ok: true });

  const row = {
    client_type: clean(b.clientType, 20),
    situations: Array.isArray(b.situations)
      ? b.situations.filter((s) => typeof s === 'string').map((s) => s.slice(0, 40)).slice(0, 20)
      : [],
    services: clean(b.services, 500) || null,
    name: clean(b.name, 120),
    email: clean(b.email, 254),
    phone: clean(b.phone, 40) || null,
    province: clean(b.province, 60) || null,
    message: clean(b.message, 4000) || null,
    source: clean(b.source, 300) || null
  };

  const fields = {};
  if (!CLIENT_TYPES.includes(row.client_type)) fields.clientType = 'Please choose who this is for.';
  if (row.name.length < 2) fields.name = 'Please enter your name.';
  if (!EMAIL.test(row.email)) fields.email = 'Enter a valid email, for example name@example.com.';
  if (Object.keys(fields).length) return send(res, 400, { error: 'Please check the highlighted fields.', fields });

  try {
    const result = await insert('consultation_requests', row);
    if (!result.ok) {
      // Log the database error only, never the visitor's details.
      console.error('consultation insert failed', result.status, result.code, result.message);
      return send(res, 502, { error: FAILED });
    }

    // Saved. Now alert the firm and confirm to the client, in parallel
    // (best effort, each capped at a few seconds).
    await Promise.all([sendClientConfirmation(row), sendAlert({
      subject: `New consultation request from ${oneLine(row.name, 80)}`,
      title: 'New free-consultation request',
      replyTo: row.email,
      rows: [
        ['Name', row.name],
        ['Email', row.email],
        ['Phone', row.phone],
        ['Province', row.province],
        ['Who it’s for', TYPE_LABELS[row.client_type]],
        ['Services', row.services],
        ['Situation', row.situations.map((s) => SITUATION_LABELS[s] || s).join('\n')],
        ['Message', row.message],
        ['Submitted', `${torontoTime()} from ${row.source || 'the website'}`]
      ],
      footer: `Reply to this email to answer ${oneLine(row.name, 80)} directly.`
    })]);
    return send(res, 201, { ok: true });
  } catch (err) {
    console.error('consultation handler error', err.message);
    return send(res, 500, { error: FAILED });
  }
};
