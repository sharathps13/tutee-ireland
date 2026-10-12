# Photo credits

All four photographs in this directory are Irish and sourced from Wikimedia
Commons under CC-BY licences. **All four require attribution**, which is rendered
in the footer of both pages, in the elements marked `data-photo-credit`. If you
swap any photo, update this file **and** `PHOTO_CREDIT` in
`_tooling/localise_ie.py`, then re-run `localise_ie.py`, `assemble.py ireland`
and `build_unipage.py ireland`.

CC-BY-SA images were deliberately avoided, as on the UK and Canada pages, to keep
the licensing obligations to a single visible credit line. Note that unlike the
Canadian set — where two of four were CC0 — every Irish file here is CC-BY, so
the footer credit line is **mandatory** and must not be emptied.

Each file was cropped and resized from the Commons original with `sips`. The
output dimensions match the Canadian page's files, which in turn match the slots,
so the layout cannot shift.

---

## students-campus.jpg — hero (`#home`), 1200×1143

> **The filename does not describe the subject**, and it is kept because
> `students-campus.jpg` is a literal key in the compiled stylesheet — the class
> `bg-[url('/assets/img/photos/students-campus.jpg')]` plus the matching escaped
> selector and `url()` in `assets/css/main.css`, and the `<link rel="preload">`
> in the page shell. Renaming the file means editing all of those together;
> `verify_site.py` fails on a mismatch, the browser fails silently. Check with
> `grep -o "students-campus[^\"')]*" index.html universities.html assets/css/main.css`.

- **Depicts:** The Cliffs of Moher, County Clare, looking north into the sunset
  from near Hag's Head, with O'Brien's Tower on the headland in the distance and
  the Atlantic below. Long grass in the foreground.
- **Commons file page:** https://commons.wikimedia.org/wiki/File:Cliffs_of_Moher_-_Into_the_Sunset_(49540453606).jpg
- **Author / photographer:** Ajay Suresh
- **Licence:** CC BY 2.0 — https://creativecommons.org/licenses/by/2.0
- **Attribution required:** `Cliffs of Moher, County Clare — photo by Ajay Suresh, CC BY 2.0`
- **Shot:** 15 November 2019.
- **Crop:** original 4401×3301 → `sips -c 3301 3465` (centred, to 1.0499:1) →
  resized to 1200×1143, quality 82.
- **Why this replaced the Campanile:** the previous hero was the Trinity College
  Campanile — accurate and on-topic but static, and every other photo on the page
  was also a Dublin building. A warm, wide-open landscape reads as the "Irish
  Dream" of the headline it sits beside, and its gold-and-green palette suits the
  page's maroon and dark-green far better than grey stone did. The trade is that
  the hero no longer shows a campus; that signal moved rather than vanished — the
  Campanile now fills the "Why Ireland?" panel (see `ireland-city.jpg` below),
  whose bullets begin "World's Best Universities" — and the hero still carries the
  overlaid "Top Ranked Irish Universities" card above the ranked carousel.
- **Why 1.05:1 and not a wide landscape file:** the hero panel measures about
  **596×584 CSS px on desktop (1.02:1) and 319×292 on mobile (1.09:1)** — near
  square at every breakpoint. The div is `bg-cover bg-center`, so a 1.8:1 file
  would have roughly 43% of its width thrown away, and the cliffs would lose the
  grass foreground the overlay card sits on.
- **Safe to reshape:** referenced only as a CSS `background-image` and a
  `<link rel="preload">` — there is no `<img>` tag for it on either page, so its
  ratio has no effect on layout.
- **Rejected alternatives** (all checked for CC-BY and square-croppability):
  Temple Bar (identifiable drinkers, whiskey and tobacco signage — wrong pitch
  for a student-visa page); Samuel Beckett Bridge (storm sky, construction
  cranes); Grand Canal Dock (night shot, wrong for a light panel); Cobh "Deck of
  Cards" (parked cars dominate, and it duplicates the colourful-houses theme of
  `family.jpg`); St Stephen's Green (top-down drone shot, reads as a map); UCD
  campus lake (snapshot quality, empty foreground); Glendalough (drab, signposts).
  Giant's Causeway was excluded outright — County Antrim is Northern Ireland, so
  it belongs to the UK page, not this one.

## team-working.jpg — `#relocate` ("The Pathway to Settlement"), 1400×933

