#!/usr/bin/env node
/**
 * build_sheets.mjs — generates js/atlas-sheets.js
 *
 * For every region that has photographs, produces:
 *   · a silhouette drawn in ITS OWN projection, not zoomed out of the world
 *     map — at world scale the Dalmatian coast is four pixels of noise
 *   · a pin per group, projected from the lat/lon in data/photos.js
 *   · a resolved position for every card, so that no two overlap and none
 *     falls off the sheet
 *
 * Card placement is done here rather than in the browser so it is
 * deterministic: the same photographs always land in the same arrangement,
 * and the result can be checked before it ships rather than jittering about
 * on resize.
 *
 * Run:  node build_sheets.mjs
 */

import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'fs';
import * as tc from 'topojson-client';
import {presimplify, simplify, quantile} from 'topojson-simplify';
import {geoTransverseMercator, geoConicConformal, geoPath, geoBounds} from 'd3-geo';
import {REGIONS, SPLIT_SUBUNITS, SUBUNIT_ALIAS} from './regions.mjs';

// City panels, prepared by prepare_subunits.mjs from the 10m coastline.
const CITIES = existsSync('cities-10m.json')
  ? JSON.parse(readFileSync('cities-10m.json')) : {};

// ── sheet geometry, in sheet units ───────────────────────────────────────────
// The sheet is wider than it is deep because the silhouettes are fitted to its
// HEIGHT. Working through what a card measures on screen:
//
//   frame width  = free height x (SHEET_W / SHEET_H)
//   card on screen = (CARD_W / SHEET_W) x frame width
//                  = CARD_W x free height / SHEET_H
//
// SHEET_W cancels. Widening the sheet therefore costs the map nothing and
// hands the cards a great deal more sea to sit in — it converts the blank
// margins inside the red frame into usable room rather than leaving them
// empty. The ceiling is the frame's aspect ratio: past about 2:1 the frame
// stops being limited by the window's height and starts being limited by its
// width, at which point the map does begin to shrink.
const SHEET_W = 1400, BASE_H = 720;

// The sheet's height is no longer a constant. The same region is solved at
// several frame proportions and the browser interpolates between them as the
// window moves, which is how the cards come to use the empty ground under a
// narrow window instead of merely being centred in it.
//
// Solving in the browser was the obvious alternative and is not possible:
// Italy's solve is 3.8 SECONDS — a greedy sweep, 900 relaxation iterations
// over every pair, ten alternating rounds of untangling, then a strict pass.
// A continuous re-layout has 16ms. Sampling here and interpolating there gets
// the same result three orders of magnitude cheaper.
//
// Everything downstream reads SHEET_H, so it is a let and each frame sets it.
let SHEET_H = BASE_H;

// Frame heights, tallest last. 720 is the base and must come first: it is the
// one the projection is actually fitted to, and every other frame is derived
// from it by a similarity transform.
//   720 -> 1.94:1   the wide layout, unchanged
//  1750 -> 0.80:1   about as tall as a sheet is worth making
const FRAME_HEIGHTS = [720, 780, 850, 930, 1020, 1120, 1240, 1380, 1500, 1620, 1750];

// Which regions get the extra frames. Solving is not free — Yugoslavia's six
// frames cost about a second — and this is new, so it starts on one region.
const MULTIFRAME = new Set(['yugoslavia']);
// Inset of the silhouette within the sheet. FIT_Y is the one that matters:
// every region so far is fitted to its height, so this is what decides how
// large the map is drawn — and it buys a band of clear white above and below
// that the cards can use without touching the country.
const FIT_X = 60, FIT_Y = 104;
const fitBox = () => [[FIT_X, FIT_Y], [SHEET_W - FIT_X, SHEET_H - FIT_Y]];

// Panelled sheets: the gap between two city maps, and the room left under them
// for each panel's name.
const PANEL_GAP = 132, PANEL_LABEL = 34;

const CARD_W = 150, CARD_H = 190;   // the polaroid, surround and caption
const PAD    = 7;                   // breathing room between two cards
const LEAD   = 110;                 // pin to card centre, when unobstructed
const LEAD_MAX = 460;               // how far a card may ever drift from its pin

// Cards shrink as a region fills up. Rather than pick a size per region by
// hand, aim for a share of the room actually available and solve for the
// scale — so a region that grows from four photographs to forty adjusts
// itself.
//
// The share is of the SEA, not of the whole sheet. Two regions with the same
// number of photographs do not have the same amount of room: Italy is 12%
// land and the Balkans 31%, so measuring against the sheet gave Yugoslavia
// cards it had nowhere to put and left them sitting on the country.
const TARGET_FILL = 0.50;
const MIN_SCALE = 0.55;
const MAX_SCALE = 1.0;

// How hard a card is pushed off the silhouette, per unit of land it covers,
// relative to the cost of overlapping another card. The point of a region
// sheet is the shape of the region; a photograph parked on top of it is
// hiding the thing it is meant to be marking.
//
// A penalty and not a prohibition, deliberately. Italy is 12% of its sheet and
// clears easily; the contiguous United States is 43% of its own and simply
// cannot, so there the term quietly becomes a preference for the emptiest spot
// rather than an impossible demand.
const LAND_WEIGHT = 2.2;
const GRID = 4;   // sheet units per cell of the occupancy raster

// A keep-out band around the coastline, in sheet units. Land avoidance alone
// let a card sit flush against the coast, where it still buried the pins and
// strings just inland of it. Growing the forbidden region past the shore
// pushes the cards clear of the map rather than merely off it.
const COAST_MARGIN = 34;
const MAX_TILT = 4.5;               // degrees; hand-placed, not machine-placed
const STACK_DX = 8, STACK_DY = -7;  // offset of each further card in a pile

const RETAIN = 0.30;   // sheets keep far more coastline than the world map
const MIN_RING = 1.6;  // sheet px², below which an islet is dropped

// ── load the photographs ─────────────────────────────────────────────────────
const shim = {};
new Function('window', readFileSync('data/photos.js', 'utf8'))(shim);
const PHOTOS = shim.PHOTOS;
if (!Array.isArray(PHOTOS)) throw new Error('data/photos.js did not define window.PHOTOS');
const SWAPS = shim.CARD_SWAPS || {};

const seen = new Set();
for (const p of PHOTOS) {
  if (seen.has(p.id)) throw new Error(`duplicate photo id: ${p.id}`);
  seen.add(p.id);
  if (!REGIONS[p.region]) throw new Error(`${p.id}: unknown region "${p.region}"`);
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number')
    throw new Error(`${p.id}: needs lat and lon`);
  if (!p.place || !p.sub) throw new Error(`${p.id}: needs place and sub`);
}

/* Do the photographs actually exist?
 *
 * Nothing else ever checks. A typo in an id, a file copied to the wrong
 * folder, a rename done in Finder but not here — all of them produce a card
 * that lays out perfectly, captions correctly, and shows a blank rectangle.
 * The only way to notice is to open every region and look, which is exactly
 * the sort of thing that gets skipped.
 *
 * The paths mirror what atlas.js asks the browser for:
 *     images/<dir>/<id>_thumb.jpeg   the card
 *     images/<dir>/<id>_full.jpeg    the lightbox
 */
