/* ==========================================================================
   Kookies — carte fidélité
   10 tampons = 1 Kookie offert, à chaque carte remplie (jamais plus). Chaque
   tampon est un mini cookie unique (graine = n° de carte + carte en cours + rang).
   Au comptoir, l'équipe tamponne et valide le Kookie offert avec son code à
   4 chiffres, sur le téléphone du client (même système que la carte du
   Café Laitue). Maquette : la carte vit sur l'appareil ; en prod, côté serveur.
   ========================================================================== */
(function () {
  'use strict';

  const KK = window.KK;
  const $ = (s, r = document) => r.querySelector(s);
  const GOAL = 10;
  const LOYALTY = {
    maxPerVisit: 10, // tampons maximum en une seule validation
    // Code équipe (4 chiffres) : seule l'empreinte SHA-256 de `${salt}:${code}` est publiée.
    // Pour le changer : node tools/set-pin.mjs 1234
    salt: 'kookies',
    pinHash: 'd5ef59be87b2fc82e2418554d2a4bf083e68fb7a2ac7375af0e69b080e9e4ddd',
  };
  const LOOKS = ['classique', 'marbre', 'triple', 'caramel', 'pecan', 'pistache', 'classique', 'triple', 'caramel', 'marbre'];

  let card = load();
  let pendingNew = -1;

  const save = () => KK.store.set('card', card);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const full = () => !!card && card.stamps >= GOAL;
  const seedOf = (i) => KK.hash(card.id + ':' + (card.redeemed || 0) + ':' + i);

  function load() {
    const c = KK.store.get('card', null);
    if (!c || typeof c !== 'object' || !c.id) return null;
    if (c.v !== 2) {
      // ancienne maquette : les « offerts » s'additionnaient ; désormais une carte pleine = 1 Kookie offert
      c.stamps = Math.max(0, c.stamps | 0) + (c.rewards > 0 ? GOAL : 0);
      c.redeemed = 0;
      c.history = [];
      delete c.rewards;
      c.v = 2;
    }
    return c;
  }

  function newId() {
    const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s = 'KK-';
    for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)];
    return s + '-' + String(Math.floor(Math.random() * 90) + 10);
  }

  function log(k, n) {
    card.history = (card.history || []).concat({ t: Date.now(), k, n }).slice(-40);
  }

  /* QR code (lib qrcode-generator) — repli : le n° de carte en clair */
  function drawQR(el, text) {
    if (!el) return;
    if (typeof window.qrcode !== 'function') {
      el.innerHTML = `<p class="qr-id" style="margin:auto">${esc(text)}</p>`;
      return;
    }
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    el.innerHTML = `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" role="img" aria-label="QR code ${esc(text)}"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fbf8f2"/><path d="${d}" fill="#17110f"/></svg>`;
  }
  KK.drawQR = drawQR;

  /* ======================================================================
     Rendu
     ====================================================================== */
  function render() {
    const lc = $('#lcard');
    lc.classList.remove('is-flipped');
    if (!card) renderOnboarding();
    else renderCard();
    renderProgress();
    renderActions();
  }

  function renderOnboarding() {
    const lc = $('#lcard');
    lc.classList.add('is-new-card');
    lc.classList.remove('is-full');
    $('#lcard-back').innerHTML = '';
    $('#lcard-front').innerHTML = `
      <form class="lcard-form" id="lcard-form" novalidate>
        <div class="lcard-top"><svg class="lcard-logo" viewBox="0 0 544 560" role="img" aria-label="Kookies"><use href="#logo"/></svg><span class="lcard-kind">Carte fidélité</span></div>
        <label for="lcard-name">Écris ton prénom sur ta carte</label>
        <input id="lcard-name" name="given-name" autocomplete="given-name" maxlength="18" placeholder="Ton prénom" required>
        <button class="btn btn-cream" type="submit">Créer ma carte</button>
      </form>`;
    $('#lcard-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#lcard-name'), name = input.value.trim();
      if (name.length < 2) {
        input.focus();
        KK.toast('Ton prénom, pour que la carte soit à toi');
        return;
      }
      card = { v: 2, id: newId(), name, stamps: 0, redeemed: 0, history: [], created: Date.now() };
      save();
      render();
      KK.sfx.stamp();
      KK.toast(`Bienvenue ${name} ! Ta carte est prête.`);
      const f = $('.lcard-front');
      f.animate && f.animate([{ transform: 'scale(.92) rotate(-3deg)' }, { transform: 'none' }], { duration: 520, easing: 'cubic-bezier(.3,1.6,.5,1)' });
    });
  }

  function renderCard() {
    const lc = $('#lcard');
    lc.classList.remove('is-new-card');
    $('#lcard-front').innerHTML = `
      <div class="lcard-top">
        <svg class="lcard-logo" viewBox="0 0 544 560" role="img" aria-label="Kookies"><use href="#logo"/></svg>
        <p class="lcard-name">${esc(card.name)}</p>
        <span class="lcard-state" id="lcard-state"></span>
      </div>
      <div class="stamps" id="stamps" role="img"></div>
      <div class="lcard-foot"><span>${card.id}</span><span>Tape → mon QR</span></div>`;
    const box = $('#stamps'), shown = Math.min(card.stamps, GOAL);
    for (let i = 0; i < GOAL; i++) {
      const s = document.createElement('div');
      s.className = 'stamp' + (i === GOAL - 1 ? ' is-gift' : '');
      s.textContent = i === GOAL - 1 ? 'OFFERT' : i + 1;
      box.appendChild(s);
      if (i < shown) fillSlot(i, i === pendingNew);
    }
    pendingNew = -1;
    $('#lcard-back').innerHTML = `
      <div class="qr" id="qr"></div>
      <p class="qr-id">${card.id}</p>
      <p class="qr-hint" id="qr-hint"></p>`;
    drawQR($('#qr'), 'KOOKIES:' + card.id);
    syncCard();
  }

  /* Un tampon dans sa case : un mini cookie unique, qui s'imprime s'il est nouveau */
  function fillSlot(i, isNew) {
    const s = $('#stamps').children[i];
    if (!s || s.classList.contains('is-on')) return;
    s.textContent = '';
    s.classList.add('is-on');
    KK.mountCookie(s, LOOKS[i % LOOKS.length], seedOf(i), { fx: false, shadow: false, pad: 4 });
    if (isNew) {
      s.classList.remove('is-new');
      void s.offsetWidth;
      s.classList.add('is-new');
    }
  }

  /* Ce qui dépend du nombre de tampons (sans tout redessiner) */
  function syncCard() {
    const isFull = full(), shown = Math.min(card.stamps, GOAL);
    $('#lcard').classList.toggle('is-full', isFull);
    $('#stamps').setAttribute('aria-label', `${shown} tampons sur ${GOAL}${isFull ? ' : un Kookie offert à retirer' : ''}`);
    const st = $('#lcard-state');
    st.className = 'lcard-state ' + (isFull ? 'lcard-reward' : 'lcard-kind');
    st.textContent = isFull ? '1 Kookie offert' : 'Carte fidélité';
    $('#qr-hint').innerHTML = isFull ? '<b>1 Kookie offert</b> t’attend au comptoir' : 'Ton numéro de carte Kookies';
  }

  function renderProgress() {
    const el = $('#lprogress');
    if (!card) {
      el.innerHTML = 'Ta carte, ton prénom, et c’est parti.';
      return;
    }
    if (full()) {
      const extra = card.stamps - GOAL;
      el.innerHTML = '<b>Carte complète !</b> Ton Kookie offert t’attend au comptoir.' +
        (extra ? `<br>${extra} tampon${extra > 1 ? 's' : ''} d’avance sur la carte suivante.` : '');
      return;
    }
    const left = GOAL - card.stamps;
    el.innerHTML = card.stamps === 0
      ? 'Premier tampon au premier Kookie.'
      : `<b>${card.stamps}/${GOAL}</b> · encore ${left} Kookie${left > 1 ? 's' : ''} avant le tien, offert.`;
  }

  function renderActions() {
    const box = $('#lactions');
    box.textContent = '';
    if (!card) return;
    box.innerHTML = `
      <div class="lactions-main">
        <button class="btn btn-plum" type="button" id="l-stamp"><svg class="ico"><use href="#i-stamp"/></svg>Faire tamponner</button>
        <button class="btn btn-line" type="button" id="l-gift"${full() ? '' : ' disabled'}><svg class="ico"><use href="#i-gift"/></svg>Kookie offert</button>
      </div>
      <div class="lactions-more">
        <button class="link-btn" type="button" id="l-wallet">Ajouter au Wallet</button>
        <span aria-hidden="true">·</span>
        <button class="link-btn" type="button" id="l-reset">Réinitialiser la démo</button>
      </div>`;
    $('#l-stamp').addEventListener('click', () => openPin('stamp'));
    $('#l-gift').addEventListener('click', () => openPin('gift'));
    $('#l-wallet').addEventListener('click', () => KK.toast('Bientôt : pass Apple Wallet & Google Wallet'));
    $('#l-reset').addEventListener('click', () => {
      card = null;
      KK.store.del('card');
      render();
    });
  }

  /* ======================================================================
     Tampons et Kookie offert
     ====================================================================== */
  async function addStamps(n, opts = {}) {
    if (!card || n <= 0) return;
    if (opts.silent) {
      card.stamps += n;
      log('stamp', n);
      save();
      render();
      return;
    }
    const wasFull = full();
    for (let k = 0; k < n; k++) {
      const i = card.stamps;
      card.stamps++;
      if (i < GOAL) fillSlot(i, true);
      KK.sfx.stamp();
      KK.vibrate(18);
      if (k < n - 1) await KK.wait(KK.reduced ? 0 : 300);
    }
    log('stamp', n);
    save();
    syncCard();
    renderProgress();
    renderActions();
    if (!wasFull && full()) {
      await KK.wait(KK.reduced ? 0 : 380);
      KK.sfx.play('chime');
      KK.vibrate([20, 60, 20]);
      KK.toast('Carte complète ! Ton Kookie offert t’attend.');
      const lc = $('#lcard');
      lc.animate && lc.animate(
        [{ transform: 'rotate(0)' }, { transform: 'rotate(-4deg) scale(1.04)' }, { transform: 'rotate(3deg) scale(1.02)' }, { transform: 'none' }],
        { duration: 700, easing: 'ease-out' });
    } else if (n > 1) KK.toast(`${n} tampons ajoutés`);
  }

  /* Le Kookie offert est validé : la carte pleine s'envole, une neuve la remplace */
  async function redeem() {
    if (!full()) return;
    const slots = [...$('#stamps').children];
    if (!KK.reduced) {
      slots.forEach((s, i) => s.animate && s.animate(
        [{ transform: 'none', opacity: 1 }, { transform: `translateY(-16px) rotate(${i % 2 ? 40 : -40}deg) scale(.4)`, opacity: 0 }],
        { duration: 340, delay: i * 45, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'forwards' }));
      await KK.wait(340 + GOAL * 45);
    }
    card.stamps -= GOAL;
    card.redeemed = (card.redeemed || 0) + 1;
    log('gift', 1);
    save();
    render();
    KK.sfx.play('chime');
    KK.vibrate([20, 60, 20]);
    KK.toast('Kookie offert ! Bon appétit.');
    const f = $('.lcard-front');
    f.animate && f.animate([{ transform: 'translateX(40px) rotate(4deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }

  /* ======================================================================
     Code équipe : pavé à 4 chiffres, 5 essais puis une minute de pause
     ====================================================================== */
  const pin = { mode: 'stamp', code: '', qty: 1, ok: false };
  const lockState = () => KK.store.get('pinlock', { fails: 0, until: 0 });

  function setDots() {
    [...$('#pin-dots').children].forEach((d, i) => d.classList.toggle('is-on', i < pin.code.length));
  }

  function pinHint(text, err) {
    const h = $('#pin-hint');
    h.textContent = text;
    h.classList.toggle('is-error', !!err);
  }

  function openPin(mode) {
    if (!card || (mode === 'gift' && !full())) return;
    pin.mode = mode;
    pin.code = '';
    pin.qty = 1;
    pin.ok = false;
    setDots();
    $('#pin-qty').hidden = true;
    $('#pin-go').hidden = true;
    $('#keypad').hidden = false;
    $('#pin-dots').hidden = false;
    pinHint(mode === 'gift' ? 'Code équipe, pour offrir le Kookie' : 'Code équipe');
    if (lockState().until > Date.now()) pinHint('Trop d’essais. Réessaie dans une minute.', true);
    KK.sheets.open($('#sheet-pin'));
  }

  async function checkCode() {
    const l = lockState();
    if (l.until > Date.now()) {
      pin.code = '';
      setDots();
      pinHint('Trop d’essais. Réessaie dans une minute.', true);
      return;
    }
    const ok = (await sha256(`${LOYALTY.salt}:${pin.code}`)) === LOYALTY.pinHash;
    if (!ok) {
      const fails = l.fails + 1;
      KK.store.set('pinlock', { fails: fails >= 5 ? 0 : fails, until: fails >= 5 ? Date.now() + 60000 : 0 });
      pinHint(fails >= 5 ? 'Trop d’essais. Réessaie dans une minute.' : 'Code incorrect', true);
      KK.sfx.nope();
      KK.vibrate([40, 40, 40]);
      const dots = $('#pin-dots');
      dots.classList.remove('is-shake');
      void dots.offsetWidth;
      dots.classList.add('is-shake');
      pin.code = '';
      setDots();
      return;
    }
    KK.store.set('pinlock', { fails: 0, until: 0 });
    KK.sfx.play('yes');
    pin.ok = true;
    $('#keypad').hidden = true;
    $('#pin-dots').hidden = true;
    const go = $('#pin-go');
    if (pin.mode === 'stamp') {
      pinHint('Combien de Kookies ?');
      $('#pin-qty').hidden = false;
      $('#pin-qty-v').textContent = '1';
      go.textContent = 'Tamponner';
    } else {
      pinHint(`Offrir son Kookie à ${card.name} ?`);
      go.textContent = 'Valider le Kookie offert';
    }
    go.hidden = false;
    go.focus({ preventScroll: true });
  }

  function press(k) {
    if (pin.ok) return;
    if (k === 'del') pin.code = pin.code.slice(0, -1);
    else if (/^\d$/.test(k) && pin.code.length < 4) pin.code += k;
    else return;
    KK.sfx.tick();
    setDots();
    if (pin.code.length === 4) setTimeout(checkCode, 140);
  }

  function initPin() {
    const sh = $('#sheet-pin');
    $('#keypad').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-k]');
      if (b) press(b.dataset.k);
    });
    sh.addEventListener('keydown', (e) => {
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
    });
    const setQty = (d) => {
      pin.qty = Math.max(1, Math.min(LOYALTY.maxPerVisit, pin.qty + d));
      $('#pin-qty-v').textContent = String(pin.qty);
      KK.sfx.tick();
    };
    $('#pin-minus').addEventListener('click', () => setQty(-1));
    $('#pin-plus').addEventListener('click', () => setQty(1));
    $('#pin-go').addEventListener('click', async () => {
      if (!pin.ok) return;
      pin.ok = false;
      KK.sheets.close(sh);
      await KK.wait(KK.reduced ? 0 : 320);
      if (pin.mode === 'stamp') addStamps(pin.qty);
      else redeem();
    });
  }

  /* SHA-256 : crypto.subtle quand la page est sûre (https, localhost), sinon une petite version JS */
  async function sha256(text) {
    try {
      if (window.crypto && crypto.subtle && window.isSecureContext) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* on passe au repli */ }
    return sha256js(text);
  }

  function sha256js(ascii) {
    const rot = (v, n) => (v >>> n) | (v << (32 - n));
    const H = [], K = [];
    for (let c = 2, n = 0; n < 64; c++) {
      let prime = true;
      for (let d = 2; d * d <= c; d++) if (c % d === 0) { prime = false; break; }
      if (!prime) continue;
      if (n < 8) H[n] = (Math.pow(c, 1 / 2) * 4294967296) | 0;
      K[n++] = (Math.pow(c, 1 / 3) * 4294967296) | 0;
    }
    const bytes = [...ascii].map((ch) => ch.charCodeAt(0) & 255);
    const bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 255);
    let h = H.slice();
    for (let off = 0; off < bytes.length; off += 64) {
      const w = [];
      for (let i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
      for (let i = 16; i < 64; i++) {
        const s0 = rot(w[i - 15], 7) ^ rot(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        const s1 = rot(w[i - 2], 17) ^ rot(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let i = 0; i < 64; i++) {
        const t1 = (hh + (rot(e, 6) ^ rot(e, 11) ^ rot(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
        const t2 = ((rot(a, 2) ^ rot(a, 13) ^ rot(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
        hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      h = [a, b, c, d, e, f, g, hh].map((v, i) => (v + h[i]) | 0);
    }
    return h.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
  }

  function init() {
    $('#lcard').addEventListener('click', (e) => {
      if (!card || e.target.closest('form')) return;
      $('#lcard').classList.toggle('is-flipped');
      KK.sfx.play('flip');
    });
    $('#lcard').addEventListener('keydown', (e) => {
      if (card && (e.key === 'Enter' || e.key === ' ') && e.target === $('#lcard')) {
        e.preventDefault();
        $('#lcard').classList.toggle('is-flipped');
      }
    });
    $('#lcard').tabIndex = 0;
    $('#lcard').setAttribute('aria-label', 'Carte fidélité : touche pour afficher le QR code');
    initPin();
    KK.on('order:paid', (order) => { if (card) addStamps(order.stamps, { silent: true }); });
    render();
  }

  KK.loyalty = { init, card: () => card, addStamps, sha256js };
})();
