/**
 * Tutee Connect — Website Leads: one Apps Script for all six landing pages.
 *
 * MASTER COPY. This file lives in "Landing Pages/_shared/apps-script/Code.gs".
 * The copy in each site's apps-script/ folder is generated from it by
 * _shared/apps-script/sync.py. Edit this master, then run sync.py; never edit
 * a site copy on its own.
 *
 * Deploy it as ONE standalone Apps Script web app, linked to the "Website
 * Leads" spreadsheet (setSheetId). Deployment steps: _shared/apps-script/README.md.
 *
 * Contract with the sites (netlify/functions/enquiry.mjs, sendToAppsScript):
 *   POST, Content-Type: application/json, body:
 *   { token, country, name, phone, email, state, shortlist, course,
 *     lead_source, call_time, destination, page }
 *   Reply (always HTTP 200, Apps Script cannot set a status):
 *   { success: true,  message: 'Saved', mailed: true|false, [mail_error], [duplicate] }
 *   { success: false, message: <fixed text> }
 *   The sites treat success:false (or a non-JSON reply) as "not stored".
 *
 * Tokens (Script Properties, never in this file):
 *   LEADS_TOKEN_<COUNTRY>  each site's own token, e.g. LEADS_TOKEN_NEW_ZEALAND.
 *                          Once a country has one, only that token works for it.
 *   LEADS_TOKEN            shared token, accepted only for a country that has no
 *                          own token yet, and only while REQUIRE_COUNTRY_TOKENS
 *                          is not 'true'.
 *   REQUIRE_COUNTRY_TOKENS 'true' turns the shared fallback off (run
 *                          requireCountryTokens() once all six have their own).
 *   SHEET_ID               the Website Leads spreadsheet (standalone project).
 *   MAIL_TO                optional; defaults to DEFAULT_MAIL_TO below.
 *
 * Each lead becomes one row in its country's tab ("<Country> Leads") and one
 * email to MAIL_TO with Reply-To set to the student. Identical submissions within
 * 10 minutes are stored once. Logs never contain a name, email or phone.
 */

var VERSION = '2026-11-12-phase8';
var DEFAULT_MAIL_TO = 'business@tuteeconnect.com';
var TIME_ZONE = 'Asia/Kolkata';
var COUNTRIES = ['Singapore', 'Ireland', 'Finland', 'UK', 'Poland', 'New Zealand'];
var COUNTRY_ALIASES = {
  singapore: 'Singapore', sg: 'Singapore',
  ireland: 'Ireland', ie: 'Ireland',
  finland: 'Finland', fi: 'Finland',
  uk: 'UK', unitedkingdom: 'UK', gb: 'UK', britain: 'UK', greatbritain: 'UK',
  poland: 'Poland', pl: 'Poland',
  newzealand: 'New Zealand', nz: 'New Zealand'
};
var HEADERS = ['Date', 'Time', 'Full Name', 'Phone Number', 'Email', 'State',
  'Shortlisted Universities', 'Course', 'Lead Source', 'Preferred Call Time'];
var WIDTHS = [100, 90, 180, 150, 230, 150, 320, 240, 260, 190];
var HEADER_BG = '#0b3d3a';
var MAX_BODY_CHARS = 20000;
var DUP_WINDOW_SECONDS = 600;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ----------------------------------------------------------- web app */

/** The sites' /api/enquiry functions POST JSON here. */
function doPost(e) {
  try {
    return handlePost_(e);
  } catch (err) {
    console.error('leads: unexpected error (' + errName_(err) + ')');
    return reply_(false, 'Server error');
  }
}

/** Health check: proves the web app runs and which version is deployed. */
function doGet() {
  return reply_(true, 'Tutee Connect leads endpoint is running.', { version: VERSION });
}

