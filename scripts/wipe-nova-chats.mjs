/**
 * Soft-wipe Nova chat threads only (keep prefs / auth).
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9255);

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
let page = list.find((t) => t.type === 'page' && /localhost:5173/i.test(t.url || ''));
if (!page) page = list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page not found');

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.once('open', resolve);
  ws.once('error', reject);
});
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString());
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

await send('Page.enable');
await send('Runtime.enable');

const cur = await send('Runtime.evaluate', {
  expression: 'location.href',
  returnByValue: true,
});
const href = String(cur.result?.value || '');
if (!/localhost:5173/i.test(href)) {
  await send('Page.navigate', { url: 'http://localhost:5173/' });
  await new Promise((r) => setTimeout(r, 2800));
}

const r = await send('Runtime.evaluate', {
  expression: `(() => {
    const remove = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (/chat-thread|recent-chats|chat-studio|chat-code-pill|apply-snapshot|last-edit|pending-add|last-disk-target|recent-projects/i.test(k)) {
        remove.push(k);
        localStorage.removeItem(k);
      }
    }
    try { sessionStorage.clear(); } catch {}
    return { removed: remove.length, sample: remove.slice(0, 12), href: location.href };
  })()`,
  returnByValue: true,
});
console.log('cleared', JSON.stringify(r.result?.value || r, null, 2));
await send('Page.reload', { ignoreCache: true });
await new Promise((r) => setTimeout(r, 2000));
ws.close();
console.log('reloaded');
