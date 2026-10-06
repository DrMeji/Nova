/**
 * Live multi-model code stress — generation via llama-server HTTP (stable),
 * CDP only for model switch + Code writes so you can watch without crashing Nova.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'model-code-stress');
const OUT = path.join(ROOT, 'scripts', '_model-code-stress-out.txt');
const RESULTS = path.join(ROOT, 'scripts', '_model-code-stress-results.json');
const TARGET_LINES = Number(process.env.NOVA_STRESS_LINES || 180);
const MARKER = '// STRESS_END_MARKER_OK';
const TIMEOUT_BY_ID = {
  'uigen-fx-4b': 10 * 60_000,
  'qwen25-7b': 12 * 60_000,
  'qwen2-vl-7b': 12 * 60_000,
};
const DEFAULT_TIMEOUT = 14 * 60_000;
const SERVER_PORTS = [8788, 8789, 8790];

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, line + '\n'); } catch { /* ignore */ }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fetchJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('fetch timeout'));
    });
  });
}

function craftPrompt() {
  return [
    'You are Nova craft. Output ONLY file blocks. No chat. No plan. No questions.',
    'Start with this exact line:',
    '@@@FILE src/App.tsx',
    `Then write a COMPLETE React TypeScript App.tsx that is at least ${TARGET_LINES} lines.`,
    'Include: imports, ThemeToggle, Header, Hero, FeatureGrid (6 feature cards with titles+body),',
    'Testimonials (3 quotes), Pricing (3 tiers), Footer, and a default export App composition.',
    'Use real JSX — not placeholders like TODO or lorem only. Give each section unique classNames.',
    'End the file with this exact comment on its own last line:',
    MARKER,
    'Then optionally:',
    '@@@FILE src/App.css',
    'with matching styles (at least 40 lines).',
    'Do not truncate. Do not stop mid-function. Finish the App.tsx completely before CSS.',
  ].join('\n');
}

function wrapChatPrompt(modelId, body) {
  // ChatML (Qwen / UIGEN)
  return (
    `<|im_start|>system\nYou are NOVA, a local coding assistant. Output complete file blocks only.<|im_end|>\n`
    + `<|im_start|>user\n${body}<|im_end|>\n`
    + `<|im_start|>assistant\n`
  );
}

function ensureProject() {
  fs.mkdirSync(path.join(PROJECT, 'src'), { recursive: true });
  fs.mkdirSync(path.join(PROJECT, 'stress-results'), { recursive: true });
  if (!fs.existsSync(path.join(PROJECT, 'package.json'))) {
    fs.writeFileSync(path.join(PROJECT, 'package.json'), JSON.stringify({
      name: 'model-code-stress', private: true, version: '0.0.0', type: 'module',
    }, null, 2));
  }
}

function analyze(reply, modelId) {
  const text = String(reply || '');
  const hasFile = /@@@FILE\s+src\/App\.tsx/i.test(text);
  const hasMarker = text.includes(MARKER);
  const hasExport = /export\s+default\s+function\s+App|export\s+default\s+App/i.test(text);
  let appBody = '';
  const m = text.match(/@@@FILE\s+src\/App\.tsx\s*\n([\s\S]*?)(?=\n@@@FILE\s|\n@@@END\b|$)/i);
  if (m) appBody = m[1];
  else if (hasFile) appBody = text;
  const appLines = appBody ? appBody.split(/\r?\n/).length : 0;
  const pass = hasFile && hasMarker && hasExport && appLines >= Math.floor(TARGET_LINES * 0.7);
  return {
    modelId,
    pass,
    chars: text.length,
    lines: text ? text.split(/\r?\n/).length : 0,
    appLines,
    hasFile,
    hasMarker,
    hasExport,
    previewHead: text.slice(0, 160).replace(/\n/g, '\\n'),
    previewTail: text.slice(-160).replace(/\n/g, '\\n'),
  };
}

