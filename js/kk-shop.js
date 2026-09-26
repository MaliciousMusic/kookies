/* ==========================================================================
   Kookies — la vitrine, la fiche qui croque, le panier, la réservation
   Maquette : le panier et la commande vivent dans le localStorage et le
   paiement est simulé. En prod, checkout() appelle une fonction serveur qui
   crée une session Stripe Checkout (voir README).
   ========================================================================== */
(function () {
  'use strict';

  const KK = window.KK;
  const $ = (s, r = document) => r.querySelector(s);

  const SHOP = {
    address: '11b rue Saint-Esprit, 63000 Clermont-Ferrand',
    open: { days: [2, 3, 4, 5, 6], from: 11 * 60, to: 19 * 60 },
    prepMinutes: 45,
  };
  const AUTO_BITES = 3;

  const products = new Map();
  let serial = 1200 + (Math.floor(Date.now() / 86400000) % 300);

  /* ---------- Lecture de la carte depuis le HTML (source de vérité SEO) ---------- */
  function readProducts() {
    document.querySelectorAll('#grid .product').forEach((li, i) => {
      const d = li.dataset;
      const p = {
        id: d.id,
        look: d.look,
        price: parseFloat(d.price),
        cat: (d.cat || '').split(' '),
        name: $('.product-btn', li).textContent.trim(),
        desc: $('.product-desc', li).textContent.trim(),
        def: d.def || '',
        phon: d.phon || '',
        kind: d.kind || '',
        tags: d.tags || '',
        badge: ($('.product-badge', li) || {}).textContent || '',
        unit: d.unit || '',
        variants: d.variants
          ? d.variants.split(',').map((s) => {
            const [q, pr] = s.split('|');
            return { qty: +q, price: parseFloat(pr) };
          })
          : null,
        el: li,
        seed: KK.hash(d.id + ':kookies'),
        bites: 0,
      };
      li.style.setProperty('--i', i);
      $('.product-btn', li).dataset.sfx = 'none'; // sélectionner = croquer : le « croc » suffit
      // en 3D, on attrape le cookie pour le faire tourner ; un simple tap le croque
      p.view = use3D()
        ? KK.gl3d.mount($('.product-cookie', li), p.look, p.seed, { pri: 2, res: 256, sway: true, words: false, pauseUnderSheet: true, onTap: () => tapProduct(p) })
        : KK.mountCookie($('.product-cookie', li), p.look, p.seed, { words: false, floor: floorFor(p.look), pri: 2 });
      products.set(p.id, p);
    });
  }

  const use3D = () => !!(KK.gl3d && KK.gl3d.ok());
  const floorFor = (look) => (look === 'stick' ? 98 : look === 'mini' ? 110 : 122);

  /* Sélectionner, c'est croquer : première bouchée dans la vitrine, puis la fiche */
  function tapProduct(p) {
    if (!p.view.busy) {
      p.view.bite();
      p.bites = p.view.bitesTaken;
    }
    setTimeout(() => openProduct(p.id), 230);
  }
  const priceOf = (p, v) => (p.variants && v != null ? p.variants[v].price : p.price);
  const lineName = (p, v) => (p.variants && v != null ? `${p.name} ×${p.variants[v].qty}` : p.name);
  const hex = (n) => n.toString(16).toUpperCase().padStart(8, '0');

  /* ======================================================================
     Panier
     ====================================================================== */
  const cart = {
    items: KK.store.get('cart', []).filter((it) => it && typeof it.id === 'string'),
    save() {
      KK.store.set('cart', this.items);
      KK.emit('cart:change', this);
    },
    add(id, v, qty) {
      const it = this.items.find((i) => i.id === id && i.v === v);
      if (it) it.qty = Math.min(99, it.qty + qty);
      else this.items.push({ id, v, qty });
      this.save();
    },
    setQty(index, qty) {
      if (qty <= 0) this.items.splice(index, 1);
      else this.items[index].qty = Math.min(99, qty);
      this.save();
    },
    clear() {
      this.items = [];
      this.save();
    },
    valid() {
      return this.items.filter((it) => products.has(it.id));
    },
    count() {
      return this.valid().reduce((n, it) => n + it.qty, 0);
    },
    total() {
      return this.valid().reduce((s, it) => s + priceOf(products.get(it.id), it.v) * it.qty, 0);
    },
    stamps() {
      // Un tampon par Kookie ; une box de minis compte pour un tampon
      return this.valid().reduce((n, it) => n + it.qty, 0);
    },
  };

  /* La commande payée tant qu'elle n'est pas retirée (jusqu'à 2 h après le créneau) */
  function liveOrder() {
    const order = KK.store.get('order');
    return order && new Date(order.when).getTime() > Date.now() - 2 * 3600e3 ? order : null;
  }

  function renderCartUI() {
    const n = cart.count(), total = cart.total();
    const badge = $('#cart-badge'), btn = $('#cart-btn'), pill = $('#cart-pill');
    // une commande en cours (et rien dans le panier) : le sac laisse place à un Kookie qui tourne
    const order = n ? null : liveOrder(), ck = $('#cart-cookie');
    btn.classList.toggle('has-order', !!order);
    ck.hidden = !order;
    if (order && !ck.firstChild) KK.mountCookie(ck, (order.items[0] && order.items[0].look) || 'classique', KK.hash(order.code), { fx: false, shadow: false, pad: 2, res: 96, pri: 3 });
    badge.hidden = n === 0 && !order;
    badge.textContent = order ? '1' : n;
    btn.setAttribute('aria-label', order
      ? `Ma commande ${order.code} : retrait ${order.whenShort || order.whenLabel}`
      : n ? `Ma réservation, ${n} article${n > 1 ? 's' : ''}` : 'Ma réservation (vide)');
    pill.hidden = n === 0;
    $('#carte').classList.toggle('has-cart', n > 0);
    $('#cart-pill-total').textContent = KK.fmtPrice(total);
  }

  function bump() {
    const badge = $('#cart-badge'), btn = $('#cart-btn');
    badge.classList.remove('bump');
    btn.classList.remove('bump');
    void badge.offsetWidth;
    badge.classList.add('bump');
    btn.classList.add('bump');
  }

  /* ======================================================================
     Fiche produit : on croque
     ====================================================================== */
  const sheetP = { el: null, view: null, p: null, qty: 1, v: null, token: 0 };

  function openProduct(id) {
    const p = products.get(id);
    if (!p) return;
    const S = sheetP;
    S.p = p;
    S.qty = 1;
    S.v = p.variants ? 0 : null;
    const token = ++S.token;

    $('#p-tag').textContent = p.badge || (p.cat.includes('format') ? 'Format' : 'Signature');
    $('#p-name').textContent = p.name;
    $('#p-phon').textContent = p.phon;
    $('#p-kind').textContent = p.kind;
    $('#p-def').textContent = p.def;
    $('#p-tags').textContent = p.tags;
    renderVariants();

    const holder = $('#p-cookie');
    if (S.view) S.view.destroy();
    holder.textContent = '';
    S.view = use3D()
      ? KK.gl3d.mount(holder, p.look, p.seed, { pri: 10, res: 512, free: true, el: 0.8, onEmpty: () => regenerate(token), onTap: () => biteSheet() })
      : KK.mountCookie(holder, p.look, p.seed, { floor: floorFor(p.look), onEmpty: () => regenerate(token), pri: 10, res: KK.texRes(Math.min(window.innerWidth * 0.66, 260) * (p.look === 'stick' ? 1.3 : 1)) });
    S.view.applyBites(p.bites);
    holder.setAttribute('aria-label', `Croquer : ${p.name}`);
    serial++;
    setSerial();
    hint('Tape pour croquer');
    updateTotal();

    KK.sheets.open(S.el, { onClose: () => closedProduct(p) });

    // Sélection = plusieurs bouchées, toutes seules
    (async () => {
      await KK.wait(560);
      const target = p.look === 'mini' ? 2 : AUTO_BITES;
      while (S.token === token && S.view && S.view.bitesTaken < target && !S.view.empty) {
        await S.view.bite();
        p.bites = S.view.bitesTaken;
        await KK.wait(430);
      }
    })();
  }

  function biteSheet() {
    const S = sheetP;
    if (!S.view) return;
    S.view.bite().then(() => { if (S.p && S.view) S.p.bites = S.view.bitesTaken; });
  }

  function setSerial() {
    $('#p-serial').textContent = `n°${KK.pad(serial)} · graine ${hex(sheetP.p.seed)}`;
  }

  function hint(text) {
    $('#p-hint').textContent = text;
  }

  function regenerate(token) {
    const S = sheetP, p = S.p;
    hint('Tout croqué ! Un autre sort du four…');
    setTimeout(() => {
      if (S.token !== token || !S.view) return;
      p.seed = KK.newSeed();
      p.bites = 0;
      serial++;
      S.view.setModel(KK.cookieModel(p.look, p.seed));
      S.view.popIn().then(() => hint('Tape pour croquer'));
      setSerial();
    }, 420);
  }

  function closedProduct(p) {
    sheetP.token++;
    // La vitrine se réassortit : un nouveau cookie, unique, prend la place
    p.seed = KK.newSeed();
    p.bites = 0;
    p.view.setModel(KK.cookieModel(p.look, p.seed));
    p.view.popIn();
  }

  function renderVariants() {
    const S = sheetP, p = S.p, box = $('#p-variants');
    box.textContent = '';
    box.hidden = !p.variants;
    if (!p.variants) return;
    p.variants.forEach((v, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'variant';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === S.v));
      b.innerHTML = `${v.qty} <small>${KK.fmtPrice(v.price)}</small>`;
      b.addEventListener('click', () => {
        S.v = i;
        [...box.children].forEach((c, j) => c.setAttribute('aria-checked', String(j === i)));
        updateTotal();
      });
      box.appendChild(b);
    });
  }

  function updateTotal() {
    const S = sheetP;
    $('#p-qty').textContent = S.qty;
    $('#p-total').textContent = KK.fmtPrice(priceOf(S.p, S.v) * S.qty);
  }

  function addToCart() {
    const S = sheetP, p = S.p;
    cart.add(p.id, S.v, S.qty);
    fly($('#p-cookie'), p);
    KK.toast(`Ajouté : ${S.qty} × ${lineName(p, S.v)}`);
    KK.sheets.close(S.el);
  }

  /* Un petit cookie s'envole jusqu'au sac */
  function fly(fromEl, p) {
    const app = $('#app'), to = $('#cart-btn');
    const a = app.getBoundingClientRect(), r1 = fromEl.getBoundingClientRect(), r2 = to.getBoundingClientRect();
    const size = 56;
    const x1 = r1.left - a.left + r1.width / 2 - size / 2, y1 = r1.top - a.top + r1.height / 2 - size / 2;
    const x2 = r2.left - a.left + r2.width / 2 - size / 2, y2 = r2.top - a.top + r2.height / 2 - size / 2;
    const el = document.createElement('div');
    el.className = 'flyer';
    app.appendChild(el);
    KK.mountCookie(el, p.look, p.seed, { shadow: false, fx: false });
    const done = () => {
      el.remove();
      bump();
      KK.sfx.play('add');
    };
    if (KK.reduced || !el.animate) return done();
    const k = Math.min(3, r1.width / size);
    el.animate(
      [
        { transform: `translate(${x1}px, ${y1}px) scale(${k}) rotate(0deg)` },
        { transform: `translate(${(x1 + x2) / 2}px, ${Math.min(y1, y2) - 60}px) scale(1) rotate(200deg)`, offset: 0.55 },
        { transform: `translate(${x2}px, ${y2}px) scale(0.3) rotate(360deg)`, opacity: 0.6 },
      ],
      { duration: 720, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' },
    ).onfinish = done;
  }

  /* ======================================================================
     Réservation : créneaux, coordonnées, paiement (simulé)
     ====================================================================== */
  const sheetC = { el: null, day: 0, slot: null, name: '', phone: '', mode: 'cart' };
  const fmtDay = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
  const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShort = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' });
  const slotLabel = (m) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;

  function pickupDays() {
    const now = KK.parisNow();
    const lead = cart.valid().some((it) => it.id === 'mini') ? 2 : 0; // minis : 48 h à l'avance
    const days = [];
    for (let d = 0; days.length < 6 && d < 16; d++) {
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
      if (!SHOP.open.days.includes(date.getDay()) || d < lead) continue;
      const rnd = KK.rng(KK.hash(date.toDateString()));
      const slots = [];
      for (let m = SHOP.open.from; m <= SHOP.open.to - 30; m += 30) {
        let ok = rnd() > 0.14; // quelques créneaux « complets » pour la démo
        if (d === 0 && m < now.getHours() * 60 + now.getMinutes() + SHOP.prepMinutes) ok = false;
        slots.push({ m, ok });
      }
      if (slots.some((s) => s.ok)) days.push({ date, d, slots });
    }
    return days;
  }

  function openCart(mode) {
    sheetC.mode = mode || (cart.count() ? 'cart' : KK.store.get('order') ? 'order' : 'cart');
    renderCart();
    KK.sheets.open(sheetC.el);
  }

  function renderCart() {
    const body = $('#cart-body'), foot = $('#cart-foot'), title = $('#c-title');
    body.textContent = '';
    foot.textContent = '';
    foot.hidden = false;

    if (sheetC.mode === 'order') {
      const order = KK.store.get('order');
      if (order) return renderSuccess(order, false);
      sheetC.mode = 'cart';
    }
    title.textContent = 'Ma réservation';
    const items = cart.valid();
    if (!items.length) {
      foot.hidden = true;
      body.innerHTML = `
        <div class="empty">
          <div class="empty-plate">${plateSVG()}</div>
          <h3>Rien sur le plateau.</h3>
          <p>Pour l’instant. La vitrine est juste à côté.</p>
          <a class="btn btn-plum" href="#carte" data-close-go>Voir la carte</a>
        </div>`;
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'cart-list';
    items.forEach((it) => {
      const p = products.get(it.id);
      const li = document.createElement('li');
      li.className = 'cart-item';
      li.innerHTML = `
        <div class="mini" aria-hidden="true"></div>
        <div><h3>${lineName(p, it.v)}</h3><p>${KK.fmtPrice(priceOf(p, it.v))}</p></div>
        <div class="stepper stepper--sm" role="group" aria-label="Quantité ${p.name}">
          <button type="button" data-d="-1" aria-label="Un de moins">−</button><output>${it.qty}</output><button type="button" data-d="1" aria-label="Un de plus">+</button>
        </div>`;
      KK.mountCookie($('.mini', li), p.look, KK.hash(p.id + ':kookies'), { shadow: false, fx: false, pad: 6 });
      li.querySelectorAll('[data-d]').forEach((b) =>
        b.addEventListener('click', () => {
          const idx = cart.items.indexOf(it);
          cart.setQty(idx, it.qty + +b.dataset.d);
          renderCart();
        }));
      ul.appendChild(li);
    });
    body.appendChild(ul);

    // Jour & créneau
    const days = pickupDays();
    if (sheetC.day >= days.length) sheetC.day = 0;
    const pick = document.createElement('fieldset');
    pick.className = 'block';
    pick.innerHTML = `<legend class="block-title">Retrait en boutique</legend>
      <div class="days" role="radiogroup" aria-label="Jour de retrait"></div>
      <div class="slots" role="radiogroup" aria-label="Heure de retrait"></div>`;
    const daysEl = $('.days', pick), slotsEl = $('.slots', pick);
    days.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'day';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(i === sheetC.day));
      const lbl = d.d === 0 ? 'Auj.' : d.d === 1 ? 'Demain' : fmtDay.format(d.date).replace('.', '') + '.';
      b.innerHTML = `${lbl}<b>${d.date.getDate()}</b>`;
      b.addEventListener('click', () => {
        sheetC.day = i;
        sheetC.slot = null;
        renderCart();
      });
      daysEl.appendChild(b);
    });
    const day = days[sheetC.day];
    if (day) {
      if (sheetC.slot != null && !day.slots.find((s) => s.m === sheetC.slot && s.ok)) sheetC.slot = null;
      day.slots.forEach((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot';
        b.textContent = slotLabel(s.m);
        b.disabled = !s.ok;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(s.m === sheetC.slot));
        if (!s.ok) b.title = 'Complet';
        b.addEventListener('click', () => {
          sheetC.slot = s.m;
          slotsEl.querySelectorAll('.slot').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          updatePay();
        });
        slotsEl.appendChild(b);
      });
    }
    body.appendChild(pick);

    // Coordonnées
    const who = document.createElement('fieldset');
    who.className = 'block';
    who.innerHTML = `<legend class="block-title">À quel nom ?</legend>
      <div class="field"><label for="c-name">Prénom</label><input id="c-name" name="given-name" autocomplete="given-name" enterkeyhint="next" placeholder="Camille"></div>
      <div class="field"><label for="c-phone">Téléphone (on t’écrit si besoin)</label><input id="c-phone" name="tel" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="done" placeholder="06 12 34 56 78"></div>`;
    const nameIn = $('#c-name', who), phoneIn = $('#c-phone', who);
    nameIn.value = sheetC.name;
    phoneIn.value = sheetC.phone;
    nameIn.addEventListener('input', () => { sheetC.name = nameIn.value; nameIn.removeAttribute('aria-invalid'); });
    phoneIn.addEventListener('input', () => { sheetC.phone = phoneIn.value; phoneIn.removeAttribute('aria-invalid'); });
    body.appendChild(who);

    const note = document.createElement('p');
    note.className = 'note';
    note.innerHTML = `<svg class="ico"><use href="#i-pin"/></svg><span><b>Pas de livraison</b> : on prépare ta commande, tu passes la chercher au ${SHOP.address.split(',')[0]}. Tout est réglé en ligne.</span>`;
    body.appendChild(note);

    foot.innerHTML = `
      <div class="total-row"><span>Total</span><b>${KK.fmtPrice(cart.total())}</b></div>
      <button class="btn btn-plum" id="pay-btn" type="button">Payer & réserver</button>
      <p class="secure"><svg class="ico"><use href="#i-stripe"/></svg>Paiement sécurisé par Stripe · CB, Apple Pay, Google Pay</p>
      <span class="demo-tag">Maquette · aucun paiement réel, rien n’est transmis à la boutique</span>`;
    $('#pay-btn', foot).addEventListener('click', checkout);
    updatePay();
  }

  function updatePay() {
    const btn = $('#pay-btn');
    if (btn) btn.textContent = sheetC.slot == null ? 'Choisis un créneau' : `Payer ${KK.fmtPrice(cart.total())} & réserver`;
  }

  async function checkout() {
    const btn = $('#pay-btn'), nameIn = $('#c-name'), phoneIn = $('#c-phone');
    const days = pickupDays(), day = days[sheetC.day];
    const digits = (phoneIn.value || '').replace(/\D/g, '');
    let bad = null;
    if (!day || sheetC.slot == null) bad = bad || { el: $('.slots'), msg: 'Choisis un créneau de retrait' };
    if (nameIn.value.trim().length < 2) {
      nameIn.setAttribute('aria-invalid', 'true');
      bad = bad || { el: nameIn, msg: 'Il nous faut un prénom' };
    }
    if (digits.length < 10) {
      phoneIn.setAttribute('aria-invalid', 'true');
      bad = bad || { el: phoneIn, msg: 'Un numéro de téléphone valide, s’il te plaît' };
    }
    if (bad) {
      KK.toast(bad.msg);
      if (bad.el.focus) bad.el.focus();
      bad.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    btn.classList.add('is-loading');
    btn.textContent = 'Connexion à Stripe…';
    // PROD : const r = await fetch('/api/checkout', { method: 'POST', body: JSON.stringify(payload) });
    //        location.href = (await r.json()).url;  → Stripe Checkout, puis retour sur /#merci
    await KK.wait(1500);

    const when = new Date(day.date);
    when.setHours(Math.floor(sheetC.slot / 60), sheetC.slot % 60, 0, 0);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'KK-';
    for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
    const order = {
      code,
      items: cart.valid().map((it) => ({ id: it.id, v: it.v, qty: it.qty, name: lineName(products.get(it.id), it.v), look: products.get(it.id).look })),
      total: cart.total(),
      stamps: cart.stamps(),
      when: when.toISOString(),
      whenLabel: `${fmtLong.format(when)} · ${slotLabel(sheetC.slot)}`,
      whenShort: `${fmtShort.format(when)} · ${slotLabel(sheetC.slot)}`,
      name: nameIn.value.trim(),
      created: Date.now(),
    };
    KK.store.set('order', order);
    cart.clear();
    sheetC.slot = null;
    KK.emit('order:paid', order);
    KK.sfx.ding();
    renderSuccess(order, true);
  }

  function renderSuccess(order, fresh) {
    const body = $('#cart-body'), foot = $('#cart-foot');
    $('#c-title').textContent = fresh ? 'Merci !' : 'Ma commande';
    const loyal = KK.loyalty && KK.loyalty.card();
    body.innerHTML = `
      <div class="success">
        <div class="success-cookie"></div>
        <h3>${fresh ? 'C’est réservé.' : 'Commande en cours'}</h3>
        <p>On s’occupe de tout. Rendez-vous au comptoir, ${escapeHTML(order.name)}.</p>
        <div class="ticket">
          <div class="ticket-code">${order.code}</div>
          <div class="ticket-row"><span>Retrait</span><span>${order.whenLabel}</span></div>
          <div class="ticket-row"><span>Où</span><span>${SHOP.address.split(',')[0]}</span></div>
          <div class="ticket-row"><span>Commande</span><span>${order.items.map((i) => `${i.qty} × ${escapeHTML(i.name)}`).join('<br>')}</span></div>
          <div class="ticket-row"><span>Payé</span><span>${KK.fmtPrice(order.total)} · Stripe (démo)</span></div>
        </div>
        <p>${loyal ? `+${order.stamps} tampon${order.stamps > 1 ? 's' : ''} sur ta carte fidélité.` : `<a href="#fidelite" data-close-go>Crée ta carte fidélité</a> pour cumuler tes tampons.`}</p>
      </div>`;
    const first = order.items[0];
    const view = KK.mountCookie($('.success-cookie', body), first ? first.look : 'classique', KK.newSeed(), { fx: false, words: false });
    if (fresh) view.popIn();
    foot.hidden = false;
    foot.innerHTML = `
      <button class="btn btn-line" id="ics-btn" type="button"><svg class="ico"><use href="#i-cal"/></svg>Ajouter au calendrier</button>
      <button class="btn btn-plum" type="button" data-close>Parfait</button>`;
    $('#ics-btn', foot).addEventListener('click', () => downloadICS(order));
    $('[data-close]', foot).addEventListener('click', () => KK.sheets.close(sheetC.el));
  }

  function downloadICS(order) {
    const start = new Date(order.when);
    const pad = (n) => String(n).padStart(2, '0');
    const local = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    const end = new Date(start.getTime() + 30 * 60000);
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Kookies//Reservation//FR', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${order.code}@kookies-clermont.fr`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;TZID=Europe/Paris:${local(start)}`,
      `DTEND;TZID=Europe/Paris:${local(end)}`,
      `SUMMARY:Retrait Kookies (${order.code})`,
      `LOCATION:Kookies\\, ${SHOP.address.replace(/,/g, '\\,')}`,
      `DESCRIPTION:${order.items.map((i) => `${i.qty} × ${i.name}`).join('\\n')}`,
      'END:VEVENT', 'END:VCALENDAR',
    ].join('\r\n');
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `kookies-${order.code}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function plateSVG() {
    const r = KK.rng(42);
    let crumbs = '';
    for (let i = 0; i < 9; i++) {
      const a = r.range(0, KK.TAU), d = r.range(8, 44), s = r.range(2, 5);
      const x = 75 + Math.cos(a) * d, y = 75 + Math.sin(a) * d * 0.8;
      const pts = [];
      for (let j = 0; j < 4; j++) {
        const aa = (j / 4) * KK.TAU + r.range(0, 0.8);
        pts.push([x + Math.cos(aa) * s, y + Math.sin(aa) * s]);
      }
      crumbs += `<path d="${KK.closedPath(pts, 0.3)}" fill="${r.pick(['#D79B59', '#AE6C34', '#EABD7D', '#3B2319'])}"/>`;
    }
    return `<svg viewBox="0 0 150 150" aria-hidden="true"><ellipse cx="75" cy="80" rx="66" ry="58" fill="#e0d4c1"/><ellipse cx="75" cy="75" rx="66" ry="58" fill="#fbf8f2"/><ellipse cx="75" cy="75" rx="48" ry="41" fill="none" stroke="#ece3d4" stroke-width="2"/>${crumbs}</svg>`;
  }

  /* Pastille « commande en cours » sur l'accueil */
  function renderOrderPill() {
    const pill = $('#order-pill'), order = liveOrder();
    pill.hidden = !order;
    renderCartUI();
    if (order) {
      pill.innerHTML = `<svg class="ico"><use href="#i-bag"/></svg><span>Commande <b>${order.code}</b> · retrait ${order.whenShort || order.whenLabel}</span><svg class="ico ico-sm"><use href="#i-arrow"/></svg>`;
    }
  }

  /* ======================================================================
     Branchements
     ====================================================================== */
  function init() {
    sheetP.el = $('#sheet-product');
    sheetC.el = $('#sheet-cart');
    readProducts();

    $('#grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.product-btn');
      if (!btn) return;
      const p = products.get(btn.closest('.product').dataset.id);
      if (p) tapProduct(p);
    });

    $('#chips').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const f = chip.dataset.filter;
      document.querySelectorAll('#chips .chip').forEach((c) => {
        c.classList.toggle('is-on', c === chip);
        c.setAttribute('aria-pressed', String(c === chip));
      });
      let i = 0;
      products.forEach((p) => {
        const show = f === 'all' || p.cat.includes(f);
        p.el.classList.toggle('is-hidden', !show);
        if (show) {
          p.el.style.setProperty('--i', i++);
          const card = $('.product-card', p.el);
          card.style.animation = 'none';
          void card.offsetWidth;
          card.style.animation = '';
        }
      });
    });

    $('#p-cookie').addEventListener('click', (e) => {
      // en 3D, le tap est déjà géré par la vue (un glisser ne croque pas) ; ici : le clavier
      if (sheetP.view && sheetP.view.is3d && e.detail !== 0) return;
      biteSheet();
    });
    $('#p-minus').addEventListener('click', () => { sheetP.qty = Math.max(1, sheetP.qty - 1); updateTotal(); });
    $('#p-plus').addEventListener('click', () => { sheetP.qty = Math.min(20, sheetP.qty + 1); updateTotal(); });
    $('#p-add').addEventListener('click', addToCart);

    $('#cart-btn').addEventListener('click', () => openCart());
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href="#panier"]');
      if (!a) return;
      e.preventDefault();
      openCart(a.id === 'order-pill' ? 'order' : undefined);
    });

    KK.on('cart:change', renderCartUI);
    KK.on('order:paid', renderOrderPill);
    renderOrderPill();
    setInterval(renderOrderPill, 60000); // la commande retirée, le sac revient

    // « Attrape un cookie… » : 6 s après la première visite de la carte, l'astuce s'efface
    const tip = $('.carte-hint');
    let tipArmed = false;
    KK.on('view:carte', () => {
      if (tipArmed || !tip) return;
      tipArmed = true;
      setTimeout(() => {
        tip.classList.add('is-gone');
        setTimeout(() => (tip.hidden = true), KK.reduced ? 0 : 1000);
      }, 6000);
    });
  }

  KK.shop = { init, openProduct, openCart, products, cart };
})();
