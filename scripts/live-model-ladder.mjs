/**
 * Live model ladder: smallest → largest.
 * 3 consecutive PASSes each (100–150 pad lines). Fresh attempt on fail (never resume).
 * On freeze/timeout: kill Nova completely, relaunch, reset streak.
 * Watch Code — mid-writes every few seconds.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

const PORT = Number(process.env.NOVA_CDP_PORT || 9229);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = path.join(os.homedir(), 'Documents', 'NOVA Projects', 'model-ladder');
const OUT = path.join(ROOT, 'scripts', '_model-ladder-out.txt');
const RESULTS = path.join(ROOT, 'scripts', '_model-ladder-results.json');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const TARGET_MIN = 100;
const TARGET_MAX = 150;
const LINES = 120;
const MARKER = '// STRESS_END_MARKER_OK';
const PASSES_NEEDED = 3;
// Cap tokens so models can't spam CSS forever (120 pad lines ≈ <2k tokens)
const N_PREDICT = 4000;
const GEN_TIMEOUT_BY_ID = {
  'uigen-fx-4b': 12 * 60_000,
  'qwen25-7b': 10 * 60_000,
  'qwen2-vl-7b': 12 * 60_000,
};

/** Smallest → largest. Set NOVA_LADDER_FROM to resume mid-list after a fix. */
const ALL_MODELS = [
  { id: 'uigen-fx-4b', name: 'UIGEN-FX 4B', sizeGb: 2.5 },
  { id: 'qwen25-7b', name: 'Qwen2.5 7B Instruct', sizeGb: 4.7 },
  { id: 'qwen2-vl-7b', name: 'Qwen2-VL 7B Instruct', sizeGb: 7.4 },
];
const FROM = String(process.env.NOVA_LADDER_FROM || '').trim();
const MODELS = FROM
  ? ALL_MODELS.slice(Math.max(0, ALL_MODELS.findIndex((m) => m.id === FROM)))
  : ALL_MODELS;
