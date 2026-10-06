/**
 * Retry stress for models that failed llama-server bind (uigen + coder-32b).
 * Uses Nova engineGenerateStream (CLI fallback OK) with page-side accumulation + Code writes.
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
const OUT = path.join(ROOT, 'scripts', '_model-code-stress-retry-out.txt');
const RESULTS_PREV = path.join(ROOT, 'scripts', '_model-code-stress-results.json');
const RESULTS = path.join(ROOT, 'scripts', '_model-code-stress-results.json');
const TARGET_LINES = 180;
const MARKER = '// STRESS_END_MARKER_OK';
const MODELS = [
  { id: 'uigen-fx-4b', name: 'UIGEN-FX 4B', sizeGb: 2.5, timeoutMs: 12 * 60_000 },
  { id: 'qwen25-7b', name: 'Qwen2.5 7B Instruct', sizeGb: 4.7, timeoutMs: 12 * 60_000 },
  { id: 'qwen2-vl-7b', name: 'Qwen2-VL 7B Instruct', sizeGb: 7.4, timeoutMs: 12 * 60_000 },
];

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, line + '\n'); } catch { /* ignore */ }
}
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

function craftPrompt() {
  return [
    'You are Nova craft. Output ONLY file blocks. No chat. No plan. No questions.',
    'Start with this exact line:',
    '@@@FILE src/App.tsx',
    `Then write a COMPLETE React TypeScript App.tsx that is at least ${TARGET_LINES} lines.`,
    'Include: imports, ThemeToggle, Header, Hero, FeatureGrid (6 feature cards with titles+body),',
    'Testimonials (3 quotes), Pricing (3 tiers), Footer, and a default export App composition.',
    'Use real JSX. End the file with this exact comment on its own last line:',
    MARKER,
    'Then optionally @@@FILE src/App.css with matching styles (40+ lines).',
    'Do not truncate. Finish App.tsx completely before CSS.',
  ].join('\n');
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
    modelId, pass, chars: text.length,
    lines: text ? text.split(/\r?\n/).length : 0,
    appLines, hasFile, hasMarker, hasExport,
    previewTail: text.slice(-160).replace(/\n/g, '\\n'),
    apiReplyChars: 0, streamedChars: text.length, apiTailOnly: false,
  };
}

