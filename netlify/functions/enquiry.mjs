/**
 * Serverless enquiry handler — Netlify Functions (v2, ESM).
 *
 * A faithful port of the Vercel Python handler (`enquiry.py`). Netlify's
 * function runtime is JavaScript/TypeScript or Go — it does **not** run Python —
 * so moving the sites to Netlify forced this rewrite. Behaviour is deliberately
 * identical, with one addition: the lead is also written to Supabase, which is
 * now the system of record.
 *
 * Served at POST /api/enquiry: the function claims that path itself (see the `config` export
 * at the bottom), so netlify.toml must NOT add a redirect for it — a forced
 * redirect to /.netlify/functions/enquiry turns every enquiry into a 404.
 * Copied from the Finland site (the reference implementation); the only
 * difference is the fallback country below, "Ireland".
 *
 *   * No key of any kind is present in the frontend. RESEND_API_KEY and
 *     SUPABASE_SERVICE_ROLE_KEY live only in the Netlify environment, are never
 *     echoed in a response, and never reach a log line.
 *   * The recipient cannot be tampered with by editing the page, because it is a
 *     hard-coded constant here (MAIL_TO) — not a form field and not an env var.
 *
 * Zero npm dependencies: Node 18+ global fetch only, so there is no package.json
 * to keep in step and Netlify needs no build step to deploy it.
 *
 * Environment variables (set in Netlify → Site settings → Environment variables):
 *
 *   RESEND_API_KEY              required  Resend key, starts `re_`. Server-side only.
 *   SUPABASE_URL                optional  https://<ref>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   optional  service_role key. Server-side ONLY —
 *                                         it bypasses RLS. Never ship to a browser.
 *   MAIL_FROM                   optional  From address; its domain must be
 *                                         verified in Resend or the send is rejected.
 *   SITE_COUNTRY                optional  e.g. "France"; labels the subject line.
 *   APPS_SCRIPT_URL             optional  Google Apps Script web-app URL (…/exec). When set,
 *                                         every lead is added to the "<Country> Leads" tab of
 *                                         the Website Leads sheet and emailed by the script.
 *   APPS_SCRIPT_TOKEN           optional  shared secret the script checks (LEADS_TOKEN there).
 *
 * With Apps Script configured, Resend only sends when the script cannot be
 * reached, so the inbox gets one email per lead, not two.
 *
 * If the Supabase vars are absent the handler still works exactly as before —
 * email only. That keeps a country site deployable before Supabase exists.
 */

// --------------------------------------------------------------- recipient
// Hard-coded on purpose. The brief requires exactly this address, and keeping it
// out of both the form and the environment means a tampered page or a mistyped
// env var cannot redirect enquiries somewhere else.
const MAIL_TO = 'business@tuteeconnect.com';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Tutee Connect Website <enquiries@tuteeconnect.com>';

const MAX_BODY_BYTES = 16 * 1024;
const SEND_TIMEOUT_MS = 20000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// The thirteen destination pages. Used only to label the subject line, and
// matched against a fixed list so that a tampered `destination` cannot put
// arbitrary text into a mail header. A country missing from here is not a
// security problem but it IS a routing one: its enquiries fall through to the
// unlabelled subject and nobody can tell which page they came from. Add the new
// country here in the same commit as the page.
const KNOWN_COUNTRIES = ['Australia', 'Canada', 'Finland', 'France', 'Germany',
  'Ireland', 'Malaysia', 'Mauritius', 'New Zealand',
  'Poland', 'Singapore', 'UAE', 'UK'];

const COUNTRY_ALIASES = {
  uk: 'UK', unitedkingdom: 'UK', britain: 'UK', gb: 'UK',
  canada: 'Canada', ca: 'Canada',
  germany: 'Germany', de: 'Germany', deutschland: 'Germany',
  ireland: 'Ireland', ie: 'Ireland',
  newzealand: 'New Zealand', nz: 'New Zealand',
  australia: 'Australia', au: 'Australia', aus: 'Australia',
  france: 'France', fr: 'France',
  finland: 'Finland', fi: 'Finland', fin: 'Finland', suomi: 'Finland',
  poland: 'Poland', pl: 'Poland', pol: 'Poland', polska: 'Poland',
  singapore: 'Singapore', sg: 'Singapore', sgp: 'Singapore',
  malaysia: 'Malaysia', my: 'Malaysia', mys: 'Malaysia',
  mauritius: 'Mauritius', mu: 'Mauritius', mus: 'Mauritius',
  maurice: 'Mauritius', ilemaurice: 'Mauritius',
  // the UAE page is marketed as Dubai, so SITE_COUNTRY may well be set to that
  // rather than to the country
  uae: 'UAE', ae: 'UAE', are: 'UAE', dubai: 'UAE',
  unitedarabemirates: 'UAE', emirates: 'UAE',
};