const IMAGES = 'images';
if (!existsSync(IMAGES)) {
  console.warn(`! no ${IMAGES}/ directory beside this script — skipping the ` +
               `image check. Run the build from the site root to enable it.\n`);
} else {
  const missing = [];
  for (const p of PHOTOS)
    for (const kind of ['thumb', 'full']) {
      const path = `${IMAGES}/${p.dir}/${p.id}_${kind}.jpeg`;
      if (!existsSync(path)) missing.push(path);
    }
  if (missing.length) {
    console.error(`\n${missing.length} image${missing.length === 1 ? '' : 's'} ` +
                  `referenced by data/photos.js but not on disk:`);
    for (const m of missing) console.error('   ' + m);
    throw new Error('missing images — fix the paths or the ids and re-run');
  }
  console.log(`${PHOTOS.length * 2} image files present and correct.\n`);
}

// ── load the coastlines ──────────────────────────────────────────────────────
// The sheets come from the map-subunits topology, not from world-atlas, because
// only that layer knows England from Scotland. See prepare_subunits.mjs.
// Simplified once, as a whole topology: shared arcs stay shared, so a border
// between two units still traces exactly the same line as the coastline
// either side of it. Simplifying shape by shape would open slivers.
const readSub = () => JSON.parse(readFileSync('subunits-topo.json'));
const weight = quantile(presimplify(readSub()), RETAIN);
const topo = simplify(presimplify(readSub()), weight);
const units = topo.objects.units.geometries;

// What counts as one unit, and therefore where a border is drawn. Everything
// is its country unless the country is listed in SPLIT_SUBUNITS.
const unitKey = g => SPLIT_SUBUNITS.has(g.properties.admin)
  ? g.properties.subunit : g.properties.admin;

function clipPolys(multi, box) {
  if (!box) return multi;
  const [w, e, s, n] = box;
  const inside = poly => {
    const ring = poly[0];
    let x = 0, y = 0;
    for (const p of ring) { x += p[0]; y += p[1]; }
    x /= ring.length; y /= ring.length;
    return x >= w && x <= e && y >= s && y <= n;
  };
  const polys = (multi.type === 'Polygon' ? [multi.coordinates] : multi.coordinates)
    .filter(inside);
  if (!polys.length) throw new Error('clip window removed everything');
  return {type: 'MultiPolygon', coordinates: polys};
}

/* A true rectangular clip in lon/lat, Sutherland–Hodgman.
 *
 * clipPolys above drops whole polygons whose centre falls outside a window,
 * which is the right tool for discarding Prince Edward Island but no use at
 * all for cropping to the Cape: South Africa is one polygon, and its centre is
 * 700km from Cape Town. This actually cuts the geometry, so a sheetClip window
 * gives a detail crop with straight edges where it meets the frame. */
function clipRect(multi, box) {
  const [w, e, s, n] = box;
  const inside = [
    p => p[0] >= w, p => p[0] <= e, p => p[1] >= s, p => p[1] <= n,
  ];
  const cut = [
    (a, b) => [w, a[1] + (b[1] - a[1]) * (w - a[0]) / (b[0] - a[0])],
    (a, b) => [e, a[1] + (b[1] - a[1]) * (e - a[0]) / (b[0] - a[0])],
    (a, b) => [a[0] + (b[0] - a[0]) * (s - a[1]) / (b[1] - a[1]), s],
    (a, b) => [a[0] + (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]), n],
  ];
  const clipRing = ring => {
    let out = ring.slice(0, -1);   // drop the repeated closing point
    for (let k = 0; k < 4 && out.length; k++) {
      const input = out;
      out = [];
      for (let i = 0; i < input.length; i++) {
        const cur = input[i], prev = input[(i + input.length - 1) % input.length];
        const ci = inside[k](cur), pi = inside[k](prev);
        if (ci) {
          if (!pi) out.push(cut[k](prev, cur));
          out.push(cur);
        } else if (pi) {
          out.push(cut[k](prev, cur));
        }
      }
    }
    return out;
  };

  const polys = multi.type === 'Polygon' ? [multi.coordinates] : multi.coordinates;
  const kept = [];
  for (const poly of polys) {
    const rings = poly.map(clipRing).map(despur).filter(r => r.length >= 3)
                      .map(r => r.concat([r[0]]));
    if (rings.length) kept.push(rings);
  }
  if (!kept.length) throw new Error('sheetClip window removed everything');
  return {type: 'MultiPolygon', coordinates: kept};
}

/* Remove zero-width spurs.
 *
 * When a coastline leaves the clip window and comes back in near the same
 * place, Sutherland–Hodgman joins the exit to the entry along the boundary and
 * leaves a spur that goes out and returns down its own path. It encloses no
 * area, so it is invisible to any area test — but a renderer still antialiases
 * the two coincident edges and draws a faint hairline in open water. That is
 * the ghost line that appeared west of Athens.
 *
 * A spur is a vertex whose incoming and outgoing directions are opposite.
 * Removing it merges its neighbours; repeat until none is left. The threshold
 * is a fifth of a degree of reversal, far tighter than any real headland. */
function despur(ring) {
  const pts = ring.slice();
  if (pts.length > 1 &&
      pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1])
    pts.pop();

  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const n = pts.length;
      const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
      const ux = b[0] - a[0], uy = b[1] - a[1];
      const vx = c[0] - b[0], vy = c[1] - b[1];
      const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
      if (lu === 0 || lv === 0) { pts.splice(i, 1); changed = true; break; }
      if ((ux * vx + uy * vy) / (lu * lv) < -0.99999) {
        pts.splice(i, 1); changed = true; break;
      }
    }
  }
  return pts;
}

function sink(minArea) {
  let out = [], ring = [];
  const r = v => Math.round(v * 10) / 10;
  const flush = () => {
    if (ring.length >= 3) {
      let a = 0;
      for (let i = 0, n = ring.length; i < n; i++) {
        const p = ring[i], q = ring[(i + 1) % n];
        a += p[0] * q[1] - q[0] * p[1];
      }
      if (Math.abs(a / 2) >= minArea)
        out.push('M' + ring.map(p => p.join(',')).join('L') + 'Z');
    }
    ring = [];
  };
  return {
    moveTo(x, y) { flush(); ring.push([r(x), r(y)]); },
    lineTo(x, y) {
      const nx = r(x), ny = r(y), last = ring[ring.length - 1];
      if (!last || last[0] !== nx || last[1] !== ny) ring.push([nx, ny]);
    },
    closePath() { flush(); },
    arc() {},
    result() { flush(); const s = out.join(''); out = []; return s; },
  };
}

/* ── panelled sheets ─────────────────────────────────────────────────────────
 *
 * Two or more city maps side by side in one sheet, each fitted to its own
 * window with its own projection. Everything downstream — the land field, the
 * card solver, the untangler — works on the finished sheet and neither knows
 * nor cares that it was assembled from panels. The only thing that has to be
 * panel-aware is deciding which projection a given photograph goes through.
 */
