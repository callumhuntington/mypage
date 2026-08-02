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
  var main  = document.querySelector('main');
  var sheetLayout = null;   // set when a sheet with frames is on screen
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
  // ── the hover label ──
  // Built once and moved, rather than created and destroyed on every
  // mouseenter. It sits last in the SVG so it draws over the land, and it is
  // aria-hidden because the region index below the map already carries both
  // the name and the count as text.
  var hover = svgEl('g', {'class': 'atlas-hover', 'aria-hidden': 'true'});
  var hoverLine = svgEl('polyline', {'class': 'atlas-hover-line', points: ''});
  var hoverName = svgEl('text', {'class': 'atlas-hover-name'});
  var hoverCount = svgEl('text', {'class': 'atlas-hover-count'});
  var hoverDot = svgEl('circle', {'class': 'atlas-hover-dot', r: 3.5});
  hover.appendChild(hoverLine);
  hover.appendChild(hoverDot);
  hover.appendChild(hoverName);
  hover.appendChild(hoverCount);
  svg.appendChild(hover);

  function placeLabel(key) {
    var c = A.centroids[key];
    if (!c) return;
    var n = (byRegion[key] || []).length;

    // Lead away from the middle of the map, so the label runs out over open
    // water rather than back across the continents.
    var dir = c[0] > A.width * 0.58 ? -1 : 1;
    var ex = c[0] + dir * 64, ey = c[1] - 42;
    var tx = ex + dir * 46;

    // Keep the whole thing inside the frame. A region near an edge gets a
    // shorter leader rather than a label hanging off the map.
    var margin = 150;
    if (tx < margin) { dir = 1; ex = c[0] + 64; tx = ex + 46; }
    if (tx > A.width - margin) { dir = -1; ex = c[0] - 64; tx = ex - 46; }
    ey = Math.max(34, ey);

    hoverLine.setAttribute('points',
      c[0] + ',' + c[1] + ' ' + ex + ',' + ey + ' ' + tx + ',' + ey);
    hoverDot.setAttribute('cx', c[0]);
    hoverDot.setAttribute('cy', c[1]);

    var anchor = dir > 0 ? 'start' : 'end';
    var lx = tx + dir * 8;
    hoverName.setAttribute('x', lx);
    hoverName.setAttribute('y', ey - 2);
    hoverName.setAttribute('text-anchor', anchor);
    hoverName.textContent = A.labels[key];
    hoverCount.setAttribute('x', lx);
    hoverCount.setAttribute('y', ey + 17);
    hoverCount.setAttribute('text-anchor', anchor);
    hoverCount.textContent = n
      ? n + (n === 1 ? ' photograph' : ' photographs')
      : 'nothing here yet';
  }

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
    if (on) placeLabel(key);
    hover.classList.toggle('is-on', on);
  }

  A.order.forEach(function (key) {
    [paths[key], links[key]].forEach(function (el) {
      el.addEventListener('mouseenter', function () { highlight(key, true); });
      el.addEventListener('mouseleave', function () { highlight(key, false); });
    });
    links[key].addEventListener('focus', function () { highlight(key, true); });
    links[key].addEventListener('blur',  function () { highlight(key, false); });
    paths[key].addEventListener('click', function () { location.hash = key; });

    // A finger cannot hover, so on a phone a country would otherwise go from
    // untouched to opened with nothing in between — no confirmation that the
    // right one was hit, which matters when Slovenia is four pixels wide.
    // touchstart lights it exactly as a cursor would, name label and all, so
    // the press names what it is about to open. Cleared on release and on
    // cancel, the latter being what fires when the tap turns out to be the
    // start of a scroll.
    paths[key].addEventListener('touchstart', function () {
      highlight(key, true);
    }, {passive: true});
    ['touchend', 'touchcancel'].forEach(function (ev) {
      paths[key].addEventListener(ev, function () { highlight(key, false); });
    });
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
    // Everything whose position depends on the frame's proportions, gathered
    // as it is built so relayout is a walk over these rather than a rebuild.
    var movable = {frame: null, svg: null, mapG: null, marks: [], piles: []};

    if (sheet) {
      frame = document.createElement('div');
      frame.className = 'sheet-frame';
      frame.style.setProperty('--frame-ar', (sheet.w / sheet.h).toFixed(4));
      // Card size is decided per region by build_sheets.mjs — twenty-two
      // photographs on Italy need smaller cards than nine on Yugoslavia — so
      // it arrives as data rather than being fixed in the stylesheet.
      frame.style.setProperty('--card-w', sheet.cardW);
      frame.style.aspectRatio = sheet.w + ' / ' + sheet.h;

      movable.frame = frame;
      // A zero-width ruler for --free-h. The height set aside for the sheet is
      // a calc() of dvh and rem that only CSS can resolve; reading the custom
      // property gives back the unevaluated expression. Measuring an element
      // that has been given that height gives back a number.
      if (sheet.frames) frag.appendChild(document.createElement('div'))
        .className = 'fit-probe';
      var g = svgEl('svg', {
        'class': 'sheet-svg',
        viewBox: '0 0 ' + sheet.w + ' ' + sheet.h,
        'aria-hidden': 'true',
        focusable: 'false',
      });

      // Everything the projection drew goes in one group. A taller frame is the
      // same silhouette under a similarity transform, so the whole map moves by
      // setting one attribute here — and the clip path, being inside the group,
      // is read in the group's own coordinates and needs no transform of its
      // own.
      var mapG = svgEl('g', {'class': 'sheet-map'});
      g.appendChild(mapG);
      movable.svg = g;
      movable.mapG = mapG;

      // Internal borders are stroked white and clipped to the silhouette.
      // Clipping does two jobs at once: it hides any border belonging to a
      // piece the sheet window cut away, and it stops the stroke spilling its
      // outer half over the coastline into the sea.
      var clipId = 'sheet-clip-' + key;
      var defs = svgEl('defs', {});
      var cp = svgEl('clipPath', {id: clipId});
      cp.appendChild(svgEl('path', {d: sheet.path}));
      defs.appendChild(cp);
      mapG.appendChild(defs);

      mapG.appendChild(svgEl('path', {'class': 'sheet-land', d: sheet.path}));

      // A panelled sheet is several city maps side by side. Each gets its name
      // underneath, and a hairline divides them — without it two maps at two
      // different scales read as one continuous piece of coast.
      if (sheet.panels) {
        sheet.panels.forEach(function (pan, i) {
          var r = pan.rect;   // x0, y0, x1, y1
          if (i) {
            // The rule runs past the maps at both ends. Stopping flush with
            // them read as a seam between two halves of one drawing; overrunning
            // it reads as a divider between two separate ones.
            var x = (r[0] + sheet.panels[i - 1].rect[2]) / 2;
            var over = 54;
            mapG.appendChild(svgEl('line', {
              'class': 'panel-rule',
              x1: x, y1: r[1] - over, x2: x, y2: r[3] + 30 + over,
            }));
          }
          var t = svgEl('text', {
            'class': 'panel-label',
            x: (r[0] + r[2]) / 2, y: r[3] + 30, 'text-anchor': 'middle',
          });
          t.textContent = pan.label;
          mapG.appendChild(t);
        });
      }

      if (sheet.borders) {
        mapG.appendChild(svgEl('path', {
          'class': 'sheet-borders', d: sheet.borders,
          'clip-path': 'url(#' + clipId + ')',
        }));
      }

      // Every disc goes in one layer drawn after all the strings, so that a
      // leader crossing the sheet passes behind the numbers rather than
      // through them. Inside a mark they would be painted in group order and
      // a later string would cut across an earlier disc.
      var badges = svgEl('g', {'class': 'sheet-badges'});

      sheet.groups.forEach(function (grp, gi) {
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

        // Below the breakpoint the photograph leaves the map for the grid, and
        // this takes its place at the end of the string. Everything else about
        // the sheet is unchanged — same pin, same leader, same geometry — so
        // the phone reads as the wide version with each polaroid swapped for
        // its number.
        //
        // At the CARD position, not the pin: build_sheets.mjs already spaced
        // those a card apart from one another, whereas the pins are as close
        // together as the places themselves. That spacing is the whole reason
        // this works — the closest two card centres on any sheet are Milan and
        // Como at 127 units, about 28px at phone width, so a 20px disc clears
        // its neighbour where eighteen discs on the silhouette did not.
        //
        // A real <a>, so a tap routes through the hash exactly as a click on a
        // polaroid does: '#britishisles/edinburgh' is already understood, and
        // opening, paging and closing the lightbox all behave identically. A
        // stack of two shares one number and opens on the first of them; the
        // lightbox's own arrows reach the rest.
        var badge = svgEl('a', {
          'class': 'sheet-badge',
          href: '#' + key + '/' + grp.ids[0],
          // The grid below holds these same links with their captions attached.
          // Meeting every photograph twice, the second time as a bare numeral,
          // is worse than not meeting the map at all — and tabindex -1 keeps a
          // focusable element from sitting inside an aria-hidden subtree.
          'aria-hidden': 'true',
          tabindex: '-1',
          // app.js reads href^='#' as a scroll target; here it is routing.
          'data-no-smooth-scroll': '',
        });
        badge.appendChild(svgEl('circle', {cx: grp.card[0], cy: grp.card[1], r: 46}));
        var num = svgEl('text', {
          x: grp.card[0], y: grp.card[1],
          dy: '0.36em',            /* centres the digits on the disc. Reliable
                                      everywhere, unlike dominant-baseline. */
          'text-anchor': 'middle',
        });
        num.textContent = gi + 1;
        badge.appendChild(num);
        badges.appendChild(badge);

        marks[grp.key] = mark;
        // Kept so the frame can be re-laid-out without rebuilding the sheet.
        movable.marks.push({
          grp: grp,
          leaders: [mark.childNodes[0], mark.childNodes[1]],
          pins: [mark.childNodes[2], mark.childNodes[3]],
          disc: badge.childNodes[0],
          num: badge.childNodes[1],
        });
        g.appendChild(mark);
      });

      g.appendChild(badges);
      frame.appendChild(g);
    }

    var cards = document.createElement('div');
    cards.className = 'cards';

    // Photographs are laid out pile by pile rather than one flat list, so that
    // hovering anywhere in a pile can fan it open in CSS alone. A pile of one
    // is still a pile — same structure everywhere, no special case.
    //
    // One consequence: photographs sharing a group become adjacent in the
    // lightbox album even if they are apart in photos.js. That seems right —
    // two frames of the same place should sit together in the sequence.
    var order = [];
    if (sheet) {
      var placed = {};
      sheet.groups.forEach(function (grp) {
        order.push(grp.ids.map(function (id) {
          placed[id] = true;
          return photos.filter(function (p) { return p.id === id; })[0];
        }).filter(Boolean));
      });
      // The sheet is pre-built geometry; photos.js is read at runtime. Add a
      // record and forget to re-run build_sheets.mjs and the photograph has no
      // pin, so it is simply not drawn — on the map OR in the phone grid, and
      // with no sign that anything is missing. Say so in the console.
      var loose = photos.filter(function (p) { return !placed[p.id]; });
      if (loose.length && window.console) {
        console.warn('atlas: ' + loose.length + ' photograph(s) in ' + key +
          ' are not on the built sheet — re-run build_sheets.mjs: ' +
          loose.map(function (p) { return p.id; }).join(', '));
      }
    } else {
      order = photos.map(function (p) { return [p]; });
    }

    var u2c = sheet ? 100 / sheet.w : 0;   // sheet units -> % of frame width
    var SPREAD = 0.62;   // of a card's width, per step out from the middle
    var ARC = 0.12;      // how much the outer cards ride up
    var TILT = 7;        // extra degrees per step, so it reads as a hand

    order.forEach(function (pile, pi) {
      var grp = sheet && sheet.groups[pi];
      var box = document.createElement('div');
      box.className = 'pile';
      if (grp) {
        box.style.setProperty('--x', (grp.card[0] / sheet.w * 100) + '%');
        box.style.setProperty('--y', (grp.card[1] / sheet.h * 100) + '%');
        movable.piles.push({el: box, grp: grp, cards: []});
      }

      var n = pile.length;
      pile.forEach(function (p, i) {
        var pos = sheet && sheet.cards[p.id];
        var a = document.createElement('a');
        a.className = 'card';
      a.href = 'images/' + p.dir + '/' + p.id + '_full.jpeg';
      a.setAttribute('data-lightbox', 'region-' + key);
      a.setAttribute('data-title', caption(p));
      a.dataset.id = p.id;   // what '#italy/matera' looks for
        if (pos && grp) {
          // Resting offset from the middle of the pile: the small hand-placed
          // stagger the build gives each card in a stack.
          a.style.setProperty('--dx', (pos.x - grp.card[0]) * u2c);
          a.style.setProperty('--dy', (pos.y - grp.card[1]) * u2c);
          a.style.setProperty('--rot', pos.rot + 'deg');
          // as a custom property, not z-index directly: an inline z-index would
          // outrank the :hover rule that lifts a card out of its pile
          a.style.setProperty('--z', pos.z);

          // Fanned offset. Cards spread symmetrically about the pile's centre
          // rather than all one way, so an opened pile stays roughly where it
          // was and is less likely to swing off the edge of the sheet.
          var step = i - (n - 1) / 2;
          a.style.setProperty('--fx', step * sheet.cardW * SPREAD);
          a.style.setProperty('--fy', -Math.abs(step) * sheet.cardW * SPREAD * ARC);
          a.style.setProperty('--frot', (step * TILT) + 'deg');
          movable.piles[movable.piles.length - 1].cards.push({el: a, id: p.id, step: step});
        }

        var ph = document.createElement('span');
        ph.className = 'card-photo';
        var img = document.createElement('img');
        img.src = 'images/' + p.dir + '/' + p.id + '_thumb.jpeg';
        // Empty on purpose. The caption below is inside the same anchor, so it
        // already names the link; an alt repeating it would have a screen
        // reader announce "Matera, Basilicata (2023)" twice per card.
        img.alt = '';
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

        // Matches the badge on the pin. Only meaningful when there is a map to
        // match it to, and only shown below the breakpoint.
        if (sheet) {
          var tag = document.createElement('span');
          tag.className = 'card-n';
          tag.setAttribute('aria-hidden', 'true');
          tag.textContent = pi + 1;
          ph.appendChild(tag);
        }

        a.appendChild(ph);
        a.appendChild(cap);

        // Hovering a photograph flushes its own string and pin white. With a
        // card sitting up to 270 units from its dot, this is what tells you
        // which dot it belongs to.
        var mark = marks[groupOf[p.id]];
        if (mark) {
          var lit = function (on) { mark.classList.toggle('is-lit', on); };
          a.addEventListener('mouseenter', function () { lit(true); });
          a.addEventListener('mouseleave', function () { lit(false); });
          a.addEventListener('focus', function () { lit(true); });
          a.addEventListener('blur', function () { lit(false); });
        }

        box.appendChild(a);
      });

      cards.appendChild(box);
    });

    if (frame) {
      frame.appendChild(cards);
      frag.appendChild(frame);
    } else {
      frag.appendChild(cards);
    }

    // A sheet with frames can be re-proportioned; one without is finished.
    sheetLayout = (sheet && sheet.frames) ? makeLayout(sheet, movable) : null;
    return frag;
  }

  /* ── re-proportioning a sheet ───────────────────────────────────────────────
   *
   * build_sheets.mjs solves each region at several frame heights. Between them
   * the browser interpolates, so the layout follows the window continuously
   * rather than snapping between fixed shapes.
   *
   * Interpolating rather than solving is not a shortcut taken for tidiness.
   * Italy's solve is 3.8 seconds — a greedy sweep, 900 relaxation passes over
   * every pair of cards, ten rounds of untangling. A resize has 16ms.
   *
   * The MAP is not interpolated. Its transform is the same arithmetic that
   * d3's fitExtent does, evaluated at the exact height in use, so the
   * silhouette is precisely where it would be had the sheet been built at that
   * height. Only the cards are approximated — and they are interpolated in the
   * map's coordinates, not the sheet's, so a photograph stays put relative to
   * the country it belongs to while the country grows underneath it. */
  function makeLayout(sheet, mv) {
    var fit = sheet.fit;                     // base bounds of the silhouette
    var cx = (fit[0] + fit[2]) / 2, cy = (fit[1] + fit[3]) / 2;
    var frames = sheet.frames;
    var W = sheet.w;
    var maxAR = W / frames[0].h;             // widest: the layout as built
    var minAR = W / frames[frames.length - 1].h;
    var applied = -1;

    // The map is scaled about the middle of the sheet. Its size is a policy in
    // build_sheets.mjs, not a fit — it shrinks a little as the sheet grows
    // taller, so that the room a narrow window opens up goes to the
    // photographs rather than to an ever larger country. That policy is linear
    // in the frame height, which is why interpolating k reproduces it exactly
    // rather than approximately.
    function xform(H, k) {
      return {k: k, tx: W / 2 - k * cx, ty: H / 2 - k * cy};
    }

    // A frame's coordinates, expressed relative to its own map.
    function unmap(p, t) { return [(p[0] - t.tx) / t.k, (p[1] - t.ty) / t.k]; }

    return function layout() {
      var stage = mv.frame.parentNode;
      if (!stage) return;
      var probe = stage.querySelector('.fit-probe');
      var pad = parseFloat(getComputedStyle(stage).paddingLeft) || 0;
      var availW = stage.clientWidth - 2 * pad;
      var availH = probe ? probe.getBoundingClientRect().height : availW / maxAR;
      if (availW <= 0 || availH <= 0) return;

      // Below the breakpoint the sheet is a map with a grid of cards beneath
      // it, and the height on offer belongs to the page rather than to the
      // drawing. Taking it would stretch the silhouette down a scrolling page.
      // Must stay in step with the media query in gallery.html.
      var narrow = window.matchMedia &&
                   window.matchMedia('(max-width: 800px)').matches;
      var ar = narrow ? maxAR
                      : Math.max(minAR, Math.min(maxAR, availW / availH));
      var H = W / ar;
      if (Math.abs(H - applied) < 0.5) return;   // nothing worth redrawing
      applied = H;

      // bracketing frames, and where between them this height falls
      var i = 0;
      while (i < frames.length - 2 && frames[i + 1].h < H) i++;
      var A = frames[i], B = frames[i + 1];
      var u = (H - A.h) / (B.h - A.h);
      u = Math.max(0, Math.min(1, u));

      var k = A.k + (B.k - A.k) * u;
      var t = xform(H, k), ta = xform(A.h, A.k), tb = xform(B.h, B.k);
      var mix = function (pa, pb) {
        var a = unmap(pa, ta), b = unmap(pb, tb);
        return [(a[0] + (b[0] - a[0]) * u) * t.k + t.tx,
                (a[1] + (b[1] - a[1]) * u) * t.k + t.ty];
      };
      var cardW = A.cw + (B.cw - A.cw) * u;
      var u2c = 100 / W;

      mv.frame.style.setProperty('--frame-ar', ar.toFixed(4));
      mv.frame.style.setProperty('--card-w', cardW);
      mv.frame.style.aspectRatio = W + ' / ' + H;
      mv.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      mv.mapG.setAttribute('transform',
        'translate(' + t.tx.toFixed(2) + ',' + t.ty.toFixed(2) + ') ' +
        'scale(' + t.k.toFixed(5) + ')');

      mv.marks.forEach(function (m) {
        var key = m.grp.key;
        var pin = [m.grp.pin[0] * t.k + t.tx, m.grp.pin[1] * t.k + t.ty];
        var c = mix(A.g[key], B.g[key]);
        m.leaders.forEach(function (l) {
          l.setAttribute('x1', pin[0]); l.setAttribute('y1', pin[1]);
          l.setAttribute('x2', c[0]);   l.setAttribute('y2', c[1]);
        });
        m.pins.forEach(function (p) {
          p.setAttribute('cx', pin[0]); p.setAttribute('cy', pin[1]);
        });
        m.disc.setAttribute('cx', c[0]); m.disc.setAttribute('cy', c[1]);
        m.num.setAttribute('x', c[0]);   m.num.setAttribute('y', c[1]);
      });

      mv.piles.forEach(function (pile) {
        var c = mix(A.g[pile.grp.key], B.g[pile.grp.key]);
        pile.el.style.setProperty('--x', (c[0] / W * 100) + '%');
        pile.el.style.setProperty('--y', (c[1] / H * 100) + '%');
        pile.cards.forEach(function (card) {
          var p = mix(A.c[card.id], B.c[card.id]);
          card.el.style.setProperty('--dx', (p[0] - c[0]) * u2c);
          card.el.style.setProperty('--dy', (p[1] - c[1]) * u2c);
          card.el.style.setProperty('--fx', card.step * cardW * 0.62);
          card.el.style.setProperty('--fy',
            -Math.abs(card.step) * cardW * 0.62 * 0.12);
        });
      });
    };
  }

  // ── the lightbox ───────────────────────────────────────────────────────────
  // The hash names what is on screen: '#italy' is the sheet, '#italy/matera'
  // is that photograph open. Paging through the lightbox rewrites the hash, so
  // the back button steps back through the photographs and any single frame
  // can be linked to directly.
  var lb = window.lightbox;

  function lbOpen() {
    var el = document.getElementById('lightbox');
    return !!el && el.offsetParent !== null;
  }

  function lbCurrentId() {
    if (!lb || !lb.album || lb.currentImageIndex == null) return null;
    var entry = lb.album[lb.currentImageIndex];
    if (!entry) return null;
    var a = stage.querySelector('.card[href="' + entry.link + '"]');
    return a ? a.dataset.id : null;
  }

  // Lightbox2 has no events, so its two state changes are wrapped. Writing the
  // hash from here is safe because route() rebuilds the sheet only when the
  // REGION changes — a photograph moving within the same region is a no-op as
  // far as the DOM is concerned, so the lightbox is never pulled out from
  // under itself.
  if (lb) {
    var origChange = lb.changeImage;
    lb.changeImage = function (n) {
      origChange.call(this, n);
      var id = lbCurrentId();
      if (id && current) location.hash = current + '/' + id;
    };
    var origEnd = lb.end;
    lb.end = function () {
      origEnd.call(this);
      if (current && location.hash.indexOf('/') !== -1) location.hash = current;
    };
  }

  function syncLightbox(photoId) {
    if (!lb) return;
    // Not built yet — see the DOMContentLoaded note at the foot of this file.
    // Calling start() here would reach for this.$overlay and throw.
    if (!lb.$lightbox) return;
    if (!photoId) {
      if (lbOpen()) lb.end();
      return;
    }
    if (lbCurrentId() === photoId) return;   // already showing it
    var a = stage.querySelector('.card[data-id="' + photoId + '"]');
    if (!a) return;
    if (lbOpen()) {
      for (var i = 0; i < lb.album.length; i++)
        if (lb.album[i].link === a.getAttribute('href')) { lb.changeImage(i); return; }
    }
    lb.start(window.jQuery(a));
  }

  // ── routing ────────────────────────────────────────────────────────────────
  var current = null;    // the region on screen, or null for the world

  function showWorld(focusKey) {
    if (lbOpen() && lb) lb.end();
    view.hidden = true;
    world.hidden = false;
    stage.textContent = '';
    sheetLayout = null;
    if (focusKey && links[focusKey]) links[focusKey].focus();
    fitIndex();
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
    if (sheetLayout) sheetLayout();
    title.focus();
  }

  // ── fitting the index to whatever height is left ─────────────────────────
  //
  // The map is sized from --chrome-world, a fixed estimate of everything that
  // is not the map. On a wide window the height runs out first and map and
  // index together fill the screen exactly. Narrow it and the map becomes
  // width-limited instead — shorter than the height set aside for it — and
  // the index is left sitting above a widening band of empty ground.
  //
  // CSS cannot see that, because the space left over depends on how tall the
  // map ended up, which depends on its width. So measure it. The index is the
  // last thing on the page, so the room available is everything between its
  // top and the bottom of the window.
  //
  // Height grows monotonically with type size — bigger words make taller rows
  // and, past each threshold, more of them — so a binary search converges on
  // the largest size that still fits. Twelve halvings of a 44px range lands
  // inside a hundredth of a pixel.
  //
  // Never smaller than the size the stylesheet asked for. On a wide window
  // there is nothing spare, and shrinking the type to "fill" a page that is
  // already full would be backwards.
  function fitIndex() {
    if (world.hidden || !index.children.length) return;

    index.style.fontSize = '';
    var base = parseFloat(getComputedStyle(index).fontSize);
    if (!base) return;

    // Measured at the base size, but it does not move with it: the index sits
    // under the map, and the map's height does not depend on the index.
    var pad = parseFloat(getComputedStyle(main).paddingBottom) || 0;
    var room = document.documentElement.clientHeight
             - index.getBoundingClientRect().top - pad;

    var lo = base, hi = 44, best = base, mid;
    for (var i = 0; i < 12; i++) {
      mid = (lo + hi) / 2;
      index.style.fontSize = mid + 'px';
      if (index.getBoundingClientRect().height <= room) { best = mid; lo = mid; }
      else { hi = mid; }
    }
    index.style.fontSize = best.toFixed(2) + 'px';
  }

  // Coalesced: a drag across the screen fires scores of resize events, and
  // each fit is a dozen forced reflows.
  var pending = 0;
  function fitSoon() {
    if (pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      fitIndex();
      if (sheetLayout) sheetLayout();
    });
  }
  window.addEventListener('resize', fitSoon);

  // The first measurement happens in whatever font the browser had to hand.
  // DM Sans arriving afterwards changes every width on the row.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitIndex);

  function route() {
    // A stray '%' in the hash — from a mangled paste, or a link a chat client
    // has half-escaped — makes decodeURIComponent throw a URIError, which
    // would take the whole handler down and leave the page stuck on whatever
    // was last drawn. Falling back to the raw text lands on the world map.
    var hash = location.hash.replace(/^#/, ''), raw;
    try { raw = decodeURIComponent(hash); } catch (e) { raw = hash; }
    var slash = raw.indexOf('/');
    var key = slash === -1 ? raw : raw.slice(0, slash);
    var photo = slash === -1 ? '' : raw.slice(slash + 1);

    if (!Object.prototype.hasOwnProperty.call(A.regions, key)) {
      showWorld(current);
      current = null;
      window.scrollTo(0, 0);
      return;
    }

    // Only rebuild when the region actually changes. Paging the lightbox
    // rewrites the hash on every frame; rebuilding here would tear down the
    // very anchors the lightbox is reading its album from.
    if (key !== current) {
      current = key;
      showRegion(key);
      window.scrollTo(0, 0);
    }
    syncLightbox(photo);
  }

  window.addEventListener('hashchange', route);

  // Escape returns to the world — but only when the lightbox is not up, since
  // it wants Escape for itself.
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || view.hidden) return;
    if (lbOpen()) return;
    location.hash = '';
  });

  route();

  // Lightbox2 builds its DOM on $(document).ready, so at the moment this file
  // is parsed lb.$lightbox does not exist yet and lb.start() cannot run —
  // which meant a link straight to a photograph, '#italy/matera', drew the
  // sheet and then quietly did nothing.
  //
  // Routing once more on DOMContentLoaded fixes it. Native rather than jQuery
  // on purpose: jQuery registered its listener when it loaded, before this
  // file, so every ready callback — the lightbox's own build, and the
  // lightbox.option() call at the foot of gallery.html — has already run by
  // the time this fires. The second pass is free when there is no photograph
  // in the hash, and does not rebuild the sheet when there is: route() only
  // redraws when the REGION changes.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', route, {once: true});
  }
})();