const FIELD_LIMITS = {
  name: 120, email: 200, phone: 40, destination: 600, subject: 200, from_name: 120,
  state: 80, course: 120, call_time: 80, shortlist: 1500, study_level: 40, intake: 60,
  form_location: 80, cta_source: 60,
};

// Fields this handler consumes by name. Anything else the form grows later is
// still forwarded, under its own row — the brief asks for *all* submitted
// information, and a field added to the markup should not silently vanish just
// because this file has not been updated to know about it.
const KNOWN_FIELDS = new Set(['name', 'email', 'phone', 'phone_number',
  'country_code', 'destination', 'from_name', 'page', 'botcheck',
  'access_key', 'subject', 'state', 'course', 'call_time', 'shortlist',
  'study_level', 'intake', 'form_location', 'utm_source', 'utm_medium',
  'utm_campaign', 'utm_content', 'gclid', 'cta_source',
  // no longer asked on the form (they have no column in the sheet); still listed so a
  // page cached from before the change cannot push them into the email as extra rows
  'qualification', 'english_test']);
const MAX_EXTRA_FIELDS = 12;

/** Collapse whitespace and strip CR/LF.
 *
 * Stripping CR/LF is the important part: `name` and the country reach the
 * Subject and `email` reaches Reply-To, so a newline in any of them would let a
 * submitter inject extra headers. */
function clean(value, limit) {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/[\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  return text.slice(0, limit);
}

function slug(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Which landing page this enquiry came from, for the subject line.
 *
 * Order: the SITE_COUNTRY env var (trustworthy, set per Netlify site), then the
 * submitted destination, then the request host. Every source is matched against
 * KNOWN_COUNTRIES rather than used verbatim, so the value that reaches a mail
 * header is always one of thirteen fixed strings. */
export function resolveCountry(destination, host) {
  const env = slug(process.env.SITE_COUNTRY);
  if (COUNTRY_ALIASES[env]) return COUNTRY_ALIASES[env];

  const dest = slug(destination);
  for (const country of KNOWN_COUNTRIES) {
    if (dest.includes(slug(country))) return country;
  }
  const hostSlug = slug(host);
  for (const country of KNOWN_COUNTRIES) {
    if (hostSlug.includes(slug(country))) return country;
  }
  return '';
}

/** Accept JSON or urlencoded, and either a combined `phone` or the
 * `country_code` + `phone_number` pair the markup actually submits. */
export function parsePayload(raw) {
  let data = {};
  const text = String(raw ?? '').trim();

  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
    } catch { data = {}; }
  }
  if (!Object.keys(data).length && text) {
    for (const [k, v] of new URLSearchParams(text)) {
      if (!(k in data)) data[k] = v;
    }
  }

  let phone = data.phone;
  if (!phone) phone = `${data.country_code ?? ''} ${data.phone_number ?? ''}`;

  const extras = [];
  for (const key of Object.keys(data).sort()) {
    if (KNOWN_FIELDS.has(key)) continue;
    const value = clean(data[key], 300);
    if (value && extras.length < MAX_EXTRA_FIELDS) extras.push([clean(key, 60), value]);
  }

  return {
    name: clean(data.name, FIELD_LIMITS.name),
    email: clean(data.email, FIELD_LIMITS.email),
    phone: clean(phone, FIELD_LIMITS.phone),
    destination: clean(data.destination, FIELD_LIMITS.destination) || 'General Inquiry',
    from_name: clean(data.from_name, FIELD_LIMITS.from_name) || 'Tutee Connect Website',
    page: clean(data.page, 200),
    state: clean(data.state, FIELD_LIMITS.state),
    course: clean(data.course, FIELD_LIMITS.course),
    call_time: clean(data.call_time, FIELD_LIMITS.call_time),
    shortlist: clean(data.shortlist, FIELD_LIMITS.shortlist),
    study_level: clean(data.study_level, FIELD_LIMITS.study_level),
    intake: clean(data.intake, FIELD_LIMITS.intake),
    form_location: clean(data.form_location, FIELD_LIMITS.form_location),
    cta_source: clean(data.cta_source, FIELD_LIMITS.cta_source),
    utm: ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content']
      .map((k) => clean(data[k], 100)).filter(Boolean),
    // Google Ads click id, so a qualified lead can later be uploaded as an offline conversion
    gclid: clean(data.gclid, 200),
    extras,
    botcheck: data.botcheck,
  };
}

