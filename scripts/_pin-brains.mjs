/** Pin ensemble brains in NOVA localStorage via CDP. */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
console.log('pin-brains start', PORT);

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
console.log('pages', list.length, list[0]?.url);
const page = list[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => {
  const t = setTimeout(() => j(new Error('ws timeout')), 10000);
  ws.once('open', () => { clearTimeout(t); r(); });
  ws.once('error', j);
});
console.log('ws open');

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

await send('Runtime.enable');
const r = await send('Runtime.evaluate', {
  expression: `(() => {
    const raw = localStorage.getItem('NOVA:local-prefs') || localStorage.getItem('NOVA:local-prefs');
    const prefs = raw ? JSON.parse(raw) : {};
    prefs.activeChatId = 'qwen25-7b';
    prefs.defaultModelId = 'qwen25-7b';
    prefs.lastChatModelId = 'qwen25-7b';
    prefs.activeCoderId = 'qwen25-coder-14b';
    prefs.defaultCodeModelId = 'qwen25-coder-14b';
    prefs.activeDesignId = 'uigen-fx-4b';
    prefs.activeVisionId = 'qwen2-vl-7b';
    prefs.agentLoopOnCreate = true;
    prefs.agentLoopOnEdit = true;
    prefs.planApproveGate = false;
    prefs.agentLoopEnabled = true;
    localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
    return {
      chat: prefs.activeChatId,
      coder: prefs.activeCoderId,
      design: prefs.activeDesignId,
      vision: prefs.activeVisionId,
    };
  })()`,
  returnByValue: true,
});
console.log(JSON.stringify(r.result?.value, null, 2));
ws.close();
