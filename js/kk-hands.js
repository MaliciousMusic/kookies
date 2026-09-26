/* ==========================================================================
   Kookies — des mains fines et réalistes, calculées comme les cookies
   Une main fine : avant-bras mince, poignet étroit, dos de la main où l'on
   devine les métacarpes, jointures discrètes, doigts longs et effilés,
   ongles nacrés, pouce. Géométrie → carte de hauteur → peau éclairée
   (diffus enveloppant, léger rendu « sous la peau », ombre portée douce).
   Manches blanches retroussées, comme leurs t-shirts Kookies.
   Trois poses par main (ouverte, qui tient, qui serre) + une manique.
   Repère : poignet en (0, 0), doigts vers +y, avant-bras vers -y.
   ========================================================================== */
(function () {
  'use strict';

  const KK = window.KK;
  const PPU = 2; // pixels par unité : net sur les écrans denses
  const FRAME = { x0: -60, x1: 60, y0: -360, y1: 124 };
  const HOLD = 58; // du poignet au point de prise (le centre de ce que la main tient)
  const SKIN = [236, 190, 162];
  const NAIL = [238, 188, 182], NAIL_MOON = [246, 214, 206], NAIL_EDGE = [252, 243, 237];
  const SLEEVE = [249, 247, 243];
  const TILE_A = [138, 47, 110], TILE_B = [147, 93, 96];
  const CUFF = [-132, -106]; // revers de la manche, le long de l'avant-bras

  /* Doigts d'une main fine (côté pouce en x négatif, miroir pour l'autre main) :
     jointure, longueurs des phalanges, rayons de la base au bout */
  const FINGERS = [
    { k: [-14.5, 44.5], L: [22, 14, 11.5], r: [5.0, 4.6, 4.2, 3.85] },
    { k: [-4.8, 47], L: [24.5, 15.5, 12], r: [5.2, 4.8, 4.35, 4.0] },
    { k: [4.8, 46], L: [23, 14.5, 11.5], r: [4.9, 4.5, 4.1, 3.8] },
    { k: [13.8, 41], L: [17.5, 11, 10], r: [4.2, 3.9, 3.55, 3.25] },
  ];
  const POSES = {
    open: { flex: [[0.1, 0.12, 0.08], [0.08, 0.1, 0.07], [0.1, 0.12, 0.08], [0.13, 0.15, 0.1]], spread: [-0.1, -0.025, 0.05, 0.14], thumb: { a: -0.66, flex: [0.08, 0.12] } },
    hold: { flex: [[0.3, 0.36, 0.22], [0.28, 0.36, 0.22], [0.32, 0.38, 0.24], [0.36, 0.4, 0.26]], spread: [-0.08, -0.02, 0.04, 0.11], thumb: { a: -0.42, flex: [0.24, 0.22] } },
    grip: { flex: [[0.8, 0.95, 0.55], [0.76, 0.95, 0.55], [0.8, 0.98, 0.58], [0.85, 1.0, 0.6]], spread: [-0.03, 0, 0.02, 0.05], thumb: { a: -0.12, flex: [0.45, 0.38] } },
  };

  /* Capsule effilée (ou tube à bouts francs) : axe A→B, rayons, hauteurs de l'axe.
     grp : 0 = corps (fondu doux), 1..5 = doigts et pouce (phalanges fondues entre
     elles, doigts séparés les uns des autres), -1 = tissu posé par-dessus */
  function cap(ax, ay, bx, by, ra, rb, za, zb, kind, o) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1e-6;
    const m = Math.max(ra, rb) + 1;
    return Object.assign({
      ax, ay, bx, by, ra, rb, za, zb, kind, dx, dy, l2, len: Math.sqrt(l2), flat: 1, grp: 0, tube: false, fore: 1,
      x0: Math.min(ax, bx) - m, x1: Math.max(ax, bx) + m, y0: Math.min(ay, by) - m, y1: Math.max(ay, by) + m,
    }, o || {});
  }

  /* Avant-bras mince, poignet étroit, manche retroussée */
  function armParts(X) {
    return [
      cap(0, -330, 0, -70, 21.2, 18.8, 10, 9, 'arm', { flat: 0.8 }),
      // le dos du poignet descend en pente douce vers le dos de la main (lisse, sans bosse)
      cap(0, -70, 0, -5, 18.8, 16.2, 9, 4, 'arm', { flat: 0.8 }),
      cap(0, FRAME.y0 - 30, 0, CUFF[0] + 3, 27.5, 26.5, 15, 15, 'sleeve', { grp: -1, tube: true, flat: 0.72 }),
      cap(0, CUFF[0], 0, CUFF[1], 28.2, 27.6, 17, 17, 'cuff', { grp: -1, tube: true, flat: 0.72 }),
    ];
  }

  function handParts(side, pose) {
    const m = side, X = (x) => x * m; // le pouce est du côté du centre de la scène
    const P = POSES[pose];
    const parts = armParts(X);
    // dos de la main : une surface lisse, à peine bombée (pas de tendons en relief)
    parts.push(cap(0, 2, 0, 38, 15.5, 19.5, 10, 11.6, 'palm', { flat: 0.45 }));
    FINGERS.forEach((fg) => {
      parts.push(cap(X(fg.k[0] * 0.5), 6, X(fg.k[0]), fg.k[1] - 3, 6, fg.r[0] + 1, 10.4, 11.6, 'palm', { flat: 0.45 }));
    });
    parts.push(cap(X(-10.5), 3, X(-19), 23, 7.4, 6.6, 9.2, 10.6, 'palm', { flat: 0.72 })); // base du pouce
    // jointures : elles ne ressortent que quand le doigt se plie (le poing) ;
    // le doigt part de la jointure, à la même hauteur : pas de marche
    const kzOf = (i) => 11.6 + 2.6 * Math.min(1, P.flex[i][0] * 1.2);
    FINGERS.forEach((fg, i) => {
      const kz = kzOf(i);
      parts.push(cap(X(fg.k[0]), fg.k[1] - 1, X(fg.k[0]), fg.k[1] - 0.9, fg.r[0] + 0.6, fg.r[0] + 0.6, kz - 0.9, kz - 0.9, 'knuckle', { flat: 0.6 }));
    });
    // doigts : trois phalanges effilées qui se fondent l'une dans l'autre
    FINGERS.forEach((fg, i) => {
      const a0 = P.spread[i] * m;
      const dir = [Math.sin(a0), Math.cos(a0)];
      let x = X(fg.k[0]), y = fg.k[1] - 0.5, z = kzOf(i) - 1.2, cum = 0;
      for (let k = 0; k < 3; k++) {
        cum += P.flex[i][k];
        const Lp = fg.L[k] * Math.cos(cum), dz = -fg.L[k] * Math.sin(cum);
        const nx = x + dir[0] * Lp, ny = y + dir[1] * Lp;
        parts.push(cap(x, y, nx, ny, fg.r[k], fg.r[k + 1], z, z + dz, k === 2 ? 'distal' : 'finger', { grp: i + 1, joint: k, nailW: 0.7, fore: Math.cos(cum) }));
        x = nx; y = ny; z += dz;
      }
    });
    // pouce
    const T = P.thumb;
    let x = X(-19), y = 23, z = 10.4, cum = 0;
    [[17, 5.9, 5.4], [14.5, 5.4, 4.8]].forEach(([L, r0, r1], k) => {
      cum += T.flex[k];
      const a = (T.a - k * 0.12) * m;
      const Lp = L * Math.cos(cum), dz = -L * Math.sin(cum) * 0.7;
      const nx = x + Math.sin(a) * Lp, ny = y + Math.cos(a) * Lp;
      parts.push(cap(x, y, nx, ny, r0, r1, z, z + dz, k === 1 ? 'distal' : 'finger', { grp: 5, joint: k, nailW: 0.56, fore: Math.cos(cum) }));
      x = nx; y = ny; z += dz;
    });
    return parts;
  }

  function mittParts(side) {
    const m = side, X = (x) => x * m;
    const parts = armParts(X);
    parts.push(cap(0, -8, 0, 12, 24.5, 25, 17.5, 17.5, 'mcuff', { grp: -1, tube: true, flat: 0.7 }));
    parts.push(cap(0, 24, 0, 64, 26.5, 23.5, 16, 14.5, 'mitt', { flat: 0.78 }));
    parts.push(cap(X(-23), 24, X(-32), 48, 10.5, 9, 12.5, 11, 'mitt', { flat: 0.8 }));
    return parts;
  }

  const smax = (a, b, k) => {
    const h = Math.max(k - Math.abs(a - b), 0) / k;
    return Math.max(a, b) + (h * h * k) / 4;
  };
  const mix3 = (c, d, w) => { c[0] += (d[0] - c[0]) * w; c[1] += (d[1] - c[1]) * w; c[2] += (d[2] - c[2]) * w; };

  async function render(side, pose) {
    const B = KK.bake;
    const W = Math.round((FRAME.x1 - FRAME.x0) * PPU), H = Math.round((FRAME.y1 - FRAME.y0) * PPU);
    const F = B.newFields(W, H);
    const mitt = pose === 'mitt';
    const parts = mitt ? mittParts(side) : handParts(side, pose);
    const nA = KK.noise2(side > 0 ? 7 : 8), nB = KK.noise2(19), nC = KK.noise2(31);
    const fin = [0, 0, 0, 0, 0], col = [0, 0, 0];
    await B.sliced(H, (py) => {
      const y = FRAME.y0 + (py + 0.5) / PPU;
      for (let px = 0; px < W; px++) {
        const x = FRAME.x0 + (px + 0.5) / PPU, i = py * W + px;
        let alpha = 0, best = -Infinity, bp = null, bt = 0, bd = 0, br = 1, bu = 0;
        let hSoft = -Infinity, hHard = -Infinity;
        fin[0] = fin[1] = fin[2] = fin[3] = fin[4] = -Infinity;
        for (let q = 0; q < parts.length; q++) {
          const p = parts[q];
          if (x < p.x0 || x > p.x1 || y < p.y0 || y > p.y1) continue;
          const u = ((x - p.ax) * p.dx + (y - p.ay) * p.dy) / p.l2; // le long de l'axe (non borné)
          if (p.tube && (u < 0 || u > 1)) continue;
          const t = u < 0 ? 0 : u > 1 ? 1 : u;
          const ex = x - (p.ax + p.dx * t), ey = y - (p.ay + p.dy * t);
          const d = Math.sqrt(ex * ex + ey * ey);
          const r = p.ra + (p.rb - p.ra) * t;
          let cov = (r - d) * PPU + 0.5;
          if (p.tube) cov = Math.min(cov, Math.min(u, 1 - u) * p.len * PPU + 0.5);
          if (cov <= 0) continue;
          if (cov > alpha) alpha = cov > 1 ? 1 : cov;
          let hp = p.za + (p.zb - p.za) * t + p.flat * Math.sqrt(Math.max(0, r * r - d * d));
          if (p.kind === 'cuff') hp += 1.6 * Math.sin(Math.PI * t); // le revers roulé bombe
          if (p.grp === 0) hSoft = smax(hSoft, hp, 6);
          else if (p.grp > 0) fin[p.grp - 1] = smax(fin[p.grp - 1], hp, 1.1);
          else if (hp > hHard) hHard = hp;
          if (hp > best) { best = hp; bp = p; bt = t; bd = d; br = r; bu = u; }
        }
        F.a[i] = alpha;
        if (!bp) { F.h[i] = 0; continue; }
        let h = hSoft;
        for (let f = 0; f < 5; f++) if (fin[f] > -Infinity) h = Math.max(h, smax(fin[f], hSoft, 3.6));
        if (hHard > h) h = hHard;

        const k = bp.kind;
        let sp = 0.1, sh = 12;
        if (k === 'sleeve' || k === 'cuff') {
          // coton blanc : plis doux de la manche remontée, pli du revers
          const v = 0.985 + 0.015 * nC(x * 0.4, y * 0.4);
          col[0] = SLEEVE[0] * v; col[1] = SLEEVE[1] * v; col[2] = SLEEVE[2] * v;
          if (k === 'sleeve') {
            const fold = Math.sin(y * 0.19 + 2.2 * nA(x * 0.035, y * 0.02)) * (0.6 + 0.4 * nB(x * 0.05 + 3, y * 0.05));
            h += 1.5 * fold;
          } else if (Math.abs(bt - 0.5) < 0.035) {
            h -= 0.8;
            col[0] *= 0.95; col[1] *= 0.95; col[2] *= 0.96;
          }
          sp = 0.03; sh = 6;
        } else if (k === 'mitt' || k === 'mcuff') {
          // manique : damier du carrelage, matelassage, revers crème surpiqué
          if (k === 'mcuff') {
            col[0] = 238; col[1] = 228; col[2] = 212;
            const stitch = (Math.abs(bu - 0.18) < 0.03 || Math.abs(bu - 0.82) < 0.03) && ((x * 0.5) % 2 + 2) % 2 < 1.1;
            if (stitch) { col[0] = 190; col[1] = 176; col[2] = 160; }
          } else {
            const c = ((Math.floor(x / 7) + Math.floor(y / 7)) & 1) === 0 ? TILE_A : TILE_B;
            const v = 0.92 + 0.08 * nB(x * 0.9, y * 0.9);
            col[0] = c[0] * v; col[1] = c[1] * v; col[2] = c[2] * v;
            const q1 = Math.abs(Math.sin((x + y) * 0.2)), q2 = Math.abs(Math.sin((x - y) * 0.2));
            if (Math.min(q1, q2) < 0.12) { h -= 1.4; col[0] *= 0.82; col[1] *= 0.8; col[2] *= 0.8; }
            h += 0.4 * nA(x * 0.8, y * 0.8);
          }
          sp = 0.05; sh = 8;
        } else {
          // peau : teint régulier, à peine plus rosé aux jointures et au bout des doigts
          const v = 1 + 0.022 * nA(x * 0.05, y * 0.05) + 0.008 * nB(x * 0.3, y * 0.3);
          col[0] = SKIN[0] * v; col[1] = SKIN[1] * v; col[2] = SKIN[2] * v;
          const blush = k === 'knuckle' ? 0.35 : k === 'distal' ? 0.15 + 0.2 * bt : k === 'finger' ? 0.1 : k === 'arm' ? -0.2 : 0;
          col[0] += 9 * blush; col[1] -= 7 * blush; col[2] -= 5 * blush;
          // doigts repliés vers le bas : on voit leur dessus dans la pénombre, un peu éclairci
          if (bp.fore < 0.6) { const lift = (0.6 - Math.max(-0.4, bp.fore)) * 10; col[0] += lift; col[1] += lift * 0.9; col[2] += lift * 0.85; }
          // plis fins sur le dos de l'articulation du milieu (doigt tendu seulement)
          if (k === 'finger' && bp.joint === 0 && bp.grp < 5 && bp.fore > 0.9) {
            const a = (bu - 1) * bp.len;
            if (a > -3.2 && a < 0.8 && bd < br * 0.62) {
              const wr = 0.5 + 0.5 * Math.cos((a + 1.2) * 2.8), fade = 1 - bd / (br * 0.62);
              h -= 0.13 * wr * fade;
              col[0] -= 5 * wr * fade; col[1] -= 6 * wr * fade; col[2] -= 5 * wr * fade;
            }
          }
          // ongles : plaque nacrée, lunule claire, bord libre presque blanc
          if (k === 'distal' && bp.fore > 0.35) {
            const L = bp.len, rr = bp.rb;
            const along = bu * L, c0 = L * 0.4, c1 = L + rr * 0.72;
            if (along > c0 && along < c1 && bd < br - 0.3) {
              const wx = ((x - bp.ax) * bp.dy - (y - bp.ay) * bp.dx) / L;
              const ea = (along - (c0 + c1) / 2) / ((c1 - c0) / 2), eb = wx / (rr * bp.nailW);
              const q = Math.pow(Math.abs(ea), 2.6) + Math.pow(Math.abs(eb), 2.6);
              if (q < 1) {
                const inside = 1 - B.smooth(0.72, 1, q);
                const s = (along - c0) / (c1 - c0);
                const nail = [NAIL[0], NAIL[1], NAIL[2]];
                if (s < 0.24) mix3(nail, NAIL_MOON, 1 - s / 0.24);
                if (along > L + rr * 0.2) mix3(nail, NAIL_EDGE, B.smooth(L + rr * 0.2, L + rr * 0.42, along));
                mix3(col, nail, inside);
                h += 0.42 * inside;
                sp = 0.1 + 0.42 * inside; sh = 12 + 30 * inside;
              }
            }
          }
        }
        F.h[i] = h; F.r[i] = col[0]; F.g[i] = col[1]; F.b[i] = col[2]; F.sp[i] = sp; F.sh[i] = sh; F.dm[i] = 0;
      }
    });
    const img = await B.shade(F, { rpx: PPU, amp: 1, aoK: 0.035, aoMin: 0.72, wrap: 0.5, sss: mitt ? 0 : 0.08, blur: 12, amb: 0.56, dif: 0.56 });
    castShadow(F, img, W, H);
    return B.toURL(B.imgToCanvas(img));
  }

  /* Ombre portée douce de la main (pas de l'avant-bras) : elle pose la main dans la scène */
  function castShadow(F, img, W, H) {
    const B = KK.bake;
    const A = new Float32Array(W * H);
    const ox = Math.round(5 * PPU), oy = Math.round(15 * PPU);
    for (let py = oy; py < H; py++) {
      const fade = B.smooth(-70, -25, FRAME.y0 + (py - oy + 0.5) / PPU);
      if (fade <= 0) continue;
      const row = py * W, src = (py - oy) * W - ox;
      for (let px = ox; px < W; px++) A[row + px] = F.a[src + px] * fade;
    }
    const S = B.boxBlur(B.boxBlur(B.boxBlur(A, W, H, 10), W, H, 10), W, H, 10);
    const D = img.data;
    for (let i = 0; i < W * H; i++) {
      const s = S[i] * 0.13;
      if (s < 0.003) continue;
      const j = i * 4, a = D[j + 3] / 255;
      const oa = a + s * (1 - a);
      const kS = (s * (1 - a)) / oa, kH = a / oa;
      D[j] = D[j] * kH + 58 * kS;
      D[j + 1] = D[j + 1] * kH + 30 * kS;
      D[j + 2] = D[j + 2] * kH + 26 * kS;
      D[j + 3] = oa * 255;
    }
  }

  KK.hands = {
    FRAME, HOLD,
    sprite(side, pose, pri = 9) {
      return KK.bake.job(`main8:${side}:${pose}`, () => KK.bake.remoteOr({ kind: 'hand', side, pose }, () => render(side, pose)), pri);
    },
    render, // pour le worker
  };
})();
