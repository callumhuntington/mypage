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

import {readFileSync, writeFileSync, mkdirSync} from 'fs';
import * as tc from 'topojson-client';
import {presimplify, simplify, quantile} from 'topojson-simplify';
import {geoTransverseMercator, geoConicConformal, geoPath, geoBounds} from 'd3-geo';
import {REGIONS, SPLIT_SUBUNITS, SUBUNIT_ALIAS} from './regions.mjs';

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
const SHEET_W = 1400, SHEET_H = 720;
// Inset of the silhouette within the sheet. FIT_Y is the one that matters:
// every region so far is fitted to its height, so this is what decides how
// large the map is drawn — and it buys a band of clear white above and below
// that the cards can use without touching the country.
const FIT_X = 60, FIT_Y = 104;
const FIT = [[FIT_X, FIT_Y], [SHEET_W - FIT_X, SHEET_H - FIT_Y]];

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

const seen = new Set();
for (const p of PHOTOS) {
  if (seen.has(p.id)) throw new Error(`duplicate photo id: ${p.id}`);
  seen.add(p.id);
  if (!REGIONS[p.region]) throw new Error(`${p.id}: unknown region "${p.region}"`);
  if (typeof p.lat !== 'number' || typeof p.lon !== 'number')
    throw new Error(`${p.id}: needs lat and lon`);
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
    const rings = poly.map(clipRing).filter(r => r.length >= 3)
                      .map(r => r.concat([r[0]]));
    if (rings.length) kept.push(rings);
  }
  if (!kept.length) throw new Error('sheetClip window removed everything');
  return {type: 'MultiPolygon', coordinates: kept};
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

function scaleFor(n, seaFraction) {
  if (!n) return 1;
  const full = boxOf(1);
  const sea = SHEET_W * SHEET_H * seaFraction;
  const s = Math.sqrt(TARGET_FILL * sea / (n * full.w * full.h));
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, Math.round(s * 100) / 100));
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

  // Relaxation. The greedy pass gets close; this clears the residue, keeps
  // every card on the sheet, and stops any of them wandering so far from its
  // pin that the leader stops being believable.
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
      if (d > LEAD_MAX) {
        g.card[0] = g.pin[0] + dx / d * LEAD_MAX;
        g.card[1] = g.pin[1] + dy / d * LEAD_MAX;
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
  proj.fitExtent(FIT, geom);

  const s = sink(MIN_RING);
  geoPath(proj, s)(geom);
  const path = s.result();

  const ls = lineSink();
  geoPath(proj, ls)(borderGeom);
  const borders = ls.result();

  // one pin per group, in first-appearance order
  const groups = [];
  const index = new Map();
  for (const p of photos) {
    if (!index.has(p.group)) {
      const xy = proj([p.lon, p.lat]);
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

  // ── report ────────────────────────────────────────────────────────────────
  const b = geoPath(proj).bounds(geom);
  console.log(`\n${key} — ${photos.length} photographs in ${groups.length} groups` +
              (g_fixed(groups) ? `  (${g_fixed(groups)} placed by hand)` : ''));
  const nUnits = new Set(mine.map(unitKey)).size;
  console.log(`  silhouette ${(b[1][0]-b[0][0]).toFixed(0)}×${(b[1][1]-b[0][1]).toFixed(0)}` +
              `   path ${(path.length/1024).toFixed(1)}kB` +
              `   ${nUnits} unit${nUnits === 1 ? '' : 's'}, ` +
              `borders ${(borders.length/1024).toFixed(1)}kB`);
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
  console.log(`  overlap ${worst.toFixed(1)}px²   off-sheet ${off}   over-long leaders ${far}`);
  if (worst > 0.5 || off || far) {
    console.error('  *** placement did not fully resolve ***');
    process.exitCode = 1;
  }
}

mkdirSync('js', {recursive: true});
writeFileSync('js/atlas-sheets.js',
  '/* Generated by build_sheets.mjs — do not edit by hand. */\n' +
  'window.ATLAS_SHEETS = ' +
  JSON.stringify({sheets}) + ';\n');

const bytes = JSON.stringify(sheets).length;
console.log(`\nwrote js/atlas-sheets.js — ${(bytes / 1024).toFixed(1)}kB`);
