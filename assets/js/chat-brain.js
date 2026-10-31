/* ==========================================================================
   Tutee Connect — Ireland: what the Tutee AI chat knows, and how it answers.

   The chat answers from this website's own content, nothing else:
     - every section of both pages (read live from the DOM, and the other page
       fetched once, so an edit to the copy is picked up automatically)
     - the nine services (services-data.js), the four settlement stops
       (handed over by main.js), and the 113-institution directory
       (universities-data.js, loaded on demand)
   A question is matched against all of those passages with BM25 ranking,
   a small synonym table for how students phrase things, and name aliases
   for the institutions. If nothing on the site answers it, the reply says so
   and points to an advisor instead of guessing.

   On top of that search it understands, like the Finland and New Zealand
   chats: typos ("scholarhsip", "trinty"), institution short names,
   comparisons ("TCD vs UCD"), "which university is best for IT / business /
   nursing" (from the directory's subjects, ranked ones first), and follow-ups
   that lean on the last answer ("is it ranked?", "what about Cork?").
   Replies carry tap-to-ask suggestions for the next question.

   This file only answers questions and stores nothing. The callback request
   ("Request a callback", "talk to a counsellor"…) lives in main.js: it asks
   for a name, phone and email and sends them to /api/enquiry.
   Exposes window.TC_chatBrain = { answer(question) -> Promise<reply>, addPassages(list), reset() }.
   ========================================================================== */
