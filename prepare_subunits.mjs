#!/usr/bin/env node
/**
 * prepare_subunits.mjs — builds data/subunits-topo.json
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