async function connect() {
  const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
  const page = (list || []).find((t) => t.type === 'page') || null;
  if (!page?.webSocketDebuggerUrl) throw new Error('no cdp');
  log('cdp', page.title);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let id = 0;
  const pending = new Map();
  ws.on('message', (raw) => {
    let msg; try { msg = JSON.parse(String(raw)); } catch { return; }
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
  const evaluate = async (expression, awaitPromise = true, timeoutMs = 45_000) => {
    const work = send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise, userGesture: true,
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

try { fs.writeFileSync(OUT, `retry ${new Date().toISOString()}\n`); } catch { /* ignore */ }
fs.mkdirSync(path.join(PROJECT, 'stress-results'), { recursive: true });

const { ws, evaluate } = await connect();
await evaluate(`window.__novaStressOpenCode && window.__novaStressOpenCode()`).catch(() => null);

const prompt = craftPrompt();
const retryResults = [];

for (const model of MODELS) {
  log(`\n========== RETRY ${model.id} timeout=${Math.round(model.timeoutMs / 1000)}s ==========`);
  try {
    await evaluate(`window.novaDesktop.engineGenerateCancel({})`, true, 10_000);
  } catch { /* ignore */ }
  await sleep(800);

  log('setModel…');
  const sw = await evaluate(`(async () => {
    try {
      const st = await window.novaDesktop.engineSetModel(${JSON.stringify(model.id)});
      return { ok: true, active: st?.activeModelId };
    } catch (e) { return { ok: false, error: String(e?.message || e) }; }
  })()`, true, 120_000);
  log('switched', sw);
  await sleep(2000);

  // Start gen on page; checkpoint to diskRoot every 15s from inside the page
  const diskRoot = PROJECT.replace(/\\/g, '/');
  const rel = `stress-results/${model.id}-App.tsx`;
  await evaluate(`(() => {
    const modelId = ${JSON.stringify(model.id)};
    const prompt = ${JSON.stringify(prompt)};
    const rel = ${JSON.stringify(rel)};
    const diskRoot = ${JSON.stringify(diskRoot)};
    window.__modelStress = {
      modelId, done: false, ok: false, error: null, cancelled: false,
      chunkCount: 0, streamedChars: 0, apiReplyChars: 0, full: '',
      apiTailOnly: false, startedAt: Date.now(),
    };
    const state = window.__modelStress;
    let streamed = '';
    let lastCheckpoint = 0;
    const checkpoint = () => {
      const now = Date.now();
      if (now - lastCheckpoint < 15000 && !state.done) return;
      lastCheckpoint = now;
      const content = streamed || state.full || ('// generating ' + modelId + '…\\n');
      try {
        window.__novaStressWrite?.({
          path: rel, content, projectId: 'model-code-stress',
          projectName: 'model-code-stress', diskRoot,
        });
      } catch {}
      try { document.title = 'NOVA · ' + modelId + ' · ' + streamed.length + 'c'; } catch {}
    };
    const stop = window.novaDesktop.onEngineChunk?.((payload) => {
      const t = String(payload?.text || '');
      if (!t) return;
      state.chunkCount += 1;
      if (streamed.length === 0 && t.length >= 80) streamed = t;
      else if (t.length > streamed.length + 40 && t.length >= 80) streamed = t;
      else streamed += t;
      state.streamedChars = streamed.length;
      state.full = streamed;
      checkpoint();
    });
    (async () => {
      let result = null;
      try {
        result = await window.novaDesktop.engineGenerateStream(prompt, modelId, 'coding', {
          nPredict: 16384, temperature: 0.4,
        });
      } catch (e) {
        state.error = String(e?.message || e);
      } finally {
        try { stop?.(); } catch {}
      }
      const replyFromApi = String(result?.reply || '');
      const full = streamed.length >= replyFromApi.length ? streamed : (replyFromApi || streamed);
      state.apiReplyChars = replyFromApi.length;
      state.streamedChars = streamed.length;
      state.full = full;
      state.apiTailOnly = replyFromApi.length > 0 && streamed.length > replyFromApi.length + 500;
      state.cancelled = Boolean(result?.cancelled);
      state.ok = Boolean(full.trim());
      state.done = true;
      checkpoint();
    })();
    return 'started';
  })()`, false, 10_000);

  log('generate started — polling (watch Code)…');
  const started = Date.now();
  let snap = null;
  while (Date.now() - started < model.timeoutMs) {
    await sleep(3000);
    try {
      snap = await evaluate(`(() => {
        const s = window.__modelStress || {};
        return {
          done: Boolean(s.done), ok: Boolean(s.ok), error: s.error || null,
          chunkCount: s.chunkCount || 0, streamedChars: s.streamedChars || 0,
          apiReplyChars: s.apiReplyChars || 0, apiTailOnly: Boolean(s.apiTailOnly),
          elapsedMs: Date.now() - (s.startedAt || Date.now()),
        };
      })()`, true, 15_000);
    } catch (e) {
      log('poll err', String(e.message || e));
      continue;
    }
    log('progress', {
      chars: snap?.streamedChars || 0,
      chunks: snap?.chunkCount || 0,
      sec: Math.round((snap?.elapsedMs || 0) / 1000),
      done: snap?.done,
    });
    if (snap?.done) break;
  }

  if (!snap?.done) {
    log('WALL TIMEOUT — cancel', model.id);
    try { await evaluate(`window.novaDesktop.engineGenerateCancel({})`, true, 10_000); } catch { /* ignore */ }
    await sleep(2000);
  }

  let fullPack = null;
  try {
    fullPack = await evaluate(`(() => {
      const s = window.__modelStress || {};
      const full = String(s.full || '');
      return {
        full: full.slice(0, 350000),
        fullLen: full.length,
        apiReplyChars: s.apiReplyChars || 0,
        streamedChars: s.streamedChars || 0,
        apiTailOnly: Boolean(s.apiTailOnly),
        chunkCount: s.chunkCount || 0,
        error: s.error || (!s.done ? 'wall-timeout' : null),
        cancelled: Boolean(s.cancelled) || !s.done,
        ok: Boolean(s.ok),
      };
    })()`, true, 30_000);
  } catch (e) {
    // fallback: read disk checkpoint
    const disk = path.join(PROJECT, ...rel.split('/'));
    const raw = fs.existsSync(disk) ? fs.readFileSync(disk, 'utf8') : '';
    fullPack = { full: raw, fullLen: raw.length, error: String(e.message || e), ok: Boolean(raw.trim()), apiReplyChars: 0, streamedChars: raw.length, apiTailOnly: false, chunkCount: 0 };
  }

  // Prefer disk if longer (checkpoint may have more if CDP pull failed)
  const diskPath = path.join(PROJECT, ...rel.split('/'));
  let diskRaw = '';
  try { if (fs.existsSync(diskPath)) diskRaw = fs.readFileSync(diskPath, 'utf8'); } catch { /* ignore */ }
  const best = (fullPack?.full?.length || 0) >= diskRaw.length ? (fullPack?.full || '') : diskRaw;
  if (best && best !== diskRaw) {
    fs.writeFileSync(diskPath, best);
  }

  const elapsed = Date.now() - started;
  const analysis = analyze(best, model.id);
  analysis.elapsedMs = elapsed;
  analysis.apiReplyChars = fullPack?.apiReplyChars || 0;
  analysis.streamedChars = fullPack?.streamedChars || best.length;
  analysis.apiTailOnly = Boolean(fullPack?.apiTailOnly);
  analysis.error = fullPack?.error || null;
  analysis.modelName = model.name;
  analysis.sizeGb = model.sizeGb;
  if (analysis.error === 'wall-timeout') analysis.pass = false;

  retryResults.push(analysis);
  log(analysis.pass ? 'PASS' : 'FAIL', JSON.stringify({
    modelId: analysis.modelId,
    pass: analysis.pass,
    elapsedSec: Math.round(elapsed / 1000),
    appLines: analysis.appLines,
    chars: analysis.chars,
    hasMarker: analysis.hasMarker,
    hasExport: analysis.hasExport,
    apiReplyChars: analysis.apiReplyChars,
    streamedChars: analysis.streamedChars,
    apiTailOnly: analysis.apiTailOnly,
    error: analysis.error,
  }));
  log('tail', analysis.previewTail);
}

// Fresh full run — overwrite prior results
const summary = {
  at: new Date().toISOString(),
  targetLines: TARGET_LINES,
  total: retryResults.length,
  passed: retryResults.filter((r) => r.pass).map((r) => r.modelId),
  failed: retryResults.filter((r) => !r.pass).map((r) => r.modelId),
  apiTailTruncationSeen: retryResults.some((r) => r.apiTailOnly),
  results: retryResults.map((r) => ({
    modelId: r.modelId,
    name: r.modelName,
    pass: r.pass,
    appLines: r.appLines,
    chars: r.chars,
    hasMarker: r.hasMarker,
    hasExport: r.hasExport,
    apiReplyChars: r.apiReplyChars,
    streamedChars: r.streamedChars,
    apiTailOnly: r.apiTailOnly,
    elapsedSec: Math.round((r.elapsedMs || 0) / 1000),
    error: r.error,
  })),
  note: 'full rerun via engineGenerateStream (craft path)',
};
fs.writeFileSync(RESULTS, JSON.stringify(summary, null, 2));
log('\n========== SUMMARY ==========');
log(JSON.stringify(summary, null, 2));
ws.close();
process.exit(summary.failed.length ? 1 : 0);
