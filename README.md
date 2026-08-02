# callumhuntington.com

Personal site: mathematics, and an atlas of film photographs. Static HTML, CSS
and jQuery, served by GitHub Pages from this repository.

---

## Layout

```
index.html          landing
mathematics.html    publications, talks, education
gallery.html        the atlas
404.html            served for any unknown address
css/                style.css, lightbox.css
js/                 app.js, atlas.js, lightbox.js, and the two GENERATED files
data/photos.js      the source of truth for every photograph
images/<region>/    <id>_thumb.jpeg and <id>_full.jpeg
mathpdfs/           author copies of the papers
fonts/              DM Sans (subsetted) and Orbita Traced
```

---

## The atlas: two tiers, and why it matters

The atlas is built from two different kinds of data, and confusing them is the
easiest way to waste an afternoon.

**`data/photos.js` is read at runtime.** Captions, file paths, years — change
one of those and a reload is all it takes.

**`js/atlas-data.js` and `js/atlas-sheets.js` are generated.** They hold the
map geometry: the world map, each region's silhouette, and where every pin and
card sits on it. Anything *geometric* — `lat`, `lon`, `group`, a `card`
override, a new photograph, a new region — only reaches the page after a
rebuild.

A photograph that is in `photos.js` but not in the built sheet is **not drawn
at all**, on either layout. `atlas.js` prints a console warning naming the ids
when this happens; if a card is mysteriously missing, look there first.

### Build

```bash
npm install
node prepare_subunits.mjs     # once, ever — fetches Natural Earth subunit data
node build_atlas.mjs          # writes js/atlas-data.js   (the world map)
node build_sheets.mjs         # writes js/atlas-sheets.js (silhouettes + placement)
```

Both generated files are committed. GitHub Pages does not run the build.

---

## Adding a photograph

1. Two files into `images/<region>/`: `<id>_thumb.jpeg` (aim under ~500KB) and
   `<id>_full.jpeg` (1–2MB). The thumbnail is the card; the full image is what
   the lightbox opens.
2. A record in `data/photos.js`:

   ```js
   {id: 'matera', place: 'Matera', sub: 'Basilicata', year: 2023,
    region: 'italy', dir: 'italy', group: 'matera', lat: 40.667, lon: 16.611},
   ```

   `sub` is whatever sits one level below the sheet title — the region on a
   single-country sheet, the country on a multi-country one. Photographs
   sharing a `group` become one pile on the map, fanning open on hover, and
   share a number on the narrow layout.
3. `node build_sheets.mjs`
4. Bump the `?v=` on any changed asset, using the same number in every page
   that loads it — otherwise the browser caches one copy per page.
5. Commit the images, `photos.js` **and** `js/atlas-sheets.js`.

### When placement is wrong

`build_sheets.mjs` keeps cards clear of the coastline and inside the frame. To
override a single card, add to its record in `photos.js`:

```js
card: {angle: 210, lead: 180}   // bearing from the pin, and distance
```

Then rebuild. `CARD_SWAPS` at the top of `atlas.js` exchanges the positions of
two groups where the automatic order crosses their strings.

---

## Two layouts

Above 600px the photographs hang on strings from their pins. Below it they
leave the map for a two-column grid, and a numbered disc takes each one's place
at the end of its string; the numbers match, and tapping one opens the
lightbox. The hash is the same in both: `#italy/matera` opens that photograph
directly.

---

## Notes

- **Fonts are self-hosted**, subsetted WOFF2. DM Sans needs its italic — the
  captions and the education rows use it.
- **Bootstrap loads before `style.css`.** At equal specificity the later sheet
  wins, so that order is required. Bootstrap's `a:hover` underline is (0,1,1);
  anything overriding it needs a pseudo-class of its own, not merely a class.
- **`404.html` inserts `<base href="/">` when served over http**, so it works
  at any depth, and skips it on `file://` so it can still be opened locally.
- A page is `.column` + `.module` + `h2`. Nothing else is needed for a new one.
