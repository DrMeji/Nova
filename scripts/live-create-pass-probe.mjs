/**
 * One create probe with custom brief (habit / todo / shop).
 *
 *   $env:NOVA_CDP_PORT='9299'
 *   $env:NOVA_PROBE_BRIEF='Build a habit tracker…'
 *   $env:NOVA_PROBE_BRAND='Streakly'
 *   node scripts/live-create-pass-probe.mjs
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9299);
const BRAND = String(process.env.NOVA_PROBE_BRAND || 'ProbeApp').trim();
const BRIEF = String(process.env.NOVA_PROBE_BRIEF || `Build an app called ${BRAND}`).trim();
const WAIT_MS = Number(process.env.NOVA_PROBE_WAIT_MS || 720_000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TEST_STARTED_AT = Date.now();

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

function esc(s) {
  return JSON.stringify(String(s));
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

const chrome = await evalE(`(() => {
  try {
    const raw = localStorage.getItem('nova-local-prefs');
    const p = raw ? JSON.parse(raw) : {};
    p.prefsVersion = Math.max(13, Number(p.prefsVersion) || 0);
    p.fontSizePx = 16;
    p.density = 'comfortable';
    p.compactSidebar = false;
    localStorage.setItem('nova-local-prefs', JSON.stringify(p));
    document.documentElement.style.fontSize = '16px';
    document.documentElement.dataset.density = 'comfortable';
    document.documentElement.style.zoom = '1';
    window.dispatchEvent(new Event('nova:prefs-changed'));
  } catch {}
  return {
    fontSize: document.documentElement.style.fontSize,
    density: document.documentElement.dataset.density,
    zoom: document.documentElement.style.zoom || 'unset',
    devicePixelRatio: window.devicePixelRatio,
  };
})()`);
console.log('chrome lock:', chrome);

await evalE(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const hits = els.filter(el => (el.getAttribute('aria-label') || '') === 'Chat');
  hits.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length);
  if (hits[0]) hits[0].click();
  return true;
})()`);
await sleep(1200);
await evalE(`(() => {
  const btns = [...document.querySelectorAll('button,[role=button]')];
  const neu = btns.find(b => /new chat|new conversation/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  if (neu) { neu.click(); return 'new'; }
  return 'skip';
})()`);
await sleep(1000);

const prompt = `Create a new website project called ${BRAND} on disk now. ${BRIEF}. Skip Plan — build it.`;
console.log('=== CREATE PASS PROBE ===');
console.log('Brand:', BRAND);
console.log('Prompt:', prompt);

await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) throw new Error('no textarea');
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${esc(prompt)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return true;
})()`);

const needle = prompt.slice(0, 36);
const t0 = Date.now();
let reply = '';
while (Date.now() - t0 < WAIT_MS) {
  await sleep(4000);
  let snap = null;
  try {
    snap = await evalE(`(() => {
      const needle = ${esc(needle)};
      const brand = ${esc(BRAND)};
      const startedAt = ${TEST_STARTED_AT};
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
          return { generating: true, status: String(last.content || '').slice(0, 160) };
        }
        let asst = null;
        for (let i = userIdx + 1; i < arr.length; i++) {
          if (arr[i]?.role === 'assistant' && !/^__generating__:/i.test(String(arr[i].content || ''))) asst = arr[i];
        }
        if (asst) {
          const ts = Number(asst.createdAt || asst.ts || asst.at || 0);
          if (ts && ts < startedAt - 5000) continue;
          return { generating: false, content: String(asst.content || '') };
        }
      }
      const statusEls = [...document.querySelectorAll('[class*="status"],[data-status],.nova-build-status')];
      const status = statusEls.map(e => e.textContent || '').join(' ') || (document.body?.innerText || '');
      return { generating: true, status: status.replace(/\\s+/g, ' ').slice(0, 140) };
    })()`);
  } catch (err) {
    console.log('CDP retry:', String(err.message || err).slice(0, 120));
    continue;
  }
  if (snap?.generating) {
    process.stdout.write(`\rstatus: ${String(snap.status || '').replace(/^__generating__:/, '').replace(/\s+/g, ' ').slice(0, 100)}   `);
    continue;
  }
  if (snap?.content && snap.content.length > 40) {
    const c = snap.content;
    const looksDone = /Created\s+\*\*|Live ready|Live unlocked|quality verified|quality still open|setup did not finish|Open \*\*Live\*\*|Dependencies installed|Live server/i.test(c);
    const brandRe = new RegExp(BRAND.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const mentionsBrand = brandRe.test(c);
    if ((!looksDone || !mentionsBrand) && Date.now() - t0 < WAIT_MS - 30_000) {
      process.stdout.write(`\rwaiting final… ${Math.round((Date.now() - t0) / 1000)}s   `);
      continue;
    }
    reply = c;
    break;
  }
}

console.log('\n--- reply ---');
console.log((reply || '(no reply)').slice(0, 900));

const quality = /quality verified|Live ready · quality/i.test(reply);
const liveOpen = /Live unlocked|quality still open|Live ready|Created\s+\*\*/i.test(reply);
const suspiciousMarketing = /habit|todo|tracker/i.test(BRIEF)
  && /full-bleed hero|Get started|marketing landing/i.test(reply);

console.log('\n--- probe ---');
console.log({
  brand: BRAND,
  qualityReadyHint: quality,
  liveUnlockHint: liveOpen,
  suspiciousMarketingReply: suspiciousMarketing,
  elapsedSec: Math.round((Date.now() - t0) / 1000),
});

ws.close();
process.exit(reply ? 0 : 2);