/** "Master's – Data Science (Next intake)": level, course and start, all in the
 * sheet's single Course column (the sheet itself is unchanged). */
export function courseLine(f) {
  const level = /^not sure/i.test(f.study_level) ? 'Level not decided' : f.study_level;
  const main = [level, f.course].filter(Boolean).join(' – ');
  return main + (f.intake ? `${main ? ' ' : ''}(${f.intake})` : '');
}

/** Where the lead came from: page, then form, then any campaign tags, the
 * button that opened the form (when it was not a direct visit) and the lead's
 * short reference, which the browser also receives as `lead_id`. */
export function leadSource(f, country, leadRef = '') {
  const page = country ? `${country} Landing Page` : 'Tutee Connect Website';
  const where = f.form_location || f.from_name;
  return [page, where].filter(Boolean).join(' – ')
    + (f.utm.length ? ` (${f.utm.join(' / ')})` : '')
    + (f.cta_source && f.cta_source !== 'direct' ? ` · via ${f.cta_source}` : '')
    + (f.gclid ? ` · gclid ${f.gclid}` : '')
    + (leadRef ? ` · ref ${leadRef}` : '');
}

/** Mirror of the client-side rules. The browser check is for UX; this one is the
 * check that actually counts, because a client can always be bypassed. */
export function validate(f) {
  if (f.botcheck) return 'Rejected.';                 // honeypot
  if (f.name.length < 2) return 'Please enter your full name.';
  if (!EMAIL_RE.test(f.email)) return 'Please enter a valid email address.';
  const digits = f.phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return 'Please enter a valid phone number (7-15 digits).';
  }
  // The forms' own rules for the two main markets, so a number the page would
  // refuse (for example "+91 12345") is not accepted when posted directly.
  const national = (cc) => digits.slice(cc.length).replace(/^0/, '');
  const intl = f.phone.trim();
  if (intl.startsWith('+91') && !/^[2-9]\d{9}$/.test(national('91'))) {
    return 'Indian numbers have 10 digits after +91.';
  }
  if (intl.startsWith('+971') && !/^\d{8,9}$/.test(national('971'))) {
    return 'UAE numbers have 8 or 9 digits after +971.';
  }
  return null;
}

function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** The Resend request body. Returns a plain object, ready to be JSON-encoded. */
export function buildEmail(f, country, leadRef = '') {
  const subject = country
    ? `New Enquiry – ${country} Landing Page`
    : 'New Enquiry – Tutee Connect Landing Page';

  const rows = [
    ['Full Name', f.name],
    ['Phone Number', f.phone],
    ['Email Address', f.email],
    ['Enquiry Type / Country', f.destination],
  ];
  if (f.state) rows.push(['State', f.state]);
  if (f.shortlist) rows.push(['Shortlisted Universities', f.shortlist]);
  if (courseLine(f)) rows.push(['Course', courseLine(f)]);
  rows.push(['Lead Source', leadSource(f, country, leadRef)]);
  if (f.cta_source) rows.push(['CTA Source', f.cta_source]);
  if (leadRef) rows.push(['Lead Ref', leadRef]);
  if (f.call_time) rows.push(['Preferred Call Time', f.call_time]);
  if (country) rows.push(['Landing Page', country]);
  if (f.page) rows.push(['Submitted From', country ? `${country} Landing Page` : f.page]);
  rows.push(...f.extras);
  rows.push(['Source', f.from_name]);

  const who = f.name || 'the enquirer';
  const plain = ['New enquiry from the Tutee Connect website', '']
    .concat(rows.map(([label, value]) => `${(label + ':').padEnd(25)} ${value}`))
    .concat(['', `Reply to this email to answer ${who} directly.`]);

  const cells = rows.map(([label, value]) =>
    '<tr>'
    + '<td style="padding:8px 14px;border:1px solid #e5e7eb;background:#f9fafb;'
    + `font-weight:600;white-space:nowrap">${esc(label)}</td>`
    + `<td style="padding:8px 14px;border:1px solid #e5e7eb">${esc(value)}</td>`
    + '</tr>').join('');

  const html = '<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;color:#111827">'
    + '<h2 style="margin:0 0 14px;font-size:18px">New enquiry from the Tutee '
    + 'Connect website</h2>'
    + `<table style="border-collapse:collapse;font-size:14px">${cells}</table>`
    + '<p style="margin:16px 0 0;font-size:12px;color:#6b7280">Reply to this '
    + `email to answer ${esc(who)} directly.</p>`
    + '</div>';

  const payload = {
    from: (process.env.MAIL_FROM || DEFAULT_FROM).trim(),
    to: [MAIL_TO],
    subject,
    text: plain.join('\n'),
    html,
  };
  if (EMAIL_RE.test(f.email)) payload.reply_to = f.email;   // reply goes to the student
  return payload;
}

