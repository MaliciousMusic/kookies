/* ==========================================================================
   Kookies — leurs posts Instagram, en pile
   Une pile un peu en vrac : on attrape la carte du dessus et on la jette
   (à gauche ou à droite), elle repart sous le tas. Double-tap = j'aime,
   comme dans l'appli. Flèches ← → au clavier, boutons sous la pile.
   ========================================================================== */
(function () {
  'use strict';

  const KK = window.KK;
  const $ = (s, r = document) => r.querySelector(s);
  // pose des cartes du dessous (les suivantes sont cachées sous le tas)
  const POSE = [
    { x: 0, y: 0, r: 0, s: 1 },
    { x: 13, y: 9, r: 4.5, s: 0.965 },
    { x: -12, y: 15, r: -5, s: 0.935 },
    { x: 7, y: 21, r: 2.2, s: 0.905 },
  ];
  const THROW_MS = 340;

  function init() {
    const box = $('#insta-stack');
    if (!box) return;
    const cards = [...box.querySelectorAll('.ig')];
    const N = cards.length;
    let order = cards.map((_, i) => i); // order[0] : la carte du dessus
    let busy = false, drag = null, lastTap = { t: 0, card: null }, peeked = false, peek = null;

    const pose = (d) => POSE[Math.min(d, POSE.length - 1)];
    const tf = (p, dx = 0, dy = 0, dr = 0) => `translate(${p.x + dx}px, ${p.y + dy}px) rotate(${p.r + dr}deg) scale(${p.s})`;

    function layout() {
      order.forEach((ci, d) => {
        const c = cards[ci];
        c.style.zIndex = String(N - d);
        c.style.transform = tf(pose(d));
        c.style.opacity = d < POSE.length ? '1' : '0';
        c.classList.toggle('is-top', d === 0);
        c.inert = d !== 0;
      });
      $('#ig-n').textContent = String(order[0] + 1);
    }

    /* la carte du dessus s'envole (dir = -1 gauche, 1 droite), puis repart sous le tas */
    function toss(dir, from) {
      if (busy) return;
      busy = true;
      const c = cards[order[0]];
      c.classList.remove('is-dragging');
      c.style.transition = `transform ${THROW_MS}ms cubic-bezier(.4,0,.9,.6), opacity ${THROW_MS}ms ease-in`;
      const dy = from ? from.dy : -10;
      c.style.transform = `translate(${dir * 125}%, ${dy + 30}px) rotate(${dir * 24}deg) scale(.96)`;
      c.style.opacity = '0';
      KK.sfx.flick();
      setTimeout(() => {
        order.push(order.shift());
        c.style.transition = 'none';
        layout();
        void c.offsetWidth;
        c.style.transition = '';
        busy = false;
      }, KK.reduced ? 0 : THROW_MS);
      // les suivantes remontent tout de suite, en cascade
      order.slice(1).forEach((ci, d) => {
        const n = cards[ci];
        n.style.transform = tf(pose(d));
        n.style.opacity = d < POSE.length ? '1' : '0';
        n.style.zIndex = String(N - d - 1);
      });
      $('#ig-n').textContent = String(order[1] + 1);
    }

    /* la dernière jetée revient sur le dessus, depuis la gauche */
    function back() {
      if (busy) return;
      busy = true;
      const ci = order[N - 1], c = cards[ci];
      c.style.transition = 'none';
      c.style.zIndex = String(N + 1);
      c.style.transform = `translate(-125%, 20px) rotate(-24deg) scale(.96)`;
      c.style.opacity = '0';
      void c.offsetWidth;
      c.style.transition = '';
      order.unshift(order.pop());
      layout();
      KK.sfx.flick();
      setTimeout(() => (busy = false), KK.reduced ? 0 : 420);
    }

    /* j'aime : le cœur se remplit, un grand cœur blanc éclot sur la photo */
    function like(c, force) {
      const btn = $('.ig-like', c), on = force != null ? force : !c.classList.contains('is-liked');
      c.classList.toggle('is-liked', on);
      btn.setAttribute('aria-pressed', String(on));
      if (!on) return;
      KK.sfx.play('like');
      KK.vibrate(12);
      if (KK.reduced) return;
      const pop = document.createElement('span');
      pop.className = 'ig-pop';
      pop.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-heart"/></svg>';
      $('.ig-media', c).appendChild(pop);
      setTimeout(() => pop.remove(), 900);
    }

    /* ---------- le geste : glisser la carte du dessus ---------- */
    box.addEventListener('pointerdown', (e) => {
      const c = e.target.closest('.ig');
      if (busy || e.button > 0 || !c || c !== cards[order[0]] || e.target.closest('a, button')) return;
      if (peek) { peek.cancel(); peek = null; } // on l'attrape pendant qu'elle frétille
      drag = { c, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, dy: 0, t: e.timeStamp, lx: e.clientX, lt: e.timeStamp, vx: 0, on: false };
    });
    box.addEventListener('pointermove', (e) => {
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      d.dx = e.clientX - d.x0;
      d.dy = e.clientY - d.y0;
      if (!d.on) {
        if (Math.abs(d.dy) > 10 && Math.abs(d.dy) > Math.abs(d.dx)) { drag = null; return; } // on fait défiler la page
        if (Math.abs(d.dx) < 6) return;
        d.on = true;
        try { d.c.setPointerCapture(d.id); } catch (_) { /* rien */ }
        d.c.classList.add('is-dragging');
      }
      const dt = Math.max(8, e.timeStamp - d.lt);
      d.vx = d.vx * 0.4 + ((e.clientX - d.lx) / dt) * 0.6;
      d.lx = e.clientX;
      d.lt = e.timeStamp;
      d.c.style.transform = tf(POSE[0], d.dx, d.dy * 0.25, d.dx * 0.07);
    });
    const end = (e) => {
      const d = drag;
      if (!d || e.pointerId !== d.id) return;
      drag = null;
      if (!d.on) {
        // un simple tap : deux de suite sur la photo = j'aime
        if (e.type !== 'pointerup' || !e.target.closest('.ig-media')) return;
        if (e.timeStamp - lastTap.t < 320 && lastTap.card === d.c) {
          like(d.c, true);
          lastTap = { t: 0, card: null };
        } else lastTap = { t: e.timeStamp, card: d.c };
        return;
      }
      d.c.classList.remove('is-dragging');
      // un glisser ne doit pas finir en clic sur un lien
      const block = (ce) => { ce.stopPropagation(); ce.preventDefault(); };
      box.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => box.removeEventListener('click', block, { capture: true }), 60);
      if (Math.abs(d.dx) > 80 || Math.abs(d.vx) > 0.55) toss(Math.sign(d.dx || d.vx), d);
      else d.c.style.transform = tf(POSE[0]);
    };
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
    // Au doigt, le téléphone capture d'abord le pointeur sur l'élément touché (la photo…) :
    // quand la carte le reprend, cet élément le « perd ». Seule la perte par la carte arrête le geste.
    box.addEventListener('lostpointercapture', (e) => { if (drag && drag.on && e.target === drag.c) end(e); });

    box.addEventListener('click', (e) => {
      const b = e.target.closest('.ig-like');
      if (b) like(b.closest('.ig'));
    });
    $('#ig-next').addEventListener('click', () => toss(-1));
    $('#ig-prev').addEventListener('click', back);
    $('#insta').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); toss(-1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    });

    // première visite de « Nous » : la carte du dessus frétille (elle se jette, ça se devine)
    KK.on('view', (v) => {
      if (v !== 'nous' || peeked || KK.reduced) return;
      peeked = true;
      setTimeout(() => {
        const c = cards[order[0]];
        if (drag || busy || !c.animate) return;
        peek = c.animate([
          { transform: tf(POSE[0]) },
          { transform: tf(POSE[0], -34, 0, -5), offset: 0.35 },
          { transform: tf(POSE[0], 10, 0, 1.5), offset: 0.7 },
          { transform: tf(POSE[0]) },
        ], { duration: 900, easing: 'ease-in-out' });
        peek.onfinish = () => (peek = null);
      }, 900);
    });

    layout();
  }

  KK.insta = { init };
})();