function handlePost_(e) {
  var post = e && e.postData;
  if (!post || !post.contents) return reply_(false, 'Empty request');
  // the sites always send application/json; a request that names any other type is refused
  // (a missing type is allowed, as the UK repo's local test harness sends none)
  var type = String(post.type || '').split(';')[0].trim().toLowerCase();
  if (type && type !== 'application/json') return reply_(false, 'Unsupported content type');
  if (String(post.contents).length > MAX_BODY_CHARS) return reply_(false, 'Request too large');

  var body;
  try { body = JSON.parse(post.contents); } catch (err) { return reply_(false, 'Bad JSON'); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply_(false, 'Bad JSON');

  var country = canonicalCountry_(body.country);
  if (!country) {
    // only a caller holding a valid token learns that the destination is the problem
    return reply_(false, anyTokenMatches_(body.token) ? 'Unsupported destination' : 'Unauthorised');
  }
  var expected = expectedToken_(country);
  if (!expected || typeof body.token !== 'string' || !safeEqual_(body.token, expected)) {
    return reply_(false, 'Unauthorised');
  }

  var lead = normalise_(body, country);
  var problem = validate_(lead);
  if (problem) return reply_(false, problem);

  // duplicate check (CacheService is always present in Apps Script; local test
  // harnesses without it simply skip the check)
  var cache = typeof CacheService !== 'undefined' ? CacheService.getScriptCache() : null;
  var key = cache ? 'lead:' + digest_([country, lead.name, lead.email, lead.phone, lead.state,
    lead.shortlist, lead.course, lead.callTime, lead.interest].join('|')) : '';
  var seen = cache && cache.get(key);
  if (seen) return duplicateReply_(seen);

  var now = new Date();
  var row = [
    Utilities.formatDate(now, TIME_ZONE, 'dd/MM/yyyy'),
    Utilities.formatDate(now, TIME_ZONE, 'hh:mm a'),
    lead.name, lead.phone, lead.email, lead.state, lead.shortlist,
    lead.course, lead.source, lead.callTime
  ].map(safeCell_);

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    console.error('leads: busy, lock not acquired (' + country + ')');
    return reply_(false, 'Busy, please try again');
  }
  try {
    seen = cache && cache.get(key);              // a twin may have finished while we waited
    if (seen) return duplicateReply_(seen);
    getLeadsSheet_(lead.tab).appendRow(row);
    if (cache) cache.put(key, JSON.stringify({ mailed: null }), DUP_WINDOW_SECONDS);
  } catch (err) {
    console.error('leads: sheet write failed (' + country + ', ' + errName_(err) + ')');
    return reply_(false, 'Could not save');
  } finally {
    lock.releaseLock();
  }

  var mailed = true;
  try {
    sendLeadEmail_(lead, row);
  } catch (err) {
    mailed = false;
    console.error('leads: email failed for a ' + country + ' lead (' + errName_(err) + ')');
  }
  if (cache) cache.put(key, JSON.stringify({ mailed: mailed }), DUP_WINDOW_SECONDS);
  return reply_(true, 'Saved', mailed ? { mailed: true } : { mailed: false, mail_error: 'mail_failed' });
}

function duplicateReply_(seen) {
  var prior = {};
  try { prior = JSON.parse(seen) || {}; } catch (err) { prior = {}; }
  var extra = { duplicate: true, mailed: prior.mailed !== false };
  if (prior.mailed === false) extra.mail_error = 'mail_failed';
  return reply_(true, 'Saved', extra);
}

/* ------------------------------------------------- editor-run helpers */

/** Run once from the editor: links the standalone project to Website Leads. */
function setSheetId() {
  var id = 'PASTE-THE-SPREADSHEET-ID-HERE';
  if (/PASTE/.test(id)) throw new Error('Replace the placeholder with the Website Leads spreadsheet ID first.');
  SpreadsheetApp.openById(id);
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', id);
  return 'Sheet linked.';
}

/** Run once: creates and formats all six country tabs (existing tabs are kept). */
function setupAllTabs() {
  return COUNTRIES.map(function (c) { return getLeadsSheet_(c + ' Leads').getName(); }).join(', ');
}
/** Kept for older notes that name it. */
function setupFinlandLeads() { return getLeadsSheet_('Finland Leads').getName(); }

/* Token setters: paste a new long random value (30+ letters and digits), run the
 * function, then delete the value from the code again. The same value goes in
 * that site's APPS_SCRIPT_TOKEN on Netlify. */
function setToken() { return setSharedToken_('PASTE-A-LONG-RANDOM-TOKEN-HERE'); }
function setSingaporeToken() { return setCountryToken_('Singapore', 'PASTE-A-NEW-LONG-RANDOM-TOKEN-HERE'); }
function setIrelandToken() { return setCountryToken_('Ireland', 'PASTE-A-NEW-LONG-RANDOM-TOKEN-HERE'); }
function setFinlandToken() { return setCountryToken_('Finland', 'PASTE-A-NEW-LONG-RANDOM-TOKEN-HERE'); }
function setUKToken() { return setCountryToken_('UK', 'PASTE-A-NEW-LONG-RANDOM-TOKEN-HERE'); }
function setPolandToken() { return setCountryToken_('Poland', 'PASTE-A-NEW-LONG-RANDOM-TOKEN-HERE'); }
function setNewZealandToken() { return setCountryToken_('New Zealand', 'PASTE-A-NEW-LONG-RANDOM-TOKEN-HERE'); }

