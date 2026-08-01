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
/* Hand exchanges, by region and group name. The solver picks which card goes
 * on which pin, and it optimises for strings that do not cross and do not run
 * too far. It cannot see everything: two cards can avoid crossing and still
 * look the wrong way round, because one pin is east of the other while its
 * card sits west.
 *
 * Listing a pair here exchanges their two cards after placement is finished.
 * That is a permutation of positions the solver already chose, so nothing else
 * on the sheet moves — no card overlaps another, none leaves the sheet, and
 * the map stays exactly as clear as it was. Rebuild after editing.
 */
window.CARD_SWAPS = {
  yugoslavia: [['dubrovnik', 'zabljak']],
  iberia:     [['sansebastian', 'bilbao']],
};

window.PHOTOS = [

  /* ── former yugoslavia ─────────────────────────────────────────────────── */

  {id: 'ljubljana', place: 'Ljubljana', sub: 'Slovenia',               year: 2024,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'ljubljana',
   lat: 46.0511, lon: 14.5051},

  {id: 'koper',     place: 'Koper',     sub: 'Slovenia',               year: 2025,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'koper',
   lat: 45.5480, lon: 13.7302},

  {id: 'zagreb',    place: 'Zagreb',    sub: 'Croatia',                year: 2024,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'zagreb',
   lat: 45.8131, lon: 15.9775},

  {id: 'subotica',  place: 'Subotica',  sub: 'Serbia',                 year: 2025,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'subotica',
   lat: 46.1000, lon: 19.6650},

  // Belgrade, Genex and the Blue Train share a group, so they share one pin
  // and stack into a pile of three.
  {id: 'belgrade',  place: 'Belgrade',  sub: 'Serbia',                 year: 2025,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'belgrade',
   lat: 44.8176, lon: 20.4633},

  {id: 'genex',     place: 'Genex Tower', sub: 'Serbia',               year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'belgrade',
   lat: 44.8180, lon: 20.4006},

  {id: 'titostrain', place: "Tito's Blue Train", sub: 'Serbia',        year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'belgrade',
   lat: 44.7719, lon: 20.4472},

  {id: 'uzice',     place: 'Užice',     sub: 'Serbia',                 year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'uzice',
   lat: 43.8563, lon: 19.8417},

  {id: 'sarajevo',  place: 'Sarajevo',  sub: 'Bosnia', year: 2025,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'sarajevo',
   lat: 43.8563, lon: 18.4131},

  {id: 'zabljak',   place: 'Žabljak',   sub: 'Montenegro',             year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'zabljak',
   lat: 43.1550, lon: 19.1233},

  {id: 'dubrovnik', place: 'Dubrovnik', sub: 'Croatia',                year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'dubrovnik',
   lat: 42.6507, lon: 18.0944},

  {id: 'kotor',     place: 'Kotor',     sub: 'Montenegro',             year: 2026,
   region: 'yugoslavia', dir: 'yugoslavia', group: 'kotor',
   lat: 42.4247, lon: 18.7712},

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

  {id: 'bologna',      place: 'Bologna',       sub: 'Emilia-Romagna', year: 2022,
   region: 'italy', dir: 'italy', group: 'bologna',      lat: 44.4949, lon: 11.3426},

  {id: 'portofino',    place: 'Portofino',     sub: 'Liguria', year: 2019,
   region: 'italy', dir: 'italy', group: 'portofino',    lat: 44.3033, lon:  9.2097},

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

  /* ── southern cone ─────────────────────────────────────────────────────── */
  /* North to south. The sheet spans three countries, so `sub` is the country
     here rather than the state — the same rule as Yugoslavia. Swap in São
     Paulo and Rio Grande do Sul if you would rather it read like Italy.

     Two pairs share a pin: MASP is 3km from the centre of São Paulo and La
     Bombonera 4km from the middle of Buenos Aires, which are 2px and 3px at
     sheet scale. */

  {id: 'saopaulo',    place: 'São Paulo',     sub: 'Brazil',    year: 2026,
   region: 'southerncone', dir: 'southerncone', group: 'saopaulo',
   lat: -23.5505, lon: -46.6333},

  // The Museu de Arte de São Paulo, pinned at Avenida Paulista rather than at
  // the city centre — which is why it stacks rather than standing alone.
  {id: 'masp',        place: 'MASP',          sub: 'Brazil',    year: 2026,
   region: 'southerncone', dir: 'southerncone', group: 'saopaulo',
   lat: -23.5614, lon: -46.6559},

  {id: 'gramado',     place: 'Gramado',       sub: 'Brazil',    year: 2026,
   region: 'southerncone', dir: 'southerncone', group: 'gramado',
   lat: -29.3747, lon: -50.8767},

  {id: 'portoalegre', place: 'Porto Alegre',  sub: 'Brazil',    year: 2026,
   region: 'southerncone', dir: 'southerncone', group: 'portoalegre',
   lat: -30.0346, lon: -51.2177},

  {id: 'buenosaires', place: 'Buenos Aires',  sub: 'Argentina', year: 2026,
   region: 'southerncone', dir: 'southerncone', group: 'buenosaires',
   lat: -34.6037, lon: -58.3816},

  {id: 'labombonera', place: 'La Bombonera',  sub: 'Argentina', year: 2026,
   region: 'southerncone', dir: 'southerncone', group: 'buenosaires',
   lat: -34.6356, lon: -58.3648},

  /* ── british isles ─────────────────────────────────────────────────────── */
  /* Roughly north to south, Ireland after Britain. The sheet spans five
     countries, so `sub` is the country — England, Scotland, Wales, N. Ireland,
     Ireland — on the same rule as Yugoslavia and the Southern Cone.

     Four Sheffield frames share one group and therefore one pin. Bradfield is
     the arguable one: it is a village 13km north-west of the centre, which is
     about 6px at sheet scale, so it could not stand alone without the solver
     shoving it somewhere it does not belong. It is inside the City of
     Sheffield, so grouping it is honest as well as convenient — but give it
     `group: 'bradfield'` if you would rather it were its own place. */

  {id: 'edinburgh',            place: 'Edinburgh',    sub: 'Scotland',    year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'edinburgh',
   lat: 55.9533, lon: -3.1883},

  {id: 'glasgow',              place: 'Glasgow',      sub: 'Scotland',    year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'glasgow',
   lat: 55.8642, lon: -4.2518},

  {id: 'staithes',             place: 'Staithes',     sub: 'England',     year: 2024,
   region: 'britishisles', dir: 'britishisles', group: 'staithes',
   lat: 54.5586, lon: -0.7889},

  {id: 'scarborough',          place: 'Scarborough',  sub: 'England',     year: 2023,
   region: 'britishisles', dir: 'britishisles', group: 'scarborough',
   lat: 54.2830, lon: -0.3993},

  {id: 'knaresborough',        place: 'Knaresborough', sub: 'England',    year: 2024,
   region: 'britishisles', dir: 'britishisles', group: 'knaresborough',
   lat: 54.0083, lon: -1.4670},

  {id: 'york',                 place: 'York',         sub: 'England',     year: 2024,
   region: 'britishisles', dir: 'britishisles', group: 'york',
   lat: 53.9600, lon: -1.0873},

  {id: 'topwithins',           place: 'Top Withens',  sub: 'England',     year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'topwithins',
   lat: 53.8214, lon: -2.0330},

  {id: 'leeds',                place: 'Leeds',        sub: 'England',     year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'leeds',
   lat: 53.8008, lon: -1.5491},

  // The four Sheffield frames. Park Hill first, so it is the card on top.
  {id: 'sheffieldparkhill',    place: 'Sheffield',    sub: 'England',     year: 2024,
   region: 'britishisles', dir: 'britishisles', group: 'sheffield',
   lat: 53.3800, lon: -1.4600},

  {id: 'sheffieldbramalllane', place: 'Bramall Lane', sub: 'England',     year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'sheffield',
   lat: 53.3703, lon: -1.4709},

  {id: 'sheffieldthegrapes',   place: 'The Grapes',   sub: 'England',     year: 2023,
   region: 'britishisles', dir: 'britishisles', group: 'sheffield',
   lat: 53.3805, lon: -1.4720},

  {id: 'sheffieldbradfield',   place: 'Bradfield',    sub: 'England',     year: 2021,
   region: 'britishisles', dir: 'britishisles', group: 'sheffield',
   lat: 53.4200, lon: -1.6100},

  {id: 'ladybower',            place: 'Ladybower',    sub: 'England',     year: 2019,
   region: 'britishisles', dir: 'britishisles', group: 'ladybower',
   lat: 53.3700, lon: -1.7500},

  {id: 'bakewell',             place: 'Bakewell',     sub: 'England',     year: 2023,
   region: 'britishisles', dir: 'britishisles', group: 'bakewell',
   lat: 53.2137, lon: -1.6752},

  {id: 'nottingham',           place: 'Nottingham',   sub: 'England',     year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'nottingham',
   lat: 52.9548, lon: -1.1581},

  {id: 'birmingham',           place: 'Birmingham',   sub: 'England',     year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'birmingham',
   lat: 52.4862, lon: -1.8904},

  {id: 'cardiff',              place: 'Cardiff',      sub: 'Wales',       year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'cardiff',
   lat: 51.4816, lon: -3.1791},

  {id: 'london',               place: 'London',       sub: 'England',     year: 2021,
   region: 'britishisles', dir: 'britishisles', group: 'london',
   lat: 51.5074, lon: -0.1278},

  {id: 'london2',              place: 'Brick Lane',       sub: 'England',     year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'london',
   lat: 51.5074, lon: -0.1278},

  {id: 'belfast',              place: 'Belfast',      sub: 'N. Ireland',  year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'belfast',
   lat: 54.5973, lon: -5.9301},

  {id: 'dublin',               place: 'Dublin',       sub: 'Ireland',     year: 2023,
   region: 'britishisles', dir: 'britishisles', group: 'dublin',
   lat: 53.3498, lon: -6.2603},

  {id: 'cork',                 place: 'Cork',         sub: 'Ireland',     year: 2022,
   region: 'britishisles', dir: 'britishisles', group: 'cork',
   lat: 51.8985, lon: -8.4756},

  /* ── iberia ────────────────────────────────────────────────────────────── */
  /* Spain north to south, then Portugal, on the same pattern as Britain then
     Ireland. The sheet spans two countries, so `sub` is the country. */

  {id: 'sansebastian', place: 'San Sebastián', sub: 'Spain',    year: 2021,
   region: 'iberia', dir: 'iberia', group: 'sansebastian',
   lat: 43.3183, lon: -1.9812},

  {id: 'bilbao',       place: 'Bilbao',        sub: 'Spain',    year: 2021,
   region: 'iberia', dir: 'iberia', group: 'bilbao',
   lat: 43.2630, lon: -2.9350},

  {id: 'madrid',       place: 'Madrid',        sub: 'Spain',    year: 2025,
   region: 'iberia', dir: 'iberia', group: 'madrid',
   lat: 40.4168, lon: -3.7038},

  {id: 'seville',      place: 'Seville',       sub: 'Spain',    year: 2021,
   region: 'iberia', dir: 'iberia', group: 'seville',
   lat: 37.3891, lon: -5.9845},

  {id: 'porto',        place: 'Porto',         sub: 'Portugal', year: 2022,
   region: 'iberia', dir: 'iberia', group: 'porto',
   lat: 41.1579, lon: -8.6291},

  {id: 'lisbon',       place: 'Lisbon',        sub: 'Portugal', year: 2022,
   region: 'iberia', dir: 'iberia', group: 'lisbon',
   lat: 38.7223, lon: -9.1393},

  /* ── united states ─────────────────────────────────────────────────────── */
  /* West to east. One country, so `sub` is the state, on the same rule that
     gives Italy its regions.

     Grouped by city rather than by frame: at the scale of the contiguous
     United States, Hollywood and Venice Beach are three units apart and the
     two NYC landmarks about one, so a pin each would be a pin in the same
     place. Four pins, three of them piles. Years are yours to fill in. */

  {id: 'sanfrancisco1',   place: 'Golden Gate Bridge', sub: 'California', year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'sanfrancisco',
   lat: 37.7749, lon: -122.4194},

  {id: 'sanfrancisco2',   place: 'Lombard Street',    sub: 'California', year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'sanfrancisco',
   lat: 37.7749, lon: -122.4194},

  {id: 'lahollywood',     place: 'Hollywood',        sub: 'California', year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'losangeles',
   lat: 34.0928, lon: -118.3287},

  {id: 'lamulhollanddr',  place: 'Mulholland Drive', sub: 'California', year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'losangeles',
   lat: 34.1341, lon: -118.3897},

  {id: 'lavenicebeach',   place: 'Venice Beach',     sub: 'California', year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'losangeles',
   lat: 33.9850, lon: -118.4695},

  {id: 'lasvegas1',       place: 'The Strip',        sub: 'Nevada',     year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'lasvegas',
   lat: 36.1699, lon: -115.1398},

  {id: 'lasvegas2',       place: 'Casino',           sub: 'Nevada',     year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'lasvegas',
   lat: 36.1699, lon: -115.1398},

  {id: 'nyctopoftherock', place: 'Top of the Rock',  sub: 'New York',   year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'newyork',
   lat: 40.7593, lon: -73.9794},

  {id: 'nyctomsdiner',    place: "Tom's Diner",      sub: 'New York',   year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'newyork',
   lat: 40.8054, lon: -73.9618},

  {id: 'nycsubway',       place: 'The Subway',       sub: 'New York',   year: 2019,
   region: 'usa', dir: 'unitedstates', group: 'newyork',
   lat: 40.7128, lon: -74.0060},

  /* ── greece & turkey ───────────────────────────────────────────────────── */
  /* The only PANELLED sheet: two city maps side by side rather than one
     silhouette, because Athens and Istanbul are 560km apart with nothing
     between them. A photograph is assigned to a panel by its coordinates, so
     these need to fall inside the windows set in regions.mjs — the build
     throws if one does not.

     One kilometre is about eight sheet units here and a card is 150 wide, so
     two places in the same neighbourhood will sit closer together than a
     single card. Locations spread across the city read best. */

  {id: 'athparthenon',        place: 'The Parthenon',        sub: 'Greece', year: 2022,
   region: 'greeceturkey', dir: 'greeceturkey', group: 'parthenon',
   lat: 37.9715, lon: 23.7267},

  {id: 'atharchaeologymuseum', place: 'Archaeological Museum', sub: 'Greece', year: 2022,
   region: 'greeceturkey', dir: 'greeceturkey', group: 'archaeologymuseum',
   lat: 37.9891, lon: 23.7326},

  {id: 'istfatih',            place: 'Fatih',                sub: 'Turkey', year: 2025,
   region: 'greeceturkey', dir: 'greeceturkey', group: 'fatih',
   lat: 41.01455, lon: 28.97689},

  {id: 'istbosphorus',        place: 'The Bosphorus',        sub: 'Turkey', year: 2025,
   region: 'greeceturkey', dir: 'greeceturkey', group: 'bosphorus',
   lat: 41.07480, lon: 29.05595},

];
