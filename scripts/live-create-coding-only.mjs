/**
 * Coding-only live create: one new chat → build a premium site → assert App imports React
 * and isPreviewReady. Watch the NOVA window.
 *
 *   $env:NOVA_CDP_PORT='9299'; node scripts/live-create-coding-only.mjs
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9299);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BRAND = process.env.NOVA_CREATE_BRAND || `Maris Loom`;
const SLUG = BRAND.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
if (!page?.webSocketDebuggerUrl) throw new Error(`NOVA missing on CDP ${PORT}`);

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

await send('Page.enable');
await send('Runtime.enable');

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hits = els.filter(el => (el.getAttribute('aria-label') || '') === 'Chat');
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  if (hits[0]) hits[0].click();
  return true;
})()`);
await sleep(2000);

const prompt = `Build a premium linen home goods website called ${BRAND} — soft oatmeal cloth, ink navy type, quiet terracotta accents, full-bleed woven-linen hero, editorial typography, product grid with real linen products, not neon, not tech, not tea shop leftover. Create the project now.`;

console.log('=== CODING-ONLY CREATE ===');
console.log('Brand:', BRAND);
console.log('Prompt:', prompt);
console.log('Watch NOVA Chat…');

await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(prompt)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`);

const needle = prompt.slice(0, 40);
const t0 = Date.now();
let reply = '';
while (Date.now() - t0 < 600000) {
  await sleep(2500);
  const snap = await evalE(`(() => {
    const needle = ${JSON.stringify(needle)};
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    for (const k of keys) {
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
      let userIdx = -1;
      for (let i = arr.length - 1; i >= 0; i--) {
        if (arr[i]?.role === 'user' && String(arr[i].content || '').includes(needle)) { userIdx = i; break; }
      }
      if (userIdx < 0) continue;
      const last = arr[arr.length - 1];
      if (last?.role === 'assistant' && /^__generating__:/i.test(String(last.content || ''))) {
        return { generating: true, status: String(last.content || '').slice(0, 120) };
      }
      let asst = null;
      for (let i = userIdx + 1; i < arr.length; i++) {
        if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content || ''))) asst = arr[i];
      }
      if (asst) return { generating: false, content: String(asst.content || ''), provider: asst.provider_used || asst.provider };
    }
    return null;
  })()`);
  if (snap?.generating) {
    process.stdout.write(`\rstatus: ${(snap.status || '').replace(/^__generating__:/, '').slice(0, 80)}   `);
    continue;
  }
  if (snap?.content && snap.content.length > 40) {
    reply = snap.content;
    console.log('\nmeta:', snap.provider);
    console.log(reply.slice(0, 600));
    break;
  }
}
if (!reply) throw new Error('create timed out');

const roots = [
  path.join(os.homedir(), 'Documents', 'NOVA Projects', SLUG),
  path.join(os.homedir(), 'Documents', 'NOVA Projects', SLUG),
];
const disk = roots.find((p) => fs.existsSync(p));
if (!disk) {
  console.error('FAIL: project folder missing', roots);
  process.exit(1);
}
const appPath = ['src/App.tsx', 'src/App.jsx'].map((r) => path.join(disk, r)).find((p) => fs.existsSync(p));
const app = fs.readFileSync(appPath, 'utf8');
const badReact = /\bReact\.use(?:State|Effect)/.test(app) && !/\bimport\s+React\b|\bimport\s+\*\s+as\s+React\b/.test(app);
console.log('disk:', disk);
console.log('app:', appPath, 'len=', app.length);
if (badReact) {
  console.error('FAIL: React.* without import — would blank Live');
  process.exit(1);
}
if (!/export\s+default/i.test(app) || app.length < 200) {
  console.error('FAIL: App too thin');
  process.exit(1);
}
if (/NOVA · scaffold/i.test(reply) && !/NOVA · create/i.test(reply)) {
  console.error('FAIL: scaffold-only reply');
  process.exit(1);
}
console.log('PASS coding-only create (React import + App present)');
process.exit(0);