async function postJson(url, headers, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** POST the message to Resend, returning the message id.
 *
 * The key is read here and nowhere else, and never appears in an error message,
 * a log line or a response body. */
async function sendViaResend(payload) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  if (!key) throw new Error('server email is not configured (missing RESEND_API_KEY)');

  const res = await postJson(RESEND_ENDPOINT, { Authorization: `Bearer ${key}` },
    payload, SEND_TIMEOUT_MS);

  if (!res.ok) {
    // Resend explains refusals in the body — an unverified From domain, a
    // revoked key, a rate limit. That detail belongs in the function log,
    // never in the browser response.
    let detail = '';
    // the error code only: provider messages can quote the submitted values
    try { const j = await res.json(); detail = String(j.code || j.name || '').replace(/[^\w.-]/g, '').slice(0, 40); } catch { /* not JSON */ }
    throw new Error(`resend rejected the send: HTTP ${res.status} ${detail}`);
  }
  try {
    const parsed = await res.json();
    return parsed?.id || '';
  } catch { return ''; }
}

/** Write the lead to Postgres. Supabase is the system of record, so this runs
 * before the email: if the send later fails, the enquiry still exists and the
 * dashboard shows it. Returns the row id, or null when Supabase is unconfigured. */
async function storeInSupabase(f, country, leadRef) {
  const url = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;                  // not configured yet — email only

  const row = {
    country: country || null,
    name: f.name,
    email: f.email,
    phone: f.phone,
    destination: f.destination,
    source: f.from_name,
    page: f.page || null,
    // the CTA source and the lead reference have no columns of their own
    extras: Object.fromEntries(f.extras.concat([
      ['cta_source', f.cta_source], ['lead_ref', leadRef],
    ].filter(([, v]) => v))),
  };

  const res = await postJson(`${url}/rest/v1/leads`,
    { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'return=representation' },
    row, SEND_TIMEOUT_MS);

  if (!res.ok) {
    let detail = '';
    // the error code only: provider messages can quote the submitted values
    try { const j = await res.json(); detail = String(j.code || j.name || '').replace(/[^\w.-]/g, '').slice(0, 40); } catch { /* not JSON */ }
    throw new Error(`supabase rejected the insert: HTTP ${res.status} ${detail}`);
  }
  try {
    const parsed = await res.json();
    return Array.isArray(parsed) ? (parsed[0]?.id ?? null) : (parsed?.id ?? null);
  } catch { return null; }
}

/** Hand the lead to the Apps Script web app, which adds the sheet row and
 * sends the formatted email. Returns { saved, mailed }, or null when the
 * script is not configured. Apps Script answers a POST with a redirect to
 * its output; fetch follows it, so the JSON below is the script's reply. */
