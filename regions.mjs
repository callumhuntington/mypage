/* regions.mjs — the region map.
 *
 * The one piece of configuration in the atlas. Both build scripts import it,
 * so the world map and the region sheets can never disagree about what a
 * region is. Country names must match Natural Earth's spelling exactly; the
 * build throws rather than silently dropping one.
 *
 * clip:      [lonW, lonE, latS, latN] — Natural Earth files overseas
 *            departments and dependencies under the parent country, which
 *            would drag a region's outline across the map. The window keeps
 *            only the polygons whose centre falls inside it.
 * sheetClip: the same idea, applied when the region opens. South Africa should
 *            open on the Cape rather than the whole country.
 */

/* Countries whose SUBUNITS get their own internal borders on a region sheet.
 * Everything not listed here is drawn as one country, so Belgium does not
 * arrive split into three regions and Bosnia is not cut in half along the
 * Republika Srpska line. Add a country here to see inside it. */
export const SPLIT_SUBUNITS = new Set(['United Kingdom']);

/* The subunits layer spells three of these differently from the countries
 * layer the world map uses. */
export const SUBUNIT_ALIAS = {
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Macedonia':        'North Macedonia',
  'Serbia':           'Republic of Serbia',
};

export const REGIONS = {
  usa:          {label: 'united states',
                 countries: ['United States of America'],
                 clip: [-170, -60, 18, 72],
                 sheetClip: [-125, -66, 24, 50]},          // contiguous only

  southerncone: {label: 'southern cone',
                 countries: ['Argentina', 'Brazil', 'Uruguay'],
                 clip: [-76, -30, -56, 6],
                 sheetClip: [-66, -41, -38, -19]},        // the Plata, RS and
                                                          // São Paulo, with a
                                                          // margin all round

  britishisles: {label: 'british isles',
                 countries: ['United Kingdom', 'Ireland'],
                 clip: [-11, 2, 49, 61],
                 // Orkney and Shetland are trimmed from the SHEET only — they
                 // reach 60.8°N against Dunnet Head's 58.7°N, so two degrees
                 // of empty North Sea were setting the frame's height for a
                 // handful of islands with nothing on them. They stay on the
                 // world map, where they cost nothing.
                 sheetClip: [-11, 2, 49, 58.72]},

  iberia:       {label: 'iberia',
                 countries: ['Spain', 'Portugal'],
                 clip: [-10, 4, 35, 44]},                  // drops the Canaries

  france:       {label: 'france',
                 countries: ['France'],
                 clip: [-6, 10, 41, 52]},                  // drops Guyane et al

  germany:      {label: 'germany',
                 countries: ['Germany']},

  lowcountries: {label: 'the low countries',
                 countries: ['Belgium', 'Netherlands', 'Luxembourg'],
                 clip: [2, 8, 49, 54]},   // drops the Caribbean Netherlands,
                                          // which Natural Earth files under
                                          // the parent and which otherwise
                                          // stretched the region to 293px wide

  italy:        {label: 'italy',
                 countries: ['Italy']},

  // Kosovo is included because Serbia's polygon in this dataset excludes it,
  // and without it the merged silhouette has a hole in the middle. This is a
  // requirement of drawing one solid shape, not a position on anything.
  yugoslavia:   {label: 'former yugoslavia',
                 countries: ['Serbia', 'Croatia', 'Slovenia', 'Bosnia and Herz.',
                             'Montenegro', 'Macedonia', 'Kosovo']},

  greeceturkey: {label: 'greece & turkey',
                 countries: ['Greece', 'Turkey']},

  baltics:      {label: 'the baltics',
                 countries: ['Lithuania', 'Latvia', 'Estonia']},

  caucasus:     {label: 'the caucasus',
                 countries: ['Armenia', 'Georgia', 'Azerbaijan']},

  southafrica:  {label: 'south africa',
                 countries: ['South Africa'],
                 clip: [10, 34, -36, -20],                 // drops Prince Edward Is.
                 sheetClip: [17, 21, -35.5, -32.5]},       // the Cape

  // Been, nothing shot. Kept in the data so the third state has something to
  // show; delete this entry if you would rather the map only carried film.
  oceania:      {label: 'australia & new zealand',
                 countries: ['Australia', 'New Zealand'],
                 clip: [110, 180, -48, -9]},
};
