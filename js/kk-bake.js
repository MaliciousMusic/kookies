/* ==========================================================================
   Kookies — le four réaliste
   Tout est calculé pixel par pixel dans un canvas, puis posé dans le SVG :
   1. carte de hauteur : cookie épais (mont + bosses arrondies + creux),
      pépites, toppings (Kinder Country, crème et barre Bueno, pâte de
      pistache), éclats, sucre glace ;
   2. couleurs : dorure, sommets qui brunissent, creux plus pâles, bords
      caramélisés, marbrure cacao, chocolat, fourrages ;
   3. lumière : normales, diffus chaud, reflets (chocolat, sucre, nappages),
      ombre dans les creux ;
   4. vue 3/4 : la carte de hauteur est projetée (colonne par colonne) pour
      montrer l'épaisseur des cookies dans l'atelier.
   Le calcul part en arrière-plan, dans des workers (plusieurs cœurs, fil
   principal libre) ; sinon il est découpé en tranches (~7 ms) sur la page.
   ========================================================================== */
(function () {
  'use strict';

  const KK = window.KK;
  const IN_WORKER = typeof document === 'undefined'; // chargé par kk-worker.js
  const TAU = Math.PI * 2;
  const EXT = 1.16; // la texture couvre [-EXT, EXT]² (en rayons de cookie)
  KK.BAKE_EXT = EXT;
  const G3 = { s: 0.62, c: 0.78, hmax: 1.2 }; // vue 3/4 : profondeur écrasée, part de la hauteur
  KK.G3Q = G3;

  const PAL = {
    // crumb : la mie à cœur ; pore : ses zones plus fondantes (pas des trous)
    golden: {
      top: [234, 172, 80], mid: [214, 146, 54], edge: [150, 88, 24], crev: [246, 212, 142], peak: [172, 100, 26],
      raw: [238, 200, 142], raw2: [220, 176, 118], crumb: [228, 190, 128], pore: [204, 158, 96],
    },
    cocoa: {
      top: [114, 74, 54], mid: [96, 62, 44], edge: [62, 38, 26], crev: [146, 104, 80], peak: [72, 45, 31],
      raw: [132, 88, 64], raw2: [112, 72, 52], crumb: [122, 80, 58], pore: [98, 62, 44],
    },
    pale: {
      top: [228, 194, 126], mid: [214, 174, 104], edge: [164, 120, 62], crev: [242, 220, 170], peak: [186, 142, 78],
      raw: [240, 212, 158], raw2: [224, 190, 134], crumb: [236, 204, 150], pore: [214, 178, 120],
    },
    // pâte blonde, entre la dorée et la pâle (le Poire chocolat)
    blond: {
      top: [236, 190, 108], mid: [222, 164, 80], edge: [166, 104, 40], crev: [246, 218, 160], peak: [184, 120, 50],
      raw: [240, 208, 152], raw2: [224, 186, 128], crumb: [234, 198, 140], pore: [212, 170, 110],
    },
  };
  const SWIRL = { top: [104, 64, 44], edge: [60, 36, 24], raw: [122, 78, 54] };

  // couleur, couleur 2, force spéculaire, brillance, relief
  const MAT = {
    dark: [[50, 29, 20], [28, 16, 10], 0.62, 48, 0.034],
    milk: [[112, 70, 46], [84, 50, 32], 0.52, 40, 0.03],
    white: [[246, 236, 212], [222, 204, 172], 0.36, 30, 0.034],
    caramel: [[214, 128, 42], [242, 172, 82], 0.9, 72, 0.012],
    pecan: [[122, 58, 26], [170, 100, 54], 0.2, 22, 0.05],
    pistachio: [[128, 158, 58], [96, 124, 42], 0.12, 16, 0.024],
    raspberry: [[196, 52, 84], [238, 120, 148], 0.14, 16, 0.02],
    pear: [[176, 92, 24], [234, 146, 54], 0.5, 36, 0.032], // dé de poire caramélisée : bord ambré, cœur orangé
    salt: [[252, 252, 248], [232, 232, 226], 1.1, 90, 0.016],
  };

  const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sdRoundBox = (px, py, hx, hy, r) => {
    const qx = Math.abs(px) - hx + r, qy = Math.abs(py) - hy + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  };

  /* Bruit cellulaire (Worley) : F1, F2 et identifiant de cellule */
  function makeWorley(seed) {
    const s = seed | 0;
    const hash = (i, j) => {
      let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + s) | 0;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      h ^= h >>> 16;
      return (h >>> 0) / 4294967296;
    };
    const out = { f1: 0, f2: 0, id: 0 };
    out.at = function (x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      let f1 = 9, f2 = 9, id = 0;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const cx = xi + di, cy = yi + dj;
          const h1 = hash(cx, cy), h2 = hash(cx + 7919, cy - 1049);
          const dx = cx + 0.1 + h1 * 0.8 - x, dy = cy + 0.1 + h2 * 0.8 - y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < f1) { f2 = f1; f1 = d; id = h1; } else if (d < f2) f2 = d;
        }
      }
      out.f1 = f1; out.f2 = f2; out.id = id;
    };
    return out;
  }

  /* Pépites : forme polygonale adoucie, orientation, matière */
  function prepChunks(model, scale, sizeMul) {
    const list = (model.chunks || []).map((c, i) => {
      const r = KK.rng((model.seed ^ (i * 2654435761)) >>> 0);
      const dice = c.kind === 'pear'; // dés de poire : carrés aux coins adoucis (voir chunkDist)
      const nv = 7, verts = new Float32Array(nv);
      for (let k = 0; k < nv; k++) verts[k] = r.range(0.74, 1.12);
      const rot = r.range(0, TAU);
      return {
        x: (c.x / 100) * scale, y: (c.y / 100) * scale, s: (c.size / 100) * scale * sizeMul,
        verts, nv, cr: Math.cos(rot), sr: Math.sin(rot), kind: c.kind, M: MAT[c.kind] || MAT.dark, top: !!c.top,
        elong: c.kind === 'pecan' ? 1.85 : r.range(1, 1.3), off: r.range(0, 90),
        dice, ar: dice ? r.range(0.8, 1.2) : 1,
      };
    });
    (model.sprinkles || []).forEach((s, i) => {
      if (s.kind !== 'salt') return;
      const r = KK.rng((model.seed ^ (i * 40503 + 7)) >>> 0);
      const verts = new Float32Array(5);
      for (let k = 0; k < 5; k++) verts[k] = r.range(0.6, 1.15);
      const rot = r.range(0, TAU);
      list.push({
        x: (s.x / 100) * scale, y: (s.y / 100) * scale, s: r.range(0.012, 0.022) * scale, verts, nv: 5,
        cr: Math.cos(rot), sr: Math.sin(rot), kind: 'salt', M: MAT.salt, elong: 1.2, off: 0, top: true,
      });
    });
    return list;
  }

  function gridOf(chunks, GN, E) {
    const cells = Array.from({ length: GN * GN }, () => []);
    const cs = (2 * E) / GN;
    chunks.forEach((k, idx) => {
      const br = k.s * 1.35 * Math.max(1, k.elong);
      const x0 = Math.max(0, Math.floor((k.x - br + E) / cs)), x1 = Math.min(GN - 1, Math.floor((k.x + br + E) / cs));
      const y0 = Math.max(0, Math.floor((k.y - br + E) / cs)), y1 = Math.min(GN - 1, Math.floor((k.y + br + E) / cs));
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) cells[gy * GN + gx].push(idx);
    });
    return { cells, cs, GN };
  }

  /* Filets de chocolat (capsules) rangés dans une grille : chaque pixel ne teste que ses voisins */
  function capsGrid(segs, GN, E) {
    const cells = Array.from({ length: GN * GN }, () => []);
    const cs = (2 * E) / GN;
    const list = segs.map(([ax, ay, bx, by, wa, wb]) => ({ ax, ay, dx: bx - ax, dy: by - ay, wa, dw: wb - wa, l2: (bx - ax) ** 2 + (by - ay) ** 2 || 1e-9 }));
    list.forEach((s, idx) => {
      const w = Math.max(s.wa, s.wa + s.dw) * 1.15;
      const x0 = Math.max(0, Math.floor((Math.min(s.ax, s.ax + s.dx) - w + E) / cs)), x1 = Math.min(GN - 1, Math.floor((Math.max(s.ax, s.ax + s.dx) + w + E) / cs));
      const y0 = Math.max(0, Math.floor((Math.min(s.ay, s.ay + s.dy) - w + E) / cs)), y1 = Math.min(GN - 1, Math.floor((Math.max(s.ay, s.ay + s.dy) + w + E) / cs));
      for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) cells[gy * GN + gx].push(idx);
    });
    return { cells, cs, GN, list, E };
  }

  // distance au filet le plus proche, en demi-largeurs (< 1 : dans le chocolat) ; capsW : sa demi-largeur
  let capsW = 0;
  function capsDist(G, x, y) {
    const gx = Math.floor((x + G.E) / G.cs), gy = Math.floor((y + G.E) / G.cs);
    if (gx < 0 || gy < 0 || gx >= G.GN || gy >= G.GN) return 9;
    const cell = G.cells[gy * G.GN + gx];
    let best = 9;
    for (let c = 0; c < cell.length; c++) {
      const s = G.list[cell[c]];
      let t = ((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const w = s.wa + s.dw * t, ex = x - s.ax - s.dx * t, ey = y - s.ay - s.dy * t;
      const d = Math.sqrt(ex * ex + ey * ey) / w;
      if (d < best) { best = d; capsW = w; }
    }
    return best;
  }

  let chunkAx = 0;
  function chunkDist(k, x, y) {
    const dx = x - k.x, dy = y - k.y;
    const ax = (dx * k.cr + dy * k.sr) / k.elong, ay = -dx * k.sr + dy * k.cr;
    if (k.dice) {
      // dé : super-ellipse (carré aux coins ronds)
      const qx = Math.abs(ax) / k.s, qy = (Math.abs(ay) * k.ar) / k.s;
      const d = Math.sqrt(Math.sqrt(qx * qx * qx * qx + qy * qy * qy * qy)) / 0.9;
      if (d > 1.4) return 9;
      chunkAx = ax / k.s;
      return d;
    }
    const dist = Math.sqrt(ax * ax + ay * ay) / k.s;
    if (dist > 1.4) return 9;
    chunkAx = ax / k.s;
    const f = ((Math.atan2(ay, ax) + Math.PI) / TAU) * k.nv;
    const i0 = Math.floor(f) % k.nv, t = f - Math.floor(f);
    const rad = k.verts[i0] + (k.verts[(i0 + 1) % k.nv] - k.verts[i0]) * t;
    return dist / rad;
  }

  /* ---------- Découpage en tranches ---------- */
  function nextFrame() {
    if (document.hidden) {
      return new Promise((r) => {
        const ch = new MessageChannel();
        ch.port1.onmessage = () => r();
        ch.port2.postMessage(0);
      });
    }
    // image suivante… ou minuterie si la fenêtre ne se redessine pas (fenêtre masquée, iframe hors écran)
    return new Promise((r) => {
      let done = false;
      const go = () => { if (!done) { done = true; r(); } };
      requestAnimationFrame(go);
      setTimeout(go, 40);
    });
  }

  async function sliced(n, fn) {
    if (IN_WORKER) { // en arrière-plan : d'une traite, rien à ménager
      for (let y = 0; y < n; y++) fn(y);
      return;
    }
    let y = 0;
    while (y < n) {
      const t0 = performance.now();
      while (y < n && performance.now() - t0 < api.budget) fn(y++);
      if (y < n) await nextFrame();
    }
  }

  function boxBlur(src, W, H, rad) {
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    const w = 2 * rad + 1;
    for (let y = 0; y < H; y++) {
      let acc = 0;
      const row = y * W;
      for (let x = -rad; x <= rad; x++) acc += src[row + Math.min(W - 1, Math.max(0, x))];
      for (let x = 0; x < W; x++) {
        tmp[row + x] = acc / w;
        acc += src[row + Math.min(W - 1, x + rad + 1)] - src[row + Math.max(0, x - rad)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -rad; y <= rad; y++) acc += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
      for (let y = 0; y < H; y++) {
        out[y * W + x] = acc / w;
        acc += tmp[Math.min(H - 1, y + rad + 1) * W + x] - tmp[Math.max(0, y - rad) * W + x];
      }
    }
    return out;
  }

  function newFields(W, H) {
    const n = W * H;
    return {
      W, H, h: new Float32Array(n), a: new Float32Array(n), r: new Float32Array(n), g: new Float32Array(n), b: new Float32Array(n),
      sp: new Float32Array(n), sh: new Float32Array(n), dm: new Float32Array(n),
    };
  }

  /* ======================================================================
     Champs d'un cookie (vue de dessus)
     ====================================================================== */
  async function cookieFields(model, stage, N, opts = {}) {
    const ball = stage === 'ball', interior = stage === 'interior', mass = stage === 'mass';
    const skip = opts.skipTops || [];
    const E = ball || mass ? EXT : model.ext || EXT;
    const Rpx = N / (2 * E);
    const F = newFields(N, N);
    const look = model.look || {};
    const P = PAL[look.dough || 'golden'];
    const seed = model.seed >>> 0;
    const nA = KK.noise2(seed ^ 0x9e3779b9), nB = KK.noise2(seed ^ 0x51f15e5d), nC = KK.noise2(seed ^ 0x2c1b3c6d);
    const W = makeWorley(seed), Wp = makeWorley(seed ^ 0x6a09e667);
    const stick = model.shape === 'stick';
    const chunky = !!look.chunky && !stick;
    const chunks = prepChunks(model, ball ? 0.8 : mass ? 0.86 : 1, ball ? 0.85 : mass ? 0.7 : 1);
    const embedded = chunks.filter((k) => !k.top), topBits = chunks.filter((k) => k.top);
    const G = gridOf(embedded, 12, E), GT = gridOf(topBits, 12, E);
    // en 3D, les toppings solides (bloc Kinder Country, barre Bueno) sont de vrais objets à part
    const tops = ball || mass || interior ? [] : (model.tops || []).filter((t) => !skip.includes(t.type));
    const drz = tops.find((t) => t.type === 'drizzle'), DG = drz ? capsGrid(drz.lines, 24, E) : null;
    const marble = !!look.marble;
    const rhoT = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const th = (i / 1024) * TAU;
      rhoT[i] = ball ? 1 + 0.018 * Math.sin(3 * th + seed) + 0.012 * Math.sin(5 * th)
        : mass ? 1 + 0.07 * nA(Math.cos(th) * 1.4 + 20, Math.sin(th) * 1.4)
          : model.rhoAt ? model.rhoAt(th) : 1;
    }
    const L = 1.05, h0 = 0.4;
    const px2u = (px) => (px + 0.5) / Rpx - E;

    const chunkPass = (grid, list, x, y, st) => {
      const gx = Math.floor((x + E) / grid.cs), gy = Math.floor((y + E) / grid.cs);
      if (gx < 0 || gy < 0 || gx >= grid.GN || gy >= grid.GN) return;
      const cell = grid.cells[gy * grid.GN + gx];
      for (let c = 0; c < cell.length; c++) {
        const k = list[cell[c]];
        const d = chunkDist(k, x, y);
        if (d > 1.35) continue;
        if (!ball && !interior && !k.top && d > 0.95) {
          const ring = (1 - smooth(0.95, 1.35, d)) * 0.16;
          st.r *= 1 - ring; st.g *= 1 - ring * 1.15; st.b *= 1 - ring * 1.3;
        }
        const edgeN = interior ? 0.3 : ball ? 0.08 : 0.1;
        let vis = 1 - smooth(ball ? 0.9 : 0.8, 1, d + edgeN * nC(x * 12 + k.off, y * 12));
        if (!interior && !ball && !mass && !k.top && !k.dice) vis *= 1 - 0.7 * smooth(0.42, 0.72, nA(x * 5.5 + k.off, y * 5.5 - k.off));
        if (vis <= 0) continue;
        const M = k.M;
        const mx = 0.5 + 0.5 * nB(x * 22 + k.off, y * 22);
        let kr = M[0][0] + (M[1][0] - M[0][0]) * mx, kg = M[0][1] + (M[1][1] - M[0][1]) * mx, kb = M[0][2] + (M[1][2] - M[0][2]) * mx;
        if (k.kind === 'pistachio' && nC(x * 60 + k.off, y * 60) > 0.35) { kr = 118; kg = 76; kb = 84; } // peau violette
        if (k.kind === 'caramel') {
          const c2 = 1 - Math.min(1, d);
          kr = M[0][0] + (M[1][0] - M[0][0]) * c2; kg = M[0][1] + (M[1][1] - M[0][1]) * c2; kb = M[0][2] + (M[1][2] - M[0][2]) * c2;
        }
        let kh = M[4] * Math.sqrt(Math.max(0, 1 - Math.min(1, d) ** 2));
        if (k.kind === 'pear') {
          // sirop translucide : plus clair au cœur, fibres fines ; dessus plat, arêtes adoucies
          const c2 = 1 - Math.min(1, d), fib = 0.5 + 0.5 * nC(chunkAx * 14 + k.off, y * 40);
          const t = Math.min(1, c2 * 1.6) * (0.82 + 0.18 * fib);
          kr = M[0][0] + (M[1][0] - M[0][0]) * t; kg = M[0][1] + (M[1][1] - M[0][1]) * t; kb = M[0][2] + (M[1][2] - M[0][2]) * t;
          kh = M[4] * smooth(0, 0.3, c2);
        }
        if (k.kind === 'pecan') {
          const groove = Math.sin(chunkAx * 9.5);
          kh += 0.012 * groove;
          const gv = 0.85 + 0.15 * groove;
          kr *= gv; kg *= gv; kb *= gv;
        }
        st.r += (kr - st.r) * vis; st.g += (kg - st.g) * vis; st.b += (kb - st.b) * vis;
        st.h += (kh + (k.top ? 0.01 : 0.012)) * vis * (ball ? 0.5 : 0.92);
        const sp = ball && k.kind !== 'salt' ? 0.22 : interior ? M[2] * 0.45 : M[2];
        st.sp += (sp - st.sp) * vis;
        st.sh += (M[3] - st.sh) * vis;
        st.dm *= 1 - vis;
      }
    };

    const st = { h: 0, r: 0, g: 0, b: 0, sp: 0, sh: 0, dm: 1 };

    await sliced(N, (py) => {
      const y = px2u(py);
      for (let px = 0; px < N; px++) {
        const x = px2u(px), i = py * N + px;
        let u, edgePx;
        if (interior) {
          u = 0.4; edgePx = 99;
        } else if (stick) {
          const qx = Math.max(-L, Math.min(L, x));
          const dist = Math.sqrt((x - qx) * (x - qx) + y * y);
          const hh = h0 + model.stickAmp * nA(x * 2.2 + 40, y * 2.2);
          u = dist / hh;
          edgePx = (hh - dist) * Rpx;
        } else {
          const r = Math.sqrt(x * x + y * y);
          let th = Math.atan2(y, x);
          if (th < 0) th += TAU;
          const fi = (th / TAU) * 1024, i0 = fi | 0, fr = fi - i0;
          const rh = rhoT[i0 & 1023] * (1 - fr) + rhoT[(i0 + 1) & 1023] * fr;
          u = r / rh;
          edgePx = (rh - r) * Rpx;
        }
        const a = Math.min(1, Math.max(0, edgePx + 0.5));
        F.a[i] = a;
        if (a <= 0) { F.h[i] = 0; continue; }
        const uu = Math.min(1, u);
        st.dm = 1;

        if (interior) {
          // mie dense et compacte, comme un cookie épais cassé en deux : pâte serrée,
          // relief doux de pâte déchirée, mate ; quelques zones plus fondantes. Aucune alvéole.
          const n1 = nA(x * 3.4, y * 3.4), n2 = nB(x * 8.2 + 3, y * 8.2), n3 = nC(x * 17 - 5, y * 17);
          const tear = 1 - Math.abs(nA(x * 5.2 + 11, y * 5.2 - 4));
          st.h = 0.1 + 0.012 * n1 + 0.006 * n2 + 0.0022 * n3 + 0.005 * tear * tear;
          const v = 0.975 + 0.035 * n2 + 0.015 * n3;
          st.r = P.crumb[0] * v; st.g = P.crumb[1] * v; st.b = P.crumb[2] * v;
          const moist = smooth(0.05, 0.75, nB(x * 1.6 - 7, y * 1.6 + 2)) * 0.45;
          st.r += (P.pore[0] - st.r) * moist; st.g += (P.pore[1] - st.g) * moist; st.b += (P.pore[2] - st.b) * moist;
          st.sp = 0.012; st.sh = 5;
          chunkPass(G, embedded, x, y, st);
        } else if (ball || mass) {
          // --- pâte crue : boule roulée ou masse dans le saladier
          const s = Math.sqrt(Math.max(0, 1 - uu * uu));
          if (ball) {
            st.h = 0.95 * s + 0.05 * s * (0.75 * nA(x * 2.2, y * 2.2) + 0.25 * nB(x * 5, y * 5)) + 0.0022 * nC(x * 22, y * 22);
          } else {
            Wp.at(x * 3.2 + 5, y * 3.2);
            const pil = Math.sqrt(smooth(0, 0.7, Wp.f2 - Wp.f1));
            st.h = 0.5 * Math.pow(Math.max(0, 1 - uu * uu), 0.6) + (0.07 * pil + 0.02 * nA(x * 5, y * 5)) * s + 0.002 * nC(x * 24, y * 24);
          }
          const v = 0.96 + 0.06 * nB(x * 3, y * 3);
          st.r = P.raw[0] * v; st.g = P.raw[1] * v; st.b = P.raw[2] * v;
          const t = smooth(0.4, 1, uu) * 0.35;
          st.r += (P.raw2[0] - st.r) * t; st.g += (P.raw2[1] - st.g) * t; st.b += (P.raw2[2] - st.b) * t;
          if (marble) {
            const mm = nA(x * 1.3 + 11 + nB(x, y) * 0.8, y * 1.3 - 4);
            const m = smooth(0.02, 0.2, mm) * 0.9;
            st.r += (SWIRL.raw[0] - st.r) * m; st.g += (SWIRL.raw[1] - st.g) * m; st.b += (SWIRL.raw[2] - st.b) * m;
          }
          if (ball) {
            const flour = smooth(0.45, 0.85, nC(x * 9, y * 9)) * 0.3;
            st.r += (252 - st.r) * flour; st.g += (248 - st.g) * flour; st.b += (240 - st.b) * flour;
          }
          st.sp = 0.2; st.sh = 18;
          chunkPass(G, embedded, x, y, st);
        } else {
          // --- cookie cuit (épais par défaut) ---
          const prof = chunky ? Math.sqrt(Math.max(0, 1 - Math.pow(uu, 3.2))) : Math.pow(Math.max(0, 1 - uu * uu), 0.3);
          st.h = (chunky ? 0.5 : 0.24) * prof;
          const warp = chunky ? 0.16 : 0.24;
          const wx = x + warp * nA(x * 1.35, y * 1.35), wy = y + warp * nA(x * 1.35 + 7.3, y * 1.35 - 2.9);
          W.at(wx * (chunky ? 2.0 : 2.35), wy * (chunky ? 2.0 : 2.35));
          const e1 = W.f2 - W.f1;
          let crev, plate;
          if (chunky) {
            // bosses arrondies à deux échelles, creux profonds entre elles
            // grosses bosses rondes + nodules moyens, creux larges et doux
            Wp.at(wx * 4.3 + 11, wy * 4.3 - 7);
            const e2 = Wp.f2 - Wp.f1;
            const p1 = smooth(0, 0.8, e1), p2 = smooth(0, 0.7, e2);
            const det = 1 - 0.35 * smooth(0.92, 1, uu);
            // chaque bosse a sa hauteur, mais tout retombe en douceur dans les creux (pas de marche)
            st.h += det * ((0.12 + (W.id - 0.5) * 0.09) * p1 + 0.04 * p2) * (0.45 + 0.55 * prof);
            crev = (1 - smooth(0, 0.3, e1)) * det;
            plate = p1;
          } else {
            const width = 0.03 + 0.08 * (0.5 + 0.5 * nB(x * 3.1, y * 3.1));
            const open = smooth(-0.4, 0.2, nC(x * 1.6 + 3, y * 1.6));
            const crack = (1 - smooth(0, width, e1)) * open;
            const amp = (0.6 + 0.4 * smooth(0.1, 0.5, uu)) * (1 - smooth(0.76, 0.93, uu));
            plate = smooth(0, 0.45, e1);
            st.h += 0.05 * plate * (0.55 + 0.45 * open) + (W.id - 0.5) * 0.03 - 0.085 * crack * amp;
            crev = crack * amp;
          }
          st.h += chunky ? 0.004 * nB(x * 12, y * 12) + 0.0015 * nC(x * 36, y * 36) : 0.006 * nB(x * 15, y * 15) + 0.0025 * nC(x * 40, y * 40);

          const t1 = smooth(0.2, 0.85, uu), t2 = Math.pow(smooth(0.72, 1, uu), 1.2);
          st.r = P.top[0] + (P.mid[0] - P.top[0]) * t1; st.g = P.top[1] + (P.mid[1] - P.top[1]) * t1; st.b = P.top[2] + (P.mid[2] - P.top[2]) * t1;
          st.r += (P.edge[0] - st.r) * t2; st.g += (P.edge[1] - st.g) * t2; st.b += (P.edge[2] - st.b) * t2;
          if (marble) {
            const sx = wx + 0.35 * nB(wx * 1.9 + 4, wy * 1.9), sy = wy + 0.35 * nB(wx * 1.9, wy * 1.9 - 6);
            const mm = nA(sx * 1.05 + 11, sy * 1.05 - 4);
            const m = smooth(0.02, 0.2, mm) * 0.94;
            const sr = SWIRL.top[0] + (SWIRL.edge[0] - SWIRL.top[0]) * t2, sg = SWIRL.top[1] + (SWIRL.edge[1] - SWIRL.top[1]) * t2, sb = SWIRL.top[2] + (SWIRL.edge[2] - SWIRL.top[2]) * t2;
            st.r += (sr - st.r) * m; st.g += (sg - st.g) * m; st.b += (sb - st.b) * m;
          }
          const mot = nB(x * 2.1 + 3.1, y * 2.1 - 1.7);
          const brown = Math.max(0, mot) * 0.22;
          st.r += (P.mid[0] - st.r) * brown; st.g += (P.mid[1] - st.g) * brown; st.b += (P.mid[2] - st.b) * brown;
          const ck = crev * (chunky ? 0.35 : 0.7);
          st.r += (P.crev[0] - st.r) * ck; st.g += (P.crev[1] - st.g) * ck; st.b += (P.crev[2] - st.b) * ck;
          if (nC(x * 58, y * 58) > 0.72) { st.r *= 0.9; st.g *= 0.88; st.b *= 0.86; }
          st.sp = 0.08 + 0.05 * plate * (1 - crev);
          st.sh = 10;
          const hsh = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453;
          if (hsh - Math.floor(hsh) < 0.004 * plate) { st.sp = 1.1; st.sh = 110; }
          chunkPass(G, embedded, x, y, st);
          if (look.vanilla && nC(x * 95 + 5, y * 95) > 0.82 && nB(x * 3, y * 3) > 0) { st.r *= 0.6; st.g *= 0.55; st.b *= 0.5; }

          // --- toppings ---
          for (let q = 0; q < tops.length; q++) {
            const tp = tops[q];
            const dx = x - tp.x, dy = y - tp.y, lx = dx * tp.c + dy * tp.s, ly = -dx * tp.s + dy * tp.c;
            if (tp.type === 'kcountry') {
              // bloc de chocolat au lait planté dans le cookie, face cassée côté fourrage
              const d = sdRoundBox(lx, ly, tp.hx, tp.hy, 0.035);
              if (d > 0.015) continue;
              const cov = 1 - smooth(-0.012, 0.012, d);
              const bevel = smooth(0, 0.045, -d);
              const groove = Math.abs(lx) < tp.hx - 0.05 && Math.abs(Math.abs(ly) - tp.hy * 0.42) < 0.01 ? 0.008 : 0;
              const hk = tp.base + tp.h * (0.3 + 0.7 * bevel) + tp.tilt * lx * bevel - groove; // planté de biais
              st.h += (hk - st.h) * cov;
              const broken = lx > tp.hx - 0.075;
              let kr = 124, kg = 78, kb = 50;
              if (broken) {
                kr = 236; kg = 216; kb = 172;
                if (nC(x * 80, y * 80) > 0.3) { kr = 214; kg = 176; kb = 112; } // céréales
              } else {
                const v = 0.92 + 0.1 * nB(x * 14, y * 14) - (groove ? 0.1 : 0);
                kr *= v; kg *= v; kb *= v;
              }
              st.r += (kr - st.r) * cov; st.g += (kg - st.g) * cov; st.b += (kb - st.b) * cov;
              st.sp += ((broken ? 0.08 : 0.45) - st.sp) * cov;
              st.sh += ((broken ? 8 : 36) - st.sh) * cov;
              st.dm *= 1 - cov;
            } else if (tp.type === 'cream' || tp.type === 'paste') {
              // nappage épais : bord irrégulier, dôme lisse et brillant
              const ang = Math.atan2(dy, dx);
              const rr = tp.r * (1 + 0.13 * nC(Math.cos(ang) * 1.7 + tp.o, Math.sin(ang) * 1.7) + 0.05 * nB(Math.cos(ang) * 5, Math.sin(ang) * 5 + tp.o));
              const dist = Math.sqrt(dx * dx + dy * dy), d = dist / rr;
              if (d > 1.05) continue;
              const cov = 1 - smooth(0.9, 1, d);
              // dôme régulier (pas de rayons en étoile) ; seul le bord suit le contour irrégulier
              const d0 = Math.min(1, (dist / tp.r) * 0.92);
              // nappage épais au bord bien marqué : il se pose sur le cookie, il ne fond pas dedans
              const dome = Math.sqrt(1 - d0 * d0) * (1 - smooth(0.8, 1, d));
              const hk = Math.max(st.h, tp.base) + 0.09 * dome + 0.02 * (1 - smooth(0.88, 1, d)) + 0.002 * nA(x * 5, y * 5);
              st.h += (hk - st.h) * cov;
              const v = 0.95 + 0.07 * nB(x * 6 + tp.o, y * 6);
              let kr, kg, kb;
              if (tp.type === 'cream') { kr = 222 * v; kg = 194 * v; kb = 146 * v; } else {
                kr = 150 * v; kg = 146 * v; kb = 58 * v;
                if (d > 0.8) { kr *= 0.88; kg *= 0.9; kb *= 0.85; }
              }
              st.r += (kr - st.r) * cov; st.g += (kg - st.g) * cov; st.b += (kb - st.b) * cov;
              st.sp += (0.55 - st.sp) * cov;
              st.sh += (42 - st.sh) * cov;
              st.dm *= 1 - cov;
            } else if (tp.type === 'bar') {
              // morceau de Kinder Bueno : barre bombée enrobée de chocolat au lait, en bosses
              // séparées par des creux, filets de chocolat en travers (par paires, au creux
              // des bosses). Un bout est arrondi, l'autre cassé : on y voit la gaufrette et
              // la crème noisette.
              const hy = tp.hy, seg = hy * 1.9; // une bosse ≈ la largeur de la barre
              const s = (lx + tp.hx) / seg; // position en bosses, depuis le bout arrondi
              const ks = Math.round(s);
              const v = ks > 0 ? Math.exp(-Math.pow(((s - ks) * seg) / 0.055, 2)) : 0; // creux entre deux bosses
              const hyE = hy * (1 - 0.07 * v);
              const xEnd = tp.hx - 0.035 * (0.5 + 0.5 * nC(ly * 26 + tp.brk, tp.brk)) - 0.012 * Math.abs(ly / hy);
              const dBox = sdRoundBox(lx - 0.1, ly, tp.hx + 0.1, hyE, hy * 0.85);
              const d = Math.max(dBox, lx - xEnd);
              if (d > 0.012) continue;
              const cov = 1 - smooth(-0.01, 0.01, d);
              const across = Math.min(1, Math.abs(ly) / hyE);
              const prof = Math.pow(Math.max(0, 1 - Math.pow(across, 2.4)), 0.42);
              const bevel = smooth(0, 0.05, -dBox);
              const top = tp.base + (tp.tiltB * lx) / tp.hx + 0.24 * prof * (1 - 0.16 * v) * (0.3 + 0.7 * bevel);
              // cassure : la surface plonge sur les derniers millimètres
              const bk = smooth(xEnd - 0.07, xEnd, lx);
              const hk = top - (top - tp.base - 0.02) * bk * 0.9 + 0.006 * nB(x * 40, y * 40) * bk;
              st.h += (hk - st.h) * cov;
              const depth = bk > 0.02 ? Math.min(1, (top - hk) / Math.max(0.01, top - tp.base)) : 0;
              let kr, kg, kb, ksp, ksh;
              if (depth > 0.1) {
                if (depth < 0.3) {
                  // gaufrette : blonde, alvéolée
                  const pore = nC(x * 120, y * 120) > 0.35;
                  kr = pore ? 186 : 216; kg = pore ? 140 : 174; kb = pore ? 88 : 118; ksp = 0.04; ksh = 8;
                } else {
                  // crème lait-noisette, quelques éclats de noisette
                  const vv = 0.95 + 0.08 * nB(x * 30, y * 30);
                  kr = 208 * vv; kg = 168 * vv; kb = 112 * vv; ksp = 0.35; ksh = 30;
                  if (nC(x * 90 + 7, y * 90) > 0.6) { kr *= 0.8; kg *= 0.72; kb *= 0.66; }
                }
              } else {
                // enrobage chocolat au lait satiné
                const vv = 0.94 + 0.08 * nB(x * 9 + tp.o, y * 9);
                kr = 138 * vv; kg = 84 * vv; kb = 50 * vv; ksp = 0.42; ksh = 36;
                // filets penchés qui suivent le bombé, deux de part et d'autre de chaque creux
                const q = ly / hy;
                const sl = s - 0.3 * q - 0.15 * q * q;
                const fr = sl - Math.round(sl), off = 0.18, wS = 0.013 / seg;
                const dS = Math.min(Math.abs(fr - off), Math.abs(fr + off));
                if (dS < wS * 1.6 && sl > 0.05) {
                  const e = 1 - smooth(wS * 0.6, wS * 1.6, dS);
                  kr += (66 - kr) * e; kg += (36 - kg) * e; kb += (21 - kb) * e;
                  st.h += 0.004 * e * cov;
                  ksp += 0.15 * e; ksh += 14 * e;
                }
              }
              st.r += (kr - st.r) * cov; st.g += (kg - st.g) * cov; st.b += (kb - st.b) * cov;
              st.sp += (ksp - st.sp) * cov;
              st.sh += (ksh - st.sh) * cov;
              st.dm *= 1 - cov;
            } else if (tp.type === 'drizzle') {
              // chocolat noir fondu : rubans bombés et brillants qui épousent le relief,
              // plus épais au creux des crevasses, où il s'est rassemblé ; bords fins plus bruns
              const dd = capsDist(DG, x, y);
              if (dd > 1.08) continue;
              const cov = 1 - smooth(0.86, 1.06, dd);
              const prof = Math.sqrt(Math.max(0, 1 - Math.min(1, dd) ** 4)); // dessus plat : le chocolat s'étale
              const hk = st.h + (0.006 + 0.32 * capsW) * prof * (1 + 0.6 * (crev || 0)) + 0.0012 * nA(x * 30, y * 30);
              st.h += (hk - st.h) * cov;
              const v = 0.9 + 0.14 * nB(x * 16 + tp.o, y * 16), thin = smooth(0.55, 1, dd) * 0.35;
              let kr = 54 * v, kg = 29 * v, kb = 18 * v;
              kr += (96 - kr) * thin; kg += (56 - kg) * thin; kb += (34 - kb) * thin;
              st.r += (kr - st.r) * cov; st.g += (kg - st.g) * cov; st.b += (kb - st.b) * cov;
              st.sp += (0.95 - st.sp) * cov;
              st.sh += (80 - st.sh) * cov;
              st.dm *= 1 - cov;
            }
          }
          // éclats et fleur de sel posés dessus
          chunkPass(GT, topBits, x, y, st);
          if (look.sugar && nC(x * 72 + 3, y * 72) > 0.66 && nA(x * 3.4, y * 3.4) > 0.05) {
            st.r += (252 - st.r) * 0.7; st.g += (250 - st.g) * 0.7; st.b += (246 - st.b) * 0.7;
          }
        }

        F.h[i] = st.h; F.r[i] = st.r; F.g[i] = st.g; F.b[i] = st.b; F.sp[i] = st.sp; F.sh[i] = st.sh; F.dm[i] = st.dm;
      }
    });
    F.E = E;
    F.rpx = Rpx;
    F.pal = P;
    return F;
  }

  /* Tas de farine ou de sucre (pour le saladier) */
  async function moundFields(kind, N) {
    const E = EXT, Rpx = N / (2 * E), F = newFields(N, N);
    const n = KK.noise2(kind === 'flour' ? 101 : 202), n2 = KK.noise2(303);
    await sliced(N, (py) => {
      const y = (py + 0.5) / Rpx - E;
      for (let px = 0; px < N; px++) {
        const x = (px + 0.5) / Rpx - E, i = py * N + px;
        const rr = Math.sqrt(x * x + y * y) / (1 + 0.08 * n(x * 1.3, y * 1.3));
        if (rr >= 1) { F.a[i] = 0; continue; }
        F.a[i] = 1 - smooth(0.82, 1, rr);
        if (kind === 'flour') {
          F.h[i] = 0.5 * Math.exp(-rr * rr * 2.6) + 0.012 * n(x * 8, y * 8) + 0.004 * n2(x * 28, y * 28);
          const v = 0.97 + 0.03 * n2(x * 6, y * 6);
          F.r[i] = 248 * v; F.g[i] = 246 * v; F.b[i] = 240 * v;
          F.sp[i] = 0.02; F.sh[i] = 6;
        } else {
          F.h[i] = 0.42 * Math.exp(-rr * rr * 3) + 0.01 * n(x * 14, y * 14);
          const v = 0.96 + 0.04 * n2(x * 9, y * 9);
          F.r[i] = 250 * v; F.g[i] = 246 * v; F.b[i] = 236 * v;
          const hsh = Math.sin(px * 12.9898 + py * 78.233) * 43758.5453;
          const glint = hsh - Math.floor(hsh) < 0.08;
          F.sp[i] = glint ? 1.4 : 0.12; F.sh[i] = glint ? 120 : 20;
        }
        F.dm[i] = 0;
      }
    });
    F.E = E;
    F.rpx = Rpx;
    return F;
  }

  /* ======================================================================
     Lumière (commune aux cookies, aux mains, aux tas)
     ====================================================================== */
  async function shade(F, o = {}) {
    const W = F.W, H = F.H, Rpx = o.rpx || F.rpx;
    const Hm = F.h;
    const rad = o.blur || Math.max(2, Math.round(W / 80));
    const HB = boxBlur(boxBlur(Hm, W, H, rad), W, H, rad);
    const img = new ImageData(W, H), D = img.data;
    let Lx = -0.48, Ly = -0.6, Lz = 0.64;
    const ln = Math.hypot(Lx, Ly, Lz);
    Lx /= ln; Ly /= ln; Lz /= ln;
    let Hx = Lx, Hy = Ly, Hz = Lz + 1;
    const hn = Math.hypot(Hx, Hy, Hz);
    Hx /= hn; Hy /= hn; Hz /= hn;
    const AMP = o.amp || 1, aoK = o.aoK != null ? o.aoK : 3.8, aoMin = o.aoMin || 0.5;
    const amb = o.amb != null ? o.amb : 0.46, dif = o.dif != null ? o.dif : 0.7, wrap = o.wrap || 0, sss = o.sss || 0;
    const P = o.peaks ? F.pal : null;
    await sliced(H, (py) => {
      for (let px = 0; px < W; px++) {
        const i = py * W + px, j = i * 4;
        const a = F.a[i];
        if (a <= 0) { D[j + 3] = 0; continue; }
        const xl = px > 0 ? i - 1 : i, xr = px < W - 1 ? i + 1 : i;
        const yu = py > 0 ? i - W : i, yd = py < H - 1 ? i + W : i;
        const gx = (Hm[xr] - Hm[xl]) * 0.5 * Rpx * AMP, gy = (Hm[yd] - Hm[yu]) * 0.5 * Rpx * AMP;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        const nx = -gx * inv, ny = -gy * inv, nz = inv;
        let ndl = nx * Lx + ny * Ly + nz * Lz;
        if (wrap) ndl = (ndl + wrap) / (1 + wrap);
        if (ndl < 0) ndl = 0;
        let ao = 1 - (HB[i] - Hm[i]) * aoK;
        ao = ao < aoMin ? aoMin : ao > 1 ? 1 : ao;
        const ndh = nx * Hx + ny * Hy + nz * Hz;
        const sp = ndh > 0 ? Math.pow(ndh, F.sh[i]) * F.sp[i] * 255 : 0;
        let ar = F.r[i], ag = F.g[i], ab = F.b[i];
        if (P && F.dm[i] > 0) {
          // les sommets brunissent, les creux restent pâles
          const dh = Hm[i] - HB[i], dm = F.dm[i];
          const pk = clamp01(dh * 10) * 0.38 * dm, cv = clamp01(-dh * 8) * 0.18 * dm;
          ar += (P.peak[0] - ar) * pk; ag += (P.peak[1] - ag) * pk; ab += (P.peak[2] - ab) * pk;
          ar += (P.crev[0] - ar) * cv; ag += (P.crev[1] - ag) * cv; ab += (P.crev[2] - ab) * cv;
          F.r[i] = ar; F.g[i] = ag; F.b[i] = ab;
        }
        const lit = (amb + dif * ndl) * ao;
        let r = ar * lit * 1.03 + sp, g = ag * lit + sp * 0.96, b = ab * lit * 0.95 + sp * 0.88;
        if (sss) {
          const s = (1 - ndl) * sss;
          r += 150 * s; g += 36 * s; b += 26 * s;
        }
        D[j] = r > 255 ? 255 : r;
        D[j + 1] = g > 255 ? 255 : g;
        D[j + 2] = b > 255 ? 255 : b;
        D[j + 3] = a * 255;
      }
    });
    return img;
  }

  /* ======================================================================
     Vue 3/4 : projection de la carte de hauteur, colonne par colonne,
     de l'avant vers l'arrière (seul ce qui dépasse l'horizon est peint)
     ====================================================================== */
  function project3q(F, img) {
    const N = F.W, E = F.E, Rpx = F.rpx, { s, c, hmax } = G3, SS = 2;
    const Y0 = -E * s - hmax * c, Y1 = E * s + 0.02;
    const outW = N, outH = Math.ceil((Y1 - Y0) * Rpx);
    const W2 = outW * SS, H2 = outH * SS, k = Rpx * SS;
    const out = new ImageData(W2, H2), O = out.data, T = img.data;
    const topPx = Math.max(1, Math.round(s * SS * 1.3));
    const rowPx = s * SS;
    const P = F.pal;
    for (let cx = 0; cx < W2; cx++) {
      const ix = Math.min(N - 1, (cx / SS) | 0);
      const xn = (ix + 0.5) / Rpx - E;
      const wallL = 0.5 + 0.2 * (-xn / E);
      let horizon = H2;
      for (let iy = N - 1; iy >= 0; iy--) {
        const i = iy * N + ix, a = F.a[i];
        if (a <= 0.02) continue;
        const y = (iy + 0.5) / Rpx - E, hh = F.h[i];
        const yTop = (y * s - hh * c - Y0) * k, yBase = (y * s - Y0) * k;
        const bottom = Math.min(horizon, Math.ceil(yBase));
        const t0 = Math.max(0, Math.floor(yTop));
        if (t0 >= bottom) continue;
        const j = i * 4, tr = T[j], tg = T[j + 1], tb = T[j + 2];
        let ar = F.r[i], ag = F.g[i], ab = F.b[i];
        if (P && F.dm[i] > 0.5) {
          const w = 0.6 * F.dm[i];
          ar += (P.mid[0] - ar) * w; ag += (P.mid[1] - ag) * w; ab += (P.mid[2] - ab) * w;
        }
        const span = Math.max(1, bottom - t0);
        // tranche fine = surface vue de dessus ; tranche haute = flanc (évite les zébrures)
        const wallMix = Math.min(1, Math.max(0, (span - rowPx * 1.5) / (rowPx * 6)));
        const ground = bottom >= Math.ceil(yBase) - 1;
        for (let py = t0; py < bottom; py++) {
          const o = (py * W2 + cx) * 4;
          if (py - t0 < topPx || wallMix === 0) {
            O[o] = tr; O[o + 1] = tg; O[o + 2] = tb;
          } else {
            const Lw = wallL * (1 - 0.38 * ((py - t0) / span));
            O[o] = tr + (ar * Lw - tr) * wallMix;
            O[o + 1] = tg + (ag * Lw * 0.97 - tg) * wallMix;
            O[o + 2] = tb + (ab * Lw * 0.92 - tb) * wallMix;
          }
          if (ground && py >= bottom - 2) { O[o] *= 0.72; O[o + 1] *= 0.68; O[o + 2] *= 0.66; } // contact au sol
          O[o + 3] = 255 * a;
        }
        horizon = t0;
      }
    }
    const big = canvas(W2, H2);
    big.getContext('2d').putImageData(out, 0, 0);
    const cv = canvas(outW, outH);
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(big, 0, 0, outW, outH);
    return cv;
  }

  /* Cadre de l'image 3/4 (en rayons) : le centre de la base du cookie est en (0, 0) */
  KK.frame3q = (E = EXT) => ({ x0: -E, x1: E, y0: -E * G3.s - G3.hmax * G3.c, y1: E * G3.s + 0.02 });

  function canvas(w, h) {
    if (IN_WORKER) return new OffscreenCanvas(w, h);
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    return cv;
  }

  function imgToCanvas(img) {
    const cv = canvas(img.width, img.height);
    cv.getContext('2d').putImageData(img, 0, 0);
    return cv;
  }

  /* Image finie : le PNG lui-même (la page en fera une adresse blob: et le gardera dans le téléphone) */
  async function toPNG(cv) {
    if (IN_WORKER) return cv.convertToBlob({ type: 'image/png' });
    const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
    return blob || cv.toDataURL('image/png');
  }

  const LIGHT = { cookie: { peaks: true }, ball: { amp: 1 }, interior: { aoK: 4 }, mound: { amb: 0.74, dif: 0.42, aoK: 1.5 } };

  /* ======================================================================
     Champs pour la vitrine 3D (kk-3d.js) : albédo (sommets brunis compris)
     + brillance, normales + occlusion, hauteurs pour le maillage.
     La lumière, elle, est calculée en direct par le GPU.
     ====================================================================== */
  async function fields3d(model, N, stage = 'baked') {
    const crumb = stage === 'interior'; // la mie, pour les parois des bouchées
    const F = await cookieFields(model, stage, N, crumb ? {} : { skipTops: ['kcountry', 'bar'] });
    const W = F.W, H = F.H, Rpx = F.rpx, Hm = F.h, A = F.a, P = crumb ? null : F.pal, E = F.E;
    const rad = Math.max(2, Math.round(W / 80));
    const HB = boxBlur(boxBlur(Hm, W, H, rad), W, H, rad);
    // grain mat de la pâte cuite (pour les normales seulement) : la lumière rasante n'est plus « plastique »
    const g1 = KK.noise2((model.seed >>> 0) ^ 0x3c6ef372), g2 = KK.noise2((model.seed >>> 0) ^ 0x1f83d9ab);
    const Hn = new Float32Array(W * H);
    await sliced(H, (py) => {
      const y = (py + 0.5) / Rpx - E;
      for (let px = 0; px < W; px++) {
        const i = py * W + px, x = (px + 0.5) / Rpx - E;
        Hn[i] = !crumb && F.dm[i] > 0 ? Hm[i] + F.dm[i] * (0.0011 * g1(x * 52, y * 52) + 0.0005 * g2(x * 118, y * 118)) : Hm[i];
      }
    });
    const gain = crumb ? 0.45 : 1; // mie : relief adouci (elle est tendre)
    const alb = new Uint8ClampedArray(W * H * 4), nao = new Uint8ClampedArray(W * H * 4);
    await sliced(H, (py) => {
      for (let px = 0; px < W; px++) {
        const i = py * W + px, j = i * 4;
        const xl = px > 0 ? i - 1 : i, xr = px < W - 1 ? i + 1 : i;
        const yu = py > 0 ? i - W : i, yd = py < H - 1 ? i + W : i;
        const gx = (Hn[xr] - Hn[xl]) * 0.5 * Rpx * gain, gy = (Hn[yd] - Hn[yu]) * 0.5 * Rpx * gain;
        const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1);
        // normale en repère « y vers le haut » : (x, hauteur, y du cookie)
        nao[j] = (0.5 - 0.5 * gx * inv) * 255;
        nao[j + 1] = (0.5 + 0.5 * inv) * 255;
        nao[j + 2] = (0.5 - 0.5 * gy * inv) * 255;
        const ao = 1 - (HB[i] - Hm[i]) * (crumb ? 2.2 : 3.8);
        nao[j + 3] = (ao < 0.5 ? 0.5 : ao > 1 ? 1 : ao) * 255;
        if (A[i] <= 0) continue;
        let r = F.r[i], g = F.g[i], b = F.b[i];
        if (P && F.dm[i] > 0) {
          const dh = Hm[i] - HB[i], dm = F.dm[i];
          const pk = clamp01(dh * 10) * 0.38 * dm, cv = clamp01(-dh * 8) * 0.18 * dm;
          r += (P.peak[0] - r) * pk; g += (P.peak[1] - g) * pk; b += (P.peak[2] - b) * pk;
          r += (P.crev[0] - r) * cv; g += (P.crev[1] - g) * cv; b += (P.crev[2] - b) * cv;
        }
        alb[j] = r; alb[j + 1] = g; alb[j + 2] = b; alb[j + 3] = clamp01(F.sp[i] / 1.2) * 255;
      }
    });
    // les couleurs débordent de quelques pixels hors du contour : pas de liseré sombre au filtrage
    const filled = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) filled[i] = A[i] > 0 ? 1 : 0;
    for (let pass = 0; pass < 3; pass++) {
      const next = filled.slice();
      for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
          const i = py * W + px;
          if (filled[i]) continue;
          let n = 0, r = 0, g = 0, b = 0;
          if (px > 0 && filled[i - 1]) { n++; r += alb[(i - 1) * 4]; g += alb[(i - 1) * 4 + 1]; b += alb[(i - 1) * 4 + 2]; }
          if (px < W - 1 && filled[i + 1]) { n++; r += alb[(i + 1) * 4]; g += alb[(i + 1) * 4 + 1]; b += alb[(i + 1) * 4 + 2]; }
          if (py > 0 && filled[i - W]) { n++; r += alb[(i - W) * 4]; g += alb[(i - W) * 4 + 1]; b += alb[(i - W) * 4 + 2]; }
          if (py < H - 1 && filled[i + W]) { n++; r += alb[(i + W) * 4]; g += alb[(i + W) * 4 + 1]; b += alb[(i + W) * 4 + 2]; }
          if (n) { alb[i * 4] = r / n; alb[i * 4 + 1] = g / n; alb[i * 4 + 2] = b / n; next[i] = 1; }
        }
      }
      filled.set(next);
    }
    return { N: W, E: F.E, rpx: Rpx, h: Hm, alb, nao }; // ce dont la 3D a besoin, rien de plus
  }

  async function renderLocal(model, stage, N) {
    if (stage === 'fields3d') return fields3d(model, N);
    if (stage === 'crumb3d') return fields3d(model, N, 'interior');
    if (stage === 'flour3q' || stage === 'sugar3q') {
      const F = await moundFields(stage === 'flour3q' ? 'flour' : 'sugar', N);
      return toPNG(project3q(F, await shade(F, LIGHT.mound)));
    }
    const fieldStage = stage === '3q' ? 'baked' : stage === 'mass3q' ? 'mass' : stage;
    const F = await cookieFields(model, fieldStage, N);
    const img = await shade(F, fieldStage === 'baked' ? LIGHT.cookie : fieldStage === 'interior' ? LIGHT.interior : LIGHT.ball);
    if (stage === '3q' || stage === 'mass3q') return toPNG(project3q(F, img));
    return toPNG(imgToCanvas(img));
  }

  /* ======================================================================
     Les aides en arrière-plan : un worker par cœur libre (jusqu'à 4).
     Repli sur la page, une tâche à la fois, si c'est impossible
     (ouverture en file://, navigateur sans OffscreenCanvas) ou si un worker lâche.
     ====================================================================== */
  const SELF = !IN_WORKER && document.currentScript ? document.currentScript.src : '';
  const WORKER_URL = SELF ? SELF.replace(/kk-bake\.js(\?[^#]*)?$/, (m, q) => 'kk-worker.js' + (q || '')) : '';
  let pool = null, seq = 0;
  const waiting = new Map();

  function workers() {
    if (pool) return pool;
    pool = [];
    if (IN_WORKER || !WORKER_URL || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined' || location.protocol === 'file:') return pool;
    if (/[?&]noworker\b/.test(location.search)) return pool; // pour comparer : tout sur la page
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1));
    try {
      for (let i = 0; i < n; i++) {
        const slot = { w: new Worker(WORKER_URL), busy: 0 };
        slot.w.onmessage = (e) => {
          const cb = waiting.get(e.data.id);
          if (!cb) return;
          waiting.delete(e.data.id);
          slot.busy--;
          if (e.data.ok) cb.resolve(e.data.out);
          else { broken(); cb.reject(new Error(e.data.err)); }
        };
        slot.w.onerror = (e) => { e.preventDefault(); broken(); };
        pool.push(slot);
      }
    } catch (e) {
      broken();
    }
    return pool;
  }

  /* un worker a lâché : on les arrête, tout ce qu'ils devaient rendre sera calculé sur la page */
  function broken() {
    (pool || []).forEach((s) => s.w.terminate());
    pool = [];
    waiting.forEach((cb) => cb.reject(new Error('worker')));
    waiting.clear();
  }

  function remote(msg) {
    const p = workers();
    if (!p.length) return Promise.reject(new Error('pas de worker'));
    const slot = p.reduce((a, b) => (b.busy < a.busy ? b : a));
    const id = ++seq;
    slot.busy++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      slot.w.postMessage(Object.assign({ id }, msg));
    });
  }

  // sur la page, une seule tâche à la fois (chacune se découpe déjà en tranches)
  let lock = Promise.resolve();
  function onMain(fn) {
    const p = lock.then(fn, fn);
    lock = p.catch(() => {});
    return p;
  }

  /* ======================================================================
     La mémoire du téléphone (IndexedDB) : une texture calculée une fois y est
     gardée ; aux visites suivantes, elle revient en quelques millisecondes.
     Clés préfixées par la version du site : une nouvelle version repart de zéro.
     ====================================================================== */
  const VERSION = (SELF.match(/[?&]v=([^&#]+)/) || [])[1] || 'dev';
  const vault = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res) => {
      try {
        if (IN_WORKER || typeof indexedDB === 'undefined') return res(null);
        const rq = indexedDB.open('kookies-four', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('tex');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = (e) => { e.preventDefault(); res(null); };
        rq.onblocked = () => res(null);
      } catch (e) {
        res(null);
      }
    }));
    const quiet = (e) => { if (e && e.preventDefault) e.preventDefault(); };
    return {
      async get(k) {
        const db = await open();
        if (!db) return null;
        return new Promise((res) => {
          try {
            const rq = db.transaction('tex', 'readonly').objectStore('tex').get(VERSION + '|' + k);
            rq.onsuccess = () => res(rq.result == null ? null : rq.result);
            rq.onerror = (e) => { quiet(e); res(null); };
          } catch (e) {
            res(null);
          }
        });
      },
      async put(k, v) {
        const db = await open();
        if (!db || v == null) return;
        try {
          const t = db.transaction('tex', 'readwrite');
          t.onerror = t.onabort = quiet; // mémoire pleine ou refusée : tant pis, on recalculera
          t.objectStore('tex').put(v, VERSION + '|' + k).onerror = quiet;
        } catch (e) { /* idem */ }
      },
      /* rangement : les textures d'une ancienne version du site s'en vont */
      async sweep() {
        const db = await open();
        if (!db) return;
        try {
          const t = db.transaction('tex', 'readwrite');
          t.onerror = t.onabort = quiet;
          const store = t.objectStore('tex');
          const rq = store.openKeyCursor ? store.openKeyCursor() : store.openCursor();
          rq.onsuccess = () => {
            const c = rq.result;
            if (!c) return;
            if (!String(c.key).startsWith(VERSION + '|')) store.delete(c.key);
            c.continue();
          };
        } catch (e) { /* rien */ }
      },
    };
  })();
  if (!IN_WORKER) setTimeout(() => vault.sweep(), 8000);

  const usable = (out) => (typeof Blob !== 'undefined' && out instanceof Blob ? URL.createObjectURL(out) : out);

  /* un calcul : en arrière-plan si possible, sinon ici ; rend le résultat brut (PNG ou champs 3D) */
  async function compute(msg, local) {
    if (msg && workers().length) {
      try {
        return await remote(msg);
      } catch (e) { /* repli sur la page */ }
    }
    return onMain(local);
  }

  // un modèle se reconstruit à l'identique dans un worker à partir de (clé, graine, options)
  const remotable = (m) => m && (m.key === 'tas' || (KK.LOOKS && KK.LOOKS[m.key] && m.seed != null && !m.pile));

  /* ======================================================================
     Cache avec compteur de références. Ce qui est dans la mémoire du téléphone
     revient tout de suite ; seuls les calculs font la queue (par priorité,
     plusieurs à la fois avec les workers).
     ====================================================================== */
  const cache = new Map();
  const queue = [];
  let running = 0, looking = 0;

  const keyOf = (model, stage, N) => `${model.key}:${model.seed}:${(model.chunks || []).length}:${stage}:${N}`;

  function pump() {
    const cap = Math.max(1, workers().length);
    while (running < cap && queue.length) {
      queue.sort((a, b) => b.pri - a.pri);
      const job = queue.shift();
      running++;
      Promise.resolve()
        .then(job.run)
        .then(job.resolve, job.reject)
        .finally(() => {
          running--;
          pump();
        });
    }
  }

  /* k : clé en mémoire vive ; pkey : clé dans le téléphone (null : pas gardée) ; run : le calcul */
  function enqueue(k, pkey, run, pri) {
    let e = cache.get(k);
    if (!e) {
      e = { refs: 0, url: null, k, pri };
      e.promise = (async () => {
        if (pkey) {
          looking++;
          const hit = await vault.get(pkey);
          looking--;
          if (hit != null) return usable(hit);
        }
        const out = await new Promise((resolve, reject) => {
          queue.push({ k, run, pri: e.pri, resolve, reject });
          pump();
        });
        if (pkey) vault.put(pkey, out);
        return usable(out);
      })();
      e.promise.then((url) => { e.url = url; });
      cache.set(k, e);
    } else if (!e.url) {
      e.pri = Math.max(e.pri, pri);
      const q = queue.find((j) => j.k === k);
      if (q) q.pri = Math.max(q.pri, pri);
    }
    e.refs++;
    clearTimeout(e.t);
    return e.promise;
  }

  function acquire(model, stage = 'baked', N = 320, pri = 0) {
    const k = keyOf(model, stage, N);
    const msg = remotable(model) ? { kind: 'bake', key: model.key, seed: model.seed, opts: model.opts || null, stage, N } : null;
    return enqueue(k, model.keep === false ? null : k, () => compute(msg, () => renderLocal(model, stage, N)), pri);
  }

  /* Tâche libre (ex. les mains), calculée en arrière-plan si possible et gardée sous sa clé */
  function task(k, msg, local, pri = 0) {
    return enqueue(k, k, () => compute(msg, local), pri);
  }

  /* Tâche libre, sur la page, non gardée */
  function job(k, run, pri = 0) {
    return enqueue(k, null, () => onMain(run), pri);
  }

  function releaseKey(k) {
    const e = cache.get(k);
    if (!e) return;
    e.refs = Math.max(0, e.refs - 1);
    if (e.refs === 0) {
      clearTimeout(e.t);
      e.t = setTimeout(() => {
        if (e.refs === 0 && e.url) {
          if (typeof e.url === 'string' && e.url.startsWith('blob:')) URL.revokeObjectURL(e.url);
          cache.delete(k);
        }
      }, 15000);
    }
  }

  function release(model, stage = 'baked', N = 320) {
    releaseKey(keyOf(model, stage, N));
  }

  function peek(model, stage = 'baked') {
    let best = null, bestN = 0;
    const pre = `${model.key}:${model.seed}:${(model.chunks || []).length}:${stage}:`;
    cache.forEach((e, k) => {
      if (k.startsWith(pre) && e.url) {
        const n = +k.slice(pre.length);
        if (n > bestN) { best = e.url; bestN = n; }
      }
    });
    return best;
  }

  const api = {
    acquire, release, peek, task, job, releaseKey, renderLocal, budget: 7,
    newFields, shade, toPNG, imgToCanvas, sliced, smooth, sdRoundBox, boxBlur, vault,
    size: () => cache.size, pending: () => queue.length + running + looking,
    workers: () => (pool ? pool.length : 0),
  };
  KK.bake = api;
})();
