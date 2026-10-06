/**
 * Probe Live for an existing NOVA project folder (no create).
 *   $env:NOVA_CDP_PORT=9299; $env:NOVA_LIVE_PROJECT='LeafNote'; node scripts/live-probe-project.mjs
 */
import http from 'http';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9299);
const NAME = process.env.NOVA_LIVE_PROJECT || 'LeafNote';
const disk = path.join(os.homedir(), 'Documents', 'NOVA Projects', NAME);

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
const page = list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA CDP page missing');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
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
const evalE = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Runtime.enable');
console.log('probing', disk);
const probe = await evalE(`(async () => {
  const api = window.novaDesktop;
  if (!api?.getOrAttachPreview) return { ok: false, error: 'no getOrAttachPreview' };
  const attach = await api.getOrAttachPreview(${JSON.stringify(disk)});
  let mounted = null;
  if (attach?.ok && attach?.url && api.previewProbeMounted) {
    mounted = await api.previewProbeMounted({
      url: attach.url,
      title: ${JSON.stringify(NAME)},
      waitMs: 4000,
    });
  }
  return { attach, mounted };
})()`);
console.log(JSON.stringify(probe, null, 2));
const ok = Boolean(probe?.attach?.ok && probe?.attach?.url && probe?.mounted?.mounted);
if (!ok) {
  console.error('FAIL: Live did not paint');
  process.exit(4);
}
console.log('PASS: Live', probe.attach.url, 'sample=', (probe.mounted.sample || '').slice(0, 120));
process.exit(0);
