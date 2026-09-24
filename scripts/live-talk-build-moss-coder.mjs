/**
 * Live retry: pin coder GGUF, short talk → build MossMarket-2.
 * NOVA_CDP_PORT default 9333.
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.NOVA_CDP_PORT || 9333);
const OUT = path.join(__dirname, '..', '.tmp-live-moss-coder.json');
const PRODUCT = 'MossMarket';
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

const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
const page = list.find((t) => t.type === 'page');
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

await send('Page.enable');
await send('Runtime.enable');

await evalE(`(() => {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && /chat-thread|recent-chats|chat-studio|last-disk|pending-build-plan|thread-brain/i.test(k)) {
      localStorage.removeItem(k);
    }
  }
  const raw = localStorage.getItem('NOVA:local-prefs') || '{}';
  let prefs = {};
  try { prefs = JSON.parse(raw); } catch {}
  prefs.agentLoopOnCreate = true;
  prefs.agentLoopEnabled = true;
  prefs.planApproveGate = false;
  prefs.activeCoderId = 'qwen25-coder-7b';
  prefs.activeChatId = 'qwen25-coder-7b';
  prefs.defaultCodeModelId = 'qwen25-coder-7b';
  prefs.defaultModelId = 'qwen25-coder-7b';
  prefs.lastChatModelId = 'qwen25-coder-7b';
  prefs.prefsVersion = 3;
  localStorage.setItem('NOVA:local-prefs', JSON.stringify(prefs));
  return prefs.activeCoderId;
})()`);
await send('Page.reload', { ignoreCache: true });
await sleep(4500);

await evalE(`(() => {
  const btns = [...document.querySelectorAll('button, a, [role="button"]')];
  const hit = btns.find((b) => /new\\s*chat/i.test((b.textContent || '') + (b.getAttribute('aria-label') || '')));
  if (hit) hit.click();
  else location.hash = '#/chat';
  return true;
})()`);
await sleep(1500);

async function sendAsk(text, timeoutMs) {
  const before = await evalE(`(() => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
    }
    keys.sort();
    const k = keys[keys.length - 1];
    if (!k) return 0;
    try { return JSON.parse(localStorage.getItem(k) || '[]').length; } catch { return 0; }
  })()`);

  await evalE(`(() => {
    const ta = document.querySelector('textarea');
    if (!ta) return false;
    const d = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
    d.set.call(ta, ${JSON.stringify(text)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.focus();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
    return true;
  })()`);

  const t0 = Date.now();
  let lastStatus = '';
  while (Date.now() - t0 < timeoutMs) {
    await sleep(2500);
    const snap = await evalE(`(() => {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && /NOVA:chat-thread:chat:/.test(k)) keys.push(k);
      }
      keys.sort();
      const k = keys[keys.length - 1];
      let arr = [];
      try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { return null; }
      const last = arr[arr.length - 1];
      const generating = /^__generating__:/i.test(String(last?.content || ''));
      const userHit = arr.some(m => m?.role === 'user' && String(m.content || '').includes(${JSON.stringify(text.slice(0, 24))}));
      const assistants = arr.filter(m => m?.role === 'assistant' && !/^__generating__:/i.test(String(m.content || '')));
      const lastAsst = assistants[assistants.length - 1];
      const body = document.body?.innerText || '';
      const statusMatch = body.match(/(?:Build:|Fix:|Using |Creating |Wrote |Preview Ready|Nova tool|Coding)[^\\n]{0,100}/i);
      return {
        len: arr.length,
        generating,
        userHit,
        provider: lastAsst?.provider_used || lastAsst?.provider || null,
        content: lastAsst ? String(lastAsst.content || '') : '',
        status: statusMatch ? statusMatch[0] : null,
        modelPill: (document.querySelector('[aria-label="Select model"]')?.textContent || '').trim().slice(0, 50),
      };
    })()`);
    if (snap?.status && snap.status !== lastStatus) {
      lastStatus = snap.status;
      console.log('  …', lastStatus.slice(0, 110));
    }
    if (snap?.userHit && !snap.generating && String(snap.content || '').trim().length > 20 && snap.len > before) {
      return { meta: snap.provider || 'ok', text: snap.content, modelPill: snap.modelPill, lastStatus };
    }
  }
  return { meta: 'timeout', text: '', modelPill: '', lastStatus };
}

const turns = [
  {
    role: 'talk',
    text: 'i want a free phone app for our weekend farmers market — browse stalls, save-a-bag with undo, soft sage cream terracotta. no payments.',
  },
  {
    role: 'build',
    text: `build ${PRODUCT} now — phone-friendly stall browser, save-a-bag + undo, sage cream terracotta, create on disk. use the coder. no paywalls. take your time and make Live Ready.`,
  },
];

const results = [];
for (const turn of turns) {
  console.log(`\n→ [${turn.role}] ${turn.text.slice(0, 70)}…`);
  const out = await sendAsk(turn.text, turn.role === 'build' ? 1_500_000 : 240_000);
  console.log(`  ← ${out.meta} pill=${out.modelPill} len=${(out.text || '').length}`);
  console.log(`  ${(out.text || '').slice(0, 180).replace(/\n/g, ' ')}…`);
  results.push({ role: turn.role, ...out, preview: String(out.text || '').slice(0, 500) });
}

const projectsRoot = path.join(process.env.USERPROFILE || '', 'Documents', 'NOVA Projects');
const candidates = fs.existsSync(projectsRoot)
  ? fs.readdirSync(projectsRoot).filter((n) => /^MossMarket/i.test(n))
    .map((n) => path.join(projectsRoot, n))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)
  : [];
const root = candidates[0] || null;
let disk = { ok: false, root };
if (root) {
  const appPath = fs.existsSync(path.join(root, 'src', 'App.tsx'))
    ? path.join(root, 'src', 'App.tsx') : path.join(root, 'src', 'App.jsx');
  const app = fs.readFileSync(appPath, 'utf8');
  const css = fs.existsSync(path.join(root, 'src', 'App.css'))
    ? fs.readFileSync(path.join(root, 'src', 'App.css'), 'utf8') : '';
  disk = {
    ok: /MossMarket/i.test(app) && /useState/.test(app) && app.length > 2000 && css.length > 800,
    root,
    appLen: app.length,
    cssLen: css.length,
    interactive: /useState/.test(app),
    brand: /MossMarket/i.test(app),
    snippet: app.slice(0, 300),
  };
}

const report = {
  at: new Date().toISOString(),
  ok: results.every((r) => r.meta !== 'timeout') && disk.ok,
  results: results.map((r) => ({
    role: r.role, meta: r.meta, modelPill: r.modelPill, len: (r.text || '').length, lastStatus: r.lastStatus, preview: r.preview,
  })),
  disk,
};
fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
console.log('\n==== SUMMARY ====');
console.log(JSON.stringify({ ok: report.ok, disk }, null, 2));
ws.close();
process.exit(report.ok ? 0 : 2);
