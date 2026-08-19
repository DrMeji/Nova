/**
 * Optional GGUF runtime for ARK Engine.
 * Looks for *.gguf in the ARK models folder and a local llama binary
 * (ark-engine/bin/llama-cli). Can bootstrap llama.cpp release builds.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { app } = require('electron');
const arkFetch = require('./arkFetch.cjs');
const arkPaths = require('./arkPaths.cjs');

/** Pinned llama.cpp release — CPU builds for zero-key local chat. */
const LLAMA_TAG = 'b9992';

function modelsDir() {
  return arkPaths.modelsDir();
}

function binDir() {
  return arkPaths.binDir();
}

function ensureDirs() {
  fs.mkdirSync(modelsDir(), { recursive: true });
  fs.mkdirSync(binDir(), { recursive: true });
}

function findGgufForModel(modelId) {
  const dir = modelsDir();
  if (!fs.existsSync(dir)) return null;
  const rawId = String(modelId).replace(/^gguf:/, '');
  const exact = path.join(dir, `${rawId}.gguf`);
  if (fs.existsSync(exact)) return exact;
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.gguf'));
  if (!files.length) return null;
  const idNorm = rawId.toLowerCase();
  const compact = idNorm.replace(/-/g, '');
  // Prefer full-id match so 7b / 14b / 32b never collide.
  const full = files.find((f) => f.toLowerCase().replace(/-/g, '').includes(compact));
  if (full) return path.join(dir, full);
  const size = idNorm.match(/(\d+(?:\.\d+)?)b/)?.[1];
  const family = compact.replace(/\d+(?:\.\d+)?b.*$/, '').slice(0, 8);
  if (size && family) {
    const sized = files.find((f) => {
      const fn = f.toLowerCase().replace(/-/g, '');
      return fn.includes(family) && fn.includes(size);
    });
    if (sized) return path.join(dir, sized);
  }
  return null;
}

function findNamedBinary(names) {
  ensureDirs();
  for (const name of names) {
    const full = path.join(binDir(), name);
    if (fs.existsSync(full)) return full;
  }
  try {
    for (const entry of fs.readdirSync(binDir(), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      for (const name of names) {
        const full = path.join(binDir(), entry.name, name);
        if (fs.existsSync(full)) return full;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function cliNames() {
  return process.platform === 'win32'
    ? ['llama-cli.exe', 'llama.exe', 'main.exe']
    : ['llama-cli', 'main'];
}

function serverNames() {
  return process.platform === 'win32' ? ['llama-server.exe'] : ['llama-server'];
}

function findLlamaBinary() {
  return findNamedBinary(cliNames());
}

function findLlamaServer() {
  const existing = findNamedBinary(serverNames());
  if (existing) return existing;
  try {
    const leftover = path.join(binDir(), `_extract_${LLAMA_TAG}`);
    const found = findFileRecursive(leftover, serverNames())
      || findFileRecursive(binDir(), serverNames());
    if (found) {
      const dest = path.join(binDir(), process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
      if (path.resolve(found) !== path.resolve(dest)) fs.copyFileSync(found, dest);
      try { fs.chmodSync(dest, 0o755); } catch { /* ignore */ }
      return dest;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function listGgufFiles() {
  const dir = modelsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.gguf'))
    .map((f) => ({
      file: f,
      path: path.join(dir, f),
      sizeMb: Math.round(fs.statSync(path.join(dir, f)).size / (1024 * 1024)),
    }));
}

function llamaReleaseUrl() {
  const tag = LLAMA_TAG;
  if (process.platform === 'win32') {
    const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
    return `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/llama-${tag}-bin-win-cpu-${arch}.zip`;
  }
  if (process.platform === 'darwin') {
    const arch = process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
    return `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/llama-${tag}-bin-${arch}.tar.gz`;
  }
  return `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/llama-${tag}-bin-ubuntu-x64.tar.gz`;
}

function findFileRecursive(root, names) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (names.includes(e.name)) return full;
    }
  }
  return null;
}

function extractArchive(archivePath, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true });
    if (process.platform === 'win32' && archivePath.toLowerCase().endsWith('.zip')) {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Expand-Archive -LiteralPath '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
        ],
        { windowsHide: true },
        (err) => (err ? reject(err) : resolve()),
      );
      return;
    }
    // tar handles .tar.gz and often .zip on modern macOS/Linux
    execFile('tar', ['-xf', archivePath, '-C', destDir], (err) => (err ? reject(err) : resolve()));
  });
}

