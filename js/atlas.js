/* atlas.js — the world map, the region sheets, and the routing between them.
 *
 * Reads three things:
 *   window.ATLAS        world outline and region paths   (build_atlas.mjs)
 *   window.ATLAS_SHEETS region silhouettes, pins, cards  (build_sheets.mjs)
 *   window.PHOTOS       the photographs                  (hand-edited)
 *
 * State lives in location.hash, which is what makes the back button work and
 * makes a region a linkable address. Nothing here loads a page.
 *
 * The SVG in both views is aria-hidden. Everything the world map does is also
 * done by the region index below it, and everything a card does is done by the
 * card's own anchor — so keyboard and screen-reader users lose nothing.
 */
(function () {
  'use strict';

  var A = window.ATLAS;
  if (!A) return;
  var S = window.ATLAS_SHEETS || {sheets: {}, card: {w: 112, h: 142}};
  var PHOTOS = window.PHOTOS || [];

  var map   = document.querySelector('.atlas-map');
  var index = document.querySelector('.region-index');
  var world = document.getElementById('atlas-world');
  var view  = document.getElementById('atlas-region');
  if (!map || !index || !world || !view) return;

  var title = view.querySelector('.region-title');
  var note  = view.querySelector('.region-note');
  var stage = view.querySelector('.region-stage');

  var SVGNS = 'http://www.w3.org/2000/svg';
  function svgEl(name, attrs) {
    var el = document.createElementNS(SVGNS, name);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  // photographs, grouped by region, in file order
  var byRegion = {};
  PHOTOS.forEach(function (p) {
    (byRegion[p.region] = byRegion[p.region] || []).push(p);
  });

  // "Matera, Basilicata (2023)". `sub` is whatever sits one level below the
  // sheet title — the country on a multi-country sheet, the region on a
  // single-country one.
  function caption(p) {
    return p.place + ', ' + p.sub + (p.year ? ' (' + p.year + ')' : '');
  }

  // ── the world ──────────────────────────────────────────────────────────────
  var paths = {}, links = {};

  var svg = svgEl('svg', {
    'class': 'atlas-svg',
    viewBox: '0 0 ' + A.width + ' ' + A.height,
    'aria-hidden': 'true',
    focusable: 'false',
  });
  svg.appendChild(svgEl('path', {'class': 'atlas-land', d: A.land}));
  A.order.forEach(function (key) {
    var p = svgEl('path', {'class': 'atlas-region', d: A.regions[key]});
    p.dataset.region = key;
    if (!(byRegion[key] || []).length) p.classList.add('is-empty');
    paths[key] = p;
    svg.appendChild(p);
  });
  // A wrapper with the map's own aspect ratio. The width rule in the page's
  // CSS derives it from the free height, which is what keeps the whole map on
  // screen without scrolling; the ratio has to reach CSS to do that.
  var worldFrame = document.createElement('div');
  worldFrame.className = 'map-frame';
  worldFrame.style.setProperty('--frame-ar', (A.width / A.height).toFixed(4));
  worldFrame.style.aspectRatio = A.width + ' / ' + A.height;
  worldFrame.appendChild(svg);
  map.appendChild(worldFrame);

  // data-no-smooth-scroll opts these out of the site-wide smooth scrolling in
  // app.js, which would otherwise preventDefault() the click and stop the hash
  // from ever changing.
  A.order.forEach(function (key) {
    var n = (byRegion[key] || []).length;
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.className = 'region-link' + (n ? '' : ' is-empty');
    a.href = '#' + key;
    a.dataset.region = key;
    a.setAttribute('data-no-smooth-scroll', '');
    a.appendChild(document.createTextNode(A.labels[key]));
    if (n) {
      var c = document.createElement('span');
      c.className = 'region-n';
      c.textContent = n;
      a.appendChild(c);
    }
    li.appendChild(a);
    index.appendChild(li);
    links[key] = a;
  });

  function highlight(key, on) {
    if (paths[key]) paths[key].classList.toggle('is-active', on);
    if (links[key]) links[key].classList.toggle('is-active', on);
  }

  A.order.forEach(function (key) {
    [paths[key], links[key]].forEach(function (el) {
      el.addEventListener('mouseenter', function () { highlight(key, true); });
      el.addEventListener('mouseleave', function () { highlight(key, false); });
    });
    links[key].addEventListener('focus', function () { highlight(key, true); });
    links[key].addEventListener('blur',  function () { highlight(key, false); });
    paths[key].addEventListener('click', function () { location.hash = key; });
  });

  // ── a region sheet ─────────────────────────────────────────────────────────
  // One set of anchors, two layouts. On a wide screen .card is positioned
  // absolutely from --x/--y and tilted; below the breakpoint the same anchors
  // become a plain grid, because position: static makes those coordinates
  // inert. So the lightbox album is the region's photographs exactly once, in
  // document order, whichever layout is showing.
  function buildSheet(key, photos) {
    var sheet = S.sheets[key];
    var frag = document.createDocumentFragment();
    var marks = {};        // group key -> the <g> holding its string and pin
    var groupOf = {};      // photo id  -> group key
    var frame = null;

    if (sheet) {
      frame = document.createElement('div');
      frame.className = 'sheet-frame';
      frame.style.setProperty('--frame-ar', (sheet.w / sheet.h).toFixed(4));
      // Card size is decided per region by build_sheets.mjs — twenty-two
      // photographs on Italy need smaller cards than nine on Yugoslavia — so
      // it arrives as data rather than being fixed in the stylesheet.
      frame.style.setProperty('--card-w', sheet.cardW);
      frame.style.aspectRatio = sheet.w + ' / ' + sheet.h;

      var g = svgEl('svg', {
        'class': 'sheet-svg',
        viewBox: '0 0 ' + sheet.w + ' ' + sheet.h,
        'aria-hidden': 'true',
        focusable: 'false',
      });

      // Internal borders are stroked white and clipped to the silhouette.
      // Clipping does two jobs at once: it hides any border belonging to a
      // piece the sheet window cut away, and it stops the stroke spilling its
      // outer half over the coastline into the sea.
      var clipId = 'sheet-clip-' + key;
      var defs = svgEl('defs', {});
      var cp = svgEl('clipPath', {id: clipId});
      cp.appendChild(svgEl('path', {d: sheet.path}));
      defs.appendChild(cp);
      g.appendChild(defs);

      g.appendChild(svgEl('path', {'class': 'sheet-land', d: sheet.path}));
      if (sheet.borders) {
        g.appendChild(svgEl('path', {
          'class': 'sheet-borders', d: sheet.borders,
          'clip-path': 'url(#' + clipId + ')',
        }));
      }

      sheet.groups.forEach(function (grp) {
        grp.ids.forEach(function (id) { groupOf[id] = grp.key; });
        // One <g> per group: the halo, the string, and the pin travel together,
        // so lighting them up is a single class toggle.
        var mark = svgEl('g', {'class': 'sheet-mark'});
        var line = {x1: grp.pin[0], y1: grp.pin[1], x2: grp.card[0], y2: grp.card[1]};
        mark.appendChild(svgEl('line', Object.assign({'class': 'sheet-leader-halo'}, line)));
        mark.appendChild(svgEl('line', Object.assign({'class': 'sheet-leader'}, line)));
        mark.appendChild(svgEl('circle', {
          'class': 'sheet-pin-halo', cx: grp.pin[0], cy: grp.pin[1], r: 8.4}));
        mark.appendChild(svgEl('circle', {
          'class': 'sheet-pin', cx: grp.pin[0], cy: grp.pin[1], r: 4.6}));
        marks[grp.key] = mark;
        g.appendChild(mark);
      });

      frame.appendChild(g);
    }

    var cards = document.createElement('div');
    cards.className = 'cards';

    photos.forEach(function (p) {
      var pos = sheet && sheet.cards[p.id];
      var a = document.createElement('a');
      a.className = 'card';
      a.href = 'images/' + p.dir + '/' + p.id + '_full.jpeg';
      a.setAttribute('data-lightbox', 'region-' + key);
      a.setAttribute('data-title', caption(p));
      if (pos) {
        a.style.setProperty('--x', (pos.x / sheet.w * 100) + '%');
        a.style.setProperty('--y', (pos.y / sheet.h * 100) + '%');
        a.style.setProperty('--rot', pos.rot + 'deg');
        // as a custom property, not z-index directly: an inline z-index would
        // outrank the :hover rule that lifts a card out of its pile
        a.style.setProperty('--z', pos.z);
      }

      var ph = document.createElement('span');
      ph.className = 'card-photo';
      var img = document.createElement('img');
      img.src = 'images/' + p.dir + '/' + p.id + '_thumb.jpeg';
      img.alt = caption(p);
      img.loading = 'lazy';
      ph.appendChild(img);

      var cap = document.createElement('span');
      cap.className = 'card-cap';
      var l1 = document.createElement('b');
      l1.textContent = p.place;
      var l2 = document.createElement('i');
      l2.textContent = p.sub + (p.year ? ' (' + p.year + ')' : '');
      cap.appendChild(l1);
      cap.appendChild(l2);

      a.appendChild(ph);
      a.appendChild(cap);

      // Hovering a photograph flushes its own string and pin white. With a
      // card sitting up to 145 units from its dot, this is what tells you
      // which dot it belongs to.
      var mark = marks[groupOf[p.id]];
      if (mark) {
        var lit = function (on) { mark.classList.toggle('is-lit', on); };
        a.addEventListener('mouseenter', function () { lit(true); });
        a.addEventListener('mouseleave', function () { lit(false); });
        a.addEventListener('focus', function () { lit(true); });
        a.addEventListener('blur', function () { lit(false); });
      }

      cards.appendChild(a);
    });

    if (frame) {
      frame.appendChild(cards);
      frag.appendChild(frame);
    } else {
      frag.appendChild(cards);
    }
    return frag;
  }

  // ── routing ────────────────────────────────────────────────────────────────
  var lastRegion = null;

  function showWorld(focusKey) {
    view.hidden = true;
    world.hidden = false;
    stage.textContent = '';
    if (focusKey && links[focusKey]) links[focusKey].focus();
  }

  function showRegion(key) {
    var photos = byRegion[key] || [];
    world.hidden = true;
    view.hidden = false;
    title.textContent = A.labels[key];
    note.textContent = photos.length
      ? photos.length + (photos.length === 1 ? ' photograph' : ' photographs')
      : 'No photographs on this sheet yet.';
    stage.textContent = '';
    // The sheet is drawn whether or not anything has been shot there. An empty
    // region is a map of somewhere you have not photographed yet, which is a
    // more useful thing to look at than a blank panel.
    stage.appendChild(buildSheet(key, photos));
    title.focus();
  }

  function route() {
    var key = decodeURIComponent(location.hash.replace(/^#/, ''));
    if (Object.prototype.hasOwnProperty.call(A.regions, key)) {
      lastRegion = key;
      showRegion(key);
    } else {
      showWorld(lastRegion);
      lastRegion = null;
    }
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', route);

  // Escape returns to the world — but only when the lightbox is not up, since
  // it wants Escape for itself.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || view.hidden) return;
    var lb = document.getElementById('lightbox');
    if (lb && lb.offsetParent !== null) return;
    location.hash = '';
  });

  route();
})();