async function sendToAppsScript(f, country, leadRef) {
  const url = (process.env.APPS_SCRIPT_URL || '').trim();
  const token = (process.env.APPS_SCRIPT_TOKEN || '').trim();
  if (!url || !token) return null;

  const res = await postJson(url, {}, {
    token,
    country: country || 'Ireland',
    name: f.name,
    phone: f.phone,
    email: f.email,
    state: f.state,
    shortlist: f.shortlist,
    course: courseLine(f),
    lead_source: leadSource(f, country, leadRef),
    call_time: f.call_time,
    destination: f.destination,
    page: country ? `${country} Landing Page` : f.page,
  }, SEND_TIMEOUT_MS);

  let parsed = null;
  try { parsed = await res.json(); } catch { /* not JSON: treated as a failure */ }
  if (!res.ok || !parsed?.success) {
    throw new Error(`apps script refused the lead: HTTP ${res.status} ${parsed?.message || ''}`);
  }
  if (parsed.mailed === false) console.error(`enquiry: apps script saved the lead but could not email it: ${redact(parsed.mail_error || 'no detail')}`);
  return { saved: true, mailed: parsed.mailed !== false };
}

const OK_MESSAGE = 'Profile submitted successfully! We will contact you soon.';

/** Core logic, shared by the Netlify handler and the local dev server.
 * Returns { status, payload }. */
export async function handle(rawBody, headers = {}) {
  const fields = parsePayload(rawBody);

  const problem = validate(fields);
  if (problem) return { status: 400, payload: { success: false, message: problem } };

  const host = headers['x-forwarded-host'] || headers['host'] || '';
  const country = resolveCountry(fields.destination, host);
  // Short reference for this lead: in the sheet's Lead Source, the email and the
  // browser's analytics event, so the three can be matched up.
  const leadRef = crypto.randomUUID().slice(0, 8);

  // 1. system of record first, so a lead survives an email outage
  let leadId = null;
  let stored = false;
  try {
    leadId = await storeInSupabase(fields, country, leadRef);
    stored = leadId !== null;
  } catch (exc) {
    console.error(`enquiry: supabase insert failed: ${exc.message}`);
  }

  // 2. the Website Leads sheet, plus its email to the business inbox
  let sheet = null;
  try {
    sheet = await sendToAppsScript(fields, country, leadRef);
    if (sheet) stored = true;
  } catch (exc) {
    console.error(`enquiry: apps script failed: ${exc.message}`);
  }

  // 3. notify the business inbox, unless the sheet script already did
  let messageId = '';
  let emailed = Boolean(sheet && sheet.mailed);
  if (!emailed) {
    try {
      messageId = await sendViaResend(buildEmail(fields, country, leadRef));
      emailed = true;
    } catch (exc) {
      console.error(`enquiry: send refused: ${exc.message}`);
    }
  }

  if (!stored && !emailed) {
    // nothing captured the enquiry anywhere — this is the only real failure
    return {
      status: 502,
      payload: {
        success: false,
        message: 'We could not send your enquiry right now. Please try again, '
          + 'or email info@tuteeconnect.com.',
      },
    };
  }

  if (!emailed) {
    // The lead is safe in Postgres, so telling the student it failed would only
    // produce a duplicate submission. Succeed for them, shout in the log.
    console.error('enquiry: STORED BUT NOT EMAILED — check RESEND_API_KEY and the '
      + `verified From domain (lead=${leadId})`);
  }

  console.log(`enquiry: country=${country || '-'} destination=${fields.destination} `
    + `ref=${leadRef} stored=${stored ? (leadId ?? 'sheet') : 'no'} sheet=${sheet ? 'yes' : 'no'} `
    + `emailed=${emailed ? (messageId || 'yes') : 'no'}`);

  return { status: 200, payload: { success: true, message: OK_MESSAGE, lead_id: leadRef } };
}

/** Configuration summary (recipient, which channels are set up). Kept for local
 * diagnostics only: the public GET probe no longer returns it, so the recipient
 * address and the delivery setup are not exposed to anyone who asks. */
