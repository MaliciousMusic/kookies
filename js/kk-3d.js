/* ==========================================================================
   Kookies — la vitrine en 3D
   Les cookies de la carte sont de vrais volumes : la carte de hauteur cuite
   par kk-bake.js devient un maillage calé sur le contour (anneaux + rayons),
   éclairé en direct par un petit moteur WebGL maison : lumière chaude liée à
   la caméra, reflets du chocolat et des nappages, contre-jour doux, ombre de
   contact. On les attrape, on les fait tourner (inertie, retour en douceur).
   Les bouchées creusent le volume : la paroi montre la mie et les pépites.
   Un seul contexte WebGL pour toute la page : chaque vue est dessinée puis
   recopiée dans son propre <canvas>. Sans WebGL, la carte reste en 2D.
   ========================================================================== */
(function () {
  'use strict';

  const KK = window.KK;
  const { clamp, lerp, TAU, f } = KK;
  const R = 100; // rayon de référence des modèles (unités SVG)
  const FOV = 0.5; // ~29° : peu de déformation, le cookie remplit sa case
  const EL_MIN = -1.25, EL_MAX = 1.5; // de dessous (~72°) à presque vu de dessus
  const BITE_VIEW = 0.95; // la bouchée se présente de trois quarts, sur la droite
  const WORDS = ['CROC !', 'CRONCH', 'MIAM', 'SCRONCH', 'CRAC !'];
  const DOUGH3 = {
    golden: { bottom: [0.76, 0.49, 0.2], crust: [0.56, 0.33, 0.1], flat: [0.86, 0.62, 0.3] },
    cocoa: { bottom: [0.34, 0.21, 0.15], crust: [0.24, 0.14, 0.09], flat: [0.43, 0.28, 0.2] },
    pale: { bottom: [0.8, 0.62, 0.36], crust: [0.62, 0.45, 0.22], flat: [0.85, 0.71, 0.45] },
  };
  // mini kookies : quatre posés côte à côte, un cinquième par-dessus
  const PILE3 = [
    { p: [-0.45, 0, -0.27], s: 0.44, rotY: 0.4 }, { p: [0.45, 0, -0.3], s: 0.44, rotY: 2.1 },
    { p: [-0.32, 0, 0.42], s: 0.44, rotY: 4.0 }, { p: [0.36, 0, 0.4], s: 0.44, rotY: 1.2 },
    { p: [0.02, 0.19, 0.04], s: 0.44, rotY: 5.1, tilt: [0.16, -0.1] },
  ];

  /* ---------- Petite algèbre (matrices colonne par colonne, comme WebGL) ---------- */
  const M4 = {
    mul(a, b) {
      const o = new Float32Array(16);
      for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
          o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
        }
      }
      return o;
    },
    persp(fovy, asp, n, fa) {
      const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
      o[0] = t / asp; o[5] = t; o[10] = (fa + n) / (n - fa); o[11] = -1; o[14] = (2 * fa * n) / (n - fa);
      return o;
    },
    lookAt(e, c, u) {
      let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
      let l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
      let xx = u[1] * zz - u[2] * zy, xy = u[2] * zx - u[0] * zz, xz = u[0] * zy - u[1] * zx;
      l = Math.hypot(xx, xy, xz); xx /= l; xy /= l; xz /= l;
      const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
      return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0,
        -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
    },
    rotY(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); },
    rotX(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); },
    rotZ(a) { const c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); },
    scale(s) { return new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1]); },
    trans(x, y, z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]); },
    chain(...ms) { return ms.reduce((a, b) => M4.mul(a, b)); },
    apply(m, p) {
      const x = p[0], y = p[1], z = p[2];
      return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
    },
    nrm(m) { return new Float32Array([m[0], m[1], m[2], m[4], m[5], m[6], m[8], m[9], m[10]]); },
  };

  /* ---------- Shaders ---------- */
  const VS = `
attribute vec3 aPos; attribute vec3 aNrm; attribute vec2 aUV; attribute float aK;
uniform mat4 uPV; uniform mat4 uM; uniform mat3 uNMv;
varying vec2 vUV; varying vec3 vN; varying vec3 vP; varying float vK; varying vec3 vO;
void main() {
  vec4 w = uM * vec4(aPos, 1.0);
  vP = w.xyz; vN = uNMv * aNrm; vUV = aUV; vK = aK; vO = aPos;
  gl_Position = uPV * w;
}`;
  const FS = (deriv, prec) => `${deriv ? '#extension GL_OES_standard_derivatives : enable\n' : ''}precision ${prec} float;
uniform sampler2D uAlb; uniform sampler2D uNao; uniform sampler2D uMask; uniform sampler2D uCrumb; uniform sampler2D uCrumbN; uniform sampler2D uTop; uniform sampler2D uHgt;
uniform float uMode; uniform float uMaskOn; uniform float uE; uniform float uHgtK;
uniform mat3 uNM;
uniform vec3 uEye; uniform vec3 uUp; uniform vec3 uL1; uniform vec3 uL2; uniform vec3 uL3;
uniform vec3 uBottom; uniform vec3 uCrust; uniform vec3 uFlat;
varying vec2 vUV; varying vec3 vN; varying vec3 vP; varying float vK; varying vec3 vO;
// ce qui reste après les bouchées (1) ou ce qui a été croqué (0), bord adouci
float cover(vec2 uv) {
  float m = texture2D(uMask, uv).a;
  ${deriv ? 'float w = fwidth(m) * 0.8 + 0.002; return smoothstep(0.5 - w, 0.5 + w, m);' : 'return smoothstep(0.38, 0.62, m);'}
}
void main() {
  vec3 alb; vec3 n; float spec; float ao; float a = 1.0;
  if (uMode > 1.5 && uMode < 2.5) {
    // paroi de morsure : mie dense et mate (couleur + relief doux calculés comme le dessus),
    // une fine croûte dorée sur le haut
    vec4 C = texture2D(uCrumb, vUV);
    vec4 CN = texture2D(uCrumbN, vUV);
    alb = mix(C.rgb, uCrust, smoothstep(0.86, 0.98, vK) * 0.7);
    vec3 n0 = normalize(vN);
    vec3 U = normalize(uNM * vec3(0.0, 1.0, 0.0));
    vec3 T = normalize(cross(U, n0));
    vec3 t = CN.rgb * 2.0 - 1.0;
    n = normalize(T * t.x + U * t.z + n0 * t.y);
    ao = CN.a * mix(0.76, 1.0, smoothstep(0.0, 0.3, vK));
    spec = C.a * 1.2;
  } else if (uMode > 3.5) {
    // topping solide (bloc Kinder Country, barre Bueno) : un vrai objet posé sur le cookie,
    // croqué par les mêmes bouchées que lui (masque lu à sa position dans le plan du cookie)
    vec2 q = (vO.xz + uE) / (2.0 * uE);
    if (uMaskOn > 0.5) {
      a = cover(q);
      if (a < 0.02) discard;
    }
    // la partie plantée dans la pâte reste invisible, même au bord d'une bouchée
    if (uMode < 4.5 && vO.y < texture2D(uHgt, q).a * uHgtK - 0.006) discard;
    vec4 C = texture2D(uTop, vUV);
    alb = C.rgb; spec = C.a * 1.2;
    n = normalize(vN);
    ao = vK;
  } else {
    vec4 A = texture2D(uAlb, vUV);
    if (uMaskOn > 0.5) {
      a = cover(vUV);
      if (a < 0.02) discard;
    }
    if (uMode > 2.5) {
      alb = uFlat; n = normalize(vN); ao = 1.0; spec = 0.08;
    } else if (uMode > 0.5) {
      // dessous : doré, lisse, la trame de la pâte en léger relief de couleur
      float l = dot(A.rgb, vec3(0.3, 0.59, 0.11));
      alb = uBottom * (0.78 + 0.45 * l);
      n = normalize(uNM * vec3(0.0, -1.0, 0.0));
      ao = 0.95; spec = 0.05;
    } else {
      vec4 Q = texture2D(uNao, vUV);
      alb = A.rgb; spec = A.a * 1.2;
      n = normalize(uNM * (Q.rgb * 2.0 - 1.0));
      ao = Q.a;
      // flanc du cookie (vK → 1) : normale géométrique, un peu plus doré-cuit
      if (vK > 0.001) {
        n = normalize(mix(n, normalize(vN), vK));
        alb *= mix(1.0, 0.9, vK);
        ao = mix(ao, 0.82, vK);
      }
    }
  }
  vec3 v = normalize(uEye - vP);
  float d1 = dot(n, uL1);
  float wrap = max((d1 + 0.3) / 1.3, 0.0);
  float d2 = max(dot(n, uL2), 0.0);
  vec3 amb = mix(vec3(0.36, 0.31, 0.28), vec3(0.52, 0.49, 0.46), dot(n, uUp) * 0.5 + 0.5);
  // l'intérieur d'une bouchée reçoit un peu de lumière rebondie (sinon la mie paraît grise)
  float bounce = ((uMode > 1.5 && uMode < 2.5) || uMode > 4.5) ? 1.22 : 1.0;
  vec3 col = alb * (amb * ao * bounce + vec3(0.74, 0.7, 0.64) * wrap * (0.55 + 0.45 * ao) + vec3(0.15, 0.16, 0.19) * d2 * ao * bounce);
  vec3 h = normalize(uL1 + v);
  float sh = 8.0 + 75.0 * spec;
  col += vec3(1.0, 0.95, 0.88) * spec * 0.85 * pow(max(dot(n, h), 0.0), sh) * step(0.0, d1);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0) * (bounce > 1.0 ? 0.0 : 1.0); // la mie reste mate
  col += vec3(1.0, 0.86, 0.7) * rim * 0.1 * max(dot(n, uL3), 0.0) * ao;
  gl_FragColor = vec4(col * a, a);
}`;
  const VS_SH = `
attribute vec2 aXZ; uniform mat4 uPV; uniform mat4 uM; uniform vec2 uR; varying vec2 vQ;
void main() { vQ = aXZ; gl_Position = uPV * uM * vec4(aXZ.x * uR.x, 0.002, aXZ.y * uR.y, 1.0); }`;
  const FS_SH = `precision mediump float; varying vec2 vQ; uniform float uA;
void main() {
  float d = length(vQ);
  float a = uA * (0.6 * (1.0 - smoothstep(0.25, 1.0, d)) + 0.4 * pow(1.0 - smoothstep(0.0, 0.8, d), 2.0));
  gl_FragColor = vec4(vec3(0.17, 0.08, 0.06) * a, a);
}`;

  /* ---------- Contexte partagé ---------- */
  let gl = null, glCv = null, failed = false, lost = false, deriv = false, aniso = null, msaa = false;
  let P = null, PS = null, white = null, quad = null;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(vs, fs, attribs) {
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
    attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (let i = 0, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      u[info.name] = gl.getUniformLocation(p, info.name);
    }
    return { p, u, n: attribs.length };
  }
  function buffer(data, target, usage) {
    const b = gl.createBuffer();
    gl.bindBuffer(target || gl.ARRAY_BUFFER, b);
    gl.bufferData(target || gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
    return b;
  }
  function texture(src, w, h, o = {}) {
    const t = gl.createTexture();
    const fmt = o.fmt || gl.RGBA;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (ArrayBuffer.isView(src)) {
      const data = src instanceof Uint8Array ? src : new Uint8Array(src.buffer, src.byteOffset, src.byteLength);
      gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, fmt, gl.UNSIGNED_BYTE, data);
    } else gl.texImage2D(gl.TEXTURE_2D, 0, fmt, fmt, gl.UNSIGNED_BYTE, src);
    const pot = (w & (w - 1)) === 0 && (h & (h - 1)) === 0;
    if (pot && o.mip) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, 4);
    } else gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  function setup() {
    deriv = !!gl.getExtension('OES_standard_derivatives');
    aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
    msaa = (gl.getParameter(gl.SAMPLES) || 0) > 0;
    const hp = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    P = program(VS, FS(deriv, hp && hp.precision > 0 ? 'highp' : 'mediump'), ['aPos', 'aNrm', 'aUV', 'aK']);
    PS = program(VS_SH, FS_SH, ['aXZ']);
    white = texture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    quad = buffer(new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]));
  }

  function init() {
    if (gl || failed) return !!gl;
    try {
      glCv = document.createElement('canvas');
      glCv.width = glCv.height = 512;
      const o = { alpha: true, premultipliedAlpha: true, antialias: true, depth: true, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' };
      gl = glCv.getContext('webgl', o) || glCv.getContext('experimental-webgl', o);
      if (!gl) throw new Error('pas de WebGL');
      setup();
      glCv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; });
      glCv.addEventListener('webglcontextrestored', () => {
        setup();
        lost = false;
        viewers.forEach((v) => v.restore());
        kick();
      });
    } catch (e) {
      failed = true;
      gl = null;
    }
    return !!gl;
  }

  /* ---------- Géométrie ---------- */
  function bilinear(H, N, fx, fy) {
    fx = fx < 0 ? 0 : fx > N - 1.001 ? N - 1.001 : fx;
    fy = fy < 0 ? 0 : fy > N - 1.001 ? N - 1.001 : fy;
    const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0, i = y0 * N + x0;
    return (H[i] * (1 - tx) + H[i + 1] * tx) * (1 - ty) + (H[i + N] * (1 - tx) + H[i + N + 1] * tx) * ty;
  }

  /* Contour du « stick » (stade bosselé) : recherche par dichotomie le long de chaque rayon */
  function stickRho(model) {
    const nA = KK.noise2((model.seed >>> 0) ^ 0x9e3779b9);
    const L = 1.05, h0 = 0.4, amp = model.stickAmp || 0.035;
    const inside = (x, y) => {
      const qx = Math.max(-L, Math.min(L, x));
      return Math.hypot(x - qx, y) < h0 + amp * nA(x * 2.2 + 40, y * 2.2);
    };
    return (th) => {
      const c = Math.cos(th), s = Math.sin(th);
      let lo = 0, hi = 1.8;
      for (let k = 0; k < 22; k++) {
        const m = (lo + hi) / 2;
        if (inside(c * m, s * m)) lo = m; else hi = m;
      }
      return lo;
    };
  }

  /* Surface du dessus : anneaux calés sur le contour (le bord est net, sans masque),
     un dernier anneau très serré dessine le flanc abrupt du cookie épais */
  function topMesh(hf, rh, rings) {
    const E = hf.E, N = hf.N, k = N / (2 * E), segs = rh.length;
    const V = new Float32Array((1 + rings * segs) * 9);
    const put = (i, x, y, h) => {
      const o = i * 9;
      V[o] = x; V[o + 1] = h; V[o + 2] = y; V[o + 3] = 0; V[o + 4] = 1; V[o + 5] = 0;
      V[o + 6] = (x + E) / (2 * E); V[o + 7] = (y + E) / (2 * E); V[o + 8] = 0;
    };
    const hAt = (x, y) => bilinear(hf.h, N, (x + E) * k - 0.5, (y + E) * k - 0.5);
    // normale géométrique (utile au cookie provisoire, avant la carte de normales)
    const e = 1.2 / k;
    const nrm = (i, x, y) => {
      const gx = (hAt(x + e, y) - hAt(x - e, y)) / (2 * e), gy = (hAt(x, y + e) - hAt(x, y - e)) / (2 * e);
      const inv = 1 / Math.sqrt(gx * gx + gy * gy + 1), o = i * 9;
      V[o + 3] = -gx * inv; V[o + 4] = inv; V[o + 5] = -gy * inv;
    };
    put(0, 0, 0, hAt(0, 0));
    for (let r = 1; r <= rings; r++) {
      const fr = r === rings ? 1 : Math.pow(r / (rings - 1), 0.85) * 0.985;
      for (let s = 0; s < segs; s++) {
        const th = (s / segs) * TAU, rr = rh[s] * fr;
        const x = Math.cos(th) * rr, y = Math.sin(th) * rr, i = 1 + (r - 1) * segs + s;
        put(i, x, y, r === rings ? 0 : hAt(x, y));
        if (r < rings) nrm(i, x, y);
        else {
          // le flanc : normale vers l'extérieur, et la texture d'une bande juste à l'intérieur
          // du bord (sinon la dernière rangée de pixels serait étirée en traînées)
          const o = i * 9, ri = rh[s] * 0.9;
          V[o + 3] = Math.cos(th) * 0.9; V[o + 4] = 0.44; V[o + 5] = Math.sin(th) * 0.9;
          V[o + 6] = (Math.cos(th) * ri + E) / (2 * E); V[o + 7] = (Math.sin(th) * ri + E) / (2 * E); V[o + 8] = 1;
        }
      }
    }
    const I = new Uint16Array(segs * 3 + (rings - 1) * segs * 6);
    let n = 0;
    for (let s = 0; s < segs; s++) { I[n++] = 0; I[n++] = 1 + s; I[n++] = 1 + ((s + 1) % segs); }
    for (let r = 1; r < rings; r++) {
      const a0 = 1 + (r - 1) * segs, b0 = 1 + r * segs;
      for (let s = 0; s < segs; s++) {
        const s1 = (s + 1) % segs;
        I[n++] = a0 + s; I[n++] = b0 + s; I[n++] = b0 + s1;
        I[n++] = a0 + s; I[n++] = b0 + s1; I[n++] = a0 + s1;
      }
    }
    return { V, I };
  }

  /* Carte de hauteur du dessus sur 8 bits (0..k), lue par les toppings */
  function heightTex(hf) {
    const n = hf.N * hf.N, H = hf.h;
    let k = 0.05;
    for (let i = 0; i < n; i++) if (H[i] > k) k = H[i];
    k *= 1.02;
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) data[i] = Math.max(0, Math.min(255, Math.round((H[i] / k) * 255)));
    return { data, k };
  }

  /* Dessous plat, cousu au dernier anneau du dessus */
  function bottomMesh(E, rh) {
    const segs = rh.length, V = new Float32Array((1 + segs) * 9);
    const put = (i, x, y) => {
      const o = i * 9;
      V[o] = x; V[o + 1] = 0; V[o + 2] = y; V[o + 3] = 0; V[o + 4] = -1; V[o + 5] = 0;
      V[o + 6] = (x + E) / (2 * E); V[o + 7] = (y + E) / (2 * E); V[o + 8] = 0;
    };
    put(0, 0, 0);
    for (let s = 0; s < segs; s++) {
      const th = (s / segs) * TAU;
      put(1 + s, Math.cos(th) * rh[s], Math.sin(th) * rh[s]);
    }
    const I = new Uint16Array(segs * 3);
    for (let s = 0, n = 0; s < segs; s++) { I[n++] = 0; I[n++] = 1 + ((s + 1) % segs); I[n++] = 1 + s; }
    return { V, I };
  }

  /* Contour d'une bouchée, lissé (Catmull-Rom), resserré autour de son centre pendant qu'on croque */
  function biteLoop(b, k) {
    const p = b.pts, n = p.length, cx = b.cx, cy = b.cy, out = [];
    const at = (i) => { const q = p[(i + n) % n]; return [(cx + (q[0] - cx) * k) / R, (cy + (q[1] - cy) * k) / R]; };
    for (let i = 0; i < n; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let s = 0; s < 3; s++) {
        const t = s / 3, t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
        ]);
      }
    }
    return out;
  }

  /* La bouchée b (déjà prise) contient-elle le point ? (rayon polaire autour de son centre) */
  function inBite(b, x, y, k = 1) {
    const cx = b.cx / R, cy = b.cy / R, dx = x - cx, dy = y - cy;
    const n = b.pts.length;
    if (!b.rad) b.rad = b.pts.map((q) => Math.hypot(q[0] - b.cx, q[1] - b.cy) / R);
    let a = Math.atan2(dy, dx) / TAU;
    a = (a - Math.floor(a)) * n;
    const i0 = Math.floor(a) % n, fr = a - Math.floor(a);
    const rr = (b.rad[i0] * (1 - fr) + b.rad[(i0 + 1) % n] * fr) * k;
    return dx * dx + dy * dy < rr * rr;
  }

  /* ======================================================================
     Toppings solides : de vrais objets posés (ou plantés) sur le cookie,
     avec leurs flancs, leurs arêtes arrondies et leur cassure
     ====================================================================== */
  const sm01 = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };

  /* Atlas 256×256 (couleur + brillance dans l'alpha) peint pixel par pixel */
  function atlas(fn) {
    const S = 256, D = new Uint8ClampedArray(S * S * 4), c = [0, 0, 0, 0];
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        fn((px + 0.5) / S, (py + 0.5) / S, c);
        const j = (py * S + px) * 4;
        D[j] = c[0]; D[j + 1] = c[1]; D[j + 2] = c[2]; D[j + 3] = (c[3] / 1.2) * 255;
      }
    }
    return D;
  }

  /* Barre Kinder Bueno : haut = enrobage chocolat au lait + filets ; bas = la cassure */
  function buenoAtlas(tp, seed) {
    const nB = KK.noise2(seed ^ 0x51f15e5d), nC = KK.noise2(seed ^ 0x2c1b3c6d);
    const hx = tp.hx, seg = tp.hy * 1.9;
    return atlas((u, v, c) => {
      if (v < 0.5) {
        const lx = -hx + u * 2 * hx, q = v * 4 - 1;
        const vv = 0.95 + 0.07 * nB(u * 30 + tp.o, v * 12);
        c[0] = 138 * vv; c[1] = 84 * vv; c[2] = 50 * vv; c[3] = 0.42;
        const s = (lx + hx) / seg, sl = s - 0.3 * q - 0.15 * q * q;
        const fr = sl - Math.round(sl), wS = 0.013 / seg;
        const dS = Math.min(Math.abs(fr - 0.18), Math.abs(fr + 0.18));
        if (dS < wS * 1.6 && sl > 0.05) {
          const e = 1 - sm01(wS * 0.6, wS * 1.6, dS);
          c[0] += (64 - c[0]) * e; c[1] += (35 - c[1]) * e; c[2] += (20 - c[2]) * e; c[3] += 0.15 * e;
        }
      } else {
        // cassure : fin enrobage, coque de gaufrette blonde, crème lait-noisette au cœur
        const t = u * 2 - 1, zf = 1 - (v - 0.5) * 2;
        const top = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.4)), 0.42);
        const d = Math.min(top - zf, (1 - Math.abs(t)) * 0.7, zf * 0.9);
        if (d < 0.06) { c[0] = 116; c[1] = 68; c[2] = 40; c[3] = 0.35; }
        else if (d < 0.17) {
          // la gaufrette : dorée, finement feuilletée (des stries, pas des trous)
          const g = 0.93 + 0.06 * nC(u * 46, v * 46) + 0.04 * Math.sin((d - 0.06) * 150);
          c[0] = 206 * g; c[1] = 150 * g; c[2] = 84 * g; c[3] = 0.04;
        } else {
          // la crème lait-noisette : claire, lisse, un peu brillante
          const g = 0.97 + 0.03 * nB(u * 12 + 3, v * 12);
          c[0] = 232 * g; c[1] = 204 * g; c[2] = 160 * g; c[3] = 0.32;
        }
      }
    });
  }

  /* Bloc Kinder Country : chocolat au lait, cadre en relief sur les grandes faces ;
     la cassure montre la crème de lait et les céréales (en éclats, pas en trous) */
  function countryAtlas(seed) {
    const nB = KK.noise2(seed ^ 0x51f15e5d), nC = KK.noise2(seed ^ 0x2c1b3c6d);
    return atlas((u, v, c) => {
      if (v < 0.5) {
        const y = v * 2, vv = 0.94 + 0.07 * nB(u * 24, y * 24);
        c[0] = 126 * vv; c[1] = 80 * vv; c[2] = 51 * vv; c[3] = 0.45;
        // cadre en relief : un liseré clair, un liseré sombre (biseau)
        const e = Math.min(u, 1 - u, y * 1.6, (1 - y) * 1.6);
        if (e > 0.06 && e < 0.085) { c[0] *= 1.16; c[1] *= 1.14; c[2] *= 1.12; }
        else if (e >= 0.085 && e < 0.105) { c[0] *= 0.82; c[1] *= 0.8; c[2] *= 0.8; }
        // épis stylisés, à peine marqués
        const sx = (u - 0.5) * 4, sy = y - 0.52;
        if (Math.abs(sy) < 0.2 && Math.abs(Math.sin(sx * 9 + sy * 14)) > 0.93) { c[0] *= 1.08; c[1] *= 1.07; c[2] *= 1.06; }
      } else {
        const y = (v - 0.5) * 2, e = Math.min(u, 1 - u, y, 1 - y);
        if (e < 0.09) { c[0] = 118; c[1] = 74; c[2] = 46; c[3] = 0.3; return; }
        // la crème de lait, bien blanche, et quelques éclats de céréales dorés (pas de trous)
        const g = 0.97 + 0.03 * nB(u * 14, y * 14);
        c[0] = 250 * g; c[1] = 242 * g; c[2] = 222 * g; c[3] = 0.12;
        const k = nC(u * 8 + 5, y * 17);
        if (k > 0.46) { const w = 0.85 * sm01(0.46, 0.62, k); c[0] += (222 - c[0]) * w; c[1] += (178 - c[1]) * w; c[2] += (108 - c[2]) * w; }
      }
    });
  }

  /* Normales lissées à partir des triangles (pour une surface continue) */
  function smoothNormals(V, I, from = 0, to = V.length / 9) {
    const acc = new Float32Array((to - from) * 3);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      if (a < from || a >= to || b < from || b >= to || c < from || c >= to) continue;
      const ax = V[a * 9], ay = V[a * 9 + 1], az = V[a * 9 + 2];
      const ux = V[b * 9] - ax, uy = V[b * 9 + 1] - ay, uz = V[b * 9 + 2] - az;
      const vx = V[c * 9] - ax, vy = V[c * 9 + 1] - ay, vz = V[c * 9 + 2] - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      [a, b, c].forEach((q) => { const o = (q - from) * 3; acc[o] += nx; acc[o + 1] += ny; acc[o + 2] += nz; });
    }
    for (let q = from; q < to; q++) {
      const o = (q - from) * 3, l = Math.hypot(acc[o], acc[o + 1], acc[o + 2]) || 1;
      V[q * 9 + 3] = acc[o] / l; V[q * 9 + 4] = acc[o + 1] / l; V[q * 9 + 5] = acc[o + 2] / l;
    }
  }

  /* Oriente toutes les normales d'une plage vers l'extérieur (vers « out ») si besoin */
  function faceOut(V, from, to, ox, oy, oz) {
    for (let q = from; q < to; q++) {
      const o = q * 9, d = (V[o] - ox) * V[o + 3] + (V[o + 1] - oy) * V[o + 4] + (V[o + 2] - oz) * V[o + 5];
      if (d < 0) { V[o + 3] = -V[o + 3]; V[o + 4] = -V[o + 4]; V[o + 5] = -V[o + 5]; }
    }
  }

  /* Profil de la barre Bueno : bombé, bosses (segments), bout arrondi, bout cassé.
     Partagé par le maillage et par la coupe quand une bouchée la traverse. */
  function buenoShape(tp, it) {
    const hx = tp.hx, hy = tp.hy, seg = hy * 1.9, H0 = 0.25, r0 = hy * 0.85;
    const nC = KK.noise2((it.m.seed >>> 0) ^ 0x2c1b3c6d);
    const valley = (lx) => { const q = (lx + hx) / seg, k = Math.round(q); return k > 0 ? Math.exp(-Math.pow(((q - k) * seg) / 0.055, 2)) : 0; };
    const endK = (lx) => (lx < -hx + r0 ? Math.sqrt(Math.max(0, 1 - Math.pow((-hx + r0 - lx) / r0, 2))) : 1);
    const xEnd = (t) => hx - 0.03 * (0.5 + 0.5 * nC(t * 3 + tp.brk, tp.brk)) - 0.012 * Math.abs(t);
    const baseZ = it.heightAt(tp.x, tp.y) - 0.025;
    const zAt = (lx, t) => {
      const val = valley(lx), ek = endK(lx);
      return baseZ + (tp.tiltB * lx) / hx + H0 * (1 - 0.16 * val) * Math.pow(ek, 0.6) * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.4)), 0.42);
    };
    const width = (lx) => hy * (1 - 0.07 * valley(lx)) * endK(lx);
    return { hx, hy, c: tp.c, s: tp.s, valley, endK, xEnd, baseZ, zAt, width };
  }

  /* Morceau de Kinder Bueno posé sur la crème */
  function buenoMesh(tp, it) {
    const B = buenoShape(tp, it), { hx, hy, c, s, valley, xEnd, baseZ, zAt } = B;
    const V = [], I = [], NU = 72, NT = 22;
    const put = (lx, ly, z, u, v, k) => V.push(tp.x + lx * c - ly * s, z, tp.y + lx * s + ly * c, 0, 1, 0, u, v, k);
    for (let i = 0; i <= NU; i++) {
      for (let j = 0; j <= NT; j++) {
        const t = -1 + (2 * j) / NT, lx = -hx + (i / NU) * (xEnd(t) + hx);
        const w = B.width(lx), z = zAt(lx, t);
        put(lx, t * w, z, (lx + hx) / (2 * hx), ((t + 1) / 2) * 0.5, 0.72 + 0.28 * sm01(0, 0.07, z - baseZ));
      }
    }
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NT; j++) {
        const a = i * (NT + 1) + j, b = a + NT + 1;
        I.push(a, b, b + 1, a, b + 1, a + 1);
      }
    }
    const topN = V.length / 9;
    smoothNormals(V, I, 0, topN);
    faceOut(V, 0, topN, tp.x, baseZ - 0.3, tp.y);
    // la cassure : un couvercle qui suit le profil (bandes verticales), avec les couches de la barre
    const capBase = topN;
    for (let j = 0; j <= NT; j++) {
      const t = -1 + (2 * j) / NT, lx = xEnd(t), w = hy * (1 - 0.07 * valley(lx)), z = zAt(lx, t);
      const H = Math.max(1e-3, zAt(lx, 0) - baseZ), zf = clamp((z - baseZ) / H);
      put(lx, t * w, z, (t + 1) / 2, 0.5 + 0.5 * (1 - zf), 0.9);
      put(lx, t * w, baseZ, (t + 1) / 2, 1, 0.75);
    }
    for (let j = 0; j < NT; j++) {
      const q = capBase + j * 2;
      I.push(q, q + 1, q + 3, q, q + 3, q + 2);
    }
    for (let q = capBase; q < V.length / 9; q++) { V[q * 9 + 3] = c; V[q * 9 + 4] = 0.05; V[q * 9 + 5] = s; }
    return { V: new Float32Array(V), I: new Uint16Array(I), foot: footprint(tp.x, tp.y, c, s, hx, hy) };
  }

  /* Bloc de Kinder Country planté de biais : pavé aux arêtes arrondies, une extrémité cassée */
  function countryShape(tp, it) {
    // un gros morceau, comme en boutique : bien visible, planté dans la pâte
    const L = tp.hx * 2.05, T = 0.2, Hs = 0.56;
    const lean = 0.42, roll = tp.tilt * 0.5; // penché vers l'arrière, un bout plus haut
    return {
      a: L / 2, b: T / 2, h2: Hs / 2, Hs, rr: 0.03, c: tp.c, s: tp.s,
      cl: Math.cos(lean), sl: Math.sin(lean), cr: Math.cos(roll), sr: Math.sin(roll),
      zBase: it.heightAt(tp.x, tp.y) - 0.12, // enfoncé dans la pâte
    };
  }

  function countryMesh(tp, it) {
    const { a, b, h2, rr, c, s, cl, sl, cr, sr, zBase } = countryShape(tp, it);
    const nC = KK.noise2((it.m.seed >>> 0) ^ 0x6a09e667);
    const V = [], I = [], NN = 12;
    const rot = (x, y, z) => {
      // roulis autour de y (un bout plus haut), puis inclinaison autour de x (penché en arrière)
      const x1 = x * cr + z * sr, z1 = -x * sr + z * cr;
      const y2 = y * cl - z1 * sl, z2 = y * sl + z1 * cl;
      return [x1, y2, z2];
    };
    const faces = [
      [[1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, -1, 0], [0, 0, 1]],
      [[0, 1, 0], [-1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
      [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, -1, 0]],
    ];
    const half = [a, b, h2];
    let brokeFrom = 0, brokeTo = 0;
    faces.forEach(([n, uA, vA], fi) => {
      const base = V.length / 9;
      if (fi === 0) brokeFrom = base;
      for (let i = 0; i <= NN; i++) {
        for (let j = 0; j <= NN; j++) {
          const fu = -1 + (2 * i) / NN, fv = -1 + (2 * j) / NN;
          const p = [0, 1, 2].map((k) => n[k] * half[k] + uA[k] * fu * half[k] + vA[k] * fv * half[k]);
          const q = p.map((v, k) => clamp(v, -(half[k] - rr), half[k] - rr));
          let d = [p[0] - q[0], p[1] - q[1], p[2] - q[2]], l = Math.hypot(d[0], d[1], d[2]);
          if (l < 1e-6) { d = n.slice(); l = 1; }
          const nn = [d[0] / l, d[1] / l, d[2] / l];
          const pos = [q[0] + nn[0] * rr, q[1] + nn[1] * rr, q[2] + nn[2] * rr];
          if (fi === 0) pos[0] -= 0.035 * (0.5 + 0.5 * nC(pos[1] * 22 + 3, pos[2] * 22)); // cassure irrégulière
          let u, v;
          if (fi === 0) { u = (pos[1] + b) / (2 * b); v = 0.5 + 0.5 * ((pos[2] + h2) / (2 * h2)); }
          else if (fi === 2 || fi === 3) { u = (pos[0] + a) / (2 * a); v = 0.5 * (1 - (pos[2] + h2) / (2 * h2)); }
          else { u = 0.3 + 0.4 * ((fu + 1) / 2); v = 0.12 + 0.26 * ((fv + 1) / 2); }
          const w = rot(pos[0], pos[1], pos[2] + h2), wn = rot(nn[0], nn[1], nn[2]);
          const X = tp.x + w[0] * c - w[1] * s, Y = tp.y + w[0] * s + w[1] * c, Z = zBase + w[2];
          const ao = 0.62 + 0.38 * sm01(-0.02, 0.12, Z - it.heightAt(X, Y));
          V.push(X, Z, Y, wn[0] * c - wn[1] * s, wn[2], wn[0] * s + wn[1] * c, u, v, ao);
        }
      }
      for (let i = 0; i < NN; i++) {
        for (let j = 0; j < NN; j++) {
          const q0 = base + i * (NN + 1) + j, q1 = q0 + NN + 1;
          I.push(q0, q1, q1 + 1, q0, q1 + 1, q0 + 1);
        }
      }
      if (fi === 0) brokeTo = V.length / 9;
    });
    // la face cassée a son propre relief : normales recalculées sur elle seule
    smoothNormals(V, I, brokeFrom, brokeTo);
    faceOut(V, brokeFrom, brokeTo, tp.x, zBase + h2, tp.y);
    return { V: new Float32Array(V), I: new Uint16Array(I), foot: footprint(tp.x, tp.y, c, s, a, b + 0.08) };
  }

  /* Coupe d'un topping par la verticale (x, y) : de la surface du cookie jusqu'au dessus
     du topping, avec la position dans l'atlas de sa cassure (null si on n'y est pas) */
  function buenoSection(tp, it) {
    const B = buenoShape(tp, it), { hx, hy, c, s } = B, R2 = hx + hy;
    return (x, y) => {
      const dx = x - tp.x, dy = y - tp.y;
      if (dx * dx + dy * dy > R2 * R2) return null;
      const lx = dx * c + dy * s, ly = -dx * s + dy * c;
      if (lx < -hx || lx > hx) return null;
      const w = B.width(lx);
      if (w < 1e-4) return null;
      const t = ly / w;
      if (Math.abs(t) > 1 || lx > B.xEnd(t)) return null;
      const z1 = B.zAt(lx, t), z0 = Math.max(B.baseZ, it.heightAt(x, y) - 0.002);
      if (z1 - z0 < 0.004) return null;
      const H = Math.max(1e-3, B.zAt(lx, 0) - B.baseZ), u = (t + 1) / 2;
      return { z0, z1, uv: (Z) => [u, 0.5 + 0.5 * (1 - clamp((Z - B.baseZ) / H))] };
    };
  }

  function countrySection(tp, it) {
    const { a, b, h2, Hs, rr, c, s, cl, sl, cr, sr, zBase } = countryShape(tp, it);
    const R2 = a + b + h2, ia = a - rr, ib = b - rr, ih = h2 - rr;
    const D = [-cl * sr, sl, cl * cr]; // la verticale, vue dans le repère du bloc
    const local = (w0, w1, w2) => {
      const y = w1 * cl + w2 * sl, z1 = -w1 * sl + w2 * cl;
      return [w0 * cr - z1 * sr, y, w0 * sr + z1 * cr];
    };
    const sd = (x, y, z) => { // pavé aux arêtes arrondies
      const qx = Math.abs(x) - ia, qy = Math.abs(y) - ib, qz = Math.abs(z - h2) - ih;
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - rr;
    };
    const lo = [-a, -b, 0], hi = [a, b, Hs];
    return (x, y) => {
      const dx = x - tp.x, dy = y - tp.y;
      if (dx * dx + dy * dy > R2 * R2) return null;
      const p0 = local(dx * c + dy * s, -dx * s + dy * c, -zBase);
      let t0 = -1e9, t1 = 1e9;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(D[k]) < 1e-9) { if (p0[k] < lo[k] || p0[k] > hi[k]) return null; continue; }
        let ta = (lo[k] - p0[k]) / D[k], tb = (hi[k] - p0[k]) / D[k];
        if (ta > tb) { const q = ta; ta = tb; tb = q; }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
      }
      if (t1 <= t0) return null;
      const f = (Z) => sd(p0[0] + Z * D[0], p0[1] + Z * D[1], p0[2] + Z * D[2]);
      let best = t0, bv = 1e9;
      for (let i = 0; i <= 12; i++) { const Z = t0 + ((t1 - t0) * i) / 12, v = f(Z); if (v < bv) { bv = v; best = Z; } }
      if (bv >= 0) return null;
      let l = t0, h = best;
      for (let i = 0; i < 14; i++) { const m = (l + h) / 2; if (f(m) < 0) h = m; else l = m; }
      const zLo = h;
      l = best; h = t1;
      for (let i = 0; i < 14; i++) { const m = (l + h) / 2; if (f(m) < 0) l = m; else h = m; }
      const z0 = Math.max(zLo, it.heightAt(x, y) - 0.002), z1 = l;
      if (z1 - z0 < 0.004) return null;
      return {
        z0, z1,
        uv: (Z) => [clamp((p0[1] + Z * D[1] + b) / (2 * b)), 0.5 + 0.5 * clamp((p0[2] + Z * D[2]) / Hs)],
      };
    };
  }

  /* Points de l'empreinte d'un topping */
  function footprint(x0, y0, c, s, hx, hy) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      for (let j = 0; j <= 2; j++) {
        const lx = -hx + (2 * hx * i) / 6, ly = -hy + (2 * hy * j) / 2;
        pts.push([x0 + lx * c - ly * s, y0 + lx * s + ly * c]);
      }
    }
    return pts;
  }

  /* ======================================================================
     Un cookie (ou un mini du tas) : maillages, textures, bouchées
     ====================================================================== */
  class Item {
    constructor(view, model, place) {
      this.v = view;
      this.m = model;
      this.place = place || { p: [0, 0, 0], s: 1, rotY: 0 };
      this.E = model.ext || KK.BAKE_EXT || 1.16;
      this.dough = DOUGH3[(model.look && model.look.dough) || 'golden'] || DOUGH3.golden;
      // un mini du tas n'a pas besoin d'autant de détails qu'un cookie entier
      this.res = (this.place.s || 1) < 0.6 ? Math.max(128, Math.round(view.res * 0.75)) : view.res;
      const segs = this.res >= 512 ? 224 : this.res >= 256 ? 160 : 112;
      this.rings = this.res >= 512 ? 64 : this.res >= 256 ? 44 : 30;
      const rho = model.shape === 'stick' ? stickRho(model) : model.rhoAt || (() => 1);
      this.rh = new Float32Array(segs);
      for (let s = 0; s < segs; s++) this.rh[s] = rho((s / segs) * TAU);
      this.nBites = 0;
      this.biteK = 1;
      this.scale = 1;
      this.off = [0, 0, 0];
      this.spin = 0;
      this.hidden = false;
      this.gpu = {};
      this.readyP = new Promise((res) => (this.readyRes = res));
      this.placeholder();
      this.load();
    }

    rhoAt(th) {
      const n = this.rh.length;
      let a = th / TAU;
      a = (a - Math.floor(a)) * n;
      const i0 = Math.floor(a) % n, fr = a - Math.floor(a);
      return this.rh[i0] * (1 - fr) + this.rh[(i0 + 1) % n] * fr;
    }

    inside(x, y, margin = 0.004) {
      return Math.hypot(x, y) < this.rhoAt(Math.atan2(y, x)) - margin;
    }

    heightAt(x, y) {
      const hf = this.hf;
      if (!hf) return 0.3;
      const k = hf.N / (2 * hf.E);
      return bilinear(hf.h, hf.N, (x + hf.E) * k - 0.5, (y + hf.E) * k - 0.5);
    }

    /* Avant la cuisson : un dôme lisse de la couleur de la pâte, tout de suite */
    placeholder() {
      const N = 48, E = this.E, h = new Float32Array(N * N);
      const chunky = !!(this.m.look && this.m.look.chunky) && this.m.shape !== 'stick';
      for (let py = 0; py < N; py++) {
        for (let px = 0; px < N; px++) {
          const x = ((px + 0.5) / N) * 2 * E - E, y = ((py + 0.5) / N) * 2 * E - E;
          const u = Math.min(1, Math.hypot(x, y) / this.rhoAt(Math.atan2(y, x)));
          h[py * N + px] = chunky ? 0.52 * Math.sqrt(Math.max(0, 1 - Math.pow(u, 3.2))) : 0.24 * Math.pow(Math.max(0, 1 - u * u), 0.3);
        }
      }
      this.hf = null;
      this.cpu = { top: topMesh({ N, E, h }, this.rh, Math.min(24, this.rings)), bottom: bottomMesh(E, this.rh) };
      this.ready = false;
      this.upload();
    }

    async load() {
      const res = this.res, tok = (this.tok = (this.tok || 0) + 1);
      const quick = KK.bake.peek(this.m, 'fields3d');
      if (quick && typeof quick === 'object') this.useFields(quick);
      this.held = res;
      const hf = await KK.bake.acquire(this.m, 'fields3d', res, this.v.opts.pri || 0);
      if (this.dead || tok !== this.tok) return;
      if (hf !== this.hf) this.useFields(hf);
    }

    useFields(hf) {
      this.hf = hf;
      this.cpu = { top: topMesh(hf, this.rh, this.rings), bottom: bottomMesh(hf.E, this.rh), alb: hf.alb, nao: hf.nao, N: hf.N, hgt: heightTex(hf) };
      // toppings solides : des objets à part entière, posés sur la surface qu'on vient de calculer
      this.freeGPU();
      const seed = this.m.seed >>> 0;
      this.tops = (this.m.tops || []).filter((tp) => tp.type === 'bar' || tp.type === 'kcountry').map((tp, i) => {
        const old = this.tops && this.tops[i];
        const mesh = tp.type === 'bar' ? buenoMesh(tp, this) : countryMesh(tp, this);
        return {
          tp, mesh,
          sect: tp.type === 'bar' ? buenoSection(tp, this) : countrySection(tp, this),
          tex: (old && old.tex) || (tp.type === 'bar' ? buenoAtlas(tp, seed) : countryAtlas(seed)),
          gpu: null, cutCPU: null,
        };
      });
      this.ready = true;
      this.upload();
      if (this.nBites) this.setBites(this.nBites, this.biteK);
      this.readyRes();
      this.v.dirty = true;
      kick();
    }

    /* (Re)crée les objets GPU à partir des données gardées en mémoire */
    upload() {
      if (!gl) return;
      this.freeGPU();
      const c = this.cpu, g = this.gpu;
      g.top = { vb: buffer(c.top.V), ib: buffer(c.top.I, gl.ELEMENT_ARRAY_BUFFER), n: c.top.I.length };
      g.bottom = { vb: buffer(c.bottom.V), ib: buffer(c.bottom.I, gl.ELEMENT_ARRAY_BUFFER), n: c.bottom.I.length };
      if (c.alb) {
        g.alb = texture(c.alb, c.N, c.N, { mip: true });
        g.nao = texture(c.nao, c.N, c.N, { mip: true });
        g.hgt = texture(c.hgt.data, c.N, c.N, { fmt: gl.ALPHA });
      }
      if (this.maskCv) g.mask = texture(this.maskCv, this.maskCv.width, this.maskCv.height, { fmt: gl.ALPHA });
      if (this.crumbFx) this.uploadCrumb();
      if (this.wallCPU) this.uploadWalls();
      (this.tops || []).forEach((t) => {
        t.gpu = {
          vb: buffer(t.mesh.V), ib: buffer(t.mesh.I, gl.ELEMENT_ARRAY_BUFFER), n: t.mesh.I.length,
          tex: texture(t.tex, 256, 256, { mip: true }),
        };
        if (t.cutCPU) this.uploadTopCut(t);
      });
    }

    freeGPU() {
      if (!gl) return;
      const g = this.gpu;
      ['top', 'bottom', 'walls'].forEach((k) => { if (g[k]) { gl.deleteBuffer(g[k].vb); gl.deleteBuffer(g[k].ib); } });
      ['alb', 'nao', 'hgt', 'mask', 'crumb', 'crumbN'].forEach((k) => { if (g[k]) gl.deleteTexture(g[k]); });
      (this.tops || []).forEach((t) => {
        if (!t.gpu) return;
        gl.deleteBuffer(t.gpu.vb); gl.deleteBuffer(t.gpu.ib); gl.deleteTexture(t.gpu.tex);
        if (t.gpu.cut) { gl.deleteBuffer(t.gpu.cut.vb); gl.deleteBuffer(t.gpu.cut.ib); }
        t.gpu = null;
      });
      this.gpu = {};
    }

    /* La mie pour les parois des bouchées : couleur et relief doux calculés comme le dessus
       (256 px, puissance de 2 : mipmaps, pas de moiré) */
    ensureCrumb() {
      if (this.crumbAsked) return;
      this.crumbAsked = true;
      KK.bake.acquire(this.m, 'crumb3d', 256, 8).then((cf) => {
        if (this.dead) return;
        this.crumbFx = cf;
        if (gl && !lost) this.uploadCrumb();
        this.v.dirty = true;
        kick();
      });
    }

    uploadCrumb() {
      const g = this.gpu, cf = this.crumbFx;
      if (g.crumb) gl.deleteTexture(g.crumb);
      if (g.crumbN) gl.deleteTexture(g.crumbN);
      g.crumb = texture(cf.alb, cf.N, cf.N, { mip: true });
      g.crumbN = texture(cf.nao, cf.N, cf.N, { mip: true });
    }

    /* n bouchées prises ; la dernière est à k (0,3 → 1 pendant qu'on croque) */
    setBites(n, k = 1) {
      this.nBites = n;
      this.biteK = k;
      if (!n) {
        this.wallCPU = null;
        if (gl && this.gpu.walls) { gl.deleteBuffer(this.gpu.walls.vb); gl.deleteBuffer(this.gpu.walls.ib); this.gpu.walls = null; }
        (this.tops || []).forEach((t) => { t.cutCPU = null; this.uploadTopCut(t); });
        return;
      }
      const bites = this.m.bites.slice(0, n);
      // masque : ce qui reste du cookie
      const S = this.res >= 512 ? 512 : 256, E = this.E;
      if (!this.maskCv) {
        this.maskCv = document.createElement('canvas');
        this.maskCv.width = this.maskCv.height = S;
      }
      const ctx = this.maskCv.getContext('2d'), sc = S / (2 * E);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, S, S);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000';
      bites.forEach((b, i) => {
        const loop = biteLoop(b, i === n - 1 ? k : 1);
        ctx.beginPath();
        loop.forEach(([x, y], j) => (j ? ctx.lineTo((x + E) * sc, (y + E) * sc) : ctx.moveTo((x + E) * sc, (y + E) * sc)));
        ctx.closePath();
        ctx.fill();
      });
      if (gl && !lost) {
        if (!this.gpu.mask) this.gpu.mask = texture(this.maskCv, S, S, { fmt: gl.ALPHA });
        else {
          gl.bindTexture(gl.TEXTURE_2D, this.gpu.mask);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, gl.ALPHA, gl.UNSIGNED_BYTE, this.maskCv);
        }
      }
      this.buildWalls(bites, k);
      this.v.dirty = true;
    }

    /* Parois : la mie à nu le long de chaque bouchée, un peu grumeleuse */
    buildWalls(bites, k) {
      if (!this.hf) { this.wallCPU = null; return; }
      const V = [], I = [];
      const ROWS = 4, noise = this.v.noise;
      bites.forEach((b, bi) => {
        const kk = bi === bites.length - 1 ? k : 1;
        const loop = biteLoop(b, kk);
        const cx = b.cx / R, cy = b.cy / R;
        const ok = loop.map(([x, y]) => this.inside(x, y) && !bites.some((o, oi) => oi !== bi && inBite(o, x, y, oi === bites.length - 1 ? k : 1)));
        const n = loop.length;
        // on commence juste après un point exclu pour parcourir des tronçons continus
        let start = ok.indexOf(false);
        if (start < 0) start = 0;
        let run = [];
        const flush = () => {
          if (run.length < 2) { run = []; return; }
          let s = 0;
          const base = V.length / 9;
          run.forEach(([x, y], j) => {
            if (j) s += Math.hypot(x - run[j - 1][0], y - run[j - 1][1]);
            const hT = Math.max(0.02, this.heightAt(x, y));
            let nx = cx - x, ny = cy - y;
            const l = Math.hypot(nx, ny) || 1;
            nx /= l; ny /= l;
            // un soupçon de relief à mi-hauteur (la mie s'arrache), le haut et le bas restent calés
            const bump = 0.008 * noise(s * 7 + bi * 7, 3.1);
            // la mie à son échelle (≈ 0,43 de texture par rayon, dans les deux sens),
            // répétée en miroir le long de la paroi : jamais étirée
            const w = (s * 0.54 + bi * 0.37) % 2, u = 0.1 + 0.8 * (w < 1 ? w : 2 - w);
            for (let r = 0; r <= ROWS; r++) {
              const t = r / ROWS, z = r === ROWS ? hT + 0.004 : hT * t;
              const bb = bump * Math.sin(Math.PI * t);
              V.push(x + nx * bb, z, y + ny * bb, nx, 0, ny, u, Math.min(0.97, 0.2 + z * 0.43), t);
            }
          });
          for (let j = 0; j < run.length - 1; j++) {
            for (let r = 0; r < ROWS; r++) {
              const a = base + j * (ROWS + 1) + r, c = a + ROWS + 1;
              I.push(a, c, c + 1, a, c + 1, a + 1);
            }
          }
          run = [];
        };
        for (let j = 0; j <= n; j++) {
          const q = (start + j) % n;
          if (ok[q] && j < n) run.push(loop[q]);
          else flush();
        }
        flush();
      });
      this.wallCPU = V.length ? { V: new Float32Array(V), I: new Uint16Array(I) } : null;
      this.uploadWalls();
      this.buildTopCuts(bites, k);
    }

    /* Les toppings croqués : là où une bouchée traverse la barre ou le bloc, une paroi qui
       suit la morsure montre l'intérieur (enrobage, gaufrette et crème, céréales) */
    buildTopCuts(bites, k) {
      const ROWS = 3;
      (this.tops || []).forEach((t) => {
        const V = [], I = [];
        bites.forEach((b, bi) => {
          const kk = bi === bites.length - 1 ? k : 1;
          const loop = biteLoop(b, kk), n = loop.length;
          const cx = b.cx / R, cy = b.cy / R;
          const at = (p) => {
            const q = t.sect(p[0], p[1]);
            return q && !bites.some((o, oi) => oi !== bi && inBite(o, p[0], p[1], oi === bites.length - 1 ? k : 1)) ? q : null;
          };
          const secs = loop.map(at);
          let start = secs.indexOf(null);
          if (start < 0) start = 0;
          // le bord exact du topping sur la morsure : la paroi s'y referme
          const edge = (pIn, pOut) => {
            let a = pIn, c2 = pOut, qa = null;
            for (let i = 0; i < 10; i++) {
              const m = [(a[0] + c2[0]) / 2, (a[1] + c2[1]) / 2], q = at(m);
              if (q) { a = m; qa = q; } else c2 = m;
            }
            return qa ? [a[0], a[1], qa] : null;
          };
          let run = [];
          const flush = () => {
            if (run.length >= 2) {
              const base = V.length / 9;
              run.forEach(([x, y, q]) => {
                let nx = cx - x, ny = cy - y;
                const l = Math.hypot(nx, ny) || 1;
                nx /= l; ny /= l;
                for (let r = 0; r <= ROWS; r++) {
                  const f = r / ROWS, z = q.z0 + (q.z1 - q.z0) * f, uv = q.uv(z);
                  V.push(x, z, y, nx, 0, ny, uv[0], uv[1], 0.84 + 0.16 * f);
                }
              });
              for (let j = 0; j < run.length - 1; j++) {
                for (let r = 0; r < ROWS; r++) {
                  const a = base + j * (ROWS + 1) + r, c = a + ROWS + 1;
                  I.push(a, c, c + 1, a, c + 1, a + 1);
                }
              }
            }
            run = [];
          };
          for (let j = 0; j <= n; j++) {
            const qi = (start + j) % n, pi = (start + j - 1 + n) % n;
            const q = j < n ? secs[qi] : null;
            if (q) {
              if (!run.length && !secs[pi]) { const e = edge(loop[qi], loop[pi]); if (e) run.push(e); }
              run.push([loop[qi][0], loop[qi][1], q]);
            } else {
              if (run.length && j > 0) { const e = edge(loop[pi], loop[qi]); if (e) run.push(e); }
              flush();
            }
          }
          flush();
        });
        t.cutCPU = V.length ? { V: new Float32Array(V), I: new Uint16Array(I) } : null;
        this.uploadTopCut(t);
      });
    }

    uploadTopCut(t) {
      if (!gl || lost || !t.gpu) return;
      if (t.gpu.cut) { gl.deleteBuffer(t.gpu.cut.vb); gl.deleteBuffer(t.gpu.cut.ib); t.gpu.cut = null; }
      const c = t.cutCPU;
      if (!c) return;
      t.gpu.cut = { vb: buffer(c.V, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW), ib: buffer(c.I, gl.ELEMENT_ARRAY_BUFFER, gl.DYNAMIC_DRAW), n: c.I.length };
    }

    uploadWalls() {
      if (!gl || lost) return;
      const g = this.gpu;
      if (g.walls) { gl.deleteBuffer(g.walls.vb); gl.deleteBuffer(g.walls.ib); g.walls = null; }
      const w = this.wallCPU;
      if (!w) return;
      g.walls = { vb: buffer(w.V, gl.ARRAY_BUFFER, gl.DYNAMIC_DRAW), ib: buffer(w.I, gl.ELEMENT_ARRAY_BUFFER, gl.DYNAMIC_DRAW), n: w.I.length };
    }

    matrix() {
      const pl = this.place, t = pl.tilt || [0, 0];
      return M4.chain(M4.trans(pl.p[0] + this.off[0], pl.p[1] + this.off[1], pl.p[2] + this.off[2]), M4.rotY((pl.rotY || 0) + this.spin), M4.rotX(t[0]), M4.rotZ(t[1]), M4.scale((pl.s || 1) * this.scale));
    }

    draw(G) {
      const g = this.gpu;
      if (this.hidden || !g.top) return;
      const M = M4.mul(G, this.matrix());
      this.M = M;
      const NM = M4.nrm(M);
      gl.uniformMatrix4fv(P.u.uM, false, M);
      gl.uniformMatrix3fv(P.u.uNMv, false, NM);
      gl.uniformMatrix3fv(P.u.uNM, false, NM);
      const bind = (unit, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex || white); };
      bind(0, g.alb); bind(1, g.nao); bind(2, g.mask); bind(3, g.crumb); bind(4, g.crumbN);
      gl.uniform3fv(P.u.uBottom, this.dough.bottom);
      gl.uniform3fv(P.u.uCrust, this.dough.crust);
      gl.uniform3fv(P.u.uFlat, this.dough.flat);
      const masked = this.nBites > 0 && !!g.mask;
      gl.uniform1f(P.u.uMaskOn, masked ? 1 : 0);
      if (masked && msaa) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      gl.uniform1f(P.u.uMode, this.ready ? 0 : 3);
      drawMesh(g.top);
      gl.uniform1f(P.u.uMode, 1);
      drawMesh(g.bottom);
      gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
      if (g.walls && g.walls.n) {
        gl.uniform1f(P.u.uMaskOn, 0);
        gl.uniform1f(P.u.uMode, 2);
        drawMesh(g.walls);
      }
      // toppings solides : croqués par les mêmes bouchées que le cookie, la coupe montre l'intérieur
      if (this.ready && this.tops && this.tops.length && g.hgt) {
        gl.uniform1f(P.u.uMode, 4);
        gl.uniform1f(P.u.uE, this.E);
        gl.uniform1f(P.u.uHgtK, this.cpu.hgt.k);
        gl.activeTexture(gl.TEXTURE6);
        gl.bindTexture(gl.TEXTURE_2D, g.hgt);
        this.tops.forEach((t) => {
          if (!t.gpu) return;
          gl.activeTexture(gl.TEXTURE5);
          gl.bindTexture(gl.TEXTURE_2D, t.gpu.tex);
          gl.uniform1f(P.u.uMaskOn, masked ? 1 : 0);
          if (masked && msaa) gl.enable(gl.SAMPLE_ALPHA_TO_COVERAGE);
          drawMesh(t.gpu);
          gl.disable(gl.SAMPLE_ALPHA_TO_COVERAGE);
          if (masked && t.gpu.cut && t.gpu.cut.n) {
            gl.uniform1f(P.u.uMaskOn, 0);
            gl.uniform1f(P.u.uMode, 5);
            drawMesh(t.gpu.cut);
            gl.uniform1f(P.u.uMode, 4);
          }
        });
      }
    }

    destroy() {
      this.dead = true;
      this.freeGPU();
      if (this.held) KK.bake.release(this.m, 'fields3d', this.held);
      if (this.crumbAsked) KK.bake.release(this.m, 'crumb3d', 256);
    }
  }

  function drawMesh(m) {
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 36, 0);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 36, 12);
    gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 36, 24);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 36, 32);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_SHORT, 0);
  }

  /* ======================================================================
     Miettes et onomatopées : un calque SVG par-dessus le canvas, avec la
     petite physique des miettes de kk-cookie.js
     ====================================================================== */
  class Fx {
    constructor(host) {
      this.svg = KK.svg('svg', { class: 'kk3d-fx', viewBox: '-116 -116 232 232', 'aria-hidden': 'true', focusable: 'false' }, host);
      this.defs = KK.svg('defs', null, this.svg);
      this.fxG = KK.svg('g', null, this.svg);
      this.particles = [];
      this.pRAF = 0;
      this.fxScale = 1;
      this.fxMap = (x, y) => [x, y];
      this.opts = { floor: 90 };
      this.m = { chunks: [] };
    }

    setModel(m) {
      const D = m.dough || { light: '#EDBB5F', base: '#DB9A40', dark: '#A86F17' };
      const id = KK.uid('fx');
      this.defs.textContent = '';
      this.crumbFills = [[D.light, D.base], [D.base, D.dark], ['#5B3A2A', '#1E110A']].map(([a, b], i) => {
        const g = KK.svg('linearGradient', { id: id + i, x1: 0, y1: 0, x2: 1, y2: 1 }, this.defs);
        KK.svg('stop', { offset: 0, 'stop-color': a }, g);
        KK.svg('stop', { offset: 1, 'stop-color': b }, g);
        return `url(#${id}${i})`;
      });
      this.m = m;
    }

    box(w, h) {
      const a = w / h;
      this.vw = a >= 1 ? 116 * a : 116;
      this.vh = a >= 1 ? 116 : 116 / a;
      this.svg.setAttribute('viewBox', `${f(-this.vw)} ${f(-this.vh)} ${f(2 * this.vw)} ${f(2 * this.vh)}`);
    }

    crumbs(b, n) {
      if (KK.reduced || !n) return;
      KK.CookieView.prototype.spawnCrumbs.call(this, b, n);
    }

    word(x, y, w) {
      if (KK.reduced) return;
      const t = KK.svg('text', { x: 0, y: 0, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'kk-onomato' }, this.fxG);
      t.textContent = w;
      x = clamp(x, -this.vw + 34, this.vw - 34);
      y = clamp(y, -this.vh + 18, this.vh - 18);
      const rot = (Math.random() - 0.5) * 34;
      KK.tween(720, (e, p) => {
        const s = p < 0.25 ? KK.ease.outBack(p / 0.25) : 1;
        t.setAttribute('transform', `translate(${f(x)} ${f(y - p * 18)}) rotate(${f(rot)}) scale(${f(Math.max(0.001, s))})`);
        t.setAttribute('opacity', f(p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3));
      }).then(() => t.remove());
    }

    clear() {
      cancelAnimationFrame(this.pRAF);
      this.pRAF = 0;
      this.particles.forEach((p) => p.el.remove());
      this.particles = [];
    }
  }
  Fx.prototype.runParticles = function () { return KK.CookieView.prototype.runParticles.call(this); };

  /* ======================================================================
     La vue : un canvas, une caméra en orbite, les gestes
     ====================================================================== */
  const viewers = new Set();
  let raf = 0, lastT = 0, waitT = 0;

  function kick() {
    if (!raf) {
      lastT = performance.now();
      raf = requestAnimationFrame(loop);
    }
  }

  function loop(now) {
    raf = 0;
    const dt = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
    lastT = now;
    let again = false, waiting = false;
    viewers.forEach((v) => {
      const r = v.update(dt, now);
      if (r === 1) again = true;
      else if (r === 2) waiting = true;
    });
    if (again) raf = requestAnimationFrame(loop);
    else if (waiting && !waitT) waitT = setTimeout(() => { waitT = 0; kick(); }, 450);
  }

  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const v = e.target._kk3d;
        if (!v) return;
        v.visible = e.isIntersecting;
        if (v.visible) { v.dirty = true; kick(); }
      });
    })
    : null;
  const ro = 'ResizeObserver' in window ? new ResizeObserver((entries) => entries.forEach((e) => e.target._kk3d && e.target._kk3d.resize())) : null;

  class Viewer {
    constructor(el, key, seed, opts = {}) {
      this.is3d = true;
      this.el = el;
      this.key = key;
      this.opts = opts;
      this.res = opts.res || 256;
      el.classList.add('is-3d');
      this.box = document.createElement('div');
      this.box.className = 'kk3d' + (opts.free ? ' kk3d--free' : '');
      this.cv = document.createElement('canvas');
      this.cv.className = 'kk3d-cv';
      this.box.appendChild(this.cv);
      el.appendChild(this.box);
      this.ctx = this.cv.getContext('2d');
      this.fx = new Fx(this.box);
      this.viewEl = el.closest('.view');
      this.noise = KK.noise2(KK.hash(key + ':mie'));
      this.items = [];
      this.tweens = [];
      this.after = [];
      this.visible = !io;
      this.phase = Math.random() * TAU;
      this.swayW = 0;
      this.wob = [0, 0];
      this.elRest = opts.el != null ? opts.el : 0.72;
      this.el3 = this.elRest;
      this.vYaw = 0;
      this.vEl = 0;
      this.lastTouch = -1e9;
      this.frame = 0;
      this.setModel(KK.cookieModel(key, seed, { keep: opts.keep }));
      this.bind();
      this.cv._kk3d = this;
      this.box._kk3d = this;
      if (io) io.observe(this.cv);
      if (ro) ro.observe(this.box);
      viewers.add(this);
      this.resize();
    }

    get total() { return this.pile ? this.items.length : this.items[0].m.bites.length + 1; }

    setModel(model) {
      this.items.forEach((it) => it.destroy());
      this.tweens.forEach((tw) => tw.res());
      this.tweens = [];
      this.fx.clear();
      this.model = model;
      this.pile = !!model.pile;
      this.bitesTaken = 0;
      this.busy = false;
      this.empty = false;
      this.hideAll = false;
      this.pop = 1;
      this.gSpin = 0;
      this.gOff = [0, 0, 0];
      this.wobble = null;
      this.wob = [0, 0];
      const stick = model.shape === 'stick';
      this.fit = (this.opts.fit || 1) * (stick ? 0.66 : this.pile ? 0.94 : 1);
      this.items = this.pile
        ? model.pile.map((it, i) => new Item(this, KK.cookieModel(it.look, it.seed, { chunkMul: 0.55, keep: model.keep }), PILE3[i % PILE3.length]))
        : [new Item(this, model)];
      this.shadowR = stick ? [1.62, 0.58] : this.pile ? [1.2, 1.1] : [1.16, 1.16];
      if (this.yaw == null) this.yaw = stick ? 0.5 : -0.3 + (((model.seed >>> 0) % 100) / 100 - 0.5) * 0.6;
      if (this.yawView == null) this.yawView = this.yaw;
      this.fx.setModel(this.pile ? { chunks: [] } : model);
      this.ready = Promise.all(this.items.map((it) => it.readyP));
      this.dirty = true;
      kick();
    }

    bind() {
      const cv = this.cv;
      cv.addEventListener('pointerdown', (e) => this.down(e));
      cv.addEventListener('pointermove', (e) => this.move(e));
      cv.addEventListener('pointerup', (e) => this.up(e));
      cv.addEventListener('pointercancel', (e) => this.up(e));
      cv.addEventListener('lostpointercapture', (e) => this.up(e));
      cv.addEventListener('contextmenu', (e) => e.preventDefault());
      // un glisser ne doit jamais finir en clic (ni ouvrir la fiche, ni croquer)
      this.box.addEventListener('click', (e) => {
        if (!this.swallow) return;
        e.stopPropagation();
        e.preventDefault();
        this.swallow = false;
      }, true);
    }

    down(e) {
      if (e.button > 0 || this.drag) return;
      this.drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, lt: e.timeStamp, moved: false };
      try { this.cv.setPointerCapture(e.pointerId); } catch (_) { /* rien */ }
      this.vYaw = this.vEl = 0;
      this.lastTouch = performance.now();
      this.dirty = true;
      kick();
    }

    move(e) {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.lx, dy = e.clientY - d.ly, dt = Math.max(8, e.timeStamp - d.lt) / 1000;
      if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 5) {
        d.moved = true;
        this.cv.classList.add('is-grabbing');
      }
      if (d.moved) {
        const k = (Math.PI * 1.25) / Math.max(120, this.cssW || 160); // toute la largeur ≈ un bon tour
        this.yaw += dx * k;
        this.el3 = clamp(this.el3 + dy * k, EL_MIN, EL_MAX);
        this.vYaw = this.vYaw * 0.35 + ((dx * k) / dt) * 0.65;
        this.vEl = this.vEl * 0.35 + ((dy * k) / dt) * 0.65;
        this.lastTouch = performance.now();
        this.dirty = true;
        kick();
      }
      d.lx = e.clientX;
      d.ly = e.clientY;
      d.lt = e.timeStamp;
    }

    up(e) {
      const d = this.drag;
      if (!d || e.pointerId !== d.id) return;
      this.drag = null;
      this.cv.classList.remove('is-grabbing');
      if (d.moved) {
        this.swallow = true;
        setTimeout(() => (this.swallow = false), 90);
        if (e.timeStamp - d.lt > 90) this.vYaw = this.vEl = 0; // lâché à l'arrêt : pas d'élan
      } else if (e.type === 'pointerup' && this.opts.onTap) this.opts.onTap(this);
      this.lastTouch = performance.now();
      this.dirty = true;
      kick();
    }

    resize() {
      const r = this.box.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cssW = r.width;
      this.pw = Math.max(2, Math.round(r.width * dpr));
      this.ph = Math.max(2, Math.round(r.height * dpr));
      if (this.cv.width !== this.pw || this.cv.height !== this.ph) {
        this.cv.width = this.pw;
        this.cv.height = this.ph;
      }
      this.fx.box(r.width, r.height);
      this.fx.fxScale = 1;
      this.dirty = true;
      kick();
    }

    /* 1 : à l'écran · 2 : caché sous une feuille (on repassera voir) · 0 : hors champ */
    live() {
      if (!this.visible || document.hidden || !this.pw) return 0;
      if (this.viewEl && !this.viewEl.classList.contains('is-active')) return 0;
      if (this.opts.pauseUnderSheet && KK.sheets && KK.sheets.current) return 2;
      return 1;
    }

    tween(dur, fn, ease = KK.ease.linear) {
      return new Promise((res) => {
        this.tweens.push({ t0: performance.now(), dur, fn, ease, res });
        this.dirty = true;
        kick();
      });
    }

    /* 1 : encore des images à dessiner · 2 : en pause (on repassera) · 0 : au repos */
    update(dt, now) {
      // animations (elles avancent même en pause : une bouchée ne reste jamais à moitié)
      if (this.tweens.length) {
        this.tweens = this.tweens.filter((tw) => {
          const p = Math.min(1, (now - tw.t0) / tw.dur);
          tw.fn(tw.ease(p), p);
          if (p >= 1) { tw.res(); return false; }
          return true;
        });
        this.dirty = true;
      }
      if (this.wobble) {
        const t = (now - this.wobble.t0) / 1000, k = Math.exp(-7 * t) * Math.cos(22 * t);
        this.wob = [this.wobble.ax * k, this.wobble.az * k];
        if (t > 0.8) { this.wobble = null; this.wob = [0, 0]; }
        this.dirty = true;
      }
      const live = this.live();
      if (live !== 1) return this.tweens.length || this.wobble ? 1 : live === 2 && this.opts.sway ? 2 : 0;

      const idle = !this.drag && now - this.lastTouch > 1400;
      let moving = !!this.drag || this.tweens.length > 0 || !!this.wobble;
      if (!this.drag) {
        if (Math.abs(this.vYaw) > 0.002 || Math.abs(this.vEl) > 0.002) {
          this.yaw += this.vYaw * dt;
          this.el3 = clamp(this.el3 + this.vEl * dt, EL_MIN, EL_MAX);
          const fr = Math.exp(-dt * (KK.reduced ? 12 : 3.2));
          this.vYaw *= fr;
          this.vEl *= fr;
          moving = true;
        } else this.vYaw = this.vEl = 0;
        if (idle && Math.abs(this.el3 - this.elRest) > 0.002) {
          this.el3 += (this.elRest - this.el3) * (1 - Math.exp(-dt * 2.4)); // retour doux à la pose de vitrine
          moving = true;
        }
      }
      let sway = 0, swaying = false;
      if (this.opts.sway && !KK.reduced) {
        const target = idle ? 1 : 0;
        this.swayW += clamp(target - this.swayW, -dt * 0.8, dt * 0.8);
        sway = this.swayW * 0.32 * Math.sin(now * 0.00055 + this.phase);
        swaying = this.swayW > 0.001;
      }
      this.yawView = this.yaw + sway;
      if (moving || this.dirty || swaying) {
        // simple balancement : 30 images/s suffisent
        if (moving || this.dirty || (this.frame++ & 1) === 0) {
          this.draw();
          this.dirty = false;
          if (this.after.length) { const a = this.after; this.after = []; a.forEach((fn) => fn()); }
        }
        return moving || swaying ? 1 : 0;
      }
      return 0;
    }

    groupMatrix() {
      return M4.chain(
        M4.trans(this.gOff[0], this.gOff[1], this.gOff[2]),
        M4.rotY(this.yawView + this.gSpin),
        M4.rotX(this.wob[0]),
        M4.rotZ(this.wob[1]),
        M4.scale(this.fit * Math.max(0.001, this.pop)),
      );
    }

    draw() {
      if (!gl || lost || !this.pw) return;
      if (glCv.width < this.pw || glCv.height < this.ph) {
        glCv.width = Math.max(glCv.width, this.pw);
        glCv.height = Math.max(glCv.height, this.ph);
      }
      const W = this.pw, H = this.ph;
      gl.viewport(0, 0, W, H);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      gl.disable(gl.CULL_FACE);

      // caméra en orbite autour du cookie ; les lumières la suivent
      const el = this.el3, D = (1.13 / Math.sin(FOV / 2)) * (this.opts.zoom || 1);
      const tgt = [0, 0.2 * this.fit, 0];
      const eye = [0, tgt[1] + Math.sin(el) * D, Math.cos(el) * D];
      const V = M4.lookAt(eye, tgt, [0, 1, 0]);
      const PV = M4.mul(M4.persp(FOV, W / H, 0.3, 30), V);
      this.PV = PV;
      const right = [V[0], V[4], V[8]], upc = [V[1], V[5], V[9]], back = [V[2], V[6], V[10]];
      const L = (a, b, c) => {
        const x = right[0] * a + upc[0] * b + back[0] * c, y = right[1] * a + upc[1] * b + back[1] * c, z = right[2] * a + upc[2] * b + back[2] * c;
        const l = Math.hypot(x, y, z);
        return [x / l, y / l, z / l];
      };
      const G = this.groupMatrix();

      // ombre de contact, posée sur le sol
      const shA = 0.42 * KK.bake.smooth(0.02, 0.3, el) * Math.min(1, this.pop);
      if (shA > 0.005 && !this.hideAll) {
        gl.useProgram(PS.p);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        for (let i = 1; i < 4; i++) gl.disableVertexAttribArray(i);
        gl.enableVertexAttribArray(0);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
        gl.uniformMatrix4fv(PS.u.uPV, false, PV);
        gl.uniformMatrix4fv(PS.u.uM, false, M4.chain(M4.trans(this.gOff[0], 0, this.gOff[2]), M4.rotY(this.yawView + this.gSpin), M4.scale(this.fit * Math.max(0.001, this.pop))));
        gl.uniform2f(PS.u.uR, this.shadowR[0], this.shadowR[1]);
        gl.uniform1f(PS.u.uA, shA);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        gl.depthMask(true);
        gl.disable(gl.BLEND);
      }

      // le(s) cookie(s)
      if (!this.hideAll) {
        gl.useProgram(P.p);
        for (let i = 0; i < 4; i++) gl.enableVertexAttribArray(i);
        gl.uniformMatrix4fv(P.u.uPV, false, PV);
        gl.uniform3fv(P.u.uEye, eye);
        gl.uniform3fv(P.u.uUp, [0, 1, 0]);
        gl.uniform3fv(P.u.uL1, L(-0.45, 0.62, 0.64));
        gl.uniform3fv(P.u.uL2, L(0.85, 0.1, 0.5));
        gl.uniform3fv(P.u.uL3, L(0.25, 0.45, -0.85));
        gl.uniform1i(P.u.uAlb, 0);
        gl.uniform1i(P.u.uNao, 1);
        gl.uniform1i(P.u.uMask, 2);
        gl.uniform1i(P.u.uCrumb, 3);
        gl.uniform1i(P.u.uCrumbN, 4);
        gl.uniform1i(P.u.uTop, 5);
        gl.uniform1i(P.u.uHgt, 6);
        this.items.forEach((it) => it.draw(G));
      }

      // copie dans le canvas de la vue (même tâche : le tampon WebGL est encore là)
      this.ctx.clearRect(0, 0, W, H);
      this.ctx.drawImage(glCv, 0, glCv.height - H, W, H, 0, 0, W, H);
    }

    /* Point du cookie (repère de l'objet) → calque des miettes */
    toFx(M, x, y, z) {
      const c = M4.apply(this.PV, M4.apply(M, [x, y, z]));
      return [(c[0] / c[3]) * this.fx.vw, (-c[1] / c[3]) * this.fx.vh];
    }

    floorY() {
      const G = this.groupMatrix();
      const p = this.toFx(G, 0, 0, 1.08);
      return Math.min(this.fx.vh - 4, p[1] + 5);
    }

    /* Miettes qui partent de la bouchée, vers l'extérieur */
    burst(it, b, n = 16, word) {
      if (!it.M || this.opts.fx === false) return;
      const cx = b.cx / R, cy = b.cy / R;
      const ex = cx + (Math.cos(b.facing) * b.r) / R, ey = cy + (Math.sin(b.facing) * b.r) / R;
      const h = it.heightAt(ex, ey) * 0.85;
      const C = this.toFx(it.M, cx, h, cy), Ep = this.toFx(it.M, ex, h, ey);
      const facing = Math.atan2(Ep[1] - C[1], Ep[0] - C[0]);
      const bb = { cx: C[0], cy: C[1], r: Math.hypot(Ep[0] - C[0], Ep[1] - C[1]), facing, span: b.span || 2.4, dir: facing + Math.PI };
      this.fx.opts.floor = this.floorY();
      this.fx.crumbs(bb, n);
      if (word && this.opts.words !== false) {
        const d = bb.r * 0.4 + 24;
        this.fx.word(Ep[0] + Math.cos(bb.dir) * d, Ep[1] + Math.sin(bb.dir) * d - 10, word);
      }
    }

    /* Tourne le cookie pour que la bouchée soit face à nous (on voit la mie) */
    faceBite(b) {
      // la bouchée de trois quarts, sur le côté : on voit la mie ET le dessus du cookie
      const phi = Math.atan2(b.cy, b.cx);
      const target = phi - Math.PI / 2 + BITE_VIEW;
      const cur = this.yaw;
      const to = cur + KK.angDiff(target, cur);
      if (Math.abs(to - cur) < 0.2 || KK.reduced) return Promise.resolve();
      this.vYaw = 0;
      return this.tween(Math.min(520, 180 + Math.abs(to - cur) * 170), (e) => { this.yaw = lerp(cur, to, e); }, KK.ease.inOutCubic);
    }

    jolt(b, power = 1) {
      if (KK.reduced) return;
      const phi = Math.atan2(b.cy, b.cx), th = 0.07 * power;
      this.wobble = { t0: performance.now(), ax: th * Math.sin(phi), az: -th * Math.cos(phi) };
      this.dirty = true;
      kick();
    }

    async bite() {
      if (this.busy || this.empty) return false;
      if (this.pile) return this.bitePile();
      const it = this.items[0];
      if (this.bitesTaken >= it.m.bites.length) return this.gulp();
      this.busy = true;
      const n = ++this.bitesTaken;
      const b = it.m.bites[n - 1];
      it.ensureCrumb();
      await it.readyP;
      if (this.dead || it.dead) return false;
      await this.faceBite(b);
      if (this.dead || it.dead) return false;
      if (this.opts.sound !== false) { KK.sfx.crunch(); KK.vibrate(14); }
      it.setBites(n, 0.3);
      this.after.push(() => this.burst(it, b, 16, WORDS[(n - 1) % WORDS.length]));
      this.jolt(b);
      await this.tween(140, (e) => { if (!it.dead) it.setBites(n, 0.3 + 0.7 * e); }, KK.ease.outCubic);
      if (this.dead || it.dead) return false;
      it.setBites(n, 1);
      this.busy = false;
      return true;
    }

    gulp() {
      this.busy = true;
      const it = this.items[0];
      if (this.opts.sound !== false) { KK.sfx.crunch(1.25); KK.vibrate([10, 40, 12]); }
      const last = it.m.bites[it.m.bites.length - 1];
      for (let i = 0; i < 3; i++) {
        const a = (last ? Math.atan2(last.cy, last.cx) : 0) + Math.PI + (i - 1) * 0.9;
        this.burst(it, { cx: Math.cos(a) * 40, cy: Math.sin(a) * 40, r: 30, facing: a, span: 2.4 }, 10, i === 1 ? 'GLOUP' : null);
      }
      return this.tween(380, (e) => {
        this.pop = Math.max(0.001, 1 - e);
        this.gSpin = e * 1.1;
        this.gOff = [0, e * 0.3, e * 0.6];
      }, KK.ease.inCubic).then(() => {
        this.hideAll = true;
        this.busy = false;
        this.empty = true;
        this.dirty = true;
        if (this.opts.onEmpty) this.opts.onEmpty(this);
        return 'empty';
      });
    }

    async bitePile() {
      const idx = this.items.length - 1 - this.bitesTaken;
      if (idx < 0) {
        this.empty = true;
        if (this.opts.onEmpty) this.opts.onEmpty(this);
        return 'empty';
      }
      this.busy = true;
      const it = this.items[idx];
      this.bitesTaken++;
      await it.readyP;
      if (this.dead || it.dead) return false;
      if (this.opts.sound !== false) { KK.sfx.crunch(0.8); KK.vibrate(12); }
      const lastOne = this.bitesTaken >= this.items.length;
      this.burst(it, { cx: 0, cy: 50, r: 40, facing: -Math.PI / 2, span: 2.6 }, 12, lastOne ? 'GLOUP' : WORDS[(this.bitesTaken - 1) % WORDS.length]);
      await this.tween(360, (e) => {
        it.scale = Math.max(0.001, 1 - e);
        it.off = [0, e * 0.4, e * 0.35];
        it.spin = e * 1.4;
      }, KK.ease.inCubic);
      it.hidden = true;
      this.busy = false;
      if (lastOne) {
        this.empty = true;
        if (this.opts.onEmpty) this.opts.onEmpty(this);
        return 'empty';
      }
      return true;
    }

    applyBites(n) {
      if (this.pile) {
        const target = Math.min(n, this.items.length);
        for (let i = 0; i < target; i++) this.items[this.items.length - 1 - i].hidden = true;
        this.bitesTaken = Math.max(this.bitesTaken, target);
      } else {
        const it = this.items[0];
        const target = Math.min(n, it.m.bites.length);
        if (target > this.bitesTaken) {
          it.ensureCrumb();
          it.setBites(target, 1);
          this.bitesTaken = target;
          // la première bouchée est tournée vers nous, de trois quarts
          const b = it.m.bites[0];
          this.yaw = Math.atan2(b.cy, b.cx) - Math.PI / 2 + BITE_VIEW;
        }
      }
      this.dirty = true;
      kick();
    }

    popIn() {
      this.empty = false;
      this.hideAll = false;
      if (KK.reduced) {
        this.pop = 1;
        this.gSpin = 0;
        this.gOff = [0, 0, 0];
        this.dirty = true;
        kick();
        return Promise.resolve();
      }
      return this.tween(560, (e, p) => {
        this.pop = Math.max(0.001, e);
        this.gSpin = (1 - p) * -1.2;
        this.gOff = [0, 0, 0];
      }, KK.ease.outBack).then(() => { this.pop = 1; this.gSpin = 0; });
    }

    restore() {
      this.items.forEach((it) => it.upload());
      this.dirty = true;
    }

    destroy() {
      this.dead = true;
      viewers.delete(this);
      if (io) io.unobserve(this.cv);
      if (ro) ro.unobserve(this.box);
      this.tweens.forEach((tw) => tw.res());
      this.tweens = [];
      this.fx.clear();
      this.items.forEach((it) => it.destroy());
      this.items = [];
      this.box.remove();
      this.el.classList.remove('is-3d');
    }
  }

  KK.on('view', () => { viewers.forEach((v) => (v.dirty = true)); kick(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { viewers.forEach((v) => (v.dirty = true)); kick(); } });

  KK.gl3d = {
    ok: () => init(),
    mount(el, key, seed, opts) {
      return new Viewer(el, key, seed, opts || {});
    },
  };
  if (init()) document.documentElement.classList.add('kk-3d');
})();
