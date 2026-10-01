/* ==========================================================================
   Kookies — la coquille de l'appli : splash, vues, onglets, feuilles,
   horloge à volets (heure de Paris), sons
   ========================================================================== */
(function () {
  'use strict';

  const KK = window.KK;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const VIEWS = ['fournee', 'carte', 'boissons', 'fidelite', 'nous'];
  const TITLES = {
    fournee: 'Kookies · Cookies faits maison à Clermont-Ferrand — réservation & retrait en boutique',
    carte: 'La carte · Kookies, cookies faits maison à Clermont-Ferrand',
    boissons: 'Boissons · Kookies, café, lattes et citronnade à emporter à Clermont-Ferrand',
    fidelite: 'Carte fidélité · Kookies Clermont-Ferrand',
    nous: 'La boutique & l’équipe · Kookies, 11b rue Saint-Esprit, Clermont-Ferrand',
  };
  let current = 'fournee';
  let atelier = null;

  /* ---------- Toast ---------- */
  let toastTimer;
  KK.toast = (msg) => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2400);
  };

  /* ---------- Feuilles (bottom sheets) ---------- */
  KK.sheets = (function () {
    let openEl = null, onCloseFn = null, lastFocus = null;
    const shell = () => [$('.topbar'), $('#views'), $('#tabbar')];

    function open(el, opts = {}) {
      if (KK.hours) KK.hours.set(false);
      if (openEl && openEl !== el) close(openEl, true);
      clearTimeout(el._closeT);
      openEl = el;
      onCloseFn = opts.onClose || null;
      lastFocus = document.activeElement;
      el.hidden = false;
      el.querySelector('.sheet-panel').style.transform = '';
      requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('is-open')));
      KK.sfx.play('open');
      shell().forEach((n) => (n.inert = true));
      const target = el.querySelector('.sheet-x, .sheet-head [data-close]');
      setTimeout(() => target && target.focus({ preventScroll: true }), 80);
    }

    function close(el = openEl, instant) {
      if (!el || el.hidden) return;
      if (!instant) KK.sfx.play('close');
      el.classList.remove('is-open');
      el.querySelector('.sheet-panel').style.transform = '';
      clearTimeout(el._closeT);
      if (instant || KK.reduced) el.hidden = true;
      else el._closeT = setTimeout(() => { el.hidden = true; }, 430);
      if (el === openEl) {
        const fn = onCloseFn;
        openEl = null;
        onCloseFn = null;
        shell().forEach((n) => (n.inert = false));
        if (fn) fn();
        if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({ preventScroll: true });
      }
    }

    function startDrag(e) {
      if (e.button > 0) return;
      if (e.target.closest('.kk3d-cv')) return; // on fait tourner le cookie, pas la feuille
      const sh = e.currentTarget.closest('.sheet'), panel = sh.querySelector('.sheet-panel');
      const y0 = e.clientY, t0 = performance.now();
      let dy = 0, dragging = false;
      const move = (ev) => {
        dy = Math.max(0, ev.clientY - y0);
        if (!dragging && dy > 8) {
          dragging = true;
          panel.classList.add('is-dragging');
        }
        if (dragging) panel.style.transform = `translateY(${dy}px)`;
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        if (!dragging) return;
        panel.classList.remove('is-dragging');
        const v = dy / Math.max(1, performance.now() - t0);
        panel.style.transform = '';
        if (dy > 110 || v > 0.65) close(sh);
        const block = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
        sh.addEventListener('click', block, { capture: true, once: true });
        setTimeout(() => sh.removeEventListener('click', block, { capture: true }), 60);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
    }

    function init() {
      $$('.sheet').forEach((sh) => {
        sh.addEventListener('click', (e) => {
          if (e.target.closest('[data-close], [data-close-go]')) close(sh);
        });
        sh.querySelectorAll('.sheet-grab, .sheet-head, .p-stage').forEach((h) => h.addEventListener('pointerdown', startDrag));
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && openEl) close(openEl);
      });
    }

    return { open, close, init, get current() { return openEl; } };
  })();

  /* ---------- Volets (split-flap), comme les calendriers à palettes ---------- */
  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  class Flap {
    constructor(el) {
      this.el = el;
      this.value = el.textContent.trim();
      el.textContent = '';
      const mk = (cls) => {
        const s = document.createElement('span');
        s.className = 'flap-card ' + cls;
        const i = document.createElement('i');
        s.appendChild(i);
        el.appendChild(s);
        return i;
      };
      this.sizer = document.createElement('b');
      this.sizer.className = 'flap-size';
      el.appendChild(this.sizer);
      this.top = mk('flap-top');
      this.bottom = mk('flap-bottom');
      this.leafTop = mk('flap-leaf-top');
      this.leafBottom = mk('flap-leaf-bottom');
      this.paint(this.value);
    }

    paint(v) {
      this.sizer.textContent = v;
      this.top.textContent = this.bottom.textContent = this.leafTop.textContent = this.leafBottom.textContent = v;
    }

    flip(v, dur = 150) {
      return new Promise((res) => {
        const old = this.value;
        this.value = v;
        if (KK.reduced || old === v) { this.paint(v); return res(); }
        KK.sfx.play('flap', { v: dur < 100 ? 0.026 : 0.04 }); // la palette claque, comme un tableau de gare
        this.sizer.textContent = v.length >= old.length ? v : old;
        this.top.textContent = v;
        this.leafBottom.textContent = v;
        this.leafTop.textContent = old;
        this.bottom.textContent = old;
        this.el.style.setProperty('--fd', dur + 'ms');
        this.el.classList.remove('is-flipping');
        void this.el.offsetWidth;
        this.el.classList.add('is-flipping');
        clearTimeout(this.t);
        this.t = setTimeout(() => {
          this.bottom.textContent = v;
          this.sizer.textContent = v;
          this.el.classList.remove('is-flipping');
          res();
        }, dur * 2 + 20);
      });
    }

    /* Effet tableau de gare : quelques palettes au hasard avant la bonne */
    async shuffle(v, n = 5) {
      for (let k = 0; k < n; k++) {
        let s = '';
        for (let i = 0; i < v.length; i++) s += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        await this.flip(s, 55);
      }
      await this.flip(v, 120);
    }
  }

  const flaps = {};
  function initFlaps() {
    $$('#status .flap').forEach((el) => (flaps[el.dataset.flap] = new Flap(el)));
    flaps.cal = $$('#flipcal .flap').map((el) => new Flap(el));
  }

  /* ---------- Ouvert / fermé (heure de Paris) ---------- */
  const DAYS_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const MONTHS_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const DAYS_FR = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function statusNow() {
    const now = KK.parisNow(), d = now.getDay(), m = now.getHours() * 60 + now.getMinutes();
    const days = [2, 3, 4, 5, 6], from = 11 * 60, to = 19 * 60;
    if (days.includes(d) && m >= from && m < to) {
      return { open: true, word: 'UNTIL', day: null, time: '19H', fr: 'Ouvert jusqu’à 19h' };
    }
    if (days.includes(d) && m < from) return { open: false, word: 'OPENS AT', day: null, time: '11H', fr: 'Fermé, ouvre à 11h' };
    let k = 1;
    while (!days.includes((d + k) % 7)) k++;
    const nd = (d + k) % 7;
    return { open: false, word: 'OPENS', day: DAYS_EN[nd], time: '11H', fr: `Fermé, ouvre ${k === 1 ? 'demain' : DAYS_FR[nd]} à 11h`, now };
  }

  let lastKey = '';
  function updateStatus(first) {
    const st = statusNow();
    const key = [st.open, st.word, st.day, st.time].join('|');
    const el = $('#status');
    el.classList.toggle('is-open', st.open);
    el.setAttribute('aria-label', st.fr + ' — voir les horaires de la semaine');
    const dayEl = flaps.day.el;
    dayEl.hidden = !st.day;
    if (key !== lastKey) {
      lastKey = key;
      // chaque panneau tourne à son tour, comme un tableau de gare
      const go = (fl, v) => (first ? fl.shuffle(v, 4 + Math.floor(Math.random() * 3)) : fl.flip(v));
      go(flaps.state, st.open ? 'OPEN' : 'CLOSED');
      setTimeout(() => go(flaps.word, st.word), first ? 110 : 50);
      if (st.day) setTimeout(() => go(flaps.day, st.day), first ? 200 : 90);
      setTimeout(() => go(flaps.time, st.time), first ? 290 : 130);
    }
    // calendrier du jour en tête des horaires + ligne du jour surlignée
    const now = KK.parisNow();
    const cal = [DAYS_EN[now.getDay()], String(now.getDate()).padStart(2, '0'), MONTHS_EN[now.getMonth()]];
    flaps.cal.forEach((fl, i) => { if (fl.value !== cal[i]) (first ? fl.paint(cal[i]) || (fl.value = cal[i]) : fl.flip(cal[i])); });
    $$('#hours [data-day]').forEach((row) => row.classList.toggle('is-today', +row.dataset.day === now.getDay()));
  }

  /* ---------- Les horaires se déplient depuis les volets ---------- */
  function initHours() {
    const btn = $('#status'), panel = $('#hours-panel');
    const isOpen = () => !panel.hidden && panel.classList.contains('is-open');
    function set(open) {
      if (open === isOpen()) return;
      btn.setAttribute('aria-expanded', String(open));
      clearTimeout(panel._t);
      if (open) {
        panel.hidden = false;
        requestAnimationFrame(() => requestAnimationFrame(() => panel.classList.add('is-open')));
        // le calendrier à palettes bat quelques cartes avant de se poser sur aujourd'hui
        if (!KK.reduced) flaps.cal.forEach((fl, i) => setTimeout(() => fl.shuffle(fl.value, 3), 140 + i * 90));
        KK.sfx.play('open');
      } else {
        KK.sfx.play('close');
        panel.classList.remove('is-open');
        panel._t = setTimeout(() => { if (!panel.classList.contains('is-open')) panel.hidden = true; }, KK.reduced ? 0 : 420);
      }
    }
    btn.addEventListener('click', () => set(!isOpen()));
    document.addEventListener('pointerdown', (e) => {
      if (isOpen() && !panel.contains(e.target) && !btn.contains(e.target)) set(false);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isOpen()) { set(false); btn.focus(); }
    });
    KK.on('view', () => set(false));
    KK.hours = { set, get open() { return isOpen(); } };
  }

  /* ---------- Vues & onglets ---------- */
  function show(view, instant) {
    if (!VIEWS.includes(view)) return;
    const from = $('#' + current), to = $('#' + view);
    $$('.view').forEach((v) => (v.inert = v !== to));
    if (view !== current) {
      const dir = VIEWS.indexOf(view) > VIEWS.indexOf(current) ? 1 : -1;
      $('#views').style.setProperty('--dir', dir);
      to.classList.remove('is-leaving');
      void to.offsetWidth;
      from.classList.remove('is-active');
      if (!instant) {
        from.classList.add('is-leaving');
        clearTimeout(from._leaveT);
        from._leaveT = setTimeout(() => from.classList.remove('is-leaving'), 420);
      }
      to.classList.add('is-active');
      current = view;
    }
    $$('.tab').forEach((t) => {
      const on = t.dataset.tab === view;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'page');
      else t.removeAttribute('aria-current');
    });
    rollTabCookie(instant);
    document.title = TITLES[view];
    if (atelier) atelier.setActive(view === 'fournee' && !$('#splash'));
    KK.emit('view', view);
    if (view === 'carte') KK.emit('view:carte');
  }

  function rollTabCookie(instant) {
    const tab = $(`.tab[data-tab="${current}"]`), ck = $('#tab-cookie');
    if (!tab || !ck) return;
    const x = tab.offsetLeft + tab.offsetWidth / 2 - ck.offsetWidth / 2;
    const rot = (x / (ck.offsetWidth / 2)) * (180 / Math.PI);
    if (instant) ck.style.transition = 'none';
    ck.style.transform = `translateX(${x}px) rotate(${rot}deg)`;
    if (instant) {
      void ck.offsetWidth;
      ck.style.transition = '';
    }
  }

  function route(first) {
    const [view, param] = location.hash.replace(/^#/, '').split('/');
    if (view === 'panier') {
      history.replaceState(null, '', '#' + current);
      if (first) show(current, true);
      KK.shop.openCart();
      return;
    }
    if (VIEWS.includes(view)) show(view, first === true);
    else if (first) show('fournee', true);
    if (view === 'carte' && param) {
      history.replaceState(null, '', '#carte');
      setTimeout(() => KK.shop.openProduct(decodeURIComponent(param)), first === true ? 250 : 420);
    }
  }

  /* ---------- Splash : les 7 lettres éclosent une à une, chacune sur sa note,
     accord final, puis le logo se fait croquer ---------- */
  // « K-o-o-k… i-e-s ! » : [tracés du logo, instant (s), note MIDI] ; le i a son point
  const SPLASH_SEQ = [[[0], 0, 67], [[2], 0.13, 72], [[4], 0.26, 76], [[1], 0.42, 79], [[6, 3], 0.62, 81], [[7], 0.75, 79], [[5], 0.92, 84]];
  const SPLASH_CHORD = 1.12;
  const LOGO_CY = 256; // centre de masse du logo (le grand « Kok » pèse en haut) : c'est lui qu'on centre

  function splash() {
    const el = $('#splash');
    if (!el) return Promise.resolve();
    let seen = false;
    try { seen = sessionStorage.getItem('kk:splash') === '1'; } catch (e) { /* ignoré */ }
    if (/[?&]intro\b/.test(location.search)) seen = false; // ?intro dans l'adresse : on la rejoue
    if (seen || KK.reduced || !KK.LOGO) {
      el.remove();
      if (atelier) atelier.setActive(current === 'fournee');
      return Promise.resolve();
    }
    try { sessionStorage.setItem('kk:splash', '1'); } catch (e) { /* ignoré */ }
    const L = KK.LOGO, svgNS = KK.svg;
    const s = svgNS('svg', { viewBox: `-60 ${LOGO_CY - (L.h + 120) / 2} ${L.w + 120} ${L.h + 120}`, class: 'splash-logo', 'aria-hidden': 'true' });
    el.insertBefore(s, el.firstChild);
    const defs = svgNS('defs', null, s);
    const mask = svgNS('mask', { id: 'splash-m', maskUnits: 'userSpaceOnUse', x: -300, y: -300, width: L.w + 600, height: L.h + 600 }, defs);
    svgNS('rect', { x: -300, y: -300, width: L.w + 600, height: L.h + 600, fill: '#fff' }, mask);
    const holes = svgNS('g', { fill: '#000' }, mask);
    // la silhouette en filigrane : les lettres viennent la remplir
    const ghost = svgNS('g', { fill: '#211d18', opacity: 0.07 }, s);
    L.paths.forEach((p) => svgNS('path', { d: p.d, 'fill-rule': 'evenodd' }, ghost));
    const logoG = svgNS('g', { mask: 'url(#splash-m)', fill: '#211d18' }, s);
    const letters = L.paths.map((p) => svgNS('path', { d: p.d, 'fill-rule': 'evenodd', style: 'opacity:0' }, logoG));
    const fx = svgNS('g', null, s);

    let done = false, resolveDone;
    const timers = [];
    const later = (sec, fn) => timers.push(setTimeout(() => { if (!done) fn(); }, sec * 1000));
    const finished = new Promise((r) => (resolveDone = r));
    const finish = () => {
      if (done) return;
      done = true;
      timers.forEach(clearTimeout);
      letters.forEach((p) => { p.style.opacity = 1; p.removeAttribute('transform'); });
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 650);
      if (atelier) setTimeout(() => atelier.setActive(current === 'fournee'), 200);
      resolveDone();
    };

    // une lettre éclot : elle grossit en rebondissant, fait un petit saut, se redresse
    const pop = (i, k) => {
      const p = L.paths[i], path = letters[i], tilt = k % 2 ? 8 : -8;
      KK.tween(440, (e, t) => {
        const sc = 0.15 + 0.85 * e, y = -16 * Math.sin(Math.PI * Math.min(1, t * 1.4)) * (1 - t), r = tilt * (1 - t) * (1 - t);
        path.setAttribute('transform', `translate(${p.cx} ${KK.f(p.cy + y)}) rotate(${KK.f(r)}) scale(${KK.f(sc)}) translate(${-p.cx} ${-p.cy})`);
        path.style.opacity = Math.min(1, t * 5);
      }, KK.ease.outBack);
    };

    const bites = [
      { cx: L.w + 50, cy: 70, r: 118, facing: Math.PI * 0.86 },
      { cx: L.w + 72, cy: 360, r: 108, facing: Math.PI * 1.02 },
      { cx: L.w - 70, cy: L.h + 90, r: 112, facing: Math.PI * 1.32 },
    ];

    function run() {
      // la mélodie est calée sur l'horloge audio ; les lettres la suivent
      const lag = KK.sfx.latency();
      SPLASH_SEQ.forEach(([paths, at, note], k) => {
        KK.sfx.play('letter', { m: note, delay: at * 1000 });
        paths.forEach((i, j) => later(at + j * 0.07 + lag, () => pop(i, k)));
        if (paths.length > 1) KK.sfx.play('dot', { delay: (at + 0.07) * 1000 });
      });
      KK.sfx.play('chord', { delay: SPLASH_CHORD * 1000 });
      later(SPLASH_CHORD + lag, () => {
        if (s.animate) s.animate([{ transform: 'none' }, { transform: 'scale(1.07)' }, { transform: 'scale(.98)' }, { transform: 'none' }], { duration: 520, easing: 'ease-out' });
      });
      // puis trois bouchées
      bites.forEach((b, i) => {
        later(SPLASH_CHORD + 0.5 + i * 0.27, () => {
          const hole = svgNS('path', { d: KK.bitePath(4242 + i, b.cx, b.cy, b.r, b.facing) }, holes);
          KK.tween(130, (e) => hole.setAttribute('transform', `translate(${b.cx} ${b.cy}) scale(${KK.f(0.3 + 0.7 * e)}) translate(${-b.cx} ${-b.cy})`), KK.ease.outCubic);
          crumbs(fx, b);
          KK.sfx.crunch(0.8);
          if (s.animate) s.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${-6 + i * 3}px, 3px) rotate(${i % 2 ? 2 : -2}deg)` }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
        });
      });
      later(SPLASH_CHORD + 1.75, finish);
    }

    // avec le son, il faut d'abord un geste (les navigateurs l'exigent) : « Entrer » lance les lettres et la mélodie
    if (KK.sfx.on && KK.sfx.supported) {
      el.removeAttribute('aria-hidden');
      const gate = document.createElement('button');
      gate.type = 'button';
      gate.className = 'splash-go';
      gate.dataset.sfx = 'none';
      gate.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-sound"/></svg>Entrer';
      el.appendChild(gate);
      setTimeout(() => gate.focus({ preventScroll: true }), 80);
      let started = false;
      el.addEventListener('click', () => {
        if (started) return finish();
        started = true;
        gate.classList.add('is-gone');
        el.setAttribute('aria-hidden', 'true');
        run();
      });
    } else {
      el.addEventListener('click', finish);
      run();
    }
    return finished;
  }

  function crumbs(g, b) {
    const parts = [];
    for (let i = 0; i < 14; i++) {
      const a = b.facing + (Math.random() - 0.5) * 2.2;
      const x = b.cx + Math.cos(a) * b.r, y = b.cy + Math.sin(a) * b.r;
      const pts = [];
      const r = 6 + Math.random() * 12;
      for (let k = 0; k < 5; k++) {
        const aa = (k / 5) * KK.TAU + Math.random() * 0.6;
        pts.push([Math.cos(aa) * r * (0.6 + Math.random() * 0.5), Math.sin(aa) * r * (0.6 + Math.random() * 0.5)]);
      }
      const el = KK.svg('path', { d: KK.closedPath(pts, 0.5), fill: '#211d18' }, g);
      const va = Math.atan2(-Math.sin(b.facing), -Math.cos(b.facing)) + (Math.random() - 0.5) * 1.6;
      parts.push({ el, x, y, vx: Math.cos(va) * (200 + Math.random() * 380), vy: Math.sin(va) * 300 - 280, r: Math.random() * 360, vr: (Math.random() - 0.5) * 700 });
    }
    let last = performance.now(), age = 0;
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      age += dt;
      parts.forEach((p) => {
        p.vy += 1900 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        p.el.setAttribute('transform', `translate(${KK.f(p.x)} ${KK.f(p.y)}) rotate(${KK.f(p.r)})`);
        p.el.setAttribute('opacity', KK.f(Math.max(0, 1 - age / 1.1)));
      });
      if (age < 1.1) requestAnimationFrame(step);
      else parts.forEach((p) => p.el.remove());
    };
    requestAnimationFrame(step);
  }

  /* ---------- Sons ---------- */
  function initSound() {
    const b = $('#sound-btn');
    const sync = () => {
      b.setAttribute('aria-pressed', String(KK.sfx.on));
      b.setAttribute('aria-label', KK.sfx.on ? 'Sons activés' : 'Sons coupés');
      b.querySelector('use').setAttribute('href', KK.sfx.on ? '#i-sound' : '#i-mute');
    };
    b.addEventListener('click', () => {
      KK.sfx.on = !KK.sfx.on;
      sync();
      if (KK.sfx.on) KK.sfx.play('on');
      KK.toast(KK.sfx.on ? 'Son activé : ça croque.' : 'Mode discret activé.');
    });
    sync();
    // le néon de la carte se rallume à chaque visite : tics, puis un léger bourdonnement
    KK.on('view:carte', () => { if (!KK.reduced) KK.sfx.play('neon', { delay: 150 }); });
  }

  /* ---------- Pas de zoom ----------
     Le double-tap est coupé en CSS (touch-action) ; le pincement ici, pour Safari qui ignore user-scalable=no. */
  function noZoom() {
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((t) => document.addEventListener(t, (e) => e.preventDefault(), { passive: false }));
  }

  /* ---------- Démarrage ---------- */
  function init() {
    noZoom();
    KK.sheets.init();
    KK.shop.init();
    KK.loyalty.init();
    KK.insta.init();
    initFlaps();
    initHours();

    const P = KK.shop.products;
    const short = { poire: 'Poire', country: 'Country', pistache: 'Pistache', bueno: 'Bueno' };
    const ids = ['poire', 'country', 'pistache', 'bueno'].filter((id) => P.has(id)); // le Kookie du mois en tête
    atelier = new KK.Atelier($('#factory'), $('#factory-stage'), {
      serial: 400 + (Math.floor(Date.now() / 86400000) % 500),
      flavors: ids.map((id) => ({ id, key: P.get(id).look, name: P.get(id).name, short: short[id], price: KK.fmtPrice(P.get(id).price) })),
      onCycle(fl, serial) {
        $('#fab-name').textContent = fl.name;
        $('#fab-serial').textContent = `n°${KK.pad(serial)}`;
        $('#fab-now').setAttribute('href', `#carte/${fl.id}`);
      },
    });
    KK.atelier = atelier;
    atelier.setActive(false);

    KK.mountCookie($('.drop-cookie'), 'poire', KK.hash('kookie-du-mois'), { fx: false, pri: 4 });
    KK.mountCookie($('#tab-cookie'), 'classique', 7, { fx: false, shadow: false, pad: 2, res: 96, pri: 3 });
    const here = /^https?:$/.test(location.protocol) && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)
      ? location.origin + location.pathname
      : document.querySelector('link[rel="canonical"]').href;
    KK.drawQR($('#decor-qr'), here);

    initSound();
    window.addEventListener('hashchange', () => route(false));
    window.addEventListener('resize', () => rollTabCookie(true));
    route(true);
    requestAnimationFrame(() => rollTabCookie(true));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => rollTabCookie(true));

    splash().then(() => updateStatus(true));
    setInterval(() => updateStatus(false), 60000);
  }

  init();
})();