- **Depicts:** The Long Room of the Old Library, Trinity College Dublin — the
  barrel-vaulted gallery with its shelved collection and marble busts.
- **Commons file page:** https://commons.wikimedia.org/wiki/File:Dublin_Trinity_College_Library_Long_Room_07.jpg
- **Author / photographer:** Zairon
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0
- **Attribution required:** `Long Room, Trinity College Library — photo by Zairon, CC BY 4.0`
- **Shot:** 29 May 2022.
- **Crop:** original 4054×3424 → `sips -c 2702 4054 --cropOffset 700 0` (full
  width, 3:2, anchored low) → resized to 1400×933, quality 82. The offset matters:
  a centred crop kept the vault and cut the floor, so the image read as a ceiling
  rather than a study space.
- **Note:** this image is rendered with `w-full h-auto object-cover`, so **its
  aspect ratio drives the layout**. Any replacement must also be 3:2.

## family.jpg — `#relocate` ("Relocating with Your Family?"), 1400×1050

- **Depicts:** A Georgian terrace in Dublin with the city's characteristic
  brightly painted front doors (yellow, red and blue) and wrought-iron railings.
- **Commons file page:** https://commons.wikimedia.org/wiki/File:Dublin_colorful_doors_(6178596615).jpg
- **Author / photographer:** Leandro Neumann Ciuffo
- **Licence:** CC BY 2.0 — https://creativecommons.org/licenses/by/2.0
- **Attribution required:** `Georgian doors, Dublin — photo by Leandro Neumann Ciuffo, CC BY 2.0`
- **Shot:** 23 September 2011.
- **Crop:** original 2877×1918 (3:2) → `sips -c 1918 2557` (centred, to 4:3) →
  resized to 1400×1050, quality 78.
- **Why this subject:** homes rather than people, which is the same trade the UK
  page makes with Notting Hill and the Canadian page with Cabbagetown. See the
  note on photographs of people below.

## ireland-city.jpg — "Why Ireland?" panel (`#universities`), 1080×1200

> **The filename no longer describes the subject** — it holds a campus photo, not
> a cityscape — and it is kept because `ireland-city.jpg` is a literal key in the
> compiled stylesheet: the Tailwind arbitrary-value class
> `bg-[url('/assets/img/photos/ireland-city.jpg')]` plus the matching escaped
> selector and `url()` in `assets/css/main.css`. Renaming the file means editing
> **both** together. `verify_site.py` fails on a mismatch; the browser fails
> silently. That rule was itself renamed from `canada-city.jpg` when this page was
> scaffolded from the Canadian assets.

- **Depicts:** The Campanile in Front Square (Parliament Square), Trinity College
  Dublin, in full sun — the Public Theatre and the statue of George Salmon to the
  left, the Graduates' Memorial Building to the right, students small in the
  middle distance.
- **Commons file page:** https://commons.wikimedia.org/wiki/File:Trinity_College_Dublin_-_Campanile_(2025).jpg
- **Author / photographer:** P. Hughes
- **Licence:** CC BY 4.0 — https://creativecommons.org/licenses/by/4.0
- **Attribution required:** `Campanile, Trinity College Dublin — photo by P. Hughes, CC BY 4.0`
- **Shot:** 13 June 2025.
- **Crop:** original 4024×5443 (portrait) → `sips -c 4471 4024 --cropOffset 486 0`
  (full width, centred vertically, to 0.9:1) → resized to 1080×1200, quality 82.
- **This is the photo that used to be the hero.** It was moved here rather than
  discarded when the hero became the Cliffs of Moher: it suits this slot better
  than it suited the hero. The panel's headline is "Why Ireland?" and its bullets
  begin "World's Best Universities", so a Trinity campus shot carries the
  education signal that the landscape hero gives up — and this slot is portrait,
  which is the orientation the original was actually shot in.
- **Why 0.9:1 and not the 3:2 of the file it replaced:** at `lg` and above the
  panel is two columns with `items-stretch`, so the image column is `flex-1` and
  stretches to the height of the text column — roughly **720×790 CSS px, i.e.
  portrait (~0.91:1)**, on a 1280–1440 viewport. The previous 3:2 file was
  therefore side-cropped hard by `bg-cover`, which is why the Custom House
  rendered as a tight centre crop with half the panel given to flat water. Below
  `lg` the panel stacks and this column goes full-width and short
  (`min-h-[160px]` on mobile, `min-h-[250px]`/`[300px]`/`[400px]` up), so
  `bg-center` takes the middle band — the Campanile stays in frame at both.
