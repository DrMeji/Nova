/**
 * Single-step probe: send ONE ask, wait, report disk + whether it landed.
 * Usage: ARK_CDP_PORT=9341 node scripts/live-one-step.mjs "Add the word Nightglass…"
 */
import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';

const port = process.env.ARK_CDP_PORT || '9341';
const prompt = process.argv.slice(2).join(' ').trim();
if (!prompt) {
  console.error('Usage: node scripts/live-one-step.mjs "<prompt>"');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[one ${new Date().toISOString().slice(11, 19)}]`, ...a);
const ROOT = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'Nightglass');

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

async function connectCdp() {
  let targets;
  for (let i = 0; i < 40; i++) {
    try {
      targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      if (Array.isArray(targets) && targets.length) break;
    } catch { /* retry */ }
    await sleep(500);
  }
  if (!targets?.length) throw new Error(`No CDP on ${port}`);
  // Prefer the main NOVA chat page — never the project Preview (localhost:52xx).
  const page = targets.find((t) => t.type === 'page' && /NOVA/i.test(t.title || '') && !/localhost|127\.0\.0\.1/i.test(t.url || ''))
    || targets.find((t) => t.type === 'page' && !/localhost|127\.0\.0\.1/i.test(t.url || '') && t.webSocketDebuggerUrl)
    || targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    || targets.find((t) => t.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) throw new Error('No websocket target');
  log('cdp target', page.title, (page.url || '').slice(0, 80));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  let nextId = 1;
  const waiters = new Map();
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.id && waiters.has(msg.id)) {
      const w = waiters.get(msg.id);
      waiters.delete(msg.id);
      if (msg.error) w.rej(new Error(JSON.stringify(msg.error)));
      else w.res(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = nextId++;
    waiters.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Runtime.enable', {});
  const ev = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (result?.exceptionDetails) throw new Error(result.exceptionDetails.text || 'eval failed');
    return result?.result?.value;
  };
  return { ws, ev, send };
}

async function bindNightglass(ev) {
  return ev(`(async () => {
    const diskRoot = ${JSON.stringify(ROOT)};
    const chatId = 'chat-nightglass-probe';
    try {
      localStorage.setItem('NOVA:recent-chats', JSON.stringify([{
        id: chatId,
        mode: 'general',
        title: 'Nightglass',
        updatedAt: new Date().toISOString(),
        preview: 'Nightglass brown probe',
      }]));
      localStorage.setItem('NOVA:chat-studio:' + chatId, JSON.stringify({
        files: {},
        projectId: null,
        name: 'Nightglass',
        diskRoot,
        previewUrl: null,
        savedAt: Date.now(),
      }));
      localStorage.setItem('NOVA:last-disk:' + chatId, JSON.stringify({ path: diskRoot, at: Date.now() }));
      localStorage.setItem('NOVA:chat-code-pill:' + chatId, '1');
      sessionStorage.setItem('NOVA:pending-studio-bind', JSON.stringify({
        files: {},
        projectId: null,
        name: 'Nightglass',
        diskRoot,
        previewUrl: null,
      }));
    } catch (_) {}
    if (window.arkDesktop?.workspaceOpenRoot) {
      try {
        await window.arkDesktop.workspaceOpenRoot({
          projectId: 'proj-nightglass',
          sourceDir: diskRoot,
          catalogOnly: false,
        });
      } catch (_) {}
    }
    location.hash = '#/chat/' + chatId;
    await new Promise((r) => setTimeout(r, 1200));
    window.dispatchEvent(new CustomEvent('NOVA:bind-studio-disk', {
      detail: { diskPath: diskRoot, name: 'Nightglass' },
    }));
    await new Promise((r) => setTimeout(r, 1200));
    const pill = Array.from(document.querySelectorAll('button,span,div'))
      .some((n) => /^\\s*Nightglass\\s*$/i.test((n.textContent || '').trim()));
    const hasDisk = Boolean(window.__NOVA_DISK_PROBE__);
    return {
      ok: true,
      diskRoot,
      hash: location.hash,
      pill,
      studioKeys: Object.keys(localStorage).filter((k) => /chat-studio|last-disk|pending-studio/i.test(k)),
    };
  })()`);
}

async function sendChat(ev, text) {
  await ev(`(() => { if (!/#\\/?chat/i.test(location.hash || '')) location.hash = '#/chat'; return location.hash; })()`);
  await sleep(800);
  const payload = JSON.stringify(String(text || ''));
  return ev(`(async () => {
    const text = ${payload};
    const pick = () =>
      document.querySelector('textarea[placeholder*="Ask" i]')
      || document.querySelector('textarea[placeholder*="Message" i]')
      || document.querySelector('textarea[placeholder*="Press Enter" i]')
      || document.querySelector('textarea[placeholder*="chat" i]')
      || document.querySelector('form textarea')
      || document.querySelector('textarea');
    let ta = pick();
    for (let i = 0; i < 40 && !ta; i++) {
      await new Promise((r) => setTimeout(r, 250));
      ta = pick();
    }
    if (!ta) return { ok: false, error: 'no textarea', hash: location.hash, url: location.href };
    ta.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    const tracker = ta._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') tracker.setValue('');
    if (setter) setter.call(ta, text);
    else ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const reactKey = Object.keys(ta).find((k) => k.startsWith('__reactProps$'));
    const reactProps = reactKey ? ta[reactKey] : null;
    if (reactProps && typeof reactProps.onChange === 'function') {
      reactProps.onChange({ target: ta, currentTarget: ta, bubbles: true, preventDefault() {}, stopPropagation() {} });
    }
    await new Promise((r) => setTimeout(r, 250));
    if (reactProps && typeof reactProps.onKeyDown === 'function') {
      reactProps.onKeyDown({
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: false,
        preventDefault() {}, stopPropagation() {}, nativeEvent: { isComposing: false },
      });
      return { ok: true, via: 'react-enter' };
    }
    const btn =
      document.querySelector('button[aria-label*="Send" i]')
      || Array.from(document.querySelectorAll('button')).find((b) => /^\\s*send\\s*$/i.test((b.textContent || '').trim()));
    if (btn && !btn.disabled) { btn.click(); return { ok: true, via: 'button' }; }
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return { ok: true, via: 'enter' };
  })()`);
}

async function waitTurnDone(ev) {
  const start = Date.now();
  let idleHits = 0;
  let last = '';
  await sleep(2500);
  while (Date.now() - start < 420_000) {
    const st = await ev(`(() => {
      const stopVisible = Array.from(document.querySelectorAll('button')).some((b) => {
        const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase();
        return /\\bstop\\b|cancel generation|stop generating/.test(t) && !/stopwatch|desktop/i.test(t);
      });
      const dots = !!document.querySelector('.ark-status-dot');
      const queueBanner = Array.from(document.querySelectorAll('div,p,span'))
        .some((n) => /message queued|messages queued/i.test(n.textContent || ''));
      const statusLine = (document.querySelector('[aria-live="polite"]')?.textContent || '').trim().slice(0, 160);
      const generatingHint = /Building with|Writing |Updating |Installing|Importing|Equipped|Multi-model|Reading your brief|Creating folder|Finishing setup|Polishing|Repairing|Opening localhost|Applying your change|Patching App|Thinking|No template|Could not save|Updating project/i.test(statusLine);
      const lastAssistant = (() => {
        const nodes = Array.from(document.querySelectorAll('div,p,span')).map(n => (n.textContent||'').trim()).filter(Boolean);
        const hit = [...nodes].reverse().find(t => /No template was substituted|Could not save|I applied|Files Changed|Responded in/i.test(t));
        return (hit || '').slice(0, 120);
      })();
      return { generating: stopVisible || dots || generatingHint || queueBanner, statusLine, lastAssistant };
    })()`);
    const snap = `${st?.generating}|${st?.statusLine}`;
    if (snap !== last) {
      last = snap;
      log(st?.generating ? 'working…' : 'settling…', (st?.statusLine || st?.lastAssistant || '').replace(/\\s+/g, ' ').slice(0, 120));
    }
    if (!st?.generating) {
      idleHits += 1;
      if (idleHits >= 5) return st;
    } else idleHits = 0;
    await sleep(2000);
  }
  throw new Error('timeout');
}

function snapshot() {
  const out = {};
  for (const rel of ['src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css']) {
    const p = path.join(ROOT, rel);
    if (fs.existsSync(p)) out[rel] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

async function main() {
  const before = snapshot();
  log('BEFORE App.jsx', (before['src/App.jsx'] || before['src/App.tsx'] || '').replace(/\\s+/g, ' ').slice(0, 200));
  log('prompt', prompt);
  let { ws, ev, send } = await connectCdp();
  // Always pick up latest dist after Nova rebuilds.
  try {
    await send('Page.reload', { ignoreCache: true });
    log('hard-reloaded UI');
  } catch { /* older CDP */ }
  try { ws.close(); } catch { /* */ }
  await sleep(2800);
  ({ ws, ev, send } = await connectCdp());
  const bound = await bindNightglass(ev);
  log('bound', bound);
  await sleep(600);
  const sent = await sendChat(ev, prompt);
  log('sent', sent);
  if (!sent?.ok) throw new Error(JSON.stringify(sent));
  const st = await waitTurnDone(ev);
  await sleep(1500);
  const after = snapshot();
  const app = after['src/App.jsx'] || after['src/App.tsx'] || '';
  const css = `${after['src/App.css'] || ''}\n${after['src/index.css'] || ''}`;
  log('AFTER App.jsx', app.replace(/\\s+/g, ' ').slice(0, 400));
  log('status hint', st?.lastAssistant || st?.statusLine || '');
  const changed = JSON.stringify(before) !== JSON.stringify(after);
  log(changed ? 'DISK CHANGED' : 'DISK UNCHANGED');
  try { ws.close(); } catch { /* */ }
  console.log(JSON.stringify({
    changed,
    hasNightglassWord: /Nightglass/i.test(app),
    hasAnyTextNode: /<(?:h1|h2|p|span|button)[^>]*>[^<]{1,80}</i.test(app),
    stillBrown: /#8B4513|brown/i.test(css),
    appLen: app.length,
  }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