(function () {
  'use strict';

  var HERE = /universities\.html$/.test(location.pathname) ? 'universities' : 'home';
  var OTHER_URL = HERE === 'home' ? './universities.html' : './index.html';

  /* ------------------------------------------------------------------ *
   * Text processing
   * ------------------------------------------------------------------ */
  var STOP = ('a an and are as at be been but by can could do does did for from had has have how i if in into is it its ' +
    'me my of on or our please should so tell than that the their them then there these they this to us was we what when ' +
    'where which who whom why will with would you your yours about any also get got just like know want much many ' +
    'some more most very really am im ive id isnt dont doesnt cant ill shall may might must let lets give show explain ' +
    'there s t hi hey hello thanks thank ok okay come go going take make use see look find put keep available good great nice ' +
    'choice choose option options better right possible able possibly anyone something anything everything sure').split(' ');
  var STOPSET = {};
  STOP.forEach(function (w) { STOPSET[w] = 1; });

  function stem(w) {
    if (w.length <= 3 || /^\d/.test(w)) return w;
    if (/ies$/.test(w) && w.length > 4) return w.slice(0, -3) + 'y';
    if (/sses$/.test(w)) return w.slice(0, -2);
    if (/ing$/.test(w) && w.length > 5) return w.slice(0, -3);
    if (/ed$/.test(w) && w.length > 4) return w.slice(0, -2);
    if (/es$/.test(w) && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/ss$/.test(w) && !/us$/.test(w) && !/is$/.test(w)) return w.slice(0, -1);
    return w;
  }
  function words(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[’']/g, '').split(/[^a-z0-9]+/).filter(Boolean);
  }
  function tokens(s) {
    return words(s).filter(function (w) { return !STOPSET[w]; }).map(stem);
  }
  function fold(s) { return words(s).join(' '); }

  // How students ask vs how the site words it. Each group is mutual: any word
  // in a query also searches for the others, at a lower weight.
  var SYN_GROUPS = [
    'work job jobs employment employ career part-time parttime earn hire hiring wage',
    'stay remain after graduate graduation graduating post-study poststudy 1g stamp1g graduate-programme',
    'pr permanent residence residency settle settlement stamp4 long-term citizenship',
    'family spouse wife husband partner child children kid kids dependant dependent reunification',
    'english ielts pte toefl duolingo language test exam score gmat',
    'university universities college colleges institution institutions school uni unis campus provider',
    'visa visas permit permission stamp2 immigration avats',
    'accommodation housing house hostel room rooms rent stay-in dorm',
    'scholarship scholarships bursary bursaries grant grants waiver merit',
    'loan loans bank banks finance financing lender collateral',
    'fund funds funding money finance afford proof',
    'rank ranking ranked best top qs leading',
    'contact phone call number email mail whatsapp reach office address talk speak advisor counsellor counselor agent human',
    'document documents documentation sop statement purpose lor reference transcript passport',
    'course courses programme programmes program programs degree degrees masters master msc mba bachelor phd subject subjects study',
    'cost costs fee fees tuition price expensive cheap',
    'service services help support offer',
    'review reviews testimonial testimonials story stories feedback experience legit trust trusted genuine',
    'safe safety secure friendly',
    'ireland irish country',
    'need needs require required requirement requirements eligibility eligible criteria',
    'land landing arrive arrival',
    // months are left out: "January intake" must not match a passage that only mentions "15 January"
    'intake intakes deadline deadlines start'
  ];
  var SYN = {};
  SYN_GROUPS.forEach(function (g) {
    var ws = g.split(' ').map(function (w) { return stem(w.replace(/-/g, '')); });
    ws.forEach(function (w) { SYN[w] = (SYN[w] || []).concat(ws.filter(function (x) { return x !== w; })); });
  });

  // Institution short names people actually type.
  var ALIASES = {
    'trinity college dublin': 'tcd trinity', 'university college dublin': 'ucd', 'university college cork': 'ucc',
    'university of galway': 'nuig nui galway', 'dublin city university': 'dcu', 'university of limerick': 'ul limerick',
    'tu dublin': 'tud dit tudublin', 'maynooth university': 'maynooth mu nuim', 'technological university of the shannon': 'tus athlone',
    'dundalk institute of technology': 'dkit dundalk', 'south east technological university': 'setu waterford carlow',
    'national college of ireland': 'nci ncirl', 'atlantic technological university': 'atu sligo letterkenny',
    'munster technological university': 'mtu', 'royal college of surgeons': 'rcsi', 'griffith college': 'griffith',
    'dublin business school': 'dbs', 'mary immaculate college': 'mic'
  };

  /* ------------------------------------------------------------------ *
   * Passages
   * ------------------------------------------------------------------ */
  var passages = [], built = false, buildP = null, contact = {}, cities = [], types = [], unis = [];

  function clean(s) { return String(s || '').replace(/\s+/g, ' ').replace(/\s+([.,;:!?])/g, '$1').replace(/\.\./g, '.').trim(); }

  // Visible text of an element with real word breaks between its parts, and a
  // full stop after a bold lead-in ("Repay loans sooner. Earning while you...").
  // Interface bits (numbers on tiles, "View details", icons) are left out.
  var NOISE = 'svg, script, style, button.panel__hit, .tile__num, .tile__more, .tile__ico, .panel__num, .panel__tab, .sr-only, [aria-hidden="true"], .deck__hint';
  function textOf(el) {
    var out = '';
    el.childNodes.forEach(function (n) {
      if (n.nodeType === 3) { out += n.nodeValue; return; }
      if (n.nodeType !== 1 || n.matches(NOISE)) return;
      var t = textOf(n).trim();
      if (!t) return;
      var lead = /^(STRONG|B|H1|H2|H3|H4)$/.test(n.tagName) && n.nextSibling && /\S/.test(n.nextSibling.textContent || '');
      out += ' ' + t + (lead && !/[.:!?]$/.test(t) ? '.' : '') + ' ';
    });
    return out;
  }

  function add(p) {
    p.text = clean(p.text);
    p.title = clean(p.title);
    // fragments of a few words make poor answers and outrank real paragraphs
    if (!p.text || p.text.length < (p.kind ? 12 : 40)) return;
    p.toks = tokens(p.title + ' ' + p.title + ' ' + p.text + ' ' + (p.extra || ''));   // the title counts twice
    passages.push(p);
  }

  var SECTION_NAMES = { home: 'Welcome', why: 'Why Ireland', services: 'What we do', universities: 'Universities',
    funding: 'Funding', relocate: 'Settle in Ireland', testimonials: 'Student stories', faq: 'FAQ',
    contact: 'Free counselling', footer: 'Contact details' };

  function sectionInfo(el, page) {
    var sec = el.closest('section[id], footer, .band');
    var id = sec ? (sec.id || (sec.tagName === 'FOOTER' ? 'footer' : '')) : '';
    var name = SECTION_NAMES[id];
    if (!name && sec) {
      var k = sec.querySelector('.kicker, h1, h2');
      name = k ? clean(k.textContent).slice(0, 48) : 'This page';
    }
    if (page === 'universities' && !SECTION_NAMES[id]) name = name || 'Universities directory';
    return { id: id, name: name || 'This page', page: page };
  }

  function nearestHeading(el) {
    var n = el;
    while (n && n !== document.body) {
      var prev = n.previousElementSibling;
      while (prev) {
        if (/^H[1-4]$/.test(prev.tagName)) return prev.textContent;
        var h = prev.querySelector && prev.querySelector('h1, h2, h3, h4');
        if (h && prev.matches && !prev.matches('ul, ol')) return h.textContent;
        prev = prev.previousElementSibling;
      }
      n = n.parentElement;
      if (n && n.matches && n.matches('section, footer, article, .pane, .panel, .tile')) {
        var own = n.querySelector('h2, h3');
        return own ? own.textContent : '';
      }
    }
    return '';
  }

  // Elements whose text is not content worth answering from.
  var SKIP = 'script, style, svg, nav, header, .drawer, .rail, .dock, [data-chat], .chat, .sheet, .modal, .progress, ' +
    '[aria-hidden="true"], form, .skip, .band--news, .newsban, .deck__ui, .tray';

  function fromDocument(doc, page) {
    var root = doc.querySelector('main') || doc.body;
    var scope = [root].concat([].slice.call(doc.querySelectorAll('footer')));
    scope.forEach(function (r) {
      // FAQ: question + answer pairs are the most valuable passages on the site
      [].slice.call(r.querySelectorAll('.qlist li')).forEach(function (li) {
        var q = li.querySelector('.qbtn'), a = li.querySelector('.qa__a');
        if (q && a) add({ title: textOf(q), text: textOf(a), sec: sectionInfo(li, page), kind: 'faq' });
      });
      // Loan partners appear only as logos
      [].slice.call(r.querySelectorAll('.logo-wall')).forEach(function (w) {
        var names = [].slice.call(w.querySelectorAll('img[alt], [role=img][aria-label]')).map(function (i) { return i.getAttribute('alt') || i.getAttribute('aria-label'); }).filter(Boolean);
        if (names.length) add({ title: 'Education loan partners, banks and lenders', kind: 'list',
          text: 'Our education loan partners include ' + names.join(', ') + ', and many more trusted lending partners. Together they offer collateral and non-collateral education loans.',
          sec: sectionInfo(w, page) });
      });
      // Contact details and offices, for the contact intent
      if (!contact.offices) { var off = r.querySelector('.offices-line'); if (off) contact.offices = clean(textOf(off)); }
      // Departures board rows carry the 12 ranked universities in data attributes
      [].slice.call(r.querySelectorAll('.board__row[data-name]')).forEach(function (b) {
        var d = b.dataset;
        add({ title: d.name, kind: 'uni', ranked: true,
          text: d.name + ' is ranked #' + d.rank + ' in Ireland in the QS World University Rankings: Europe 2026. It is a ' +
            d.type + ' in ' + d.city + ' with ' + d.courses + ' eligible courses, known for ' + d.subjects + '.',
          extra: aliasFor(d.name), sec: sectionInfo(b, page) });
      });
      // Everything else: paragraphs, list items, tiles, panels, stamps, testimonials
      var blocks = r.querySelectorAll('p, li, .tile, .panel__body, .stamp, .voice, .frame__badge, .loan-tags, .why-foot__flags, .quote-strip, figcaption, .ucard');
      [].slice.call(blocks).forEach(function (el) {
        if (el.closest(SKIP) || el.closest('.qlist') || el.closest('.board') || el.closest('.sd-facts, .stop-detail, .pass, .offices-line, .reach, .footer__contact, .footer__base')) return;
        if (el.parentElement && el.parentElement.closest('.tile, .panel__body, .voice, .loan-tags, .why-foot__flags, .ucard')) return;
        if (el.matches('li') && el.querySelector('p, li')) return;
        add({ title: nearestHeading(el), text: textOf(el), sec: sectionInfo(el, page), kind: el.matches('.voice') ? 'story' : undefined });
      });
      // Section intros: heading + lede
      [].slice.call(r.querySelectorAll('.sec-head, .checkin__head, .dir-hero')).forEach(function (h) {
        if (h.closest(SKIP)) return;
        add({ title: (h.querySelector('h1, h2') || {}).textContent || '', text: textOf(h), sec: sectionInfo(h, page) });
      });
    });
  }

  function aliasFor(name) {
    var n = name.toLowerCase(), out = [];
    Object.keys(ALIASES).forEach(function (k) { if (n.indexOf(k) > -1) out.push(ALIASES[k]); });
    return out.join(' ');
  }

  function fromServices() {
    (window.IE_SERVICES || []).forEach(function (s) {
      String(s.desc).split(/\n\s*\n/).forEach(function (para) {
        add({ title: s.title + ': ' + s.tagline, text: para, sec: { id: 'services', name: 'What we do: ' + s.title, page: 'home' }, kind: 'service' });
      });
    });
  }

  function fromUniversities() {
    var list = window.IE_UNIVERSITIES || [];
    if (!list.length) return;
    var byCity = {}, byType = {};
    function plural(n, t) {
      t = t.toLowerCase();
      if (n === 1) return '1 ' + t;
      if (/^institute of/.test(t)) return n + ' ' + t.replace(/^institute/, 'institutes');
      return n + ' ' + (/y$/.test(t) ? t.slice(0, -1) + 'ies' : t + 's');
    }
    list.forEach(function (u) {
      var city = u.location.split(',')[0];
      (byCity[city] = byCity[city] || []).push(u);
      (byType[u.type] = byType[u.type] || []).push(u);
      add({ title: u.name, kind: 'uni', extra: aliasFor(u.name),
        text: u.name + ' is ' + (/^[AEIO]/.test(u.type) ? 'an ' : 'a ') + u.type.toLowerCase() + ' in ' + u.location + '. ' +
          'It has ' + u.programmes + ' eligible programme' + (u.programmes === '1' ? '' : 's') + ' on Ireland\'s official registers for international students. ' +
          'Subjects: ' + u.programs + '.' +
          (u.ranked ? ' It is ranked #' + u.rank + ' in Ireland in the QS World University Rankings: Europe 2026.' : ''),
        sec: { id: 'directory', name: 'Universities directory', page: 'universities' } });
    });
    Object.keys(byCity).forEach(function (c) {
      var l = byCity[c];
      add({ title: 'Universities and colleges in ' + c, kind: 'list', city: c.toLowerCase(),
        text: 'There ' + (l.length === 1 ? 'is 1 institution' : 'are ' + l.length + ' institutions') + ' in ' + c + ' on our directory: ' +
          l.slice(0, 12).map(function (u) { return u.name + ' (' + u.type + ')'; }).join('; ') + (l.length > 12 ? '; and ' + (l.length - 12) + ' more' : '') + '.',
        sec: { id: 'directory', name: 'Universities directory', page: 'universities' } });
    });
    Object.keys(byType).forEach(function (t) {
      var l = byType[t];
      add({ title: t + ' list in Ireland', kind: 'list', instType: t.toLowerCase(),
        text: 'Our directory lists ' + plural(l.length, t) + ' in Ireland: ' +
          l.slice(0, 14).map(function (u) { return u.name; }).join('; ') + (l.length > 14 ? '; and ' + (l.length - 14) + ' more' : '') + '.',
        sec: { id: 'directory', name: 'Universities directory', page: 'universities' } });
    });
    unis = list.map(function (u) {
      var core = fold(u.name.split(/,| - | \(/)[0]);
      return { u: u, core: core, city: u.location.split(',')[0] };
    });
    var ranked = list.filter(function (u) { return u.ranked; }).sort(function (a, b) { return a.rank - b.rank; });
    add({ title: 'Top ranked universities in Ireland, best universities, QS ranking', kind: 'list',
      text: 'The ' + ranked.length + ' Irish institutions in the QS World University Rankings: Europe 2026, in order: ' +
        ranked.map(function (u) { return u.rank + '. ' + u.name; }).join('; ') + '.',
      sec: { id: 'universities', name: 'Universities', page: 'home' } });
    cities = Object.keys(byCity).map(function (c) { return c.toLowerCase(); });
    types = Object.keys(byType).map(function (x) { return x.toLowerCase(); }).sort(function (a, b) { return b.length - a.length; });
    add({ title: 'How many institutions, universities and colleges are there in Ireland', kind: 'list', count: true,
      text: 'Our directory lists ' + list.length + ' Irish institutions, taken from Ireland\'s two official registers of programmes open to international students (TrustEd Ireland and the ILEP), including ' +
        Object.keys(byType).map(function (t) { return plural(byType[t].length, t); }).join(', ') +
        ', across ' + Object.keys(byCity).length + ' towns and cities.',
      sec: { id: 'directory', name: 'Universities directory', page: 'universities' } });
  }

  function loadScript(src) {
    return new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  function build() {
    if (buildP) return buildP;
    fromDocument(document, HERE);
    // Each page carries only its own data files; the other one is loaded on demand.
    var needServices = window.IE_SERVICES ? Promise.resolve() : loadScript('./assets/js/services-data.js');
    var needUnis = window.IE_UNIVERSITIES ? Promise.resolve() : loadScript('./assets/js/universities-data.js');
    var other = (location.protocol === 'file:' || !window.fetch || !window.DOMParser) ? Promise.resolve() :
      fetch(OTHER_URL).then(function (r) { return r.ok ? r.text() : ''; }).then(function (html) {
        if (!html) return;
        var doc = new DOMParser().parseFromString(html, 'text/html');
        fromDocument(doc, HERE === 'home' ? 'universities' : 'home');
      }).catch(function () {});
    buildP = Promise.all([needServices, needUnis, other]).then(function () {
      fromServices();
      fromUniversities();
      index();
      built = true;
    });
    return buildP;
  }

  /* ------------------------------------------------------------------ *
   * BM25 index
   * ------------------------------------------------------------------ */
  var df = {}, avgLen = 1, N = 1;
  function index() {
    df = {}; var total = 0;
    passages.forEach(function (p) {
      var tf = {};
      p.toks.forEach(function (t) { tf[t] = (tf[t] || 0) + 1; });
      p.tf = tf; p.len = p.toks.length; total += p.len;
      Object.keys(tf).forEach(function (t) { df[t] = (df[t] || 0) + 1; });
    });
    N = passages.length || 1; avgLen = total / N || 1;
  }
  function idf(t) { var n = df[t] || 0; return Math.log(1 + (N - n + 0.5) / (n + 0.5)); }

  function score(p, q, wantsStories) {
    var k1 = 1.2, b = 0.75, s = 0, hits = 0;
    // A floor on length: very short passages would otherwise win on a single word.
    // Lists are long by nature; a cap stops them losing to any short paragraph.
    var len = Math.max(p.len, avgLen * 0.75);
    if (p.kind === 'list') len = Math.min(len, avgLen * 1.2);
    q.forEach(function (qt) {
      var best = 0, exact = false;
      qt.forms.forEach(function (f) {
        var tf = p.tf[f.t];
        // an institution's name is not a synonym ("International House" is not accommodation)
        if (!tf || (p.kind === 'uni' && f.w !== 1)) return;
        var v = f.w * idf(f.t) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * len / avgLen));
        if (v > best) { best = v; exact = f.w === 1; }
      });
      // a word matched only through a synonym counts as part of a hit
      if (best > 0) hits += exact ? 1 : 0.6;
      s += best;
    });
    var cover = q.length ? hits / q.length : 0;
    // Student quotes answer "what do students say", not how a process works.
    var kindBoost = p.kind === 'faq' ? 1.25 : p.kind === 'service' ? 1.1 : p.ranked ? 1.15 : p.kind === 'story' ? (wantsStories ? 1.3 : 0.6) : 1;
    // Passages that answer more of the question rank above ones that repeat one word.
    return { s: s * kindBoost * (0.45 + 0.55 * cover), cover: cover };
  }

  function queryTerms(question) {
    var seen = {};
    return tokens(question).filter(function (t) { if (seen[t]) return false; seen[t] = 1; return true; }).map(function (t) {
      var forms = [{ t: t, w: 1 }];
      (SYN[t] || []).forEach(function (s) { forms.push({ t: s, w: 0.55 }); });
      return { t: t, forms: forms };
    });
  }

  /* ------------------------------------------------------------------ *
   * Composing a reply
   * ------------------------------------------------------------------ */
  function sentences(text) { return text.match(/[^.!?]+[.!?]+(\s|$)|[^.!?]+$/g) || [text]; }

  // The most relevant 1-3 sentences of a passage, in their original order.
  function excerpt(p, q, limit) {
    var text = p.text;
    // Lists and institution profiles are kept whole: their numbering ("1. Trinity")
    // is not sentence ends, and every item is the answer.
    if (p.kind === 'list' || p.kind === 'uni') return text.length > 900 ? text.slice(0, 880).replace(/;[^;]*$/, '') + '; and more.' : text;
    if (text.length <= (limit || 340)) return text;
    var ss = sentences(text).map(function (s, i) {
      var tk = tokens(s), sc = 0;
      q.forEach(function (qt) { if (qt.forms.some(function (f) { return tk.indexOf(f.t) > -1; })) sc += idf(qt.t); });
      return { s: s.trim(), i: i, sc: sc };
    });
    var pick = ss.slice().sort(function (a, b) { return b.sc - a.sc || a.i - b.i; }).slice(0, 3)
      .filter(function (x, k) { return k === 0 || x.sc > 0; })
      .sort(function (a, b) { return a.i - b.i; });
    var out = '', used = 0;
    pick.forEach(function (x) { if (used + x.s.length <= (limit || 340) || !out) { out += (out ? ' ' : '') + x.s; used += x.s.length; } });
    return out;
  }

  // [the question mentions this, so the answer must mention this]
  var ANCHORS = [
    [/\b(intakes?|intak\w*|semesters?|deadlines?|start dates?|batch)\b/, /\b(intakes?|semesters?|deadlines?|start dates?|academic year)\b/i],
    [/\b(near|nearby|close to|closest to|nearest|walking distance|distance from|next to)\b/, /\b(near|nearby|minutes?|km|walk|close to|distance)\b/i]
  ];
  var MONEY =/\b(how much|cost|costs|fee|fees|tuition|price|prices|expensive|cheap|budget|salary|salaries|wage|wages|pay|euro|euros|rupees?|lakhs?|inr)\b|[€£$₹]/i;
  var SMALLTALK = [
    [/^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening)|namaste)\b[\s!.]*$/i, 'greet'],
    [/^\s*(bye|goodbye|see you|that'?s all|that is all)\b[\s!.]*$/i, 'bye'],
    [/^\s*(thanks|thank you|thx|cheers|great|awesome|perfect|ok|okay|cool)\b[\s!.]*$/i, 'thanks'],
    [/\b(who are you|what are you|what can you do|are you (a )?(bot|human|ai|real))\b/i, 'about'],
    [/\b(human|real person|talk to (an? )?(advisor|adviser|counsellor|counselor|agent|someone|person)|call me|book (a )?(call|session|counselling|counseling|appointment)|speak to)\b/i, 'advisor']
  ];

  // "What's your number?", "Where is your office?": answered from the page's own contact details.
  var CONTACT_Q = /\b(phone|(your|phone|contact|whats ?app|mobile) number|whats ?app|e-?mail|email address|contact (you|details|info|number)|how (can|do) i (contact|reach)|your (office|offices|address|website|location)|where (is|are) (your|the) (office|offices)|where are you (based|located)|website)\b/i;

  function contactAnswer() {
    var tel = document.querySelector('a[href^="tel:"]'), mail = document.querySelector('a[href^="mailto:"]');
    var web = [].slice.call(document.querySelectorAll('a[href*="tuteeconnect.com"]')).filter(function (a) { return /^www\./i.test(a.textContent.trim()); })[0];
    var bits = [];
    if (tel) bits.push('Phone and WhatsApp: **' + clean(tel.textContent) + '**');
    if (mail) bits.push('Email: **' + clean(mail.textContent) + '**');
    if (web) bits.push('Website: **' + clean(web.textContent) + '**');
    var text = 'You can reach Tutee Connect here:\n' + bits.join('\n') + (contact.offices ? '\n\nOur offices: ' + contact.offices.replace(/^Offices:?\s*/i, '') : '');
    return { type: 'contact', text: text };
  }

  /* ------------------------------------------------------------------ *
   * Understanding the question: typos, institutions, subjects, follow-ups
   * ------------------------------------------------------------------ */
  // Edit distance where swapping two neighbouring letters ("studnet") counts as
  // one edit, giving up once it passes max.
  function lev(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    var pp = [], prev = [], cur, i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++) {
      cur = [i]; var low = i;
      for (j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], pp[j - 2] + 1);
        if (cur[j] < low) low = cur[j];
      }
      if (low > max) return max + 1;
      pp = prev; prev = cur;
    }
    return prev[b.length];
  }

  // An unknown word becomes the closest word the site uses ("scholarhsip",
  // "accomodation", "trinty"), when it is close enough to be a typo.
  var vocab = null;
  function fixTypos(q) {
    if (!vocab) {
      var extra = {};
      Object.keys(ALIASES).concat(Object.keys(ALIASES).map(function (k) { return ALIASES[k]; })).join(' ').split(' ')
        .concat(cities.join(' ').split(' ')).forEach(function (w) { if (w) extra[w] = 1; });
      Object.keys(SYN).forEach(function (w) { extra[w] = 1; });
      vocab = { list: Object.keys(df).concat(Object.keys(extra)).filter(function (w) { return w.length >= 4 && !/^\d/.test(w); }), known: extra };
    }
    return q.replace(/[A-Za-z]{4,}/g, function (w) {
      var lw = w.toLowerCase();
      if (STOPSET[lw] || df[stem(lw)] || vocab.known[lw] || SYN[stem(lw)]) return w;
      var max = lw.length >= 8 ? 2 : 1, best = null, bestD = max + 1, bestDf = -1;
      vocab.list.forEach(function (v) {
        if (Math.abs(v.length - lw.length) > max || v[0] !== lw[0] && v[1] !== lw[1]) return;
        var d = lev(lw, v, max);
        if (d < bestD || (d === bestD && (df[v] || 0) > bestDf)) { best = v; bestD = d; bestDf = df[v] || 0; }
      });
      return best && bestD <= max ? best : w;
    });
  }

  // Institutions named in the question: full names and the short names people type.
  // A town name alone ("Limerick") means the town, not its university.
  function unisIn(lq) {
    var f = ' ' + fold(lq) + ' ', hits = [];
    unis.forEach(function (x) {
      if (x.core.length >= 8 && f.indexOf(' ' + x.core + ' ') > -1) hits.push({ x: x, at: f.indexOf(' ' + x.core + ' '), len: x.core.length });
    });
    Object.keys(ALIASES).forEach(function (k) {
      ALIASES[k].split(' ').forEach(function (a) {
        if (cities.indexOf(a) > -1 || f.indexOf(' ' + a + ' ') < 0) return;
        unis.forEach(function (x) { if (fold(x.u.name).indexOf(k) > -1) hits.push({ x: x, at: f.indexOf(' ' + a + ' '), len: a.length }); });
      });
    });
    // "university college dublin" also contains other names: keep the longest at each spot
    hits.sort(function (a, b) { return a.at - b.at || b.len - a.len; });
    var out = [], end = -1;
    hits.forEach(function (h) {
      if (h.at < end || out.indexOf(h.x) > -1) return;
      out.push(h.x); end = h.at + h.len + 1;
    });
    return out;
  }
  // Places people name instead of a town ("near Temple Bar"), and the town on our directory they are in or nearest to.
  var NEAR = /\b(near|nearby|close to|closest to|nearest|next to|walking distance|distance from|around)\b/;
  var LANDMARKS = [
    [/\b(temple bar|trinity|guinness|st\.? stephen'?s green|grafton street|o'?connell street|phoenix park|croke park|dublin castle|the spire|ha'?penny bridge|docklands|aviva|dublin airport)\b/, 'dublin', 'Dublin'],
    [/\b(english market|blarney|cobh|fota|cork airport)\b/, 'cork', 'Cork'],
    [/\b(eyre square|salthill|connemara|aran islands|spanish arch)\b/, 'galway', 'Galway'],
    [/\b(king john'?s castle|bunratty|shannon)\b/, 'limerick', 'Limerick'],
    [/\b(ring of kerry|killarney national park|muckross)\b/, 'killarney', 'Killarney'],
    [/\b(waterford crystal|house of waterford)\b/, 'waterford', 'Waterford']
  ];
  function landmarkIn(lq) { for (var i = 0; i < LANDMARKS.length; i++) if (LANDMARKS[i][0].test(lq)) return LANDMARKS[i]; return null; }
  function cityIn(lq) {
    return cities.filter(function (c) { return new RegExp('\\b' + c + '\\b').test(lq); })
      .sort(function (a, b) { return b.length - a.length; })[0] || '';
  }

  // Subjects as students say them, and how the directory lists them.
  var SUBJECTS = [
    // "IT" only counts in capitals (see subjectIn), so "is it ranked?" is not about computing
    ['computing', 'Computing and IT', /\b(cs|ict|computers?|computing|comp sci|software|coding|programming|data|analytics|ai|artificial intelligence|machine learning|cyber ?security|cyber|tech|technology|fintech)\b/, /comput|software|data|cyber|fintech|robotics|game design/i],
    ['business', 'Business and management', /\b(business|mba|bba|management|marketing|commerce|finance|accounting|accountancy|economics|entrepreneurship)\b/, /business|management|marketing|accounting|finance|fintech/i],
    ['engineering', 'Engineering', /\b(engineering|engineer|mechanical|civil|electrical|electronics?|robotics)\b/, /engineering|robotics/i],
    ['medicine', 'Medicine and health', /\b(medicine|medical|mbbs|doctor|surgery|health|healthcare|public health|physio|physiotherapy)\b/, /medicine|health|physio/i],
    ['nursing', 'Nursing', /\b(nursing|nurse|midwifery)\b/, /nursing/i],
    ['pharmacy', 'Pharmacy', /\b(pharmacy|pharmaceutical|pharma)\b/, /pharma/i],
    ['law', 'Law', /\b(law|legal|llb|llm|barrister|criminology)\b/, /law|legal|criminology/i],
    ['design', 'Art, design and media', /\b(design|art|arts|animation|film|media|music|creative|architecture|journalism|photography|games?)\b/, /design|art|animation|film|media|music|architecture|journalism|creative/i],
    ['psychology', 'Psychology', /\b(psychology|counselling|psychotherapy)\b/, /psycholog|counselling|psychotherapy/i],
    ['education', 'Education and teaching', /\b(education|teaching|teacher)\b/, /education|teaching/i],
    ['hospitality', 'Hospitality and tourism', /\b(hospitality|hotel|tourism|culinary|chef)\b/, /hospitality|hotel/i],
    ['agriculture', 'Agriculture and food science', /\b(agriculture|agri|farming|food science|food|marine)\b/, /agricult|food|marine/i],
    ['english', 'English language courses', /\b(english (course|courses|language|classes)|language school|learn english)\b/, /english language/i]
  ];
  var TYPE_RANK = { 'University': 0, 'Technological University': 1, 'Specialist': 2, 'Institute of Technology': 3, 'College': 4, 'Language School': 5 };
  function subjectIn(lq, raw) {
    if (/\bIT\b/.test(raw) || /\bi\.t\.?(\s|$)/.test(lq)) return SUBJECTS[0];
    for (var i = 0; i < SUBJECTS.length; i++) if (SUBJECTS[i][2].test(lq)) return SUBJECTS[i];
    return null;
  }
  function count(x) { return parseInt(String(x.u.programmes).replace(/,/g, ''), 10) || 0; }
  function shortName(x) { return x.u.name.split(/,| - /)[0]; }

  function uniProfile(x, facet) {
    var u = x.u, n = shortName(x);
    var rank = u.ranked ? 'ranked **#' + u.rank + ' in Ireland** in the QS World University Rankings: Europe 2026' : 'not in the QS Europe 2026 ranking (only 12 Irish institutions are)';
    var text;
    if (facet === 'rank') text = '**' + n + '** is ' + rank + '.';
    else if (facet === 'where') text = '**' + n + '** is in **' + u.location + '**.';
    else if (facet === 'subjects') text = '**' + n + '** has **' + u.programmes + '** programmes on Ireland\'s official registers for international students. It is known for ' + u.programs + '.';
    else text = '**' + u.name + '**\n- ' + u.type + ' in ' + u.location + '\n- ' + u.programmes + ' eligible programmes for international students\n- Known for: ' + u.programs + '\n- ' + rank.charAt(0).toUpperCase() + rank.slice(1);
    var other = unis.filter(function (y) { return y !== x && y.u.ranked; })[0];
    return { type: 'answer', text: text, sections: [{ id: 'directory', name: 'Universities directory', page: 'universities' }],
      suggest: [facet === 'rank' ? 'What is ' + n + ' known for?' : 'Is ' + n + ' ranked?', 'Compare ' + n + ' and ' + shortName(other)] };
  }

  function compare(list) {
    list = list.slice(0, 3);
    return { type: 'answer', sections: [{ id: 'directory', name: 'Universities directory', page: 'universities' }],
      text: '**' + list.map(shortName).join(' vs ') + '**\n' + list.map(function (x) {
        var u = x.u;
        return '- **' + shortName(x) + ':** ' + u.type.toLowerCase() + ' in ' + x.city + ', ' + u.programmes + ' programmes, ' +
          (u.ranked ? 'QS Europe #' + u.rank + ' in Ireland' : 'not QS ranked') + '. Known for ' + u.programs + '.';
      }).join('\n') + '\nThe right one depends on your course, marks and budget. A counsellor can weigh them up with you for free.',
      suggest: ['Request a callback'] };
  }

  function subjectAnswer(s, city) {
    var pool = unis.filter(function (x) { return s[3].test(x.u.programs) && (!city || x.city.toLowerCase() === city) && (s[0] === 'english' || x.u.type !== 'Language School'); });
    var where = city ? ' in ' + city.charAt(0).toUpperCase() + city.slice(1) : ' in Ireland';
    if (!pool.length) return { type: 'answer', text: 'Our directory has no institution' + where + ' listed for ' + s[1] + '. Try another city, or ask a counsellor: many institutions teach more than the subjects they are best known for.',
      sections: [{ id: 'directory', name: 'Universities directory', page: 'universities' }], suggest: [s[1] + ' in Dublin', 'Request a callback'] };
    pool.sort(function (a, b) {
      return (a.u.ranked ? a.u.rank : 99) - (b.u.ranked ? b.u.rank : 99) || TYPE_RANK[a.u.type] - TYPE_RANK[b.u.type] || count(b) - count(a);
    });
    var top = pool.slice(0, 8);
    return { type: 'answer', sections: [{ id: 'directory', name: 'Universities directory', page: 'universities' }],
      text: (pool.length === 1 ? 'One institution' : pool.length + ' institutions') + where + (pool.length === 1 ? ' is' : ' are') + ' known for **' + s[1] + '**' + (pool.length > 8 ? '. The strongest, ranked first:' : ':') + '\n' +
        top.map(function (x) { return '- **' + shortName(x) + '** (' + x.city + (x.u.ranked ? ', QS #' + x.u.rank + ' in Ireland' : '') + ')'; }).join('\n') +
        '\nThe best fit depends on your marks, budget and goals, which a counsellor maps out on the free call.',
      suggest: ['Tell me about ' + shortName(top[0])].concat(top[1] ? ['Compare ' + shortName(top[0]) + ' and ' + shortName(top[1])] : []).concat(city ? [] : [s[1] + ' in Cork']) };
  }

  // Intakes: the site gives no dates, so say what's usual and hand over ("programs in the January intake").
  // A month next to work is about holiday work hours, not a start date.
  var MONTH = /\b(jan\w*|feb\w*|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b(?:in|from|for|the) (may)\b/;
  var MONTHS = { jan: 'January', feb: 'February', mar: 'March', apr: 'April', may: 'May', jun: 'June', jul: 'July', aug: 'August', sep: 'September', oct: 'October', nov: 'November', dec: 'December' };
  function intakeAnswer(lq) {
    if (/\b(work\w*|jobs?|hours)\b/.test(lq)) return null;
    var m = MONTH.exec(lq), mon = m && MONTHS[(m[1] || m[2]).slice(0, 3)];
    var general = /\b(intakes?|intak\w*|in takes?|start dates?|semesters?)\b/.test(lq);
    if (!(m ? general || /\b(start\w*|begin\w*|commenc\w*|batch|session|programmes?|programs?|courses?|admissions?|classes)\b/.test(lq) : general)) return null;
    var text;
    if (!mon) text = 'Ireland\'s main intake is **September**: most undergraduate and postgraduate courses start then. Some universities and colleges also take students in **January or February**, mostly for selected postgraduate (master\'s) courses. Each institution sets its own application deadlines.';
    else if (/^(August|September|October)$/.test(mon)) text = '**September** is the main intake in Ireland: most undergraduate and postgraduate courses start then. Each institution sets its own application deadlines, and popular courses fill early.';
    else if (/^(January|February|March)$/.test(mon)) text = 'Some Irish universities and colleges have a **January/February** intake, mostly for selected postgraduate (master\'s) courses. Most courses start in **September**. Which programmes run in January changes every year, so I can\'t give you a reliable list here.';
    else text = 'Courses in Ireland mainly start in **September**, with a smaller **January/February** intake. A **' + mon + '** start isn\'t usual, so check with a counsellor before you plan around it.';
    ctx = { uni: null, subject: null, city: '', facet: '' };
    return { type: 'answer', text: text + '\n\nA counsellor can confirm the current intakes and deadlines for your course on the free call.',
      sections: [{ id: 'contact', name: SECTION_NAMES.contact, page: 'home' }], suggest: ['Request a callback'] };
  }

  // Questions this site can't answer reliably (distances and travel times, whether your marks are enough, what can
  // still start next month, the best area to live, a university's exact English score): say so, then hand over.
  var NEEDS_COUNSELLOR = [
    [/\b(how far|distance (from|to|between)|how long (does it|will it|would it|to) (take|get|reach|travel|commute)|commut\w*|by (train|bus|metro|tram|mrt|subway|tube|car)|travel time|minutes? (from|to|away)|km (from|to|away)|close to the city|far from)\b/, null,
      'I can\'t give reliable distances or travel times: they depend on the exact campus and where you\'d live.'],
    [/\b(next|this|coming) (month|week|few weeks)\b|\bstart\w* (soon|immediately|asap|right away)\b|\b(still|currently) (open|accepting)\b/, null,
      'Which courses can still take you that soon depends on each university\'s current deadlines and places, which change all the time.'],
    [/\b\d{2}(\.\d+)? ?(%|percent)|\b(percentage|marks|cgpa|gpa|backlogs?|gap year|study gap|year gap|education gap)\b/, /\b(admission|admit|get in|get into|eligib\w*|accept\w*|apply|qualify|enough|chances?|possible)\b/,
      'Whether your marks are enough depends on the university, the course and the rest of your profile, so I won\'t guess.'],
    [/\b(best|good|safe|safest|cheap\w*|nice) (area|areas|suburbs?|neighbou?rhoods?|localit(y|ies)|places?|part of (the )?(city|town)) (to (live|stay)|for students?)\b|\bwhere (should|can|do) (i|students) (live|stay)\b/, null,
      'The best area to live depends on your campus, budget and lifestyle, and this site doesn\'t compare neighbourhoods.'],
    [/\b(ielts|pte|toefl|duolingo)\b.*\b(scores?|bands?|minimum)\b|\b(scores?|bands?|minimum)\b.*\b(ielts|pte|toefl|duolingo)\b/, null,
      'Each university sets its own minimum English test score, and it varies by course, so I won\'t quote one.'],
    [/\b(distance learning|distance education|online (course|courses|degree|degrees|study|studies|classes|programmes?|programs?)|study online|studying online|remote study)\b/, null,
      'A student visa is for full-time study on campus, and this site does not cover online or distance courses.']
  ];
  // "How do I apply?" (to a university, not for a visa, loan or scholarship): how applying works here, then hand over
  var APPLY_Q = /\b(how (do|can|should|would|will) (i|we|one|students?) apply|how to apply|application process|admission process|applying (to|for) (a |an |the )?(universit\w*|unis?|college\w*|courses?|programm?e?s?|admissions?)|apply (to|for) (a |an |the )?(universit\w*|unis?|college\w*|courses?|programm?e?s?|admissions?))\b/;
  function asksHowToApply(q) { return APPLY_Q.test(q) && !/\b(visa|pass|permit|stamp|loans?|scholarships?|bursar\w*|grants?|jobs?|work)\b/.test(q); }
  function needsCounsellor(q) {
    for (var i = 0; i < NEEDS_COUNSELLOR.length; i++) { var n = NEEDS_COUNSELLOR[i]; if (n[0].test(q) && (!n[1] || n[1].test(q))) return n[2]; }
    return '';
  }
  // "universities near <a place we know>" is answered by its city instead
  function namesLandmark(q) { return /\b(near|nearby|nearest|close to|closest to|next to|around|walking distance)\b/.test(q) && LANDMARKS.some(function (l) { return l.some(function (x) { return x instanceof RegExp && x.test(q); }); }); }

  var FACETS = [
    ['rank', /\b(rank|ranked|ranking|rankings|qs|position)\b/],
    ['where', /\b(where|location|located|which city|what city|address)\b/],
    ['subjects', /\b(known for|famous for|good for|subjects?|courses?|programmes?|programs?|offer|teach|study there)\b/]
  ];
  function facetIn(lq) { for (var i = 0; i < FACETS.length; i++) if (FACETS[i][1].test(lq)) return FACETS[i][0]; return ''; }

  // What the conversation is about, so "is it ranked?" and "what about Cork?" make sense.
  var ctx = { uni: null, subject: null, city: '', facet: '' };
  var PRONOUN = /\b(it|its|it's|this (one|university|college|uni|place)|that (one|university|college|uni)|there|they|them)\b/;
  var FOLLOW = /^\s*(and|what about|how about|same for|what of)\b/i;

  // Structured answers from the directory data; null when the question is not that kind.
  function directAnswer(lq, raw) {
    var named = unisIn(lq), city = cityIn(lq), subj = subjectIn(lq, raw), facet = facetIn(lq);
    var follow = FOLLOW.test(lq) && lq.split(/\s+/).length <= 6;
    var offTopic = /\b(visa|permit|stamp|loan|scholarships?|work|job|jobs|stay back|pr|ielts|pte|toefl|accommodation|rent|insurance|fees?|cost)\b/.test(lq);

    if (named.length >= 2 || (named.length === 1 && /\b(compare|vs|versus|or|difference)\b/.test(lq) && ctx.uni && ctx.uni !== named[0])) {
      var list = named.length >= 2 ? named : [ctx.uni, named[0]];
      ctx = { uni: null, subject: null, city: '', facet: '' };
      return compare(list);
    }
    if (named.length === 1 && !offTopic) {
      ctx = { uni: named[0], subject: null, city: '', facet: facet };
      return uniProfile(named[0], facet);
    }
    // "is it ranked?", "where is it?", "and UCD?" carry on from the last institution
    if (!named.length && ctx.uni && !offTopic && (facet || follow) && (PRONOUN.test(lq) || follow) && !city && !subj) {
      ctx.facet = facet || ctx.facet;
      return uniProfile(ctx.uni, ctx.facet);
    }
    var listy = /\b(best|top|good|which|what|where|recommend|suggest|list|any|universit|college|institut|unis?|study|course|courses|programmes?|degree|masters?|bachelors?)\b/.test(lq);
    if (subj && !offTopic && (listy || follow)) {
      ctx = { uni: null, subject: subj, city: city, facet: '' };
      return subjectAnswer(subj, city);
    }
    // "what about Cork?" after a subject list: the same subject in that town
    if (follow && city && ctx.subject) {
      ctx.city = city;
      return subjectAnswer(ctx.subject, city);
    }
    if (follow && city) {
      var cl = passages.filter(function (p) { return p.city === city; })[0];
      if (cl) { ctx = { uni: null, subject: null, city: city, facet: '' }; return { type: 'answer', text: cl.text, sections: [cl.sec] }; }
    }
    return null;
  }

  function answer(question) {
    var q = String(question || '').trim();
    for (var i = 0; i < SMALLTALK.length; i++) {
      if (SMALLTALK[i][0].test(q)) return Promise.resolve({ type: SMALLTALK[i][1] });
    }
    if (CONTACT_Q.test(q)) return build().then(contactAnswer);
    return build().then(function () {
      q = fixTypos(q);
      var lq = q.toLowerCase();
      var asked = String(question).toLowerCase();
      var unsure = !namesLandmark(asked) && needsCounsellor(asked);
      if (unsure) {
        ctx = { uni: null, subject: null, city: '', facet: '' };
        return { type: 'answer', text: unsure + ' A counsellor can check it for you on the free call.', sections: [{ id: 'contact', name: SECTION_NAMES.contact, page: 'home' }], suggest: ['Request a callback'] };
      }
      if (asksHowToApply(asked)) {
        ctx = { uni: null, subject: null, city: '', facet: '' };
        return { type: 'answer', text: 'You apply to each Irish university or college directly, usually online through its own application portal, for the course you choose. Once you have an offer, you apply for your Irish study visa online (AVATS).\n\nEntry requirements and deadlines differ by institution and course, so a counsellor checks them for your shortlist on the free call.',
          sections: [{ id: 'contact', name: SECTION_NAMES.contact, page: 'home' }], suggest: ['Request a callback'] };
      }
      var byMonth = intakeAnswer(lq);
      if (byMonth) return byMonth;
      var direct = directAnswer(lq, q);
      if (direct) return direct;
      // Questions about institutions in a named town get that town's list;
      // "how many" or "all universities" without a town get the directory count.
      var aboutInst = /\b(universit|college|institut|unis?\b|schools?\b|providers?\b|study options)/i.test(q);
      if (aboutInst) {
        var city = cityIn(lq);
        // the landmark is read from the question as typed too, as typo fixing may have changed its words
        var near = NEAR.test(lq), spot = !city && near && (landmarkIn(lq) || landmarkIn(String(question).toLowerCase()));
        if (spot) city = spot[1];
        var listy = /\b(how many|which|what|list|any|all|in)\b/.test(lq) || near;
        if (city && listy) {
          var cl = passages.filter(function (p) { return p.city === city; })[0];
          if (cl) { ctx = { uni: null, subject: null, city: city, facet: '' }; return { type: 'answer', text: (spot ? 'The nearest institutions on our directory are in **' + spot[2] + '**. This goes by town, not travel time; a counsellor can help with the commute.\n\n' : '') + cl.text, sections: [cl.sec], suggest: ['Computing and IT in ' + city.charAt(0).toUpperCase() + city.slice(1)] }; }
        }
        // a place we cannot match to a town: ask for the town rather than guess
        if (near && !city) return { type: 'contact', text: 'I can list institutions by town (for example Dublin, Cork, Galway or Limerick), but I didn\'t recognise the place in your question. Tell me the town, or ask one of our counsellors:' };
        // "language schools", "technological universities": that type's list
        var type = !city && types.filter(function (x) { return x !== 'university' && x !== 'college' && lq.indexOf(x.replace(/y$/, '')) > -1; })[0];
        if (type) {
          var tl = passages.filter(function (p) { return p.instType === type; })[0];
          if (tl) return { type: 'answer', text: tl.text, sections: [tl.sec] };
        }
        if (!city && (/\bhow many\b/.test(lq) || /\b(all|every|full list|directory|browse)\b/.test(lq))) {
          var cp = passages.filter(function (p) { return p.count; })[0];
          if (cp) return { type: 'answer', text: cp.text + ' You can search and filter all of them on our universities page.', sections: [cp.sec] };
        }
      }
      var terms = queryTerms(q);
      if (!terms.length) return { type: 'unclear' };
      var wantsStories = /\b(review|reviews|testimonial|testimonials|stories|story|students say|feedback|experience|legit|trust)\b/i.test(q);
      var ranked = passages.map(function (p) { var r = score(p, terms, wantsStories); return { p: p, s: r.s, cover: r.cover }; })
        .filter(function (r) { return r.s > 0; })
        .sort(function (a, b) { return b.s - a.s; });
      var top = ranked[0];
      // FAQ questions near the top make good "you could also ask" suggestions.
      function asks(from, skip) {
        var seen = {};
        return ranked.slice(0, 10).filter(function (r) {
          if (r.p.kind !== 'faq' || r.s < from || r.cover < 0.5 || skip.indexOf(r) > -1 || seen[r.p.title]) return false;
          seen[r.p.title] = 1; return /\?$/.test(r.p.title);
        }).slice(0, 2).map(function (r) { return r.p.title; });
      }
      // How much of the question an answer must cover. Short questions must be
      // matched almost fully; a word the site never uses at all ("deadline",
      // "12th") means the site probably does not cover the question.
      var needCover = terms.length === 1 ? 1 : terms.length === 2 ? 0.75 : 0.5;
      var unknown = terms.filter(function (qt) { return !qt.forms.some(function (f) { return df[f.t]; }); }).length;
      if (unknown) needCover = Math.max(needCover, 0.75);
      var money = MONEY.test(q);
      // Some words carry the whole question: an answer that never mentions them is off topic,
      // however well it matches the rest ("programs in the January intake" is not about work hours).
      var anchorMiss = ANCHORS.some(function (a) { return a[0].test(lq) && !a[1].test(top ? top.p.title + ' ' + top.p.text : ''); });
      if (!top || top.s < 2.2 || top.cover < needCover || anchorMiss) {
        return { type: 'notfound', money: money, suggest: top ? asks(top.s * 0.5, []) : [] };
      }
      // A second passage when it is nearly as relevant and adds something new.
      var picks = [top];
      for (var k = 1; k < Math.min(ranked.length, 8) && picks.length < 2; k++) {
        var r = ranked[k];
        if (r.s < top.s * 0.65 || r.cover < needCover) break;
        var dup = picks.some(function (x) {
          return x.p.text === r.p.text || x.p.text.indexOf(r.p.text.slice(0, 60)) > -1 || r.p.text.indexOf(x.p.text.slice(0, 60)) > -1 ||
            // the same institution from the board and from the directory
            (x.p.kind === 'uni' && r.p.kind === 'uni' && x.p.title.slice(0, 18).toLowerCase() === r.p.title.slice(0, 18).toLowerCase());
        });
        if (!dup) picks.push(r);
      }
      var parts = picks.map(function (r, n) { return excerpt(r.p, terms, n ? 240 : 380); });
      var secs = [];
      picks.forEach(function (r) {
        if (r.p.sec && !secs.some(function (s) { return s.id === r.p.sec.id && s.page === r.p.sec.page; })) secs.push(r.p.sec);
      });
      // an institution answered from the page becomes the subject of follow-ups
      var uniHit = picks[0].p.kind === 'uni' && unisIn(picks[0].p.title.toLowerCase())[0];
      ctx = { uni: uniHit || null, subject: null, city: '', facet: '' };
      return { type: 'answer', text: parts.join('\n\n'), sections: secs, money: money, suggest: asks(top.s * 0.35, picks) };
    });
  }

  window.TC_chatBrain = {
    answer: answer,
    warm: function () { return build(); },
    // forget what the conversation was about (the chat's "new chat" button)
    reset: function () { ctx = { uni: null, subject: null, city: '', facet: '' }; },
    // main.js hands over content that lives in its own data (the settlement stops)
    addPassages: function (list) {
      list.forEach(add);
      if (built) index();
    }
  };
})();