function buildPanels(region, key) {
  const panels = region.panels;
  const usable = SHEET_W - FIT_X * 2 - PANEL_GAP * (panels.length - 1);
  const w = usable / panels.length;

  const out = [];
  for (let i = 0; i < panels.length; i++) {
    const p = panels[i];
    const rings = CITIES[key + '/' + p.label];
    if (!rings)
      throw new Error(`${key}/${p.label}: no city data — run prepare_subunits.mjs`);

    const geom = clipRect({type: 'MultiPolygon', coordinates: rings.map(r => [r])},
                          p.box);
    const x0 = FIT_X + i * (w + PANEL_GAP);
    const rect = [[x0, FIT_Y], [x0 + w, SHEET_H - FIT_Y - PANEL_LABEL]];

    const [lonW, lonE, latS, latN] = p.box;
    const proj = geoTransverseMercator()
      .rotate([-(lonW + lonE) / 2, 0])
      .center([0, (latS + latN) / 2]);
    // fitExtent on the WINDOW, not on the land, so the two panels stay at the
    // scale their boxes imply. Fitting to the coastline would silently zoom a
    // panel whose land happens to sit in one corner.
    //
    // The window is four POINTS, not a polygon. d3 reads spherical polygons by
    // winding order, and a rectangle wound the wrong way means "the whole
    // globe except this box" — which fitted the projection to the planet and
    // drew Athens seven pixels wide. A MultiPoint has no winding to get wrong.
    const win = {type: 'MultiPoint', coordinates: [
      [lonW, latS], [lonE, latS], [lonE, latN], [lonW, latN]]};
    proj.fitExtent(rect, win);

    out.push({def: p, geom, proj, rect});
  }
  return out;
}

/* ── where the land is ───────────────────────────────────────────────────────
 *
 * Scan-converts the silhouette into a coarse occupancy grid, then builds a
 * summed-area table over it. That makes "how much land does a card at (x, y)
 * cover?" four array lookups instead of a polygon test per candidate — which
 * matters, because the solver asks it tens of thousands of times.
 *
 * Note what counts as sea here: everything that is not the region. On the
 * Italy sheet, Switzerland and Austria are as empty as the Adriatic, so an
 * inland card like Milan's only has to step off the peninsula, not sail to the
 * Ligurian coast. */
