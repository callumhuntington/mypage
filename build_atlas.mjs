#!/usr/bin/env node
/**
 * build_atlas.mjs — generates js/atlas-data.js for the gallery page.
 *
 * Input:  node_modules/world-atlas/countries-50m.json
 *         (Natural Earth, repackaged as TopoJSON)
 * Output: js/atlas-data.js — the world outline, one path per region,
 *         a centroid per region, and the labels.
 *
 * Projection: Times (Moir 1965). A compromise projection — neither equal-area
 * nor conformal — chosen because it draws northern Europe and the United
 * States around 1.5x larger than Equal Earth without Mercator's polar
 * inflation, which would have made Greenland larger than six of the regions
 * below put together.
 *
 * Nothing downstream of this file is hand-edited. Change REGIONS, re-run,
 * commit the result:
 *     npm install world-atlas topojson-client topojson-simplify d3-geo d3-geo-projection
 *     node build_atlas.mjs
 */

import {readFileSync, writeFileSync, mkdirSync} from 'fs';
import * as tc from 'topojson-client';
import {presimplify, simplify, quantile} from 'topojson-simplify';
import {geoPath} from 'd3-geo';
import {geoTimes} from 'd3-geo-projection';
import {REGIONS} from './regions.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// The region map. This object is the whole configuration; everything else in
// the file is machinery. Country names must match Natural Earth's spelling
// exactly — the build throws if one doesn't, rather than silently dropping it.
//
// clip:      [lonW, lonE, latS, latN] — Natural Earth files overseas
//            departments and sub-Antarctic islands under the parent country,
//            which would drag a region's outline across the map. The window
//            keeps only the polygons whose centre falls inside it.
// sheetClip: not used yet. Reserved for the region sheets, where South Africa
//            should open on the Cape and the Southern Cone on the Río de la
//            Plata rather than on the whole country.
// ─────────────────────────────────────────────────────────────────────────────
// The region map now lives in regions.mjs, so this script and build_sheets.mjs
// cannot drift apart about what a region is.


// The latitude band the collection actually needs: Baltic in the north,
// New Zealand and the Cape in the south. Cropping here rather than showing
// pole to pole is what keeps the map from being mostly empty ocean.
const LAT = [-48, 72];

const WIDTH = 1400;         // drawn width in viewBox units
const RETAIN = 0.14;        // fraction of points kept by simplification
const MIN_LAND = 3.0;       // px², below which an unnamed islet is dropped
const MIN_REGION = 0.2;     // px², the same for a region — a Croatian island
                            // is content, a rock in the Pacific is noise
const DROP = new Set(['Antarctica', 'Fr. S. Antarctic Lands',
                      'Heard I. and McDonald Is.']);

// ── load and simplify ────────────────────────────────────────────────────────
// Simplify the WHOLE topology before anything is merged. Doing it here rather
// than per-shape keeps a region's coastline identical to the coastline of the
// grey land around it: shared arcs stay shared, so there are no slivers.
const SRC = 'node_modules/world-atlas/countries-50m.json';
const load = () => JSON.parse(readFileSync(SRC));
const weight = quantile(presimplify(load()), RETAIN);
const topo = simplify(presimplify(load()), weight);
const geoms = topo.objects.countries.geometries.filter(g => !DROP.has(g.properties.name));

const claimed = new Map();
for (const [key, r] of Object.entries(REGIONS)) {
  for (const c of r.countries) {
    if (!geoms.some(g => g.properties.name === c))
      throw new Error(`unknown country: ${c}`);
    if (claimed.has(c))
      throw new Error(`${c} is claimed by both ${claimed.get(c)} and ${key}`);
    claimed.set(c, key);
  }
}

// Merge drops the borders inside a region, so the Balkans arrive as one
// silhouette rather than seven outlined states.
const merge = names => tc.merge(topo, geoms.filter(g => names.has(g.properties.name)));

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

const regionGeom = Object.fromEntries(Object.entries(REGIONS).map(
  ([k, r]) => [k, clipPolys(merge(new Set(r.countries)), r.clip)]));

