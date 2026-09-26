/* ==========================================================================
   Kookies — le four en arrière-plan
   Les textures (cookies, mains) se calculent ici, sur les autres cœurs du
   téléphone, pendant que l'appli reste fluide. Mêmes scripts que la page :
   même graine, même cookie. Les images repartent en PNG (Blob), les champs
   de la 3D en tableaux transférés sans copie.
   ========================================================================== */
self.window = self; // les scripts du site s'accrochent à window.KK
const Q = self.location.search; // même version que la page (?v=…)
importScripts('kk-core.js' + Q, 'kk-bake.js' + Q, 'kk-cookie.js' + Q, 'kk-hands.js' + Q);

self.onmessage = async (e) => {
  const m = e.data, KK = self.KK;
  try {
    let out;
    if (m.kind === 'hand') out = await KK.hands.render(m.side, m.pose);
    else {
      const model = m.key === 'tas' ? { key: 'tas', seed: 1, chunks: [], look: {} } : KK.cookieModel(m.key, m.seed, m.opts || {});
      out = await KK.bake.renderLocal(model, m.stage, m.N);
    }
    const transfer = out && out.alb ? [out.h.buffer, out.alb.buffer, out.nao.buffer] : [];
    self.postMessage({ id: m.id, ok: true, out }, transfer);
  } catch (err) {
    self.postMessage({ id: m.id, ok: false, err: String((err && err.stack) || err) });
  }
};