/**
 * Download + install llama-cli into ark-engine/bin if missing.
 * @param {(pct: number) => void} [onProgress]
 */
async function ensureLlamaBinary(onProgress) {
  const existing = findLlamaBinary();
  if (existing) {
    findLlamaServer();
    return existing;
  }

  ensureDirs();
  const url = llamaReleaseUrl();
  const archiveName = path.basename(new URL(url).pathname);
  const archivePath = path.join(binDir(), archiveName);
  const extractDir = path.join(binDir(), `_extract_${LLAMA_TAG}`);

  if (onProgress) onProgress(2);
  await arkFetch.downloadToFile(url, archivePath, (pct) => {
    if (onProgress) onProgress(Math.min(85, Math.round(pct * 0.85)));
  });

  try {
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (onProgress) onProgress(88);
  await extractArchive(archivePath, extractDir);

  const names = cliNames();
  const found = findFileRecursive(extractDir, names);
  if (!found) {
    throw new Error('llama-cli not found inside release archive');
  }

  const destName = process.platform === 'win32' ? 'llama-cli.exe' : 'llama-cli';
  const dest = path.join(binDir(), destName);
  fs.copyFileSync(found, dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* ignore on Windows */
  }

  const foundServer = findFileRecursive(extractDir, serverNames());
  if (foundServer) {
    const destServer = path.join(binDir(), process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
    try {
      fs.copyFileSync(foundServer, destServer);
      try { fs.chmodSync(destServer, 0o755); } catch { /* ignore */ }
    } catch {
      /* ignore */
    }
  }

  // Copy sibling DLLs next to the binary (Windows)
  try {
    const srcDir = path.dirname(found);
    for (const f of fs.readdirSync(srcDir)) {
      if (/\.(dll|dylib|so(\.\d+)?)$/i.test(f)) {
        fs.copyFileSync(path.join(srcDir, f), path.join(binDir(), f));
      }
    }
  } catch {
    /* ignore */
  }

  try {
    fs.unlinkSync(archivePath);
  } catch {
    /* ignore */
  }

  if (onProgress) onProgress(100);
  const bin = findLlamaBinary();
  if (!bin) throw new Error('llama-cli install finished but binary not found');
  return bin;
}

function runGguf(modelId, prompt, timeoutMs = 90000) {
  return runGgufStream(modelId, prompt, null, timeoutMs);
}

/** Active llama-cli child — cancelled via cancelGguf(). */
let activeChild = null;
let cancelRequested = false;
let activeAbort = null;
let serverChild = null;
let serverGguf = null;
let serverCtx = 0;
const SERVER_PORT_BASE = 8788;
let serverPort = SERVER_PORT_BASE;
const GGUF_CTX = 8192;

let lastServerError = null;

function getServerPort() {
  return serverPort;
}

function getServerStatus() {
  return {
    ok: !lastServerError,
    error: lastServerError || null,
    port: serverPort,
  };
}

function killLlamaChild(child) {
  if (!child) return;
  const pid = child.pid;
  if (process.platform === 'win32' && pid) {
    try {
      spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        windowsHide: true,
        stdio: 'ignore',
      });
    } catch {
      try { child.kill(); } catch { /* ignore */ }
    }
    return;
  }
  try { child.kill('SIGKILL'); } catch {
    try { child.kill(); } catch { /* ignore */ }
  }
}

