# Tutee Connect — Ireland landing page

The Ireland study-abroad landing page and its university directory. Hand-written static HTML, CSS
and vanilla JS: no framework, no build step.

## Design

The page is a **route map**. Its palette joins the Irish tricolour (shamrock green, white, orange)
to the Tutee Connect mark (deep teal and claret rings, gold eagle): forest `#0c3a33`, shamrock
`#169b62`, amber `#f2922b`, gold `#f9c74f`, claret `#7a1414` on mist `#eff4ee`. Headings use
Bricolage Grotesque (Google Fonts); body copy uses the self-hosted Quicksand.

| Section | Layout and motion |
| --- | --- |
| Hero | The Cliffs of Moher sunset photo as a WebGL cinemagraph (`assets/js/hero-fx.js`): the sea swells shorewards in perspective and glitters where the sun hits it, foam breathes at the cliff foot, clouds drift and reshape (slower near the horizon), the foreground grass sways in gusts, and the low sun glows. Cliffs, sea stack, tower and beach stay perfectly still, using sea, sky and grass masks computed from the photo's own colours at load time. Runs at 30 fps, pauses off-screen, and falls back to the still photo without WebGL, with reduced motion or with data saver. A deck of seven polaroids sits alongside. |
| Marquee band | Tricolour-edged ticker of the 12 ranked universities. |
| Why Ireland | Five photo panels, all photographed in Ireland, that expand on hover or tap and auto-cycle (with a progress bar) until the visitor takes over. |
| What we do | Bento grid of the nine services: photo tiles, colour tiles, 3D tilt and a cursor spotlight. Any tile opens a detail dialog (bottom sheet on phones) with previous/next. |
| Universities | Airport departures board of the 12 ranked universities with split-flap codes; picking a row flips the boarding pass beside it, whose button pre-fills the counselling form. The pass's departure code is the visitor's country, guessed from the browser's time zone (no network lookup), falling back to IND or UAE. |
| Funding | Three tabs: scholarships, loans with partner logos, part-time work with an interactive hours planner. |
| Settle | Four-stop route that draws on scroll. Tapping a stop flies a pin along the line and opens its details: what it is, key facts, how we help. |
| Stories | Two counter-scrolling rows of testimonials that pause on hover. |
| FAQ | Pick a question on the left and its answer card swaps in on the right, with previous/next buttons. The Tutee AI chatbot lives only behind its button at the bottom right. |
| Free counselling | A two-step boarding-pass check-in: the stub previews the passenger name and topic live, a plane flies from the visitor's country to DUB as fields are filled, and a "Checked in" stamp lands on success. |

Sections overlap like stacked sheets, the header hides on scroll down, and a route-line rail on the
right (desktop) or a tricolour progress bar (mobile) shows where you are and how much is left.
Everything respects `prefers-reduced-motion`.

`universities.html` opens on an Ireland map that draws itself; each town is a pulsing dot sized by
its number of institutions, and clicking one filters the directory. Type chips (with live counts),
sort, grid/list view, a shortlist tray and an apply modal complete it.

**No monetary amounts appear anywhere** on the site, including the chatbot replies. Keep it that
way when editing copy.

## Files

```
index.html                      landing page
universities.html               institution directory
assets/css/site.css             all styles
assets/css/quicksand.css        body webfont, self-hosted
assets/js/boot.js               sets the `js` class before first paint (CSP forbids inline scripts)
assets/js/hero-fx.js            the living hero photo (WebGL cinemagraph); window.TC_heroFx.snapshot(t) renders a frame for inspection
assets/js/main.js               every interaction on both pages
assets/js/services-data.js      the nine services (title, tagline, icon id, description)
assets/js/universities-data.js  113 institutions from Ireland's official registers
assets/js/supabase-*.js         optional live copy of the dataset, bundled file as fallback
assets/img/                     logo, loan-partner logos, CC-BY photos + CREDITS.md
netlify/functions/enquiry.mjs   emails enquiries; both forms and the chatbot post to /api/enquiry
```

The two pages share the header, footer, chat and icon sprite by copy. If you change one, change the
other.