export function health() {
  return {
    success: true,
    endpoint: 'enquiry',
    recipient: MAIL_TO,
    provider: 'resend',
    runtime: 'netlify-functions',
    resend_configured: Boolean((process.env.RESEND_API_KEY || '').trim()),
    supabase_configured: Boolean((process.env.SUPABASE_URL || '').trim()
      && (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()),
    sheet_configured: Boolean((process.env.APPS_SCRIPT_URL || '').trim()
      && (process.env.APPS_SCRIPT_TOKEN || '').trim()),
    from: (process.env.MAIL_FROM || DEFAULT_FROM).trim(),
    country: resolveCountry('') || '(inferred per request)',
  };
}

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

/* ---------------------------------------------------------------------------
 * Phase 6 hardening (12 Nov 2026). The same block is in all six sites.
 *
 * - Content types: only JSON (what the page's script sends) and a plain HTML
 *   form post (urlencoded, sent when the script did not run) are accepted.
 *   Anything else gets 415. This also stops cross-site text/plain posts.
 * - Origin: a browser request from another site (Sec-Fetch-Site: cross-site,
 *   Origin: null, or an Origin whose host is not this site's) gets 403.
 *   Requests with no Origin header (not a browser) go on to the other checks.
 * - Rate limit: best effort only. Counted in memory, per function instance:
 *   30 posts per 10 minutes per client IP (stored hashed). The limit is high
 *   on purpose, so a shared university or office network is not blocked.
 *   Instances do not share memory and are recycled, so this is not a reliable
 *   limit; a platform-level limit needs the site owner's Netlify settings.
 * - Duplicates: an identical submission (same fields) within 10 minutes of a
 *   successful one gets the first reply and reference, and is not sent again.
 *   Also per instance only.
 * - A form posted without the page's script gets a short HTML page (no
 *   submitted value is echoed) instead of JSON, so the visitor sees the result.
 * ------------------------------------------------------------------------- */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const DUP_WINDOW_MS = 10 * 60 * 1000;
const MEMO_MAX = 2000;
const recentPosts = new Map();      // hashed client IP -> times of its recent posts
const recentLeads = new Map();      // hash of the submitted fields -> { at, result }
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function capSize(map) {
  // a Map keeps insertion order, so the oldest entries go first
  while (map.size > MEMO_MAX) map.delete(map.keys().next().value);
}

/** Log text without addresses or long numbers: provider errors can quote what was submitted. */
function redact(text) {
  return String(text ?? '')
    .replace(/[^\s@<>"']+@[^\s@<>"']+/g, '<email>')
    .replace(/\+?\d[\d\s().-]{5,}\d/g, '<number>')
    .slice(0, 200);
}

function mediaType(req) {
  return (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
}

/** A plain HTML form post (the page's script did not run): answer with a page. */
export function wantsPage(req) {
  return mediaType(req) === 'application/x-www-form-urlencoded'
    && !(req.headers.get('accept') || '').toLowerCase().includes('application/json');
}

/** False when a browser says the post comes from another site. */
export function sameOrigin(req) {
  if ((req.headers.get('sec-fetch-site') || '').toLowerCase() === 'cross-site') return false;
  const origin = req.headers.get('origin');
  if (!origin) return true;
  let from;
  try { from = new URL(origin).host.toLowerCase(); } catch { return false; }   // "null" lands here
  const own = [req.headers.get('x-forwarded-host'), req.headers.get('host')];
  try { own.push(new URL(req.url).host); } catch { /* no URL */ }
  const hosts = own.filter(Boolean).map((h) => h.split(',')[0].trim().toLowerCase());
  if (hosts.includes(from)) return true;
  // local development only: a localhost page may post to a localhost server on another port
  return LOCAL_HOST.test(from) && hosts.some((h) => LOCAL_HOST.test(h));
}

function clientIp(req) {
  return (req.headers.get('x-nf-client-connection-ip')
    || (req.headers.get('x-forwarded-for') || '').split(',')[0] || '').trim();
}

async function overLimit(req) {
  const ip = clientIp(req);
  if (!ip) return false;
  const key = await sha256(`ip:${ip}`);
  const now = Date.now();
  const times = (recentPosts.get(key) || []).filter((t) => now - t < RATE_WINDOW_MS);
  times.push(now);
  recentPosts.delete(key);
  recentPosts.set(key, times);
  capSize(recentPosts);
  return times.length > RATE_LIMIT;
}

/** Checks made before the body is read. Returns { status, payload } to refuse, or null. */
export async function guard(req) {
  const type = mediaType(req);
  if (type !== 'application/json' && type !== 'application/x-www-form-urlencoded') {
    console.warn(`enquiry: refused content type ${type.replace(/[^\w/+.-]/g, '').slice(0, 40) || '(none)'}`);
    return { status: 415, payload: { success: false, message: 'Unsupported submission format.' } };
  }
  if (!sameOrigin(req)) {
    console.warn('enquiry: refused a post from another site');
    return { status: 403, payload: { success: false, message: 'This form can only be sent from this website.' } };
  }
  if (await overLimit(req)) {
    console.warn('enquiry: rate limit reached on this instance');
    return {
      status: 429,
      payload: {
        success: false,
        message: 'Too many submissions from this network. Please wait a few minutes and try again, '
          + 'or WhatsApp us on +91 73583 64959.',
      },
    };
  }
  return null;
}

async function leadKey(raw) {
  let f;
  try { f = parsePayload(raw); } catch { return null; }
  if (validate(f)) return null;
  return sha256(`lead:${JSON.stringify(f)}`);
}

/** handle(), but an identical submission shortly after a successful one is not sent twice. */
export async function handleOnce(raw, headers) {
  const key = await leadKey(raw);
  const prior = key && recentLeads.get(key);
  if (prior && Date.now() - prior.at < DUP_WINDOW_MS) {
    const earlier = await prior.result;
    if (earlier.status === 200) {
      console.log(`enquiry: duplicate of ref=${earlier.payload.lead_id || '-'}, not sent again`);
      return earlier;
    }
  }
  const task = handle(raw, headers);
  if (key) {
    recentLeads.set(key, { at: Date.now(), result: task.catch(() => ({ status: 500 })) });
    capSize(recentLeads);
  }
  const result = await task;                  // a throw here is answered with 500 by the caller
  if (key && result.status !== 200) recentLeads.delete(key);
  return result;
}

/** The reply to a no-JavaScript form post. Only fixed messages are shown, never a submitted value. */
function page(status, payload) {
  const ok = status === 200 && Boolean(payload && payload.success);
  const title = ok ? 'Enquiry sent' : 'Enquiry not sent';
  const text = (payload && payload.message) || 'Please try again.';
  const next = ok
    ? '<a href="/">Back to the page</a>'
    : 'Use your browser’s Back button to return to the form, or <a href="https://wa.me/917358364959">WhatsApp us</a>.';
  const html = '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">'
    + `<title>${title} | Tutee Connect</title>`
    + '<style>body{font:17px/1.6 system-ui,sans-serif;max-width:36rem;margin:12vh auto;padding:0 20px;'
    + 'color:#1a1a1a;background:#fff}h1{font-size:1.6rem;line-height:1.2}a{color:#0b57d0}</style></head>'
    + `<body><main><h1>${title}</h1><p>${esc(text)}</p><p>${next}</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}

/** Netlify Functions v2 entry point. */
export default async function (req) {
  // Public probe: proves the endpoint is up and nothing more.
  if (req.method === 'GET') return json(200, { success: true, endpoint: 'enquiry' });

  if (req.method !== 'POST') {
    return json(405, { success: false, message: 'Method not allowed.' });
  }

  // a form posted without the page's script is answered with a page, not JSON
  const asPage = wantsPage(req);
  const reply = (status, payload) => (asPage ? page(status, payload) : json(status, payload));
  const refused = await guard(req);
  if (refused) return reply(refused.status, refused.payload);

  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) {
    return reply(413, { success: false, message: 'Submission too large.' });
  }

  let raw = '';
  try {
    raw = await req.text();
  } catch {
    return reply(400, { success: false, message: 'Could not read the submission.' });
  }
  if (raw.length > MAX_BODY_BYTES) {          // chunked requests declare no length
    return reply(413, { success: false, message: 'Submission too large.' });
  }

  const headers = {
    host: req.headers.get('host') || '',
    'x-forwarded-host': req.headers.get('x-forwarded-host') || '',
  };

  try {
    const { status, payload } = await handleOnce(raw, headers);
    return reply(status, payload);
  } catch (exc) {
    // never leak a key, an endpoint or provider detail to the browser
    console.error(`enquiry: unhandled: ${exc?.name}: ${redact(exc?.message)}`);
    return reply(500, {
      success: false,
      message: 'We could not send your enquiry right now. Please email '
        + 'info@tuteeconnect.com directly.',
    });
  }
}

export const config = { path: '/api/enquiry' };
