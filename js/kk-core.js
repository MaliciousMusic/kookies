/* ==========================================================================
   Kookies — noyau : hasard seedé, maths, couleurs, SVG, stockage, sons
   Scripts classiques (pas de modules) : le site s'ouvre aussi en file://
   ========================================================================== */
(function () {
  'use strict';

  const KK = (window.KK = window.KK || {});
  const SVGNS = 'http://www.w3.org/2000/svg';

  KK.reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ---------- Hasard déterministe (mulberry32) ---------- */
  KK.rng = function (seed) {
    let a = seed >>> 0;
    const r = function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (min, max) => min + r() * (max - min);
    r.int = (min, max) => Math.floor(min + r() * (max - min + 1));
    r.pick = (arr) => arr[Math.floor(r() * arr.length)];
    r.sign = () => (r() < 0.5 ? -1 : 1);
    return r;
  };

  /* FNV-1a : une chaîne → une graine */
  KK.hash = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  KK.newSeed = () => (Math.random() * 4294967296) >>> 0;

  /* Bruit simplex 2D seedé (Gustavson) → [-1, 1] */
  KK.noise2 = function (seed) {
    const r = KK.rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    const perm = new Uint8Array(512), pm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm[i] = perm[i] % 12; }
    const G = [1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1];
    const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    return function (xin, yin) {
      const s = (xin + yin) * F2;
      const i = Math.floor(xin + s), j = Math.floor(yin + s);
      const t = (i + j) * G2;
      const x0 = xin - i + t, y0 = yin - j + t;
      const i1 = x0 > y0 ? 1 : 0, j1 = 1 - i1;
      const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
      const ii = i & 255, jj = j & 255;
      let n = 0, tt, g;
      tt = 0.5 - x0 * x0 - y0 * y0;
      if (tt > 0) { g = pm[ii + perm[jj]] * 2; tt *= tt; n += tt * tt * (G[g] * x0 + G[g + 1] * y0); }
      tt = 0.5 - x1 * x1 - y1 * y1;
      if (tt > 0) { g = pm[ii + i1 + perm[jj + j1]] * 2; tt *= tt; n += tt * tt * (G[g] * x1 + G[g + 1] * y1); }
      tt = 0.5 - x2 * x2 - y2 * y2;
      if (tt > 0) { g = pm[ii + 1 + perm[jj + 1]] * 2; tt *= tt; n += tt * tt * (G[g] * x2 + G[g + 1] * y2); }
      return 70 * n;
    };
  };

  /* ---------- Maths ---------- */
  KK.clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  KK.lerp = (a, b, t) => a + (b - a) * t;
  KK.prog = (t, a, b) => KK.clamp((t - a) / (b - a)); // avancement de t dans [a, b]
  KK.TAU = Math.PI * 2;
  KK.angDiff = (a, b) => {
    let d = (a - b) % KK.TAU;
    if (d > Math.PI) d -= KK.TAU;
    if (d < -Math.PI) d += KK.TAU;
    return d;
  };

  KK.ease = {
    linear: (t) => t,
    inQuad: (t) => t * t,
    outQuad: (t) => 1 - (1 - t) * (1 - t),
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    outElastic: (t) =>
      t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  };

  /* ---------- Couleurs ---------- */
  KK.hex2rgb = (h) => {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  KK.rgb2hex = (r, g, b) =>
    '#' + [r, g, b].map((v) => Math.round(KK.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
  KK.mix = (a, b, t) => {
    const A = KK.hex2rgb(a), B = KK.hex2rgb(b);
    return KK.rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  };
  KK.shade = (c, amt) => (amt >= 0 ? KK.mix(c, '#ffffff', amt) : KK.mix(c, '#000000', -amt));

  /* ---------- SVG ---------- */
  KK.svg = function (tag, attrs, parent) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  };

  let uidCount = 0;
  KK.uid = (p) => (p || 'kk') + (++uidCount).toString(36);

  const f = (n) => Math.round(n * 100) / 100;
  KK.f = f;

  /* Catmull-Rom fermé → courbes de Bézier. tension 0 = polygone, 1 = lisse */
  KK.closedPath = function (pts, tension = 1) {
    const n = pts.length;
    if (n < 3) return '';
    const k = tension / 6;
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) * k) + ' ' + f(p1[1] + (p2[1] - p0[1]) * k) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) * k) + ' ' + f(p2[1] - (p3[1] - p1[1]) * k) + ' ' +
        f(p2[0]) + ' ' + f(p2[1]);
    }
    return d + 'Z';
  };

  /* Catmull-Rom ouvert (fissures, filets) */
  KK.openPath = function (pts) {
    const n = pts.length;
    if (n < 2) return '';
    let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      d += 'C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' +
        f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' +
        f(p2[0]) + ' ' + f(p2[1]);
    }
    return d;
  };

  /* ---------- Animation ---------- */
  KK.tween = (dur, fn, ease = KK.ease.linear) =>
    new Promise((resolve) => {
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.max(0, Math.min(1, (now - t0) / dur)); // (l'horodatage de l'image peut précéder t0)
        fn(ease(p), p);
        if (p < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  KK.wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Formats ---------- */
  const nfEUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  KK.fmtPrice = (n) => nfEUR.format(n);
  KK.pad = (n, l = 4) => String(n).padStart(l, '0');

  /* Heure de Paris, quel que soit le fuseau du visiteur */
  KK.parisNow = function () {
    try {
      return new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Paris' }));
    } catch (e) {
      return new Date();
    }
  };

  KK.vibrate = (ms) => {
    try {
      const ua = navigator.userActivation;
      if (navigator.vibrate && (!ua || ua.hasBeenActive)) navigator.vibrate(ms);
    } catch (e) { /* iOS : pas de vibration */ }
  };

  /* ---------- Stockage local (maquette ; en prod → base de données) ---------- */
  KK.store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('kk:' + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem('kk:' + k, JSON.stringify(v)); } catch (e) { /* navigation privée */ }
    },
    del(k) {
      try { localStorage.removeItem('kk:' + k); } catch (e) { /* idem */ }
    },
  };

  /* ---------- Petit bus d'événements ---------- */
  const listeners = {};
  KK.on = (ev, fn) => ((listeners[ev] = listeners[ev] || []).push(fn));
  KK.emit = (ev, data) => (listeners[ev] || []).forEach((fn) => fn(data));


  /* ---------- Sons : un sound design léger, synthétisé (WebAudio, aucun fichier) ----------
     Doux et discrets : ils ne démarrent qu'après un premier geste, suivent le mode
     silencieux de l'iPhone et se coupent d'un geste (haut-parleur de la barre du haut).
     KK.sfx.play('nom', { delay, gain, … })   son ponctuel (delay en ms)
     KK.sfx.channel(gain)                     sous-bus qu'on coupe net (la bande-son de l'atelier)
     Tout bouton ou lien sans son dédié fait un petit « toc » ; data-sfx="nom" en choisit un
     autre (data-sfx-i : sa note), data-sfx="none" le rend muet. */
  KK.sfx = (function () {
    const AC = window.AudioContext || window.webkitAudioContext;
    let ctx = null, bus = null, noiseBuf = null;
    let on = KK.store.get('sound', true);
    let gestureAt = -1e9, lastAny = -1e9;
    const lastBy = {};

    /* bus principal : volume général + limiteur doux */
    function makeBus(c) {
      const master = c.createGain();
      master.gain.value = 0.85;
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -14;
      lim.knee.value = 8;
      lim.ratio.value = 10;
      lim.attack.value = 0.002;
      lim.release.value = 0.12;
      master.connect(lim).connect(c.destination);
      return master;
    }

    /* déblocage : il faut un geste de l'utilisateur */
    function unlock() {
      gestureAt = performance.now();
      if (!on || !AC) return;
      if (!ctx) {
        try {
          // « ambient » : se mélange à la musique en cours et respecte le mode silencieux
          if (navigator.audioSession) navigator.audioSession.type = 'ambient';
        } catch (e) { /* API absente */ }
        try {
          ctx = new AC();
          bus = makeBus(ctx);
        } catch (e) {
          ctx = null;
          return;
        }
      }
      if (ctx.state !== 'running') {
        ctx.resume().catch(() => {});
        try {
          // iOS : un tampon muet joué pendant le geste ouvre la sortie audio
          const s = ctx.createBufferSource();
          s.buffer = ctx.createBuffer(1, 1, 22050);
          s.connect(ctx.destination);
          s.start(0);
        } catch (e) { /* rien */ }
      }
    }
    ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach((type) => {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    });
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!ctx) return;
        if (document.hidden) ctx.suspend().catch(() => {});
        else if (on) ctx.resume().catch(() => {});
      });
    }

    /* Tenter le son sans geste : certains navigateurs l'autorisent (appli installée sur Android,
       site déjà fréquenté sur ordinateur…). Résout vrai si le son peut partir maintenant. */
    function autoplay() {
      return new Promise((resolve) => {
        if (!on || !AC) return resolve(false);
        try {
          if (navigator.getAutoplayPolicy && navigator.getAutoplayPolicy('audiocontext') === 'disallowed') return resolve(false);
        } catch (e) { /* API absente */ }
        if (!ctx) {
          try {
            if (navigator.audioSession) navigator.audioSession.type = 'ambient';
          } catch (e) { /* API absente */ }
          try {
            ctx = new AC();
            bus = makeBus(ctx);
          } catch (e) {
            ctx = null;
            return resolve(false);
          }
        }
        if (ctx.state === 'running') return resolve(true);
        ctx.resume().then(() => resolve(ctx.state === 'running'), () => resolve(false));
        setTimeout(() => resolve(ctx.state === 'running'), 160); // refusé : on n'attend pas
      });
    }

    /* contexte utilisable maintenant (sinon rien : pas de sons en attente rejoués d'un coup) */
    function live() {
      if (!on || !ctx) return null;
      if (ctx.state === 'running') return ctx;
      if (ctx.state === 'suspended' && performance.now() - gestureAt < 400) return ctx;
      return null;
    }

    /* ---------- briques de synthèse ---------- */
    function noiseB(c) {
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      return noiseBuf;
    }
    // enveloppe : attaque courte (sans clic), tenue, puis extinction exponentielle
    function env(c, t, a, d, v, hold = 0) {
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + a);
      g.gain.setTargetAtTime(0, t + a + hold, d / 5);
      return g;
    }
    const tail = (t, a, d, hold = 0) => t + a + hold + d * 1.3 + 0.02;
    function tone(c, dst, t, { f, f2, glide, type = 'sine', a = 0.004, d = 0.15, v = 0.1, hold = 0 }) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (glide != null ? glide : a + d * 0.7));
      o.connect(env(c, t, a, d, v, hold)).connect(dst);
      o.start(t);
      o.stop(tail(t, a, d, hold));
    }
    function noise(c, dst, t, { f = 1200, f2, q = 0.8, type = 'bandpass', a = 0.004, d = 0.1, v = 0.08, hold = 0 }) {
      const src = c.createBufferSource();
      src.buffer = noiseB(c);
      src.loop = true;
      const flt = c.createBiquadFilter();
      flt.type = type;
      flt.Q.value = q;
      flt.frequency.setValueAtTime(f, t);
      if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + a + hold + d);
      src.connect(flt).connect(env(c, t, a, d, v, hold)).connect(dst);
      src.start(t, Math.random() * 1.5);
      src.stop(tail(t, a, d, hold));
    }
    // corps résonnants : [rapport de fréquence, niveau, durée relative]
    const BODY = {
      marimba: [[1, 1, 1], [3.93, 0.22, 0.28], [9.2, 0.05, 0.12]],
      wood: [[1, 1, 1], [2.45, 0.42, 0.5], [5.2, 0.12, 0.3]],
      bell: [[1, 1, 1], [2.76, 0.32, 0.55], [5.4, 0.12, 0.3], [8.93, 0.04, 0.18]],
      ceramic: [[1, 1, 1], [2.32, 0.5, 0.7], [4.25, 0.22, 0.45], [6.63, 0.1, 0.3]],
      metal: [[1, 1, 1], [2.1, 0.55, 0.8], [3.7, 0.3, 0.6], [5.9, 0.14, 0.4]],
    };
    function strike(c, dst, t, f, body, { d = 0.3, v = 0.1, a = 0.002 } = {}) {
      BODY[body].forEach(([r, amp, dk]) => {
        if (f * r < 15000) tone(c, dst, t, { f: f * r, a, d: d * dk, v: v * amp });
      });
    }
    const PENTA = [0, 2, 4, 7, 9];
    const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const penta = (i, base = 72) => midi(base + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5]);
    const rnd = (a, b) => a + Math.random() * (b - a);

    /* ---------- la palette (registre médium-aigu : les haut-parleurs de téléphone
       ne rendent presque rien sous 300 Hz) ---------- */
    const SOUNDS = {
      // --- l'appli
      tap(c, o, t) { // bouton quelconque : petit « toc » feutré
        tone(c, o, t, { f: 820, f2: 560, a: 0.003, d: 0.07, v: 0.075 });
        tone(c, o, t, { f: 1640, a: 0.002, d: 0.03, v: 0.016 });
      },
      tab(c, o, t, { i = 0 }) { // onglets : une bulle dont la note monte vers la droite
        const f = penta(i + 2, 72);
        tone(c, o, t, { f: f * 0.72, f2: f, glide: 0.035, a: 0.004, d: 0.16, v: 0.095 });
        tone(c, o, t + 0.01, { f: f * 2, a: 0.003, d: 0.05, v: 0.016 });
      },
      chip(c, o, t, { i = 0 }) { // filtres de la carte : lames de marimba
        strike(c, o, t, penta(i + 1, 74), 'marimba', { d: 0.24, v: 0.065 });
      },
      on(c, o, t) {
        strike(c, o, t, midi(79), 'marimba', { d: 0.22, v: 0.08 });
        strike(c, o, t + 0.065, midi(84), 'marimba', { d: 0.3, v: 0.09 });
      },
      open(c, o, t) { noise(c, o, t, { f: 380, f2: 1600, q: 0.9, a: 0.06, d: 0.18, v: 0.09 }); },
      close(c, o, t) { noise(c, o, t, { f: 1400, f2: 380, q: 0.9, a: 0.02, d: 0.15, v: 0.06 }); },
      flap(c, o, t, { v = 0.04 }) { // une palette de l'horloge qui retombe
        noise(c, o, t, { f: 3000, q: 1.5, a: 0.001, d: 0.014, v });
        tone(c, o, t, { f: rnd(1850, 2150), a: 0.001, d: 0.012, v: v * 0.35 });
      },
      neon(c, o, t) { // le néon s'allume : quelques tics, puis un bourdonnement qui s'éteint
        [0, 0.09, 0.2, 0.34].forEach((dt, k) => {
          noise(c, o, t + dt, { f: 4200, q: 1.4, a: 0.001, d: 0.012, v: 0.03 });
          if (k > 1) tone(c, o, t + dt, { f: 240, type: 'sawtooth', a: 0.004, d: 0.05, v: 0.006 });
        });
        tone(c, o, t + 0.42, { f: 240, type: 'sawtooth', a: 0.03, d: 0.7, v: 0.006, hold: 0.2 });
        noise(c, o, t + 0.42, { f: 2200, q: 3, a: 0.03, d: 0.6, v: 0.012, hold: 0.15 });
      },
      pop(c, o, t) { tone(c, o, t, { f: 520, f2: 1080, glide: 0.05, a: 0.003, d: 0.08, v: 0.09 }); },
      up(c, o, t) { tone(c, o, t, { f: 900, f2: 1200, glide: 0.03, a: 0.002, d: 0.04, v: 0.05 }); },
      down(c, o, t) { tone(c, o, t, { f: 1100, f2: 820, glide: 0.03, a: 0.002, d: 0.04, v: 0.05 }); },
      add(c, o, t) { // le Kookie tombe dans le sac en papier
        noise(c, o, t, { f: 2600, q: 0.9, a: 0.004, d: 0.05, v: 0.055 });
        strike(c, o, t + 0.04, 300, 'wood', { d: 0.07, v: 0.07 });
        noise(c, o, t + 0.06, { f: 3400, q: 1.1, a: 0.004, d: 0.09, v: 0.035 });
      },
      crunch(c, o, t, { power = 1 }) { // croc ! grains de biscuit + petit choc
        const n = 6 + Math.floor(Math.random() * 5);
        let tt = t;
        for (let k = 0; k < n; k++) {
          tt += 0.008 + Math.random() * 0.022;
          noise(c, o, tt, { f: rnd(1400, 5000), q: rnd(0.9, 3.1), a: 0.002, d: rnd(0.03, 0.08), v: rnd(0.08, 0.16) * power });
        }
        tone(c, o, t, { f: 320, f2: 130, glide: 0.09, a: 0.004, d: 0.11, v: 0.11 * power });
      },
      stamp(c, o, t) { // coup de tampon : « tchac ! »
        noise(c, o, t, { f: 1700, q: 0.8, a: 0.002, d: 0.07, v: 0.16 });
        strike(c, o, t, 380, 'wood', { d: 0.1, v: 0.15 });
        tone(c, o, t, { f: 300, f2: 110, glide: 0.12, a: 0.003, d: 0.14, v: 0.12 });
      },
      ding(c, o, t) { // « c'est réservé »
        strike(c, o, t, midi(84), 'bell', { d: 0.7, v: 0.07 });
        strike(c, o, t + 0.11, midi(91), 'bell', { d: 0.9, v: 0.06 });
      },
      chime(c, o, t) { // carte pleine, Kookie offert
        [72, 76, 79, 84, 88].forEach((m, k) => strike(c, o, t + k * 0.085, midi(m), k % 2 ? 'bell' : 'marimba', { d: k === 4 ? 1.1 : 0.45, v: 0.075 }));
        for (let k = 0; k < 6; k++) strike(c, o, t + 0.5 + Math.random() * 1.0, rnd(2200, 4200), 'bell', { d: 0.25, v: 0.012 });
      },
      key(c, o, t) { // touche du pavé
        tone(c, o, t, { f: 1050, a: 0.002, d: 0.035, v: 0.055 });
        noise(c, o, t, { f: 4200, type: 'highpass', a: 0.001, d: 0.01, v: 0.01 });
      },
      nope(c, o, t) {
        tone(c, o, t, { f: 466, f2: 440, type: 'triangle', a: 0.005, d: 0.08, v: 0.09 });
        tone(c, o, t + 0.13, { f: 415, f2: 392, type: 'triangle', a: 0.005, d: 0.1, v: 0.09 });
      },
      yes(c, o, t) {
        strike(c, o, t, midi(79), 'bell', { d: 0.35, v: 0.06 });
        strike(c, o, t + 0.075, midi(86), 'bell', { d: 0.5, v: 0.06 });
      },
      flick(c, o, t) { noise(c, o, t, { f: 700, f2: 3000, q: 0.8, a: 0.03, d: 0.12, v: 0.08 }); }, // une carte jetée
      flip(c, o, t) { // la carte fidélité se retourne
        noise(c, o, t, { f: 500, f2: 2200, q: 0.7, a: 0.08, d: 0.2, v: 0.06 });
        strike(c, o, t + 0.3, 520, 'wood', { d: 0.05, v: 0.045 });
      },
      like(c, o, t) {
        tone(c, o, t, { f: 620, f2: 1240, glide: 0.05, a: 0.003, d: 0.08, v: 0.085 });
        strike(c, o, t + 0.06, midi(96), 'bell', { d: 0.25, v: 0.02 });
      },

      // --- l'ouverture : chaque lettre du logo a sa note
      letter(c, o, t, { m = 72 }) {
        strike(c, o, t, midi(m), 'marimba', { d: 0.36, v: 0.1 });
        strike(c, o, t, midi(m + 12), 'bell', { d: 0.22, v: 0.016 });
        tone(c, o, t, { f: midi(m) * 0.5, f2: midi(m), glide: 0.04, a: 0.003, d: 0.05, v: 0.022 }); // le petit « pop »
      },
      dot(c, o, t) { strike(c, o, t, midi(96), 'bell', { d: 0.14, v: 0.022 }); }, // le point du i
      chord(c, o, t) { // le logo est complet : accord qui scintille
        [72, 76, 79, 84].forEach((m) => strike(c, o, t, midi(m), 'marimba', { d: 0.9, v: 0.06 }));
        strike(c, o, t, midi(84), 'bell', { d: 1.2, v: 0.04 });
        [88, 91, 96].forEach((m, k) => strike(c, o, t + 0.07 + k * 0.05, midi(m), 'bell', { d: 0.5, v: 0.018 }));
      },

      // --- l'atelier (joué par sa propre chaîne, à mi-voix)
      pour(c, o, t, { dur = 0.6 }) { // la farine glisse du doseur, « pouf » dans le saladier
        noise(c, o, t, { f: 1100, f2: 700, q: 0.6, a: 0.09, d: 0.25, v: 0.06, hold: dur });
        noise(c, o, t + 0.12, { f: 320, type: 'lowpass', q: 0.6, a: 0.05, d: 0.35, v: 0.06, hold: dur * 0.6 });
      },
      sugar(c, o, t, { dur = 0.4 }) { // les cristaux de sucre crépitent
        noise(c, o, t, { f: 5200, type: 'highpass', q: 0.6, a: 0.05, d: 0.15, v: 0.03, hold: dur });
        for (let k = 0; k < 14; k++) tone(c, o, t + Math.random() * dur, { f: rnd(3500, 6500), a: 0.001, d: 0.008, v: 0.01 });
      },
      drops(c, o, t, { n = 7, span = 0.6 }) { // les pépites tombent dans la farine
        for (let k = 0; k < n; k++) strike(c, o, t + (k / n) * span + Math.random() * 0.04, rnd(900, 1500), 'wood', { d: 0.035, v: rnd(0.018, 0.032) });
      },
      stir(c, o, t, { n = 2, per = 0.7 }) { // la spatule tourne dans la pâte
        for (let k = 0; k < n; k++) noise(c, o, t + k * per, { f: 600, f2: 1200, q: 0.7, a: per * 0.3, d: per * 0.45, v: 0.045 });
      },
      pluck(c, o, t) { // on prélève une boule de pâte
        tone(c, o, t, { f: 420, f2: 230, glide: 0.1, a: 0.01, d: 0.12, v: 0.045 });
        noise(c, o, t, { f: 800, type: 'lowpass', q: 0.7, a: 0.01, d: 0.12, v: 0.045 });
      },
      pat(c, o, t) { // la boule posée sur la planche
        strike(c, o, t, 340, 'wood', { d: 0.07, v: 0.055 });
        noise(c, o, t, { f: 700, type: 'lowpass', q: 0.6, a: 0.003, d: 0.06, v: 0.05 });
      },
      roll(c, o, t, { n = 3, per = 0.5 }) { // les paumes roulent la boule
        for (let k = 0; k < n; k++) noise(c, o, t + k * per, { f: 900, f2: 600, q: 0.6, a: per * 0.35, d: per * 0.4, v: 0.03 });
      },
      door(c, o, t) { // la porte du four s'ouvre : déclic, grincement léger
        strike(c, o, t, 480, 'metal', { d: 0.12, v: 0.045 });
        tone(c, o, t + 0.04, { f: 640, f2: 520, glide: 0.25, type: 'triangle', a: 0.05, d: 0.2, v: 0.012 });
        noise(c, o, t, { f: 900, f2: 1500, q: 0.8, a: 0.05, d: 0.2, v: 0.035 });
      },
      shut(c, o, t) { // et se referme
        strike(c, o, t, 380, 'metal', { d: 0.14, v: 0.06 });
        noise(c, o, t, { f: 600, type: 'lowpass', q: 0.7, a: 0.002, d: 0.08, v: 0.07 });
      },
      tray(c, o, t) { strike(c, o, t, 820, 'metal', { d: 0.16, v: 0.03 }); }, // sur la plaque du four
      knob(c, o, t, { n = 6, gap = 0.08 }) { // le bouton du thermostat tourne, cran par cran
        for (let k = 0; k < n; k++) tone(c, o, t + k * gap, { f: 2400 + k * 60, a: 0.001, d: 0.012, v: 0.022 });
      },
      timer(c, o, t) { // la minuterie : « ding ! »
        strike(c, o, t, midi(88), 'bell', { d: 1.1, v: 0.055 });
        strike(c, o, t + 0.005, midi(95), 'bell', { d: 0.6, v: 0.014 });
      },
      place(c, o, t) { // le cookie sur sa coupelle
        strike(c, o, t, 1500, 'ceramic', { d: 0.12, v: 0.035 });
        noise(c, o, t, { f: 500, type: 'lowpass', q: 0.6, a: 0.003, d: 0.05, v: 0.035 });
      },
      tag(c, o, t) { tone(c, o, t, { f: midi(84) * 0.8, f2: midi(84), glide: 0.03, a: 0.004, d: 0.08, v: 0.03 }); },
      pan(c, o, t, { dur = 0.8 }) { noise(c, o, t, { f: 300, f2: 900, q: 0.5, a: dur * 0.45, d: dur * 0.5, v: 0.015 }); }, // la caméra glisse
    };
    // sons qui peuvent légitimement se répéter vite (sinon : 50 ms minimum entre deux identiques)
    const GAP = { flap: 0, key: 0, crunch: 40, drops: 0, pan: 0, open: 150, close: 150 };

    /* voix continue : le four qui ronronne, réglée par sa chaleur (0..1) */
    const VOICES = {
      hum(c, dst) {
        const src = c.createBufferSource();
        src.buffer = noiseB(c);
        src.loop = true;
        const bp = c.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 420;
        bp.Q.value = 0.9;
        const g = c.createGain();
        g.gain.value = 0;
        const o1 = c.createOscillator(), g1 = c.createGain();
        o1.frequency.value = 330;
        g1.gain.value = 0.18;
        src.connect(bp).connect(g);
        o1.connect(g1).connect(g);
        g.connect(dst);
        src.start(c.currentTime, Math.random());
        o1.start();
        let lvl = -1, stopped = false;
        return {
          level(x) {
            x = Math.max(0, Math.min(1, x));
            if (Math.abs(x - lvl) < 0.02) return;
            lvl = x;
            g.gain.setTargetAtTime(0.045 * x, c.currentTime, 0.15);
          },
          stop() {
            if (stopped) return;
            stopped = true;
            g.gain.setTargetAtTime(0, c.currentTime, 0.08);
            src.stop(c.currentTime + 0.6);
            o1.stop(c.currentTime + 0.6);
          },
        };
      },
    };

    function emit(name, opts, dst) {
      lastAny = performance.now();
      const c = live(), fn = SOUNDS[name];
      if (!c || !fn || !dst) return;
      const now = performance.now();
      if (!(opts.delay > 0) && now - (lastBy[name] || -1e9) < (GAP[name] != null ? GAP[name] : 50)) return;
      lastBy[name] = now;
      if (window.KK_SFX_LOG) window.KK_SFX_LOG.push(name); // test : liste des sons joués
      let out = dst;
      if (opts.gain != null) {
        out = c.createGain();
        out.gain.value = opts.gain;
        out.connect(dst);
      }
      try {
        fn(c, out, c.currentTime + 0.005 + Math.max(0, opts.delay || 0) / 1000, opts);
      } catch (e) { /* audio indisponible */ }
    }
    const play = (name, opts = {}) => emit(name, opts, bus);

    /* sous-bus qu'on peut couper net (l'atelier qu'on quitte) */
    function channel(gain = 1) {
      let node = null;
      const voices = new Set();
      const get = () => {
        const c = live();
        if (!c) return null;
        if (!node) {
          node = c.createGain();
          node.gain.value = gain;
          node.connect(bus);
        }
        return node;
      };
      return {
        play(name, opts = {}) { emit(name, opts, get()); },
        voice(name) {
          const dst = get();
          if (!dst || !VOICES[name]) return null;
          const v = VOICES[name](ctx, dst);
          voices.add(v);
          return v;
        },
        cut() {
          voices.forEach((v) => v.stop());
          voices.clear();
          if (!node) return;
          const n = node;
          node = null;
          n.gain.setTargetAtTime(0, n.context.currentTime, 0.03);
          setTimeout(() => n.disconnect(), 400);
        },
      };
    }

    /* « toc » par défaut : un clic sur un bouton ou un lien qui n'a pas joué de son dédié */
    let dispatchAt = 0;
    window.addEventListener('click', () => { dispatchAt = performance.now(); }, true);
    window.addEventListener('click', (e) => {
      if (lastAny >= dispatchAt) return;
      const el = e.target.closest && e.target.closest('button, a[href], summary, [role="button"], [data-sfx]');
      if (!el || el.disabled) return;
      const s = el.closest('[data-sfx]');
      const name = s ? s.dataset.sfx : 'tap';
      if (name !== 'none') play(name, { i: s && s.dataset.sfxI ? +s.dataset.sfxI : 0 });
    });

    /* latence de sortie estimée (s) : pour caler une animation sur un son */
    const latency = () => (ctx ? (ctx.outputLatency || ctx.baseLatency || 0) + 0.005 : 0);

    return {
      play, channel, unlock, latency, autoplay,
      supported: !!AC,
      crunch: (power = 1) => play('crunch', { power }),
      pop: () => play('pop'),
      stamp: () => play('stamp'),
      ding: () => play('ding'),
      tick: () => play('key'),
      nope: () => play('nope'),
      flick: () => play('flick'),
      get on() { return on; },
      set on(v) {
        on = !!v;
        KK.store.set('sound', on);
        if (on) unlock();
        else if (ctx) ctx.suspend().catch(() => {});
      },
    };
  })();
})();
