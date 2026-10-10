/**
 * Live news for the ticker between "Why Ireland?" and "What we do".
 *
 * GET /api/news returns the latest headlines about studying, working and
 * settling in Ireland, as JSON:
 *
 *   { updated: ISO-8601, items: [{ title, source, link, date, tag }] }
 *
 * The source is the public Google News RSS search feed (Irish edition), so no
 * key is needed and the function has zero npm dependencies. The browser never
 * talks to Google directly: the page's CSP keeps connect-src same-origin, and
 * this function is that origin.
 *
 * One search per topic the page covers, so the ticker carries a mix rather
 * than whichever topic happens to dominate the day's news. Responses are
 * cached at Netlify's CDN for 15 minutes, so the feeds are fetched a few times
 * an hour at most, however busy the page is.
 *
 * Ireland-specific (the queries below), unlike enquiry.mjs, which is shared by
 * every country site. serve.py mirrors this logic for local previews; keep the
 * two in step.
 */

// [tag shown on the ticker, Google News search, what the headline itself must mention]
// Google matches article bodies too, so the headline test is what keeps the
// ticker on topic.
const TOPICS = [
  ['Universities', '("Irish universities" OR "Trinity College Dublin" OR UCD OR "University College Cork" OR "University of Galway" OR DCU OR "University of Limerick" OR "TU Dublin" OR "Maynooth University") when:14d',
    /universit|college|campus|student|research|scholar|degree|graduat|lecturer|professor|academ|programme|course/i],
  ['Students', 'Ireland ("international students" OR "study in Ireland" OR "student visa" OR "non-EU students") when:30d',
    /student|study|visa|graduat|degree|international/i],
  ['Careers', 'Ireland ("Critical Skills" OR "employment permit" OR "graduate jobs" OR "skills shortage" OR "Stamp 4") when:30d',
    /permit|visa|skill|jobs?\b|hiring|career|graduate|employ|talent|recruit|stamp 4|workers?\b/i],
  ['Scholarships', 'Ireland (scholarship OR scholarships OR bursary) university when:30d',
    /scholar|bursar|fellowship|award/i],
  ['Industry', 'Ireland (tech OR pharma OR medtech) (jobs OR hiring OR "European headquarters") when:14d',
    /jobs?\b|hiring|headquarters|\bhq\b|invest|expan|pharma|medtech|engineer|facility|sector|operations|office/i],
];

const PER_TOPIC = 4;
const FETCH_TIMEOUT_MS = 8000;

// Every headline must be visibly about Ireland.
const IRISH = /ireland|irish|dublin|cork|galway|limerick|maynooth|waterford|athlone|dundalk|kilkenny|wexford|sligo|carlow|letterkenny|tralee|trinity|\bucd\b|\bdcu\b|\bucc\b|\bul\b|\batu\b|\bsetu\b|\bmtu\b|\btus\b|\brcsi\b/i;

// The site never shows monetary amounts (see README), so neither does the ticker.
const MONEY = /[€£$₹]\s?\d|\d\s?(?:euro|eur|million|billion|bn|m|k)\b|\beuros?\b|\bfees?\b|\bcost|salar|wage|\bpay\b|\bearn/i;

// Stories outside the Republic belong to the UK page, not this one.
const ELSEWHERE = /northern ireland|\bni\b|belfast|derry|\buk\b|britain|british|england|scotland|wales|london/i;

// A study-abroad landing page is not the place for crime, court or tragedy.
const OFF_TONE = /trash|damage|destroy|riot|death|dead|dies|died|kill|murder|assault|attack|crash|arrest|charged|court|garda|police|protest|strike|crisis|cuts?\b|scandal|abuse|fraud|war\b|gaza|palestin|israel|asylum|deport|refus|reject|experiment|party|drug|fire\b|collapse|layoff|redundanc|job losses|closure|row\b|anger|outcry|warn|\bdip|declin|slump|plunge|fewer/i;

function decode(text) {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function field(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
}

/** Parse one topic's RSS into clean, on-topic items, newest first. */
export function parseFeed(xml, tag, about) {
  const items = [];
  for (const [, block] of String(xml).matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const source = field(block, 'source');
    let title = field(block, 'title');
    // Google appends " - Source Name" to every title; the ticker shows it separately.
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3));
    // Long titles arrive cut off mid-phrase ("Course, Scholarship &"); end them cleanly.
    title = title.replace(/[\s,;:&|–-]+$/, '');
    const link = field(block, 'link');
    const date = new Date(field(block, 'pubDate'));

    if (!title || title.length > 140 || !/^https:\/\//.test(link) || Number.isNaN(date.getTime())) continue;
    if (!IRISH.test(title) || (about && !about.test(title))) continue;
    if (MONEY.test(title) || ELSEWHERE.test(title + ' ' + source) || OFF_TONE.test(title)) continue;
    items.push({ title, source, link, date: date.toISOString(), tag });
  }
  return items.sort((a, b) => b.date.localeCompare(a.date));
}

/** Take the newest few of each topic, drop repeats, and interleave the topics
 * so neighbouring headlines on the ticker differ. */
export function merge(lists) {
  const seen = new Set();
  const picked = lists.map((list) => list.filter((it) => {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, PER_TOPIC));
  const out = [];
  for (let i = 0; i < PER_TOPIC; i++) picked.forEach((list) => { if (list[i]) out.push(list[i]); });
  return out;
}

async function fetchTopic([tag, query, about]) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query)
    + '&hl=en-IE&gl=IE&ceid=IE:en';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TuteeConnect-Ireland-NewsTicker/1.0', Accept: 'application/rss+xml' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    return parseFeed(await res.text(), tag, about);
  } catch (exc) {
    console.error(`news: ${tag}: ${exc?.name}: ${exc?.message}`);
    return [];                                    // one topic failing doesn't sink the rest
  } finally {
    clearTimeout(timer);
  }
}

function json(status, payload, cache) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache ? 'public, max-age=300' : 'no-store',
      // Netlify's CDN honours this one; browsers ignore it.
      ...(cache ? { 'Netlify-CDN-Cache-Control': 'public, s-maxage=900, stale-while-revalidate=3600' } : {}),
    },
  });
}

/** Netlify Functions v2 entry point. */
export default async function (req) {
  if (req.method !== 'GET') return json(405, { items: [] }, false);
  const items = merge(await Promise.all(TOPICS.map(fetchTopic)));
  // An empty list makes the page fall back to its built-in links.
  return json(items.length ? 200 : 502, { updated: new Date().toISOString(), items }, items.length > 0);
}

export const config = { path: '/api/news' };
