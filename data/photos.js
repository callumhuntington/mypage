/* photos.js — the photographs.
 *
 * THIS IS THE FILE YOU EDIT. Everything else about the atlas is generated
 * from it. Add a record, re-run `node build_sheets.mjs`, commit both.
 *
 * Fields
 *   id       file stem. The page looks for images/<dir>/<id>_thumb.jpeg for
 *            the card and images/<dir>/<id>_full.jpeg for the lightbox.
 *   place    what goes on the card, first line
 *   sub      second line, with the year. Whatever sits one level below the
 *            sheet's own title: the country on a sheet made of several, the
 *            region on a sheet made of one. Either way it says something the
 *            title did not — "Matera, Italy" under a heading reading `italy`
 *            never did.
 *   year     number, or null if you haven't filled it in yet
 *   region   must be a key from regions.mjs
 *   dir      the folder under images/
 *   group    photographs sharing a group share one pin and are stacked as one
 *            hand-placed pile. THIS IS A DECISION, NOT A DISTANCE — Genex
 *            Tower is in Belgrade because you say so, not because it is 5km
 *            from Republic Square.
 *   lat/lon  where the pin goes
 *   card     OPTIONAL, on the first record of a group. {angle, lead} places
 *            the card by hand instead of letting the solver choose: angle in
 *            degrees where -90 is straight up, 0 is due east, 90 is straight
 *            down; lead is the distance from pin to card centre in sheet
 *            units, where the sheet is 1000 x 720. Everything else shuffles
 *            out of the way of a hand-placed card. Omit it and the solver
 *            picks, which is fine for most.
 *
 * Order matters twice over: it is the order the lightbox pages through, and
 * within a group the first record is the card on top of the pile.
 */
