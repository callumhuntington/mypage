#!/usr/bin/env node
/**
 * prepare_subunits.mjs — builds subunits-topo.json and cities-10m.json
 *
 * The world map is drawn from `world-atlas`, which only knows countries. The
 * region sheets need one level down, because "borders between England, Wales
 * and Scotland" is not a thing the countries layer can express. Natural
 * Earth's map-subunits layer can: it splits the United Kingdom into its four
 * constituent countries, and leaves most other countries whole.
 *
 * That layer is not on npm, so this script fetches it once, throws away the
 * ~270 countries the atlas has no use for, and writes a small TopoJSON that
 * sits beside the build scripts, never served. Re-run it only when regions.mjs gains a country.
 *
 * It also prepares the city panels. Those need Natural Earth's 10m coastline
 * rather than the 50m one everything else uses: at the scale of a single city
 * the 50m data is a handful of vertices and draws a rectangle where the
 * Bosphorus should be. The 10m file is 12.7MB, so this script keeps only the
 * rings inside each panel window plus a degree of margin, which comes to a few
 * kilobytes.
 *
 *   node prepare_subunits.mjs
 *
 * Building a TOPOLOGY rather than keeping GeoJSON is the whole point: shared
 * arcs are what let the silhouette dissolve cleanly and what let the internal
 * borders be extracted as exactly the edges two units have in common.
 */

import {writeFileSync, existsSync, readFileSync} from 'fs';
import {topology} from 'topojson-server';
import {REGIONS, SUBUNIT_ALIAS} from './regions.mjs';

const URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/' +
            'master/geojson/ne_50m_admin_0_map_subunits.geojson';
const CACHE = 'ne_50m_admin_0_map_subunits.geojson';

const wanted = new Set();
for (const r of Object.values(REGIONS))
  for (const c of r.countries) wanted.add(SUBUNIT_ALIAS[c] || c);

let raw;
if (existsSync(CACHE)) {
  raw = JSON.parse(readFileSync(CACHE));
  console.log('using cached', CACHE);
} else {
  console.log('fetching', URL);
  raw = await (await fetch(URL)).json();
  writeFileSync(CACHE, JSON.stringify(raw));
}

const feats = raw.features.filter(f => wanted.has(f.properties.ADMIN));

const found = new Set(feats.map(f => f.properties.ADMIN));
const missing = [...wanted].filter(w => !found.has(w));
if (missing.length) throw new Error('not in the subunits layer: ' + missing.join(', '));

const clean = feats.map(f => ({
  type: 'Feature',
  properties: {admin: f.properties.ADMIN, subunit: f.properties.SUBUNIT},
  geometry: f.geometry,
}));

const topo = topology({units: {type: 'FeatureCollection', features: clean}}, 1e5);

writeFileSync('subunits-topo.json', JSON.stringify(topo));

const byAdmin = {};
for (const f of clean) (byAdmin[f.properties.admin] ||= []).push(f.properties.subunit);
console.log(`\n${clean.length} subunits across ${Object.keys(byAdmin).length} countries`);
for (const [a, s] of Object.entries(byAdmin).sort())
  if (s.length > 1) console.log('  ' + a.padEnd(26) + s.join(', '));
console.log(`\nwrote subunits-topo.json — ` +
            `${(JSON.stringify(topo).length / 1024).toFixed(0)}kB`);

// ── the city panels ──────────────────────────────────────────────────────────
const CITY_URL = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/' +
                 'master/geojson/ne_10m_admin_0_countries.geojson';
const CITY_CACHE = 'ne_10m_admin_0_countries.geojson';
const MARGIN = 1;   // degrees kept beyond each window, so a box can be nudged
                    // without re-running this script

const panels = [];
for (const [key, r] of Object.entries(REGIONS))
  for (const p of (r.panels || [])) panels.push({region: key, ...p});

if (!panels.length) {
  console.log('no panelled regions — nothing more to do');
} else {
  let fine;
  if (existsSync(CITY_CACHE)) {
    fine = JSON.parse(readFileSync(CITY_CACHE));
    console.log('\nusing cached', CITY_CACHE);
  } else {
    console.log('\nfetching', CITY_URL);
    fine = await (await fetch(CITY_URL)).json();
    writeFileSync(CITY_CACHE, JSON.stringify(fine));
  }

  const ringsOf = name => {
    const f = fine.features.find(x => x.properties.ADMIN === name);
    if (!f) throw new Error(`10m data has no country "${name}"`);
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    return polys.flat();
  };

  const out = {};
  for (const p of panels) {
    const [w, e, s, n] = p.box;
    const win = [w - MARGIN, e + MARGIN, s - MARGIN, n + MARGIN];
    const kept = [];
    for (const ring of ringsOf(p.country)) {
      // keep any ring with a point in the window; clipping happens at build
      // time so the window can be adjusted without coming back here
      if (ring.some(([x, y]) => x >= win[0] && x <= win[1] && y >= win[2] && y <= win[3]))
        kept.push(ring.map(([x, y]) => [Math.round(x * 1e4) / 1e4,
                                        Math.round(y * 1e4) / 1e4]));
    }
    if (!kept.length) throw new Error(`${p.region}/${p.label}: window is empty`);
    out[p.region + '/' + p.label] = kept;
    console.log(`  ${(p.region + '/' + p.label).padEnd(24)}` +
                `${kept.length} ring(s), ${kept.reduce((t, r) => t + r.length, 0)} points`);
  }

  writeFileSync('cities-10m.json', JSON.stringify(out));
  console.log(`wrote cities-10m.json — ` +
              `${(JSON.stringify(out).length / 1024).toFixed(0)}kB`);
}
