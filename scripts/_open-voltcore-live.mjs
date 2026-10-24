/**
 * Force-open VoltCore on a Live preview window via CDP + electron preview API if present.
 */
import http from 'http';
import WebSocket from 'ws';
import { spawn } from 'child_process';
import path from 'path';
import os from 'os';

const PORT = Number(process.env.NOVA_CDP_PORT || 9301);
const URL = process.env.SHOT_URL || 'http://127.0.0.1:5210/';
const PROJ = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'voltcore-gpus');

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

// Ensure vite on 5210
try {
  await new Promise((resolve, reject) => {
    http.get(URL, (r) => { r.resume(); resolve(); }).on('error', reject);
  });
  console.log('vite ok', URL);
} catch {
  console.log('starting vite…');
  spawn('npx', ['vite', '--host', '127.0.0.1', '--port', '5210'], {
    cwd: PROJ,
    shell: true,
    detached: true,
    stdio: 'ignore',
  }).unref();
  await new Promise((r) => setTimeout(r, 2500));
}

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const pages = (list || []).filter((t) => t.type === 'page' && t.webSocketDebuggerUrl);
const nova = pages.find((t) => /nova/i.test(String(t.title || '')) && /file:/i.test(String(t.url || '')))
  || pages.find((t) => /nova/i.test(String(t.title || '')));
const preview = pages.find((t) => /127\.0\.0\.1:\d{4}/.test(String(t.url || '')));

async function attach(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    const m = JSON.parse(String(raw));
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
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
  return { ws, send, evalE };
}

if (preview?.webSocketDebuggerUrl) {
  const { ws, send, evalE } = await attach(preview.webSocketDebuggerUrl);
  await send('Page.enable');
  await send('Page.navigate', { url: URL });
  await new Promise((r) => setTimeout(r, 2500));
  const snap = await evalE(`({
    url: location.href,
    title: document.title,
    cards: document.querySelectorAll('.gpu-card').length,
    text: (document.body.innerText || '').slice(0, 200),
  })`);
  console.log('preview→', JSON.stringify(snap, null, 2));
  ws.close();
} else if (nova?.webSocketDebuggerUrl) {
  const { ws, evalE } = await attach(nova.webSocketDebuggerUrl);
  const opened = await evalE(`(async () => {
    const api = window.novaDesktop;
    if (api?.previewOpenLive) {
      const r = await api.previewOpenLive({ url: ${JSON.stringify(URL)}, title: 'VoltCore GPUs', show: true });
      return { via: 'previewOpenLive', r };
    }
    if (api?.openLivePreview) {
      const r = await api.openLivePreview({ url: ${JSON.stringify(URL)}, title: 'VoltCore GPUs' });
      return { via: 'openLivePreview', r };
    }
    return { via: 'miss', keys: api ? Object.keys(api).filter((k) => /preview|live/i.test(k)).slice(0, 20) : [] };
  })()`);
  console.log('nova open', JSON.stringify(opened, null, 2));
  ws.close();
} else {
  console.log('no CDP targets');
  process.exit(1);
}
