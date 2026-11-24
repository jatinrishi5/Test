// Shared helpers for the form endpoints.
// Files that start with "_" inside /api are not deployed as routes by Vercel.

// Origins allowed to call the API from another site. The Vercel site itself is
// same-origin and needs no entry. The GitHub Pages copy of the site posts here too.
const ALLOWED_ORIGINS = ['https://jatinrishi5.github.io'];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}

// Trim a string field and cap its length; anything that isn't a string becomes ''.
function clean(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

// Read the JSON body whether or not the platform has already parsed it.
function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch (e) { return {}; }
  }
  return {};
}

// Insert one row through Supabase's REST API with the publishable key.
// Row Level Security only lets this key INSERT; it cannot read, change or delete.
async function insert(table, row) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase environment variables are not set');
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify(row)
  });
  if (response.ok) return { ok: true };
  let detail = {};
  try { detail = await response.json(); } catch (e) { /* empty body */ }
  return { ok: false, status: response.status, code: detail.code, message: detail.message };
}

module.exports = { cors, send, clean, body, insert, EMAIL };
