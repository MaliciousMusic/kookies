/* ==========================================================================
   Kookies — cookies procéduraux
   Un cookie = une graine. Même graine → même cookie, partout.
   Le modèle (contour, pépites, plan de morsures) est calculé ici ; la surface
   réaliste est cuite par kk-bake.js ; le SVG assemble le tout : ombre douce,
   image cuite, morsures déchiquetées avec la mie visible, miettes physiques.
   ========================================================================== */
(function () {
  'use strict';

  const KK = window.KK;
  const { svg, rng, closedPath, shade, clamp, TAU, f } = KK;

  const R = 100; // rayon de référence (unités SVG)
  const STICK = { L: 105, h: 40 };

  /* Pâtes : couleurs de repli (avant la cuisson réaliste) et de la mie */
  const DOUGH = {
    golden: { base: '#DB9A40', light: '#EDBB5F', dark: '#A86F17', rim: '#F0CF94', crust: '#7A4A14' },
    cocoa: { base: '#6E4630', light: '#8A5A40', dark: '#4A2A1A', rim: '#9A6A50', crust: '#2E170D' },
    pale: { base: '#D3AE6C', light: '#E6CC98', dark: '#A88040', rim: '#F2DDB0', crust: '#7E5A26' },
  };

  /* Garnitures : tailles relatives + libellés (le rendu est dans kk-bake.js) */
  const CHUNKS = {
    dark: { size: [0.085, 0.13], label: 'pépite noir 70 %' },
    milk: { size: [0.08, 0.12], label: 'pépite lait' },
    white: { size: [0.08, 0.12], label: 'chocolat blanc' },
    caramel: { size: [0.1, 0.15], label: 'caramel beurre salé' },
    pecan: { size: [0.12, 0.16], label: 'noix de pécan' },
    pistachio: { size: [0.04, 0.065], label: 'éclat de pistache' },
    raspberry: { size: [0.06, 0.09], label: 'framboise' },
  };
  KK.CHUNKS = CHUNKS;

  /* Recettes visuelles (l'aspect, pas la vraie recette !) — cookies épais, façon boutique */
  KK.LOOKS = {
    marbre: { dough: 'golden', chunky: true, marble: true, chunks: [['white', 6], ['dark', 5]], salt: 10, vanilla: true },
    classique: { dough: 'golden', chunky: true, chunks: [['dark', 9], ['milk', 4]] },
    country: { dough: 'golden', chunky: true, chunks: [['milk', 5], ['white', 2]], tops: ['kcountry'] },
    pistache: { dough: 'pale', chunky: true, chunks: [['white', 4]], tops: ['paste'], bits: 11, sugar: true },
    bueno: { dough: 'cocoa', chunky: true, chunks: [['white', 5], ['dark', 3]], tops: ['cream', 'bar'] },
    triple: { dough: 'cocoa', chunky: true, chunks: [['dark', 4], ['milk', 4], ['white', 6]] },
    caramel: { dough: 'golden', chunky: true, chunks: [['caramel', 5], ['milk', 5]], salt: 16 },
    pecan: { dough: 'golden', chunky: true, chunks: [['pecan', 5], ['dark', 5]] },
    xxl: { dough: 'golden', chunky: true, chunks: [['dark', 13], ['milk', 6], ['white', 5]], salt: 8, sizeK: 0.74, smallBites: true },
    stick: { dough: 'golden', shape: 'stick', chunks: [['dark', 6], ['milk', 3]] },
    mini: { pile: true },
  };

  /* ---------- Géométrie ---------- */
  function outlineBase(shape, N) {
    const pts = [];
    if (shape === 'stick') {
      const { L, h } = STICK, P = 4 * L + TAU * h;
      for (let i = 0; i < N; i++) {
        let s = (i / N) * P;
        if (s < 2 * L) { pts.push({ x: -L + s, y: -h, nx: 0, ny: -1 }); continue; }
        s -= 2 * L;
        if (s < Math.PI * h) {
          const a = -Math.PI / 2 + s / h;
          pts.push({ x: L + Math.cos(a) * h, y: Math.sin(a) * h, nx: Math.cos(a), ny: Math.sin(a) });
          continue;
        }
        s -= Math.PI * h;
        if (s < 2 * L) { pts.push({ x: L - s, y: h, nx: 0, ny: 1 }); continue; }
        s -= 2 * L;
        const a = Math.PI / 2 + s / h;
        pts.push({ x: -L + Math.cos(a) * h, y: Math.sin(a) * h, nx: Math.cos(a), ny: Math.sin(a) });
      }
    } else {
      for (let i = 0; i < N; i++) {
        const a = (i / N) * TAU;
        pts.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, nx: Math.cos(a), ny: Math.sin(a) });
      }
    }
    return pts;
  }

  function makeInside(shape) {
    if (shape === 'stick') return (x, y, m) => Math.hypot(x - clamp(x, -STICK.L, STICK.L), y) <= STICK.h - m;
    return (x, y, m) => Math.hypot(x, y) <= R - m;
  }

  function randomPoint(r, shape, inside, frac, margin = 0) {
    for (let i = 0; i < 40; i++) {
      let x, y;
      if (shape === 'stick') {
        x = r.range(-(STICK.L + STICK.h), STICK.L + STICK.h) * frac;
        y = r.range(-STICK.h, STICK.h) * frac;
      } else {
        const a = r.range(0, TAU), rr = Math.sqrt(r()) * R * frac;
        x = Math.cos(a) * rr;
        y = Math.sin(a) * rr;
      }
      if (inside(x, y, margin)) return [x, y];
    }
    return [0, 0];
  }

  /* Morsure : cercle + marques de dents + bord qui s'effrite */
  function makeBite(r, cx, cy, br, facing) {
    const teeth = r.int(6, 8), span = r.range(2.2, 2.7), toothH = br * r.range(0.13, 0.17);
    const pts = [], n = 84;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const da = KK.angDiff(a, facing);
      let rad = br;
      const half = span / 2;
      if (Math.abs(da) < half + 0.15) {
        const k = ((da + half) / span) * teeth;
        const fr = k - Math.floor(k) - 0.5;
        const fade = clamp((half + 0.15 - Math.abs(da)) / 0.3);
        rad += toothH * (1 - 4 * fr * fr) * fade;
        rad += r.range(-1.1, 1.1) * fade;
      }
      pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
    }
    // pts : le contour brut (angles réguliers autour du centre), repris par la vitrine 3D
    return { cx, cy, r: br, facing, span, path: closedPath(pts, 0.55), dir: Math.atan2(-Math.sin(facing), -Math.cos(facing)), pts };
  }

  function bitePlan(r, shape, look = {}) {
    const plan = [];
    if (look.smallBites) {
      // cookie géant : de petites bouchées tout autour, puis vers le cœur. On voit à quel
      // point il est grand… et il en faut beaucoup pour en venir à bout.
      const rings = [{ n: 9, depth: 17 }, { n: 7, depth: 42 }, { n: 5, depth: 67 }, { n: 3, depth: 93 }, { n: 1, depth: 122 }];
      let a0 = r.range(-2.2, -0.9);
      rings.forEach((ring) => {
        for (let i = 0; i < ring.n; i++) {
          const br = R * r.range(0.19, 0.23);
          const a = a0 + (i / ring.n) * TAU + r.range(-0.1, 0.1), dist = R + br - ring.depth;
          plan.push(makeBite(r, Math.cos(a) * dist, Math.sin(a) * dist, br, a + Math.PI));
        }
        a0 += 0.33;
      });
      return plan;
    }
    if (shape === 'stick') {
      const ext = STICK.L + STICK.h, br = STICK.h * 1.4;
      [26, 62, 98, 134, 170, 208, 246].forEach((depth) => {
        plan.push(makeBite(r, ext + br - depth, r.range(-9, 9), br * r.range(0.94, 1.05), Math.PI + r.range(-0.12, 0.12)));
      });
    } else {
      const dir = r.range(-2.4, -0.7);
      const depths = [30, 62, 96, 132, 172], jit = [0, 0.42, -0.4, 0.22, 0];
      depths.forEach((depth, i) => {
        const br = R * r.range(0.5, 0.58), a = dir + jit[i] * r.range(0.7, 1.1), dist = R + br - depth;
        plan.push(makeBite(r, Math.cos(a) * dist, Math.sin(a) * dist, br, a + Math.PI));
      });
    }
    return plan;
  }

  /* ---------- Modèle complet ---------- */
  function buildModel(key, seed, opts = {}) {
    const look = KK.LOOKS[key] || KK.LOOKS.classique;
    if (look.pile) return buildPile(key, seed);
    const r = rng(seed);
    const shape = look.shape || 'round';
    const N = shape === 'stick' ? 96 : 72;
    const inside = makeInside(shape);

    // Contour analytique : le SVG et la texture cuite tombent pile ensemble
    // les cookies épais ont une silhouette bosselée : plus de bosses, plus marquées
    const chunky = !!look.chunky;
    const harm = [];
    for (let k = 2; k <= 7; k++) harm.push([k, r.range(0.006, chunky ? 0.026 : 0.022) * (2.6 / k), r.range(0, TAU)]);
    const lumps = [];
    for (let i = 0, n = chunky ? 12 : 6; i < n; i++) lumps.push([r(), r.range(0.018, chunky ? 0.045 : 0.06), chunky ? r.range(-0.03, 0.05) : r.range(-0.028, 0.034)]);
    const rhoAt = (th) => {
      const u = (((th / TAU) % 1) + 1) % 1;
      let m = 1;
      for (const [k, amp, ph] of harm) m += amp * Math.sin(k * th + ph);
      for (const [p, w, h] of lumps) {
        let d = Math.abs(u - p);
        d = Math.min(d, 1 - d);
        m += h * Math.exp(-(d * d) / (2 * w * w));
      }
      return m;
    };
    const base = outlineBase(shape, N);
    let disp;
    const stickAmp = 0.035;
    if (shape === 'stick') {
      const nA = KK.noise2(seed ^ 0x9e3779b9);
      disp = base.map((b) => stickAmp * nA((b.x / R) * 2.2 + 40, (b.y / R) * 2.2) * R);
    } else {
      disp = base.map((b, i) => (rhoAt((i / N) * TAU) - 1) * R);
    }

    // Garnitures : échantillonnage « disque de Poisson » maison
    const list = [];
    const mul = opts.chunkMul || 1, sizeK = look.sizeK || 1;
    for (const [kind, count] of look.chunks) {
      const K = CHUNKS[kind];
      for (let i = 0, n = Math.max(1, Math.round(count * mul)); i < n; i++) list.push({ kind, size: r.range(K.size[0], K.size[1]) * R * sizeK });
    }
    list.sort((a, b) => b.size - a.size);
    const chunks = [];
    for (const c of list) {
      for (let tries = 0; tries < 60; tries++) {
        const [x, y] = randomPoint(r, shape, inside, 0.9);
        if (!inside(x, y, c.size * 0.72)) continue;
        if (chunks.every((p) => Math.hypot(p.x - x, p.y - y) > (p.size + c.size) * 0.64 + 2)) {
          c.x = x;
          c.y = y;
          chunks.push(c);
          break;
        }
      }
    }
    const sprinkles = [];
    for (let i = 0; i < (look.salt || 0); i++) {
      const [x, y] = randomPoint(r, shape, inside, 0.86);
      sprinkles.push({ kind: 'salt', x, y });
    }

    // Toppings posés dessus : bloc de Kinder Country, crème + barre Bueno, pâte de pistache
    const tops = (look.tops || []).map((type) => {
      const a = r.range(0, TAU), d = type === 'kcountry' ? r.range(0.04, 0.18) : r.range(0, 0.08);
      const t = { type, x: Math.cos(a) * d, y: Math.sin(a) * d, rot: r.range(0, Math.PI), o: r.range(0, 50) };
      if (type === 'kcountry') Object.assign(t, { hx: r.range(0.36, 0.42), hy: r.range(0.17, 0.2), h: r.range(0.32, 0.38), tilt: r.range(0.28, 0.42) * (r() < 0.5 ? -1 : 1) });
      if (type === 'cream') t.r = r.range(0.44, 0.52);
      // morceau de Bueno : ~2 bosses et demie, un bout arrondi, un bout cassé
      if (type === 'bar') Object.assign(t, { hx: r.range(0.44, 0.5), hy: r.range(0.18, 0.2), tiltB: r.range(-0.05, 0.05), brk: r.range(0, 50) });
      if (type === 'paste') t.r = r.range(0.44, 0.54);
      const rr = Math.hypot(t.x, t.y);
      t.base = 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow(rr, 3.2))) + 0.1;
      return t;
    });
    const cream = tops.find((t) => t.type === 'cream'), bar = tops.find((t) => t.type === 'bar');
    if (cream && bar) {
      bar.x = cream.x + r.range(-0.05, 0.05);
      bar.y = cream.y + r.range(-0.05, 0.05);
      bar.base = cream.base + 0.07;
    }
    tops.forEach((t) => { t.c = Math.cos(t.rot); t.s = Math.sin(t.rot); });
    // éclats posés sur la pâte de pistache
    const paste = tops.find((t) => t.type === 'paste');
    for (let i = 0; i < (look.bits || 0); i++) {
      const onPaste = paste && r() < 0.75;
      const a = r.range(0, TAU), d = onPaste ? Math.sqrt(r()) * paste.r * 0.9 : r.range(0.3, 0.85);
      const K = CHUNKS.pistachio;
      chunks.push({ kind: 'pistachio', top: true, x: (onPaste ? paste.x * 100 : 0) + Math.cos(a) * d * 100, y: (onPaste ? paste.y * 100 : 0) + Math.sin(a) * d * 100, size: r.range(K.size[0], K.size[1]) * R * 1.45 });
    }

    return {
      key, seed, shape, look, disp, base, rhoAt, stickAmp, chunks, sprinkles, tops,
      dough: DOUGH[look.dough || 'golden'],
      ext: shape === 'stick' ? 1.6 : KK.BAKE_EXT || 1.16,
      bites: bitePlan(r, shape, look),
      rimW: 5.5,
    };
  }

  function buildPile(key, seed) {
    const r = rng(seed);
    const flavors = ['classique', 'triple', 'marbre', 'classique', 'triple'];
    const layout = [[-56, 34], [2, 48], [58, 30], [-28, -20], [30, -28]];
    const shift = r.int(0, 4);
    const items = layout.map(([dx, dy], i) => ({
      dx: dx + r.range(-4, 4), dy: dy + r.range(-4, 4), s: 0.47, rot: r.range(0, 360),
      look: flavors[(i + shift) % flavors.length], seed: (seed + (i + 1) * 7919) >>> 0,
    }));
    return { key, seed, pile: items, total: items.length, chunks: [], tops: [] };
  }

  KK.cookieModel = buildModel;
  KK.bitePath = (seed, cx, cy, br, facing) => makeBite(rng(seed), cx, cy, br, facing).path;

  /* ======================================================================
     Vue d'un cookie
     ====================================================================== */
  const WORDS = ['CROC !', 'CRONCH', 'MIAM', 'SCRONCH', 'CRAC !', 'GLOUP'];

  class CookieView {
    constructor(parent, model, opts = {}) {
      this.opts = opts;
      this.root = svg('g', { class: 'kk-cookie' }, parent);
      this.wrap = svg('g', null, this.root);
      this.fxG = opts.fxParent ? opts.fxParent : svg('g', { class: 'kk-fx' }, this.root);
      this.fxMap = opts.fxMap || ((x, y) => [x, y]);
      this.fxScale = opts.fxScale || 1;
      this.particles = [];
      this.setModel(model);
    }

    get total() { return this.m.bites.length + 1; }

    setModel(model) {
      this.releaseTex();
      this.m = model;
      this.bitesTaken = 0;
      this.busy = false;
      this.empty = false;
      this.wrap.textContent = '';
      this.wrap.removeAttribute('transform');
      this.wrap.removeAttribute('opacity');
      this.build();
      this.loadTex();
    }

    build() {
      const m = this.m, W = this.wrap, id = KK.uid('ck'), D = m.dough;
      const defs = svg('defs', null, W);
      this.clipP = svg('path', null, svg('clipPath', { id: id + 'c' }, defs));
      const mask = svg('mask', { id: id + 'm', maskUnits: 'userSpaceOnUse', x: -420, y: -420, width: 840, height: 840 }, defs);
      svg('rect', { x: -420, y: -420, width: 840, height: 840, fill: '#fff' }, mask);
      this.maskG = svg('g', { fill: '#000' }, mask);
      const rmask = svg('mask', { id: id + 'r', maskUnits: 'userSpaceOnUse', x: -420, y: -420, width: 840, height: 840 }, defs);
      this.rimMaskG = svg('g', { fill: 'none', stroke: '#fff', 'stroke-width': m.rimW * 2, 'stroke-linejoin': 'round' }, rmask);
      const blur = svg('filter', { id: id + 'b', x: '-40%', y: '-40%', width: '180%', height: '180%' }, defs);
      svg('feGaussianBlur', { stdDeviation: 6 }, blur);
      const blur2 = svg('filter', { id: id + 'k', x: '-20%', y: '-20%', width: '140%', height: '140%' }, defs);
      svg('feGaussianBlur', { stdDeviation: 1.6 }, blur2);
      const ph = svg('radialGradient', { id: id + 'p', cx: '44%', cy: '38%', r: '66%' }, defs);
      svg('stop', { offset: 0, 'stop-color': D.light }, ph);
      svg('stop', { offset: 0.7, 'stop-color': D.base }, ph);
      svg('stop', { offset: 1, 'stop-color': D.dark }, ph);
      this.crumbFills = [[D.light, D.base], [D.base, D.dark], ['#5B3A2A', '#1E110A']].map(([a, b], i) => {
        const g = svg('linearGradient', { id: id + 'g' + i, x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
        svg('stop', { offset: 0, 'stop-color': a }, g);
        svg('stop', { offset: 1, 'stop-color': b }, g);
        return `url(#${id}g${i})`;
      });
      const M = `url(#${id}m)`, C = `url(#${id}c)`;

      if (this.opts.shadow !== false) {
        // ombre portée douce + ombre de contact ; la morsure s'y découpe aussi
        const soft = svg('g', { filter: `url(#${id}b)` }, svg('g', { transform: 'translate(4 10)' }, W));
        this.shadowP = svg('path', { fill: 'rgba(58,24,20,.38)', mask: M }, soft);
        const contact = svg('g', { filter: `url(#${id}k)` }, svg('g', { transform: 'translate(1.2 3)' }, W));
        this.shadow2 = svg('path', { fill: 'rgba(40,16,12,.42)', mask: M }, contact);
      } else {
        this.shadowP = this.shadow2 = null;
      }

      const body = svg('g', { mask: M }, W);
      this.placeholder = svg('path', { fill: `url(#${id}p)`, class: 'kk-ph' }, body);
      const e = m.ext * R;
      this.tex = svg('image', { x: -e, y: -e, width: 2 * e, height: 2 * e, preserveAspectRatio: 'none', class: 'kk-tex' }, body);
      this.tex.style.opacity = '0';

      // bord de morsure : liseré de croûte + mie texturée
      const rim = svg('g', { mask: M, 'clip-path': C }, W);
      this.crustG = svg('g', { fill: 'none', stroke: D.crust, 'stroke-width': m.rimW * 2 + 2.6, 'stroke-linejoin': 'round', opacity: 0.55 }, rim);
      const band = svg('g', { mask: `url(#${id}r)` }, rim);
      svg('rect', { x: -e, y: -e, width: 2 * e, height: 2 * e, fill: D.rim }, band);
      this.rimTex = svg('image', { x: -e, y: -e, width: 2 * e, height: 2 * e, preserveAspectRatio: 'none', class: 'kk-tex' }, band);
      this.rimTex.style.opacity = '0';

      const pts = m.base.map((b, i) => [b.x + b.nx * m.disp[i], b.y + b.ny * m.disp[i]]);
      const d = closedPath(pts, 1);
      this.outlineD = d;
      [this.clipP, this.placeholder, this.shadowP, this.shadow2].forEach((p) => p && p.setAttribute('d', d));
    }

    /* ---------- Textures cuites ---------- */
    loadTex() {
      const m = this.m, res = this.opts.res || 320;
      const quick = KK.bake.peek(m, 'baked');
      if (quick) this.showTex(this.tex, quick, true);
      const tok = (this.tok = (this.tok || 0) + 1);
      this.held = { m, res, interior: false };
      KK.bake.acquire(m, 'baked', res, this.opts.pri || 0).then((url) => {
        if (this.tok === tok) this.showTex(this.tex, url, !!quick);
      });
    }

    loadInterior() {
      if (!this.held || this.held.interior) return;
      this.held.interior = true;
      const tok = this.tok;
      KK.bake.acquire(this.m, 'interior', 192, 8).then((url) => {
        if (this.tok === tok) this.showTex(this.rimTex, url);
      });
    }

    showTex(el, url, instant) {
      el.setAttribute('href', url);
      const fade = () => {
        el.style.opacity = '1';
        if (el === this.tex) this.placeholder.style.opacity = '0';
      };
      if (instant || KK.reduced) fade();
      else {
        let done = false;
        const go = () => { if (!done) { done = true; fade(); } };
        requestAnimationFrame(() => requestAnimationFrame(go));
        setTimeout(go, 80);
      }
    }

    releaseTex() {
      if (!this.held) return;
      KK.bake.release(this.held.m, 'baked', this.held.res);
      if (this.held.interior) KK.bake.release(this.held.m, 'interior', 192);
      this.held = null;
    }

    /* ---------- Morsures ---------- */
    addBiteShapes(b) {
      return [svg('path', { d: b.path }, this.maskG), svg('path', { d: b.path }, this.rimMaskG), svg('path', { d: b.path }, this.crustG)];
    }

    applyBites(n) {
      const target = Math.min(n, this.m.bites.length);
      if (target > this.bitesTaken) this.loadInterior();
      for (let i = this.bitesTaken; i < target; i++) this.addBiteShapes(this.m.bites[i]);
      this.bitesTaken = Math.max(this.bitesTaken, target);
    }

    bite() {
      if (this.busy) return Promise.resolve(false);
      if (this.bitesTaken >= this.m.bites.length) return this.gulp();
      const b = this.m.bites[this.bitesTaken++];
      this.busy = true;
      this.loadInterior();
      if (this.opts.sound !== false) { KK.sfx.crunch(); KK.vibrate(14); }
      const els = this.addBiteShapes(b);
      this.jolt(b.dir);
      this.spawnCrumbs(b, KK.reduced ? 0 : 16);
      if (this.opts.words !== false) this.word(b);
      return KK.tween(140, (e) => {
        const k = 0.3 + 0.7 * e;
        const tr = `translate(${f(b.cx)} ${f(b.cy)}) scale(${f(k)}) translate(${f(-b.cx)} ${f(-b.cy)})`;
        els.forEach((el) => el.setAttribute('transform', tr));
      }, KK.ease.outCubic).then(() => {
        els.forEach((el) => el.removeAttribute('transform'));
        this.busy = false;
        return true;
      });
    }

    gulp() {
      this.busy = true;
      if (this.opts.sound !== false) { KK.sfx.crunch(1.25); KK.vibrate([10, 40, 12]); }
      const last = this.m.bites[this.m.bites.length - 1];
      const dir = last ? last.dir : -Math.PI / 2;
      if (!KK.reduced) {
        for (let i = 0; i < 3; i++) {
          const a = dir + Math.PI + (i - 1) * 0.9;
          this.spawnCrumbs({ cx: Math.cos(a) * 40, cy: Math.sin(a) * 40, r: 30, facing: a, span: 2.4, dir }, 10);
        }
      }
      if (this.opts.words !== false && last) this.word(last, 'GLOUP');
      return KK.tween(360, (e) => {
        this.wrap.setAttribute('transform', `translate(${f(Math.cos(dir) * e * 26)} ${f(Math.sin(dir) * e * 26)}) rotate(${f(e * 40)}) scale(${f(Math.max(0.001, 1 - e))})`);
        this.wrap.setAttribute('opacity', f(1 - e * 0.6));
      }, KK.ease.inCubic).then(() => {
        this.wrap.setAttribute('opacity', '0');
        this.busy = false;
        this.empty = true;
        if (this.opts.onEmpty) this.opts.onEmpty(this);
        return 'empty';
      });
    }

    popIn() {
      this.empty = false;
      if (KK.reduced) {
        this.wrap.removeAttribute('transform');
        this.wrap.removeAttribute('opacity');
        return Promise.resolve();
      }
      return KK.tween(560, (e, p) => {
        this.wrap.setAttribute('transform', `rotate(${f((1 - p) * -70)}) scale(${f(Math.max(0.001, e))})`);
        this.wrap.setAttribute('opacity', f(Math.min(1, p * 3)));
      }, KK.ease.outBack).then(() => {
        this.wrap.removeAttribute('transform');
        this.wrap.removeAttribute('opacity');
      });
    }

    jolt(dir, power = 1) {
      if (KK.reduced) return;
      const ax = Math.cos(dir) * 6 * power, ay = Math.sin(dir) * 6 * power;
      const rot = (Math.random() < 0.5 ? -1 : 1) * 5 * power;
      const t0 = performance.now();
      cancelAnimationFrame(this.jRAF);
      const step = (now) => {
        const t = (now - t0) / 1000, damp = Math.exp(-7 * t), k = damp * Math.cos(22 * t);
        const s = 1 - 0.05 * damp * Math.cos(16 * t);
        this.wrap.setAttribute('transform', `translate(${f(ax * k)} ${f(ay * k)}) rotate(${f(rot * k)}) scale(${f(s)})`);
        if (t < 0.7) this.jRAF = requestAnimationFrame(step);
        else this.wrap.removeAttribute('transform');
      };
      this.jRAF = requestAnimationFrame(step);
    }

    /* ---------- Miettes : petites physiques, dégradés éclairés ---------- */
    spawnCrumbs(b, n) {
      if (!n || this.opts.fx === false) return;
      const k = this.fxScale;
      const fills = this.crumbFills;
      const chocolate = this.m.chunks.some((c) => c.kind === 'dark' || c.kind === 'milk');
      for (let i = 0; i < n; i++) {
        const a = b.facing + (Math.random() - 0.5) * b.span;
        const [x, y] = this.fxMap(b.cx + Math.cos(a) * b.r, b.cy + Math.sin(a) * b.r);
        const va = b.dir + (Math.random() - 0.5) * 1.8, sp = (60 + Math.random() * 150) * k;
        const s = (1.4 + Math.random() * 3.2) * k, pts = [];
        const nv = 4 + Math.floor(Math.random() * 3);
        for (let j = 0; j < nv; j++) {
          const aa = (j / nv) * TAU + Math.random() * 0.7;
          const rr = s * (0.55 + Math.random() * 0.6);
          pts.push([Math.cos(aa) * rr, Math.sin(aa) * rr]);
        }
        const pick = chocolate && Math.random() < 0.18 ? 2 : Math.random() < 0.6 ? 0 : 1;
        const el = svg('path', { d: closedPath(pts, 0.35), fill: fills[pick] }, this.fxG);
        this.particles.push({
          el, x, y, vx: Math.cos(va) * sp, vy: Math.sin(va) * sp - 70 * k,
          rot: Math.random() * 360, vr: (Math.random() - 0.5) * 900, life: 0, max: 1 + Math.random() * 0.9, rest: false, k,
        });
      }
      this.runParticles();
    }

    runParticles() {
      if (this.pRAF) return;
      let last = performance.now();
      const floor = this.opts.floor != null ? this.opts.floor : 124;
      const step = (now) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        this.particles = this.particles.filter((p) => {
          p.life += dt;
          if (!p.rest) {
            p.vy += 900 * p.k * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            if (p.y > floor) {
              p.y = floor;
              p.vy *= -0.3;
              p.vx *= 0.5;
              p.vr *= 0.4;
              if (Math.abs(p.vy) < 40 * p.k) p.rest = true;
            }
          }
          p.el.setAttribute('transform', `translate(${f(p.x)} ${f(p.y)}) rotate(${f(p.rot)})`);
          p.el.setAttribute('opacity', f(clamp((p.max - p.life) / 0.35)));
          if (p.life >= p.max) { p.el.remove(); return false; }
          return true;
        });
        this.pRAF = this.particles.length ? requestAnimationFrame(step) : 0;
      };
      this.pRAF = requestAnimationFrame(step);
    }

    word(b, forced) {
      if (KK.reduced) return;
      const w = forced || WORDS[(this.bitesTaken - 1) % (WORDS.length - 1)];
      const dist = Math.min(Math.hypot(b.cx, b.cy) + 6, 118);
      const [x, y] = this.fxMap(Math.cos(b.dir) * dist, Math.sin(b.dir) * dist);
      const t = svg('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'kk-onomato' }, this.fxG);
      t.textContent = w;
      const rot = (Math.random() - 0.5) * 34, k = this.fxScale;
      KK.tween(720, (e, p) => {
        const s = (p < 0.25 ? KK.ease.outBack(p / 0.25) : 1) * k;
        t.setAttribute('transform', `translate(${f(x)} ${f(y - p * 18 * k)}) rotate(${f(rot)}) scale(${f(Math.max(0.001, s))})`);
        t.setAttribute('opacity', f(p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3));
      }).then(() => t.remove());
    }

    destroy() {
      cancelAnimationFrame(this.pRAF);
      cancelAnimationFrame(this.jRAF);
      this.particles.forEach((p) => p.el.remove());
      this.releaseTex();
      this.tok = -1;
      this.root.remove();
    }
  }

  /* Tas de mini kookies : une bouchée = un mini */
  class PileView {
    constructor(parent, model, opts = {}) {
      this.opts = opts;
      this.root = svg('g', { class: 'kk-pile' }, parent);
      this.wrap = svg('g', null, this.root);
      this.fxG = svg('g', { class: 'kk-fx' }, this.root);
      this.setModel(model);
    }

    get total() { return this.m.total; }

    setModel(model) {
      if (this.items) this.items.forEach((i) => i.v.destroy());
      this.m = model;
      this.bitesTaken = 0;
      this.busy = false;
      this.empty = false;
      this.wrap.textContent = '';
      this.wrap.removeAttribute('transform');
      this.wrap.removeAttribute('opacity');
      const res = Math.max(128, Math.round((this.opts.res || 320) * 0.55));
      this.items = model.pile.map((it) => {
        const g = svg('g', { transform: `translate(${f(it.dx)} ${f(it.dy)}) scale(${it.s}) rotate(${f(it.rot)})` }, this.wrap);
        const a = (it.rot * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
        const v = new CookieView(g, buildModel(it.look, it.seed, { chunkMul: 0.55 }), {
          shadow: this.opts.shadow, words: false, sound: false, fx: this.opts.fx, res, pri: this.opts.pri,
          fxParent: this.fxG, fxScale: it.s,
          fxMap: (x, y) => [it.dx + (x * c - y * s) * it.s, it.dy + (x * s + y * c) * it.s],
          floor: this.opts.floor,
        });
        return { g, v, it };
      });
    }

    applyBites(n) {
      const target = Math.min(n, this.total);
      for (let i = 0; i < target; i++) this.items[this.items.length - 1 - i].g.setAttribute('display', 'none');
      this.bitesTaken = Math.max(this.bitesTaken, target);
    }

    bite() {
      if (this.busy) return Promise.resolve(false);
      if (this.bitesTaken >= this.total) {
        if (this.opts.onEmpty) this.opts.onEmpty(this);
        return Promise.resolve('empty');
      }
      const item = this.items[this.items.length - 1 - this.bitesTaken++];
      this.busy = true;
      if (this.opts.sound !== false) { KK.sfx.crunch(0.8); KK.vibrate(12); }
      if (this.opts.words !== false && !KK.reduced) {
        CookieView.prototype.word.call(
          { fxG: this.fxG, fxMap: (x, y) => [item.it.dx + x * 0.4, item.it.dy - 30 + y * 0.4], fxScale: 0.8, bitesTaken: this.bitesTaken },
          { cx: 0, cy: 0, dir: -Math.PI / 2 }, this.bitesTaken === this.total ? 'GLOUP' : null);
      }
      return item.v.gulp().then(() => {
        item.g.setAttribute('display', 'none');
        this.busy = false;
        if (this.bitesTaken >= this.total) {
          this.empty = true;
          if (this.opts.onEmpty) this.opts.onEmpty(this);
          return 'empty';
        }
        return true;
      });
    }

    popIn() {
      return CookieView.prototype.popIn.call(this);
    }

    destroy() {
      this.items.forEach((i) => i.v.destroy());
      this.root.remove();
    }
  }

  KK.CookieView = CookieView;
  KK.PileView = PileView;

  /* Résolution de texture adaptée à la taille affichée */
  KK.texRes = function (cssPx) {
    const px = cssPx * Math.min(2.5, window.devicePixelRatio || 1);
    return px < 110 ? 128 : px < 190 ? 192 : px < 290 ? 288 : px < 420 ? 384 : 512;
  };

  /* Monte un cookie dans un conteneur HTML : <svg> + vue prête à croquer */
  KK.mountCookie = function (el, key, seed, opts = {}) {
    const pad = opts.pad != null ? opts.pad : 16;
    const look = KK.LOOKS[key] || {};
    const svgEl = svg('svg', {
      viewBox: `${-100 - pad} ${-100 - pad} ${200 + 2 * pad} ${200 + 2 * pad}`,
      class: 'kk-cookie-svg', 'aria-hidden': 'true', focusable: 'false',
    }, el);
    const o = Object.assign({ res: KK.texRes((el.clientWidth || 140) * (look.shape === 'stick' ? 1.3 : 1)) }, opts);
    const model = buildModel(key, seed);
    let view;
    if (model.pile) {
      view = new PileView(svgEl, model, o);
    } else if (look.shape === 'stick') {
      const holder = svg('g', { transform: 'rotate(-28) scale(.84)' }, svgEl);
      const fxG = svg('g', { class: 'kk-fx' }, svgEl);
      const a = (-28 * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), k = 0.84;
      view = new CookieView(holder, model, { ...o, fxParent: fxG, fxScale: k, fxMap: (x, y) => [(x * c - y * s) * k, (x * s + y * c) * k] });
    } else {
      view = new CookieView(svgEl, model, o);
    }
    view.svgEl = svgEl;
    view.key = key;
    return view;
  };
})();
