/**
 * Single-turn live CDP helper. Env: NOVA_CDP_PORT, NOVA_ASK, NOVA_NEW_CHAT=1
 * Prints JSON: { meta, text, flags, modelPill }
 */
import http from 'http';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9333);
const ASK = String(process.env.NOVA_ASK || '').trim();
const NEW_CHAT = process.env.NOVA_NEW_CHAT !== '0';
const TIMEOUT = Number(process.env.NOVA_TIMEOUT_MS || 240000);
if (!ASK) {
  console.error('NOVA_ASK required');
  process.exit(1);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Prefer a unique tail so reruns of similar farmers-market prompts do not match old threads.
const ASK_NEEDLE = ASK.length > 52
  ? ASK.replace(/[—–]/g, ' ').replace(/\s+/g, ' ').trim().slice(-44)
  : ASK.replace(/[—–]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 36);

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
const page = list.find((t) => t.type === 'page' && /index\.html|localhost/i.test(t.url || ''))
  || list.find((t) => t.type === 'page');
if (!page?.webSocketDebuggerUrl) throw new Error('no page');
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
    expression, returnByValue: true, awaitPromise: true, userGesture: true,
  });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result?.value;
};

await send('Runtime.enable');
await send('Page.enable');

if (NEW_CHAT) {
  // Stop any stuck create/timer first so New Chat is not blocked.
  await evalE(`(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    const stop = btns.find((b) => {
      const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).toLowerCase();
      return /^stop$|\\bstop\\b/.test(t.trim()) || /aria-label=["']stop/i.test(b.outerHTML || '');
    });
    if (stop) { stop.click(); return 'stopped'; }
    return 'idle';
  })()`);
  await sleep(800);
  await evalE(`(() => {
    const btns = [...document.querySelectorAll('button, a, [role="button"]')];
    const hit = btns.find((b) => {
      const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.getAttribute('title') || '')).toLowerCase();
      return /new\\s*chat/.test(t) || /squarepen|new conversation/.test(t);
    });
    if (hit) { hit.click(); return 'clicked'; }
    location.hash = '#/chat?new=' + Date.now();
    return 'hash';
  })()`);
  await sleep(2800);
  // Confirm we are on a fresh empty thread (no prior user asks).
  await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (ta) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(ta, '');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return location.hash;
  })()`);
}
const before = await evalE(`(() => {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
  }
  keys.sort();
  const asstSnips = [];
  for (const k of keys) {
    try {
      const arr = JSON.parse(localStorage.getItem(k) || '[]');
      const asst = [...arr].reverse().find((m) => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
      if (asst) asstSnips.push(String(asst.content || '').slice(0, 96));
    } catch { /* ignore */ }
  }
  return { keys, asstSnips };
})()`);

const filled = await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return { ok: false, why: 'no-textarea' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (!setter) return { ok: false, why: 'no-setter' };
  setter.call(ta, ${JSON.stringify(ASK)});
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  ta.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ${JSON.stringify(ASK)} }));
  ta.focus();
  return { ok: true, valLen: String(ta.value || '').length };
})()`);
if (!filled?.ok || filled.valLen < 10) {
  console.error(JSON.stringify({ meta: 'no-composer', filled }));
  process.exit(4);
}

// Clear New Chat ignoreEnterUntil window, then send.
await sleep(900);
await evalE(`(() => {
  const ta = document.querySelector('textarea');
  if (!ta) return false;
  ta.focus();
  const opts = { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true, cancelable: true };
  ta.dispatchEvent(new KeyboardEvent('keydown', opts));
  ta.dispatchEvent(new KeyboardEvent('keypress', opts));
  ta.dispatchEvent(new KeyboardEvent('keyup', opts));
  return true;
})()`);

const beforeKeys = new Set(before?.keys || []);
const beforeAsst = new Set(before?.asstSnips || []);
const t0 = Date.now();
let lastStatus = '';
let sawGenerating = false;
let lastDebug = null;

