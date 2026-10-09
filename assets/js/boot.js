/* Runs in <head> before first paint: flags that JS is available so the CSS can
   hide reveal-on-scroll content until main.js animates it in. Without JS the
   page stays fully visible. External because the CSP forbids inline scripts. */
document.documentElement.className = document.documentElement.className.replace(/\bno-js\b/, 'js');
/* Safety net: if main.js never boots (blocked, failed to load), show everything. */
setTimeout(function () {
  if (!window.TC_READY) document.documentElement.className = document.documentElement.className.replace(/\bjs\b/, 'no-js');
}, 4000);
/* A reload always starts at the top (the hero), even if the address still
   carries a #section from an earlier click. Links from other pages that point
   at a section (e.g. universities.html -> index.html#contact) still work. */
(function () {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  var reloaded = nav ? nav.type === 'reload' : (performance.navigation && performance.navigation.type === 1);
  if (reloaded) {
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo(0, 0);
    window.addEventListener('load', function () { window.scrollTo(0, 0); });
  }
})();