async function waitForCdp(maxMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = (list || []).find((t) => t.type === 'page' && /NOVA/i.test(t.title || ''))
        || (list || []).find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page;
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error('CDP not up');
}

async function connect() {
  const page = await waitForCdp();
  log('cdp', page.title, page.url);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(String(raw)); } catch { return; }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });
  const evaluate = async (expression, awaitPromise = true, timeoutMs = 30_000) => {
    const work = send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    }).then((r) => {
      if (r?.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
      return r?.result?.value;
    });
    return Promise.race([
      work,
      new Promise((_, rej) => setTimeout(() => rej(new Error('cdp-eval-timeout')), timeoutMs)),
    ]);
  };
  return { ws, evaluate };
}

async function findLiveServerPort() {
  for (const p of SERVER_PORTS) {
    try {
      const res = await fetch(`http://127.0.0.1:${p}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return p;
    } catch { /* try next */ }
    try {
      // some builds expose props
      const res = await fetch(`http://127.0.0.1:${p}/props`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) return p;
    } catch { /* try next */ }
  }
  return null;
}

async function waitForServer(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const p = await findLiveServerPort();
    if (p) return p;
    await sleep(1500);
  }
  return null;
}

async function streamCompletion(serverPort, modelId, prompt, timeoutMs, onProgress) {
  const wrapped = wrapChatPrompt(modelId, prompt);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let out = '';
  let stopped = false;
  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: wrapped,
        n_predict: 16384,
        temperature: 0.4,
        stream: true,
        cache_prompt: true,
        stop: ['<|im_end|>'],
      }),
      signal: ac.signal,
    });
    if (!res.ok || !res.body) throw new Error(`llama-server ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let lastReport = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split(/\n/);
      buf = lines.pop() || '';
      for (const line of lines) {
        const raw = line.replace(/^data:\s*/, '').trim();
        if (!raw || raw === '[DONE]') continue;
        try {
          const json = JSON.parse(raw);
          const piece = String(json.content || json.delta || '');
          if (piece) out += piece;
          if (json.stop) stopped = true;
        } catch { /* ignore */ }
      }
      const now = Date.now();
      if (now - lastReport > 5000) {
        lastReport = now;
        onProgress?.(out.length);
      }
    }
    return { ok: Boolean(out.trim()), text: out, stopped, error: null };
  } catch (e) {
    const msg = e?.name === 'AbortError' ? 'wall-timeout' : String(e?.message || e);
    return { ok: false, text: out, stopped, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

try { fs.writeFileSync(OUT, `model-code-stress-v2 ${new Date().toISOString()}\n`); } catch { /* ignore */ }
ensureProject();

log('waiting for Nova CDP…');
let { ws, evaluate } = await connect();

await evaluate(`(() => {
  const els = [...document.querySelectorAll('button,[role=button],a')];
  const chat = els.find(el => (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
  if (chat) chat.click();
  return true;
})()`).catch(() => null);
await sleep(800);

const hooks = await evaluate(`({
  write: typeof window.__novaStressWrite,
  openCode: typeof window.__novaStressOpenCode,
  setModel: typeof window.novaDesktop?.engineSetModel,
  status: typeof window.novaDesktop?.engineStatus,
  cancel: typeof window.novaDesktop?.engineGenerateCancel,
})`);
log('hooks', hooks);

if (hooks?.openCode === 'function') {
  await evaluate(`window.__novaStressOpenCode()`).catch(() => null);
  log('Code overlay opened — watch Nova');
}

const status = await evaluate(`(async () => {
  const st = await window.novaDesktop.engineStatus();
  const skip = /^(NOVA-core|NOVA-image-core|NOVA-video-core)$/i;
  const mmproj = /mmproj/i;
  const ready = (st.models || []).filter(m =>
    m.status === 'ready' && !skip.test(m.id) && !mmproj.test(m.id) && !mmproj.test(m.name || '') && Number(m.sizeGb || 0) > 0
  );
  return { active: st.activeModelId, models: ready.map(m => ({ id: m.id, name: m.name, sizeGb: m.sizeGb })) };
})()`, true, 20_000);

const models = [...(status.models || [])].sort((a, b) => (a.sizeGb || 0) - (b.sizeGb || 0));
log('ready LLMs', models.length, models.map((m) => m.id));
if (!models.length) {
  log('FAIL — no models');
  ws.close();
  process.exit(2);
}

const prompt = craftPrompt();
const results = [];

async function reconnectIfNeeded() {
  try {
    await evaluate(`1+1`, false, 3000);
    return;
  } catch {
    log('CDP lost — reconnecting…');
    try { ws.close(); } catch { /* ignore */ }
    ({ ws, evaluate } = await connect());
    if (hooks?.openCode === 'function') {
      await evaluate(`window.__novaStressOpenCode()`).catch(() => null);
    }
  }
}

async function writeResult(rel, content) {
  await reconnectIfNeeded();
  // Always write disk for evidence
  const disk = path.join(PROJECT, ...rel.split('/'));
  fs.mkdirSync(path.dirname(disk), { recursive: true });
  fs.writeFileSync(disk, content);
  if (hooks?.write === 'function') {
    try {
      const r = await evaluate(`window.__novaStressWrite(${JSON.stringify({
        path: rel,
        content: content.slice(0, 250000),
        projectId: 'model-code-stress',
        projectName: 'model-code-stress',
        diskRoot: PROJECT.replace(/\\/g, '/'),
      })})`, true, 25_000);
      return Boolean(r?.ok);
    } catch (e) {
      log('code write via CDP failed, disk ok', String(e.message || e));
      return true;
    }
  }
  return true;
}

for (let i = 0; i < models.length; i++) {
  const model = models[i];
  const timeoutMs = TIMEOUT_BY_ID[model.id] || DEFAULT_TIMEOUT;
  log(`\n========== [${i + 1}/${models.length}] ${model.id} (${model.name}, ${model.sizeGb}GB) timeout=${Math.round(timeoutMs / 1000)}s ==========`);

  await reconnectIfNeeded();
  try {
    await evaluate(`(() => {
      try {
        document.title = 'NOVA · model-stress ${i + 1}/${models.length} · ${model.id}';
        window.dispatchEvent(new CustomEvent('NOVA:sidebar-toast', { detail: {
          message: 'Model stress ${i + 1}/${models.length}: ${model.name}',
          tone: 'info',
        }}));
      } catch {}
      return true;
    })()`, false, 5000);
  } catch { /* ignore */ }

  if (hooks?.cancel === 'function') {
    try { await evaluate(`window.novaDesktop.engineGenerateCancel({})`, true, 8000); } catch { /* ignore */ }
    await sleep(500);
  }

  log('switching model (loads GGUF into llama-server)…');
  const switched = await evaluate(`(async () => {
    try {
      const st = await window.novaDesktop.engineSetModel(${JSON.stringify(model.id)});
      return { ok: true, active: st?.activeModelId || null };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  })()`, true, 180_000);
  log('switched', switched);

  // Warm: tiny generate via engine so server binds this GGUF
  log('warming llama-server…');
  try {
    await evaluate(`(async () => {
      try {
        await window.novaDesktop.engineGenerate('Reply with exactly: READY', ${JSON.stringify(model.id)}, 'chat', { nPredict: 16, temperature: 0 });
      } catch (e) { return String(e?.message || e); }
      return 'warmed';
    })()`, true, 180_000);
  } catch (e) {
    log('warm note', String(e.message || e));
  }

  const serverPort = await waitForServer(90_000);
  if (!serverPort) {
    log('FAIL — llama-server not reachable after model switch');
    results.push({
      modelId: model.id, modelName: model.name, sizeGb: model.sizeGb,
      pass: false, error: 'no-llama-server', appLines: 0, chars: 0,
      hasMarker: false, hasExport: false, elapsedMs: 0,
    });
    continue;
  }
  log('llama-server', serverPort);

  const started = Date.now();
  log('generating via /completion … watch Code for mid-writes');
  // Mid-write empty stub so Code shows the file
  await writeResult(`stress-results/${model.id}-App.tsx`, `// generating with ${model.id}…\n`);

  let lastMidWrite = 0;
  const gen = await streamCompletion(serverPort, model.id, prompt, timeoutMs, async (chars) => {
    log('progress', { model: model.id, chars, sec: Math.round((Date.now() - started) / 1000) });
    // periodic mid-write every ~20s for watchability
    if (Date.now() - lastMidWrite > 20_000) {
      lastMidWrite = Date.now();
      // Can't easily get partial text here without sharing — skip; final write is enough
    }
  });

  const elapsed = Date.now() - started;
  const analysis = analyze(gen.text || '', model.id);
  analysis.elapsedMs = elapsed;
  analysis.error = gen.error || null;
  analysis.modelName = model.name;
  analysis.sizeGb = model.sizeGb;
  analysis.via = 'llama-server-http';
  if (!gen.ok && !analysis.hasFile) analysis.pass = false;
  if (gen.error === 'wall-timeout') analysis.pass = false;

  const rel = `stress-results/${model.id}-App.tsx`;
  analysis.wroteCode = await writeResult(rel, gen.text || `// FAIL ${model.id}\n// ${analysis.error || 'empty'}\n`);

  results.push(analysis);
  log(analysis.pass ? 'PASS' : 'FAIL', JSON.stringify({
    modelId: analysis.modelId,
    pass: analysis.pass,
    elapsedSec: Math.round(elapsed / 1000),
    appLines: analysis.appLines,
    chars: analysis.chars,
    hasMarker: analysis.hasMarker,
    hasExport: analysis.hasExport,
    error: analysis.error,
  }));
  log('tail', analysis.previewTail);

  try {
    await reconnectIfNeeded();
    await evaluate(`(() => {
      try {
        window.dispatchEvent(new CustomEvent('NOVA:sidebar-toast', { detail: {
          message: '${analysis.pass ? 'PASS' : 'FAIL'} ${model.id} · ${analysis.appLines} lines · ${Math.round(elapsed / 1000)}s',
          tone: '${analysis.pass ? 'ok' : 'error'}',
        }}));
      } catch {}
      return true;
    })()`, false, 5000);
  } catch { /* ignore */ }

  await sleep(1000);
}

const summary = {
  at: new Date().toISOString(),
  targetLines: TARGET_LINES,
  total: results.length,
  passed: results.filter((r) => r.pass).map((r) => r.modelId),
  failed: results.filter((r) => !r.pass).map((r) => r.modelId),
  results: results.map((r) => ({
    modelId: r.modelId,
    name: r.modelName,
    pass: r.pass,
    appLines: r.appLines,
    chars: r.chars,
    hasMarker: r.hasMarker,
    hasExport: r.hasExport,
    elapsedSec: Math.round((r.elapsedMs || 0) / 1000),
    error: r.error || null,
  })),
};

fs.writeFileSync(RESULTS, JSON.stringify(summary, null, 2));
log('\n========== SUMMARY ==========');
log(JSON.stringify(summary, null, 2));

try {
  await reconnectIfNeeded();
  await evaluate(`(() => {
    try {
      document.title = 'NOVA · model-stress DONE · ${summary.passed.length}/${summary.total}';
      window.dispatchEvent(new CustomEvent('NOVA:sidebar-toast', { detail: {
        message: 'Model stress done: ${summary.passed.length}/${summary.total} passed. Failed: ${summary.failed.join(', ') || 'none'}',
        tone: 'info',
      }}));
    } catch {}
    return true;
  })()`, false, 5000);
} catch { /* ignore */ }

try { ws.close(); } catch { /* ignore */ }
process.exit(summary.failed.length ? 1 : 0);
