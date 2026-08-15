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

/** Pinned llama.cpp release — CPU builds for zero-key local chat. */
const LLAMA_TAG = 'b9992';

function modelsDir() {
  return path.join(app.getPath('userData'), 'ark-engine', 'models');
}

function binDir() {
  return path.join(app.getPath('userData'), 'ark-engine', 'bin');
}

function ensureDirs() {
  fs.mkdirSync(modelsDir(), { recursive: true });
  fs.mkdirSync(binDir(), { recursive: true });
}

function findGgufForModel(modelId) {
  const dir = modelsDir();
  if (!fs.existsSync(dir)) return null;
  const exact = path.join(dir, `${modelId}.gguf`);
  if (fs.existsSync(exact)) return exact;
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.gguf'));
  if (!files.length) return null;
  const needle = String(modelId).replace(/^gguf:/, '').replace(/-/g, '').toLowerCase().slice(0, 8);
  const match = files.find((f) => f.toLowerCase().replace(/-/g, '').includes(needle));
  return path.join(dir, match || files[0]);
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

    const args = [
      '-m', gguf,
      '-p', String(prompt || ''),
      '-n', '384',
      '--temp', '0.7',
      '-no-cnv',
    ];
    const child = spawn(bin, args, { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error('GGUF generation timed out'));
    }, timeoutMs);

    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = out.trim() || err.trim();
      if (!text) {
        reject(new Error(code ? `llama-cli exited ${code}` : 'Empty GGUF response'));
        return;
      }
      resolve({
        ok: true,
        reply: text.slice(-6000),
        modelFile: path.basename(gguf),
        source: 'ark-gguf',
      });
    });
  });
}

module.exports = {
  findGgufForModel,
  findLlamaBinary,
  listGgufFiles,
  runGguf,
  ensureLlamaBinary,
  modelsDir,
  binDir,
  LLAMA_TAG,
};
