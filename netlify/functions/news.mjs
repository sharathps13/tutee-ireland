/**
 * Live news for the banner between "Why Ireland?" and "What we do".
 *
 * GET /api/news returns the latest headlines about studying, working and
 * settling in Ireland, as JSON:
 *
 *   { updated: ISO-8601, items: [{ title, source, link, date, tag, image }] }
 *
 * Stories come straight from Irish publishers' own RSS feeds (RTÉ, the Irish
 * Independent, The Irish Times, TheJournal.ie, Silicon Republic, The PIE News,
 * and the student papers University Times and Trinity News). Direct feeds mean
 * every link goes to the publisher's article, and most stories arrive with
 * their own picture. When a feed gives no picture, the article's preview image
 * (og:image, the one a messaging app shows for the link) is read from the
 * article itself. `image` is '' when neither exists; the page then shows one of
 * its own stock photos, so every story still has a distinct picture.
 *
 * Zero npm dependencies. The browser never fetches the feeds: the page's CSP
 * keeps connect-src same-origin, and this function is that origin. Responses
 * are cached at Netlify's CDN for 30 minutes, so the feeds are read a couple of
 * times an hour at most, however busy the page is.
 *
 * Ireland-specific, unlike enquiry.mjs, which every country site shares.
 * serve.py runs this file through Node for local previews.
 */

// [name shown under the headline, feed URL, feed only partly about Ireland?]
const SOURCES = [
  ['RTÉ News', 'https://www.rte.ie/feeds/rss/?index=/news/education/'],
  ['RTÉ News', 'https://www.rte.ie/feeds/rss/?index=/news/business/', true],
  ['Irish Independent', 'https://www.independent.ie/irish-news/education/rss'],
  ['The Irish Times', 'https://www.irishtimes.com/arc/outboundfeeds/feed-irish-news/?from=0&size=50'],
  ['TheJournal.ie', 'https://www.thejournal.ie/feed/'],
  ['Silicon Republic', 'https://www.siliconrepublic.com/careers/feed'],
  ['Silicon Republic', 'https://www.siliconrepublic.com/feed/', true],
  ['The PIE News', 'https://thepienews.com/feed/', true],
  ['University Times', 'https://universitytimes.ie/feed/'],
  ['Trinity News', 'https://www.trinitynews.ie/feed/'],
];

// A headline's topic, tested in this order; a headline matching none is skipped.
// Industry needs both a sector and a hiring/investment word, so a general tech
// story doesn't pass as Irish jobs news.
const TOPICS = [
  ['Visas', (t) => /\bvisas?\b|immigration|stamp [0-9]|study permission|residence permit|\birp\b/.test(t)],
  ['Scholarships', (t) => /scholarship|bursar|fellowship|\bgrants? for students|student grant|\bsusi\b/.test(t)],
  ['Industry', (t) => /\btech\b|technolog|pharma|medtech|life sciences|software|semiconductor|data cent|\bai\b|cyber|digital|engineering/.test(t)
    && /\bjobs?\b|hiring|\broles\b|headquarters|\bhq\b|invest|expan|new facility|new office|to create/.test(t)],
  ['Careers', (t) => /critical skills|employment permit|graduate|\bjobs?\b|hiring|careers?\b|skills? (shortage|gap)|recruit|talent|workforce|upskill|apprentice|internship/.test(t)],
  ['Students', (t) => /international students?|\bstudents?\b|study abroad|erasmus|\bcao\b|student accommodation/.test(t)],
  ['Universities', (t) => /universit|college|campus|\bucd\b|\bdcu\b|\bucc\b|trinity|maynooth|tu dublin|\batu\b|\bsetu\b|\bmtu\b|\btus\b|\brcsi\b|third[- ]level|higher education|research|lecturer|professor|academic|degree/.test(t)],
];

const PER_TOPIC = 4;
const MAX_AGE_DAYS = 30;
const FEED_TIMEOUT_MS = 4000;

// Feeds that are only partly about Ireland must name it in the headline.
const IRISH = /ireland|irish|dublin|cork|galway|limerick|maynooth|waterford|athlone|dundalk|kilkenny|wexford|sligo|carlow|letterkenny|tralee|trinity|\bucd\b|\bdcu\b|\bucc\b|\bul\b|\batu\b|\bsetu\b|\bmtu\b|\btus\b|\brcsi\b/i;

// The site never shows monetary amounts (see README), so neither does the banner.
const MONEY = /[€£$₹]\s?\d|\d\s?(?:euro|eur|million|billion|bn|m|k)\b|\beuros?\b|\bfees?\b|\bcost|salar|wage|\bpay\b|\bearn|\bprice|\brent\b|budget/i;

