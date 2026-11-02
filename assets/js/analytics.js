/* Tutee Connect analytics: Google Analytics 4 behind a consent banner.
 *
 * OFF until GA_ID below is filled in. While it is empty nothing is loaded, no
 * banner is shown and no cookie is set; tcTrack() only records events in
 * window.dataLayer, which nothing reads.
 *
 * Once GA_ID is set (and the CSP in netlify.toml allows googletagmanager.com):
 *   - a small banner asks for consent; nothing loads until the visitor accepts
 *   - Consent Mode v2 defaults are all "denied"; accepting grants analytics only
 *     (ad_storage stays denied: no ad tags are run from here)
 *   - the choice is remembered in localStorage ("tc_consent")
 *   - an "Analytics settings" link is added to the footer (any element with
 *     data-consent-settings works too) so the visitor can change their mind;
 *     withdrawing consent stops collection and clears the _ga cookies
 *
 * Load with:  <script src="./assets/js/analytics.js" data-country="Finland"
 *               data-form-section="contact" defer></script>
 *   data-country       sent with every event (one GA4 property for all six sites)
 *   data-form-section  id of the enquiry section; clicks on links to it set cta_source
 *   data-page          "directory" on the universities page fires directory_view
 *
 * Events this file fires by itself: whatsapp_click, phone_click, form_start,
 * directory_view. The page's own code calls tcTrack() for form_step_2,
 * generate_lead (only after /api/enquiry answers success), chat_lead and
 * shortlist_add. Never pass a name, email, phone, state or free text. */