// Everything unclaimed fuses into ONE silhouette — no internal borders, so the
// rest of the world reads as ground rather than as a political map.
const restGeom = tc.merge(topo, geoms.filter(g => !claimed.has(g.properties.name)));

// ── projection ───────────────────────────────────────────────────────────────
// Fit to the latitude band, not to the land, so the framing is a deliberate
// choice rather than a consequence of where the coastlines happen to fall.
const band = {type: 'Polygon', coordinates: [[
  ...Array.from({length: 181}, (_, i) => [-180 + i * 2, LAT[1]]),
  ...Array.from({length: 181}, (_, i) => [180 - i * 2, LAT[0]]),
  [-180, LAT[1]],
]]};

const projection = geoTimes().rotate([-10, 0]);
projection.fitWidth(WIDTH, band);
const bounds = geoPath(projection).bounds(band);
// Clip in screen space so nothing above 72°N or below 48°S is ever drawn.
projection.clipExtent([[bounds[0][0], bounds[0][1]], [bounds[1][0], bounds[1][1]]]);
const HEIGHT = Math.ceil(bounds[1][1] - bounds[0][1]);
// fitWidth leaves the band's top-left at y = bounds[0][1]; shift it to zero so
// the viewBox starts at the origin.
const shiftY = -bounds[0][1];
projection.translate([projection.translate()[0], projection.translate()[1] + shiftY]);

// ── path serialisation ───────────────────────────────────────────────────────
// A custom sink: rounds to 1dp (no visible change at this scale, roughly half
// the bytes) and discards rings below an area threshold, which is what removes
// several thousand unnamed islets from the background.
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
const draw = (geom, minArea) => {
  const s = sink(minArea);
  geoPath(projection, s)(geom);
  return s.result();
};

const land = draw(restGeom, MIN_LAND);
const regions = Object.fromEntries(Object.entries(regionGeom).map(
  ([k, g]) => [k, draw(g, MIN_REGION)]));

// A representative point per region: where a hover label hangs, and where a
// small region can be given a hit target a mouse can actually find.
const path = geoPath(projection);
const centroids = Object.fromEntries(Object.entries(regionGeom).map(([k, g]) => {
  const c = path.centroid(g);
  return [k, [Math.round(c[0] * 10) / 10, Math.round(c[1] * 10) / 10]];
}));
const boxes = Object.fromEntries(Object.entries(regionGeom).map(([k, g]) => {
  const b = path.bounds(g);
  return [k, [b[0][0], b[0][1], b[1][0], b[1][1]].map(v => Math.round(v * 10) / 10)];
}));

// ── write ────────────────────────────────────────────────────────────────────
const data = {
  width: WIDTH,
  height: HEIGHT,
  order: Object.keys(REGIONS),
  labels: Object.fromEntries(Object.entries(REGIONS).map(([k, r]) => [k, r.label])),
  land,
  regions,
  centroids,
  boxes,
};

mkdirSync('js', {recursive: true});
writeFileSync('js/atlas-data.js',
  '/* Generated by build_atlas.mjs — do not edit by hand. */\n' +
  'window.ATLAS = ' + JSON.stringify(data) + ';\n');

// ── report ───────────────────────────────────────────────────────────────────
const kb = s => (s.length / 1024).toFixed(1).padStart(6);
console.log(`viewBox 0 0 ${WIDTH} ${HEIGHT}   band ${LAT[0]}..${LAT[1]}°   ` +
            `simplify weight ${weight.toExponential(2)}`);
console.log('land'.padEnd(14), kb(land), 'kB');
for (const k of Object.keys(REGIONS)) {
  const b = boxes[k];
  console.log(' ', k.padEnd(12), kb(regions[k]), 'kB',
    ' hit box', (`${(b[2] - b[0]).toFixed(0)}×${(b[3] - b[1]).toFixed(0)}`).padStart(8),
    ' centroid', String(centroids[k]));
}
const total = land.length + Object.values(regions).join('').length;
console.log('TOTAL path data', (total / 1024).toFixed(1), 'kB');
