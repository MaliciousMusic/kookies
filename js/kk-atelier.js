/* ==========================================================================
   Kookies — l'atelier (accueil)
   La vie d'un cookie, en boucle, avec de vraies mains (fines) :
   saladier en inox (farine au doseur, sucre, pépites, spatule, pâte),
   boule roulée sur la planche, four qui chauffe (la boule s'étale en cookie
   épais), puis posé à côté de ses semblables sur la coupelle, par la main
   du côté de la coupelle ; on reste un moment devant la vitrine avant de
   recommencer. Une graine par cookie ; tout est fonction de t.
   ========================================================================== */
(function () {
  'use strict';

  const KK = window.KK;
  const { svg, f, clamp, lerp, prog, ease, TAU } = KK;
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const deg = (r) => (r * 180) / Math.PI;

  const S = 400; // écart entre postes
  const CY = 60; // plan de travail
  const PACE = 1.45; // secondes réelles par seconde de scénario : chaque geste prend son temps
  const T_PLACE = 12.47; // le cookie est posé sur la coupelle
  const T_OUT = 15.1; // on quitte la vitrine (≈ 3,8 s réelles devant les coupelles)
  const CYCLE = 15.8;
  const BALL_R = 25, RC = 30, RC_PLATE = 19;
  const RIM = CY - 72; // bord du saladier
  const BALL_Y = CY - 24 - BALL_R; // boule posée sur la planche
  const PLATES = [
    { x: -132, stand: true }, { x: -44, stand: false }, { x: 44, stand: true }, { x: 132, stand: false },
  ];
  const SLOTS = [[-15, -3], [15, -3], [0, 6]];
  const plateY = (p) => (p.stand ? CY - 74 : CY - 7);
  const OVEN = { hinge: CY - 16, doorH: 84, cookie: [-12, CY - 40] };
  const TILE_A = '#8A2F6E', TILE_B = '#935D60';

  /* Bande-son : chaque geste a son petit bruit, calé sur le scénario
     [temps du scénario, son, options] ; dur / span / per / gap sont en secondes de scénario */
  const CUES = [
    [0.68, 'pour', { dur: 0.47 }], // la farine glisse du doseur
    [1.66, 'sugar', { dur: 0.38 }], // le sucre
    [2.4, 'drops', { n: 7, span: 0.5 }], // les pépites, du bout des doigts
    [2.95, 'stir', { n: 2, per: 0.45 }], // la spatule
    [4.12, 'pluck'], // on prélève une boule
    [4.6, 'pan', { dur: 0.75 }],
    [5.72, 'pat'], // posée sur la planche
    [5.85, 'roll', { n: 2, per: 0.67 }], // roulée entre les paumes
    [7.45, 'pan', { dur: 0.75 }],
    [8.16, 'door'], [8.55, 'tray'], [8.86, 'shut'], // la boule entre au four
    [9.06, 'knob', { n: 7, gap: 0.1 }], // thermostat à 180°
    [10.2, 'timer'], // « ding ! »
    [10.33, 'door'], [10.95, 'shut'], // on sort le cookie
    [11.25, 'pan', { dur: 0.75 }],
    [12.47, 'place'], [12.55, 'tag'], // sur sa coupelle, avec son étiquette
    [15.15, 'pan', { dur: 0.65 }],
  ];

  const E = { in: ease.inCubic, out: ease.outCubic, io: ease.inOutCubic, sine: ease.inOutSine, lin: ease.linear, back: ease.outBack };
  function kf(t, keys) {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const k1 = keys[i];
      if (t <= k1[0]) {
        const k0 = keys[i - 1];
        const p = (t - k0[0]) / (k1[0] - k0[0] || 1);
        const e = (E[k1[2]] || E.io)(p);
        const a = k0[1], b = k1[1];
        return Array.isArray(a) ? a.map((v, j) => v + (b[j] - v) * e) : a + (b - a) * e;
      }
    }
    return keys[keys.length - 1][1];
  }
  const mixP = (a, b, w) => [lerp(a[0], b[0], w), lerp(a[1], b[1], w)];

  class Atelier {
    constructor(host, stage, opts = {}) {
      this.host = host;
      this.stage = stage;
      this.opts = opts;
      this.flavors = opts.flavors;
      this.idx = -1;
      this.serial = opts.serial || 420;
      this.t = 0;
      this.speed = 1;
      this.running = false;
      this.active = true;
      this.inView = true;
      this.W = 360;
      this.H = 420;
      this.top = CY - 0.68 * 420;
      this.plates = PLATES.map(() => []);
      this.tick = this.tick.bind(this);
      this.build();
      this.fit();
      this.loadStatic();
      this.fillPlates();
      this.next();
      this.render(KK.reduced ? 13.2 : 0);
      this.bindInput();
      this.observe();
    }

    /* ======================================================================
       Décor
       ====================================================================== */
    build() {
      const s = (this.svgEl = svg('svg', { class: 'factory-svg', 'aria-hidden': 'true', focusable: 'false' }, this.stage));
      const defs = (this.defs = svg('defs', null, s));
      const grad = (id, stops, a = {}) => {
        const g = svg(a.radial ? 'radialGradient' : 'linearGradient', Object.assign({ id }, a.radial ? {} : { x1: 0, y1: 0, x2: a.x2 != null ? a.x2 : 0, y2: a.y2 != null ? a.y2 : 1 }), defs);
        stops.forEach(([o, c, op]) => svg('stop', { offset: o, 'stop-color': c, 'stop-opacity': op != null ? op : 1 }, g));
        return `url(#${id})`;
      };
      this.g = {
        wall: grad('at-wall', [[0, '#F6F0E6'], [1, '#EADFCF']]),
        top: grad('at-top', [[0, '#FFFDF9'], [1, '#EDE5D8']]),
        gold: grad('at-gold', [[0, '#F7DD98'], [0.45, '#D2A64B'], [1, '#98702A']], { x2: 1, y2: 0 }),
        goldV: grad('at-goldv', [[0, '#FBE7B0'], [1, '#B98A36']]),
        pink: grad('at-pink', [[0, '#F6C9D6'], [1, '#E29DB3']]),
        wood: grad('at-wood', [[0, '#E2B784'], [1, '#C8955D']]),
        steel: grad('at-steel', [[0, '#7E8187'], [0.22, '#D9DCE0'], [0.38, '#F7F8F9'], [0.6, '#A5A9AF'], [0.8, '#E8EAEC'], [1, '#868A90']], { x2: 1, y2: 0 }),
        steelIn: grad('at-steelin', [[0, '#8E9298'], [0.55, '#C9CCD0'], [1, '#EEF0F2']]),
        plum: grad('at-plum', [[0, '#9A3A80'], [1, '#5E1C4D']]),
        chrome: grad('at-chrome', [[0, '#FBFAF7'], [0.5, '#C9C3BA'], [1, '#EFECE6']]),
        glow: grad('at-glow', [[0, '#FFB45A', 0.95], [0.6, '#FF7B2F', 0.45], [1, '#FF5A1F', 0]], { radial: true }),
        shadow: grad('at-sh', [[0, '#2A1010', 0.34], [1, '#2A1010', 0]], { radial: true }),
        chip: grad('at-chip', [[0, '#6B4533'], [1, '#1E110A']], { x2: 1, y2: 1 }),
      };
      const tp = svg('pattern', { id: 'at-tiles', width: 60, height: 60, patternUnits: 'userSpaceOnUse' }, defs);
      svg('rect', { width: 60, height: 60, fill: TILE_B }, tp);
      svg('rect', { width: 30, height: 30, fill: TILE_A }, tp);
      svg('rect', { x: 30, y: 30, width: 30, height: 30, fill: TILE_A }, tp);
      svg('path', { d: 'M0 .6H60M0 30.6H60M.6 0V60M30.6 0V60', stroke: '#EFE4DC', 'stroke-width': 1.3, opacity: 0.75 }, tp);
      const nf = svg('filter', { id: 'at-neon', x: '-30%', y: '-30%', width: '160%', height: '160%' }, defs);
      svg('feGaussianBlur', { in: 'SourceAlpha', stdDeviation: 5, result: 'b' }, nf);
      svg('feFlood', { 'flood-color': '#FF9B45', 'flood-opacity': 0.85 }, nf);
      svg('feComposite', { in2: 'b', operator: 'in', result: 'g' }, nf);
      const nm = svg('feMerge', null, nf);
      svg('feMergeNode', { in: 'g' }, nm);
      svg('feMergeNode', { in: 'g' }, nm);
      svg('feMergeNode', { in: 'SourceGraphic' }, nm);
      const blur = svg('filter', { id: 'at-blur', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
      svg('feGaussianBlur', { stdDeviation: 3 }, blur);

      this.bg = svg('rect', { fill: this.g.wall }, s);
      this.wallG = svg('g', null, s);
      this.worldG = svg('g', null, s);
      this.heldG = svg('g', null, s);
      this.fxG = svg('g', null, s);
      this.handsG = svg('g', null, s);
      this.topFx = svg('g', null, s);
      this.hudG = svg('g', null, s);

      this.buildWall();
      this.buildCounter();
      this.buildBowl();
      this.buildBoard(S);
      this.buildOven(2 * S);
      this.buildVitrine(3 * S);
      this.buildHeld();
      this.handR = this.buildHand(1);
      this.handL = this.buildHand(-1);
      this.buildHud();
    }

    buildWall() {
      const w = this.wallG, P = 0.85;
      const slats = (cx, width, top, h) => {
        const g = svg('g', null, w);
        const n = Math.round(width / 11);
        for (let i = 0; i < n; i++) {
          const x = cx - width / 2 + i * 11;
          svg('rect', { x, y: top, width: 8, height: h, rx: 2, fill: i % 2 ? '#C79A6A' : '#7A2766', opacity: i % 2 ? 1 : 0.9 }, g);
        }
        svg('rect', { x: cx - width / 2 - 4, y: top - 6, width: width + 6, height: 8, rx: 3, fill: '#B68A5A' }, g);
        return g;
      };
      const s0 = slats(0, 210, -250, 250);
      s0.setAttribute('id', 'at-wall0');
      svg('use', { href: '#at-wall0', x: 4 * S * P }, w);
      const sh = svg('g', null, w);
      svg('rect', { x: S * P - 95, y: CY - 150, width: 190, height: 7, rx: 3, fill: '#C79A6A' }, sh);
      [['FARINE', -60, 46, '#F7F2EA'], ['SUCRE', 0, 40, '#F7F2EA'], ['PÉPITES', 58, 44, '#3B2319']].forEach(([lbl, dx, hgt, c]) => {
        const x = S * P + dx;
        svg('rect', { x: x - 20, y: CY - 150 - hgt, width: 40, height: hgt, rx: 8, fill: 'rgba(255,255,255,.55)', stroke: 'rgba(120,90,70,.3)' }, sh);
        svg('rect', { x: x - 17, y: CY - 150 - hgt * 0.7, width: 34, height: hgt * 0.68, rx: 6, fill: c, opacity: 0.9 }, sh);
        svg('rect', { x: x - 21, y: CY - 150 - hgt - 6, width: 42, height: 8, rx: 3, fill: '#7A2766' }, sh);
        const t = svg('text', { x, y: CY - 150 - hgt * 0.33, 'text-anchor': 'middle', class: 'at-jar' }, sh);
        t.textContent = lbl;
      });
      svg('rect', { x: 2 * S * P - 150, y: CY - 190, width: 300, height: 190, fill: 'url(#at-tiles)', opacity: 0.22 }, w);
      slats(3 * S * P, 340, -260, 260);
      const logo = KK.LOGO;
      if (logo) {
        const k = 112 / logo.h;
        const ng = svg('g', { transform: `translate(${f(3 * S * P - (logo.w * k) / 2)} ${f(CY - 232)}) scale(${f(k)})`, filter: 'url(#at-neon)' }, w);
        logo.paths.forEach((p) => svg('path', { d: p.d, fill: '#FFF7EA', 'fill-rule': 'evenodd' }, ng));
      }
    }

    buildCounter() {
      const w = this.worldG;
      svg('rect', { x: -700, y: CY + 11, width: 4 * S + 1400, height: 900, fill: 'url(#at-tiles)' }, w);
      svg('rect', { x: -700, y: CY - 2, width: 4 * S + 1400, height: 14, fill: this.g.top }, w);
      svg('rect', { x: -700, y: CY + 10, width: 4 * S + 1400, height: 3, fill: 'rgba(60,20,40,.25)' }, w);
      svg('rect', { x: -700, y: CY - 2, width: 4 * S + 1400, height: 1.5, fill: '#fff', opacity: 0.8 }, w);
    }

    /* Saladier en inox : intérieur et bord arrière, contenu, paroi et bord avant.
       Le contenu n'est coupé que par la paroi avant : un tas plus haut que le
       bord passe devant le bord arrière, comme en vrai. */
    buildBowl() {
      const g = svg('g', { id: 'at-bowl' }, this.worldG);
      svg('ellipse', { cx: 0, cy: CY + 1, rx: 80, ry: 8, fill: this.g.shadow }, g);
      svg('ellipse', { cx: 0, cy: RIM, rx: 92, ry: 22, fill: this.g.steelIn }, g);
      svg('path', { d: `M-92 ${RIM}A92 22 0 0 1 92 ${RIM}`, fill: 'none', stroke: '#F4F5F6', 'stroke-width': 4 }, g);
      svg('path', { d: `M-89 ${RIM + 1.5}A89 20 0 0 1 89 ${RIM + 1.5}`, fill: 'none', stroke: '#8A8E94', 'stroke-width': 1, opacity: 0.6 }, g);
      const clipId = KK.uid('bw');
      svg('path', { d: `M-88 ${RIM - 240}V${RIM}A88 20 0 0 0 88 ${RIM}V${RIM - 240}Z` }, svg('clipPath', { id: clipId }, this.defs));
      const content = svg('g', { 'clip-path': `url(#${clipId})` }, g);
      this.flourG = svg('g', null, content);
      this.flourImg = svg('image', { preserveAspectRatio: 'none' }, this.flourG);
      this.sugarG = svg('g', null, content);
      this.sugarImg = svg('image', { preserveAspectRatio: 'none' }, this.sugarG);
      this.massG = svg('g', null, content);
      this.massImg = svg('image', { preserveAspectRatio: 'none' }, this.massG);
      this.dent = svg('ellipse', { rx: 13, ry: 4.5, fill: 'rgba(80,44,20,.45)', opacity: 0 }, content);
      svg('path', { d: `M-92 ${RIM}C-92 ${RIM + 52} -52 ${CY} 0 ${CY}C52 ${CY} 92 ${RIM + 52} 92 ${RIM}A92 22 0 0 1 -92 ${RIM}Z`, fill: this.g.steel }, g);
      svg('path', { d: `M-80 ${RIM + 30}C-50 ${RIM + 50} 50 ${RIM + 50} 80 ${RIM + 30}`, fill: 'none', stroke: '#fff', 'stroke-width': 3, opacity: 0.35 }, g);
      svg('path', { d: `M-92 ${RIM}A92 22 0 0 0 92 ${RIM}`, fill: 'none', stroke: '#F4F5F6', 'stroke-width': 4 }, g);
      svg('path', { d: `M-89 ${RIM + 1.5}A89 20 0 0 0 89 ${RIM + 1.5}`, fill: 'none', stroke: '#8A8E94', 'stroke-width': 1, opacity: 0.6 }, g);
      svg('use', { href: '#at-bowl', x: 4 * S }, this.worldG);
      this.doughString = svg('path', { fill: 'none', stroke: '#E0BB84', 'stroke-linecap': 'round', opacity: 0 }, this.worldG);
    }

    buildBoard(x0) {
      const g = svg('g', null, this.worldG);
      svg('ellipse', { cx: x0, cy: CY + 1, rx: 100, ry: 7, fill: this.g.shadow }, g);
      svg('rect', { x: x0 - 100, y: CY - 16, width: 200, height: 16, rx: 8, fill: '#A97843' }, g);
      svg('rect', { x: x0 - 100, y: CY - 24, width: 200, height: 16, rx: 8, fill: this.g.wood }, g);
      for (let i = 0; i < 5; i++) svg('path', { d: `M${x0 - 88 + i * 7} ${CY - 20 + (i % 2)}Q${x0} ${CY - 22 + i} ${x0 + 88 - i * 5} ${CY - 19}`, fill: 'none', stroke: '#B8844D', 'stroke-width': 0.8, opacity: 0.5 }, g);
      [[-50, -18, 16], [30, -17, 22], [62, -19, 10], [-10, -20, 12]].forEach(([dx, dy, r]) => svg('ellipse', { cx: x0 + dx, cy: CY + dy, rx: r, ry: r * 0.25, fill: '#FFFDF8', opacity: 0.75 }, g));
    }

    buildOven(x0) {
      const g = svg('g', null, this.worldG);
      const top = CY - 150, x = x0 - 104, w = 208;
      this.ovenX = x0;
      svg('ellipse', { cx: x0, cy: CY + 1, rx: 108, ry: 8, fill: this.g.shadow }, g);
      svg('rect', { x: x + 16, y: CY - 8, width: 18, height: 9, rx: 3, fill: '#2B1826' }, g);
      svg('rect', { x: x + w - 34, y: CY - 8, width: 18, height: 9, rx: 3, fill: '#2B1826' }, g);
      svg('rect', { x, y: top, width: w, height: 144, rx: 24, fill: this.g.plum }, g);
      svg('rect', { x: x + 10, y: top + 6, width: w - 20, height: 5, rx: 2.5, fill: '#fff', opacity: 0.18 }, g);
      this.heat = svg('g', { fill: 'none', stroke: '#E7B98F', 'stroke-width': 2.2, 'stroke-linecap': 'round', opacity: 0 }, g);
      this.heatPaths = [-40, 0, 40].map(() => svg('path', null, this.heat));
      const cx0 = x0 - 88, cw = 150, cy0 = OVEN.hinge - OVEN.doorH, ch = OVEN.doorH;
      const cav = svg('g', null, g);
      svg('rect', { x: cx0, y: cy0, width: cw, height: ch, rx: 10, fill: '#1B0B15' }, cav);
      this.elemTop = svg('path', { d: `M${cx0 + 12} ${cy0 + 10}h${cw - 24}`, stroke: '#3A2230', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '6 5' }, cav);
      this.elemBot = svg('path', { d: `M${cx0 + 12} ${cy0 + ch - 10}h${cw - 24}`, stroke: '#3A2230', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-dasharray': '6 5' }, cav);
      this.ovenLight = svg('ellipse', { cx: x0 - 13, cy: cy0 + ch / 2, rx: 80, ry: 48, fill: this.g.glow, opacity: 0 }, cav);
      svg('ellipse', { cx: x0 + OVEN.cookie[0], cy: OVEN.cookie[1] + 4, rx: 52, ry: 9, fill: '#6E6468' }, cav);
      svg('ellipse', { cx: x0 + OVEN.cookie[0], cy: OVEN.cookie[1] + 2, rx: 50, ry: 8, fill: '#9C9296' }, cav);
      this.ovenCk = svg('g', null, cav);
      this.ovenBallG = svg('g', null, this.ovenCk);
      this.ovenBall = svg('image', { x: -BALL_R * 1.16, y: -BALL_R * 1.16, width: BALL_R * 2.32, height: BALL_R * 2.32, preserveAspectRatio: 'none' }, this.ovenBallG);
      this.ovenCookieG = svg('g', null, this.ovenCk);
      this.ovenCookie = this.make3q(this.ovenCookieG, RC, false);
      this.door = svg('g', null, g);
      svg('rect', { x: cx0 - 3, y: cy0 - 3, width: cw + 6, height: ch + 6, rx: 12, fill: 'none', stroke: '#2B1826', 'stroke-width': 7 }, this.door);
      svg('rect', { x: cx0, y: cy0, width: cw, height: ch, rx: 10, fill: 'rgba(40,14,30,.28)', stroke: this.g.chrome, 'stroke-width': 3 }, this.door);
      svg('path', { d: `M${cx0 + 18} ${cy0 + ch - 8}L${cx0 + 58} ${cy0 + 8}M${cx0 + 40} ${cy0 + ch - 8}L${cx0 + 72} ${cy0 + 8}`, stroke: '#fff', 'stroke-width': 5, opacity: 0.07, 'stroke-linecap': 'round' }, this.door);
      svg('rect', { x: x0 - 70, y: cy0 - 14, width: 116, height: 8, rx: 4, fill: this.g.chrome }, this.door);
      const px = x0 + 80;
      this.knob = svg('g', null, g);
      svg('circle', { r: 13, fill: '#F4EEE3', stroke: '#2B1826', 'stroke-width': 1.5 }, this.knob);
      svg('rect', { x: -1.5, y: -12, width: 3, height: 9, rx: 1.5, fill: '#2B1826' }, this.knob);
      svg('rect', { x: px - 20, y: top + 54, width: 40, height: 18, rx: 5, fill: '#1B0B15' }, g);
      this.tempTxt = svg('text', { x: px, y: top + 67, 'text-anchor': 'middle', class: 'at-temp' }, g);
      this.bell = svg('g', null, g);
      svg('path', { d: 'M-8 5Q-8 -8 0 -9Q8 -8 8 5L10 7H-10Z', fill: '#F4EEE3' }, this.bell);
      svg('circle', { cy: 9.5, r: 2.4, fill: '#F4EEE3' }, this.bell);
      svg('circle', { cx: px, cy: top + 122, r: 9, fill: '#F4EEE3', stroke: '#2B1826', 'stroke-width': 1.5 }, g);
      this.ding = svg('text', { x: px, y: top - 10, 'text-anchor': 'middle', class: 'at-ding', opacity: 0 }, g);
      this.ding.textContent = 'DING !';
    }

    buildVitrine(x0) {
      const g = svg('g', null, this.worldG);
      this.vitrineX = x0;
      this.tagEls = [];
      this.plateGs = PLATES.map((p, i) => {
        const x = x0 + p.x, py = plateY(p);
        if (p.stand) {
          svg('ellipse', { cx: x, cy: CY + 1, rx: 30, ry: 5, fill: this.g.shadow }, g);
          svg('ellipse', { cx: x, cy: CY - 3, rx: 22, ry: 6, fill: this.g.gold }, g);
          svg('rect', { x: x - 4, y: py, width: 8, height: CY - 3 - py, fill: this.g.gold }, g);
          svg('ellipse', { cx: x, cy: py + 7, rx: 12, ry: 4, fill: this.g.goldV }, g);
          svg('ellipse', { cx: x, cy: py + 3, rx: 44, ry: 11, fill: '#9C742A' }, g);
          svg('ellipse', { cx: x, cy: py, rx: 44, ry: 11, fill: this.g.gold }, g);
          svg('ellipse', { cx: x, cy: py - 0.5, rx: 38, ry: 8.5, fill: this.g.goldV, opacity: 0.7 }, g);
        } else {
          svg('ellipse', { cx: x + 2, cy: CY + 2, rx: 46, ry: 9, fill: this.g.shadow }, g);
          svg('ellipse', { cx: x, cy: CY - 3, rx: 46, ry: 11.5, fill: '#D98BA4' }, g);
          svg('ellipse', { cx: x, cy: CY - 5, rx: 46, ry: 11.5, fill: this.g.pink }, g);
          svg('ellipse', { cx: x, cy: CY - 5, rx: 34, ry: 8, fill: '#F2BACB' }, g);
        }
        const pg = svg('g', null, g);
        const tg = svg('g', { transform: `translate(${x} ${CY + 24})` }, g);
        svg('rect', { x: -34, y: -9, width: 68, height: 18, rx: 4, fill: '#FBF8F2', stroke: 'rgba(0,0,0,.08)' }, tg);
        this.tagEls[i] = svg('text', { x: 0, y: 3.5, 'text-anchor': 'middle', class: 'at-tag' }, tg);
        return pg;
      });
      // vapeur du cookie tout juste sorti du four
      this.steam = svg('g', { fill: 'none', stroke: '#FFFFFF', 'stroke-width': 2.4, 'stroke-linecap': 'round', filter: 'url(#at-blur)', opacity: 0 }, g);
      this.steamPaths = [0, 1, 2].map(() => svg('path', null, this.steam));
      this.placeTag = svg('g', { opacity: 0 }, g);
      svg('rect', { x: -58, y: -12, width: 116, height: 24, rx: 12, fill: '#17110F' }, this.placeTag);
      this.placeTxt = svg('text', { x: 0, y: 4, 'text-anchor': 'middle', class: 'at-place' }, this.placeTag);
    }

    /* Cookie épais vu de 3/4 (texture projetée) + ombre de contact */
    make3q(parent, rc, withShadow = true) {
      const g = svg('g', null, parent);
      if (withShadow) svg('ellipse', { cx: 1.5, cy: rc * 0.12, rx: rc * 1.02, ry: rc * 0.26, fill: this.g.shadow }, g);
      const fr = KK.frame3q();
      const fb = svg('ellipse', { cx: 0, cy: -rc * 0.25, rx: rc * 0.95, ry: rc * 0.55, fill: '#D99A45' }, g);
      const img = svg('image', { x: f(fr.x0 * rc), y: f(fr.y0 * rc), width: f((fr.x1 - fr.x0) * rc), height: f((fr.y1 - fr.y0) * rc), preserveAspectRatio: 'none' }, g);
      return { g, img, fb, rc };
    }

    set3q(c, url, cocoa) {
      if (url) { c.img.setAttribute('href', url); c.fb.setAttribute('opacity', 0); } else { c.img.removeAttribute('href'); c.fb.setAttribute('opacity', 1); }
      c.fb.setAttribute('fill', cocoa ? '#6E4630' : '#D99A45');
    }

    buildHeld() {
      this.ballShadow = svg('ellipse', { rx: 24, ry: 5.5, fill: this.g.shadow, opacity: 0 }, this.heldG);
      this.ballG = svg('g', null, this.heldG);
      svg('circle', { r: BALL_R, fill: '#E6C08A' }, this.ballG);
      this.ballImg = svg('image', { x: -BALL_R * 1.16, y: -BALL_R * 1.16, width: BALL_R * 2.32, height: BALL_R * 2.32, preserveAspectRatio: 'none' }, this.ballG);
      this.cookieHeldG = svg('g', null, this.heldG);
      this.cookieHeld = this.make3q(this.cookieHeldG, RC, false);
      // doseur en inox (tenu par la poignée : le pivot est dans le poing)
      this.scoop = svg('g', null, this.heldG);
      this.scoopTilt = svg('g', null, this.scoop);
      svg('rect', { x: -3, y: -30, width: 6, height: 34, rx: 3, fill: this.g.steel }, this.scoopTilt);
      svg('path', { d: 'M-17 0H17L14 26Q0 31 -14 26Z', fill: this.g.steel }, this.scoopTilt);
      this.scoopFill = svg('ellipse', { cx: 0, cy: 1, rx: 16, ry: 4, fill: '#FBF9F4' }, this.scoopTilt);
      svg('ellipse', { cx: 0, cy: 0, rx: 17, ry: 4.5, fill: 'none', stroke: '#F2F3F4', 'stroke-width': 1.6 }, this.scoopTilt);
      // spatule en bois
      this.spatula = svg('g', null, this.heldG);
      svg('rect', { x: -3.5, y: -26, width: 7, height: 100, rx: 3.5, fill: this.g.wood }, this.spatula);
      svg('path', { d: 'M-11 70H11V96Q0 104 -11 96Z', fill: '#C9975F' }, this.spatula);
      // grains (farine, sucre), pépites qui tombent, nuages de farine
      this.grains = Array.from({ length: 34 }, () => svg('circle', { r: 2, fill: '#FBFAF6', opacity: 0 }, this.fxG));
      this.puffs = Array.from({ length: 6 }, () => svg('circle', { fill: '#FFFDF8', opacity: 0, filter: 'url(#at-blur)' }, this.topFx));
      const rr = KK.rng(99);
      this.chips = Array.from({ length: 14 }, (_, i) => {
        const el = svg('path', { d: 'M0 -4.2Q3.6 1 3 3.2Q0 4.6 -3 3.2Q-3.6 1 0 -4.2Z', fill: this.g.chip, opacity: 0 }, this.fxG);
        return { el, tx: rr.range(-58, 58), ty: RIM + rr.range(-10, 6), t0: 2.42 + i * 0.03, rot: rr.range(-40, 40) };
      });
    }

    /* Main réaliste : trois poses en fondu + manique */
    buildHand(side) {
      const g = svg('g', null, this.handsG);
      const Fm = KK.hands.FRAME;
      const mk = () => svg('image', { x: Fm.x0, y: Fm.y0, width: Fm.x1 - Fm.x0, height: Fm.y1 - Fm.y0, preserveAspectRatio: 'none', opacity: 0 }, g);
      const imgs = { open: mk(), hold: mk(), grip: mk(), mitt: mk() };
      Object.keys(imgs).forEach((pose) => KK.hands.sprite(side, pose).then((u) => imgs[pose].setAttribute('href', u)));
      return { side, g, imgs, rot: 0, x: 0, y: 0 };
    }

    setHand(h, x, y, grip, mitt, twist = 0) {
      const sx = h.side * (this.W / 2 + 70), sy = this.top - 380;
      const rot = Math.atan2(sx - x, -(sy - y)) + twist;
      h.g.setAttribute('transform', `translate(${f(x)} ${f(y)}) rotate(${f(deg(rot))})`);
      // la pose dominante est opaque dessous, la suivante se fond par-dessus (jamais de bras transparent)
      let base, over = null, wOver = 0;
      if (mitt) base = 'mitt';
      else if (grip < 0.5) { const b = grip * 2; if (b < 0.5) { base = 'open'; over = 'hold'; wOver = b; } else { base = 'hold'; over = 'open'; wOver = 1 - b; } }
      else { const b = grip * 2 - 1; if (b < 0.5) { base = 'hold'; over = 'grip'; wOver = b; } else { base = 'grip'; over = 'hold'; wOver = 1 - b; } }
      const pair = base + ':' + over;
      if (h.pair !== pair) {
        h.pair = pair;
        h.g.appendChild(h.imgs[base]);
        if (over) h.g.appendChild(h.imgs[over]);
      }
      Object.keys(h.imgs).forEach((k) => {
        const v = k === base ? 1 : k === over ? f(wOver) : 0;
        if (h.imgs[k]._o !== v) { h.imgs[k].setAttribute('opacity', v); h.imgs[k]._o = v; }
      });
      h.rot = rot;
      h.x = x;
      h.y = y;
      return rot;
    }

    /* Poignet tel que le point de prise (sous les doigts) tombe en (gx, gy) */
    reach(h, gx, gy, twist = 0) {
      const HOLD = KK.hands.HOLD;
      let wx = gx, wy = gy - HOLD;
      const sx = h.side * (this.W / 2 + 70), sy = this.top - 380;
      for (let k = 0; k < 3; k++) {
        const rot = Math.atan2(sx - wx, -(sy - wy)) + twist;
        wx = gx + HOLD * Math.sin(rot);
        wy = gy - HOLD * Math.cos(rot);
      }
      return [wx, wy];
    }

    /* Point de la main (dans son repère tourné) */
    at(h, dx, dy) {
      const c = Math.cos(h.rot), s = Math.sin(h.rot);
      return [h.x + dx * c - dy * s, h.y + dx * s + dy * c];
    }

    buildHud() {
      const hb = svg('linearGradient', { id: 'at-hudbg', x1: 0, y1: 0, x2: 0, y2: 1 }, this.defs);
      svg('stop', { offset: 0, 'stop-color': '#F6F0E6', 'stop-opacity': 0.95 }, hb);
      svg('stop', { offset: 1, 'stop-color': '#F6F0E6', 'stop-opacity': 0 }, hb);
      this.hudBg = svg('rect', { fill: 'url(#at-hudbg)', height: 58 }, this.hudG);
      this.lblSerial = svg('text', { class: 'at-serial' }, this.hudG);
      this.lblSeed = svg('text', { class: 'at-seed' }, this.hudG);
      this.lblPhase = svg('text', { class: 'at-phase', 'text-anchor': 'end' }, this.hudG);
    }

    fit() {
      const r = this.stage.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const W = Math.max(360, (330 * r.width) / r.height), H = Math.max(330, (360 * r.height) / r.width);
      this.W = W;
      this.H = H;
      const top = CY - 0.68 * H;
      this.top = top;
      this.svgEl.setAttribute('viewBox', `${f(-W / 2)} ${f(top)} ${f(W)} ${f(H)}`);
      this.bg.setAttribute('x', f(-W / 2 - 10));
      this.bg.setAttribute('y', f(top - 10));
      this.bg.setAttribute('width', f(W + 20));
      this.bg.setAttribute('height', f(H + 20));
      this.hudBg.setAttribute('x', f(-W / 2));
      this.hudBg.setAttribute('y', f(top));
      this.hudBg.setAttribute('width', f(W));
      this.lblSerial.setAttribute('x', f(-W / 2 + 14));
      this.lblSerial.setAttribute('y', f(top + 22));
      this.lblSeed.setAttribute('x', f(-W / 2 + 14));
      this.lblSeed.setAttribute('y', f(top + 34));
      this.lblPhase.setAttribute('x', f(W / 2 - 14));
      this.lblPhase.setAttribute('y', f(top + 22));
      if (this.cur) this.render(this.t);
    }

    /* ======================================================================
       Textures, vitrine, cycle
       ====================================================================== */
    loadStatic() {
      const tas = { key: 'tas', seed: 1, chunks: [], look: {} };
      const fr = KK.frame3q();
      const place = (img, rc) => {
        img.setAttribute('x', f(fr.x0 * rc));
        img.setAttribute('y', f(fr.y0 * rc));
        img.setAttribute('width', f((fr.x1 - fr.x0) * rc));
        img.setAttribute('height', f((fr.y1 - fr.y0) * rc));
      };
      place(this.flourImg, 40);
      place(this.sugarImg, 32);
      place(this.massImg, 64);
      KK.bake.acquire(tas, 'flour3q', 224, 6).then((u) => this.flourImg.setAttribute('href', u));
      KK.bake.acquire(tas, 'sugar3q', 224, 6).then((u) => this.sugarImg.setAttribute('href', u));
      this.massUrls = {};
      this.flavors.forEach((fl) => {
        const m = KK.cookieModel(fl.key, KK.hash(fl.key + ':saladier'));
        KK.bake.acquire(m, 'mass3q', 256, 5).then((u) => {
          this.massUrls[fl.key] = u;
          if (this.cur && this.cur.fl.key === fl.key) this.massImg.setAttribute('href', u);
        });
      });
      PLATES.forEach((p, i) => { this.tagEls[i].textContent = (this.flavors[i] && (this.flavors[i].short || this.flavors[i].name)) || ''; });
    }

    fillPlates() {
      PLATES.forEach((p, i) => {
        const fl = this.flavors[i % this.flavors.length];
        this.addToPlate(i, fl, KK.newSeed(), 1);
        this.addToPlate(i, fl, KK.newSeed(), 1);
      });
    }

    addToPlate(i, fl, seed, pri, url, slot) {
      const list = this.plates[i];
      const used = list.map((e) => e.slot);
      const model = KK.cookieModel(fl.key, seed, { keep: false }); // une fournée unique : pas gardée
      const entry = { model, res: url ? 256 : 192, slot: slot != null ? slot : [0, 1, 2].find((k) => !used.includes(k)), c: this.make3q(this.plateGs[i], RC_PLATE) };
      const cocoa = model.look.dough === 'cocoa';
      this.set3q(entry.c, url || null, cocoa);
      KK.bake.acquire(model, '3q', entry.res, pri).then((u) => { if (!entry.gone) this.set3q(entry.c, u, cocoa); });
      list.push(entry);
      this.layoutPlate(i);
      return entry;
    }

    layoutPlate(i) {
      const p = PLATES[i], py = plateY(p);
      // ceux du fond d'abord, celui de devant par-dessus
      this.plates[i].slice().sort((a, b) => SLOTS[a.slot][1] - SLOTS[b.slot][1]).forEach((e) => {
        const [dx, dy] = SLOTS[e.slot];
        e.c.g.setAttribute('transform', `translate(${f(this.vitrineX + p.x + dx)} ${f(py + dy)})`);
        this.plateGs[i].appendChild(e.c.g);
      });
    }

    freeSlot(i) {
      const list = this.plates[i];
      if (list.length < 3) return;
      const e = list.shift(); // le plus ancien est parti (vendu !)
      e.gone = true;
      e.c.g.remove();
      KK.bake.release(e.model, '3q', e.res);
    }

    next() {
      if (this.cur) {
        KK.bake.release(this.cur.model, 'ball', 256);
        if (!this.cur.placed) KK.bake.release(this.cur.model, '3q', 256);
      }
      this.idx = (this.idx + 1) % this.flavors.length;
      const fl = this.flavors[this.idx];
      const plate = this.idx % PLATES.length;
      this.freeSlot(plate);
      const used = this.plates[plate].map((e) => e.slot);
      const slot = [0, 1, 2].find((k) => !used.includes(k));
      this.serial++;
      const seed = KK.newSeed();
      const model = KK.cookieModel(fl.key, seed, { keep: false }); // une fournée unique : pas gardée
      const cocoa = model.look.dough === 'cocoa';
      const carrier = PLATES[plate].x < 0 ? -1 : 1;
      const cur = (this.cur = { fl, seed, model, cocoa, plate, slot, carrier, placed: false, baked: null });
      this.ballImg.removeAttribute('href');
      this.ovenBall.removeAttribute('href');
      this.set3q(this.cookieHeld, null, cocoa);
      this.set3q(this.ovenCookie, null, cocoa);
      KK.bake.acquire(model, 'ball', 256, 7).then((u) => {
        if (this.cur !== cur) return;
        this.ballImg.setAttribute('href', u);
        this.ovenBall.setAttribute('href', u);
      });
      KK.bake.acquire(model, '3q', 256, 6).then((u) => {
        if (this.cur !== cur) return;
        cur.baked = u;
        this.set3q(this.cookieHeld, u, cocoa);
        this.set3q(this.ovenCookie, u, cocoa);
      });
      if (this.massUrls && this.massUrls[fl.key]) this.massImg.setAttribute('href', this.massUrls[fl.key]);
      const chip = fl.key === 'pistache' ? '#8FAE48' : fl.key === 'bueno' || fl.key === 'marbre' ? '#F1E6CF' : null;
      this.chips.forEach((c) => c.el.setAttribute('fill', chip || this.g.chip));
      this.lblSerial.textContent = `KOOKIE N°${KK.pad(this.serial)}`;
      this.lblSeed.textContent = `GRAINE ${seed.toString(16).toUpperCase().padStart(8, '0')}`;
      this.placeTxt.textContent = `n°${KK.pad(this.serial)} · ${fl.name}`;
      if (this.opts.onCycle) this.opts.onCycle(fl, this.serial, seed);
    }

    place() {
      const cur = this.cur;
      if (!cur || cur.placed) return;
      cur.placed = true;
      this.addToPlate(cur.plate, cur.fl, cur.seed, 1, cur.baked, cur.slot);
      KK.bake.release(cur.model, '3q', 256);
    }

    /* ======================================================================
       Rendu à l'instant t (temps du scénario)
       ====================================================================== */
    render(t) {
      const cur = this.cur, top = this.top, W = this.W, HOLD = KK.hands.HOLD;
      // points de prise au repos : les mains attendent hors champ, en haut
      const REST_R = [W / 2 - 18, top - 112], REST_L = [-W / 2 + 18, top - 112];
      const pl = PLATES[cur.plate];
      const [sdx, sdy] = SLOTS[cur.slot];
      const slotPos = [pl.x + sdx, plateY(pl) + sdy];

      // caméra : on s'attarde devant la vitrine avant de repartir au saladier
      const cam = kf(t, [[0, 0], [4.55, 0], [5.35, S, 'io'], [7.4, S], [8.2, 2 * S, 'io'], [11.2, 2 * S], [12.0, 3 * S, 'io'], [T_OUT, 3 * S], [CYCLE, 4 * S, 'io']]);
      this.worldG.setAttribute('transform', `translate(${f(-cam)} 0)`);
      this.wallG.setAttribute('transform', `translate(${f(-cam * 0.85)} 0)`);

      // ---------- saladier : farine, sucre, pépites, spatule, pâte ----------
      const flourP = sm(0.72, 1.15, t), sugarP = sm(1.7, 2.04, t);
      const mixed = sm(3.1, 3.7, t), gone = sm(12.0, 12.5, t);
      const flourS = flourP * (1 - mixed);
      this.flourG.setAttribute('transform', `translate(-24 ${RIM + 8}) scale(${f(Math.max(0.01, 0.4 + 0.6 * flourS))} ${f(Math.max(0.01, flourS))})`);
      this.flourG.setAttribute('opacity', f(Math.min(1, flourP * 3) * (1 - mixed)));
      const sugarS = sugarP * (1 - mixed);
      this.sugarG.setAttribute('transform', `translate(26 ${RIM + 9}) scale(${f(Math.max(0.01, 0.4 + 0.6 * sugarS))} ${f(Math.max(0.01, sugarS))})`);
      this.sugarG.setAttribute('opacity', f(Math.min(1, sugarP * 3) * (1 - mixed)));
      this.massG.setAttribute('transform', `translate(0 ${RIM + 12}) rotate(${f((1 - mixed) * 25)}) scale(${f(Math.max(0.01, 0.6 + 0.4 * mixed))} ${f(Math.max(0.01, mixed))})`);
      this.massG.setAttribute('opacity', f(mixed * (1 - gone)));
      const dent = sm(4.1, 4.2, t) * (1 - sm(4.4, 4.9, t));
      this.dent.setAttribute('cx', 6);
      this.dent.setAttribute('cy', f(RIM - 8));
      this.dent.setAttribute('opacity', f(dent));

      // ---------- mains : les clés donnent le point de prise (ce que tiennent les doigts) ----------
      const car = cur.carrier; // -1 : c'est la main de gauche qui porte le cookie cuit
      const handleX = (side) => this.ovenX - cam + (side < 0 ? -52 : 26);
      const handleY = (dr) => OVEN.hinge - (OVEN.doorH + 10) * dr;
      const door = kf(t, [[0, 1], [8.15, 1], [8.4, 0.12, 'out'], [8.8, 0.12], [9.05, 1, 'in'], [10.32, 1], [10.54, 0.12, 'out'], [10.95, 0.12], [11.15, 1, 'in']]);
      const OV = [OVEN.cookie[0], OVEN.cookie[1] - BALL_R + 4]; // la boule posée sur la plaque du four
      const OC = [OVEN.cookie[0], OVEN.cookie[1] - 14]; // on reprend le cookie cuit par le dessus

      let R = kf(t, [
        [0, REST_R],
        [0.5, [-40, RIM - 122]], [1.25, [-40, RIM - 122]], // doseur de farine
        [1.45, [10, RIM - 118]], [2.08, [10, RIM - 118]], // doseur de sucre
        [2.4, [W / 2 - 10, top - 120]], [2.75, [W / 2 - 10, top - 120]], // repose le doseur, prend la spatule
        [2.95, [10, RIM - 84]], [3.85, [10, RIM - 84]],
        [4.05, [6, RIM - 4]], [4.15, [6, RIM - 4]], // prélève une boule de pâte
        [4.55, [12, RIM - 110]], [5.35, [12, RIM - 110], 'sine'],
        [5.72, [0, BALL_Y]], [7.3, [0, BALL_Y]],
        [7.55, [0, CY - 140]], [8.2, [0, CY - 140]],
        [8.5, OV], [8.62, OV],
        [8.95, REST_R],
      ]);
      let L = kf(t, [[0, REST_L], [2.1, REST_L], [2.38, [18, RIM - 100], 'out'], [2.9, [24, RIM - 94]], [3.15, REST_L], [5.5, REST_L], [5.78, [-24, BALL_Y + 4], 'out'], [7.1, [-24, BALL_Y + 4]], [7.35, REST_L]]);
      let Rg = kf(t, [[0, 0.95], [3.85, 0.95], [3.95, 0], [4.05, 0], [4.18, 0.6], [5.66, 0.6], [5.76, 0.45], [7.2, 0.45], [7.32, 0.6], [8.55, 0.6], [8.65, 0], [CYCLE, 0]]);
      let Lg = kf(t, [[0, 0.3], [2.3, 0.6], [2.95, 0.55], [3.2, 0.3], [5.7, 0.45], [CYCLE, 0.3]]);
      if (t > 2.38 && t < 2.9) Lg = 0.52 + 0.08 * Math.sin((t - 2.38) * 34); // les doigts lâchent les pépites
      let Rtw = 0, Ltw = 0, Rmitt = false, Lmitt = false;

      // pétrissage : les deux mains, en coupe, roulent la boule
      let ballX = 0, bsx = 1, bsy = 1, spin = 0;
      if (t >= 5.7 && t < 7.35) {
        const w = sm(5.72, 5.9, t) * (1 - sm(7.05, 7.2, t)), ph = (t - 5.72) * TAU * 1.5;
        ballX = 3 * Math.sin(ph) * w;
        R = mixP(R, [ballX + 21 + 5 * Math.cos(ph), BALL_Y - 5 + 4 * Math.sin(ph)], w);
        L = mixP(L, [ballX - 21 - 5 * Math.cos(ph), BALL_Y - 5 - 4 * Math.sin(ph)], sm(5.78, 5.95, t) * (1 - sm(7.05, 7.2, t)));
        Rtw = 0.36 * w;
        Ltw = -0.36 * w;
        bsx = 1 + 0.06 * Math.sin(ph * 2) * w;
        bsy = 1 - 0.06 * Math.sin(ph * 2) * w;
        spin = (t - 5.72) * 140;
      }
      // mélange à la spatule
      if (t >= 2.95 && t < 3.85) {
        const ph = (t - 2.95) * TAU * 2;
        R = [10 + 16 * Math.cos(ph), RIM - 84 + 5 * Math.sin(ph)];
      }

      // four : une main ouvre la porte, l'autre y pose puis y reprend
      const helper = -car;
      const follow = (a0, a1, b0, b1, side) => {
        const hp = [handleX(side), handleY(1)];
        const rest = side > 0 ? REST_R : REST_L;
        if (t >= a0 && t < a1) return mixP(rest, hp, ease.outCubic(prog(t, a0, a1)));
        if (t >= a1 && t < b0) return [handleX(side), handleY(door)];
        if (t >= b0 && t < b1) return mixP(hp, rest, ease.inOutCubic(prog(t, b0, b1)));
        return null;
      };
      const fIn = follow(7.95, 8.15, 9.05, 9.3, -1);
      if (fIn) { L = fIn; Lg = 0.8; }
      const fOut = follow(10.1, 10.32, 11.15, 11.4, helper);
      if (fOut) {
        if (helper > 0) { R = fOut; Rg = 0.8; } else { L = fOut; Lg = 0.8; }
      }
      if (t >= 9.9 && t < 11.5) { if (helper > 0) Rmitt = true; else Lmitt = true; }
      // le porteur sort le cookie et le pose sur sa coupelle, sans croiser l'autre bras
      if (t >= 10.3) {
        const rest = car > 0 ? REST_R : REST_L;
        const slotGrip = [slotPos[0], slotPos[1] - 10];
        const c = kf(t, [[10.3, rest], [10.62, OC, 'out'], [10.72, OC], [11.02, [car * 30, CY - 118]], [12.0, [car * 40, CY - 124], 'sine'], [12.45, slotGrip], [12.9, rest]]);
        const cg = kf(t, [[10.3, 0], [10.66, 0], [10.74, 0.55], [12.42, 0.55], [12.5, 0], [CYCLE, 0]]);
        if (car > 0) { R = c; Rg = cg; } else { L = c; Lg = cg; }
      }
      const Rw = this.reach(this.handR, R[0], R[1], Rtw), Lw = this.reach(this.handL, L[0], L[1], Ltw);
      this.setHand(this.handR, Rw[0], Rw[1], Rg, Rmitt, Rtw);
      this.setHand(this.handL, Lw[0], Lw[1], Lg, Lmitt, Ltw);

      // ---------- accessoires tenus ----------
      const scoopOn = t < 2.4;
      this.scoop.setAttribute('display', scoopOn ? 'inline' : 'none');
      let lip = null;
      if (scoopOn) {
        const tilt = kf(t, [[0.5, 0], [0.68, -1.85], [1.12, -1.85], [1.3, 0], [1.5, 0], [1.66, -1.85], [2.0, -1.85], [2.12, 0]]);
        const rot = this.handR.rot, o = this.at(this.handR, 0, HOLD + 24);
        this.scoop.setAttribute('transform', `translate(${f(o[0])} ${f(o[1])}) rotate(${f(deg(rot))})`);
        this.scoopTilt.setAttribute('transform', `rotate(${f(deg(tilt))} 0 -24)`);
        this.scoopFill.setAttribute('opacity', t < 1.15 || (t > 1.4 && t < 2.0) ? 1 : 0);
        // lèvre basse du doseur (d'où tombe la farine), en coordonnées écran
        const ct = Math.cos(tilt), st = Math.sin(tilt);
        const lx = -17 * ct - 24 * st, ly = -17 * st + 24 * ct - 24;
        lip = [o[0] + lx * Math.cos(rot) - ly * Math.sin(rot), o[1] + lx * Math.sin(rot) + ly * Math.cos(rot)];
      }
      this.lip = lip;
      const spatOn = t >= 2.75 && t < 3.95;
      this.spatula.setAttribute('display', spatOn ? 'inline' : 'none');
      if (spatOn) {
        const pp = this.at(this.handR, 0, HOLD + 5);
        this.spatula.setAttribute('transform', `translate(${f(pp[0])} ${f(pp[1])}) rotate(${f(deg(this.handR.rot) - 8 + 10 * Math.sin((t - 2.95) * TAU * 2))})`);
      }

      // grains qui tombent du doseur (farine puis sucre)
      const windows = [{ a: 0.72, b: 1.15, sugar: false }, { a: 1.7, b: 2.04, sugar: true }];
      this.grains.forEach((gr, i) => {
        let shown = false;
        if (lip) {
          for (const wd of windows) {
            const te = wd.a + (i / this.grains.length) * (wd.b - wd.a) * 1.6;
            const age = t - te;
            if (te < wd.b && age > 0 && age < 0.45) {
              const x = lip[0] + ((i * 37) % 7) - 3 - age * 8, y = lip[1] + 3 + 520 * age * age;
              if (y < RIM + 4) {
                gr.setAttribute('cx', f(x));
                gr.setAttribute('cy', f(y));
                gr.setAttribute('r', wd.sugar ? 1.4 : 2.1);
                gr.setAttribute('opacity', wd.sugar ? 0.95 : 0.85);
                shown = true;
              }
            }
          }
        }
        if (!shown && gr._on !== false) gr.setAttribute('opacity', 0);
        gr._on = shown;
      });
      // nuages de farine
      this.puffs.forEach((p, i) => {
        const a = t - (0.8 + i * 0.07);
        if (i < 4 && a > 0 && a < 0.8) {
          p.setAttribute('cx', f(-24 + (i - 1.5) * 16 - cam));
          p.setAttribute('cy', f(RIM - 6 - a * 34));
          p.setAttribute('r', f(6 + a * 22));
          p.setAttribute('opacity', f(0.55 * (1 - a / 0.8)));
        } else if (i >= 4 && t > 3.0 && t < 3.8) {
          const b = (t - 3.0) * 2 + i;
          p.setAttribute('cx', f(Math.cos(b) * 30 - cam));
          p.setAttribute('cy', f(RIM - 8));
          p.setAttribute('r', 8);
          p.setAttribute('opacity', 0.25);
        } else p.setAttribute('opacity', 0);
      });
      // pépites parsemées par l'autre main, du bout des doigts
      this.chips.forEach((c) => {
        const a = t - c.t0;
        if (a < 0 || t > 3.7 || cam > 1) { c.el.setAttribute('opacity', 0); return; }
        const [fx, fy] = this.at(this.handL, 0, HOLD + 20);
        const land = Math.min(1, a / 0.34);
        const x = lerp(fx + c.tx * 0.2, c.tx, land), y = lerp(fy, c.ty, land * land);
        c.el.setAttribute('transform', `translate(${f(x - cam)} ${f(y)}) rotate(${f(c.rot + a * 200 * (1 - land))})`);
        c.el.setAttribute('opacity', f(1 - sm(3.2, 3.6, t)));
      });

      // ---------- la pâte : boule tenue, sur la planche, au four ----------
      let show = 'none', hx = 0, hy = 0;
      const gripR = this.at(this.handR, 0, HOLD);
      if (t >= 4.15 && t < 5.72) { show = 'ball'; [hx, hy] = gripR; }
      else if (t >= 5.72 && t < 7.3) { show = 'ball'; hx = ballX; hy = BALL_Y; }
      else if (t >= 7.3 && t < 8.62) { show = 'ball'; [hx, hy] = gripR; }
      else if (t >= 10.72 && t < T_PLACE) { show = 'cookie'; [hx, hy] = this.at(car > 0 ? this.handR : this.handL, 0, HOLD + 10); }
      this.ballG.setAttribute('display', show === 'ball' ? 'inline' : 'none');
      this.cookieHeldG.setAttribute('display', show === 'cookie' ? 'inline' : 'none');
      if (show === 'ball') {
        const lump = 1 - sm(5.8, 6.9, t);
        const grow = t < 4.3 ? ease.outBack(prog(t, 4.15, 4.3)) : 1;
        const wob = t < 5.72 ? 0.03 * Math.sin(t * 9) : 0;
        this.ballG.setAttribute('transform', `translate(${f(hx)} ${f(hy)}) rotate(${f(lump * 22)}) scale(${f(Math.max(0.01, grow * (1 + 0.22 * lump) * bsx + wob))} ${f(Math.max(0.01, grow * (1 - 0.18 * lump) * bsy - wob))})`);
        this.ballImg.setAttribute('transform', `rotate(${f(spin)})`);
      } else if (show === 'cookie') {
        this.cookieHeldG.setAttribute('transform', `translate(${f(hx)} ${f(hy)})`);
      }
      const onBoard = t >= 5.72 && t < 7.3;
      this.ballShadow.setAttribute('opacity', onBoard ? 1 : 0);
      if (onBoard) {
        this.ballShadow.setAttribute('cx', f(ballX + 3));
        this.ballShadow.setAttribute('cy', f(CY - 22));
      }
      // fil de pâte quand on prélève
      const spn = prog(t, 4.2, 4.5);
      if (spn > 0 && spn < 1) {
        this.doughString.setAttribute('d', `M6 ${RIM - 8}Q10 ${f(lerp(RIM - 8, hy + 18, 0.5))} ${f(hx + cam)} ${f(hy + 16)}`);
        this.doughString.setAttribute('stroke-width', f(lerp(10, 1.5, spn)));
        this.doughString.setAttribute('opacity', 1);
      } else this.doughString.setAttribute('opacity', 0);

      // ---------- four ----------
      this.door.setAttribute('transform', `translate(0 ${OVEN.hinge}) scale(1 ${f(door)}) translate(0 ${-OVEN.hinge})`);
      const heat = kf(t, [[0, 0], [9.05, 0], [9.5, 1, 'out'], [10.3, 1], [10.8, 0.3], [11.8, 0]]);
      this.heatLvl = heat;
      this.ovenLight.setAttribute('opacity', f(heat * 0.95));
      const hot = heat > 0.02 ? `rgb(${Math.round(lerp(58, 255, heat))},${Math.round(lerp(34, 110, heat))},${Math.round(lerp(48, 40, heat))})` : '#3A2230';
      this.elemTop.setAttribute('stroke', hot);
      this.elemBot.setAttribute('stroke', hot);
      const temp = t < 9.05 ? 20 : t < 11.1 ? Math.round(lerp(20, 180, ease.outCubic(prog(t, 9.05, 9.9)))) : Math.round(lerp(180, 20, prog(t, 11.1, CYCLE)));
      this.tempTxt.textContent = `${temp}°`;
      this.knob.setAttribute('transform', `translate(${this.ovenX + 80} ${CY - 120}) rotate(${f(((temp - 20) / 160) * 220)})`);
      const dingP = prog(t, 10.2, 10.7);
      this.ding.setAttribute('opacity', f(dingP > 0 && dingP < 1 ? Math.sin(dingP * Math.PI) : 0));
      this.bell.setAttribute('transform', `translate(${this.ovenX + 80} ${CY - 54}) rotate(${f(dingP > 0 && dingP < 1 ? Math.sin(dingP * 30) * 18 * (1 - dingP) : 0)})`);
      this.heat.setAttribute('opacity', f(heat * 0.7));
      if (heat > 0.05) {
        [-40, 0, 40].forEach((x0, i) => {
          const pts = [], ph = t * 6 + i * 1.9;
          for (let j = 0; j <= 6; j++) pts.push([this.ovenX + x0 + Math.sin(j * 1.1 + ph) * 4, CY - 158 - j * 9 - ((t * 24) % 9)]);
          this.heatPaths[i].setAttribute('d', KK.openPath(pts));
        });
      }
      const inOven = t >= 8.6 && t < 10.74;
      this.ovenCk.setAttribute('display', inOven ? 'inline' : 'none');
      if (inOven) {
        const b = prog(t, 9.3, 10.1), e = ease.inOutSine(b), cross = sm(0.25, 0.7, b);
        const ox = this.ovenX + OVEN.cookie[0], oy = OVEN.cookie[1];
        this.ovenBallG.setAttribute('transform', `translate(${f(ox)} ${f(oy - BALL_R + 4)}) scale(${f(lerp(1, 1.35, e))} ${f(lerp(1, 0.7, e))})`);
        this.ovenBallG.setAttribute('opacity', f(1 - cross));
        this.ovenCookieG.setAttribute('transform', `translate(${f(ox)} ${f(oy)}) scale(${f(lerp(0.75, 1, e))})`);
        this.ovenCookieG.setAttribute('opacity', f(cross));
      }

      // ---------- vitrine : on s'attarde, le cookie fume encore ----------
      const tp = prog(t, 12.5, 12.85);
      if (t >= 12.5 && t < T_OUT) {
        const x = this.vitrineX + clamp(slotPos[0], -W / 2 + 64, W / 2 - 64), y = plateY(pl) - 48;
        this.placeTag.setAttribute('opacity', f(Math.min(1, tp * 3) * (1 - prog(t, T_OUT - 0.4, T_OUT - 0.05))));
        this.placeTag.setAttribute('transform', `translate(${f(x)} ${f(y)}) scale(${f(Math.max(0.01, ease.outBack(tp)))})`);
      } else this.placeTag.setAttribute('opacity', 0);
      const stA = t - 12.6;
      if (stA > 0 && t < T_OUT) {
        const x0 = this.vitrineX + slotPos[0], y0 = slotPos[1] - 16;
        this.steamPaths.forEach((p, i) => {
          const pts = [], ph = t * 2.3 + i * 2.1, rise = (t * 8 + i * 4) % 8;
          for (let j = 0; j <= 6; j++) pts.push([x0 + (i - 1) * 8 + Math.sin(j * 0.9 + ph) * (1.5 + j * 0.9), y0 - j * 7 - rise]);
          p.setAttribute('d', KK.openPath(pts));
        });
        this.steam.setAttribute('opacity', f(0.6 * Math.min(1, stA * 1.5) * (1 - sm(T_OUT - 0.8, T_OUT, t))));
      } else this.steam.setAttribute('opacity', 0);

      // repères
      const phase = t < 4.55 ? '01 PÂTE' : t < 7.4 ? '02 BOULE ROULÉE' : t < 11.2 ? `03 FOUR ${temp}°C` : '04 EN VITRINE';
      if (phase !== this.lastPhase) { this.lblPhase.textContent = phase; this.lastPhase = phase; }
    }

    /* ---------- Boucle ---------- */
    tick(now) {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      const prev = this.t;
      this.t += (dt * this.speed) / PACE;
      if (prev < T_PLACE && this.t >= T_PLACE) this.place();
      let wrapped = false;
      if (this.t >= CYCLE) {
        this.t -= CYCLE;
        this.next();
        wrapped = true;
      }
      this.render(this.t);
      this.audio(prev, this.t, wrapped);
      this.raf = requestAnimationFrame(this.tick);
    }

    /* La bande-son, à mi-voix : les gestes passés depuis la dernière image, et le four qui ronronne */
    audio(prev, t, wrapped) {
      if (!this.snd) this.snd = KK.sfx.channel(0.85);
      const k = PACE / this.speed; // secondes réelles par seconde de scénario
      const fire = (a, b) => CUES.forEach(([ct, name, o]) => {
        if (ct <= a || ct > b) return;
        const opts = Object.assign({}, o);
        ['dur', 'span', 'per', 'gap'].forEach((key) => { if (opts[key] != null) opts[key] *= k; });
        this.snd.play(name, opts);
      });
      if (wrapped) { fire(prev, CYCLE); fire(-1, t); } else fire(prev, t);
      const heat = this.heatLvl || 0;
      if (heat > 0.02) {
        if (!this.hum) this.hum = this.snd.voice('hum');
        if (this.hum) this.hum.level(heat);
      } else if (this.hum) {
        this.hum.stop();
        this.hum = null;
      }
    }

    update() {
      const should = this.active && this.inView && !document.hidden;
      if (KK.reduced) return;
      if (should && !this.running) {
        this.running = true;
        this.last = performance.now();
        this.raf = requestAnimationFrame(this.tick);
      } else if (!should && this.running) {
        this.running = false;
        cancelAnimationFrame(this.raf);
        if (this.snd) this.snd.cut(); // on quitte l'atelier : silence net
        this.hum = null;
      }
    }

    setActive(on) {
      this.active = on;
      this.update();
    }

    bindInput() {
      const fast = (on) => {
        this.speed = on ? 3.4 : 1;
        this.host.classList.toggle('is-fast', on);
      };
      this.host.addEventListener('pointerdown', () => fast(true));
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => this.host.addEventListener(ev, () => fast(false)));
      this.host.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('visibilitychange', () => this.update());
    }

    observe() {
      if ('ResizeObserver' in window) new ResizeObserver(() => this.fit()).observe(this.stage);
      if (!('IntersectionObserver' in window)) return;
      new IntersectionObserver((entries) => {
        this.inView = entries[0].isIntersecting;
        this.update();
      }).observe(this.host);
    }
  }

  KK.Atelier = Atelier;
  KK.Atelier.CYCLE = CYCLE;
})();