/** Turns the shared-token fallback off, once every country has its own token. */
function requireCountryTokens() {
  var props = PropertiesService.getScriptProperties();
  var missing = COUNTRIES.filter(function (c) { return !props.getProperty(tokenKey_(c)); });
  if (missing.length) throw new Error('These countries still use the shared token: ' + missing.join(', '));
  props.setProperty('REQUIRE_COUNTRY_TOKENS', 'true');
  return 'Shared LEADS_TOKEN is no longer accepted.';
}

/** Shows which countries have their own token (values are never printed). */
function checkTokens() {
  var props = PropertiesService.getScriptProperties();
  var strict = props.getProperty('REQUIRE_COUNTRY_TOKENS') === 'true';
  var out = ['Version ' + VERSION,
    'Shared LEADS_TOKEN: ' + (props.getProperty('LEADS_TOKEN') ? 'set' : 'not set') + (strict ? ' (not accepted)' : ''),
    'Sheet: ' + (props.getProperty('SHEET_ID') ? 'linked by SHEET_ID' : 'container sheet'),
    'Mail to: ' + (props.getProperty('MAIL_TO') ? 'MAIL_TO property' : 'default')];
  COUNTRIES.forEach(function (c) {
    out.push(c + ': ' + (props.getProperty(tokenKey_(c)) ? 'own token' : (strict ? 'NO TOKEN (refused)' : 'shared token')));
  });
  console.log(out.join(' | '));
  return out.join(' | ');
}

/** Sends one sample lead to MAIL_TO. Run only when a test email is approved. */
function testEmail() {
  var lead = normalise_({ name: 'TEST lead (editor)', phone: '+91 9845012367', email: mailTo_(), state: 'Test',
    course: 'Test only', lead_source: 'Apps Script editor test', call_time: 'Anytime' }, 'Finland');
  var now = new Date();
  var row = [Utilities.formatDate(now, TIME_ZONE, 'dd/MM/yyyy'), Utilities.formatDate(now, TIME_ZONE, 'hh:mm a'),
    lead.name, lead.phone, lead.email, lead.state, lead.shortlist, lead.course, lead.source, lead.callTime];
  sendLeadEmail_(lead, row);
  return 'Sent. Emails left today: ' + MailApp.getRemainingDailyQuota();
}

/* ------------------------------------------------------------- helpers */

function canonicalCountry_(v) {
  var k = String(v == null ? '' : v).toLowerCase().replace(/[^a-z]/g, '');
  return COUNTRY_ALIASES[k] || '';
}

