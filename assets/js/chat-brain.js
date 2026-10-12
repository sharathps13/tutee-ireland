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

   It never asks for or stores personal details.
   Exposes window.TC_chatBrain = { answer(question) -> Promise<reply>, addPassages(list) }.
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
    'intake intakes deadline deadlines start september january'
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
  var passages = [], built = false, buildP = null, contact = {}, cities = [], types = [];

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
    '[aria-hidden="true"], form, .skip, .band--news, .deck__ui, .tray';

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
        var names = [].slice.call(w.querySelectorAll('img[alt]')).map(function (i) { return i.getAttribute('alt'); }).filter(Boolean);
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
        if (!tf) return;
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

  var MONEY = /\b(how much|cost|costs|fee|fees|tuition|price|prices|expensive|cheap|budget|salary|salaries|wage|wages|pay|euro|euros|rupees?|lakhs?|inr)\b|[€£$₹]/i;
  var SMALLTALK = [
    [/^\s*(hi|hello|hey|hiya|good (morning|afternoon|evening)|namaste)\b[\s!.]*$/i, 'greet'],
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

  function answer(question) {
    var q = String(question || '').trim();
    for (var i = 0; i < SMALLTALK.length; i++) {
      if (SMALLTALK[i][0].test(q)) return Promise.resolve({ type: SMALLTALK[i][1] });
    }
    if (CONTACT_Q.test(q)) return build().then(contactAnswer);
    return build().then(function () {
      // Questions about institutions in a named town get that town's list;
      // "how many" or "all universities" without a town get the directory count.
      var lq = q.toLowerCase();
      var aboutInst = /\b(universit|college|institut|unis?\b|schools?\b|providers?\b|study options)/i.test(q);
      if (aboutInst) {
        var city = cities.filter(function (c) { return new RegExp('\\b' + c + '\\b').test(lq); })[0];
        var listy = /\b(how many|which|what|list|any|all|in)\b/.test(lq);
        if (city && listy) {
          var cl = passages.filter(function (p) { return p.city === city; })[0];
          if (cl) return { type: 'answer', text: cl.text, sections: [cl.sec] };
        }
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
      // How much of the question an answer must cover. Short questions must be
      // matched almost fully; a word the site never uses at all ("deadline",
      // "12th") means the site probably does not cover the question.
      var needCover = terms.length === 1 ? 1 : terms.length === 2 ? 0.75 : 0.5;
      var unknown = terms.filter(function (qt) { return !qt.forms.some(function (f) { return df[f.t]; }); }).length;
      if (unknown) needCover = Math.max(needCover, 0.75);
      var money = MONEY.test(q);
      if (!top || top.s < 2.2 || top.cover < needCover) {
        return { type: 'notfound', money: money };
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
      return { type: 'answer', text: parts.join('\n\n'), sections: secs, money: money };
    });
  }

  window.TC_chatBrain = {
    answer: answer,
    warm: function () { return build(); },
    // main.js hands over content that lives in its own data (the settlement stops)
    addPassages: function (list) {
      list.forEach(add);
      if (built) index();
    }
  };
})();
