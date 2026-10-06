/**
 * Prefer the NOVA shell page (not Live preview windows) on multi-target CDP.
 */
import http from 'http';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9240);
const NAME = process.env.NOVA_LIVE_PROJECT || 'CedarNote';
const WAIT = Number(process.env.NOVA_LIVE_WAIT || 10000);
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

function pickNovaPage(list) {
  return list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || '') && /5173|localhost|127\.0\.0\.1:517/.test(t.url || ''))
    || list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
    || list.find((t) => t.type === 'page' && /5173/.test(t.url || ''))
    || list.find((t) => t.type === 'page');
}

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = pickNovaPage(list);
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page missing');
console.log('cdp page', page.title, page.url);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
let id = 0;
const pending = new Map();
ws.on('message', (raw) => {
  const msg = JSON.parse(String(raw));
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

const probe = await evalE(`(async () => {
  const api = window.novaDesktop;
  if (!api?.getOrAttachPreview) return { ok: false, error: 'no api' };
  try { await api.previewCloseLive?.(); } catch {}
  const attach = await api.getOrAttachPreview(${JSON.stringify(disk)});
  let mounted = null;
  if (attach?.ok && attach?.url && api.previewProbeMounted) {
    mounted = await api.previewProbeMounted({ url: attach.url, title: ${JSON.stringify(NAME)}, waitMs: ${WAIT} });
  }
  // Also read live preview CDP target if present
  return { attach, mounted };
})()`);
console.log(JSON.stringify(probe, null, 2));

// Direct DOM check against preview URL via fetch from Nova context
if (probe?.attach?.url) {
  const dom = await evalE(`(async () => {
    const url = ${JSON.stringify(String(probe.attach.url))};
    const html = await fetch(url).then(r => r.text()).catch(e => String(e));
    return { htmlHead: html.slice(0, 280), hasRoot: /id=["']root["']/.test(html) };
  })()`);
  console.log('fetch index', dom);
}

const ok = Boolean(probe?.attach?.ok && probe?.mounted?.mounted);
if (!ok && probe?.attach?.url) {
  // Fallback: evaluate the preview page directly
  const prev = list.find((t) => t.type === 'page' && String(t.url || '').includes(new URL(probe.attach.url).port));
  if (prev?.webSocketDebuggerUrl) {
    const ws2 = new WebSocket(prev.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws2.once('open', resolve); ws2.once('error', reject); });
    let id2 = 0;
    const pending2 = new Map();
    ws2.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.id && pending2.has(msg.id)) {
        const { resolve, reject } = pending2.get(msg.id);
        pending2.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    });
    const send2 = (method, params = {}) => new Promise((resolve, reject) => {
      const i = ++id2;
      pending2.set(i, { resolve, reject });
      ws2.send(JSON.stringify({ id: i, method, params }));
    });
    await new Promise((r) => setTimeout(r, 2500));
    const r2 = await send2('Runtime.evaluate', {
      expression: `({
        title: document.title,
        text: (document.body?.innerText || '').trim().slice(0, 200),
        kids: document.getElementById('root')?.childElementCount || 0,
        fail: !!document.getElementById('nova-preview-fail'),
      })`,
      returnByValue: true,
    });
    console.log('preview DOM', r2.result?.value);
    if (r2.result?.value?.kids > 0 && !r2.result?.value?.fail) {
      console.log('PASS via preview DOM', probe.attach.url);
      process.exit(0);
    }
    ws2.close();
  }
}

process.exit(ok ? 0 : 4);