window.PHOTOS = [

  /* ── former yugoslavia ─────────────────────────────────────────────────── */

  {id: 'ljubljana', place: 'Ljubljana', sub: 'Slovenia',               year: 2024,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'ljubljana',
   lat: 46.0511, lon: 14.5051},

  {id: 'koper',     place: 'Koper',     sub: 'Slovenia',               year: 2025,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'koper',
   lat: 45.5480, lon: 13.7302, card: {angle: 104, lead: 130}},

  {id: 'zagreb',    place: 'Zagreb',    sub: 'Croatia',                year: 2024,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'zagreb',
   lat: 45.8131, lon: 15.9775, card: {angle: -28, lead: 140}},

  // Belgrade and Genex share a group, so they share a pin and stack.
  {id: 'belgrade',  place: 'Belgrade',  sub: 'Serbia',                 year: 2025,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'belgrade',
   lat: 44.8176, lon: 20.4633},

  {id: 'genex',     place: 'Genex Tower', sub: 'Serbia',               year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'belgrade',
   lat: 44.8180, lon: 20.4006},

  {id: 'uzice',     place: 'Užice',     sub: 'Serbia',                 year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'uzice',
   lat: 43.8563, lon: 19.8417},

  {id: 'sarajevo',  place: 'Sarajevo',  sub: 'Bosnia', year: 2025,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'sarajevo',
   lat: 43.8563, lon: 18.4131},

  {id: 'dubrovnik', place: 'Dubrovnik', sub: 'Croatia',                year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'dubrovnik',
   lat: 42.6507, lon: 18.0944, card: {angle: 152, lead: 132}},

  {id: 'kotor',     place: 'Kotor',     sub: 'Montenegro',             year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'kotor',
   lat: 42.4247, lon: 18.7712, card: {angle: -52, lead: 145}},

  {id: 'skopje',    place: 'Skopje',    sub: 'N. Macedonia',        year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'skopje',
   lat: 41.9965, lon: 21.4314},

  {id: 'ohrid',     place: 'Ohrid',     sub: 'N. Macedonia',        year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'ohrid',
   lat: 41.1172, lon: 20.8019},

  /* ── italy ─────────────────────────────────────────────────────────────── */
  /* North to south, which is also the order the lightbox pages through.
     Gaiola shares a group with Napoli: the marine park is 7km from the centre,
     which is 4px apart at sheet scale — the same situation as Genex and
     Belgrade. Give it its own `group: 'gaiola'` if you would rather it stood
     alone, and the solver will try to separate two cards that sit on the same
     dot. Years are yours to fill in; only the three that were already captioned
     on the old page are known. */

  {id: 'milan',        place: 'Milan',         sub: 'Lombardy', year: 2024,
   region: 'italy', dir: 'italy', group: 'milan',        lat: 45.4642, lon:  9.1900},

  {id: 'como',         place: 'Como',          sub: 'Lombardy', year: 2024,
   region: 'italy', dir: 'italy', group: 'como',         lat: 45.8081, lon:  9.0852},

  {id: 'trieste',      place: 'Trieste',       sub: 'Friuli-Venezia Giulia', year: 2025,
   region: 'italy', dir: 'italy', group: 'trieste',      lat: 45.6495, lon: 13.7768},

  {id: 'venice',       place: 'Venice',        sub: 'Veneto', year: 2022,
   region: 'italy', dir: 'italy', group: 'venice',       lat: 45.4408, lon: 12.3155},

  {id: 'genoa',        place: 'Genoa',         sub: 'Liguria', year: 2019,
   region: 'italy', dir: 'italy', group: 'genoa',        lat: 44.4056, lon:  8.9463},

  {id: 'portofino',    place: 'Portofino',     sub: 'Liguria', year: 2019,
   region: 'italy', dir: 'italy', group: 'portofino',    lat: 44.3033, lon:  9.2097},

  {id: 'bologna',      place: 'Bologna',       sub: 'Emilia-Romagna', year: 2022,
   region: 'italy', dir: 'italy', group: 'bologna',      lat: 44.4949, lon: 11.3426},

  {id: 'pisa',         place: 'Pisa',          sub: 'Tuscany', year: 2022,
   region: 'italy', dir: 'italy', group: 'pisa',         lat: 43.7228, lon: 10.4017},

  {id: 'florence',     place: 'Florence',      sub: 'Tuscany', year: 2023,
   region: 'italy', dir: 'italy', group: 'florence',     lat: 43.7696, lon: 11.2558},

  {id: 'sangimignano', place: 'San Gimignano', sub: 'Tuscany', year: 2024,
   region: 'italy', dir: 'italy', group: 'sangimignano', lat: 43.4677, lon: 11.0433},

  {id: 'perugia',      place: 'Perugia',       sub: 'Umbria', year: 2023,
   region: 'italy', dir: 'italy', group: 'perugia',      lat: 43.1107, lon: 12.3908},

  {id: 'laquila',      place: "L'Aquila",      sub: 'Abruzzo', year: 2025,
   region: 'italy', dir: 'italy', group: 'laquila',      lat: 42.3498, lon: 13.3995},

  {id: 'rome',         place: 'Rome',          sub: 'Lazio', year: 2025,
   region: 'italy', dir: 'italy', group: 'rome',         lat: 41.9028, lon: 12.4964},

  {id: 'napoli',       place: 'Naples',        sub: 'Campania', year: 2023,
   region: 'italy', dir: 'italy', group: 'napoli',       lat: 40.8518, lon: 14.2681},

  {id: 'gaiola',       place: 'Gaiola',        sub: 'Campania', year: 2023,
   region: 'italy', dir: 'italy', group: 'napoli',       lat: 40.7936, lon: 14.1856},

  {id: 'furore',       place: 'Furore',        sub: 'Campania', year: 2026,
   region: 'italy', dir: 'italy', group: 'furore',       lat: 40.6167, lon: 14.5500},

  {id: 'paestum',      place: 'Paestum',       sub: 'Campania', year: 2025,
   region: 'italy', dir: 'italy', group: 'paestum',      lat: 40.4200, lon: 15.0053},

  {id: 'bari',         place: 'Bari',          sub: 'Puglia', year: 2024,
   region: 'italy', dir: 'italy', group: 'bari',         lat: 41.1171, lon: 16.8719},

  {id: 'lecce',        place: 'Lecce',         sub: 'Puglia', year: 2026,
   region: 'italy', dir: 'italy', group: 'lecce',        lat: 40.3515, lon: 18.1750},

  {id: 'matera',       place: 'Matera',        sub: 'Basilicata', year: 2023,
   region: 'italy', dir: 'italy', group: 'matera',       lat: 40.6664, lon: 16.6043},

  {id: 'palermo',      place: 'Palermo',       sub: 'Sicily', year: 2026,
   region: 'italy', dir: 'italy', group: 'palermo',      lat: 38.1157, lon: 13.3615},

  {id: 'catania',      place: 'Catania',       sub: 'Sicily', year: 2020,
   region: 'italy', dir: 'italy', group: 'catania',      lat: 37.5079, lon: 15.0830},

  {id: 'syracuse',     place: 'Syracuse',      sub: 'Sicily', year: 2020,
   region: 'italy', dir: 'italy', group: 'syracuse',     lat: 37.0755, lon: 15.2866},

];