function landField(pathD, margin) {
  const GW = Math.ceil(SHEET_W / GRID), GH = Math.ceil(SHEET_H / GRID);
  const rings = pathD.split('M').slice(1).map(sub =>
    sub.replace(/Z$/, '').split('L').map(p => p.split(',').map(Number)));

  const cell = new Uint8Array(GW * GH);
  for (let gy = 0; gy < GH; gy++) {
    const y = (gy + 0.5) * GRID;
    const xs = [];
    for (const ring of rings) {
      for (let i = 0, n = ring.length; i < n; i++) {
        const a = ring[i], c = ring[(i + 1) % n];
        if ((a[1] > y) === (c[1] > y)) continue;
        xs.push(a[0] + (y - a[1]) / (c[1] - a[1]) * (c[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.max(0, Math.ceil(xs[i] / GRID - 0.5));
      const to = Math.min(GW - 1, Math.floor(xs[i + 1] / GRID - 0.5));
      for (let gx = from; gx <= to; gx++) cell[gy * GW + gx] = 1;
    }
  }

  // Grow the land outwards by `margin`. Done as two one-dimensional passes
  // rather than a circular kernel: it costs O(n) instead of O(n*r^2) and the
  // square corners it leaves are of no consequence at this resolution.
  const r = Math.round((margin || 0) / GRID);
  if (r > 0) {
    const tmp = new Uint8Array(GW * GH);
    for (let gy = 0; gy < GH; gy++)
      for (let gx = 0; gx < GW; gx++) {
        let v = 0;
        for (let k = -r; k <= r && !v; k++) {
          const x = gx + k;
          if (x >= 0 && x < GW && cell[gy * GW + x]) v = 1;
        }
        tmp[gy * GW + gx] = v;
      }
    for (let gy = 0; gy < GH; gy++)
      for (let gx = 0; gx < GW; gx++) {
        let v = 0;
        for (let k = -r; k <= r && !v; k++) {
          const y = gy + k;
          if (y >= 0 && y < GH && tmp[y * GW + gx]) v = 1;
        }
        cell[gy * GW + gx] = v;
      }
  }

  // summed-area table, one row and column of zeroes at the top and left
  const sat = new Int32Array((GW + 1) * (GH + 1));
  for (let gy = 0; gy < GH; gy++)
    for (let gx = 0; gx < GW; gx++)
      sat[(gy + 1) * (GW + 1) + gx + 1] = cell[gy * GW + gx]
        + sat[gy * (GW + 1) + gx + 1] + sat[(gy + 1) * (GW + 1) + gx]
        - sat[gy * (GW + 1) + gx];

  const total = sat[(GH) * (GW + 1) + GW];

  // land, in sheet px², under an axis-aligned box centred on c
  const under = (c, w, h) => {
    const x0 = Math.max(0, Math.min(GW, Math.round((c[0] - w / 2) / GRID)));
    const x1 = Math.max(0, Math.min(GW, Math.round((c[0] + w / 2) / GRID)));
    const y0 = Math.max(0, Math.min(GH, Math.round((c[1] - h / 2) / GRID)));
    const y1 = Math.max(0, Math.min(GH, Math.round((c[1] + h / 2) / GRID)));
    if (x1 <= x0 || y1 <= y0) return 0;
    const s = sat[y1 * (GW + 1) + x1] - sat[y0 * (GW + 1) + x1]
            - sat[y1 * (GW + 1) + x0] + sat[y0 * (GW + 1) + x0];
    return s * GRID * GRID;
  };

  return {under, coverage: total * GRID * GRID / (SHEET_W * SHEET_H)};
}

/* ── frames ──────────────────────────────────────────────────────────────────
 *
 * A taller sheet is not a different projection, only a different fit. Both are
 * fitExtent onto a box of the same width, so one is a uniform scale and a
 * translate away from the other — which means the extra frames need no
 * re-projection, no second path, and no second set of coastlines. The browser
 * is sent the base path and three numbers per frame.
 *
 * Deriving the transform rather than re-fitting also guarantees the frames
 * agree with each other exactly, and that frame 0 is the identity. */
function pathBounds(d) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const m of d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)) {
    const x = +m[1], y = +m[2];
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}

/* How large the map is drawn on a frame of height H.
 *
 * NOT fitExtent. Fitting the silhouette to a taller sheet was the obvious
 * thing and the wrong one: the map grew with the sheet — 2.16x by the tallest
 * frame — so a narrow window got an enormous country and, beside it,
 * photographs that were exactly as small as they had always been. The room a
 * taller sheet buys should go to the cards, which is the thing that was too
 * small to begin with.
 *
 * So the map shrinks, gently, and the cards take everything else. Linear in H,
 * which matters: the browser interpolates k between frames, and a linear
 * policy is reproduced by that interpolation exactly rather than approximately.
 * 1.00 at the base frame, so the wide layout is untouched. */
const MAP_SHRINK = 0.82;   // of its base size, at the tallest frame
const mapK = H => 1 - (1 - MAP_SHRINK) *
                  (H - BASE_H) / (FRAME_HEIGHTS[FRAME_HEIGHTS.length - 1] - BASE_H);

function frameXform(bounds, H) {
  const [x0, y0, x1, y1] = bounds;
  const k = mapK(H);
  return {k, tx: SHEET_W / 2 - k * (x0 + x1) / 2,
             ty: H / 2 - k * (y0 + y1) / 2};
}

const r1 = v => Math.round(v * 10) / 10;

function xformPath(d, t) {
  return d.replace(/(-?[\d.]+),(-?[\d.]+)/g,
    (_, a, b) => r1(+a * t.k + t.tx) + ',' + r1(+b * t.k + t.ty));
}

// The whole solve, so a frame can run it without duplicating the sequence.
// Lifted verbatim out of finish(); the base sheet now calls it too, which is
// what keeps every frame solved identically.
/* Solve the same region at every frame height.
 *
 * Each frame is solved from scratch rather than nudged out of the one before
 * it. Seeding looked cheaper and is worse: a layout scaled up by 1.8 has its
 * cards spread 1.8 times as far from the map, most of them straight into the
 * side of the sheet, and relaxation spends its whole budget pulling them back
 * in rather than finding the room overhead. Solving cold lets the sweep put
 * cards above their pins, which is where they read best and where the new
 * ground actually is.
 *
 * The risk of solving cold is that untangling reassigns which card belongs to
 * which pin between two frames, and the browser then slides two photographs
 * through each other on the way. Reported below, per frame, so it is visible
 * rather than discovered. */
function buildFrames(key, basePath, baseGroups) {
  const bounds = pathBounds(basePath);
  const frames = [];
  let prev = null;
  for (const H of FRAME_HEIGHTS) {
    SHEET_H = H;
    const t = frameXform(bounds, H);
    // Room for a longer string, in proportion to the sheet rather than to the
    // map — the map is shrinking now, and the cards have further to go.
    LEAD_CAP = LEAD_MAX * Math.sqrt(H / BASE_H);
    SCALE_CAP = MAX_SCALE * Math.sqrt(H / BASE_H);
    const keepout = landField(H === BASE_H ? basePath : xformPath(basePath, t),
                              COAST_MARGIN);
    const scale = scaleFor(baseGroups.length, 1 - keepout.coverage);
    BOX = boxOf(scale);

    const gs = baseGroups.map(g => ({
      key: g.key,
      ids: g.ids.slice(),
      pin: [g.pin[0] * t.k + t.tx, g.pin[1] * t.k + t.ty],
      // An override holds ONLY on the base frame. There it means what it has
      // always meant: put this card exactly here and let the solver work
      // around it. On the frames above, it is inherited as a starting position
      // and then let go.
      //
      // Holding it at every height was the obvious reading and the wrong one.
      // A fixed card is fixed: the solver may not move it, so as the sheet
      // grew and every other photograph drifted outward into the new ground,
      // the one card that had been told where to go was the only one standing
      // still. An instruction about where a card should sit on the wide layout
      // should not also be an instruction that it may never move again.
      fix: (frames.length === 0) ? g.fix : undefined,
    }));
    if (!frames.length) {
      solve(gs, scale, keepout);
    } else {
      // Carry the previous frame's answer across and let it settle. The
      // positions arrive in the new frame's coordinates by the same
      // similarity that moves the map, so a card keeps its place relative to
      // the country; relaxation then resolves whatever that breaks — cards
      // now too large for the gaps they were in, and cards pushed past the
      // edge of a sheet that grew taller rather than wider.
      //
      // No untangling. Untangling is what decides WHICH card hangs from which
      // pin, and a frame that answers that differently from its neighbour is a
      // frame the browser cannot interpolate: two photographs would swap by
      // sliding through one another.
      const p = prev.t;
      gs.forEach((g, i) => {
        const c = prev.cards[i];
        g.card = [(c[0] - p.tx) / p.k * t.k + t.tx,
                  (c[1] - p.ty) / p.k * t.k + t.ty];
      });
      relax(gs, keepout);
    }
    prev = {t, cards: gs.map(g => g.card.slice())};

    const byKey = Object.fromEntries(gs.map(g => [g.key, g]));
    for (const [a, c] of (SWAPS[key] || [])) {
      const tmp = byKey[a].card; byKey[a].card = byKey[c].card; byKey[c].card = tmp;
    }

    const cards = {};
    for (const g of gs) g.ids.forEach((id, i) => {
      cards[id] = [r1(g.card[0] + STACK_DX * scale * i),
                   r1(g.card[1] + STACK_DY * scale * i)];
    });

    frames.push({
      h: H,
      k: Math.round(t.k * 100000) / 100000,
      cw: Math.round(CARD_W * scale / SHEET_W * 1000) / 10,
      g: Object.fromEntries(gs.map(g => [g.key, [r1(g.card[0]), r1(g.card[1])]])),
      c: cards,
      _gs: gs,
    });
  }
  SHEET_H = BASE_H;
  LEAD_CAP = LEAD_MAX;
  SCALE_CAP = MAX_SCALE;

  // ── continuity report ──
  // How far each card travels between one frame and the next, measured in the
  // map's own units so the frames are comparable. A card that hops the width
  // of the sheet has been reassigned, not moved.
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1], b = frames[i];
    const ta = frameXform(bounds, a.h), tb = frameXform(bounds, b.h);
    let worst = 0, who = '';
    for (const g of a._gs) {
      const pa = a.g[g.key], pb = b.g[g.key];
      const ua = [(pa[0] - ta.tx) / ta.k, (pa[1] - ta.ty) / ta.k];
      const ub = [(pb[0] - tb.tx) / tb.k, (pb[1] - tb.ty) / tb.k];
      const d = Math.hypot(ub[0] - ua[0], ub[1] - ua[1]);
      if (d > worst) { worst = d; who = g.key; }
    }
    console.log(`  frame ${String(a.h).padStart(4)} -> ${String(b.h).padStart(4)}` +
                `   cards ${a.cw}% -> ${b.cw}%` +
                `   largest move ${worst.toFixed(0)} map units (${who})`);
  }

  // Each frame ships on its own, so each frame has to be sound on its own.
  for (const f of frames) {
    SHEET_H = f.h;
    const t = frameXform(bounds, f.h);
    const land = landField(f.h === BASE_H ? basePath : xformPath(basePath, t), 0);
    const sc = f.cw / 100 * SHEET_W / CARD_W;
    BOX = boxOf(sc);
    const cw = CARD_W * sc, ch = CARD_H * sc;
    const cs = f._gs.map(g => f.g[g.key]);
    let over = 0, off = 0, far = 0, onLand = 0, cross = 0;
    for (let i = 0; i < cs.length; i++) {
      onLand += land.under(cs[i], BOX.w, BOX.h);
      if (outOfBounds(cs[i]) > 0.5) off++;
      const pin = [f._gs[i].pin[0] * t.k / t.k, 0];   // placeholder, see below
      for (let j = i + 1; j < cs.length; j++)
        over = Math.max(over, Math.max(0, cw - Math.abs(cs[i][0] - cs[j][0])) *
                              Math.max(0, ch - Math.abs(cs[i][1] - cs[j][1])));
    }
    const pins = f._gs.map(g => [g.pin[0], g.pin[1]]);
    for (let i = 0; i < cs.length; i++) {
      const d = Math.hypot(cs[i][0] - pins[i][0], cs[i][1] - pins[i][1]);
      if (d > LEAD_MAX * t.k + 1) far++;
      for (let j = i + 1; j < cs.length; j++)
        if (segmentsCross(pins[i], cs[i], pins[j], cs[j])) cross++;
    }
    console.log(`  h ${String(f.h).padStart(4)}  map x${t.k.toFixed(2)}` +
                `  overlap ${over.toFixed(0)}px²  off-sheet ${off}` +
                `  crossings ${cross}` +
                `  on land ${(100 * onLand / (cs.length * BOX.w * BOX.h)).toFixed(1)}%`);
  }
  frames.forEach(f => { delete f._gs; });

  // The report loop above walks SHEET_H up the ladder to measure each frame.
  // Put it back. Leaving it at 1750 fitted every region built after this one
  // to a sheet two and a half times too tall, which showed up as silhouettes
  // reported at 1542 units high inside a 512-unit box.
  SHEET_H = BASE_H;
  BOX = boxOf(1);

  return {fit: bounds.map(r1), pad: [FIT_X, FIT_Y], frames};
}