/** "New Zealand" → "LEADS_TOKEN_NEW_ZEALAND". */
function tokenKey_(country) {
  return 'LEADS_TOKEN_' + String(country || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** The token a lead for this country must carry, or '' if none is accepted. */
function expectedToken_(country) {
  var props = PropertiesService.getScriptProperties();
  var own = props.getProperty(tokenKey_(country));
  if (own) return own;
  if (props.getProperty('REQUIRE_COUNTRY_TOKENS') === 'true') return '';
  return props.getProperty('LEADS_TOKEN') || '';
}

function anyTokenMatches_(token) {
  if (typeof token !== 'string' || !token) return false;
  return COUNTRIES.some(function (c) { var t = expectedToken_(c); return t && safeEqual_(token, t); });
}

/** Compares every character, so timing does not reveal how much of a token matched. */
function safeEqual_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

function setSharedToken_(token) {
  checkNewToken_(token, 'LEADS_TOKEN');
  PropertiesService.getScriptProperties().setProperty('LEADS_TOKEN', token);
  return 'Shared token saved.';
}

function setCountryToken_(country, token) {
  checkNewToken_(token, tokenKey_(country));
  PropertiesService.getScriptProperties().setProperty(tokenKey_(country), token);
  return 'Saved as ' + tokenKey_(country) + '.';
}

function checkNewToken_(token, key) {
  if (/PASTE/.test(token)) throw new Error('Replace the placeholder with your own token first.');
  if (String(token).length < 30) throw new Error('Use at least 30 characters.');
  var props = PropertiesService.getScriptProperties();
  ['LEADS_TOKEN'].concat(COUNTRIES.map(tokenKey_)).forEach(function (k) {
    if (k !== key && props.getProperty(k) === token) throw new Error('This value is already used by ' + k + '.');
  });
}

function normalise_(b, country) {
  var s = function (v, n) { return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 300); };
  return {
    tab: country + ' Leads',
    country: country,
    name: s(b.name, 120),
    phone: s(b.phone, 40),
    email: s(b.email, 200),
    state: s(b.state, 80) || '—',
    shortlist: s(b.shortlist, 1500) || '—',
    course: s(b.course, 300) || '—',
    source: s(b.lead_source, 300) || 'Website',
    callTime: s(b.call_time, 80) || 'Not specified',
    interest: s(b.destination, 600),
    page: s(b.page, 200)
  };
}

/** The same rules as the sites' validate() (netlify/functions/enquiry.mjs). */
function validate_(lead) {
  if (lead.name.length < 2) return 'Missing or invalid name';
  if (!EMAIL_RE.test(lead.email)) return 'Missing or invalid email';
  var digits = lead.phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return 'Missing or invalid phone';
  var intl = lead.phone.trim();
  var national = function (cc) { return digits.slice(cc.length).replace(/^0/, ''); };
  if (intl.indexOf('+91') === 0 && !/^[2-9]\d{9}$/.test(national('91'))) return 'Missing or invalid phone';
  if (intl.indexOf('+971') === 0 && !/^\d{8,9}$/.test(national('971'))) return 'Missing or invalid phone';
  return null;
}

function digest_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function errName_(err) {
  return String((err && err.name) || 'Error').replace(/[^A-Za-z]/g, '').slice(0, 30) || 'Error';
}

/** Text that starts with = + - @ would be read as a formula (a "+91 …" phone
 *  number included), so it is stored as plain text. */
function safeCell_(v) {
  var t = String(v == null ? '' : v);
  return /^[=+\-@]/.test(t) ? "'" + t : t;
}

function mailTo_() {
  return PropertiesService.getScriptProperties().getProperty('MAIL_TO') || DEFAULT_MAIL_TO;
}

/** The leads tab, created and formatted on first use. */
function getLeadsSheet_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;

  sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS])
    .setBackground(HEADER_BG).setFontColor('#ffffff').setFontWeight('bold')
    .setVerticalAlignment('middle');
  sheet.setRowHeight(1, 32);
  sheet.setFrozenRows(1);
  WIDTHS.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.getRange(2, 1, sheet.getMaxRows() - 1, HEADERS.length).setNumberFormat('@').setVerticalAlignment('top').setWrap(true);
  sheet.getRange(1, 1, sheet.getMaxRows(), HEADERS.length).createFilter();
  var extra = sheet.getMaxColumns() - HEADERS.length;
  if (extra > 0) sheet.deleteColumns(HEADERS.length + 1, extra);
  return sheet;
}

function sendLeadEmail_(lead, row) {
  var rows = HEADERS.map(function (h, i) { return [h, String(row[i]).replace(/^'/, '')]; });
  if (lead.interest) rows.push(['Interested In', lead.interest]);
  if (lead.page) rows.push(['Submitted From', lead.page]);

  var cells = rows.map(function (r, i) {
    return '<tr>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e6ece9;background:' + (i % 2 ? '#ffffff' : '#f6f9f8') + ';font-weight:600;color:#0b3d3a;white-space:nowrap;vertical-align:top;width:190px">' + esc_(r[0]) + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid #e6ece9;background:' + (i % 2 ? '#ffffff' : '#f6f9f8') + ';color:#1f2937;vertical-align:top">' + esc_(r[1]) + '</td>' +
      '</tr>';
  }).join('');

  var title = lead.country + ' Landing Page';
  var html =
    '<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;margin:0 auto;color:#1f2937">' +
      '<div style="background:' + HEADER_BG + ';color:#ffffff;padding:18px 22px;border-radius:12px 12px 0 0">' +
        '<div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8">New lead · ' + esc_(title) + '</div>' +
        '<div style="font-size:20px;font-weight:700;margin-top:4px">' + esc_(lead.name) + '</div>' +
      '</div>' +
      '<table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e6ece9;border-top:0">' + cells + '</table>' +
      '<p style="font-size:12px;color:#6b7280;margin:14px 2px">Reply to this email to answer ' + esc_(lead.name) + ' directly. ' +
        'This lead is also saved in the "' + esc_(lead.tab) + '" tab of Website Leads.</p>' +
    '</div>';

  var text = ['New lead · ' + title, ''].concat(rows.map(function (r) { return r[0] + ': ' + r[1]; })).join('\n');

  MailApp.sendEmail({
    to: mailTo_(),
    replyTo: lead.email,
    name: 'Tutee Connect Website',
    subject: 'New ' + lead.country + ' Lead – ' + lead.name,
    htmlBody: html,
    body: text
  });
}

function esc_(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function reply_(ok, message, extra) {
  var out = { success: ok, message: message };
  if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** The Website Leads spreadsheet: by SHEET_ID in a standalone project, or the
 *  container sheet for a project made from the sheet's Extensions menu. */
function getSpreadsheet_() {
  var id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}