function cancelGguf() {
  cancelRequested = true;
  try { activeAbort?.abort(); } catch { /* ignore */ }
  activeAbort = null;
  if (activeChild) {
    killLlamaChild(activeChild);
    activeChild = null;
  }
  return { ok: true };
}

function stopServer() {
  if (serverChild) {
    killLlamaChild(serverChild);
    serverChild = null;
    serverGguf = null;
    serverCtx = 0;
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingServer(port = serverPort) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`, {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function bindLlamaServer(bin, gguf) {
  lastServerError = null;
  for (let candidate = SERVER_PORT_BASE; candidate < SERVER_PORT_BASE + 10; candidate += 1) {
    stopServer();
    const child = spawn(bin, [
      '-m', gguf,
      '--host', '127.0.0.1',
      '--port', String(candidate),
      '-c', String(GGUF_CTX),
      '--parallel', '1',
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    serverChild = child;
    serverGguf = gguf;
    serverCtx = GGUF_CTX;
    serverPort = candidate;
    child.on('exit', () => {
      if (serverChild === child) {
        serverChild = null;
        serverGguf = null;
        serverCtx = 0;
      }
    });
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline) {
      if (child.killed || child.exitCode != null) break;
      if (await pingServer(candidate)) return true;
      await wait(250);
    }
    stopServer();
  }
  lastServerError = 'llama-server failed to start — ARK will use one-shot CLI instead';
  return false;
}

/**
 * Keep llama-server loaded so follow-up chats skip the 8–12s model reload.
 */
async function ensureLlamaServer(modelId) {
  const gguf = findGgufForModel(modelId);
  const bin = findLlamaServer();
  if (!gguf || !bin) return false;
  if (serverChild && serverGguf === gguf && serverCtx === GGUF_CTX && !serverChild.killed && await pingServer()) {
    return true;
  }
  return bindLlamaServer(bin, gguf);
}

async function warmServer(modelId) {
  try {
    await ensureLlamaServer(modelId);
  } catch {
    /* warmup is best-effort */
  }
}

async function runGgufServerStream(modelId, prompt, onChunk, timeoutMs, nPredict = 1536) {
  const promptStr = wrapChatPrompt(modelId, prompt);
  const started = Date.now();
  cancelRequested = false;
  const ac = new AbortController();
  activeAbort = ac;
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let out = '';
  try {
    const res = await fetch(`http://127.0.0.1:${serverPort}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptStr,
        n_predict: nPredict,
        temperature: 0.55,
        stream: true,
        cache_prompt: true,
        stop: [stopToken(modelId)],
      }),
      signal: ac.signal,
    });
    if (!res.ok || !res.body) throw new Error(`llama-server ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let emitted = '';
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
        } catch {
          /* ignore partial json */
        }
      }
      if (typeof onChunk === 'function') {
        const cleaned = cleanGgufReply(promptStr, out);
        if (cleaned && cleaned.length > emitted.length) {
          const delta = cleaned.slice(emitted.length);
          emitted = cleaned;
          if (delta) {
            try { onChunk(delta); } catch { /* ignore */ }
          }
        }
      }
    }
    const text = cleanGgufReply(promptStr, out);
    writeGgufDebug({
      at: new Date().toISOString(),
      ms: Date.now() - started,
      modelId,
      gguf: path.basename(findGgufForModel(modelId) || ''),
      via: 'llama-server',
      cancelled: Boolean(cancelRequested),
      outLen: out.length,
      cleanedLen: text.length,
      cleanedPreview: text.slice(0, 240),
    });
    if (!text.trim() && !cancelRequested) {
      throw new Error('Local GGUF returned empty output');
    }
    return {
      ok: true,
      reply: text.slice(-6000) || (cancelRequested ? '(stopped)' : ''),
      modelFile: path.basename(findGgufForModel(modelId) || ''),
      source: 'ark-gguf',
      streamed: Boolean(onChunk),
      cancelled: Boolean(cancelRequested),
    };
  } finally {
    clearTimeout(timer);
    if (activeAbort === ac) activeAbort = null;
  }
}

const ARK_SYSTEM =
  'You are ARK, the assistant inside the ARK desktop creation studio on this computer. '
  + 'Answer the latest user request clearly. Do not echo the prompt.';

function llamaFamily(modelId) {
  return /llama3/i.test(String(modelId || ''));
}

function promptBody(prompt) {
  return String(prompt || '').replace(/\nARK:\s*$/, '').trim();
}

function isPackedArkPrompt(body) {
  return /^You are ARK(?:,|\s)/i.test(String(body || '').trim());
}

/** ChatML for Qwen/Mistral/Gemma; Llama 3 headers for llama3*. */
function wrapChatPrompt(modelId, prompt) {
  const body = promptBody(prompt);
  if (/<\|im_start\|>/.test(body) || /<\|start_header_id\|>/.test(body)) {
    return body.endsWith('\n') ? body : `${body}\n`;
  }
  // packHistoryPrompt() already includes ARK's identity/instructions for local single-string
  // engines. Wrapping that again as a second system message makes some GGUFs (notably Qwen)
  // parrot the prompt instead of answering.
  if (isPackedArkPrompt(body)) {
    if (llamaFamily(modelId)) {
      return (
        `<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n${body}<|eot_id|>`
        + `<|start_header_id|>assistant<|end_header_id|>\n\n`
      );
    }
    return (
      `<|im_start|>user\n${body}<|im_end|>\n`
      + `<|im_start|>assistant\n`
    );
  }
  if (llamaFamily(modelId)) {
    return (
      `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${ARK_SYSTEM}<|eot_id|>`
      + `<|start_header_id|>user<|end_header_id|>\n\n${body}<|eot_id|>`
      + `<|start_header_id|>assistant<|end_header_id|>\n\n`
    );
  }
  return (
    `<|im_start|>system\n${ARK_SYSTEM}<|im_end|>\n`
    + `<|im_start|>user\n${body}<|im_end|>\n`
    + `<|im_start|>assistant\n`
  );
}

function stopToken(modelId) {
  return llamaFamily(modelId) ? '<|eot_id|>' : '<|im_end|>';
}

/**
 * Strip prompt echo that some llama-cli builds print before the completion.
 */
function stripPromptEcho(prompt, text) {
  const raw = String(text || '');
  const p = String(prompt || '').trim();
  if (!p || !raw) return raw.trim();
  let out = raw.trim();
  if (out.startsWith(p)) {
    out = out.slice(p.length).replace(/^\s+/, '');
  } else {
    // Partial / whitespace-normalized echo
    const compactP = p.replace(/\s+/g, ' ').trim();
    const compactO = out.replace(/\s+/g, ' ').trim();
    if (compactO.startsWith(compactP)) {
      const idx = out.toLowerCase().indexOf(p.slice(0, Math.min(40, p.length)).toLowerCase());
      if (idx === 0) {
        // fall through — already handled
      }
      // Drop leading overlap of first line of prompt
      const firstLine = p.split(/\r?\n/)[0]?.trim();
      if (firstLine && out.startsWith(firstLine)) {
        out = out.slice(firstLine.length).replace(/^\s+/, '');
      }
    }
  }
  return out.trim() || raw.trim();
}

const NOISE_LINE = new RegExp(
  [
    '^\\s*$',
    '^loading model',
    '^build\\s*:',
    '^model\\s*:',
    '^ftype\\s*:',
    '^modalities\\s*:',
    '^available commands',
    '^system[_ ]?info',
    '^llama_',
    '^ggml_',
    '^main:',
    '^print_',
    '^cli_',
    '^slot ',
    '^common_',
    '^sampler',
    '^generate:',
    '^\\s*/(exit|regen|clear|read|glob)\\b',
    '^\\s*>\\s*$',
    '^\\[\\s*Prompt:',
    // ASCII-art / banner rows (lots of block chars or repeated symbols)
    '^[\\s░▒▓█▄▀■□▪▫*_=`\\-\'\\"\\\\/|]+$',
  ].join('|'),
  'i',
);

