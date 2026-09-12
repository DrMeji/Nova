/**
 * Fresh brown blank-screen smoke: wipe Nightglass, clear chat, create brown full-viewport.
 * Usage: ARK_CDP_PORT=9335 node scripts/live-brown-blank.mjs
 */
import http from 'http';
import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import os from 'os';

const port = process.env.ARK_CDP_PORT || '9335';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[brown ${new Date().toISOString().slice(11, 19)}]`, ...a);

const NIGHTGLASS = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'Nightglass');

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
  if (!targets?.length) throw new Error(`No CDP targets on ${port}`);
  const page = targets.find((t) => t.type === 'page' && /NOVA/i.test(t.title || '') && !/localhost|127\.0\.0\.1/i.test(t.url || ''))
    || targets.find((t) => t.type === 'page' && !/localhost|127\.0\.0\.1/i.test(t.url || '') && t.webSocketDebuggerUrl)
    || targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    || targets.find((t) => t.webSocketDebuggerUrl);
  if (!page?.webSocketDebuggerUrl) throw new Error('No websocket target');
  log('cdp target', page.title, (page.url || '').slice(0, 90));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.once('open', res);
    ws.once('error', rej);
  });
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
    if (result?.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'evaluate failed');
    }
    return result?.result?.value;
  };
  return { ws, ev, send };
}

function wipeNightglass() {
  if (!fs.existsSync(NIGHTGLASS)) {
    log('Nightglass folder already gone');
    return;
  }
  fs.rmSync(NIGHTGLASS, { recursive: true, force: true });
  log('deleted', NIGHTGLASS);
}

async function resetChat(ev) {
  await ev(`(() => {
    const wipePrefix = (store) => {
      const keys = [];
      for (let i = 0; i < store.length; i++) keys.push(store.key(i));
      for (const k of keys) {
        if (!k) continue;
        if (
          k === 'NOVA:recent-chats'
          || k === 'NOVA:recent-projects'
          || k === 'NOVA:recent-creations'
          || k.startsWith('NOVA:chat-')
          || k.startsWith('NOVA:thread-')
          || k.startsWith('NOVA:pending-')
          || k.startsWith('NOVA:activity:')
          || k.startsWith('NOVA:last-disk:')
          || k.startsWith('NOVA:media-feedback:')
          || k.startsWith('ark:chat-')
        ) store.removeItem(k);
      }
    };
    wipePrefix(localStorage);
    wipePrefix(sessionStorage);
    localStorage.setItem('NOVA:recent-chats', '[]');
    location.hash = '#/chat';
    location.reload();
    return true;
  })()`);
  // Page reloads — reconnect is caller's job; wait for load here via sleep + ready poll.
  await sleep(3500);
}

async function sendChat(ev, text) {
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
    if (!ta) return { ok: false, error: 'no textarea' };
    ta.focus();
    // React controlled composer: must update React state, not only the DOM value.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    const tracker = ta._valueTracker;
    if (tracker && typeof tracker.setValue === 'function') tracker.setValue('');
    if (setter) setter.call(ta, text);
    else ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new Event('change', { bubbles: true }));
    const reactKey = Object.keys(ta).find((k) => k.startsWith('__reactProps$'));
    const reactProps = reactKey ? ta[reactKey] : null;
    if (reactProps && typeof reactProps.onChange === 'function') {
      reactProps.onChange({ target: ta, currentTarget: ta, bubbles: true, preventDefault() {}, stopPropagation() {} });
    }
    await new Promise((r) => setTimeout(r, 300));
    if ((ta.value || '').trim() !== text.trim()) {
      return { ok: false, error: 'composer_value_mismatch', got: (ta.value || '').slice(0, 80) };
    }
    if (reactProps && typeof reactProps.onKeyDown === 'function') {
      reactProps.onKeyDown({
        key: 'Enter', code: 'Enter', keyCode: 13, which: 13, shiftKey: false,
        preventDefault() {}, stopPropagation() {}, nativeEvent: { isComposing: false },
      });
      return { ok: true, via: 'react-enter' };
    }
    const btn =
      document.querySelector('button[aria-label*="Send" i]')
      || document.querySelector('button[title*="Send" i]')
      || Array.from(document.querySelectorAll('button')).find((b) => /^\\s*send\\s*$/i.test((b.textContent || '').trim()));
    if (btn && !btn.disabled) {
      btn.click();
      return { ok: true, via: 'button' };
    }
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    return { ok: true, via: 'enter' };
  })()`);
}

