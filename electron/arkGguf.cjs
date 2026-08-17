/**
 * Optional GGUF runtime for ARK Engine.
 * Looks for *.gguf in the ARK models folder and a local llama binary
 * (ark-engine/bin/llama-cli). Can bootstrap llama.cpp release builds.
 */

const fs = require('fs');
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

function findLlamaBinary() {
  ensureDirs();
  const names = process.platform === 'win32'
    ? ['llama-cli.exe', 'llama.exe', 'main.exe']
    : ['llama-cli', 'main'];
  for (const name of names) {
    const full = path.join(binDir(), name);
    if (fs.existsSync(full)) return full;
  }
  // Shallow search one level under bin (extracted release folders)
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
  if (existing) return existing;

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

  const names = process.platform === 'win32'
    ? ['llama-cli.exe', 'llama.exe', 'main.exe']
    : ['llama-cli', 'main'];
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

function cancelGguf() {
  cancelRequested = true;
  if (activeChild) {
    try { activeChild.kill(); } catch { /* ignore */ }
    activeChild = null;
  }
  return { ok: true };
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

/**
 * Drop llama-cli banners, help text, paths, and perf footers so only the
 * model reply reaches chat. Never treat stderr dumps as assistant content.
 */
function stripLlamaCliNoise(text) {
  let t = String(text || '').replace(/\r\n/g, '\n');
  if (!t.trim()) return '';

  // Prefer the completion after a clear ARK: / Assistant: marker if present.
  const arkMark = t.match(/(?:^|\n)\s*(?:ARK|Assistant)\s*:\s*/i);
  if (arkMark && typeof arkMark.index === 'number') {
    const after = t.slice(arkMark.index + arkMark[0].length);
    // Avoid keeping a duplicated "ARK:" prefix
    t = after.replace(/^\s*ARK\s*:\s*/i, '');
  }

  const lines = t.split('\n');
  const kept = [];
  let sawCommands = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^available commands/i.test(trimmed)) {
      sawCommands = true;
      continue;
    }
    if (sawCommands && (/^\s*\/\w+/.test(trimmed) || trimmed === '')) {
      if (/^\s*\/\w+/.test(trimmed)) continue;
      // blank line after command list → resume keeping
      if (trimmed === '' && kept.length === 0) continue;
      sawCommands = false;
      continue;
    }
    sawCommands = false;
    if (NOISE_LINE.test(trimmed)) continue;
    // Absolute Windows/Unix model paths
    if (/^[A-Za-z]:\\.*\.gguf\b/i.test(trimmed) || /^\/.*\.gguf\b/i.test(trimmed)) continue;
    if (/ark-engine[\\/]+models/i.test(trimmed)) continue;
    // llama.cpp ASCII wordmark rows often contain only "llama" fragments with spaces
    if (/^[\s]*l[\s]*l[\s]*a[\s]*m[\s]*a/i.test(trimmed) && trimmed.length < 80) continue;
    kept.push(line);
  }

  t = kept.join('\n').trim();
  // Trailing interactive prompt / stats
  t = t.replace(/\n?\s*\[\s*Prompt:[^\]]*\]\s*$/i, '');
  t = t.replace(/\n?\s*>\s*$/g, '');
  return t.trim();
}

function cleanGgufReply(prompt, text) {
  const noNoise = stripLlamaCliNoise(text);
  return stripPromptEcho(prompt, noNoise);
}

/**
 * Stream llama-cli stdout as it arrives.
 * onChunk(textDelta) may be called many times; final resolve still returns full reply.
 */
function runGgufStream(modelId, prompt, onChunk, timeoutMs = 120000) {
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
      try { activeChild.kill(); } catch { /* ignore */ }
      activeChild = null;
    }

    const promptStr = String(prompt || '');
    // Keep flags conservative — unknown args dump "available commands" into the stream.
    const args = [
      '-m', gguf,
      '-p', promptStr,
      '-n', '384',
      '--temp', '0.7',
    ];
    const child = spawn(bin, args, { windowsHide: true });
    activeChild = child;
    let out = '';
    let err = '';
    let emitted = '';
    let echoSkipped = false;
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error('GGUF generation timed out'));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      const piece = d.toString();
      out += piece;
      if (typeof onChunk !== 'function') return;
      // Hold early output until we can strip banners + leading prompt echo.
      if (!echoSkipped) {
        const cleaned = cleanGgufReply(promptStr, out);
        if (cleaned.length < out.trim().length || out.length > promptStr.length + 16) {
          echoSkipped = true;
          emitted = cleaned;
          if (cleaned) {
            try { onChunk(cleaned); } catch { /* ignore */ }
          }
        }
        return;
      }
      const cleaned = cleanGgufReply(promptStr, out);
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
      if (activeChild === child) activeChild = null;
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (activeChild === child) activeChild = null;
      if (cancelRequested) {
        const partial = cleanGgufReply(promptStr, out).slice(-6000);
        resolve({
          ok: true,
          reply: partial || '(stopped)',
          modelFile: path.basename(gguf),
          source: 'ark-gguf',
          streamed: Boolean(onChunk),
          cancelled: true,
        });
        return;
      }
      // Never fall back to stderr — that is where llama.cpp prints banners/help.
      const text = cleanGgufReply(promptStr, out);
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
  modelsDir,
  binDir,
  LLAMA_TAG,
};