- **No layout effect:** the file is painted by a `<div class="absolute inset-0 …
  bg-center bg-cover">`, so its aspect ratio cannot shift the layout. It also
  carries `hover:scale-105 transition-transform duration-700`, a slow zoom on
  hover; a subject that fills the frame edge-to-edge would show its borders
  during that zoom, which is another reason to keep the lawn and sky margins.
- **Why the Custom House went:** the previous photo (the Custom House on the
  north quays, © Robert Linsdell, CC BY 2.0) had **scaffolding on the dome**, an
  overcast sky and flat grey water across the lower 40% of the frame. Its credit
  has been removed from `PHOTO_CREDIT`; the file is gone from this directory.

---

## Combined credit line (as rendered in the footer)

> Photography: Cliffs of Moher, County Clare © Ajay Suresh (CC BY 2.0);
> Campanile, Trinity College Dublin © P. Hughes (CC BY 4.0); Long Room,
> Trinity College Library © Zairon (CC BY 4.0); Georgian doors, Dublin ©
> Leandro Neumann Ciuffo (CC BY 2.0). Via Wikimedia Commons.

Generated from `PHOTO_CREDIT` in `_tooling/localise_ie.py` — change it there and
rebuild, never in the built HTML.

## On photographs of people

As on the UK and Canadian pages, none of the four photos has an identifiable
person as its subject. The few walkers on the clifftop, the students crossing Front
Square and the cyclist on the Georgian terrace are small, incidental and not
identifiable. Appropriately
licensed photos of people are scarce on Commons — nearly all are CC-BY-SA — so
recognisable Irish places were the better trade. If you want students in the
hero, buy a stock licence and drop in a file at roughly 1.05:1 — that is the one
thing the Commons CC-BY pool genuinely cannot supply.

---

## Unsplash photographs (hot-linked)