async function waitTurnDone(ev, { timeoutMs = 420_000, label = '' } = {}) {
  const start = Date.now();
  let last = '';
  let idleHits = 0;
  let sawWork = false;
  await sleep(2500);
  while (Date.now() - start < timeoutMs) {
    const st = await ev(`(() => {
      const stopVisible = Array.from(document.querySelectorAll('button')).some((b) => {
        const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).toLowerCase();
        return /\\bstop\\b|cancel generation|stop generating/.test(t)
          && !/stopwatch|desktop/i.test(t);
      });
      const dots = !!document.querySelector('.ark-status-dot');
      const queueBanner = Array.from(document.querySelectorAll('div,p,span'))
        .some((n) => /message queued|messages queued/i.test(n.textContent || ''));
      const statusLine = (() => {
        const live = document.querySelector('[aria-live="polite"]');
        return (live?.textContent || '').trim().slice(0, 160);
      })();
      const generatingHint = /Building with|Writing |Updating |Installing|Importing|Equipped|Multi-model|Reading your brief|Creating folder|Finishing setup|Polishing|Repairing|Opening localhost|Applying your change|Patching App|Thinking/i.test(statusLine);
      return {
        generating: stopVisible || dots || generatingHint || queueBanner,
        stopVisible,
        dots,
        queueBanner,
        statusLine,
      };
    })()`);
    const snap = `${st?.generating}|${st?.statusLine || ''}`.slice(0, 80);
    if (snap !== last) {
      last = snap;
      log(label, st?.generating ? 'working…' : 'settling…', (st?.statusLine || '').replace(/\\s+/g, ' ').slice(0, 100));
    }
    if (st?.generating) sawWork = true;
    if (!st?.generating) {
      idleHits += 1;
      // Do not treat "never started" as done.
      if (sawWork && idleHits >= 5) return true;
      if (!sawWork && idleHits >= 15) {
        throw new Error(`turn never started generating: ${label}`);
      }
    } else {
      idleHits = 0;
    }
    await sleep(2000);
  }
  throw new Error(`timeout waiting for turn: ${label}`);
}

async function openPreview(ev) {
  return ev(`(() => {
    const btn = Array.from(document.querySelectorAll('button'))
      .find((b) => /preview/i.test((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')));
    if (btn) { btn.click(); return true; }
    return false;
  })()`);
}

function readProjectCss() {
  const candidates = [
    path.join(NIGHTGLASS, 'src', 'App.css'),
    path.join(NIGHTGLASS, 'src', 'index.css'),
    path.join(NIGHTGLASS, 'src', 'App.jsx'),
    path.join(NIGHTGLASS, 'src', 'App.tsx'),
  ];
  const out = {};
  for (const p of candidates) {
    if (fs.existsSync(p)) out[path.basename(p)] = fs.readFileSync(p, 'utf8');
  }
  return out;
}

function looksBrown(files) {
  const blob = Object.values(files).join('\n');
  return /#(?:8[Bb]4513|a52a2a|6[Bb]3[Ee]2[Ee]|5[Dd]4037|795548|964[Bb]00|brown)|brown|chocolate|sienna|peru/i.test(blob)
    || /background[^;]{0,40}#(?:[89a-fA-F][0-9a-fA-F]{5})/i.test(blob);
}

async function main() {
  log('wiping Nightglass on disk');
  wipeNightglass();

  log('connecting CDP', port);
  let { ws, ev } = await connectCdp();
  log('clearing chat + hard reload');
  await resetChat(ev);
  try { ws.close(); } catch { /* ignore */ }
  await sleep(1500);
  ({ ws, ev } = await connectCdp());
  for (let i = 0; i < 30; i++) {
    const ready = await ev(`!!document.querySelector('textarea[placeholder*="Ask" i], textarea')`);
    if (ready) break;
    await sleep(300);
  }
  await sleep(800);

  // New wording each restart — do not reuse prior create prompts.
  const prompt = 'Kick off a Vite+React website titled Nightglass. Fill the viewport with one flat brown field and leave everything else empty.';
  log('sending', prompt);
  const sent = await sendChat(ev, prompt);
  log('sent', sent);
  if (!sent?.ok) throw new Error(`send failed: ${JSON.stringify(sent)}`);

  // Confirm Nova actually received the ask (not a silent empty Enter).
  let landed = false;
  for (let i = 0; i < 20; i++) {
    const body = await ev(`(document.body?.innerText || '')`);
    if (/flat brown|Nightglass|Creating folder|Building with|Writing |Kick off|Painting a solid|blank shell/i.test(body || '')) {
      landed = true;
      break;
    }
    await sleep(500);
  }
  log(landed ? 'prompt visible in chat UI' : 'WARN: prompt not visible yet');

  await waitTurnDone(ev, { label: 'create' });
  await sleep(2000);
  await openPreview(ev);
  await sleep(3000);

  if (!fs.existsSync(NIGHTGLASS)) {
    log('FAIL: Nightglass folder was not created');
    const tail = await ev(`(document.body?.innerText || '').replace(/\\s+/g, ' ').slice(-900)`);
    log('ui tail', tail);
    process.exit(1);
  }
  const files = readProjectCss();
  log('files', Object.keys(files));
  for (const [k, v] of Object.entries(files)) {
    log(k, 'len', v.length, 'snippet', v.replace(/\s+/g, ' ').slice(0, 180));
  }
  const brown = looksBrown(files);
  log(brown ? 'PASS: project CSS/JS looks brown' : 'FAIL: project does not look brown on disk');
  try { ws.close(); } catch { /* ignore */ }
  process.exit(brown ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