Most photographs are hot-linked from Unsplash (`images.unsplash.com`) under the Unsplash License,
which allows free commercial use with no attribution required; the list is in
`assets/img/photos/CREDITS.md`. The CSP in `netlify.toml` allows that host for images, plus
`fonts.googleapis.com` / `fonts.gstatic.com` for the Bricolage Grotesque and Caveat fonts. Scripts
remain same-origin only.

## The institution dataset

113 providers, none invented, none padded. Sourced from the union of Ireland's two official
registers of programmes a non-EEA student's permission is valid for:

- **TrustEd Ireland Authorised Providers: List of Eligible Programmes** (Higher Education,
  Foundation and Quality Assured English Language), August 2026 — 6,784 programme rows, 38
  providers.
- **ILEP — Interim List of Eligible Programmes**, with effect from 11 February 2026 — 1,201
  programme rows, 81 providers.

Both snapshots live in `_tooling/reference/`, downloaded 2026-08-24. Rebuild with
`python3 _tooling/build_dataset_ie.py`.

**Ranks 1–12 are real and 13–113 carry no ranking meaning.** The ranked block is the Irish entries
in the **QS World University Rankings: Europe 2026** (published 28 January 2026), in QS order.
Ireland has exactly 12 entries in that table — which is exactly the number of cards the home-page
carousel renders, so every card shows a genuine published position rather than a made-up one. The
QS *world* table (2027 edition, published 18 June 2026) covers only 8 Irish universities, which is
why the Europe table was used for the ordering; both are recorded in the dataset header.

Everything past 12 is `ranked: false` and renders a dash, ordered by statutory category
(University → Technological University → Institute of Technology → Specialist → College → Language
School) and alphabetically within category. `type` comes from an explicit table, not from parsing
names; `University` is the seven Irish Universities Association members.

## Things to review before launch

- **Re-check the immigration facts.** They were read from the official source on 2026-08-24 and all
  of them move: Stamp 2 work rights (20 h term time, 40 h in June–September and 15 Dec–15 Jan),
  Third Level Graduate Programme durations (12 months at NFQ Level 8, up to 24 at Level 9+), the
  90-day residence-permit registration, and the Critical Skills Employment Permit route to Stamp 4.
  The page deliberately quotes no fees, fund thresholds or wages.
- **Re-pull the registers** before launch and re-run `build_dataset_ie.py`. The ILEP is explicitly
  *interim* and TrustEd Ireland is actively replacing it; provider lists change monthly.
- **`200+` Ireland Tie-ups, `99%` success rate, `5k+` students** are the client's own marketing
  claims carried over from the reference site. Confirm the client stands behind them for Ireland.
- **Photo attributions are mandatory.** All four photographs are CC-BY (none is CC0, unlike the
  Canadian set), so the footer credit line cannot be emptied. See `assets/img/photos/CREDITS.md`.
- Enquiries go to business@tuteeconnect.com via `/api/enquiry`; see
  `_tooling/ENQUIRY_SETUP.md` for the environment variables it needs.

## Running it locally

### Easiest: double-click `Start Local Server.command`

It opens a Terminal window, starts the server in this folder and launches your browser. Leave the
window open while you browse; close it (or press Ctrl+C) to stop. Nothing to install.

macOS may warn the first time because the file came from another machine — right-click it and
choose **Open**, then **Open** again. After that, double-clicking works.

### Or from a terminal

```bash
python3 serve.py
```

Then open <http://localhost:8000/>. Pass a port to override: `python3 serve.py 3000`.

### Or open the file directly, with no server

Double-click `index.html`. Every path is relative so this works fine. The one difference: the
`/api/enquiry` does not exist without a server, so form submissions fail — so test **real
form submissions over the server**.

### A note on checking the reveal animations in a browser

The scroll reveals are driven by `IntersectionObserver`, which **does not fire in a
hidden or backgrounded browser tab**, and CSS transitions are frozen there too. If the reveals look
broken while automating a browser, check `document.visibilityState` before believing it — To screenshot the sections, inject
`[data-reveal]{opacity:1!important;transform:none!important;clip-path:none!important}` into a throwaway copy.

### Deploying

There's no build step. Upload the folder as-is to Netlify, Vercel, Cloudflare Pages, S3 or any
static host — `index.html` at the root. `serve.py`, `Start Local Server.command` and `README.md`
are development-only and can be left out of the upload.