Since the October 2026 redesign, most photographs on the page are loaded from Unsplash's CDN
(`images.unsplash.com`) under the [Unsplash License](https://unsplash.com/license): free for
commercial use, no permission or attribution required (credit given in the footer as a courtesy).
Only `team-working.jpg` (Long Room) and `family.jpg` (Georgian doors) from the CC-BY set above are
still used, so the footer credit line names only those two. `students-campus.jpg` and
`ireland-city.jpg` are no longer referenced.

| Where | Subject | Unsplash photo id | Photographer |
| --- | --- | --- | --- |
| Hero background (animated in WebGL by hero-fx.js) | Cliffs of Moher at sunset, County Clare | AEallbg9q_A | Federico Beccari |
| Polaroid 1 | Ha'penny Bridge, Dublin | blDB0HbjB1k | Sophie Popplewell |
| Polaroid 2 | Campanile, Trinity College Dublin | XbIkiMTZQ4Y | Rubina Ajdary |
| Polaroid 3 | The Long Walk, Galway | UR-9hOEW-Ww | Rory Hennessey |
| Polaroid 4 | Kylemore Abbey, Connemara | hLqJHN01XMU | Alex Grodkiewicz |
| Polaroid 5 | Cobh, County Cork | rTG1TR6Ygb0 | Jason Murphy |
| Polaroid 6 | Ring of Kerry | jW9FwDm0mxw | K. Mitch Hodge |
| Polaroid 7 | Dunguaire Castle, Galway Bay | KViyTyPUsl8 | Wallace Bentt |
| Why Ireland 1 | University College Cork quad | vFm2dW99YAw | Derek O'Keeffe |
| Why Ireland 2 | Old Library, Trinity College Dublin | nFkybEld8B0 | Naomi Hutchinson |
| Why Ireland 3 | Samuel Beckett Bridge, Dublin | Z6t2-hfunng | Carlos Torres |
| Why Ireland 4 | Grand Canal Dock, Dublin | w9OaYkcIQuU | Margaux Bebin |
| Why Ireland 5 | Temple Bar, Dublin | XMi6Gbu9KIQ | Genny Dimitrakopoulou |
| Services: consultation | Friends at a café | -uHVRvDr7pg | Brooke Cagle |
| Services: post-landing | River Liffey at dusk | xBUVF06tUoI | Nistala Maneesh |
| Services: language test | Student in headphones at a laptop | 4JFBqeP3VRQ | Vitaly Gariev |
| Services: college selection | Front Square, Trinity College Dublin | FIuPkfo4LoU | Help Stay |
| Services: documentation | Hand signing papers | OQMZwNd3ThU | Scott Graham |
| Services: study visa | Passport and boarding pass | LVA3S6isNYQ | CardMapr.nl |
| Services: settlement | Georgian front door, Dublin | G196ZC3NXUQ | Jonathan Borba |
| Services: financial aid | Calculator on paperwork | 8wLZi9OhsWU | Jakub Żerdzicki |
| Services: family migration | Father and daughter at an airport gate | m8TQz6FRrUk | Rochelle Lee |
| Free counselling | Students at a table | g1Kr4Ozfoac | Brooke Cagle |

The Ireland news banner does not use any of the photos above. Each story shows the picture its
own publisher attached to the article (from the publisher's RSS feed, or the article's `og:image`),
hot-linked from the publisher exactly as a link preview in a messaging app would show it, and the
banner links to that article.

A story with no usable picture borrows one of the stock photos below instead (`NEWS_STOCK` in
`assets/js/main.js`), matched to its topic, and no two stories share one. All are Unsplash, free
licence (searched with the free-licence filter, so no Unsplash+ photos), hot-linked from
`images.unsplash.com/photo-<id>`, and none is used anywhere else on the site.

| Topic | Subject | Unsplash photo id |
| --- | --- | --- |
| Universities | Empty university lecture hall | 1541829070764-84a7d30dd3f3 |
| Universities | Graduate in academic cap and gown | 1523580846011-d3a5bc25702b |
| Universities | Students working at computers | 1606761568499-6d2451b23c66 |
| Universities | Scientist with pipette and test tubes | 1614935151651-0bea6508db6b |
| Students | Three students laughing at a table | 1522202176988-66273c2fd55f |
| Students | Student carrying textbooks | 1571260899304-425eee4c7efc |
| Students | Two people reading at a picnic table | 1460518451285-97b6aa326961 |
| Students | Group working on a laptop | 1522071820081-009f0129c71c |
| Careers | Team meeting round a table | 1517048676732-d65bc937f952 |
| Careers | Colleagues with laptops at a table | 1573164574572-cb89e39749b4 |
| Careers | Four coworkers smiling round a laptop | 1572021335469-31706a17aaef |
| Scholarships | Graduates throwing caps in the air | 1627556704290-2b1f5853ff78 |
| Scholarships | Graduation cap with a green tassel | 1636231945376-3d40fdcbc462 |
| Scholarships | Student writing in a notebook | 1514369118554-e20d93546b30 |
| Industry | Scientist at a laptop in a laboratory | 1581093577421-f561a654a353 |
| Industry | Laboratory bench with a microscope | 1602052577122-f73b9710adba |
| Industry | Team at a whiteboard with laptops | 1557804506-669a67965ba0 |
| Visas | Passport on paperwork | 1454496406107-dc34337da8d6 |
| Visas | Passport held over a map | 1654163600133-452eb7274426 |
| Visas | Passenger jet on the tarmac | 1676903865409-17eca815c554 |
| Any topic | Street scene heading towards a church | 1549918864-48ac978761a4 |
| Any topic | People walking between city buildings | 1589826624017-66d3105fee65 |
| Any topic | Bridge over a river at sunset | 1554191765-016992e268ee |
| Any topic | River with a bridge and buildings | 1664887193400-d135058c287a |

These are viewable at `https://unsplash.com/photos/` followed by the slug Unsplash shows for each.
The table further up uses Unsplash's short ids instead:
Each is viewable at `https://unsplash.com/photos/<id>`. To self-host instead, download each at
roughly 2000px wide, save under this folder, swap the `src` URLs, and `images.unsplash.com` can be
dropped from the CSP.


Every Why Ireland photo was checked against the location recorded on its Unsplash page: all five are
in Ireland (University College Cork, and four Dublin locations).


No free, camera-shot video of this exact sunset view exists on Pexels, Pixabay, Unsplash, Vecteezy,
Mixkit or Wikimedia Commons (checked October 2026); the close free matches on Vecteezy are flagged
as AI-generated. The hero therefore animates the photograph itself: a WebGL shader moves only the sea, sky and grass
regions of this one photo. No other imagery is generated or added.
