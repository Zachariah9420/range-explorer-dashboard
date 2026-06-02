// loader.js — fetch dashboard.json on a polling interval, update window.DATA,
// trigger re-render.
//
// Default: poll every 30 seconds.
// Replay / live tweak: append `?poll=<seconds>` to the page URL to override,
//   e.g. V4.html?poll=1   → poll every 1 second (replay mode)
//        V4.html?poll=5   → poll every 5 seconds (faster live)
//
// Drop next to V4.html and replace <script src="data-base.js"></script> with
// <script src="loader.js"></script>.

(async function () {
  const URL_BASE = './dashboard.json';

  // Read poll override from URL (?poll=2 → 2000 ms). Default 30 s.
  let refreshMs = 30000;
  try {
    const p = new URLSearchParams(window.location.search).get('poll');
    if (p != null) {
      const sec = parseFloat(p);
      if (sec > 0 && sec < 600) refreshMs = sec * 1000;
    }
  } catch (e) { /* ignore */ }
  console.log('[loader] polling every', refreshMs, 'ms');

  async function load() {
    try {
      const r = await fetch(URL_BASE + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) {
        console.warn('[loader] fetch failed status', r.status);
        return;
      }
      const j = await r.json();
      window.DATA = j;
      window.dispatchEvent(new Event('DATA_UPDATED'));
      console.log('[loader] DATA updated at', j.asOf, '— signals:', j.signalsCount,
                  '· events:', (j.EVENTS || []).length);
    } catch (e) {
      console.error('[loader] error', e);
    }
  }

  await load();
  setInterval(load, refreshMs);
})();
