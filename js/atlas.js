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
            g.appendChild(svgEl('line', {
              'class': 'panel-rule',
              x1: x, y1: r[1] - over, x2: x, y2: r[3] + 30 + over,
            }));
          }
          var t = svgEl('text', {
            'class': 'panel-label',
            x: (r[0] + r[2]) / 2, y: r[3] + 30, 'text-anchor': 'middle',
          });
          t.textContent = pan.label;
          g.appendChild(t);
        });
      }

      if (sheet.borders) {
        g.appendChild(svgEl('path', {
          'class': 'sheet-borders', d: sheet.borders,
          'clip-path': 'url(#' + clipId + ')',
        }));
      }

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

        // The phone's replacement for the string. Off screen above the
        // breakpoint, where the leader already says which card belongs to
        // which pin; below it the cards are a grid underneath the map and the
        // number is the only thing joining the two. Same number on the pin and
        // on the thumbnail, so a stack of two shares one — which is honest,
        // they were taken in the same place.
        //
        // Drawn as its own circle rather than by growing .sheet-pin, because
        // the radius would then have to change with the viewport, and `r` as a
        // CSS property is newer than the rest of what this page relies on.
        var badge = svgEl('g', {'class': 'sheet-badge'});
        badge.appendChild(svgEl('circle', {cx: grp.pin[0], cy: grp.pin[1], r: 34}));
        var num = svgEl('text', {
          x: grp.pin[0], y: grp.pin[1],
          dy: '0.36em',            /* centres the digits on the dot. Reliable
                                      everywhere, unlike dominant-baseline. */
          'text-anchor': 'middle',
        });
        num.textContent = gi + 1;
        badge.appendChild(num);
        mark.appendChild(badge);

        marks[grp.key] = mark;
        g.appendChild(mark);
      });

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
    return frag;
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