(function () {
  'use strict';

  var GA_ID = '';  // e.g. 'G-XXXXXXXXXX'. Empty = analytics off.
  var PRIVACY_URL = 'https://tuteeconnect.com/privacy-policy.html';
  var KEY = 'tc_consent';

  var me = document.currentScript || {};
  var data = me.dataset || {};
  var COUNTRY = data.country || '';
  var FORM_SECTION = data.formSection || 'contact';

  window.dataLayer = window.dataLayer || [];
  var gtagReady = false;

  function gtag() { window.dataLayer.push(arguments); }

  function store(value) {
    try {
      if (value === undefined) return window.localStorage.getItem(KEY);
      window.localStorage.setItem(KEY, value);
    } catch (e) { /* private mode or blocked storage: ask again next visit */ }
    return null;
  }

  /** Record an event. Sent to GA4 only after consent; always kept in dataLayer. */
  function track(name, params) {
    var p = { country: COUNTRY };
    for (var k in params) if (Object.prototype.hasOwnProperty.call(params, k)) p[k] = params[k];
    if (gtagReady) gtag('event', name, p);
    else window.dataLayer.push(Object.assign({ event: name }, p));
  }
  window.tcTrack = track;

  function loadGA() {
    if (gtagReady || !GA_ID) return;
    gtag('consent', 'default', {
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      analytics_storage: 'denied', wait_for_update: 500
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('js', new Date());
    gtag('config', GA_ID, { country: COUNTRY });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
    gtagReady = true;
  }

  /** Withdraw consent: GA stops collecting and its cookies are removed. */
  function revokeGA() {
    if (gtagReady) gtag('consent', 'update', { analytics_storage: 'denied' });
    var host = location.hostname.split('.').slice(-2).join('.');
    document.cookie.split(';').forEach(function (c) {
      var name = c.split('=')[0].trim();
      if (!/^_ga/.test(name)) return;
      ['', '; domain=' + location.hostname, '; domain=.' + host].forEach(function (d) {
        document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/' + d;
      });
    });
  }

  var styled = false;
  function banner(focus) {
    if (document.querySelector('.tc-consent')) return;
    if (!styled) { styled = true; addStyles(); }
    var box = document.createElement('div');
    box.className = 'tc-consent';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Analytics consent');
    box.innerHTML =
      '<p>May we use Google Analytics to see which parts of this page help students? ' +
      'It never receives your name, email or phone number. You can change this later from ' +
      '"Analytics settings" at the bottom of the page. ' +
      '<a href="' + PRIVACY_URL + '" target="_blank" rel="noopener">Privacy policy</a></p>' +
      '<div class="tc-consent__row"><button type="button" data-no>No thanks</button>' +
      '<button type="button" data-yes>Allow analytics</button></div>';
    box.addEventListener('click', function (e) {
      var yes = e.target.closest('[data-yes]');
      if (!yes && !e.target.closest('[data-no]')) return;
      store(yes ? 'granted' : 'denied');
      box.remove();
      if (yes) {
        if (gtagReady) gtag('consent', 'update', { analytics_storage: 'granted' });
        else loadGA();
      } else revokeGA();
    });
    document.body.appendChild(box);
    if (focus) box.querySelector('[data-no]').focus({ preventScroll: true });
  }

  /** A quiet footer link that reopens the banner, so consent can be changed. */
  function settingsLink() {
    var foot = document.querySelector('footer');
    if (!foot || foot.querySelector('[data-consent-settings]')) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tc-consent-settings';
    b.setAttribute('data-consent-settings', '');
    b.textContent = 'Analytics settings';
    foot.appendChild(b);
  }

  function addStyles() {
    var css = document.createElement('style');
    css.textContent =
      '.tc-consent{position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:520px;' +
      'margin:0 auto;background:#fff;color:#14213d;border-radius:14px;box-shadow:0 12px 40px rgba(0,0,0,.22);' +
      'padding:16px 18px;font-family:inherit;font-size:14px;font-weight:500;line-height:1.5}' +
      '.tc-consent p{margin:0 0 12px}.tc-consent a{color:inherit;text-decoration:underline}' +
      '.tc-consent__row{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}' +
      '.tc-consent button{font:inherit;font-weight:700;border-radius:999px;padding:9px 18px;cursor:pointer;' +
      'border:1.5px solid #14213d;background:#fff;color:#14213d}' +
      '.tc-consent button[data-yes]{background:#14213d;color:#fff}' +
      '.tc-consent-settings{display:block;margin:12px auto 0;padding:6px 10px;background:none;border:0;' +
      'font:inherit;font-size:12px;color:inherit;opacity:.75;text-decoration:underline;cursor:pointer}';
    document.head.appendChild(css);
  }

  if (GA_ID) {
    // Any data-consent-settings control (the footer link, or one a page adds) reopens the choice.
    document.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('[data-consent-settings]')) banner(true);
    });
    var whenReady = function (fn) { if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn); };
    whenReady(function () { if (!styled) { styled = true; addStyles(); } settingsLink(); });
    var choice = store();
    if (choice === 'granted') loadGA();
    else if (choice !== 'denied') {
      if (document.body) banner();
      else document.addEventListener('DOMContentLoaded', banner);
    }
  }

  /* ------------------------------------------------------------ auto events */
  function placement(el) {
    if (el.closest('header, .nav, .header')) return 'header';
    if (el.closest('footer')) return 'footer';
    var s = el.closest('section[id], [data-section]');
    if (s) return s.id || s.getAttribute('data-section');
    if (el.closest('[class*="float"], [class*="fab"], [class*="wa-"]')) return 'floating';
    return 'page';
  }

  function slug(text) {
    return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  }

  /** Remember which button sent the visitor to the form, in every lead form. */
  function setCta(label) {
    var inputs = document.querySelectorAll('input[name="cta_source"]');
    for (var i = 0; i < inputs.length; i++) inputs[i].value = label;
  }
  window.tcSetCta = setCta;

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('a, button, [data-cta]');
    if (!el) return;
    var href = el.getAttribute('href') || '';
    if (/wa\.me|whatsapp\.com/i.test(href)) track('whatsapp_click', { placement: placement(el) });
    else if (/^tel:/i.test(href)) track('phone_click', { placement: placement(el) });

    var cta = el.getAttribute('data-cta');
    var toForm = href === '#' + FORM_SECTION || /#contact$|#enquire$|#enquiry$/.test(href);
    if (cta || toForm) setCta(cta || (placement(el) + ':' + slug(el.textContent)));
  }, true);

  var started = false;
  function onFormTouch(e) {
    if (started) return;
    var form = e.target.closest && e.target.closest('form');
    if (!form || !form.querySelector('input[name="email"]')) return;
    started = true;
    var loc = form.querySelector('input[name="form_location"]');
    track('form_start', { form_location: loc ? loc.value : FORM_SECTION });
  }
  document.addEventListener('focusin', onFormTouch);
  document.addEventListener('change', onFormTouch);

  if (data.page === 'directory') track('directory_view', {});
})();