function solve(groups, scale, keepout) {
  place(groups, scale, keepout);
  relax(groups, keepout);
  let bestCost = tangle(groups);
  let bestCards = groups.map(g => g.card.slice());
  for (let round = 0; round < 10; round++) {
    untangle(groups, 1.35);
    relax(groups, keepout);
    const now = tangle(groups);
    if (now < bestCost - 1e-9) {
      bestCost = now;
      bestCards = groups.map(g => g.card.slice());
    }
  }
  groups.forEach((g, i) => { g.card = bestCards[i]; });
  untangle(groups, 1);
  relax(groups, keepout);
}

// The border mesh is open lines, not closed rings, so it needs its own sink.
function lineSink() {
  let out = [], run = [];
  const r = v => Math.round(v * 10) / 10;
  const flush = () => {
    if (run.length >= 2) out.push('M' + run.map(p => p.join(',')).join('L'));
    run = [];
  };
  return {
    moveTo(x, y) { flush(); run.push([r(x), r(y)]); },
    lineTo(x, y) {
      const nx = r(x), ny = r(y), last = run[run.length - 1];
      if (!last || last[0] !== nx || last[1] !== ny) run.push([nx, ny]);
    },
    closePath() {},
    arc() {},
    result() { flush(); const s = out.join(''); out = []; return s; },
  };
}

/* ── untangling ──────────────────────────────────────────────────────────────
 *
 * The solver places cards well but assigns them to pins greedily, so two
 * strings often cross where simply exchanging the two cards would fix it —
 * Rome and San Gimignano, Sarajevo and Dubrovnik.
 *
 * Exchanging two cards leaves the SET of occupied positions exactly as it was.
 * Card overlap, land coverage and sheet bounds therefore cannot change: they
 * are properties of the set, not of the assignment. Only the strings move.
 * That makes this a safe pass to run last, and it is why it can optimise
 * purely for legibility without having to re-check anything else.
 *
 * Cost, in order of importance: strings that cross each other, strings that
 * run underneath somebody else's card, and total string length as a tie-break
 * so that all else being equal every photograph sits near its own pin.
 */
const CROSS_COST = 60, UNDER_COST = 22, LENGTH_COST = 0.03;

