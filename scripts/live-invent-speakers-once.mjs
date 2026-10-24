/**
 * Wipe Nova chat + project history, then Nova-only invent a speakers showroom.
 * Cursor only drives CDP — Nova creates the site.
 *
 *   $env:NOVA_CDP_PORT='9340'; node scripts/live-invent-speakers-once.mjs
 */
import http from 'http';
import { spawnSync } from 'child_process';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9340);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const tag = Date.now().toString(36).slice(-4);
const brand = process.env.NOVA_CREATE_BRAND || `Soundridge Labs ${tag}`;

const prompt = [
  `Create a brand-new website on disk for **${brand}** — a speakers and audio systems brand.`,
  'Show exactly 12 unique pieces: bookshelf speakers, floorstanders, subwoofers, in-wall/ceiling mounts, soundbar, studio monitors, outdoor pair, amplifier, streamer/preamp, speaker cable kit, and a woofer — each with name, type, short blurb, and price.',
  'Brand-first listening-room hero, system story, the 12-piece bay grid (layout-speakers + spk-grid acoustic tiles), and a working inquiry form with name/email React state.',
  'Quality→premium showroom look — dark listening room for speakers only. Logo must be a speaker cabinet mark (not a music note).',
  'Skip Plan. Start building now — invent App + CSS and open Live when ready.',
].join(' ');

console.log('=== WIPE chat + project history ===');
const list = await new Promise((res, rej) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (r) => {
    let b = '';
    r.on('data', (c) => (b += c));
    r.on('end', () => res(JSON.parse(b)));
  }).on('error', rej);
});
const page = list.find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) {
  console.error('NOVA not on CDP', PORT);
  process.exit(2);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
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
  const t = setTimeout(() => { pending.delete(i); reject(new Error(`timeout ${method}`)); }, 25_000);
  pending.set(i, {
    resolve: (v) => { clearTimeout(t); resolve(v); },
    reject: (e) => { clearTimeout(t); reject(e); },
  });
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
await send('Page.enable');

const wiped = await evalE(`(() => {
  let n = 0;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  for (const k of keys) {
    if (!k) continue;
    if (/NOVA:(?:recent-chats|recent-projects|chat-thread|chat-studio|create-job|last-disk|pending|work-queue|clinic|plan|thread-brain|studio)/i.test(k)
      || /nova-create-job/i.test(k)) {
      localStorage.removeItem(k);
      n += 1;
    }
  }
  const skeys = [];
  for (let i = 0; i < sessionStorage.length; i++) skeys.push(sessionStorage.key(i));
  for (const k of skeys) {
    if (!k) continue;
    if (/nova-create-job|NOVA:/i.test(k)) {
      sessionStorage.removeItem(k);
      n += 1;
    }
  }
  try { window.dispatchEvent(new CustomEvent('NOVA:new-chat')); } catch {}
  return n;
})()`);
console.log('wiped keys:', wiped);
await send('Page.reload', { ignoreCache: true });
await sleep(3500);
ws.close();

console.log('=== NOVA LIVE INVENT · SPEAKERS ===');
console.log('Brand:', brand);
console.log('Watch Nova — Cursor only submits via CDP.');
console.log('');

const g = spawnSync(
  'npx',
  ['tsx', '--tsconfig', 'tsconfig.app.json', 'scripts/live-harness-invent-once.mjs'],
  {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: true,
    env: {
      ...process.env,
      NOVA_CDP_PORT: String(PORT),
      NOVA_CREATE_BRAND: brand,
      NOVA_CREATE_PROMPT: prompt,
      NOVA_CREATE_TIMEOUT_MS: String(25 * 60_000),
    },
    stdio: 'inherit',
  },
);
process.exit(g.status ?? 1);