// Stories outside the Republic belong to the UK page, not this one.
const ELSEWHERE = /northern ireland|\bni\b|belfast|derry|\buk\b|britain|british|england|scotland|wales|london/i;

// A study-abroad landing page is not the place for crime, court or tragedy.
const OFF_TONE = /trash|damage|destroy|riot|death|dead|dies|died|kill|murder|assault|attack|crash|arrest|charged|court|garda|police|protest|strike|crisis|cuts?\b|scandal|abuse|fraud|war\b|gaza|palestin|israel|asylum|deport|refus|reject|experiment|party|drug|fire\b|collapse|layoff|redundanc|job losses|closure|row\b|anger|outcry|warn|\bdip|declin|slump|plunge|fewer|sexual|harass|bully|victim|trauma|suicide|missing|injur|hospitali|shortfall|threat|fear|ban\b|banned|tribunal|investigat|inquiry|sued|lawsuit|unrest|dispute|industrial action|cancel|delay|condemn|security|dispers|challenge|denial|denied|guilty|misconduct|inappropriate|\bdown\b|\bfalls?\b|\bfell\b|\bdrops?\b|ineligible|struggl|concern|criticis|\bslam|blast|not aiding|\bfail/i;

// This page is about third-level study: school stories don't belong.
const SCHOOL = /\bschools?\b|leaving cert|junior cert|primary|secondary|pupils?\b|teachers?\b|creche|créche|childcare|pre-school/i;

