/**
 * Live stall watch — drives NOVA create while polling Code-pill build timer.
 * Requires Open-NOVA-Build.bat (--remote-debugging-port=9229).
 * Watch the left screen: Code overlay + center timer + explorer file times.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const OUT = path.join(__dirname, '..', '.tmp-live-stall-watch.json');
const RUN_TAG = `s${Date.now().toString(36).slice(-4)}`;
const ASK_BASE = process.env.NOVA_LIVE_ASK
  || `Build a simple page with a button that counts how many times I click it.`;
// Always append RUN_TAG so the watcher can find this turn in chat history.
const ASK = /\([a-z0-9]{4,}\)\s*$/i.test(ASK_BASE.trim())
  ? ASK_BASE.replace(/\([a-z0-9]{4,}\)\s*$/i, `(${RUN_TAG})`)
  : `${ASK_BASE.trim()} (${RUN_TAG})`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function waitForCdp(ms = 120000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      if (Array.isArray(list) && list.length) return list;
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error(`CDP not up on ${PORT} — launch Open-NOVA-Build.bat first`);
}

const list = await waitForCdp();
const page = list.find((t) => t.type === 'page' && /NOVA|index\.html|localhost/i.test(`${t.title || ''}${t.url || ''}`))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('NOVA page missing');

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

async function ensureAppReady() {
  const t0 = Date.now();
  while (Date.now() - t0 < 90000) {
    const ok = await evalE(`(() => {
      try {
        const ta = document.querySelectorAll('textarea').length;
        const root = (document.getElementById('root')?.innerHTML || '').length;
        return ta > 0 || root > 40;
      } catch { return false; }
    })()`).catch(() => false);
    if (ok) return true;
    await sleep(500);
  }
  throw new Error('NOVA UI not ready');
}

await ensureAppReady();
console.log(`[live] Connected — watch Code pill on your left (${RUN_TAG})`);
console.log(`[live] Ask: ${ASK}`);

// Stop any in-flight turn + close Code overlay so the composer is usable
await evalE(`(() => {
  const stop = [...document.querySelectorAll('button')].find(b =>
    /stop/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || '')));
  if (stop) stop.click();
  window.dispatchEvent(new CustomEvent('NOVA:close-code-overlay'));
  const closer = document.querySelector('[aria-label="Close code overlay"], [aria-label="Close"]');
  if (closer) closer.click();
  return !!stop;
})()`).catch(() => false);
await sleep(1000);

await evalE(`(() => {
  const btns = [...document.querySelectorAll('button, a, [role="button"]')];
  const hit = btns.find((b) => /new\\s*chat/i.test(((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase()));
  if (hit) { hit.click(); return 'clicked'; }
  location.hash = '#/chat?new=' + Date.now();
  return 'hash';
})()`);
await sleep(1800);

// Clear stale build diag so the timer doesn't show the previous project
await evalE(`(() => {
  try { sessionStorage.removeItem('NOVA:last-build-diag'); } catch {}
  return true;
})()`);

// Send ask
const ok = await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return false;
  const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
  d.set.call(ta, ${JSON.stringify(ASK)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.focus();
  // Prefer clicking the send button if present — more reliable than synthetic Enter
  const sendBtn = [...document.querySelectorAll('button')].find((b) =>
    /send/i.test((b.getAttribute('aria-label') || '') + ' ' + (b.textContent || ''))
    || b.querySelector('svg') && /send|arrow/i.test(b.getAttribute('aria-label') || '')
  );
  if (sendBtn && !sendBtn.disabled) {
    sendBtn.click();
    return 'click';
  }
  ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
  return 'enter';
})()`);
if (!ok) throw new Error('no textarea — is Chat open?');
console.log('[live] Prompt sent via', ok, '— waiting for create to start…');

// Wait until this tag appears in a user message (confirm send landed)
{
  const tWait = Date.now();
  let landed = false;
  while (Date.now() - tWait < 20000) {
    landed = await evalE(`(() => {
      const needle = ${JSON.stringify(RUN_TAG)}.toLowerCase();
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !/NOVA:chat-thread:chat:/.test(k)) continue;
        try {
          const arr = JSON.parse(localStorage.getItem(k) || '[]');
          if (Array.isArray(arr) && arr.some(m => m?.role === 'user' && String(m.content||'').toLowerCase().includes(needle))) return true;
        } catch {}
      }
      return false;
    })()`);
    if (landed) break;
    await sleep(500);
  }
  console.log(landed ? '[live] Ask landed in chat history' : '[live] WARN: ask not found in history yet');
}
await sleep(1500);

// Force Code overlay open so timer is visible
await evalE(`(() => {
  window.dispatchEvent(new CustomEvent('NOVA:open-code-overlay', { detail: { openOverlay: true } }));
  return true;
})()`).catch(() => false);

const t0 = Date.now();
const samples = [];
let lastLine = '';
let lastStall = '';
const timeoutMs = Number(process.env.NOVA_LIVE_TIMEOUT_MS || 12 * 60_000);

while (Date.now() - t0 < timeoutMs) {
  await sleep(1500);
  const snap = await evalE(`(() => {
    const elapsed = (ms) => {
      const s = Math.floor(ms / 1000);
      const m = Math.floor(s / 60);
      return m + ':' + String(s % 60).padStart(2, '0');
    };
    let clock = null;
    try {
      const raw = sessionStorage.getItem('NOVA:last-build-diag');
      if (raw) {
        const parsed = JSON.parse(raw);
        const snap = parsed?.snap || {};
        const started = snap.startedAt ? Date.parse(snap.startedAt) : NaN;
        const ended = snap.endedAt ? Date.parse(snap.endedAt) : NaN;
        const now = Date.now();
        const endMs = Number.isFinite(ended) ? ended : now;
        const totalMs = Number.isFinite(started) ? Math.max(0, endMs - started) : 0;
        const path = snap.writingPath || null;
        const timings = snap.fileTimings || {};
        let currentFileMs = 0;
        if (path) {
          const base = timings[path]?.ms || 0;
          const open = snap.currentPathStartedAt;
          currentFileMs = base + (open != null && !snap.endedAt ? Math.max(0, now - open) : 0);
        }
        const fileList = Object.values(timings)
          .map((t) => {
            let ms = t.ms || 0;
            if (t.path === path && snap.currentPathStartedAt != null && !snap.endedAt) {
              ms = currentFileMs;
            }
            return { path: t.path, ms, done: !!t.done };
          })
          .sort((a, b) => b.ms - a.ms);
        clock = {
          totalLabel: elapsed(totalMs),
          totalMs,
          phase: snap.phase || snap.lastStatus || null,
          path,
          currentFileMs,
          currentFileLabel: elapsed(currentFileMs),
          // Stall = idle since lastActivityAt (same as getBuildLiveClock), not file-open duration.
          stalled: Boolean(
            path
            && !snap.endedAt
            && snap.lastActivityAt != null
            && (now - Number(snap.lastActivityAt)) >= 14_000,
          ),
          ended: Boolean(snap.endedAt),
          ready: snap.ready,
          product: snap.productName,
          softBind: snap.softBindCount,
          topFiles: fileList.slice(0, 6).map((f) => {
            const name = String(f.path || '').split('/').pop();
            return name + ':' + (f.ms / 1000).toFixed(1) + 's';
          }),
        };
      }
    } catch { /* ignore */ }

    const body = document.body?.innerText || '';
    const statusMatch = body.match(/(?:Build:|Fix:|Plan:|Ask:|Tuning |Building |Creating |Using |Coding |Still |Wrote |Preview Ready|Tool loop|Searching |Craft ·|Fast micro|Installing |Name dance|Click counter|npm)[^\\n]{0,100}/i);
    const stop = [...document.querySelectorAll('button')].some(b => /stop/i.test((b.getAttribute('aria-label') || b.textContent || '')));
    const codeOpen = !!document.querySelector('[aria-label="Code files"], [aria-label="code files"]')
      || !!document.querySelector('[aria-label="Close code overlay"]')
      || /Live/i.test(body.slice(0, 500));
    const timerEl = [...document.querySelectorAll('div')].find((el) =>
      /^\\d+:\\d{2}$/.test((el.textContent || '').trim().split('\\n')[0] || '')
      && el.className && /font-mono|tabular/.test(String(el.className))
    );
    const timerText = timerEl ? String(timerEl.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80) : null;

    // Thread done?
    let generating = false;
    let reply = '';
    let provider = null;
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
      }
      const needle = ${JSON.stringify(RUN_TAG)}.toLowerCase();
      for (const k of keys) {
        const arr = JSON.parse(localStorage.getItem(k) || '[]');
        if (!Array.isArray(arr)) continue;
        const hit = arr.findIndex((m) => m?.role === 'user' && String(m.content || '').toLowerCase().includes(needle));
        if (hit < 0) continue;
        const last = arr[arr.length - 1];
        generating = /^__generating__:/i.test(String(last?.content || ''));
        for (let j = hit + 1; j < arr.length; j++) {
          const m = arr[j];
          if (m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || ''))) {
            reply = String(m.content || '');
            provider = m.provider_used || null;
          }
        }
        break;
      }
    } catch { /* ignore */ }

    return {
      wallSec: Math.round((Date.now() - ${t0}) / 1000),
      status: statusMatch ? statusMatch[0] : null,
      stop,
      codeOpen,
      timerText,
      clock,
      generating,
      replyLen: reply.length,
      replyHead: reply.slice(0, 160),
      provider,
      done: reply.length > 40 && !generating && !stop,
    };
  })()`);

  if (!snap) continue;
  samples.push({ at: new Date().toISOString(), ...snap });

  const c = snap.clock;
  const line = [
    `t+${snap.wallSec}s`,
    c ? `build ${c.totalLabel}` : 'build —',
    c?.path ? `file ${String(c.path).split('/').pop()} ${c.currentFileLabel}${c.stalled ? ' STALL' : ''}` : (c?.phase ? `phase ${String(c.phase).slice(0, 40)}` : '—'),
    snap.status ? `ui ${String(snap.status).slice(0, 50)}` : '',
    snap.codeOpen ? 'code-open' : 'code-closed',
  ].filter(Boolean).join(' · ');

  if (line !== lastLine) {
    console.log('[watch]', line);
    if (c?.topFiles?.length) console.log('         files:', c.topFiles.join(' | '));
    lastLine = line;
  }
  if (c?.stalled) {
    const stallKey = `${c.path}:${Math.floor(c.currentFileMs / 1000)}`;
    if (stallKey !== lastStall) {
      console.log(`[STALL] ${c.path} held for ${c.currentFileLabel} — this is where coding is stuck`);
      lastStall = stallKey;
    }
  }

  if (snap.done) {
    console.log('[live] Turn finished.');
    console.log('[live] Provider:', snap.provider || '—');
    console.log('[live] Reply head:', String(snap.replyHead || '').replace(/\s+/g, ' ').slice(0, 200));
    break;
  }
}

const summary = {
  ask: ASK,
  runTag: RUN_TAG,
  samples,
  stalls: samples.filter((s) => s.clock?.stalled).map((s) => ({
    wallSec: s.wallSec,
    path: s.clock?.path,
    ms: s.clock?.currentFileMs,
    phase: s.clock?.phase,
  })),
  last: samples[samples.length - 1] || null,
};
fs.writeFileSync(OUT, JSON.stringify(summary, null, 2));
console.log('[live] Wrote', OUT);
console.log('[live] Stall count:', summary.stalls.length);
if (summary.last?.clock?.topFiles) {
  console.log('[live] Slowest files:', summary.last.clock.topFiles.join(' | '));
}
ws.close();
process.exit(summary.last?.done ? 0 : 2);
