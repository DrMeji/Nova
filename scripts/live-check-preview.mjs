/**
 * Inspect Live/Preview/Verifying pill state and optionally click Live.
 * Usage:
 *   node scripts/live-check-preview.mjs
 *   node scripts/live-check-preview.mjs --open
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const doOpen = process.argv.includes('--open');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = (list || []).find((t) => t.type === 'page' && t.webSocketDebuggerUrl
  && (/NOVA|dist\/index|file:/i.test(`${t.title}${t.url}`))
  && !/127\.0\.0\.1:\d+|localhost:\d+/i.test(String(t.url || '')));
if (!page) throw new Error('Nova page not on CDP');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  pending.set(i, { resolve, reject });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const evalE = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};
await send('Runtime.enable');

const snap = await evalE(`(() => {
  const pills = [...document.querySelectorAll('button,[role=button],span')]
    .map((el) => ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).replace(/\\s+/g, ' ').trim())
    .filter((t) => /live|preview|verif|install|fixing|folder|code/i.test(t))
    .slice(0, 20);
  let job = null;
  for (let i = 0; i < sessionStorage.length; i++) {
    const k = sessionStorage.key(i);
    if (!k || !/^nova-create-job:/.test(k)) continue;
    try {
      const j = JSON.parse(sessionStorage.getItem(k) || 'null');
      if (!j) continue;
      if (!job || (j.updatedAt || 0) > (job.updatedAt || 0)) {
        job = {
          name: j.name,
          status: j.status,
          stage: j.stage,
          path: j.path,
          previewUrl: j.previewUrl,
          evidencePass: j.evidencePass,
          craftBlocked: j.craftBlocked,
          obs: String(j.lastObservation || '').slice(0, 160),
          blocked: (j.blockedReasons || []).slice(0, 3),
        };
      }
    } catch {}
  }
  return { pills, job };
})()`);
console.log(JSON.stringify(snap, null, 2));

if (doOpen) {
  const clicked = await evalE(`(() => {
    const els = [...document.querySelectorAll('button,[role=button]')];
    const hit = els.find((el) => {
      const t = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).toLowerCase();
      return /\\b(live|preview)\\b/.test(t) && !/verif|install/i.test(t);
    });
    if (hit) { hit.click(); return ((hit.getAttribute('aria-label') || '') + ' ' + (hit.textContent || '')).trim().slice(0, 80); }
    return null;
  })()`);
  console.log(clicked ? `clicked: ${clicked}` : 'click-miss');
}

ws.close();