function decode(text) {
  return String(text)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;|&#8217;|&rsquo;/g, '’').replace(/&#8216;|&lsquo;/g, '‘')
    .replace(/&#8220;|&ldquo;/g, '“').replace(/&#8221;|&rdquo;/g, '”')
    .replace(/&#8211;|&ndash;/g, '–').replace(/&#8212;|&mdash;/g, '—').replace(/&#8230;|&hellip;/g, '…')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function field(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : '';
}

function attr(tag, name) {
  const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return m ? m[1].replace(/&amp;/g, '&') : '';
}

/** The biggest picture the feed item carries, or ''. */
export function feedImage(block) {
  const found = [];
  for (const tag of block.match(/<(?:media:content|media:thumbnail|enclosure)\b[^>]*>/gi) || []) {
    const url = attr(tag, 'url');
    const type = attr(tag, 'type'), medium = attr(tag, 'medium');
    if (!/^https?:\/\//.test(url)) continue;
    if (medium && medium !== 'image') continue;
    if (type && !/^image/i.test(type)) continue;
    found.push({ url: url.replace(/^http:/, 'https:'), width: +attr(tag, 'width') || 0 });
  }
  found.sort((a, b) => b.width - a.width);
  // RTÉ serves the same picture at 1600px; the banner is wide.
  return (found[0]?.url || '').replace(/(rte\.ie\/images\/[0-9a-f]+)-\d+\.jpg$/, '$1-1600.jpg');
}

/** One feed's items that are on topic for this page. */
export function parseFeed(xml, source, partlyIrish, now = Date.now()) {
  const items = [];
  for (const [, block] of String(xml).matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/g)) {
    const title = field(block, 'title').replace(/[\s,;:&|–-]+$/, '');
    const link = field(block, 'link');
    const date = new Date(field(block, 'pubDate') || field(block, 'dc:date'));
    if (!title || title.length > 160 || !/^https:\/\//.test(link) || Number.isNaN(date.getTime())) continue;
    if (now - date.getTime() > MAX_AGE_DAYS * 864e5 || date.getTime() - now > 864e5) continue;
    if (partlyIrish && !IRISH.test(title)) continue;
    if (MONEY.test(title) || ELSEWHERE.test(title) || OFF_TONE.test(title) || SCHOOL.test(title)) continue;
    const t = title.toLowerCase();
    const topic = TOPICS.find(([, test]) => test(t));
    if (!topic) continue;
    items.push({ title, source, link, date: date.toISOString(), tag: topic[0], image: feedImage(block) });
  }
  return items;
}

/** Newest few of each topic, repeats dropped, topics interleaved so
 * neighbouring stories in the banner differ. */
export function merge(lists) {
  const seen = new Set();
  const byTopic = new Map(TOPICS.map(([tag]) => [tag, []]));
  lists.flat().sort((a, b) => b.date.localeCompare(a.date)).forEach((it) => {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]+/g, '');
    const linkKey = it.link.replace(/[?#].*$/, '');
    if (seen.has(key) || seen.has(linkKey)) return;
    seen.add(key); seen.add(linkKey);
    byTopic.get(it.tag).push(it);
  });
  // The same story from two outlets ("Tines announces 100 jobs" / "Tines plans
  // 100 new Dublin jobs"): most of the shorter headline's words in the longer.
  const kept = [];
  const words = (t) => new Set(t.toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  for (const [tag, list] of byTopic) {
    byTopic.set(tag, list.filter((it) => {
      const w = words(it.title);
      const twin = kept.some((k) => {
        let shared = 0;
        k.forEach((x) => { if (w.has(x)) shared++; });
        return shared / Math.min(k.size, w.size || 1) >= 0.6;
      });
      if (!twin) kept.push(w);
      return !twin;
    }));
  }
  const picked = [...byTopic.values()].map((list) => list.slice(0, PER_TOPIC));
  const out = [];
  for (let i = 0; i < PER_TOPIC; i++) picked.forEach((list) => { if (list[i]) out.push(list[i]); });
  return out;
}

async function fetchFeed([source, url, partlyIrish]) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TuteeConnect-Ireland-News/2.0 (+https://www.tuteeconnect.com)', Accept: 'application/rss+xml, application/xml;q=0.9, */*;q=0.5' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`feed HTTP ${res.status}`);
    return parseFeed(await res.text(), source, !!partlyIrish);
  } catch (exc) {
    console.error(`news: ${source} ${url}: ${exc?.name}: ${exc?.message}`);
    return [];                                    // one feed failing doesn't sink the rest
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- pictures
// For stories whose feed gives no picture, read the article's preview image.
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const PICTURE_BUDGET_MS = 4000;
const STEP_TIMEOUT_MS = 3000;
const PICTURE_CONCURRENCY = 6;
const MAX_HTML_BYTES = 400000;   // og tags live in <head>; never read a whole page
// Generic site artwork rather than a picture of the story
const NOT_A_PHOTO = /logo|favicon|placeholder|default[-_]|share[-_]?image|og[-_]default|blank\.|spacer|sprite|\.svg(\?|$)/i;

async function readHead(res) {
  if (!res.body || !res.body.getReader) return (await res.text()).slice(0, MAX_HTML_BYTES);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (text.length < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
    if (/<\/head>/i.test(text)) break;
  }
  reader.cancel().catch(() => {});
  return text;
}

/** The article's preview image, as an absolute https URL, or ''. */
export function pickImage(html, pageUrl) {
  const tags = String(html).match(/<meta\b[^>]*>/gi) || [];
  for (const name of ['og:image:secure_url', 'og:image', 'twitter:image', 'twitter:image:src']) {
    for (const tag of tags) {
      const key = attr(tag, 'property') || attr(tag, 'name');
      if (key.toLowerCase() !== name) continue;
      const raw = attr(tag, 'content');
      if (!raw) continue;
      let abs;
      try { abs = new URL(raw.trim(), pageUrl); } catch { continue; }
      if (abs.protocol === 'http:') abs.protocol = 'https:';
      if (abs.protocol !== 'https:' || NOT_A_PHOTO.test(abs.pathname)) continue;
      return abs.href;
    }
  }
  return '';
}

async function articleImage(url, deadline) {
  const left = Math.min(STEP_TIMEOUT_MS, deadline - Date.now());
  if (left < 300) return '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), left);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, redirect: 'follow', signal: controller.signal });
    return res.ok ? pickImage(await readHead(res), res.url || url) : '';
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

/** Fill in missing pictures, then clear any picture two stories share (a
 * site's stock share image), so no two stories in the banner look alike. */
export async function addPictures(items) {
  const deadline = Date.now() + PICTURE_BUDGET_MS;
  const todo = items.filter((it) => !it.image);
  let next = 0;
  async function worker() {
    while (next < todo.length) {
      const it = todo[next++];
      it.image = await articleImage(it.link, deadline);
    }
  }
  await Promise.all(Array.from({ length: PICTURE_CONCURRENCY }, worker));
  const seen = new Set();
  for (const it of items) {
    if (!it.image) continue;
    // Ignore WordPress-style size suffixes (photo-1200x630.jpg); keep the query,
    // which some image servers use to tell pictures apart.
    const key = it.image.replace(/#.*$/, '').replace(/-\d+x\d+(?=\.\w+(\?|$))/, '');
    if (seen.has(key)) it.image = '';
    else seen.add(key);
  }
  return items;
}

function json(status, payload, cache) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cache ? 'public, max-age=300' : 'no-store',
      // Netlify's CDN honours this one; browsers ignore it.
      ...(cache ? { 'Netlify-CDN-Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=21600' } : {}),
    },
  });
}

/** Netlify Functions v2 entry point. */
export default async function (req) {
  if (req.method !== 'GET') return json(405, { items: [] }, false);
  const items = await addPictures(merge(await Promise.all(SOURCES.map(fetchFeed))));
  // An empty list makes the page fall back to its built-in links.
  return json(items.length ? 200 : 502, { updated: new Date().toISOString(), items }, items.length > 0);
}

export const config = { path: '/api/news' };