function segmentsCross(p1, p2, p3, p4) {
  const d = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const d1 = d(p3, p4, p1), d2 = d(p3, p4, p2);
  const d3 = d(p1, p2, p3), d4 = d(p1, p2, p4);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

// Does the segment a–b pass through the axis-aligned box centred on c?
// Liang–Barsky, which is shorter than testing the four edges separately.
function segmentHitsBox(a, b, c, w, h) {
  const x0 = c[0] - w / 2, x1 = c[0] + w / 2;
  const y0 = c[1] - h / 2, y1 = c[1] + h / 2;
  let t0 = 0, t1 = 1;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  for (const [p, q] of [[-dx, a[0] - x0], [dx, x1 - a[0]],
                        [-dy, a[1] - y0], [dy, y1 - a[1]]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
    else       { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t1 > t0;
}

function tangle(groups) {
  let cost = 0;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    cost += Math.hypot(g.card[0] - g.pin[0], g.card[1] - g.pin[1]) * LENGTH_COST;
    for (let j = 0; j < groups.length; j++) {
      if (i === j) continue;
      const o = groups[j];
      if (segmentHitsBox(g.pin, g.card, o.card, BOX.w, BOX.h)) cost += UNDER_COST;
      if (j > i && segmentsCross(g.pin, g.card, o.pin, o.card)) cost += CROSS_COST;
    }
  }
  return cost;
}

function untangle(groups, slack) {
  const m = groups.filter(g => !g.fix);
  // During the alternating rounds the reach test is loosened, because the
  // relaxation that follows will pull an over-long string back within the
  // limit. Enforcing it strictly at this point rejected the exchange that
  // uncrosses Sarajevo and Dubrovnik purely because the intermediate state
  // needed 508 units — a state that never survives to the finished sheet.
  const limit = LEAD_MAX * (slack || 1);
  const reach = (g, card) =>
    Math.hypot(card[0] - g.pin[0], card[1] - g.pin[1]) <= limit;
  let best = tangle(groups);

  // Try an exchange, keep it only if the sheet reads better for it.
  const attempt = apply => {
    const undo = apply();
    const now = tangle(groups);
    if (now < best - 1e-9) { best = now; return true; }
    undo();
    return false;
  };

  for (let pass = 0; pass < 40; pass++) {
    let improved = false;

    // Pairs: the obvious case, two cards that plainly belong to each other's
    // pins.
    for (let i = 0; i < m.length; i++)
      for (let j = i + 1; j < m.length; j++) {
        const a = m[i], b = m[j];
        if (!reach(a, b.card) || !reach(b, a.card)) continue;
        improved = attempt(() => {
          const t = a.card; a.card = b.card; b.card = t;
          return () => { const u = a.card; a.card = b.card; b.card = u; };
        }) || improved;
      }

    // Triples. Three strings can be knotted in a way no single exchange
    // improves — each swap on its own makes matters worse — so pairs alone get
    // stuck. Rotating three cards at once reaches those.
    for (let i = 0; i < m.length && !improved; i++)
      for (let j = 0; j < m.length; j++) {
        if (j === i) continue;
        for (let k = 0; k < m.length; k++) {
          if (k === i || k === j) continue;
          const a = m[i], b = m[j], c = m[k];
          if (!reach(a, b.card) || !reach(b, c.card) || !reach(c, a.card)) continue;
          if (attempt(() => {
            const t = a.card; a.card = b.card; b.card = c.card; c.card = t;
            return () => { const u = c.card; c.card = b.card; b.card = a.card; a.card = u; };
          })) { improved = true; break; }
        }
        if (improved) break;
      }

    if (!improved) break;
  }
  return best;
}

// A stable small integer from a string, so a card's tilt never changes between
// builds but also never had to be typed out by hand.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}
const tiltOf = id => Math.round(((hash(id) * 2 - 1) * MAX_TILT) * 10) / 10;

// ── card placement ───────────────────────────────────────────────────────────
// A rotated card needs a slightly larger box than an upright one. Rather than
// compute the exact rotated hull, inflate by the sagitta of the worst tilt.
const rad = MAX_TILT * Math.PI / 180;
const boxOf = scale => ({
  w: CARD_W * scale * Math.cos(rad) + CARD_H * scale * Math.sin(rad) + PAD,
  h: CARD_H * scale * Math.cos(rad) + CARD_W * scale * Math.sin(rad) + PAD,
});

// MAX_SCALE is a ceiling on the base sheet, where it is the right one — a card
// larger than this on a 1.94:1 frame is a photograph competing with the map.
// A tall frame is a different proposition: it has half as much country and
// three times as much sea, and holding the cards at the base ceiling there is
// what left them looking tiny. The ceiling rises with the room.
let SCALE_CAP = MAX_SCALE;

function scaleFor(n, seaFraction) {
  if (!n) return 1;
  const full = boxOf(1);
  const sea = SHEET_W * SHEET_H * seaFraction;
  const s = Math.sqrt(TARGET_FILL * sea / (n * full.w * full.h));
  return Math.max(MIN_SCALE, Math.min(SCALE_CAP, Math.round(s * 100) / 100));
}

let BOX = boxOf(1);   // set per sheet before placing

const overlap = (a, b) => Math.max(0, BOX.w - Math.abs(a[0] - b[0])) *
                          Math.max(0, BOX.h - Math.abs(a[1] - b[1]));

function outOfBounds(c) {
  const x0 = c[0] - BOX.w / 2, x1 = c[0] + BOX.w / 2;
  const y0 = c[1] - BOX.h / 2, y1 = c[1] + BOX.h / 2;
  return Math.max(0, -x0) + Math.max(0, x1 - SHEET_W) +
         Math.max(0, -y0) + Math.max(0, y1 - SHEET_H);
}

// Above the pin first, then further and further round. Cards above their pin
// read best — the photograph sits over the place — so the sweep is ordered by
// how far each candidate departs from straight up.
const ANGLES = [];
for (let step = 0; step <= 9; step++)
  for (const sign of (step === 0 ? [1] : [-1, 1]))
    ANGLES.push(-90 + sign * step * 20);

function place(groups, scale, land) {
  const lead = LEAD * scale;
  // Try the preferred distance first, then further out. On a crowded sheet the
  // sea either side of the country is the only room there is.
  const RADII = [lead, lead * 1.7, lead * 2.5];
  const placed = [];
  // Overridden groups are positioned exactly as asked and then held still,
  // so the solver works around them rather than the other way about.
  for (const g of groups) {
    if (!g.fix) continue;
    const a = g.fix.angle * Math.PI / 180;
    g.card = [g.pin[0] + Math.cos(a) * g.fix.lead,
              g.pin[1] + Math.sin(a) * g.fix.lead];
    // Held still afterwards, but not allowed off the frame: a card hanging
    // over the edge is cut in half on screen, which is worse than one nudged
    // a few units from where it was asked to be. Reported below when it
    // happens, so the override can be corrected rather than silently ignored.
    const bx = Math.min(SHEET_W - BOX.w / 2, Math.max(BOX.w / 2, g.card[0]));
    const by = Math.min(SHEET_H - BOX.h / 2, Math.max(BOX.h / 2, g.card[1]));
    if (bx !== g.card[0] || by !== g.card[1]) g.nudged = true;
    g.card = [bx, by];
    placed.push(g);
  }
  for (const g of groups) {
    if (g.fix) continue;
    let best = null;
    outer:
    for (const r of RADII) {
      for (const deg of ANGLES) {
        const a = deg * Math.PI / 180;
        const c = [g.pin[0] + Math.cos(a) * r, g.pin[1] + Math.sin(a) * r];
        // a longer string is a mild cost, so a near slot beats a far one
        let score = outOfBounds(c) * 400 + (r - lead) * 0.4
                  + land.under(c, BOX.w, BOX.h) * LAND_WEIGHT;
        for (const p of placed) score += overlap(c, p.card);
        // a card sitting on top of somebody else's pin hides it
        for (const o of groups) if (o !== g) {
          if (Math.abs(c[0] - o.pin[0]) < BOX.w / 2 &&
              Math.abs(c[1] - o.pin[1]) < BOX.h / 2) score += 900;
        }
        if (!best || score < best.score) best = {score, card: c};
        if (score === 0) break outer;   // straight up and clear: take it
      }
    }
    g.card = best.card;
    placed.push(g);
  }

}

/* Relaxation. The greedy pass gets close; this clears the residue, keeps every
 * card on the sheet, and stops any of them wandering so far from its pin that
 * the string stops being believable.
 *
 * Separate from the greedy pass so it can be run again after untangling. The
 * two alternate: untangling decides WHICH card belongs to which pin, relaxing
 * decides WHERE the cards sit, and each makes the other's job easier. Running
 * relaxation only once left Sarajevo and Dubrovnik crossed, because the
 * exchange that would have fixed them needed a 508-unit string — but after the
 * positions were allowed to settle around the new assignment, the same
 * exchange needed far less. */
// How far a card may drift from its pin. A distance in map terms, so on a
// frame whose map is drawn twice as large it is twice as long — left fixed,
// it quietly reeled the cards back onto the country as the sheet grew.
let LEAD_CAP = LEAD_MAX;

function relax(groups, land) {
  for (let iter = 0; iter < 900; iter++) {
    let moved = 0;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const A = groups[i], B = groups[j];
        if (A.fix && B.fix) continue;   // both held: nothing to negotiate
        const a = A.card, b = B.card;
        const dx = b[0] - a[0], dy = b[1] - a[1];
        const ox = BOX.w - Math.abs(dx), oy = BOX.h - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        // A fixed card does not yield, so the free one absorbs the whole push
        const wa = A.fix ? 0 : (B.fix ? 1 : 0.5);
        const wb = B.fix ? 0 : (A.fix ? 1 : 0.5);

        // Prefer the shallower axis, but only if there is somewhere to go on
        // it. Pushing along the shallower axis unconditionally could drive a
        // card into the edge of the sheet, where the bounds clamp put it back
        // exactly where it started — a standoff that never resolved, and the
        // reason a card was left sitting on top of a hand-placed one.
        //
        // A always moves AWAY from B, so A's direction is the opposite of the
        // sign of (B - A), and B's is the same as it. Getting that backwards
        // is what made the first version of this check useless.
        const room = axis => {
          const d = (axis ? dy : dx) < 0 ? 1 : -1;      // A's direction
          const lo = (axis ? BOX.h : BOX.w) / 2;
          const hi = (axis ? SHEET_H : SHEET_W) - lo;
          const ra = wa ? (d > 0 ? hi - a[axis] : a[axis] - lo) : Infinity;
          const rb = wb ? (d > 0 ? b[axis] - lo : hi - b[axis]) : Infinity;
          return Math.min(ra, rb);
        };

        const needX = ox + 1, needY = oy + 1;
        const canX = room(0) >= needX, canY = room(1) >= needY;
        const useX = canX && (!canY || ox < oy);

        if (useX || !canY) {
          const s = needX * (dx < 0 ? -1 : 1);
          a[0] -= s * wa; b[0] += s * wb;
        } else {
          const s = needY * (dy < 0 ? -1 : 1);
          a[1] -= s * wa; b[1] += s * wb;
        }
        moved++;
      }
    }
    // Sail off the land. Four samples give the downhill direction; the step
    // shrinks as the run goes on so the last iterations settle rather than
    // hunt. Hand-placed cards are exempt — if you put one on the map, you
    // meant to.
    const step = 3.2 * (1 - iter / 900);
    for (const g of groups) {
      if (g.fix) continue;
      if (!land.under(g.card, BOX.w, BOX.h)) continue;
      // Separation first, land second. A card that is currently overlapping
      // another one stops sailing until it is clear: two photographs on top of
      // each other is a worse failure than one photograph on top of Wales, and
      // letting both forces run at once produced a standoff where a free card
      // was pinned against a hand-placed one it could not push.
      let clashes = false;
      for (const o of groups)
        if (o !== g && overlap(g.card, o.card) > 0) { clashes = true; break; }
      if (clashes) continue;
      const d = GRID * 2;
      const gx = land.under([g.card[0] + d, g.card[1]], BOX.w, BOX.h)
               - land.under([g.card[0] - d, g.card[1]], BOX.w, BOX.h);
      const gy = land.under([g.card[0], g.card[1] + d], BOX.w, BOX.h)
               - land.under([g.card[0], g.card[1] - d], BOX.w, BOX.h);
      const m = Math.hypot(gx, gy);
      if (m > 0) {
        g.card[0] -= gx / m * step;
        g.card[1] -= gy / m * step;
        moved++;
      }
    }

    // Order matters here. Reining in a long string can push a card back off
    // the edge, so the string limit is applied FIRST and the sheet bounds
    // last — the bounds are the hard constraint, the string length a
    // preference. Doing it the other way round left a card hanging over the
    // frame on the British Isles sheet.
    for (const g of groups) {
      if (g.fix) continue;
      const dx = g.card[0] - g.pin[0], dy = g.card[1] - g.pin[1];
      const d = Math.hypot(dx, dy);
      if (d > LEAD_CAP) {
        g.card[0] = g.pin[0] + dx / d * LEAD_CAP;
        g.card[1] = g.pin[1] + dy / d * LEAD_CAP;
      }
      g.card[0] = Math.min(SHEET_W - BOX.w / 2, Math.max(BOX.w / 2, g.card[0]));
      g.card[1] = Math.min(SHEET_H - BOX.h / 2, Math.max(BOX.h / 2, g.card[1]));
    }
    if (!moved) break;
  }
}

const g_fixed = gs => gs.filter(g => g.fix).length;

// ── build each region ───────────────────────────────────
const byRegion = new Map();
for (const p of PHOTOS) {
  if (!byRegion.has(p.region)) byRegion.set(p.region, []);
  byRegion.get(p.region).push(p);
}

const sheets = {};

// Every region gets a sheet, whether or not anything has been shot there yet.
// Clicking a grey region should still open its map.
for (const key of Object.keys(REGIONS)) {
  const photos = byRegion.get(key) || [];
  const r = REGIONS[key];

  // ── panelled: two or more city maps in one sheet ──
  if (r.panels) {
    const built = buildPanels(r, key);
    let path = '', borders = '';
    for (const b of built) {
      const s = sink(MIN_RING);
      geoPath(b.proj, s)(b.geom);
      path += s.result();
    }
    // which panel does a coordinate belong to?
    const panelOf = (lon, lat) => built.find(b => {
      const [w, e, s, n] = b.def.box;
      return lon >= w && lon <= e && lat >= s && lat <= n;
    });
    const projectAny = (lon, lat) => {
      const b = panelOf(lon, lat);
      if (!b) return null;
      return b.proj([lon, lat]);
    };
    finish(key, r, photos, path, borders, projectAny,
           built.map(b => ({label: b.def.label,
                            rect: b.rect.flat().map(v => Math.round(v * 10) / 10)})));
    continue;
  }

  const admins = new Set(r.countries.map(c => SUBUNIT_ALIAS[c] || c));
  const mine = units.filter(g => admins.has(g.properties.admin));
  if (!mine.length) throw new Error(`${key}: no subunits matched`);

  let geom = tc.merge(topo, mine);
  geom = clipPolys(geom, r.clip);
  if (r.sheetClip) geom = clipRect(geom, r.sheetClip);

  // Exactly the arcs two different units have in common. a === b marks an
  // outer edge, which is already drawn by the silhouette.
  const borderGeom = tc.mesh(topo, {type: 'GeometryCollection', geometries: mine},
    (a, b) => a !== b && unitKey(a) !== unitKey(b));

  const [[w0, s0], [e0, n0]] = geoBounds(geom);
  const lon0 = (w0 + e0) / 2, lat0 = (s0 + n0) / 2;

  // Both conformal, so the silhouette keeps its shape. A conic handles a wide
  // east-west region; a transverse Mercator handles a tall narrow one.
  const proj = (e0 - w0) > 20
    ? geoConicConformal().rotate([-lon0, 0])
        .parallels([s0 + (n0 - s0) / 6, n0 - (n0 - s0) / 6]).center([0, lat0])
    : geoTransverseMercator().rotate([-lon0, 0]).center([0, lat0]);
  proj.fitExtent(fitBox(), geom);

  const s = sink(MIN_RING);
  geoPath(proj, s)(geom);
  const path = s.result();

  const ls = lineSink();
  geoPath(proj, ls)(borderGeom);
  const borders = ls.result();

  finish(key, r, photos, path, borders, (lon, lat) => proj([lon, lat]), null,
         {geom, proj, nUnits: new Set(mine.map(unitKey)).size});
}

/* Everything that happens once a sheet has a silhouette and a way of turning
 * a coordinate into a position on it. Shared by ordinary sheets and panelled
 * ones — the solver, the untangler and the report have no idea which they are
 * working on. */
function finish(key, r, photos, path, borders, project, panels, extra) {
  // one pin per group, in first-appearance order
  const groups = [];
  const index = new Map();
  for (const p of photos) {
    if (!index.has(p.group)) {
      const xy = project(p.lon, p.lat);
      if (!xy) throw new Error(
        `${p.id} at ${p.lat}, ${p.lon} falls outside every panel of ${key}`);
      /* An optional shove, in sheet units, applied after projection.
       *
       * Two places can be genuinely distinct and still land on the same dot.
       * Eindhoven and Nuenen are eight kilometres apart, which on a sheet of
       * the Low Countries is nine units against a pin four units across — one
       * blob with two strings coming out of it. `nudge` moves the pin without
       * touching the coordinate, so photos.js keeps saying where the
       * photograph was actually taken and the fudge stays where it belongs,
       * visible and reversible, in the record that needed it.
       *
       * Small numbers only. This is a lie about geography and the whole point
       * of the sheet is that it is not one. */
      if (p.nudge) { xy[0] += p.nudge[0]; xy[1] += p.nudge[1]; }
      const g = {key: p.group, pin: [Math.round(xy[0] * 10) / 10,
                                     Math.round(xy[1] * 10) / 10], ids: []};
      if (p.card) {
        if (typeof p.card.angle !== 'number' || typeof p.card.lead !== 'number')
          throw new Error(`${p.id}: card override needs both angle and lead`);
        g.fix = p.card;
      }
      index.set(p.group, g);
      groups.push(g);
    }
    index.get(p.group).ids.push(p.id);
  }

  // Two fields. `keepout` is the land grown by COAST_MARGIN and is what the
  // solver works against, both for sizing the cards and for pushing them
  // away. `land` is the true silhouette, used only for reporting, so the
  // numbers below say what is actually covered rather than what the solver
  // was avoiding.
  const keepout = landField(path, COAST_MARGIN);
  const land = landField(path, 0);
  const scale = scaleFor(groups.length, 1 - keepout.coverage);
  BOX = boxOf(scale);
  place(groups, scale, keepout);
  relax(groups, keepout);
  const before = tangle(groups);
  // Alternating untangle and relax, best round kept — see solve(), which the
  // extra frames run as well so that every frame is solved the same way.
  solve(groups, scale, keepout);

  // Hand exchanges, applied after everything else. Exchanging two cards is a
  // permutation of positions the solver already chose, so overlap, land cover
  // and bounds are all untouched by construction — which is what makes it safe
  // to overrule the machine here without re-running any of it.
  const byKey = Object.fromEntries(groups.map(g => [g.key, g]));
  for (const [a, c] of (SWAPS[key] || [])) {
    if (!byKey[a] || !byKey[c])
      throw new Error(`CARD_SWAPS.${key}: no such group "${byKey[a] ? c : a}"`);
    const t = byKey[a].card; byKey[a].card = byKey[c].card; byKey[c].card = t;
  }

  // Tilt is keyed to the photograph, not to the slot, so a card keeps its own
  // angle wherever untangling puts it.
  const cards = {};
  for (const g of groups) {
    g.ids.forEach((id, i) => {
      cards[id] = {
        x: Math.round((g.card[0] + STACK_DX * scale * i) * 10) / 10,
        y: Math.round((g.card[1] + STACK_DY * scale * i) * 10) / 10,
        rot: tiltOf(id),
        z: g.ids.length - i,   // first in the group sits on top of the pile
      };
    });
    g.card = g.card.map(v => Math.round(v * 10) / 10);
  }

  // as a percentage of the sheet's width, which is what the CSS needs
  const cardW = Math.round(CARD_W * scale / SHEET_W * 1000) / 10;
  sheets[key] = {w: SHEET_W, h: SHEET_H, path, borders, cardW, groups, cards};
  if (panels) sheets[key].panels = panels;

  // ── report ────────────────────────────────────────────────────────────────
  console.log(`\n${key} — ${photos.length} photographs in ${groups.length} groups` +
              (g_fixed(groups) ? `  (${g_fixed(groups)} placed by hand)` : ''));
  if (panels) {
    console.log(`  ${panels.length} panels: ${panels.map(p => p.label).join(', ')}` +
                `   path ${(path.length / 1024).toFixed(1)}kB`);
  } else {
    const b = geoPath(extra.proj).bounds(extra.geom);
    console.log(`  silhouette ${(b[1][0]-b[0][0]).toFixed(0)}×${(b[1][1]-b[0][1]).toFixed(0)}` +
                `   path ${(path.length/1024).toFixed(1)}kB` +
                `   ${extra.nUnits} unit${extra.nUnits === 1 ? '' : 's'}, ` +
                `borders ${(borders.length/1024).toFixed(1)}kB`);
  }
  if (groups.length) {
    const onLand = groups.reduce((t, g) => t + land.under(g.card, BOX.w, BOX.h), 0);
    const cardArea = groups.length * BOX.w * BOX.h;
    console.log(`  cards at ${(scale * 100).toFixed(0)}% ` +
                `(${(CARD_W * scale).toFixed(0)}×${(CARD_H * scale).toFixed(0)}), ` +
                `filling ${(100 * cardArea / (SHEET_W * SHEET_H)).toFixed(0)}% of the sheet`);
    console.log(`  silhouette ${(100 * land.coverage).toFixed(0)}% of the sheet, ` +
                `keep-out ${(100 * keepout.coverage).toFixed(0)}%; ` +
                `cards sit on ${(100 * onLand / cardArea).toFixed(1)}% of their own area ` +
                `(${groups.filter(g => land.under(g.card, BOX.w, BOX.h) === 0).length}` +
                `/${groups.length} completely clear)`);
  }
  // Measured on the CARDS, not on the padded boxes the solver works with.
  // Two cards whose padding just touches are not overlapping, and reporting
  // them as a failure would make the check cry wolf.
  const cw = CARD_W * scale, ch = CARD_H * scale;
  const realOverlap = (a, b) => Math.max(0, cw - Math.abs(a[0] - b[0])) *
                                Math.max(0, ch - Math.abs(a[1] - b[1]));
  let worst = 0, off = 0, far = 0;
  for (let i = 0; i < groups.length; i++) {
    for (let j = i + 1; j < groups.length; j++)
      worst = Math.max(worst, realOverlap(groups[i].card, groups[j].card));
    // A tenth of a unit, not zero: the coordinates are rounded to 1dp on the
    // way out, so a card clamped exactly to the edge reports a hair of
    // overflow that is neither real nor visible.
    if (outOfBounds(groups[i].card) > 0.5) off++;
    const d = Math.hypot(groups[i].card[0] - groups[i].pin[0],
                         groups[i].card[1] - groups[i].pin[1]);
    if (d > LEAD_MAX + 1) far++;
  }
  for (const g of groups) {
    const d = Math.hypot(g.card[0] - g.pin[0], g.card[1] - g.pin[1]);
    console.log(`   ${g.key.padEnd(10)} pin ${String(g.pin).padEnd(14)}` +
                ` card ${String(g.card).padEnd(14)} leader ${d.toFixed(0)}` +
                (g.ids.length > 1 ? `   stack of ${g.ids.length}` : '') +
                (g.nudged ? '   ← override pulled back onto the sheet' : ''));
  }
  let crossings = 0, under = 0;
  for (let i = 0; i < groups.length; i++)
    for (let j = 0; j < groups.length; j++) {
      if (i === j) continue;
      if (segmentHitsBox(groups[i].pin, groups[i].card, groups[j].card, BOX.w, BOX.h)) under++;
      if (j > i && segmentsCross(groups[i].pin, groups[i].card,
                                 groups[j].pin, groups[j].card)) crossings++;
    }
  if (groups.length)
    console.log(`  untangled ${before.toFixed(0)} -> ${tangle(groups).toFixed(0)}   ` +
                `${crossings} crossing${crossings === 1 ? '' : 's'}, ` +
                `${under} string${under === 1 ? '' : 's'} under a card`);
  for (const [a, c] of (SWAPS[key] || []))
    console.log(`  hand exchange: ${a} <-> ${c}`);
  console.log(`  overlap ${worst.toFixed(1)}px²   off-sheet ${off}   over-long leaders ${far}`);
  if (worst > 0.5 || off || far) {
    console.error('  *** placement did not fully resolve ***');
    process.exitCode = 1;
  }

  // Extra frames last, so everything above — including the report — describes
  // the base sheet exactly as it always did.
  if (MULTIFRAME.has(key) && !panels && groups.length) {
    Object.assign(sheets[key], buildFrames(key, path, groups));
  }
}

mkdirSync('js', {recursive: true});
writeFileSync('js/atlas-sheets.js',
  '/* Generated by build_sheets.mjs — do not edit by hand. */\n' +
  'window.ATLAS_SHEETS = ' +
  JSON.stringify({sheets}) + ';\n');

const bytes = JSON.stringify(sheets).length;
console.log(`\nwrote js/atlas-sheets.js — ${(bytes / 1024).toFixed(1)}kB`);
