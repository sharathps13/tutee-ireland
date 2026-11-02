/**
 * Writes the JavaScript-only content into the HTML, so search engines (and
 * visitors without JavaScript) get it without running any script.
 *
 *   node scripts/build-static.mjs
 *
 * The data files stay the single source of truth; this script only copies
 * them into marked blocks of the pages, replacing whatever is between the
 * markers. Run it again after editing any of them:
 *
 *   assets/js/services-data.js     -> index.html        static:services   (the nine service descriptions)
 *   STOPS in assets/js/main.js     -> index.html        static:stops-main, static:stops-help (the four route stops)
 *   assets/js/universities-data.js -> universities.html static:directory  (all institutions, A to Z by rank)
 *
 * main.js shows these blocks instead of building the same markup itself:
 * the service sheet and the route details switch between the static panes,
 * and the directory replaces its static list with the interactive cards.
 * Zero dependencies; Node 18+.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Run a browser data file that assigns to window.X and return window. */
function loadData(file) {
  const sandbox = { window: {} };
  vm.runInNewContext(read(file), sandbox, { filename: file });
  return sandbox.window;
}

/** The STOPS array literal from main.js, evaluated on its own. */
function loadStops() {
  const src = read('assets/js/main.js');
  const m = /var STOPS = (\[[\s\S]*?\n {2}\]);/.exec(src);
  if (!m) throw new Error('STOPS not found in assets/js/main.js');
  return vm.runInNewContext(m[1]);
}

/** Replace what sits between <!-- static:NAME:start ... --> and <!-- static:NAME:end -->,
 * keeping the markers, their indentation and the file's line endings. */
function fill(html, name, lines, indent) {
  const eol = html.includes('\r\n') ? '\r\n' : '\n';
  const re = new RegExp(`(<!-- static:${name}:start[^>]*-->)[\\s\\S]*?([ \\t]*<!-- static:${name}:end -->)`);
  if (!re.test(html)) throw new Error(`markers for static:${name} not found`);
  const body = lines.map((l) => indent + l).join(eol);
  return html.replace(re, (all, start, end) => `${start}${eol}${body}${eol}${end}`);
}

const paragraphs = (s) => String(s).split(/\n\s*\n/).map((p) => `<p>${esc(p.trim())}</p>`).join('');

// ---------------------------------------------------------------- index.html
const services = loadData('assets/js/services-data.js').IE_SERVICES;
const stops = loadStops();
let index = read('index.html');

index = fill(index, 'services', services.map((s, i) =>
  `<div class="svc-copy" data-svc-copy="${i}"${i ? ' hidden' : ''}>${paragraphs(s.desc)}</div>`), '      ');

index = fill(index, 'stops-main', stops.map((s, i) =>
  `<div class="sd-pane" data-sd-pane="${i}"${i ? ' hidden' : ''}>`
  + `<span class="sd-tag" data-sd>${esc(s.tag)}</span>`
  + `<h3 data-sd>${esc(s.title)}</h3>`
  + `<p data-sd>${esc(s.what)}</p>`
  + `<div class="sd-facts" data-sd>${s.facts.map((f) => `<div class="sd-fact"><span>${esc(f[0])}</span><b>${esc(f[1])}</b></div>`).join('')}</div>`
  + '</div>'), '        ');

index = fill(index, 'stops-help', stops.map((s, i) =>
  `<ul class="sd-help" data-sd data-sd-pane="${i}"${i ? ' hidden' : ''}>`
  + s.help.map((h) => `<li><svg aria-hidden="true"><use href="#i-check-c"/></svg><span>${esc(h)}</span></li>`).join('')
  + '</ul>'), '        ');

writeFileSync(join(ROOT, 'index.html'), index);

// --------------------------------------------------------- universities.html
const unis = loadData('assets/js/universities-data.js').IE_UNIVERSITIES;
let dir = read('universities.html');
dir = fill(dir, 'directory', [
  `<ol class="ustatic" aria-label="All ${unis.length} institutions">`,
  ...unis.map((u) => `  <li><b>${esc(u.name)}</b><span>${esc(u.location)} · ${esc(u.type)}</span></li>`),
  '</ol>',
], '    ');
writeFileSync(join(ROOT, 'universities.html'), dir);

console.log(`static blocks written: ${services.length} services, ${stops.length} stops, ${unis.length} institutions`);