while (Date.now() - t0 < TIMEOUT) {
  await sleep(1500);
  const snap = await evalE(`(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    keys.sort();
    const needle = ${JSON.stringify(ASK_NEEDLE)};
    let best = null;
    for (let i = keys.length - 1; i >= 0; i--) {
      const k = keys[i];
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { continue; }
      const hasAsk = arr.some((m) => {
        if (m?.role !== 'user') return false;
        const c = String(m.content || '').replace(/[—–]/g, ' ').replace(/\\s+/g, ' ');
        return c.includes(needle);
      });
      if (hasAsk) { best = { k, arr }; break; }
    }
    if (!best) {
      return {
        keys,
        userHit: false,
        generating: false,
        content: '',
        provider: null,
        modelPill: '',
        taVal: String(document.querySelector('textarea')?.value || '').slice(0, 48),
      };
    }
    const arr = best.arr;
    const last = arr[arr.length - 1];
    const generating = /^__generating__:/i.test(String(last?.content || ''));
    const assistants = arr.filter((m) => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
    const lastAsst = assistants[assistants.length - 1];
    const body = document.body?.innerText || '';
    const status = (body.match(/(?:^|\\n)\\s*(?:Build:|Fix:|Using \\*\\*|Coding |Nova tool|Preview Ready|Wrote |Refining|Non-web)[^\\n]{0,80}/i) || [null])[0];
    const stopVisible = [...document.querySelectorAll('button, [role="button"]')].some((b) => {
      const t = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '')).trim().toLowerCase();
      return t === 'stop' || /^stop\\b/.test(t);
    });
    const hasFilesCard = /Files changed|Location|\\+\\d+|−\\d+|project folder/i.test(body)
      || Boolean(document.querySelector('[data-nova-files-changed], .nova-files-changed, [class*="FilesChanged"]'));
    return {
      k: best.k,
      len: arr.length,
      generating: generating || stopVisible,
      stopVisible,
      hasFilesCard,
      userHit: true,
      provider: lastAsst?.provider_used || lastAsst?.provider || null,
      content: lastAsst ? String(lastAsst.content || '') : '',
      status,
      modelPill: (document.querySelector('[aria-label="Select model"]')?.textContent || '').trim().slice(0, 60),
      taVal: String(document.querySelector('textarea')?.value || '').slice(0, 48),
    };
  })()`);

  lastDebug = {
    userHit: snap?.userHit,
    generating: snap?.generating,
    k: snap?.k,
    len: snap?.len,
    textLen: String(snap?.content || '').length,
    taVal: snap?.taVal,
  };
  if (snap?.generating) sawGenerating = true;
  if (snap?.status && snap.status !== lastStatus) {
    lastStatus = snap.status;
    console.error('STATUS', lastStatus);
  }

  const textNow = String(snap?.content || '').trim();
  const newThread = Boolean(snap?.k && !beforeKeys.has(snap.k));
  const newAsst = textNow.length > 40 && !beforeAsst.has(textNow.slice(0, 96));
  // Same chat key after New Chat is normal — don't require newThread.
  // Short coding handbacks (~150 chars) must still count as done.
  if (snap?.userHit && !snap.generating && newAsst && (sawGenerating || textNow.length > 80 || Date.now() - t0 > 45_000)) {
    if (snap?.stopVisible) {
      // Reply landed but Stop/timer still sticky — wait for UI to settle.
      continue;
    }
    const text = textNow;
    const flags = [];
    if (/Hello!\s*How can I assist you today/i.test(text)) flags.push('canned-greeting');
    if (/\byou can (?:use|implement|build|create|add)\b/i.test(text) && !/\bwe can\b/i.test(text)) flags.push('you-do-it-tone');
    if (/React Native|Flutter|Firebase|you should implement/i.test(text)
      && /phone|app|build|market|stall/i.test(ASK)) {
      flags.push('tutorial-stack-dump');
    }
    if (/@@@FILE\b|^```\s*$/m.test(text)) flags.push('code-bleed');
    if (/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]{2,}/.test(text)) flags.push('foreign-bleed');
    if (text.length < 60) flags.push('too-short');
    if (
      /losing track|farmers?\s+market|stall|tiny phone|phone page|borrow shelf/i.test(ASK)
      && text.length < 900
    ) {
      flags.push('plan-too-thin');
    }
    if (
      /losing track|farmers?\s+market|stall|tiny phone|phone page/i.test(ASK)
      && /Vite\s*\+?\s*React|proceed with creating|what directory|Choose a Technology|Develop the Backend|HTML,\s*CSS,\s*and JavaScript|simple web framework|basic prototype/i.test(text)
    ) {
      flags.push('build-aggression');
    }
    console.log(JSON.stringify({
      meta: snap.provider || 'ok',
      modelPill: snap.modelPill,
      flags,
      hasFilesCard: Boolean(snap?.hasFilesCard),
      len: text.length,
      text: text.slice(0, 2500),
    }, null, 2));
    ws.close();
    process.exit(flags.length ? 2 : 0);
  }
}

console.log(JSON.stringify({
  meta: 'timeout',
  flags: ['timeout'],
  text: '',
  modelPill: '',
  debug: lastDebug,
}, null, 2));
ws.close();
process.exit(3);
