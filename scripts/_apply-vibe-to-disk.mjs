/**
 * Apply vibe-lounge surgical shell to the velvet-hour project, then nudge Live.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import WebSocket from 'ws';
import { finalizeWebEdits } from '@/lib/webProjectCanon';

const PORT = Number(process.env.NOVA_CDP_PORT || 9333);
const disk = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'velvet-hour');
if (!fs.existsSync(disk)) throw new Error(`missing ${disk}`);

const files = {};
for (const rel of ['src/App.tsx', 'src/App.jsx', 'src/App.css', 'src/index.css', 'index.html', 'package.json']) {
  const p = path.join(disk, rel);
  if (fs.existsSync(p)) files[rel] = fs.readFileSync(p, 'utf8');
}
if (!files['src/App.jsx'] && files['src/App.tsx']) {
  files['src/App.jsx'] = files['src/App.tsx'];
}

const ask = 'Rebuild Velvet Hour as a dusk cocktail lounge listening room. Stay for the last song. Reserve a seat. Tonight: Vinyl Hour, Low Lights, Quiet Corner. Footer hours and email.';
const edits = finalizeWebEdits(files, ask, [], { projectName: 'Velvet Hour' });
if (!edits.length) throw new Error('no surgical edits');
for (const e of edits) {
  const out = path.join(disk, e.path);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, e.content, 'utf8');
  console.log('wrote', e.path, e.content.length);
}
// Prefer jsx lock for thin projects — keep tsx in sync if it was the primary.
if (files['src/App.tsx'] && edits.some((e) => /App\.jsx$/i.test(e.path))) {
  const jsx = edits.find((e) => /App\.jsx$/i.test(e.path))?.content;
  if (jsx) {
    fs.writeFileSync(path.join(disk, 'src', 'App.tsx'), jsx, 'utf8');
    console.log('synced src/App.tsx');
  }
}

const list = await new Promise((resolve, reject) => {
  http.get(`http://127.0.0.1:${PORT}/json/list`, (res) => {
    let b = '';
    res.on('data', (c) => { b += c; });
    res.on('end', () => resolve(JSON.parse(b)));
  }).on('error', reject);
});
const page = list.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r, j) => { ws.once('open', r); ws.once('error', j); });
let id = 0;
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const i = ++id;
  const onMsg = (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.id !== i) return;
    ws.off('message', onMsg);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  };
  ws.on('message', onMsg);
  ws.send(JSON.stringify({ id: i, method, params }));
});
const live = await send('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const els = [...document.querySelectorAll('button,[role=button],a,span')];
    const hit = els.find((el) => {
      const t = ((el.getAttribute('aria-label') || '') + ' ' + (el.textContent || '')).trim();
      return /^Live$/i.test(t) || (/\\bLive\\b/.test(t) && t.length < 20);
    });
    if (hit) hit.click();
    return Boolean(hit);
  })()`,
});
console.log('Live click', live.result?.value);
ws.close();
console.log('OK applied vibe shell →', disk);
process.exit(0);
