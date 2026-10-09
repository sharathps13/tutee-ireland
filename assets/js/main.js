/* ==========================================================================
   Tutee Connect — Ireland
   Every interaction on index.html and universities.html. Vanilla JS, no
   dependencies (the CSP allows same-origin scripts only). Loaded with `defer`.
   ========================================================================== */
(function () {
  'use strict';

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var clamp = function (v, a, b) { return Math.min(b, Math.max(a, v)); };
  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function icon(id) { return '<svg aria-hidden="true"><use href="#' + id + '"/></svg>'; }

  /* ------------------------------------------------------------------ *
   * Navigation helpers
   * ------------------------------------------------------------------ */
  function isHome() { return !!document.getElementById('home'); }

  function goToSection(id) {
    if (id === 'top') {
      if (isHome()) window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      else window.location.href = './index.html';
      return;
    }
    var t = document.getElementById(id);
    if (t) { t.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' }); return; }
    window.location.href = './index.html#' + id;
  }

  function initScrollLinks() {
    $$('[data-scroll-to]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        closeDrawer();
        var id = el.getAttribute('data-scroll-to');
        setTimeout(function () { goToSection(id); }, 30);
      });
    });
    $$('[data-scroll-top]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Split headings into words for the rising-line reveal
   * ------------------------------------------------------------------ */
  function splitWords(el) {
    var n = 0;
    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var frag = document.createDocumentFragment();
          child.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            var w = document.createElement('span'); w.className = 'w';
            var inner = document.createElement('span'); inner.textContent = part;
            inner.style.setProperty('--i', n++);
            w.appendChild(inner); frag.appendChild(w);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    }
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    walk(el);
    // A gradient span can't clip through transformed children, so each word
    // carries the gradient itself.
    $$('.tri', el).forEach(function (p) {
      p.classList.remove('tri');
      $$('.w > span', p).forEach(function (s) { s.classList.add('tri'); });
    });
  }

  /* ------------------------------------------------------------------ *
   * Reveal on scroll (+ counters, stamps, ring)
   * ------------------------------------------------------------------ */
  function countUp(el) {
    var end = parseFloat(el.getAttribute('data-count'));
    var suffix = el.getAttribute('data-suffix') || '';
    if (reduceMotion || isNaN(end)) { el.textContent = end + suffix; return; }
    var t0 = null, dur = 1600;
    function step(t) {
      if (!t0) t0 = t;
      var p = clamp((t - t0) / dur, 0, 1);
      var e = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(end * e) + suffix;
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }

  function initReveal() {
    $$('[data-split]').forEach(splitWords);
    var hero = $('[data-hero] [data-split]');
    if (hero) hero.style.setProperty('--base', '250ms');

    var targets = $$('[data-reveal], [data-split], [data-stamps], [data-ring], [data-count], [data-bento], [data-counsel]');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target.__revealTarget || e.target;
        el.classList.add('is-in');
        if (el.hasAttribute('data-count')) countUp(el);
        io.unobserve(e.target);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (el) {
      // A fully clipped element never registers as intersecting, so watch its parent.
      if (el.getAttribute('data-reveal') === 'clip' && el.parentElement) {
        el.parentElement.__revealTarget = el;
        io.observe(el.parentElement);
      } else io.observe(el);
    });
  }

  /* ------------------------------------------------------------------ *
   * Header, drawer
   * ------------------------------------------------------------------ */
  var drawer = null;
  function closeDrawer() {
    if (!drawer || !drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    var b = $('[data-menu-open]'); if (b) { b.setAttribute('aria-expanded', 'false'); b.focus(); }
    document.body.style.overflow = '';
  }
  function initDrawer() {
    drawer = $('[data-drawer]');
    var openBtn = $('[data-menu-open]');
    if (!drawer || !openBtn) return;
    openBtn.addEventListener('click', function () {
      drawer.classList.add('is-open');
      drawer.setAttribute('aria-hidden', 'false');
      openBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      var first = $('nav a', drawer); if (first) setTimeout(function () { first.focus(); }, 250);
    });
    $$('[data-menu-close]', drawer).forEach(function (b) { b.addEventListener('click', closeDrawer); });
    $$('nav a:not([data-scroll-to])', drawer).forEach(function (a) { a.addEventListener('click', closeDrawer); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  }

  /* ------------------------------------------------------------------ *
   * The scroll engine — one rAF loop drives every scroll-linked effect
   * ------------------------------------------------------------------ */
  var scrollers = [];
  function onScrollFrame(fn) { scrollers.push(fn); }
  function initScrollEngine() {
    var ticking = false;
    function run() {
      ticking = false;
      var y = window.scrollY, vh = window.innerHeight;
      for (var i = 0; i < scrollers.length; i++) scrollers[i](y, vh);
    }
    function req() { if (!ticking) { ticking = true; requestAnimationFrame(run); } }
    window.addEventListener('scroll', req, { passive: true });
    window.addEventListener('resize', req);
    window.addEventListener('load', req);
    run();
  }

  function initHeaderScroll() {
    var header = $('[data-header]');
    if (!header) return;
    var last = 0;
    onScrollFrame(function (y) {
      header.classList.toggle('is-scrolled', y > 20);
      var goingDown = y > last + 4, goingUp = y < last - 4;
      if (goingDown && y > 500 && !document.body.style.overflow) header.classList.add('is-hidden');
      else if (goingUp || y < 200) header.classList.remove('is-hidden');
      document.body.classList.toggle('hdr-hidden', header.classList.contains('is-hidden'));
      last = y;
    });
    header.addEventListener('focusin', function () { header.classList.remove('is-hidden'); });
  }

  function initProgress() {
    var rail = $('[data-rail]');
    var links = rail ? $$('li', rail) : [];
    var ids = links.map(function (li) { return $('a', li).getAttribute('data-scroll-to'); });
    var darks = $$('[data-dark]');
    var lastActive = -1, flashT = null;
    var navLinks = $$('[data-nav]');
    onScrollFrame(function (y, vh) {
      var max = document.documentElement.scrollHeight - vh;
      root.style.setProperty('--progress', max > 0 ? clamp(y / max, 0, 1).toFixed(4) : 0);
      if (!rail) return;
      var active = 0;
      ids.forEach(function (id, i) {
        var s = document.getElementById(id);
        if (s && s.getBoundingClientRect().top <= vh * 0.45) active = i;
      });
      links.forEach(function (li, i) {
        li.classList.toggle('is-active', i === active);
        li.classList.toggle('is-passed', i < active);
      });
      navLinks.forEach(function (a) { a.classList.toggle('is-current', a.getAttribute('data-nav') === ids[active]); });
      if (active !== lastActive) {
        // Name the new section briefly, then get out of the content's way.
        if (lastActive > -1) links.forEach(function (li) { li.classList.remove('flash'); });
        lastActive = active;
        clearTimeout(flashT);
        links[active].classList.add('flash');
        flashT = setTimeout(function () { links[active].classList.remove('flash'); }, 1600);
      }
      var mid = vh / 2, onDark = false;
      darks.forEach(function (d) {
        var r = d.getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) onDark = true;
      });
      rail.classList.toggle('on-dark-bg', onDark);
    });
  }

  /* ------------------------------------------------------------------ *
   * Hero: scroll parallax + the swipeable polaroid deck
   * ------------------------------------------------------------------ */
  function initHero() {
    var hero = $('[data-hero]');
    if (!hero) return;
    onScrollFrame(function (y) {
      var h = hero.offsetHeight || 1;
      if (y > h * 1.2) return;
      hero.style.setProperty('--p', clamp(y / h, 0, 1).toFixed(4));
    });
    initDeck();
  }

  function initDeck() {
    var deck = $('[data-deck]');
    if (!deck) return;
    var stage = $('[data-deck-stage]', deck);
    var cards = $$('.polaroid', stage);
    if (!cards.length) return;
    var dotsBox = $('[data-deck-dots]', deck);
    var place = $('[data-deck-place]', deck);
    var order = cards.map(function (_, i) { return i; });
    var POS = [
      { x: 0, y: 0, r: -2, s: 1 },
      { x: 16, y: -10, r: 5, s: .97 },
      { x: -16, y: 6, r: -7, s: .94 },
      { x: 10, y: 14, r: 8, s: .91 }
    ];
    var busy = false, auto = null, touched = false;

    dotsBox.innerHTML = cards.map(function (c, i) {
      return '<button type="button" aria-label="Show photo ' + (i + 1) + ': ' + esc($('figcaption span', c).textContent) + '"></button>';
    }).join('');
    var dots = $$('button', dotsBox);

    function lay() {
      order.forEach(function (ci, pos) {
        var c = cards[ci], p = POS[Math.min(pos, POS.length - 1)];
        c.style.setProperty('--tx', p.x + 'px');
        c.style.setProperty('--ty', p.y + 'px');
        c.style.setProperty('--rot', p.r);
        c.style.setProperty('--s', p.s);
        c.style.setProperty('--z', String(cards.length - pos));
        c.style.setProperty('--o', pos < POS.length ? 1 : 0);
        c.classList.toggle('is-top', pos === 0);
        c.setAttribute('aria-hidden', pos === 0 ? 'false' : 'true');
      });
      var top = order[0];
      dots.forEach(function (d, i) { d.setAttribute('aria-current', i === top ? 'true' : 'false'); });
      if (place) {
        place.classList.add('swap');
        setTimeout(function () { place.textContent = cards[top].getAttribute('data-line') || cards[top].getAttribute('data-place'); place.classList.remove('swap'); }, 200);
      }
    }

    function snapToBack(card) {
      order.push(order.shift());
      card.style.transition = 'none';
      card.classList.remove('is-dragging');
      lay();
      card.offsetWidth; // commit the jump before motion resumes
      card.style.transition = '';
    }

    // Throw the top photo off-stage, then slide it under the stack.
    function fling(dir) {
      if (busy) return;
      busy = true;
      var card = cards[order[0]];
      var w = stage.offsetWidth;
      card.classList.remove('is-dragging');
      card.style.setProperty('--tx', (dir * w * 1.25) + 'px');
      card.style.setProperty('--ty', '-40px');
      card.style.setProperty('--rot', dir * 26);
      card.style.setProperty('--o', 0);
      setTimeout(function () { snapToBack(card); busy = false; }, reduceMotion ? 0 : 420);
    }

    // Bring the bottom photo back to the top, entering from the left.
    function back() {
      if (busy) return;
      busy = true;
      var ci = order.pop();
      var card = cards[ci];
      card.style.transition = 'none';
      card.style.setProperty('--tx', (-stage.offsetWidth * 1.25) + 'px');
      card.style.setProperty('--rot', -26);
      card.style.setProperty('--o', 0);
      card.style.setProperty('--z', String(cards.length + 1));
      card.offsetWidth;
      card.style.transition = '';
      order.unshift(ci);
      lay();
      setTimeout(function () { busy = false; }, 420);
    }

    function goTo(i) {
      if (order[0] === i || busy) return;
      while (order[0] !== i) order.push(order.shift());
      lay();
    }

    function interacted() {
      if (touched) return;
      touched = true;
      deck.classList.add('is-touched');
      clearInterval(auto);
    }

    // Drag / swipe
    var drag = null;
    stage.addEventListener('pointerdown', function (e) {
      var card = e.target.closest('.polaroid');
      if (!card || !card.classList.contains('is-top') || busy) return;
      drag = { card: card, x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId };
      stage.setPointerCapture(e.pointerId);
    });
    stage.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      drag.moved = true;
      drag.card.classList.add('is-dragging');
      drag.card.style.setProperty('--tx', dx + 'px');
      drag.card.style.setProperty('--ty', (dy * 0.25) + 'px');
      drag.card.style.setProperty('--rot', -2 + dx * 0.07);
    });
    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag; drag = null;
      interacted();
      if (!d.moved) { fling(1); return; }
      var dx = e.clientX - d.x;
      var v = Math.abs(dx) / Math.max(1, performance.now() - d.t);
      if (Math.abs(dx) > 90 || v > 0.6) fling(dx > 0 ? 1 : -1);
      else { d.card.classList.remove('is-dragging'); lay(); }
    }
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); interacted(); fling(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); interacted(); back(); }
    });
    $('[data-deck-next]', deck).addEventListener('click', function () { interacted(); fling(1); });
    $('[data-deck-prev]', deck).addEventListener('click', function () { interacted(); back(); });
    dots.forEach(function (d, i) { d.addEventListener('click', function () { interacted(); goTo(i); }); });

    lay();
    if (!reduceMotion) {
      auto = setInterval(function () {
        if (document.hidden || drag) return;
        var r = stage.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) return;
        fling(1);
      }, 5200);
    }
  }

  function initMagnetic() {
    if (reduceMotion || !window.matchMedia('(pointer: fine)').matches) return;
    $$('[data-magnetic]').forEach(function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.25;
        var y = (e.clientY - r.top - r.height / 2) * 0.35;
        el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  /* ------------------------------------------------------------------ *
   * Why Ireland: expanding photo panels (auto-cycle until touched)
   * ------------------------------------------------------------------ */
  function initPanels() {
    var wrap = $('[data-panels]');
    if (!wrap) return;
    var panels = $$('.panel', wrap);
    var CYCLE = 6000, current = 0, timer = null, stopped = reduceMotion, visible = false;
    wrap.style.setProperty('--cycle', CYCLE + 'ms');

    function activate(i) {
      current = i;
      panels.forEach(function (p, j) {
        var on = j === i;
        p.classList.toggle('is-active', on);
        $('.panel__hit', p).setAttribute('aria-expanded', on ? 'true' : 'false');
        var bar = $('.panel__bar i', p);
        bar.style.animation = 'none'; bar.offsetWidth; bar.style.animation = '';
      });
    }
    function schedule() {
      clearTimeout(timer);
      if (stopped || !visible) { wrap.classList.remove('is-auto'); return; }
      wrap.classList.add('is-auto');
      timer = setTimeout(function () { activate((current + 1) % panels.length); schedule(); }, CYCLE);
    }
    function stop() { stopped = true; schedule(); }

    panels.forEach(function (p, i) {
      $('.panel__hit', p).addEventListener('click', function () { stop(); activate(i); });
      if (window.matchMedia('(hover: hover) and (min-width: 761px)').matches) {
        p.addEventListener('pointerenter', function () { stop(); activate(i); });
      }
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; schedule(); }, { threshold: 0.35 }).observe(wrap);
    }
    activate(0);
  }

  /* ------------------------------------------------------------------ *
   * Universities: departures board drives the boarding pass
   * ------------------------------------------------------------------ */
  var FLAP_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function flapTo(el, text, delay) {
    var cells = $$('b', el);
    cells.forEach(function (b, i) {
      var target = text.charAt(i);
      if (reduceMotion) { b.textContent = target; return; }
      var spins = 6 + i * 3 + Math.floor(Math.random() * 4);
      setTimeout(function tick() {
        b.classList.remove('flip'); b.offsetWidth; b.classList.add('flip');
        b.textContent = spins-- > 0 ? FLAP_CHARS.charAt(Math.floor(Math.random() * 26)) : target;
        if (spins >= 0) setTimeout(tick, 55);
      }, delay || 0);
    });
  }

  function initBoard() {
    var board = $('[data-board]');
    var pass = $('[data-pass]');
    if (!board || !pass) return;
    var rows = $$('.board__row', board);
    var f = function (k) { return $('[data-pass-' + k + ']', pass); };
    var COLORS = ['var(--shamrock)', 'var(--amber)', 'var(--claret)'];
    var current = 0;

    function fill(row) {
      f('code').textContent = row.getAttribute('data-code');
      f('city').textContent = row.getAttribute('data-city');
      f('name').textContent = row.getAttribute('data-name');
      f('rank').textContent = '#' + row.getAttribute('data-rank');
      var t = row.getAttribute('data-type');
      f('type').textContent = t === 'Technological University' ? 'Tech. Univ.' : t === 'Institute of Technology' ? 'Inst. of Tech.' : t;
      f('courses').textContent = row.getAttribute('data-courses');
      f('subjects').innerHTML = row.getAttribute('data-subjects').split(',').map(function (x) {
        return '<span>' + esc(x.trim()) + '</span>';
      }).join('');
      pass.style.setProperty('--pc', COLORS[(+row.getAttribute('data-rank') - 1) % 3]);
    }

    var phone = window.matchMedia('(max-width: 640px)');
    var passHome = pass.parentNode;
    var openOnPhone = true, busy = false;

    /* Phones: the pass lives under its row and opens/closes like a drawer.
       Height, fade and a slight drop are animated together. */
    function clearAnim() { pass.style.height = ''; pass.style.opacity = ''; pass.style.transform = ''; pass.style.overflow = ''; pass.style.transition = ''; }
    function expand(li, done) {
      li.appendChild(pass);
      if (reduceMotion) { clearAnim(); if (done) done(); return; }
      var h = pass.scrollHeight;
      pass.style.overflow = 'hidden';
      pass.style.height = '0px'; pass.style.opacity = '0'; pass.style.transform = 'translateY(-8px) scale(.98)';
      pass.offsetHeight;
      pass.style.transition = 'height .45s cubic-bezier(.22,1,.36,1), opacity .35s ease .05s, transform .45s cubic-bezier(.22,1,.36,1)';
      pass.style.height = h + 'px'; pass.style.opacity = '1'; pass.style.transform = 'none';
      setTimeout(function () { clearAnim(); if (done) done(); }, 470);
    }
    function collapse(done) {
      if (reduceMotion || pass.parentNode === passHome) { passHome.appendChild(pass); clearAnim(); if (done) done(); return; }
      pass.style.overflow = 'hidden';
      pass.style.height = pass.offsetHeight + 'px';
      pass.offsetHeight;
      pass.style.transition = 'height .32s cubic-bezier(.65,0,.35,1), opacity .2s ease, transform .32s cubic-bezier(.65,0,.35,1)';
      pass.style.height = '0px'; pass.style.opacity = '0'; pass.style.transform = 'translateY(-6px) scale(.98)';
      setTimeout(function () { passHome.appendChild(pass); clearAnim(); if (done) done(); }, 330);
    }
    function placePass() {
      if (!phone.matches) { if (pass.parentNode !== passHome) passHome.appendChild(pass); clearAnim(); return; }
      var target = openOnPhone ? rows[current].parentNode : passHome;
      if (pass.parentNode !== target) target.appendChild(pass);
    }
    function markRows() {
      rows.forEach(function (r, j) {
        var on = j === current && (!phone.matches || openOnPhone);
        r.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (phone.matches) r.setAttribute('aria-expanded', on ? 'true' : 'false'); else r.removeAttribute('aria-expanded');
      });
    }
    function selectPhone(i) {
      if (busy) return;
      busy = true;
      if (i === current && openOnPhone) {            // tap the open one again: close it
        openOnPhone = false; markRows();
        collapse(function () { busy = false; });
        return;
      }
      var wasOpen = openOnPhone;
      current = i; openOnPhone = true; markRows();
      var open = function () { fill(rows[i]); expand(rows[i].parentNode, function () { busy = false; }); };
      if (wasOpen && pass.parentNode !== passHome) collapse(open); else open();
    }
    function select(i, animate) {
      if (phone.matches && animate) { selectPhone(i); return; }
      current = i; markRows();
      if (animate && !reduceMotion) {
        // cross-fade the details: out, swap, back in
        pass.classList.add('is-swapping');
        setTimeout(function () { fill(rows[i]); pass.classList.remove('is-swapping'); }, 220);
      } else fill(rows[i]);
    }

    rows.forEach(function (r, i) {
      r.addEventListener('click', function () {
        if (!phone.matches && i === current) return;
        select(i, true);
        if (phone.matches) {
          var rr = rows[i].getBoundingClientRect();
          if (rr.top < 70) window.scrollBy({ top: rr.top - 80, behavior: reduceMotion ? 'auto' : 'smooth' });
        } else if (window.matchMedia('(max-width: 960px)').matches) {
          pass.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
        }
      });
      r.addEventListener('keydown', function (e) {
        var n = null;
        if (e.key === 'ArrowDown') n = Math.min(rows.length - 1, i + 1);
        if (e.key === 'ArrowUp') n = Math.max(0, i - 1);
        if (n !== null) { e.preventDefault(); rows[n].focus(); select(n, !phone.matches); if (phone.matches) { current = n; markRows(); fill(rows[n]); placePass(); } }
      });
    });

    // Every code flips through the alphabet when the board comes into view.
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        rows.forEach(function (r, i) { flapTo($('.flap', r), r.getAttribute('data-code'), i * 60); });
      }, { threshold: 0.25 });
      io.observe(board);
    }

    $('[data-pass-apply]', pass).addEventListener('click', function () {
      var name = rows[current].getAttribute('data-name');
      if (addPreferredCollege) addPreferredCollege(name);
      else setDestination('Free counselling (Ireland): ' + name);
      goToSection('contact');
    });
    select(0, false);
    placePass();
    window.addEventListener('resize', function () { placePass(); markRows(); });
  }

  /* ------------------------------------------------------------------ *
   * Services: bento tiles (tilt + spotlight) open a detail dialog
   * ------------------------------------------------------------------ */
  function paragraphs(s) {
    return String(s).split(/\n\s*\n/).map(function (p) { return '<p>' + esc(p.trim()) + '</p>'; }).join('');
  }

  function initServices() {
    var services = window.IE_SERVICES || [];
    var bento = $('[data-bento]');
    var tiles = $$('[data-svc]');
    if (!tiles.length || !services.length) return;

    // Tiles settle after their entrance so hover tilt responds instantly.
    if (bento) {
      var settle = function () { setTimeout(function () { tiles.forEach(function (t) { t.classList.add('is-settled'); }); }, 1500); };
      if (bento.classList.contains('is-in')) settle();
      else new MutationObserver(function (m, obs) {
        if (bento.classList.contains('is-in')) { obs.disconnect(); settle(); }
      }).observe(bento, { attributes: true, attributeFilter: ['class'] });
    }

    var fine = window.matchMedia('(pointer: fine)').matches && !reduceMotion;
    tiles.forEach(function (t) {
      if (fine) {
        t.addEventListener('pointermove', function (e) {
          var r = t.getBoundingClientRect();
          var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
          t.style.setProperty('--x', (px * 100).toFixed(1) + '%');
          t.style.setProperty('--y', (py * 100).toFixed(1) + '%');
          t.style.setProperty('--rx', ((0.5 - py) * 7).toFixed(2) + 'deg');
          t.style.setProperty('--ry', ((px - 0.5) * 9).toFixed(2) + 'deg');
        });
        t.addEventListener('pointerleave', function () {
          t.style.setProperty('--rx', '0deg');
          t.style.setProperty('--ry', '0deg');
        });
      }
      t.addEventListener('click', function () { openSheet(+t.getAttribute('data-svc')); });
    });

    var sheet = $('[data-sheet]');
    if (!sheet) return;
    var sIcon = $('[data-sheet-icon]'), sTitle = $('[data-sheet-title]'), sTag = $('[data-sheet-tag]');
    var sBody = $('[data-sheet-body]'), sStep = $('[data-sheet-step]');
    var sIdx = 0, lastFocus = null;
    function renderSheet(dir) {
      var s = services[sIdx];
      function fill() {
        sIcon.innerHTML = icon(s.icon);
        sTitle.textContent = s.title;
        sTag.textContent = s.tagline;
        sStep.textContent = 'Service ' + (sIdx + 1) + ' of ' + services.length;
        sBody.innerHTML = paragraphs(s.desc);
        sBody.scrollTop = 0;
      }
      if (dir && !reduceMotion) {
        sBody.style.setProperty('--swap', (dir * 18) + 'px');
        sBody.classList.add('is-swapping');
        setTimeout(function () { fill(); sBody.style.setProperty('--swap', (-dir * 18) + 'px'); sBody.offsetWidth; sBody.classList.remove('is-swapping'); }, 200);
      } else fill();
    }
    var phoneSheet = window.matchMedia('(max-width: 640px)');
    var sheetPanel = $('.sheet__panel', sheet);
    // Phones: the detail card expands out of the tile that was tapped and
    // shrinks back into it on close (clip-path from the tile's rectangle).
    function clipFrom(el) {
      if (!phoneSheet.matches || !el || !el.getBoundingClientRect) { sheetPanel.style.removeProperty('--clip-from'); return; }
      var r = el.getBoundingClientRect(), m = 12;
      var t = Math.max(0, r.top - m), l = Math.max(0, r.left - m);
      var rt = Math.max(0, window.innerWidth - m - r.right), b = Math.max(0, window.innerHeight - m - r.bottom);
      // jump (not animate) to the tile's shape, so the open/close starts exactly there
      sheetPanel.style.transition = 'none';
      sheetPanel.style.setProperty('--clip-from', 'inset(' + t + 'px ' + rt + 'px ' + b + 'px ' + l + 'px round 18px)');
      sheetPanel.offsetWidth;
      sheetPanel.style.transition = '';
    }
    function openSheet(i) {
      lastFocus = document.activeElement;
      clipFrom(tiles[i]);
      sheetPanel.offsetWidth;
      sIdx = i; renderSheet(0);
      sheet.classList.add('is-open');
      sheet.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      setTimeout(function () { var c = $('.sheet__close', sheet); if (c) c.focus(); }, 300);
    }
    function closeSheet() {
      if (!sheet.classList.contains('is-open')) return;
      clipFrom(tiles[sIdx]);
      sheet.classList.remove('is-open');
      sheet.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }
    function step(d) { sIdx = (sIdx + d + services.length) % services.length; renderSheet(d); }
    $$('[data-sheet-close]', sheet).forEach(function (b) { b.addEventListener('click', closeSheet); });
    $('[data-sheet-prev]', sheet).addEventListener('click', function () { step(-1); });
    $('[data-sheet-next]', sheet).addEventListener('click', function () { step(1); });
    $('[data-sheet-cta]', sheet).addEventListener('click', function (e) {
      e.preventDefault();
      setDestination('Free counselling (Ireland): ' + services[sIdx].title);
      closeSheet(); setTimeout(function () { goToSection('contact'); }, 300);
    });
    var sx = 0;
    sheet.addEventListener('touchstart', function (e) { sx = e.changedTouches[0].screenX; }, { passive: true });
    sheet.addEventListener('touchend', function (e) {
      var d = sx - e.changedTouches[0].screenX;
      if (Math.abs(d) > 60) step(d > 0 ? 1 : -1);
    }, { passive: true });
    document.addEventListener('keydown', function (e) {
      if (!sheet.classList.contains('is-open')) return;
      if (e.key === 'Escape') closeSheet();
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    });
  }

  /* ------------------------------------------------------------------ *
   * Funding tabs + permitted-hours planner
   * ------------------------------------------------------------------ */
  function initTabs() {
    $$('[data-tabs]').forEach(function (list) {
      var tabs = $$('[role="tab"]', list);
      var ink = $('.tabs__ink', list);
      function moveInk(t) {
        if (!ink || !t) return;
        ink.style.width = t.offsetWidth + 'px';
        ink.style.transform = 'translateX(' + t.offsetLeft + 'px)';
        ink.style.top = t.offsetTop + 'px';
        ink.style.height = t.offsetHeight + 'px';
        ink.style.bottom = 'auto';
      }
      function select(t, focus) {
        tabs.forEach(function (x) {
          var on = x === t;
          x.setAttribute('aria-selected', on ? 'true' : 'false');
          x.tabIndex = on ? 0 : -1;
          var pane = document.getElementById(x.getAttribute('aria-controls'));
          if (!pane) return;
          if (on) {
            pane.hidden = false;
            pane.classList.remove('is-entering');
            pane.offsetWidth;
            pane.classList.add('is-entering');
          } else pane.hidden = true;
        });
        moveInk(t);
        if (focus) t.focus();
      }
      tabs.forEach(function (t, i) {
        t.addEventListener('click', function () { select(t); });
        t.addEventListener('keydown', function (e) {
          var n = null;
          if (e.key === 'ArrowRight') n = (i + 1) % tabs.length;
          if (e.key === 'ArrowLeft') n = (i - 1 + tabs.length) % tabs.length;
          if (n !== null) { e.preventDefault(); select(tabs[n], true); }
        });
      });
      var cur = tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0] || tabs[0];
      moveInk(cur);
      window.addEventListener('resize', function () {
        moveInk(tabs.filter(function (t) { return t.getAttribute('aria-selected') === 'true'; })[0]);
      });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveInk(cur); });
    });
  }

  function initWeek() {
    var week = $('[data-week]');
    if (!week) return;
    var MODES = {
      term: { hours: [4, 0, 4, 0, 4, 8, 0], total: '20 hrs', note: 'a week during term time' },
      hol: { hours: [8, 8, 8, 8, 8, 0, 0], total: '40 hrs', note: 'a week from June to September and 15 December to 15 January' }
    };
    var bars = $$('.week__bar', week);
    var btns = $$('[data-week-mode]', week);
    var totalEl = $('[data-week-total]', week), noteEl = $('[data-week-note]', week);
    function set(mode) {
      var m = MODES[mode];
      btns.forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-week-mode') === mode ? 'true' : 'false'); });
      bars.forEach(function (b, i) {
        var h = m.hours[i];
        b.style.setProperty('--h', (h / 8) * 100);
        $('em', b).textContent = h ? h + 'h' : '';
      });
      totalEl.textContent = m.total;
      noteEl.textContent = m.note;
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { set(b.getAttribute('data-week-mode')); }); });
  }

  /* ------------------------------------------------------------------ *
   * Settlement route: draws on scroll; each stop opens its details and
   * the traveller pin flies along the line to it
   * ------------------------------------------------------------------ */
  var STOPS = [
    {
      tag: 'Stop 1: Stamp 2', title: 'Irish Student Visa',
      what: 'Your student permission lets you live and study in Ireland on a programme from the official register. Choose a course at NFQ Level 8 or above and it leads straight into the Graduate Programme.',
      facts: [['How long', 'The length of your course'], ['Work rights', '20 hrs a week in term, 40 in holidays'], ['Must have', 'A course on the official register']],
      help: ['Shortlisting courses and universities that fit your profile', 'Letter of Acceptance, medical insurance and proof of funds', 'Your AVATS application and residence permit registration']
    },
    {
      tag: 'Stop 2: Stamp 1G', title: 'Third Level Graduate Programme',
      what: 'Once you graduate, you can stay in Ireland to look for and take up graduate work, with no employer sponsor needed.',
      facts: [['How long', '12 months at Level 8, up to 24 at Level 9+'], ['Work rights', 'Full-time, no permit needed'], ['Sponsor', 'Not required']],
      help: ['CV, LinkedIn and interview preparation', 'A job search aimed at Critical Skills roles', 'Renewal guidance for Master’s and PhD graduates']
    },
    {
      tag: 'Stop 3: Employment permit', title: 'Critical Skills Employment Permit',
      what: 'Land a job offer in an occupation on Ireland’s Critical Skills list and move onto this permit. It is the fast track to long-term residence, and your family can join you.',
      facts: [['Permit length', 'Issued for 2 years'], ['Labour market test', 'Not required'], ['Family', 'Partner and children can join immediately']],
      help: ['Matching your degree to eligible occupations', 'Permit application support with your employer', 'Family reunification applications and documents']
    },
    {
      tag: 'Stop 4: Long-term residence', title: 'Stamp 4 residence',
      what: 'After two years on a Critical Skills permit you can apply for Stamp 4, which lets you live and work in Ireland without needing an employment permit.',
      facts: [['When', 'After 2 years on Critical Skills'], ['Work rights', 'Any job, no permit'], ['Next', 'A long-term life in Ireland']],
      help: ['Timing your Stamp 4 application', 'Documents and immigration appointments', 'Planning your long-term residence']
    }
  ];

  function initRoute() {
    var route = $('[data-route]');
    if (!route) return;
    var stops = $$('.stop', route);
    var detail = $('[data-stop-detail]');
    var traveller = $('[data-traveller]', route);
    var path = $('.route__svg .base', route);
    var svg = $('.route__svg', route);
    var mobile = window.matchMedia('(max-width: 900px)');
    var current = 0, curLen = null, lens = [], anim = null;

    // Line draws itself as the section scrolls through.
    if (reduceMotion) {
      route.style.setProperty('--rp', 1);
      stops.forEach(function (s) { s.classList.add('is-lit'); });
    } else {
      onScrollFrame(function (y, vh) {
        var r = route.getBoundingClientRect();
        if (r.top > vh || r.bottom < 0) return;
        var p = clamp((vh * 0.9 - r.top) / (r.height + vh * 0.2), 0, 1);
        route.style.setProperty('--rp', p.toFixed(4));
        stops.forEach(function (s, i) { s.classList.toggle('is-lit', p >= (i / Math.max(1, stops.length - 1)) * 0.95); });
      });
    }

    // Path length at each stop: the point on the curve closest to the dot's centre.
    function measure() {
      if (!path || !path.getTotalLength) return;
      var total = path.getTotalLength(), w = svg.getBoundingClientRect().width || 1;
      var base = route.getBoundingClientRect().left;
      lens = stops.map(function (s) {
        var d = $('.stop__dot', s).getBoundingClientRect();
        var targetX = (d.left + d.width / 2 - base) / w * 1000;
        var best = 0, bestD = Infinity;
        for (var l = 0; l <= total; l += total / 400) {
          var dx = Math.abs(path.getPointAtLength(l).x - targetX);
          if (dx < bestD) { bestD = dx; best = l; }
        }
        return best;
      });
    }
    function placeAt(len) {
      if (!traveller || !path) return;
      curLen = len;
      var pt = path.getPointAtLength(len);
      var r = svg.getBoundingClientRect(), rr = route.getBoundingClientRect();
      traveller.style.left = (r.left - rr.left + pt.x / 1000 * r.width) + 'px';
      traveller.style.top = (r.top - rr.top + pt.y / 64 * r.height) + 'px';
    }
    function flyTo(len) {
      if (curLen === null || reduceMotion) { placeAt(len); return; }
      cancelAnimationFrame(anim);
      var from = curLen, t0 = null, dur = 900;
      traveller.classList.add('is-moving');
      (function step(t) {
        if (!t0) t0 = t;
        var p = clamp((t - t0) / dur, 0, 1);
        var e = p < .5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
        placeAt(from + (len - from) * e);
        if (p < 1) anim = requestAnimationFrame(step);
        else traveller.classList.remove('is-moving');
      })(performance.now());
    }

    var sd = function (k) { return $('[data-sd="' + k + '"]', detail); };
    function fill(i) {
      var s = STOPS[i];
      sd('tag').textContent = s.tag;
      sd('title').textContent = s.title;
      sd('what').textContent = s.what;
      sd('facts').innerHTML = s.facts.map(function (f) {
        return '<div class="sd-fact"><span>' + esc(f[0]) + '</span><b>' + esc(f[1]) + '</b></div>';
      }).join('');
      sd('help').innerHTML = s.help.map(function (h) { return '<li>' + icon('i-check-c') + '<span>' + esc(h) + '</span></li>'; }).join('');
    }
    var phone = window.matchMedia('(max-width: 640px)');
    function placeDetail(i) {
      if (mobile.matches && !phone.matches) { if (stops[i].nextElementSibling !== detail) stops[i].after(detail); }
      else if (route.nextElementSibling !== detail) route.after(detail);
      if (!mobile.matches || phone.matches) {
        var d = $('.stop__dot', stops[i]).getBoundingClientRect(), box = detail.getBoundingClientRect();
        detail.style.setProperty('--arrow', (d.left + d.width / 2 - box.left - 10) + 'px');
      }
    }
    function select(i, animate) {
      current = i;
      stops.forEach(function (s, j) { s.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      placeDetail(i);
      if (animate && !mobile.matches) { measure(); if (lens.length) flyTo(lens[i]); }
      if (animate && !reduceMotion) {
        detail.classList.add('is-swapping');
        setTimeout(function () { fill(i); detail.classList.remove('is-swapping'); }, 220);
      } else fill(i);
    }
    stops.forEach(function (s, i) {
      s.addEventListener('click', function () {
        if (i === current) return;
        select(i, true);
        if (mobile.matches && !phone.matches) setTimeout(function () { detail.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' }); }, 250);
      });
    });

    // Re-anchor the pin whenever the layout settles or changes.
    function anchor() {
      if (mobile.matches) return;
      measure();
      if (lens.length) placeAt(lens[current]);
      placeDetail(current);
    }
    select(0, false);
    anchor();
    window.addEventListener('resize', anchor);
    window.addEventListener('load', anchor);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(anchor);
    if ('ResizeObserver' in window) new ResizeObserver(anchor).observe(route);
  }

  /* ------------------------------------------------------------------ *
   * FAQ: pick a question, the counsellor "types" the answer
   * ------------------------------------------------------------------ */
  /* ------------------------------------------------------------------ *
   * FAQ: pick a question on the left, its answer card swaps in
   * ------------------------------------------------------------------ */
  function initFaq() {
    var list = $('[data-qlist]');
    var body = $('[data-convo-body]');
    if (!list || !body) return;
    var btns = $$('.qbtn', list);
    var count = $('[data-answer-count]');
    var current = 0, timer = null;

    function fill(i) {
      var b = btns[i];
      var ico = $('i svg', b);
      var a = $('.qa__a', b.parentNode).textContent.trim();
      body.innerHTML = '<div class="answer__icon">' + (ico ? ico.outerHTML : '') + '</div>' +
        '<h3>' + esc(b.textContent.trim()) + '</h3>' +
        '<p>' + a.split(/\s+/).map(function (w, k) { return '<span class="wd" style="--i:' + k + '">' + esc(w) + '</span>'; }).join(' ') + '</p>';
      if (count) count.textContent = (i < 9 ? '0' : '') + (i + 1) + ' / ' + (btns.length < 10 ? '0' : '') + btns.length;
    }
    var phone = window.matchMedia('(max-width: 640px)');
    function show(i, animate) {
      current = (i + btns.length) % btns.length;
      btns.forEach(function (b, j) {
        b.setAttribute('aria-pressed', j === current ? 'true' : 'false');
        b.parentNode.classList.toggle('is-open', j === current);
        b.setAttribute('aria-expanded', j === current ? 'true' : 'false');
      });
      clearTimeout(timer);
      if (animate && !reduceMotion) {
        body.classList.add('is-swapping');
        timer = setTimeout(function () { fill(current); body.classList.remove('is-swapping'); }, 220);
      } else fill(current);
    }
    btns.forEach(function (b, i) {
      b.addEventListener('click', function () {
        if (phone.matches) {
          // accordion: tapping the open question closes it
          if (b.parentNode.classList.contains('is-open')) {
            b.parentNode.classList.remove('is-open'); b.setAttribute('aria-pressed', 'false'); b.setAttribute('aria-expanded', 'false');
            return;
          }
          show(i, false);
          return;
        }
        show(i, true);
        if (window.matchMedia('(max-width: 900px)').matches) {
          $('[data-answer]').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
        }
      });
    });
    var prev = $('[data-answer-prev]'), next = $('[data-answer-next]');
    if (prev) prev.addEventListener('click', function () { show(current - 1, true); });
    if (next) next.addEventListener('click', function () { show(current + 1, true); });
    show(0, false);
  }

  /* Free counselling topic chips set what the session is about. */
  function initTopics() {
    $$('[data-topics]').forEach(function (group) {
      var chips = $$('[data-topic]', group);
      var card = group.closest('form, .form-card') || document;
      chips.forEach(function (c) {
        c.addEventListener('click', function () {
          var on = c.getAttribute('aria-pressed') !== 'true';
          chips.forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
          c.setAttribute('aria-pressed', on ? 'true' : 'false');
          setDestination(on ? 'Free counselling (Ireland): ' + c.getAttribute('data-topic') : 'Free counselling (Ireland)', card);
        });
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Lead forms → /api/enquiry
   * ------------------------------------------------------------------ */
  var ENQUIRY_ENDPOINT = '/api/enquiry';
  var COUNTRY_CODES = [
    ['AE', '+971'], ['AF', '+93'], ['AR', '+54'], ['AT', '+43'], ['AU', '+61'], ['BE', '+32'], ['BR', '+55'], ['CH', '+41'],
    ['CL', '+56'], ['CN', '+86'], ['CO', '+57'], ['DE', '+49'], ['DK', '+45'], ['DZ', '+213'], ['EG', '+20'], ['ES', '+34'],
    ['FI', '+358'], ['FR', '+33'], ['GR', '+30'], ['HU', '+36'], ['ID', '+62'], ['IE', '+353'], ['IN', '+91'], ['IR', '+98'],
    ['IT', '+39'], ['JP', '+81'], ['KE', '+254'], ['KR', '+82'], ['LK', '+94'], ['MA', '+212'], ['MM', '+95'], ['MX', '+52'],
    ['MY', '+60'], ['NG', '+234'], ['NL', '+31'], ['NO', '+47'], ['NZ', '+64'], ['PE', '+51'], ['PH', '+63'], ['PK', '+92'],
    ['PL', '+48'], ['PT', '+351'], ['QA', '+974'], ['RO', '+40'], ['RU/KZ', '+7'], ['SA', '+966'], ['SE', '+46'], ['SG', '+65'],
    ['TH', '+66'], ['TN', '+216'], ['TR', '+90'], ['TZ', '+255'], ['UA', '+380'], ['UG', '+256'], ['UK', '+44'], ['US/CA', '+1'],
    ['VE', '+58'], ['VN', '+84'], ['ZA', '+27']
  ];

  function enquiryPage() {
    try { return location.host + location.pathname; } catch (e) { return ''; }
  }

  /* ------------------------------------------------------------------ *
   * Where is the visitor? Read from the browser's time zone and language,
   * so nothing is sent anywhere. Falls back to India (UTC+5 and east) or the
   * UAE (UTC+3 to +5), Tutee Connect's two home markets.
   * ------------------------------------------------------------------ */
  var TZ_COUNTRY = {
    'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE', 'Asia/Muscat': 'OM', 'Asia/Qatar': 'QA',
    'Asia/Riyadh': 'SA', 'Asia/Bahrain': 'BH', 'Asia/Kuwait': 'KW', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD',
    'Asia/Kathmandu': 'NP', 'Asia/Katmandu': 'NP', 'Asia/Colombo': 'LK', 'Asia/Singapore': 'SG', 'Asia/Kuala_Lumpur': 'MY',
    'Asia/Jakarta': 'ID', 'Asia/Manila': 'PH', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
    'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Tehran': 'IR',
    'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA', 'Africa/Accra': 'GH',
    'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
    'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US',
    'America/Toronto': 'CA', 'America/Vancouver': 'CA',
    'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Perth': 'AU', 'Pacific/Auckland': 'NZ'
  };
  var ISO3 = {
    IN: 'IND', AE: 'UAE', OM: 'OMN', QA: 'QAT', SA: 'KSA', BH: 'BHR', KW: 'KWT', PK: 'PAK', BD: 'BGD', NP: 'NPL',
    LK: 'LKA', SG: 'SGP', MY: 'MYS', ID: 'IDN', PH: 'PHL', TH: 'THA', VN: 'VNM', CN: 'CHN', HK: 'HKG', JP: 'JPN',
    KR: 'KOR', IR: 'IRN', NG: 'NGA', KE: 'KEN', EG: 'EGY', ZA: 'ZAF', GH: 'GHA', GB: 'GBR', IE: 'IRL', DE: 'DEU',
    FR: 'FRA', US: 'USA', CA: 'CAN', AU: 'AUS', NZ: 'NZL'
  };
  var CC_LABEL = { GB: 'UK', US: 'US/CA', CA: 'US/CA' };

  function detectOrigin() {
    var iso = null;
    try { iso = TZ_COUNTRY[Intl.DateTimeFormat().resolvedOptions().timeZone] || null; } catch (e) { /* old browser */ }
    if (!iso) {
      (navigator.languages || [navigator.language || '']).some(function (l) {
        var m = /-([A-Z]{2})$/i.exec(l || '');
        if (m && ISO3[m[1].toUpperCase()]) { iso = m[1].toUpperCase(); return true; }
        return false;
      });
    }
    if (!iso) {
      var east = -new Date().getTimezoneOffset() / 60;
      iso = east >= 3 && east < 5 ? 'AE' : 'IN';
    }
    var name = iso;
    try { name = new Intl.DisplayNames(['en'], { type: 'region' }).of(iso); } catch (e) { name = { IN: 'India', AE: 'UAE' }[iso] || iso; }
    if (iso === 'AE') name = 'UAE';
    if (iso === 'GB') name = 'UK';
    if (iso === 'US') name = 'USA';
    return { iso: iso, code: ISO3[iso] || 'IND', name: name };
  }

  var ORIGIN = detectOrigin();
  function applyOrigin() {
    $$('[data-origin-code]').forEach(function (el) { el.textContent = ORIGIN.code; });
    $$('[data-origin-name]').forEach(function (el) { el.textContent = ORIGIN.iso === 'IE' ? 'Already in Ireland' : 'From ' + ORIGIN.name; });
  }

  /* ------------------------------------------------------------------ *
   * Free counselling: a two-step boarding-pass check-in with a live stub
   * ------------------------------------------------------------------ */
  var addPreferredCollege = null;   // set by initCheckin, used by the boarding pass button
  function initCheckin() {
    var form = $('[data-checkin]');
    if (!form) return;
    var ticket = form.closest('[data-ticket]');
    var steps = $$('[data-tstep]', form);
    var pills = $$('[data-ticket-steps] li', form);
    var path = $('[data-ticket-path]', form);
    var nameIn = $('input[name="name"]', form), phoneIn = $('input[name="phone_number"]', form), emailIn = $('input[name="email"]', form);
    var stubName = $('[data-stub-name]', ticket), stubTopic = $('[data-stub-topic]', ticket);
    var errBox = $('[data-form-error]', form), errText = $('[data-form-error-text]', form);
    var doneName = $('[data-done-name]', form);
    var step = 1;

    /* Preferred colleges: arrive from the directory's shortlist (stored in
       localStorage) or from the boarding-pass button, and can be removed. */
    var prefsBox = $('[data-prefs]', form), prefsList = $('[data-prefs-list]', form), prefsInput = $('[data-prefs-input]', form);
    var prefs = [];
    function paintPrefs() {
      prefsInput.value = prefs.join('; ');
      prefsBox.classList.toggle('hidden', !prefs.length);
      prefsList.innerHTML = prefs.map(function (n, i) {
        return '<li><span>' + esc(n) + '</span><button type="button" data-prefs-remove="' + i + '" aria-label="Remove ' + esc(n) + '">' + icon('i-x') + '</button></li>';
      }).join('');
      var topic = $('[data-topic][aria-pressed="true"]', form);
      if (!topic) {
        stubTopic.textContent = prefs.length ? prefs.length + (prefs.length === 1 ? ' college' : ' colleges') + ' shortlisted' : 'Free counselling';
        stubTopic.classList.toggle('is-empty', !prefs.length);
      }
    }
    prefsList.addEventListener('click', function (e) {
      var b = e.target.closest('[data-prefs-remove]');
      if (!b) return;
      prefs.splice(+b.getAttribute('data-prefs-remove'), 1);
      try { localStorage.setItem('tcShortlist', JSON.stringify(prefs)); } catch (err) { /* storage off */ }
      paintPrefs();
    });
    addPreferredCollege = function (name) {
      if (prefs.indexOf(name) < 0) prefs.push(name);
      paintPrefs();
    };
    try {
      var saved = JSON.parse(localStorage.getItem('tcShortlist') || '[]');
      if (Array.isArray(saved)) prefs = saved.filter(function (x) { return typeof x === 'string' && x.length < 200; }).slice(0, 20);
    } catch (err) { /* nothing saved */ }

    // Note: live character count
    var note = $('[data-note]', form), noteCount = $('[data-note-count]', form);
    // Up to 250 characters (the textarea's maxlength enforces it too).
    var NOTE_MAX = 250;
    function paintCount() {
      if (!note) return;
      if (note.value.length > NOTE_MAX) note.value = note.value.slice(0, NOTE_MAX);
      var n = note.value.length;
      noteCount.textContent = n + ' / ' + NOTE_MAX;
      noteCount.classList.toggle('is-full', n >= NOTE_MAX);
    }
    if (note) note.addEventListener('input', paintCount);

    // The plane creeps towards Dublin as each detail is filled in.
    function progress() {
      var filled = [
        nameIn.value.trim().length > 1,
        !!$('[data-topic][aria-pressed="true"]', form),
        validatePhone(($('[data-cc]', form) || {}).value || '+91', phoneIn.value).ok,
        validateEmail(emailIn.value).ok
      ].filter(Boolean).length;
      path.style.setProperty('--prog', step === 3 ? 1 : (0.06 + filled * 0.2).toFixed(2));
    }
    function go(n) {
      step = n;
      steps.forEach(function (el, i) {
        el.classList.toggle('is-active', i + 1 === n);
        el.classList.toggle('is-past', i + 1 < n);
        if (i + 1 === n) el.removeAttribute('inert'); else el.setAttribute('inert', '');
      });
      pills.forEach(function (li, i) {
        li.classList.toggle('is-on', i + 1 === n);
        li.classList.toggle('is-done', i + 1 < n);
      });
      ticket.classList.toggle('is-booked', n === 3);
      if (errBox) errBox.classList.add('hidden');
      progress();
    }
    function next() {
      if (nameIn.value.trim().length < 2) {
        errText.textContent = 'Enter your full name to continue.';
        errBox.classList.remove('hidden');
        nameIn.focus();
        return;
      }
      go(2);
      setTimeout(function () { phoneIn.focus({ preventScroll: true }); }, 450);
    }

    nameIn.addEventListener('input', function () {
      var v = nameIn.value.trim();
      stubName.textContent = v || 'Your name';
      stubName.classList.toggle('is-empty', !v);
      progress();
    });
    [phoneIn, emailIn].forEach(function (i) { i.addEventListener('input', progress); });
    var ccSel = $('[data-cc]', form);
    if (ccSel) ccSel.addEventListener('change', progress);
    $$('[data-topic]', form).forEach(function (c) {
      c.addEventListener('click', function () {
        setTimeout(function () {
          var on = $('[data-topic][aria-pressed="true"]', form);
          var n = prefsInput.value ? prefsInput.value.split('; ').length : 0;
          stubTopic.textContent = on ? on.getAttribute('data-topic') : (n ? n + (n === 1 ? ' college' : ' colleges') + ' shortlisted' : 'Free counselling');
          stubTopic.classList.toggle('is-empty', !on && !n);
          progress();
        }, 0);
      });
    });
    $('[data-tnext]', form).addEventListener('click', next);
    $('[data-tback]', form).addEventListener('click', function () { go(1); nameIn.focus({ preventScroll: true }); });
    // Enter on step 1 moves on instead of submitting half a form.
    form.addEventListener('submit', function (e) {
      if (step === 1) { e.preventDefault(); e.stopImmediatePropagation(); next(); }
    }, true);
    document.addEventListener('tc:submitted', function (e) {
      if (!e.detail || e.detail.form !== form) return;
      var first = stubName.classList.contains('is-empty') ? '' : stubName.textContent.split(' ')[0];
      doneName.textContent = first ? ', ' + first : '';
      $$('[data-topic]', form).forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
      prefs = []; paintPrefs(); paintCount();
      try { localStorage.removeItem('tcShortlist'); } catch (err) { /* storage off */ }
      go(3);
    });
    $('[data-trestart]', form).addEventListener('click', function () {
      stubName.textContent = 'Your name'; stubName.classList.add('is-empty');
      stubTopic.textContent = 'Free counselling'; stubTopic.classList.add('is-empty');
      paintPrefs();
      go(1);
      nameIn.focus();
    });
    paintPrefs();
    go(1);
  }

  /* ------------------------------------------------------------------ *
   * Contact validation
   * Phone: national-number length (and leading digits where they are fixed)
   * for every country code we offer, plus checks that reject keyboard-mash
   * and dummy numbers. Email: strict syntax, typo suggestions for common
   * providers, throwaway-inbox domains, and a live check that the domain can
   * actually receive mail (DNS MX lookup, fails open if the lookup is down).
   * ------------------------------------------------------------------ */
  // dial code -> [min digits, max digits, optional regex the national number must match]
  var PHONE_RULES = {
    '+971': [8, 9, /^(5\d{8}|[2-9]\d{7})$/], '+93': [9, 9], '+54': [10, 11], '+43': [7, 13], '+61': [9, 9, /^[2-478]/],
    '+32': [8, 9], '+55': [10, 11], '+41': [9, 9], '+56': [9, 9], '+86': [10, 11], '+57': [10, 10], '+49': [6, 13],
    '+45': [8, 8], '+213': [8, 9], '+20': [8, 10], '+34': [9, 9, /^[6-9]/], '+358': [6, 12], '+33': [9, 9, /^[1-9]/],
    '+30': [10, 10], '+36': [8, 9], '+62': [9, 12], '+353': [7, 9], '+91': [10, 10, /^[2-9]/], '+98': [10, 10],
    '+39': [6, 11], '+81': [9, 10], '+254': [9, 9], '+82': [8, 10], '+94': [9, 9], '+212': [9, 9], '+95': [7, 10],
    '+52': [10, 10], '+60': [8, 10], '+234': [8, 10], '+31': [9, 9], '+47': [8, 8], '+64': [8, 10], '+51': [8, 9],
    '+63': [8, 10], '+92': [9, 10], '+48': [9, 9], '+351': [9, 9, /^[2-9]/], '+974': [8, 8], '+40': [9, 9],
    '+7': [10, 10, /^[3-9]/], '+966': [8, 9], '+46': [7, 10], '+65': [8, 8, /^[3689]/], '+66': [8, 9], '+216': [8, 8],
    '+90': [10, 10, /^[2-5]/], '+255': [9, 9], '+380': [9, 9], '+256': [9, 9], '+44': [9, 10, /^[1-37-9]/],
    '+1': [10, 10, /^[2-9]\d{2}[2-9]/], '+58': [10, 10], '+84': [9, 10], '+27': [9, 9]
  };
  // Countries whose numbers keep their leading 0 (no trunk prefix to strip).
  var KEEP_ZERO = { '+39': 1 };

  function ccName(dial) {
    var c = COUNTRY_CODES.filter(function (x) { return x[1] === dial; })[0];
    if (!c) return dial;
    var names = { 'UK': 'UK', 'US/CA': 'US and Canada', 'RU/KZ': 'Russia and Kazakhstan', 'AE': 'UAE' };
    if (names[c[0]]) return names[c[0]] + ' (' + dial + ')';
    try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(c[0]) + ' (' + dial + ')'; } catch (e) { return c[0] + ' (' + dial + ')'; }
  }

  function looksFake(d) {
    if (/^(\d)\1+$/.test(d)) return true;                          // 9999999999
    if (new Set(d.split('')).size <= 2) return true;               // 9898989898
    var up = '01234567890123456789', down = '98765432109876543210';
    if (up.indexOf(d) > -1 || down.indexOf(d) > -1) return true;    // 1234567890
    if (/(\d{3,})\1\1/.test(d)) return true;                       // 123123123
    return false;
  }

  /* Returns { ok, msg, national } for a number typed against a dial code. */
  function validatePhone(dial, raw) {
    var txt = String(raw || '').trim();
    if (!txt) return { ok: false, msg: 'Enter your phone number.' };
    if (/[a-z]/i.test(txt)) return { ok: false, msg: 'Phone numbers can only contain digits.' };
    var d = txt.replace(/\D/g, '');
    var dd = dial.replace('+', '');
    if (/^(\+|00)/.test(txt)) {
      if (txt.indexOf('00') === 0) d = d.slice(2);
      if (d.indexOf(dd) === 0) d = d.slice(dd.length);
      else return { ok: false, msg: 'That number has a different country code. Pick the matching code from the list.' };
    }
    var rule = PHONE_RULES[dial] || [7, 15];
    if (d.indexOf(dd) === 0 && d.length - dd.length >= rule[0] && d.length > rule[1]) d = d.slice(dd.length);
    if (!KEEP_ZERO[dial] && d.charAt(0) === '0') d = d.slice(1);
    var name = ccName(dial);
    if (d.length < rule[0] || d.length > rule[1]) {
      var need = rule[0] === rule[1] ? rule[0] + ' digits' : rule[0] + ' to ' + rule[1] + ' digits';
      return { ok: false, msg: name + ' numbers have ' + need + ' after the country code. You entered ' + d.length + '.' };
    }
    if ((rule[2] && !rule[2].test(d)) || looksFake(d)) {
      return { ok: false, msg: "That doesn't look like a real " + name + ' number. Please check it.' };
    }
    return { ok: true, national: d };
  }

  function phoneHint(dial) {
    var rule = PHONE_RULES[dial];
    if (!rule) return '';
    return ccName(dial) + ': ' + (rule[0] === rule[1] ? rule[0] : rule[0] + ' to ' + rule[1]) + ' digits';
  }

  /* Chat: a number typed with its own +code, or assumed to be from the visitor's country. */
  function validatePhoneLoose(raw) {
    var txt = String(raw || '').trim(), d = txt.replace(/\D/g, '');
    if (/^(\+|00)/.test(txt)) {
      if (txt.indexOf('00') === 0) d = d.slice(2);
      var best = null;
      Object.keys(PHONE_RULES).forEach(function (k) {
        var kd = k.slice(1);
        if (d.indexOf(kd) === 0 && (!best || kd.length > best.length - 1)) best = k;
      });
      if (!best) return { ok: false, msg: "I don't recognise that country code. Try again, for example +91 98765 43210." };
      var r = validatePhone(best, d.slice(best.length - 1));
      if (r.ok) r.full = best + ' ' + r.national;
      return r;
    }
    var dial = (COUNTRY_CODES.filter(function (c) { return c[0] === (CC_LABEL[ORIGIN.iso] || ORIGIN.iso); })[0] || ['IN', '+91'])[1];
    var res = validatePhone(dial, txt);
    if (res.ok) res.full = dial + ' ' + res.national;
    else res.msg += ' If you are outside ' + ccName(dial).replace(/ \(.*/, '') + ', start with your country code, like +44.';
    return res;
  }

  var COMMON_DOMAINS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'live.com', 'yahoo.co.in',
    'rediffmail.com', 'protonmail.com', 'aol.com', 'hotmail.co.uk', 'yahoo.co.uk', 'outlook.in', 'msn.com', 'zoho.com', 'gmx.com'];
  var DISPOSABLE = ['mailinator.com', 'guerrillamail.com', 'guerrillamail.net', 'sharklasers.com', '10minutemail.com', 'tempmail.com',
    'temp-mail.org', 'yopmail.com', 'trashmail.com', 'getnada.com', 'dispostable.com', 'maildrop.cc', 'throwawaymail.com',
    'fakeinbox.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'tempail.com', 'mailnesia.com', 'spamgourmet.com', 'burnermail.io'];
  var FAKE_DOMAINS = ['example.com', 'example.org', 'example.net', 'test.com', 'abc.com', 'xyz.com', 'asdf.com', 'qwerty.com',
    'fake.com', 'sample.com', 'domain.com', 'email.test', 'aaa.com', 'mail.com.com'];

  function editDistance(a, b) {
    var m = [], i, j;
    for (i = 0; i <= a.length; i++) { m[i] = [i]; }
    for (j = 0; j <= b.length; j++) { m[0][j] = j; }
    for (i = 1; i <= a.length; i++) for (j = 1; j <= b.length; j++) {
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return m[a.length][b.length];
  }

  /* Returns { ok, msg, suggest } without any network call. */
  function validateEmail(raw) {
    var e = String(raw || '').trim();
    if (!e) return { ok: false, msg: 'Enter your email address.' };
    var re = /^(?!\.)(?!.*\.\.)[a-z0-9.!#$%&'*+\/=?^_`{|}~-]{1,64}@(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;
    if (!re.test(e) || /\.@/.test(e)) return { ok: false, msg: 'Enter a valid email address, like name@gmail.com.' };
    var at = e.lastIndexOf('@'), local = e.slice(0, at), domain = e.slice(at + 1).toLowerCase();
    if (/\.(test|invalid|localhost|example|local)$/.test(domain) || FAKE_DOMAINS.indexOf(domain) > -1) {
      return { ok: false, msg: 'Please use a real email address so a counsellor can reach you.' };
    }
    if (DISPOSABLE.indexOf(domain) > -1) return { ok: false, msg: "Temporary inboxes can't receive our follow-up. Please use your usual email address." };
    if (/^(test|asdf|qwerty|abc|xyz|aaa+|fake|none|no|na|null|sample)$/i.test(local)) {
      return { ok: false, msg: 'Please use your own email address so a counsellor can reach you.' };
    }
    if (COMMON_DOMAINS.indexOf(domain) < 0) {
      for (var i = 0; i < COMMON_DOMAINS.length; i++) {
        var dist = editDistance(domain, COMMON_DOMAINS[i]);
        if (dist > 0 && dist <= 2 && domain.length > 4) {
          return { ok: false, suggest: local + '@' + COMMON_DOMAINS[i], msg: 'Did you mean ' + local + '@' + COMMON_DOMAINS[i] + '?' };
        }
      }
    }
    return { ok: true, email: local + '@' + domain };
  }

  /* Can this domain receive email? Cloudflare DNS-over-HTTPS; resolves true on any doubt. */
  var mxCache = {};
  function domainReceivesMail(domain) {
    domain = domain.toLowerCase();
    if (COMMON_DOMAINS.indexOf(domain) > -1) return Promise.resolve(true);
    if (mxCache[domain] !== undefined) return Promise.resolve(mxCache[domain]);
    function q(type) {
      var ctl = window.AbortController ? new AbortController() : null;
      var to = setTimeout(function () { if (ctl) ctl.abort(); }, 3000);
      return fetch('https://cloudflare-dns.com/dns-query?name=' + encodeURIComponent(domain) + '&type=' + type,
        { headers: { Accept: 'application/dns-json' }, signal: ctl ? ctl.signal : undefined })
        .then(function (r) { clearTimeout(to); return r.json(); });
    }
    return q('MX').then(function (j) {
      if (j.Status === 3) return false;                                   // domain does not exist
      if ((j.Answer || []).some(function (a) { return a.type === 15; })) return true;
      return q('A').then(function (a) { return (a.Answer || []).length > 0; }); // RFC 5321 fallback
    }).catch(function () { return true; })
      .then(function (ok) { mxCache[domain] = ok; return ok; });
  }

  /* Inline field messages */
  function fieldBox(input) { return input.closest('.phone') || input.closest('.field'); }
  function setFieldState(input, state, msg, suggest) {
    var box = fieldBox(input);
    if (!box) return;
    var f = input.closest('.field');
    if (f) { f.classList.toggle('is-invalid', state === 'bad'); f.classList.toggle('is-valid', state === 'ok'); }
    var m = box.nextElementSibling && box.nextElementSibling.classList.contains('field-msg') ? box.nextElementSibling : null;
    if (!msg) { if (m && !m.hasAttribute('data-hint')) m.remove(); else if (m) { m.className = 'field-msg is-hint'; } return; }
    if (!m) { m = document.createElement('p'); box.parentNode.insertBefore(m, box.nextSibling); }
    m.removeAttribute('data-hint');
    m.className = 'field-msg ' + (state === 'bad' ? 'is-bad' : 'is-hint');
    m.setAttribute('role', state === 'bad' ? 'alert' : 'status');
    m.textContent = msg + ' ';
    if (suggest) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'field-msg__fix'; b.textContent = 'Use it';
      b.addEventListener('click', function () {
        input.value = suggest;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        setFieldState(input, 'ok');
      });
      m.appendChild(b);
    }
  }
  function showHint(select) {
    var form = select.closest('form');
    var input = form && $('input[name="phone_number"]', form);
    if (!input) return;
    var box = fieldBox(input), m = box.nextElementSibling;
    if (m && m.classList.contains('field-msg') && m.classList.contains('is-bad')) return;
    if (!m || !m.classList.contains('field-msg')) { m = document.createElement('p'); box.parentNode.insertBefore(m, box.nextSibling); }
    m.className = 'field-msg is-hint'; m.setAttribute('data-hint', ''); m.removeAttribute('role');
    m.textContent = phoneHint(select.value);
  }

  /* ------------------------------------------------------------------ *
   * Country code picker: flags, names and search over the native select
   * (the select stays in the form, so submission is unchanged).
   * ------------------------------------------------------------------ */
  function flagIso(label) { return ({ 'UK': 'gb', 'US/CA': 'us', 'RU/KZ': 'ru' }[label] || label).toLowerCase(); }
  function flagImg(label) {
    var iso = flagIso(label);
    return '<img class="cc__flag" src="https://flagcdn.com/w40/' + iso + '.png" srcset="https://flagcdn.com/w80/' + iso + '.png 2x" width="22" height="16" alt="" loading="lazy">';
  }
  function initCountryPicker(sel) {
    var items = COUNTRY_CODES.map(function (c) {
      var name = ccName(c[1]).replace(/ \(.*/, '');
      if (c[0] === 'US/CA') name = 'United States / Canada';
      if (c[0] === 'RU/KZ') name = 'Russia / Kazakhstan';
      return { label: c[0], dial: c[1], name: name };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    var uid = 'cc' + Math.random().toString(36).slice(2, 8);
    var wrap = document.createElement('div');
    wrap.className = 'cc';
    wrap.innerHTML = '<button type="button" class="cc__btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="' + uid + '"></button>' +
      '<div class="cc__panel" hidden><input class="cc__search" type="search" placeholder="Search country or code" aria-label="Search countries" autocomplete="off">' +
      '<ul class="cc__list" role="listbox" id="' + uid + '" tabindex="-1"></ul></div>';
    sel.parentNode.insertBefore(wrap, sel);
    sel.classList.add('cc__native');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');
    var btn = $('.cc__btn', wrap), panel = $('.cc__panel', wrap), search = $('.cc__search', wrap), list = $('.cc__list', wrap);
    // Lives on <body> so no transformed or filtered ancestor can trap or clip it.
    document.body.appendChild(panel);
    var active = 0, shown = items;

    function current() { var o = sel.options[sel.selectedIndex]; return items.filter(function (i) { return i.dial === sel.value && (!o || o.textContent.indexOf(i.label) === 0); })[0] || items[0]; }
    function paintBtn() { var c = current(); btn.innerHTML = flagImg(c.label) + '<span>' + c.dial + '</span><svg aria-hidden="true"><use href="#i-chev-r"/></svg>'; btn.setAttribute('aria-label', 'Country code: ' + c.name + ' ' + c.dial); }
    function render() {
      var q = search.value.trim().toLowerCase().replace(/^\+/, '');
      shown = items.filter(function (i) { return !q || i.name.toLowerCase().indexOf(q) > -1 || i.dial.slice(1).indexOf(q) === 0 || i.label.toLowerCase() === q; });
      var cur = current();
      list.innerHTML = shown.map(function (i, k) {
        return '<li role="option" id="' + uid + '-' + k + '" data-k="' + k + '" aria-selected="' + (i === cur) + '" class="' + (k === active ? 'is-active' : '') + '">' +
          flagImg(i.label) + '<span class="cc__name">' + esc(i.name) + '</span><span class="cc__dial">' + i.dial + '</span></li>';
      }).join('') || '<li class="cc__none">No matching country</li>';
      list.setAttribute('aria-activedescendant', shown.length ? uid + '-' + active : '');
    }
    // The panel is positioned against the viewport so cards with rounded,
    // clipped corners (the boarding pass, the modal) never cut it off.
    function place() {
      var r = btn.getBoundingClientRect(), h = Math.min(330, window.innerHeight - 24);
      var below = window.innerHeight - r.bottom - 12;
      panel.style.left = Math.max(12, Math.min(r.left, window.innerWidth - 312)) + 'px';
      panel.style.top = (below >= h || below > r.top ? r.bottom + 6 : Math.max(12, r.top - 6 - panel.offsetHeight)) + 'px';
    }
    function open() {
      panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); wrap.classList.add('is-open');
      place();
      search.value = ''; active = Math.max(0, items.indexOf(current())); render();
      place();
      setTimeout(function () { search.focus({ preventScroll: true }); var a = $('.is-active', list); if (a) list.scrollTop = a.offsetTop - list.clientHeight / 2; }, 20);
    }
    function close(focusBtn) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); wrap.classList.remove('is-open'); if (focusBtn) btn.focus(); }
    function choose(i) {
      var opt = Array.prototype.filter.call(sel.options, function (o) { return o.value === i.dial && o.textContent.indexOf(i.label) === 0; })[0];
      if (opt) sel.value = opt.value, opt.selected = true;
      paintBtn(); close(true);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    btn.addEventListener('click', function () { panel.hidden ? open() : close(); });
    search.addEventListener('input', function () { active = 0; render(); });
    search.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(shown.length - 1, active + 1); render(); var a = $('.is-active', list); if (a) list.scrollTop = Math.max(0, a.offsetTop - list.clientHeight + a.offsetHeight); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); render(); var b = $('.is-active', list); if (b && b.offsetTop < list.scrollTop) list.scrollTop = b.offsetTop; }
      else if (e.key === 'Enter') { e.preventDefault(); if (shown[active]) choose(shown[active]); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
    });
    list.addEventListener('click', function (e) { var li = e.target.closest('li[data-k]'); if (li) choose(shown[+li.getAttribute('data-k')]); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target) && !panel.contains(e.target)) close(); });
    window.addEventListener('scroll', function () { if (!panel.hidden) place(); }, { passive: true });
    window.addEventListener('resize', function () { if (!panel.hidden) place(); });
    var form = sel.closest('form');
    if (form) form.addEventListener('reset', function () { setTimeout(function () { paintBtn(); showHint(sel); }, 0); });
    sel.addEventListener('change', paintBtn);
    paintBtn();
  }

  function initForms() {
    $$('[data-cc]').forEach(function (sel) {
      sel.innerHTML = COUNTRY_CODES.map(function (c) {
        var want = CC_LABEL[ORIGIN.iso] || ORIGIN.iso;
        var hasWant = COUNTRY_CODES.some(function (x) { return x[0] === want; });
        var on = hasWant ? c[0] === want : c[1] === '+91';
        return '<option value="' + c[1] + '"' + (on ? ' selected' : '') + '>' + c[0] + ' (' + c[1] + ')</option>';
      }).join('');
      initCountryPicker(sel);
      showHint(sel);
    });

    // Live feedback: check each field when the visitor leaves it, and clear
    // the error as soon as what they type becomes valid.
    $$('form[data-lead-form]').forEach(function (form) {
      var cc = $('[data-cc]', form), ph = $('input[name="phone_number"]', form), em = $('input[name="email"]', form);
      function checkPhone(final) {
        if (!ph || !cc) return true;
        if (!ph.value.trim() && !final) { setFieldState(ph, null); showHint(cc); return false; }
        var r = validatePhone(cc.value, ph.value);
        if (r.ok) { setFieldState(ph, 'ok'); showHint(cc); } else if (final || ph.closest('.field').classList.contains('is-invalid')) setFieldState(ph, 'bad', r.msg);
        return r.ok;
      }
      function checkEmail(final) {
        if (!em) return true;
        if (!em.value.trim() && !final) { setFieldState(em, null); return false; }
        var r = validateEmail(em.value);
        if (r.ok) setFieldState(em, 'ok');
        else if (final || em.closest('.field').classList.contains('is-invalid')) setFieldState(em, 'bad', r.msg, r.suggest);
        return r.ok;
      }
      if (ph) { ph.addEventListener('blur', function () { if (ph.value.trim()) checkPhone(true); }); ph.addEventListener('input', function () { checkPhone(false); }); }
      if (em) { em.addEventListener('blur', function () { if (em.value.trim()) checkEmail(true); }); em.addEventListener('input', function () { checkEmail(false); }); }
      if (cc) cc.addEventListener('change', function () { showHint(cc); if (ph && ph.value.trim()) checkPhone(true); });
      form.addEventListener('reset', function () { [ph, em].forEach(function (i) { if (i) setFieldState(i, null); }); });
    });

    $$('form[data-lead-form]').forEach(function (form) {
      var btn = $('[data-submit-btn]', form);
      var okBox = $('[data-form-success]', form);
      var errBox = $('[data-form-error]', form);

      function status(state, msg) {
        if (okBox) okBox.classList.toggle('hidden', state !== 'success');
        if (errBox) {
          errBox.classList.toggle('hidden', state !== 'error');
          if (state === 'error' && msg) ($('[data-form-error-text]', errBox) || errBox).textContent = msg;
        }
      }

      form.addEventListener('submit', function (e) {
        e.preventDefault();
        status('idle');
        var data = {};
        new FormData(form).forEach(function (v, k) { data[k] = v; });

        if (String(data.name || '').trim().length < 2) { status('error', 'Enter your full name.'); return; }
        var phIn = $('input[name="phone_number"]', form), emIn = $('input[name="email"]', form);
        var pv = validatePhone(data.country_code || '+91', data.phone_number);
        if (!pv.ok) { setFieldState(phIn, 'bad', pv.msg); status('error', pv.msg); phIn.focus(); return; }
        var ev = validateEmail(data.email);
        if (!ev.ok) { setFieldState(emIn, 'bad', ev.msg, ev.suggest); status('error', ev.msg); emIn.focus(); return; }

        if (typeof data.note === 'string') data.note = data.note.trim().slice(0, 250);
        data.phone = data.country_code + ' ' + pv.national;
        data.email = ev.email;
        delete data.country_code;
        delete data.phone_number;
        data.page = enquiryPage();

        var label = btn ? btn.textContent : '';
        if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }

        domainReceivesMail(ev.email.split('@')[1]).then(function (okDomain) {
          if (!okDomain) {
            var msg = "That email domain can't receive mail. Please check the spelling after the @.";
            setFieldState(emIn, 'bad', msg); status('error', msg);
            if (btn) { btn.disabled = false; btn.textContent = label; }
            return null;
          }
          if (btn) btn.textContent = 'Submitting…';
          return fetch(ENQUIRY_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data)
        })
          .then(function (r) { return r.json().catch(function () { return { success: false }; }); })
          .then(function (res) {
            if (res && res.success) {
              status('success');
              form.reset();
              document.dispatchEvent(new CustomEvent('tc:submitted', { detail: { form: form } }));
              setTimeout(function () { status('idle'); }, 6000);
            } else {
              status('error', (res && res.message) || 'Something went wrong. Please try again.');
            }
          })
          .catch(function () { status('error', 'Network error. Check your connection and try again.'); })
          .then(function () { if (btn) { btn.disabled = false; btn.textContent = label; } });
        });
      });
    });

    // A university picked elsewhere pre-fills the enquiry.
    try {
      var picked = localStorage.getItem('selectedUniversity');
      if (picked && isHome()) {
        localStorage.removeItem('selectedUniversity');
        setDestination(picked);
      }
    } catch (err) { /* storage unavailable */ }
  }

  function setDestination(text, scope) {
    $$('[data-destination-input]', scope).forEach(function (i) { i.value = text; });
    $$('[data-destination-label]', scope).forEach(function (l) { l.textContent = text; });
  }

  /* ------------------------------------------------------------------ *
   * AI counsellor chat
   * ------------------------------------------------------------------ */
  var CHAT_WELCOME = "Hi! 👋 I'm your **Tutee Connect AI Counsellor**.\n\nI can answer questions about Irish Student Visas, top Irish universities and our 99% success rate programmes. How can I help you today?";

  function mdToHtml(s) {
    return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
  }

  function cannedReply(text) {
    var q = text.toLowerCase();
    if (/visa|stamp 2|avats|interview|refus/.test(q))
      return 'The Irish Student Visa lets you study a programme on Ireland’s official register on Stamp 2 permission. Tutee Connect has a **99% Irish Student Visa success rate**. We handle your Letter of Acceptance, proof of funds, medical insurance and AVATS application so nothing is missing.';
    if (/scholarship|fund|financial|aid|bursar|loan/.test(q))
      return 'Many top Irish universities offer merit-based scholarships and international bursaries. We analyse your academic profile and help you apply where you have the best chance of funding. We can also arrange **collateral and non-collateral education loans** through our banking partners.';
    if (/cost|fee|tuition|money|expense|budget|afford/.test(q))
      return 'Costs depend on your institution and course, and you also need to show funds for your living costs for one academic year on top of your fees. Our counsellors can give you a **personal estimate**, and we help students secure **non-collateral education loans** and part-time work.';
    if (/job|work|earn|part.?time|graduate programme|stamp 1g/.test(q))
      return "Yes! On Stamp 2 you can work up to **20 hours a week during term time**, and **40 hours a week** from June to September and between 15 December and 15 January. After you graduate, the **Third Level Graduate Programme** lets you stay and work for 12 months, or up to 24 with a Master's or PhD.";
    if (/ielts|pte|duolingo|toefl|gmat|exam|english/.test(q))
      return 'Most institutions ask for an English test: **IELTS, PTE Academic, TOEFL or the Duolingo English Test**. Some postgraduate courses such as MBAs also ask for a GMAT score. We can shortlist universities that match your current scores.';
    if (/family|spouse|partner|wife|husband|child|dependant/.test(q))
      return 'Ireland does not normally grant dependant permission to students. Family reunification opens up once you hold a **Critical Skills Employment Permit**, which lets your partner and children join you immediately. We plan that timeline with you from the start.';
    if (/tutee|connect|service|help/.test(q))
      return 'Tutee Connect supports you end to end: university shortlisting and applications, study visa documentation, education loans and post-landing settlement in Ireland.';
    return "Great question! Studying in Ireland has a lot of moving parts (admissions, Letter of Acceptance, AVATS, proof of funds, loans), and our experts at Tutee Connect will work through every detail with you.";
  }

  function initChat() {
    var panel = $('[data-chat]');
    var launcher = $('[data-chat-open]');
    if (!panel || !launcher) return;
    var list = $('[data-chat-msgs]', panel);
    var form = $('[data-chat-form]', panel);
    var input = $('[data-chat-input]', panel);
    var sendBtn = $('[data-chat-send]', panel);
    var typing = $('[data-chat-typing]', panel);
    var chipRow = $('[data-chat-chips]', panel);
    var stage = 'idle', lead = { name: '', phone: '', email: '' }, askedForDetails = false, seeded = false;

    function clock() { return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    function push(role, content, before) {
      var me = role === 'user';
      var wrap = document.createElement('div');
      wrap.className = 'msg' + (me ? ' msg--me' : '');
      wrap.innerHTML = '<div class="msg__av">' + (me ? icon('i-user') : '<img src="./assets/img/logo/icon.png" alt="">') + '</div>' +
        '<div class="msg__b">' + mdToHtml(content) + '<span class="msg__t">' + clock() + '</span></div>';
      list.insertBefore(wrap, before || typing);
      list.scrollTop = list.scrollHeight;
    }
    function setTyping(on) { typing.classList.toggle('hidden', !on); list.scrollTop = list.scrollHeight; }
    function seed() {
      if (seeded) return;
      seeded = true;
      push('assistant', CHAT_WELCOME, chipRow);
    }
    function open() {
      seed();
      panel.classList.add('is-open');
      panel.setAttribute('aria-hidden', 'false');
      launcher.classList.add('is-hidden');
      setTimeout(function () { input.focus(); }, 300);
    }
    function close() {
      panel.classList.remove('is-open');
      panel.setAttribute('aria-hidden', 'true');
      launcher.classList.remove('is-hidden');
      launcher.focus();
    }
    function reset() {
      $$('.msg', list).forEach(function (n) { n.remove(); });
      stage = 'idle'; lead = { name: '', phone: '', email: '' }; askedForDetails = false; seeded = false;
      chipRow.classList.remove('hidden');
      input.value = ''; syncSend(); setTyping(false);
      seed();
    }
    function submitLead() {
      return fetch(ENQUIRY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          subject: 'New Lead from Chatbot!', from_name: 'Tutee AI Counsellor',
          name: lead.name, phone: lead.phone, email: lead.email,
          destination: 'Chatbot General Inquiry', page: enquiryPage()
        })
      }).then(function (r) { return r.json().catch(function () { return { success: false }; }); });
    }
    function later(ms, fn) { setTyping(true); setTimeout(function () { setTyping(false); fn(); }, ms); }

    function send(text) {
      if (!text || !text.trim()) return;
      text = text.trim();
      push('user', text);
      input.value = ''; syncSend();
      chipRow.classList.add('hidden');

      if (stage === 'asking_name') {
        return later(600, function () {
          lead.name = text; stage = 'asking_phone';
          push('assistant', 'Thanks ' + text.split(' ')[0] + '! What is the best **phone number** (with country code) to reach you on?');
        });
      }
      if (stage === 'asking_phone') {
        return later(600, function () {
          var pr = validatePhoneLoose(text);
          if (!pr.ok) { push('assistant', pr.msg); return; }
          lead.phone = pr.full; stage = 'asking_email';
          push('assistant', 'Got it. Lastly, what is your **email address**?');
        });
      }
      if (stage === 'asking_email') {
        return later(600, function () {
          var er = validateEmail(text);
          if (!er.ok) { push('assistant', er.msg + (er.suggest ? ' If so, just type it again.' : '')); return; }
          lead.email = er.email; stage = 'idle';
          push('assistant', 'Perfect! Sending your profile to our experts now…');
          setTyping(true);
          submitLead().then(function (res) {
            setTyping(false);
            push('assistant', res && res.success
              ? '✅ **Done!** Your profile is with an expert counsellor, who will contact you shortly about admission and visas.\n\nAnything else I can help with in the meantime?'
              : 'Something went wrong sending your profile. Please use the contact form on this page instead.');
          }).catch(function () {
            setTyping(false);
            push('assistant', 'Network error while sending. Please use the contact form on this page instead.');
          });
        });
      }
      if (/^(evaluate my profile|book free counselling)$/i.test(text)) {
        return later(500, function () {
          stage = 'asking_name';
          push('assistant', "Happy to book your free counselling session! A human counsellor will review your profile personally.\n\nCould I have your **full name**?");
        });
      }
      later(700, function () {
        push('assistant', cannedReply(text));
        if (!askedForDetails) {
          askedForDetails = true;
          later(1400, function () {
            stage = 'asking_name';
            push('assistant', 'To give you advice tailored to your profile, could I take your **full name**?');
          });
        }
      });
    }

    function syncSend() { sendBtn.disabled = !input.value.trim(); }
    input.addEventListener('input', syncSend);
    form.addEventListener('submit', function (e) { e.preventDefault(); send(input.value); });
    $$('button', chipRow).forEach(function (c) { c.addEventListener('click', function () { send(c.textContent); }); });
    launcher.addEventListener('click', open);
    $$('[data-chat-open-inline]').forEach(function (b) { b.addEventListener('click', open); });
    $$('[data-chat-close]', panel).forEach(function (b) { b.addEventListener('click', close); });
    $$('[data-chat-reset]', panel).forEach(function (b) { b.addEventListener('click', reset); });
    $$('[data-chat-contact]', panel).forEach(function (b) {
      b.addEventListener('click', function () { close(); goToSection('contact'); });
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('is-open')) close(); });
  }

  /* ------------------------------------------------------------------ *
   * University directory (universities.html)
   * ------------------------------------------------------------------ */
  /* Map coordinates for every town in the dataset, in the map's viewBox. */
  var CITY_XY = {
    'Dublin': [274, 225], 'Cork': [143, 370], 'Galway': [108, 233], 'Limerick': [133, 294], 'Waterford': [224, 334],
    'Maynooth': [255, 222], 'Athlone': [174, 218], 'Dundalk': [266, 160], 'Sligo': [143, 133], 'Letterkenny': [187, 65],
    'Carlow': [234, 276], 'Tralee': [72, 330], 'Wexford': [262, 326], 'Dun Laoghaire': [284, 234], 'Bray': [283, 245],
    'Naas': [250, 238], 'Malahide': [281, 214], 'Killarney': [84, 352], 'Schull': [84, 400], 'Cahersiveen': [46, 362],
    'Bundoran': [154, 112]
  };
  var LABELLED = { 'Dublin': 1, 'Cork': 1, 'Galway': 1, 'Limerick': 1, 'Sligo': 1, 'Waterford': 1, 'Letterkenny': 1, 'Athlone': 1 };
  var TYPE_ORDER = ['University', 'Technological University', 'Institute of Technology', 'Specialist', 'College', 'Language School'];

  function fold(str) { return String(str || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function cityOf(u) { return String(u.location || '').split(',')[0].trim(); }

  function initDirectory() {
    var grid = $('[data-uni-grid]');
    if (!grid || !window.IE_UNIVERSITIES) return;

    var all = window.IE_UNIVERSITIES;
    var state = { q: '', type: 'All', city: null, sort: 'rank', view: 'grid', shown: 24 };
    var PAGE = 24;
    var selected = [];
    var filtered = all;

    var search = $('[data-uni-search]'), clearBtn = $('[data-uni-clear]');
    var typeBox = $('[data-uni-types]'), sortSel = $('[data-uni-sort]');
    var countEl = $('[data-uni-count]'), moreWrap = $('[data-uni-more-wrap]'), moreBtn = $('[data-uni-more]'), moreNote = $('[data-uni-more-note]');
    var emptyBox = $('[data-uni-empty]');
    var mapCities = $('[data-map-cities]'), tip = $('[data-map-tip]'), mapBox = $('[data-map]');
    var tray = $('[data-tray]'), trayCount = $('[data-tray-count]'), trayNames = $('[data-tray-names]');
    var modal = $('[data-modal]'), modalSubmit = $('[data-modal-submit]');
    var filters = $('[data-filters]');

    window.TC_applyUniversities = function (rows) {
      if (!Array.isArray(rows) || !rows.length) return false;
      all = rows; buildMap(); stats(); apply(); return true;
    };
    if (Array.isArray(window.TC_pendingUniversities) && window.TC_pendingUniversities.length) {
      all = window.TC_pendingUniversities; window.TC_pendingUniversities = null;
    }

    function hay(u) {
      if (u.__hay === undefined) u.__hay = fold([u.name, u.location, u.programs, u.type].join(' '));
      return u.__hay;
    }

    function stats() {
      var cities = {}, unis = 0, ranked = 0;
      all.forEach(function (u) { cities[cityOf(u)] = 1; if (u.type === 'University') unis++; if (u.ranked) ranked++; });
      var set = function (k, v) { $$('[data-stat="' + k + '"]').forEach(function (el) { el.textContent = v; }); };
      set('total', all.length); set('ranked', ranked); set('unis', unis); set('cities', Object.keys(cities).length);
    }

    /* --- Map --- */
    function buildMap() {
      if (!mapCities) return;
      var counts = {};
      all.forEach(function (u) { var c = cityOf(u); counts[c] = (counts[c] || 0) + 1; });
      var names = Object.keys(counts).filter(function (c) { return CITY_XY[c]; })
        .sort(function (a, b) { return counts[a] - counts[b]; });
      mapCities.innerHTML = names.map(function (c, i) {
        var xy = CITY_XY[c], r = (3.2 + Math.sqrt(counts[c]) * 1.25).toFixed(1);
        var label = LABELLED[c] ? '<text class="label" x="' + (xy[0] + (c === 'Dublin' ? 10 : -6)) + '" y="' + (xy[1] - (+r) - 5) + '" text-anchor="' + (c === 'Dublin' ? 'start' : 'middle') + '">' + esc(c) + '</text>' : '';
        return '<g class="city" tabindex="0" role="button" data-city="' + esc(c) + '" data-n="' + counts[c] + '" style="--i:' + i + '" aria-label="' + esc(c) + ', ' + counts[c] + ' institution' + (counts[c] === 1 ? '' : 's') + '">' +
          '<circle class="halo" cx="' + xy[0] + '" cy="' + xy[1] + '" r="' + r + '"/>' +
          '<circle class="core" cx="' + xy[0] + '" cy="' + xy[1] + '" r="' + r + '"/>' + label + '</g>';
      }).join('');
      $$('.city', mapCities).forEach(function (g) {
        var c = g.getAttribute('data-city');
        g.addEventListener('click', function () { setCity(state.city === c ? null : c, true); });
        g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCity(state.city === c ? null : c, true); } });
        g.addEventListener('pointerenter', function () { showTip(g); });
        g.addEventListener('focus', function () { showTip(g); });
        g.addEventListener('pointerleave', hideTip);
        g.addEventListener('blur', hideTip);
      });
      paintMap();
    }
    function showTip(g) {
      if (!tip || !mapBox) return;
      var core = $('.core', g).getBoundingClientRect(), box = mapBox.getBoundingClientRect();
      var n = +g.getAttribute('data-n');
      tip.innerHTML = esc(g.getAttribute('data-city')) + '<small>' + n + ' institution' + (n === 1 ? '' : 's') + '. Click to filter</small>';
      tip.style.left = (core.left - box.left + core.width / 2) + 'px';
      tip.style.top = (core.top - box.top) + 'px';
      tip.classList.add('on');
    }
    function hideTip() { if (tip) tip.classList.remove('on'); }
    function paintMap() {
      $$('.city', mapCities || document).forEach(function (g) { g.classList.toggle('is-on', g.getAttribute('data-city') === state.city); });
    }

    /* --- Filters --- */
    function baseFiltered() {
      var q = fold(state.q.trim());
      return all.filter(function (u) {
        if (state.city && cityOf(u) !== state.city) return false;
        return !q || hay(u).indexOf(q) > -1;
      });
    }

    function renderTypes(base) {
      if (!typeBox) return;
      var counts = {};
      base.forEach(function (u) { counts[u.type] = (counts[u.type] || 0) + 1; });
      var types = ['All'].concat(TYPE_ORDER.filter(function (t) { return counts[t] || state.type === t; }));
      Object.keys(counts).forEach(function (t) { if (types.indexOf(t) < 0) types.push(t); });
      var html = '';
      if (state.city) {
        html += '<button class="fchip fchip--city" type="button" data-clear-city aria-label="Remove city filter ' + esc(state.city) + '">' + icon('i-pin') + esc(state.city) + icon('i-x') + '</button>';
      }
      html += types.map(function (t) {
        var n = t === 'All' ? base.length : (counts[t] || 0);
        return '<button class="fchip" type="button" data-type="' + esc(t) + '" aria-pressed="' + (state.type === t) + '">' +
          esc(t === 'All' ? 'All types' : t) + '<em>' + n + '</em></button>';
      }).join('');
      typeBox.innerHTML = html;
      $$('[data-type]', typeBox).forEach(function (b) {
        b.addEventListener('click', function () { state.type = b.getAttribute('data-type'); apply(true); });
      });
      var cc = $('[data-clear-city]', typeBox);
      if (cc) cc.addEventListener('click', function () { setCity(null); });
    }

    function setCity(c, scroll) {
      state.city = c; paintMap(); apply(true);
      if (scroll && c && filters) {
        var y = filters.getBoundingClientRect().top + window.scrollY - 90;
        if (window.scrollY < y) window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
      }
    }

    function apply(resetPage) {
      var base = baseFiltered();
      renderTypes(base);
      filtered = state.type === 'All' ? base : base.filter(function (u) { return u.type === state.type; });
      filtered = filtered.slice().sort(state.sort === 'az'
        ? function (a, b) { return a.name.localeCompare(b.name); }
        : function (a, b) { return (a.rank || 9999) - (b.rank || 9999); });
      if (resetPage !== false) state.shown = PAGE;
      render(0);
    }

    /* --- Cards --- */
    function card(u, i) {
      var on = selected.indexOf(u.name) > -1;
      var subjects = String(u.programs || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean).slice(0, 5);
      var rank = u.ranked
        ? '<div class="rank is-ranked"><b>#' + esc(u.rank) + '</b><small>Irish position, QS Europe 2026</small></div>'
        : '<div class="rank"><b>' + icon('i-landmark') + '</b><small>On the official register</small></div>';
      return '<article class="ucard' + (on ? ' is-on' : '') + '" style="--i:' + i + '">' +
        '<div class="ucard__top">' + rank + '<span class="utype" data-t="' + esc(u.type) + '">' + esc(u.type) + '</span></div>' +
        '<h3>' + esc(u.name) + '</h3>' +
        '<p class="uloc">' + icon('i-pin') + esc(u.location) + '</p>' +
        (subjects.length ? '<div class="subjects">' + subjects.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="ucard__foot"><div>Eligible courses<b>' + esc(u.programmes || '—') + '</b></div>' +
        '<button class="pick" type="button" data-pick="' + esc(u.name) + '" aria-pressed="' + on + '"><i>' + icon(on ? 'i-check' : 'i-plus') + '</i>' + (on ? 'Shortlisted' : 'Shortlist') + '</button></div>' +
        '</article>';
    }

    function render(from) {
      var page = filtered.slice(0, state.shown);
      if (from > 0) {
        grid.insertAdjacentHTML('beforeend', page.slice(from).map(function (u, i) { return card(u, i); }).join(''));
      } else {
        grid.innerHTML = page.map(function (u, i) { return card(u, Math.min(i, 12)); }).join('');
      }
      bindPicks();
      var n = filtered.length;
      if (countEl) countEl.textContent = n + (n === 1 ? ' institution' : ' institutions') + (state.city ? ' in ' + state.city : '');
      if (emptyBox) emptyBox.classList.toggle('hidden', n !== 0);
      grid.classList.toggle('hidden', n === 0);
      if (moreWrap) moreWrap.classList.toggle('hidden', state.shown >= n);
      if (moreNote) moreNote.textContent = 'Showing ' + Math.min(state.shown, n) + ' of ' + n;
      if (clearBtn) clearBtn.classList.toggle('hidden', !state.q);
    }

    function bindPicks() {
      $$('[data-pick]:not([data-bound])', grid).forEach(function (b) {
        b.setAttribute('data-bound', '1');
        b.addEventListener('click', function () { toggle(b.getAttribute('data-pick'), b); });
      });
    }

    function toggle(name, btn) {
      var i = selected.indexOf(name);
      if (i > -1) selected.splice(i, 1); else selected.push(name);
      var on = i < 0;
      btn.setAttribute('aria-pressed', on);
      btn.innerHTML = '<i>' + icon(on ? 'i-check' : 'i-plus') + '</i>' + (on ? 'Shortlisted' : 'Shortlist');
      btn.closest('.ucard').classList.toggle('is-on', on);
      paintTray();
    }

    function paintTray() {
      var n = selected.length;
      if (tray) {
        tray.classList.toggle('is-on', n > 0);
        document.body.classList.toggle('has-tray', n > 0);
        if (trayCount) {
          trayCount.textContent = n;
          trayCount.classList.remove('bump'); trayCount.offsetWidth; trayCount.classList.add('bump');
        }
        if (trayNames) trayNames.innerHTML = esc(selected.slice(-2).join(', ')) + (n > 2 ? ' +' + (n - 2) + ' more' : '') +
          '<small>' + n + (n === 1 ? ' institution' : ' institutions') + ' shortlisted</small>';
      }
      try { if (selected.length) localStorage.setItem('tcShortlist', JSON.stringify(selected)); } catch (err) { /* storage off */ }
      var dest = selected.join(', ') || 'General Ireland Inquiry';
      setDestination(dest, modal || document);
      if (modalSubmit) modalSubmit.textContent = n ? 'Apply to ' + n + (n === 1 ? ' institution' : ' institutions') : 'Submit my profile';
    }

    function clearSelection() {
      selected = [];
      $$('[data-pick]', grid).forEach(function (b) {
        b.setAttribute('aria-pressed', 'false');
        b.innerHTML = '<i>' + icon('i-plus') + '</i>Shortlist';
        b.closest('.ucard').classList.remove('is-on');
      });
      paintTray();
    }

    /* --- Wiring --- */
    var t = null;
    if (search) search.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { state.q = search.value; apply(true); }, 120);
    });
    var searchForm = $('[data-uni-search-form]');
    if (searchForm) searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      state.q = search.value; apply(true);
      var y = filters ? filters.getBoundingClientRect().top + window.scrollY - 90 : 0;
      window.scrollTo({ top: y, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    if (clearBtn) clearBtn.addEventListener('click', function () { search.value = ''; state.q = ''; apply(true); search.focus(); });
    if (sortSel) sortSel.addEventListener('change', function () { state.sort = sortSel.value; apply(true); });
    $$('[data-view]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.view = b.getAttribute('data-view');
        $$('[data-view]').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        grid.classList.toggle('is-list', state.view === 'list');
      });
    });
    if (moreBtn) moreBtn.addEventListener('click', function () {
      var from = Math.min(state.shown, filtered.length);
      state.shown += PAGE; render(from);
    });
    $$('[data-uni-reset]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.q = ''; state.type = 'All'; state.city = null;
        if (search) search.value = '';
        paintMap(); apply(true);
      });
    });
    var trayClear = $('[data-tray-clear]');
    if (trayClear) trayClear.addEventListener('click', clearSelection);

    if (filters) onScrollFrame(function () {
      var stuckAt = parseFloat(getComputedStyle(filters).top) || 0;
      filters.classList.toggle('is-stuck', filters.getBoundingClientRect().top <= stuckAt + 0.5);
    });

    // Shortlist → application modal
    var lastFocus = null;
    function openModal() {
      if (!modal) return;
      lastFocus = document.activeElement;
      modal.classList.add('is-open');
      modal.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      setTimeout(function () { var f = $('input[name="name"]', modal); if (f) f.focus(); }, 300);
    }
    function closeModal() {
      if (!modal || !modal.classList.contains('is-open')) return;
      modal.classList.remove('is-open');
      modal.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    }
    // Shortlist -> the free counselling boarding pass on the home page
    $$('[data-tray-apply]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { localStorage.setItem('tcShortlist', JSON.stringify(selected)); } catch (err) { /* storage off */ }
        window.location.href = './index.html#contact';
      });
    });
    $$('[data-modal-close]').forEach(function (b) { b.addEventListener('click', closeModal); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

    buildMap();
    stats();
    apply(true);
    paintTray();
  }

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */
  window.TC_READY = true;
  initReveal();
  initDrawer();
  initScrollLinks();
  initHeaderScroll();
  initProgress();
  initHero();
  initMagnetic();
  initPanels();
  initServices();
  initBoard();
  initTabs();
  initWeek();
  initRoute();
  initFaq();
  applyOrigin();
  initForms();
  initTopics();
  initCheckin();
  initChat();
  initDirectory();
  initScrollEngine();

  if (window.location.hash.length > 1) {
    var id = decodeURIComponent(window.location.hash.slice(1));
    setTimeout(function () { var t = document.getElementById(id); if (t) t.scrollIntoView({ block: 'start' }); }, 350);
  }
})();