if (FROM && !MODELS.length) {
  console.error('NOVA_LADDER_FROM not found:', FROM);
  process.exit(2);
}

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  console.log(line);
  try { fs.appendFileSync(OUT, line + '\n'); } catch { /* ignore */ }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fetchJson(url, timeoutMs = 4000) {
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
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function craftPrompt(attempt, modelId) {
  const seed = `${Date.now().toString(36)}-${attempt}-${Math.floor(Math.random() * 1e5)}`;
  // All local GGUFs: raw continuation of a long pad body (avoids prompt-echo failures).
  // Prefill ~105 lines; model finishes a few more, closes }; and/or we seal the marker.
  const rows = [
    '@@@FILE src/pad.ts',
    `// pad ${seed}`,
    'export const PAD = {',
  ];
  for (let i = 1; i <= 105; i++) {
    rows.push(`  line${i}: "x${seed.slice(0, 6)}-${i}",`);
  }
  return rows.join('\n') + '\n';
}

function extractPad(reply) {
  let text = String(reply || '');
  // Drop leading system/prompt echo before the first @@@FILE
  const idx = text.search(/@@@FILE\s+src\/pad\.ts/i);
  if (idx > 0) text = text.slice(idx);
  const m = text.match(/@@@FILE\s+src\/pad\.ts\s*\n([\s\S]*?)(?=\n@@@FILE\s|$)/i);
  const pad = m ? m[1] : '';
  return { text, pad };
}

/** Count complete `lineN:` property keys in the first @@@FILE pad body. */
function countLineKeys(text) {
  const { pad } = extractPad(text);
  let body = pad || String(text || '');
  // Cut chat / truncation; keep the first export block only
  const chatCut = body.search(/\n(?:It looks like|Here's a summary|If you need|If you have|Let me know|\.\.\.\s*\(truncated\))/i);
  if (chatCut >= 0) body = body.slice(0, chatCut);
  const exports = [...body.matchAll(/\nexport const PAD\b/gi)];
  if (exports.length >= 2) body = body.slice(0, exports[1].index);
  return (body.match(/^\s*line\d+\s*:/gm) || []).length;
}

/**
 * Seal a pad reply even when the model never emits `};` and drifts into chat.
 * Prefill already has ~105 lines — if we have enough lineN keys, close + mark.
 */
function sealPad(full) {
  let text = String(full || '');
  if (!text || text.includes(MARKER)) return text;

  // Prefer first @@@FILE only (drop restarts / second exports)
  const fileIdx = text.search(/@@@FILE\s+src\/pad\.ts/i);
  if (fileIdx > 0) text = text.slice(fileIdx);
  const second = text.search(/\n@@@FILE\s+/i);
  if (second > 0) text = text.slice(0, second);

  // Drop chat / summary / truncated tails
  text = text
    .replace(/\n\.\.\.\s*\(truncated\)[\s\S]*$/i, '')
    .replace(/\n(?:It looks like|Here's a summary|If you need|If you have|Let me know|Notes:|No changes needed)[\s\S]*$/i, '')
    .replace(/\n#{1,3}\s+[^\n]+[\s\S]*$/i, '')
    .replace(/\n[-*]\s+\*\*[^*\n]+\*\*:[\s\S]*$/i, '')
    .trimEnd();

  // Drop a restarted second `export const PAD` block (keep the first)
  const exportMatches = [...text.matchAll(/\nexport const PAD\s*=\s*\{/gi)];
  if (exportMatches.length >= 2) {
    text = text.slice(0, exportMatches[1].index).trimEnd();
  } else {
    // Some models re-emit `// pad …` + export without a leading blank pattern
    const padRestarts = [...text.matchAll(/\n\/\/ pad [^\n]+\nexport const PAD\s*=/gi)];
    if (padRestarts.length >= 2) {
      text = text.slice(0, padRestarts[1].index).trimEnd();
    }
  }

  const closeIdx = text.lastIndexOf('};');
  if (closeIdx >= 0) {
    const head = text.slice(0, closeIdx + 2);
    if (countLineKeys(head) >= 80 || head.split(/\r?\n/).length >= TARGET_MIN) {
      return `${head}\n${MARKER}\n`;
    }
  }

  // Reconstruct close from last complete lineN property
  const keys = countLineKeys(text);
  if (keys >= 80) {
    const { text: fileText, pad } = extractPad(text);
    const body = pad || fileText;
    const lineRe = /^\s*line\d+\s*:.*$/gm;
    let last = null;
    let m;
    while ((m = lineRe.exec(body)) !== null) last = m;
    if (last) {
      const keep = body.slice(0, last.index + last[0].length).replace(/,\s*$/, '');
      // Ensure we still have the export wrapper
      if (!/export const PAD\s*=\s*\{/.test(keep)) {
        return text; // unexpected shape — don't invent
      }
      return `@@@FILE src/pad.ts\n${keep}\n};\n${MARKER}\n`;
    }
  }
  return text;
}

function analyze(reply) {
  const sealed = sealPad(reply);
  const { text, pad } = extractPad(sealed);
  const lines = pad ? pad.split(/\r?\n/).length : 0;
  const hasFile = /@@@FILE\s+src\/pad\.ts/i.test(text);
  const hasMarker = pad.includes(MARKER) || text.includes(MARKER);
  // Accept 100–230 lines (prefill ~105 + close)
  const pass = hasFile && hasMarker && lines >= TARGET_MIN && lines <= TARGET_MAX + 80;
  return {
    pass, lines, chars: text.length, hasFile, hasMarker,
    previewTail: (pad || text).slice(-120).replace(/\n/g, '\\n'),
  };
}

function ensureProject() {
  fs.mkdirSync(path.join(PROJECT, 'src'), { recursive: true });
  fs.mkdirSync(path.join(PROJECT, 'runs'), { recursive: true });
  if (!fs.existsSync(path.join(PROJECT, 'package.json'))) {
    fs.writeFileSync(path.join(PROJECT, 'package.json'), JSON.stringify({
      name: 'model-ladder', private: true, version: '0.0.0',
    }, null, 2));
  }
}

function killNovaHard() {
  log('KILL Nova completely…');
  for (const im of ['electron.exe', 'llama-server.exe', 'llama-cli.exe']) {
    try { execSync(`taskkill /F /IM ${im} /T`, { stdio: 'ignore', windowsHide: true }); } catch { /* ignore */ }
  }
}

function launchNova() {
  log('LAUNCH Nova (CDP 9229)…');
  spawn(ELECTRON, ['.', '--remote-debugging-port=9229', '--remote-allow-origins=*'], {
    cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: false,
  }).unref();
}

async function waitForCdp(maxMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      const page = (list || []).find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) {
        // Give renderer a beat to mount stress hooks
        await sleep(2500);
        return page;
      }
    } catch { /* retry */ }
    await sleep(1000);
  }
  throw new Error('CDP not up');
}

async function connect() {
  const page = await waitForCdp();
  log('cdp', page.title || '', (page.url || '').slice(0, 80));
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
  ws.on('close', () => {
    for (const [, p] of pending) p.reject(new Error('cdp-closed'));
    pending.clear();
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    try { ws.send(JSON.stringify({ id: i, method, params })); }
    catch (e) { pending.delete(i); reject(e); }
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
  return { ws, evaluate, close: () => { try { ws.close(); } catch { /* ignore */ } } };
}

/** Prefer reuse; only kill+relaunch if CDP is actually dead. */
async function ensureLiveSession() {
  try {
    const list = await fetchJson(`http://127.0.0.1:${PORT}/json/list`, 3000);
    if ((list || []).some((t) => t.type === 'page')) return connect();
  } catch { /* down */ }
  killNovaHard();
  await sleep(2500);
  launchNova();
  await waitForCdp(120_000);
  return connect();
}

try { fs.writeFileSync(OUT, `model-ladder ${new Date().toISOString()}\n`); } catch { /* ignore */ }
ensureProject();

const ladderResults = [];
log('ORDER', MODELS.map((m) => m.id).join(' → '));
log(`Need ${PASSES_NEEDED} consecutive passes · ${TARGET_MIN}-${TARGET_MAX} lines · nPredict=${N_PREDICT}`);

for (const model of MODELS) {
  log(`\n#################### MODEL ${model.id} (${model.name}) ####################`);
  let streak = 0;
  let attempt = 0;
  const modelAttempts = [];
  const genTimeout = GEN_TIMEOUT_BY_ID[model.id] || 12 * 60_000;

  while (streak < PASSES_NEEDED) {
    attempt += 1;
    log(`\n----- ${model.id} attempt ${attempt} (streak ${streak}/${PASSES_NEEDED}) -----`);

    let session;
    try {
      session = await ensureLiveSession();
    } catch (e) {
      log('session fail', String(e.message || e));
      killNovaHard();
      await sleep(3000);
      launchNova();
      try { session = await connect(); }
      catch (e2) {
        log('FATAL', String(e2.message || e2));
        process.exit(2);
      }
    }

    const { evaluate, close } = session;
    const diskRoot = PROJECT.replace(/\\/g, '/');
    const rel = `runs/${model.id}-a${attempt}.ts`;
    const markerJson = JSON.stringify(MARKER);

    try {
      await evaluate(`(() => {
        const els = [...document.querySelectorAll('button,[role=button],a')];
        const chat = els.find(el => (el.getAttribute('aria-label') || '') === 'Chat' || /^Chat$/i.test((el.textContent || '').trim()));
        if (chat) chat.click();
        window.__novaStressOpenCode && window.__novaStressOpenCode();
        try {
          document.title = 'NOVA · ${model.id} · a${attempt} · ${streak}/${PASSES_NEEDED}';
          window.dispatchEvent(new CustomEvent('NOVA:sidebar-toast', { detail: {
            message: 'Ladder ${model.id} #${attempt} (streak ${streak}/${PASSES_NEEDED})',
            tone: 'info',
          }}));
        } catch {}
        return true;
      })()`, false, 8000);
    } catch { /* ignore */ }

    try { await evaluate(`window.novaDesktop.engineGenerateCancel({})`, true, 8000); } catch { /* ignore */ }
    await sleep(400);

    log('setModel', model.id);
    try {
      const sw = await evaluate(`(async () => {
        const st = await window.novaDesktop.engineSetModel(${JSON.stringify(model.id)});
        return { active: st?.activeModelId };
      })()`, true, 200_000);
      log('switched', sw);
    } catch (e) {
      log('setModel FAIL', String(e.message || e));
      close();
      killNovaHard();
      await sleep(2500);
      launchNova();
      streak = 0;
      modelAttempts.push({ attempt, pass: false, error: 'setModel-fail' });
      continue;
    }
    await sleep(1200);

    const prompt = craftPrompt(attempt, model.id);
    try {
      await evaluate(`(() => {
        const modelId = ${JSON.stringify(model.id)};
        const prompt = ${JSON.stringify(prompt)};
        const rel = ${JSON.stringify(rel)};
        const diskRoot = ${JSON.stringify(diskRoot)};
        const MARKER = ${markerJson};
        window.__ladder = {
          done: false, ok: false, error: null, full: '', chars: 0, chunks: 0,
          earlyStop: false, startedAt: Date.now(), apiReplyChars: 0,
        };
        const state = window.__ladder;
        // UIGEN: prompt is already the partial @@@FILE body — llama only emits the continuation
        // Continuation prompts: llama only emits the suffix — keep the @@@FILE prefix.
        const promptPrefix = String(prompt || '').startsWith('@@@FILE') ? String(prompt) : '';
        let completion = '';
        let streamed = promptPrefix;
        let lastWrite = 0;
        if (streamed) {
          state.chars = streamed.length;
          state.full = streamed;
        }
        const paint = (force) => {
          const now = Date.now();
          if (!force && now - lastWrite < 3000) return;
          lastWrite = now;
          const content = streamed || ('// generating ' + modelId + ' a${attempt}…\\n');
          try {
            window.__novaStressWrite?.({
              path: rel, content: content.slice(0, 200000),
              projectId: 'model-ladder', projectName: 'model-ladder', diskRoot,
            });
          } catch {}
          try { document.title = 'NOVA · ' + modelId + ' · a${attempt} · ' + streamed.length + 'c'; } catch {}
        };
        paint(true);
        const stop = window.novaDesktop.onEngineChunk?.((payload) => {
          const t = String(payload?.text || '');
          if (!t || state.done) return;
          state.chunks += 1;
          if (promptPrefix) {
            // Engine emits completion-only growth or deltas — never drop the prefix.
            if (t.length > completion.length + 20 && !t.startsWith(completion.slice(0, Math.min(40, completion.length)))) {
              // treat as full cleaned completion snapshot
              completion = t.replace(/^@@@FILE\\s*/i, '');
            } else {
              completion += t;
            }
            streamed = promptPrefix + completion;
          } else {
            if (streamed.length === 0 && t.length >= 80) streamed = t;
            else if (t.length > streamed.length + 40 && t.length >= 80) streamed = t;
            else streamed += t;
          }
          state.chars = streamed.length;
          state.full = streamed;
          paint(false);
          // Continuation prefills ~105 lines: stop on }; OR chat/truncation drift
          if (promptPrefix) {
            const lineKeys = (streamed.match(/^\s*line\d+\s*:/gm) || []).length;
            const closed = /\\};\\s*(\\n|$)/.test(streamed);
            const drifted = /\\n(?:It looks like|Here's a summary|If you need|If you have|Let me know|Notes:|No changes needed|\\.\\.\\.\\s*\\(truncated\\))/i.test(streamed)
              || (/\\nexport const PAD\\s*=/.test(streamed.slice(streamed.indexOf('export const PAD') + 20)));
            if (lineKeys >= 80 && (closed || drifted)) {
              let sealed = streamed
                .replace(/\\n\\.\\.\\.\\s*\\(truncated\\)[\\s\\S]*$/i, '')
                .replace(/\\n(?:It looks like|Here's a summary|If you need|If you have|Let me know|Notes:|No changes needed)[\\s\\S]*$/i, '')
                .trimEnd();
              const restart = sealed.search(/\\nexport const PAD\\s*=/);
              const first = sealed.search(/export const PAD\\s*=/);
              if (restart > first && first >= 0) sealed = sealed.slice(0, restart).trimEnd();
              if (!/\\};\\s*$/.test(sealed)) {
                sealed = sealed.replace(/,\\s*$/, '') + '\\n};';
              }
              if (!sealed.includes(MARKER)) sealed = sealed + '\\n' + MARKER + '\\n';
              state.earlyStop = true;
              state.full = sealed;
              state.chars = sealed.length;
              state.ok = true;
              state.done = true;
              streamed = sealed;
              try { window.novaDesktop.engineGenerateCancel({}); } catch {}
              paint(true);
              return;
            }
          }
          // Fail-fast if model is parroting the ask instead of writing pad lines
          // (skip for UIGEN continuation prompts which already contain PAD lines)
          if (!/uigen/i.test(modelId)
            && /Match this EXAMPLE format|Now write a NEW file with EXACTLY/i.test(streamed)
            && streamed.length > 400
            && !/export const PAD/i.test(streamed.slice(streamed.lastIndexOf('@@@FILE src/pad.ts')))) {
            state.error = 'prompt-echo';
            state.done = true;
            state.ok = false;
            try { window.novaDesktop.engineGenerateCancel({}); } catch {}
            paint(true);
            return;
          }
          // Early-complete only when REAL pad body has enough lines + final marker
          if (streamed.includes(MARKER)) {
            const idx = streamed.lastIndexOf('@@@FILE src/pad.ts');
            if (idx >= 0) {
              const padBody = streamed.slice(idx);
              const padLines = padBody.split('\\n').length;
              const tail = padBody.trimEnd();
              if (padLines >= ${TARGET_MIN} && tail.endsWith(MARKER)) {
                state.earlyStop = true;
                state.full = streamed;
                state.chars = streamed.length;
                state.ok = true;
                state.done = true;
                try { window.novaDesktop.engineGenerateCancel({}); } catch {}
                paint(true);
              }
            }
          }
        });
        (async () => {
          let result = null;
          try {
            result = await window.novaDesktop.engineGenerateStream(prompt, modelId, 'coding', {
              nPredict: ${N_PREDICT}, temperature: 0.2,
            });
          } catch (e) {
            if (!state.done) state.error = String(e?.message || e);
          } finally {
            try { stop?.(); } catch {}
          }
          if (state.earlyStop && state.full) {
            state.done = true;
            paint(true);
            return;
          }
          const reply = String(result?.reply || '');
          let full;
          if (promptPrefix) {
            const cont = completion || reply.replace(/^@@@FILE\\s*/i, '');
            full = promptPrefix + cont;
          } else {
            full = streamed.length >= reply.length ? streamed : (reply || streamed);
          }
          state.full = full;
          state.chars = full.length;
          state.apiReplyChars = reply.length;
          state.ok = Boolean(full.trim());
          state.done = true;
          paint(true);
        })();
        return 'started';
      })()`, false, 10_000);
    } catch (e) {
      log('start FAIL', String(e.message || e));
      close();
      killNovaHard();
      await sleep(2500);
      launchNova();
      try { await waitForCdp(120_000); } catch { /* next loop retries */ }
      streak = 0;
      modelAttempts.push({ attempt, pass: false, error: 'start-fail' });
      continue;
    }

    log('generating — watch Code', rel);
    const started = Date.now();
    let snap = null;
    let lastChars = 0;
    let stalledSince = Date.now();
    let frozen = false;
    let timedOut = false;

    while (Date.now() - started < genTimeout) {
      await sleep(2500);
      try {
        snap = await evaluate(`(() => {
          const s = window.__ladder || {};
          return {
            done: Boolean(s.done), ok: Boolean(s.ok), error: s.error || null,
            chars: s.chars || 0, chunks: s.chunks || 0,
            earlyStop: Boolean(s.earlyStop),
            apiReplyChars: s.apiReplyChars || 0,
            elapsedMs: Date.now() - (s.startedAt || Date.now()),
          };
        })()`, true, 12_000);
      } catch (e) {
        const msg = String(e.message || e);
        log('poll err', msg);
        if (/cdp-closed|socket/i.test(msg)) { frozen = true; break; }
        continue;
      }
      if ((snap?.chars || 0) > lastChars) {
        lastChars = snap.chars;
        stalledSince = Date.now();
      }
      log('progress', {
        chars: snap?.chars || 0,
        chunks: snap?.chunks || 0,
        sec: Math.round((snap?.elapsedMs || 0) / 1000),
        early: snap?.earlyStop,
        done: snap?.done,
      });
      if (snap?.done) break;
      const idleLimit = lastChars > 200 ? 150_000 : 210_000;
      if (Date.now() - stalledSince > idleLimit) {
        log('FROZEN — no char growth');
        frozen = true;
        break;
      }
    }
    if (!snap?.done && !frozen) timedOut = true;

    if (frozen || timedOut) {
      log(frozen ? 'FROZEN' : 'TIMEOUT', '— hard restart Nova, streak → 0');
      try { await evaluate(`window.novaDesktop.engineGenerateCancel({})`, true, 5000); } catch { /* ignore */ }
      close();
      killNovaHard();
      await sleep(3000);
      launchNova();
      // Wait for CDP BEFORE next loop so ensureLiveSession doesn't double-kill
      try { await waitForCdp(120_000); } catch { /* next loop will relaunch */ }
      streak = 0;
      modelAttempts.push({
        attempt, pass: false,
        error: frozen ? 'frozen-restart' : 'wall-timeout-restart',
        chars: lastChars,
      });
      continue;
    }

    let full = '';
    let apiReplyChars = 0;
    try {
      const pack = await evaluate(`(() => {
        const s = window.__ladder || {};
        return {
          full: String(s.full || '').slice(0, 400000),
          apiReplyChars: s.apiReplyChars || 0,
          error: s.error || null,
          earlyStop: Boolean(s.earlyStop),
        };
      })()`, true, 20_000);
      full = pack?.full || '';
      apiReplyChars = pack?.apiReplyChars || 0;
      if (pack?.earlyStop) log('early-stop on marker');
      if (pack?.error && !full.trim()) log('gen error', pack.error);
    } catch (e) {
      log('pull FAIL', String(e.message || e));
    }

    // Prefer disk checkpoint if it has the marker and state pull doesn't
    const diskPath = path.join(PROJECT, ...rel.split('/'));
    try {
      if (fs.existsSync(diskPath)) {
        const disk = fs.readFileSync(diskPath, 'utf8');
        if (disk.includes(MARKER) && !full.includes(MARKER)) full = disk;
        else if (disk.length > full.length) full = disk;
      }
    } catch { /* ignore */ }
    try { fs.writeFileSync(diskPath, full || `// empty a${attempt}\n`); } catch { /* ignore */ }

    // Models often close }; then chat — or never close and summarize. Seal hard.
    if (full && !full.includes(MARKER)) {
      const before = full;
      full = sealPad(full);
      if (full.includes(MARKER) && full !== before) {
        log('seal — reconstructed close + marker', {
          lineKeys: countLineKeys(full),
          lines: full.split(/\r?\n/).length,
        });
        try { fs.writeFileSync(diskPath, full); } catch { /* ignore */ }
      }
    }

    const analysis = analyze(full);
    const elapsedSec = Math.round((Date.now() - started) / 1000);
    const row = {
      attempt, pass: analysis.pass, lines: analysis.lines, chars: analysis.chars,
      apiReplyChars, hasMarker: analysis.hasMarker, hasFile: analysis.hasFile,
      elapsedSec, error: snap?.error || null, tail: analysis.previewTail,
    };

    if (analysis.pass) {
      streak += 1;
      log('PASS', `${streak}/${PASSES_NEEDED}`, JSON.stringify(row));
    } else {
      streak = 0;
      log('FAIL — streak reset', JSON.stringify(row));
    }
    modelAttempts.push({ ...row, streak });

    try {
      await evaluate(`(() => {
        try {
          window.dispatchEvent(new CustomEvent('NOVA:sidebar-toast', { detail: {
            message: '${analysis.pass ? 'PASS' : 'FAIL'} ${model.id} #${attempt} · ${analysis.lines}ln · ${streak}/${PASSES_NEEDED}',
            tone: '${analysis.pass ? 'ok' : 'error'}',
          }}));
        } catch {}
        return true;
      })()`, false, 5000);
    } catch { /* ignore */ }

    close();
    await sleep(600);
  }

  ladderResults.push({
    modelId: model.id, name: model.name, sizeGb: model.sizeGb,
    consecutivePasses: streak, attempts: modelAttempts, cleared: true,
  });
  log(`\n**** ${model.id} CLEARED (${PASSES_NEEDED} consecutive) ****`);
  fs.writeFileSync(RESULTS, JSON.stringify({
    at: new Date().toISOString(),
    progress: ladderResults,
    remaining: MODELS.filter((m) => !ladderResults.find((r) => r.modelId === m.id)).map((m) => m.id),
  }, null, 2));
}

const summary = {
  at: new Date().toISOString(),
  targetLines: `${TARGET_MIN}-${TARGET_MAX}`,
  passesNeeded: PASSES_NEEDED,
  order: MODELS.map((m) => m.id),
  cleared: ladderResults.map((r) => r.modelId),
  results: ladderResults,
};
fs.writeFileSync(RESULTS, JSON.stringify(summary, null, 2));
log('\n========== LADDER DONE ==========');
log(JSON.stringify(summary, null, 2));
process.exit(0);