function lastMatchEnd(text, re) {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const r = new RegExp(re.source, flags);
  let end = -1;
  let m;
  while ((m = r.exec(text)) !== null) end = m.index + m[0].length;
  return end;
}

function stripCliFooter(text) {
  let t = String(text || '');
  t = t.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  t = t.replace(/\n?\s*\[\s*Prompt:[^\]]*\][\s\S]*$/i, '');
  t = t.replace(/\nExiting\.\.\.[\s\S]*$/i, '');
  t = t.replace(/<\|im_end\|>[\s\S]*$/g, '');
  t = t.replace(/<\|eot_id\|>[\s\S]*$/g, '');
  t = t.replace(/\n?\s*>\s*$/g, '');
  return t.trim();
}

/**
 * llama-cli reprints the ChatML prompt on stdout. Never strip from the first
 * `<|im_start|>` / `<|im_end|>` in that echo — that deletes the real answer.
 * Take text after the last assistant header, then drop banners/footers.
 */
function stripLlamaCliNoise(text) {
  let t = String(text || '').replace(/\r\n/g, '\n');
  if (!t.trim()) return '';

  const afterAssistant = Math.max(
    lastMatchEnd(t, /<\|im_start\|>assistant\s*\n/),
    lastMatchEnd(t, /<\|start_header_id\|>assistant<\|end_header_id\|>\s*\n+/),
  );
  if (afterAssistant >= 0) {
    return stripCliFooter(t.slice(afterAssistant));
  }

  const markRe = /(?:^|\n)\s*(?:ARK|Assistant)\s*:\s+(?!<\|)/gi;
  let lastMark = null;
  let mm;
  while ((mm = markRe.exec(t)) !== null) lastMark = mm;
  if (lastMark && typeof lastMark.index === 'number') {
    t = t.slice(lastMark.index + lastMark[0].length).replace(/^\s*ARK\s*:\s*/i, '');
  }

  const lines = t.split('\n');
  const kept = [];
  let sawCommands = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^>\s+\S/.test(trimmed)) continue;
    if (/^\s*User\s*:/i.test(trimmed)) continue;
    if (/^available commands/i.test(trimmed)) {
      sawCommands = true;
      continue;
    }
    if (sawCommands && (/^\s*\/\w+/.test(trimmed) || trimmed === '')) {
      if (/^\s*\/\w+/.test(trimmed)) continue;
      if (trimmed === '' && kept.length === 0) continue;
      sawCommands = false;
      continue;
    }
    sawCommands = false;
    if (NOISE_LINE.test(trimmed)) continue;
    if (/^[A-Za-z]:\\.*\.gguf\b/i.test(trimmed) || /^\/.*\.gguf\b/i.test(trimmed)) continue;
    if (/ark-engine[\\/]+models/i.test(trimmed)) continue;
    if (/^[\s]*l[\s]*l[\s]*a[\s]*m[\s]*a/i.test(trimmed) && trimmed.length < 80) continue;
    kept.push(line);
  }

  return stripCliFooter(kept.join('\n'));
}

