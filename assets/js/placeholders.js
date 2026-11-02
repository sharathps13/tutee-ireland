/* Tutee Connect placeholder guard (the same file on all six destination sites).
 *
 * Content marked data-placeholder-content (today: the student testimonials and
 * the menu links to them) is illustrative, written during development. It must
 * never be published as real student reviews, so:
 *   - on localhost and Netlify deploy previews it shows, with its
 *     "Illustrative examples" label (.tc-illustrative);
 *   - on the six live hosts below it is hidden before the page paints.
 *
 * To publish genuine testimonials: replace the cards with quotes the students
 * have agreed to share (real first name, course, year), delete the
 * .tc-illustrative label, and remove data-placeholder-content from the section
 * and from its menu links. Do not add Review or AggregateRating markup for them.
 *
 * Loaded in <head> without defer so the live hosts never flash the content. */
(function () {
  'use strict';
  var LIVE = /^(sgtutee|irelandtutee|finlandtutee|uktutee|polandtutee|nztutee)\.netlify\.app$/;
  var css = document.createElement('style');
  css.textContent =
    '.tc-illustrative{display:block;width:fit-content;max-width:100%;margin:14px 0 18px;padding:6px 12px;' +
    'border:1.5px dashed currentColor;border-radius:8px;font-size:13px;font-weight:700;line-height:1.4;opacity:.85}' +
    '.tc-live [data-placeholder-content]{display:none!important}';
  document.head.appendChild(css);
  if (LIVE.test(location.hostname)) document.documentElement.classList.add('tc-live');
})();