function cleanGgufReply(prompt, text) {
  const noNoise = stripLlamaCliNoise(text);
  return stripPromptEcho(prompt, noNoise);
}

function writeGgufDebug(payload) {
  try {
    const file = path.join(app.getPath('userData'), 'ark-engine', 'last-gguf-chat.log');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

/**
 * Stream llama-cli stdout as it arrives.
 * onChunk(textDelta) may be called many times; final resolve still returns full reply.
 */
function runGgufStream(modelId, prompt, onChunk, timeoutMs = 120000, nPredict = 1536) {
  return (async () => {
    if (await ensureLlamaServer(modelId)) {
      try {
        const hit = await runGgufServerStream(modelId, prompt, onChunk, timeoutMs, nPredict);
        if (hit?.reply) return hit;
      } catch {
        /* fall through to one-shot llama-cli */
      }
    }
    return runGgufCliStream(modelId, prompt, onChunk, timeoutMs, nPredict);
  })();
}

function runGgufCliStream(modelId, prompt, onChunk, timeoutMs = 120000, nPredict = 1536) {
  return new Promise((resolve, reject) => {
    const gguf = findGgufForModel(modelId);
    const bin = findLlamaBinary();
    if (!gguf) {
      reject(new Error('No GGUF weights found in ARK Engine models folder'));
      return;
    }
    if (!bin) {
      reject(new Error(
        `GGUF found (${path.basename(gguf)}) but no llama binary. Place llama-cli in ${binDir()}`,
      ));
      return;
    }

    cancelRequested = false;
    if (activeChild) {
      killLlamaChild(activeChild);
      activeChild = null;
    }

    const promptStr = wrapChatPrompt(modelId, prompt);
    const started = Date.now();
    const promptFile = path.join(os.tmpdir(), `ark-gguf-prompt-${process.pid}-${started}.txt`);
    try {
      fs.writeFileSync(promptFile, promptStr, 'utf8');
    } catch (err) {
      reject(err);
      return;
    }
    const args = [
      '-m', gguf,
      '-f', promptFile,
      '-n', String(nPredict),
      '-c', String(GGUF_CTX),
      '-t', String(Math.max(4, os.cpus().length)),
      '--temp', '0.55',
      '--no-conversation',
      '--single-turn',
      '--no-display-prompt',
      '--simple-io',
    ];
    const child = spawn(bin, args, { windowsHide: true });
    try {
      child.stdin?.end();
    } catch {
      /* ignore */
    }
    activeChild = child;
    let out = '';
    let err = '';
    let emitted = '';
    const cleanupPrompt = () => {
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
    };
    const timer = setTimeout(() => {
      killLlamaChild(child);
      reject(new Error('GGUF generation timed out'));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      const piece = d.toString();
      out += piece;
      if (typeof onChunk !== 'function') return;
      const cleaned = cleanGgufReply(promptStr, out);
      if (!cleaned) return;
      if (cleaned.length > emitted.length) {
        const delta = cleaned.slice(emitted.length);
        emitted = cleaned;
        if (delta) {
          try { onChunk(delta); } catch { /* ignore */ }
        }
      }
    });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(timer);
      cleanupPrompt();
      if (activeChild === child) activeChild = null;
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      cleanupPrompt();
      if (activeChild === child) activeChild = null;
      const text = cleanGgufReply(promptStr, out);
      writeGgufDebug({
        at: new Date().toISOString(),
        ms: Date.now() - started,
        modelId,
        gguf: path.basename(gguf),
        code,
        cancelled: Boolean(cancelRequested),
        outLen: out.length,
        cleanedLen: text.length,
        cleanedPreview: text.slice(0, 240),
        errTail: stripLlamaCliNoise(err).slice(-240),
      });
      if (cancelRequested) {
        resolve({
          ok: true,
          reply: text.slice(-6000) || '(stopped)',
          modelFile: path.basename(gguf),
          source: 'ark-gguf',
          streamed: Boolean(onChunk),
          cancelled: true,
        });
        return;
      }
      if (!text) {
        const errHint = stripLlamaCliNoise(err).slice(0, 240);
        reject(new Error(
          code
            ? `llama-cli exited ${code}${errHint ? `: ${errHint}` : ''}`
            : 'Empty GGUF response',
        ));
        return;
      }
      resolve({
        ok: true,
        reply: text.slice(-6000),
        modelFile: path.basename(gguf),
        source: 'ark-gguf',
        streamed: Boolean(onChunk),
      });
    });
  });
}

module.exports = {
  findGgufForModel,
  findLlamaBinary,
  listGgufFiles,
  runGguf,
  runGgufStream,
  cancelGguf,
  ensureLlamaBinary,
  findLlamaServer,
  warmServer,
  stopServer,
  getServerPort,
  getServerStatus,
  modelsDir,
  binDir,
  LLAMA_TAG,
  stripLlamaCliNoise,
};
