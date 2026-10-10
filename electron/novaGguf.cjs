/**
 * Optional GGUF runtime for NOVA Engine.
 * Looks for *.gguf in the NOVA models folder and a local llama binary
 * (nova-engine/bin/llama-cli). Can bootstrap llama.cpp release builds.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { app } = require('electron');
const novaFetch = require('./novaFetch.cjs');
const novaPaths = require('./novaPaths.cjs');

/** Pinned llama.cpp release — CUDA when NVIDIA is present, else CPU. */
const LLAMA_TAG = 'b9992';

/** Keep in sync with src/lib/ggufContext.ts resolveGgufCtx. */
const GGUF_CTX_MAX = 65536;

function resolveGgufCtx(ramGb) {
  const g = Number(ramGb);
  const ram = Number.isFinite(g) && g > 0 ? g : 8;
  if (ram < 8) return 8192;
  if (ram < 12) return 16384;
  if (ram < 20) return 24576;
  if (ram < 28) return 32768;
  if (ram < 40) return 49152;
  return GGUF_CTX_MAX;
}

function installedRamGb() {
  return os.totalmem() / (1024 * 1024 * 1024);
}

let cachedGgufCtx = null;

/** RAM-scaled llama.cpp context size for this machine. */
function getGgufCtx() {
  if (cachedGgufCtx != null) return cachedGgufCtx;
  cachedGgufCtx = resolveGgufCtx(installedRamGb());
  return cachedGgufCtx;
}

/**
 * Cap llama threads so local inference cannot pin every logical core
 * (that freezes YouTube / the desktop while chat or create polish runs).
 * Leave UI headroom; scale the cap up on strong multi-core PCs.
 *
 * Hybrid use: CUDA builds still pass -ngl 99 (layers on GPU). Threads here
 * keep CPU + system RAM busy for prompt eval, batching, and any layers that
 * do not fit in VRAM — GPU is not the only worker.
 */
function getGgufThreads() {
  const n = Math.max(1, (os.cpus() || []).length || 1);
  const cuda = (() => {
    try { return Boolean(llamaLooksCuda()); } catch { return false; }
  })();
  // Leave more cores for Windows UI / Electron so create does not freeze the desktop.
  const leaveFree = cuda
    ? (n >= 16 ? 4 : n >= 8 ? 3 : 2)
    : (n >= 16 ? 4 : n >= 8 ? 2 : 1);
  const hardCap = cuda
    ? (n >= 16 ? 10 : n >= 8 ? 6 : 4)
    : (n >= 16 ? 8 : n >= 8 ? 6 : 4);
  return Math.max(2, Math.min(n - leaveFree, hardCap));
}

function lowerChildPriority(pid) {
  if (!pid) return;
  try {
    const levels = os.constants.priority;
    const cores = Math.max(1, (os.cpus() || []).length || 1);
    // Strong machines: BELOW_NORMAL (still yields to UI). Weak: LOWEST.
    const level = cores >= 8
      ? (levels.PRIORITY_BELOW_NORMAL ?? levels.PRIORITY_LOWEST)
      : (levels.PRIORITY_LOWEST ?? levels.PRIORITY_BELOW_NORMAL);
    if (level != null) os.setPriority(pid, level);
  } catch {
    /* ignore — some hosts disallow priority changes */
  }
}

function modelsDir() {
  return novaPaths.modelsDir();
}

function binDir() {
  return novaPaths.binDir();
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

function findMmprojForModel(modelId) {
  const rawId = String(modelId || '').replace(/^gguf:/, '');
  const exact = path.join(modelsDir(), `${rawId}-mmproj.gguf`);
  if (fs.existsSync(exact)) return exact;
  return null;
}

function hasVlBundle(modelId = 'qwen2-vl-7b') {
  return Boolean(findGgufForModel(modelId) && findMmprojForModel(modelId));
}

function normalizeVisionImages(images) {
  if (!Array.isArray(images)) return [];
  return images
    .map((img) => {
      const raw = String(img || '');
      const m = raw.match(/^data:image\/[a-zA-Z0-9.+-]+;base64,(.+)$/);
      return m ? m[1] : raw.replace(/\s/g, '');
    })
    .filter(Boolean);
}

function writeTempVisionImages(b64List) {
  const paths = [];
  for (let i = 0; i < b64List.length; i++) {
    const buf = Buffer.from(b64List[i], 'base64');
    // Sniff real format — never force .png on JPEG bytes (breaks llama --image decode).
    let ext = 'png';
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) ext = 'jpg';
    else if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
      && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) ext = 'webp';
    else if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) ext = 'gif';
    const p = path.join(os.tmpdir(), `NOVA-vl-${process.pid}-${Date.now()}-${i}.${ext}`);
    fs.writeFileSync(p, buf);
    paths.push(p);
  }
  return paths;
}

/** llama.cpp multimodal: image_data alone is ignored unless the prompt references [img-N]. */
function withVisionImageMarkers(prompt, imageCount) {
  const n = Math.max(0, Number(imageCount) || 0);
  if (n <= 0) return String(prompt || '');
  const body = String(prompt || '');
  if (/\[img-\d+\]|<image>/i.test(body)) return body;
  const markers = Array.from({ length: n }, (_, i) => `[img-${i}]`).join('');
  return `${markers}\n${body}`;
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

function vlCliNames() {
  return process.platform === 'win32'
    ? ['llama-qwen2vl-cli.exe', 'llama-mtmd-cli.exe', 'llama-cli.exe']
    : ['llama-qwen2vl-cli', 'llama-mtmd-cli', 'llama-cli'];
}

function serverNames() {
  return process.platform === 'win32' ? ['llama-server.exe'] : ['llama-server'];
}

function findLlamaBinary() {
  return findNamedBinary(cliNames());
}

/** Prefer Qwen2-VL / mtmd CLIs when a vision projector is in play. */
function findLlamaVlBinary() {
  return findNamedBinary(vlCliNames()) || findLlamaBinary();
}

/** Cache resolved llama-server path so cold create doesn't re-walk + copyFileSync every bind. */
let _llamaServerPathCache = '';

function findLlamaServer() {
  if (_llamaServerPathCache && fs.existsSync(_llamaServerPathCache)) {
    return _llamaServerPathCache;
  }
  const existing = findNamedBinary(serverNames());
  if (existing) {
    _llamaServerPathCache = existing;
    return existing;
  }
  try {
    const leftover = path.join(binDir(), `_extract_${LLAMA_TAG}`);
    const found = findFileRecursive(leftover, serverNames())
      || findFileRecursive(binDir(), serverNames());
    if (found) {
      const dest = path.join(binDir(), process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');
      if (path.resolve(found) !== path.resolve(dest)) fs.copyFileSync(found, dest);
      try { fs.chmodSync(dest, 0o755); } catch { /* ignore */ }
      _llamaServerPathCache = dest;
      return dest;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Short TTL cache — getStatus() used to readdir+stat the models folder 3× per poll. */
let _ggufListCache = { at: 0, dir: '', files: [] };
const GGUF_LIST_TTL_MS = 4000;

function listGgufFiles(force = false) {
  const dir = modelsDir();
  const now = Date.now();
  if (
    !force
    && _ggufListCache.dir === dir
    && (now - _ggufListCache.at) < GGUF_LIST_TTL_MS
    && Array.isArray(_ggufListCache.files)
  ) {
    return _ggufListCache.files;
  }
  if (!fs.existsSync(dir)) {
    _ggufListCache = { at: now, dir, files: [] };
    return [];
  }
  const files = fs.readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.gguf'))
    .map((f) => ({
      file: f,
      path: path.join(dir, f),
      sizeMb: Math.round(fs.statSync(path.join(dir, f)).size / (1024 * 1024)),
    }));
  _ggufListCache = { at: now, dir, files };
  return files;
}

function llamaCpuUrl() {
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

function llamaCudaCandidateUrls() {
  if (process.platform !== 'win32' || process.arch === 'arm64') return [];
  const tag = LLAMA_TAG;
  const cuda124 = `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/llama-${tag}-bin-win-cuda-12.4-x64.zip`;
  const cuda133 = `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/llama-${tag}-bin-win-cuda-13.3-x64.zip`;
  // Prefer the CUDA major that already matches installed toolkit DLLs when present.
  if (fs.existsSync(path.join(binDir(), 'cublas64_13.dll')) || fs.existsSync(path.join(binDir(), 'cudart64_13.dll'))) {
    return [cuda133, cuda124];
  }
  return [cuda124, cuda133];
}

function llamaCudaRuntimeUrl(cudaVer) {
  const tag = LLAMA_TAG;
  return `https://github.com/ggml-org/llama.cpp/releases/download/${tag}/cudart-llama-bin-win-cuda-${cudaVer}-x64.zip`;
}

async function mergeCudaRuntimeDlls(cudaVer, onProgress) {
  if (process.platform !== 'win32' || !cudaVer) return;
  const url = llamaCudaRuntimeUrl(cudaVer);
  const archivePath = path.join(binDir(), path.basename(new URL(url).pathname));
  const extractDir = path.join(binDir(), `_extract_cudart_${cudaVer}`);
  try {
    await novaFetch.downloadToFile(url, archivePath, (pct) => {
      if (onProgress) onProgress(Math.min(97, 90 + Math.round(pct * 0.07)));
    });
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    await extractArchive(archivePath, extractDir);
    const stack = [extractDir];
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
        else if (/\.dll$/i.test(e.name)) {
          fs.copyFileSync(full, path.join(binDir(), e.name));
        }
      }
    }
  } catch {
    /* CUDA toolkit on the machine can still satisfy the DLLs */
  }
  try { if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath); } catch { /* ignore */ }
  try { if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

async function llamaDownloadUrls() {
  const cpu = llamaCpuUrl();
  try {
    const novaSystem = require('./novaSystem.cjs');
    const info = await novaSystem.probeSystemInfo();
    if (info && info.acceleration === 'CUDA') {
      return [...llamaCudaCandidateUrls(), cpu];
    }
  } catch {
    /* CPU build is always valid */
  }
  return [cpu];
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
    let size = 0;
    try {
      size = fs.statSync(archivePath).size;
    } catch {
      reject(new Error(`Archive missing before extract: ${archivePath}`));
      return;
    }
    if (size < 1024) {
      reject(new Error(`Archive too small (${size} bytes) — download likely incomplete: ${path.basename(archivePath)}`));
      return;
    }
    if (process.platform === 'win32' && archivePath.toLowerCase().endsWith('.zip')) {
      // Prefer tar.exe (ships with Windows 10+) — Expand-Archive is slow and races badly
      // when two installs share the same zip path.
      execFile(
        'tar.exe',
        ['-xf', archivePath, '-C', destDir],
        { windowsHide: true },
        (tarErr) => {
          if (!tarErr) {
            resolve();
            return;
          }
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
        },
      );
      return;
    }
    // tar handles .tar.gz and often .zip on modern macOS/Linux
    execFile('tar', ['-xf', archivePath, '-C', destDir], (err) => (err ? reject(err) : resolve()));
  });
}

/** Serialize llama installs so concurrent model downloads cannot delete each other's zip mid-extract. */
let llamaInstallChain = Promise.resolve();

function withLlamaInstallLock(fn) {
  const next = llamaInstallChain.then(fn, fn);
  llamaInstallChain = next.then(() => undefined, () => undefined);
  return next;
}

/**
 * Download + install llama-cli into nova-engine/bin if missing.
 * NVIDIA PCs prefer CUDA on first install, and retry CUDA once if only a CPU binary exists.
 * @param {(pct: number) => void} [onProgress]
 */
function llamaLooksCuda() {
  if (process.platform !== 'win32') return false;
  return ['ggml-cuda.dll', 'cublas64_12.dll', 'cublas64_13.dll'].some(n =>
    fs.existsSync(path.join(binDir(), n)),
  );
}

function flavorPath() {
  return path.join(binDir(), 'runtime-flavor.txt');
}

function cudaAttemptPath() {
  return path.join(binDir(), `cuda-attempt-${LLAMA_TAG}.txt`);
}

function readRuntimeFlavor() {
  try {
    if (fs.existsSync(flavorPath())) return String(fs.readFileSync(flavorPath(), 'utf8')).trim();
  } catch {
    /* ignore */
  }
  if (llamaLooksCuda()) return 'cuda';
  return findLlamaBinary() ? 'cpu' : null;
}

function writeRuntimeFlavor(kind) {
  try {
    fs.writeFileSync(flavorPath(), kind);
  } catch {
    /* ignore */
  }
}

async function nvidiaWantsCuda() {
  if (process.platform !== 'win32' || process.arch === 'arm64') return false;
  try {
    const novaSystem = require('./novaSystem.cjs');
    const info = await novaSystem.probeSystemInfo();
    return Boolean(info && info.acceleration === 'CUDA');
  } catch {
    return false;
  }
}

async function ensureLlamaBinary(onProgress, forceCudaUpgrade) {
  return withLlamaInstallLock(() => ensureLlamaBinaryLocked(onProgress, forceCudaUpgrade));
}

async function ensureLlamaBinaryLocked(onProgress, forceCudaUpgrade) {
  const existing = findLlamaBinary();
  const flavor = readRuntimeFlavor();
  const wantCuda = await nvidiaWantsCuda();

  if (existing && (flavor === 'cuda' || llamaLooksCuda()) && !forceCudaUpgrade) {
    writeRuntimeFlavor('cuda');
    findLlamaServer();
    return existing;
  }

  if (existing && !forceCudaUpgrade && !wantCuda) {
    findLlamaServer();
    return existing;
  }

  if (existing && wantCuda && !forceCudaUpgrade) {
    if (!fs.existsSync(cudaAttemptPath())) {
      try { fs.writeFileSync(cudaAttemptPath(), '1'); } catch { /* ignore */ }
      // Background upgrade must not share the caller's progress/error channel.
      void ensureLlamaBinary(undefined, true).catch(() => undefined);
    }
    findLlamaServer();
    return existing;
  }

  if (forceCudaUpgrade) {
    try { stopServer(); } catch { /* ignore */ }
  }

  ensureDirs();
  const urls = await llamaDownloadUrls();
  const extractDir = path.join(binDir(), `_extract_${LLAMA_TAG}`);
  let archivePath = '';
  let downloaded = false;
  let lastErr = new Error(`LLAMA release ${LLAMA_TAG} not found`);

  if (onProgress) onProgress(2);
  for (const url of urls) {
    const archiveName = path.basename(new URL(url).pathname);
    archivePath = path.join(binDir(), archiveName);
    try {
      await novaFetch.downloadToFile(url, archivePath, (pct) => {
        if (onProgress) onProgress(Math.min(85, Math.round(pct * 0.85)));
      });
      if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size < 1024) {
        throw new Error(`Download produced empty archive (${archiveName})`);
      }
      downloaded = true;
      break;
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      try { if (fs.existsSync(archivePath)) fs.unlinkSync(archivePath); } catch { /* ignore */ }
    }
  }
  if (!downloaded) {
    if (existing) {
      findLlamaServer();
      return existing;
    }
    const msg = lastErr.message || String(lastErr);
    if (/404|\(404\)/.test(msg)) {
      throw new Error(`LLAMA release ${LLAMA_TAG} not found — check network or update LLAMA_TAG in novaGguf.cjs`);
    }
    throw lastErr;
  }

  try {
    if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  if (onProgress) onProgress(88);
  try {
    await extractArchive(archivePath, extractDir);
  } catch (err) {
    if (existing) {
      findLlamaServer();
      return existing;
    }
    throw err;
  }

  const names = cliNames();
  const found = findFileRecursive(extractDir, names);
  if (!found) {
    if (existing) {
      findLlamaServer();
      return existing;
    }
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

  const cudaVer = path.basename(archivePath).match(/cuda-(\d+\.\d+)/i);
  if (cudaVer) {
    if (onProgress) onProgress(90);
    await mergeCudaRuntimeDlls(cudaVer[1], onProgress);
  }

  try {
    fs.unlinkSync(archivePath);
  } catch {
    /* ignore */
  }

  if (onProgress) onProgress(100);
  const bin = findLlamaBinary();
  if (!bin) throw new Error('llama-cli install finished but binary not found');
  writeRuntimeFlavor(cudaVer ? 'cuda' : 'cpu');
  return bin;
}

function runGguf(modelId, prompt, timeoutMs = 240000) {
  return runGgufStream(modelId, prompt, null, timeoutMs);
}

/** Active llama-cli child — cancelled via cancelGguf(). */
let activeChild = null;
/** True while llama-server or CLI stream is in flight. */
let generateBusy = false;
let cancelRequested = false;
let activeAbort = null;
/** @type {string | null} */
let activeJobId = null;
/**
 * Per-job cancel handles so Stop on chat A does not need a global-only kill.
 * @type {Map<string, { child: import('child_process').ChildProcess | null, abort: AbortController | null, chatId?: string }>}
 */
const jobsById = new Map();
/** @type {Map<string, string>} chatId → jobId */
const chatToJob = new Map();

function registerGgufJob(opts = {}) {
  const chatId = opts.chatId != null ? String(opts.chatId).trim() : '';
  const jobId = String(opts.jobId || '').trim()
    || (chatId ? `chat-${chatId}` : '')
    || `gguf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry = { child: null, abort: null, chatId: chatId || undefined };
  jobsById.set(jobId, entry);
  if (chatId) chatToJob.set(chatId, jobId);
  activeJobId = jobId;
  return { jobId, entry };
}

function clearGgufJob(jobId) {
  const id = String(jobId || '').trim();
  if (!id) return;
  const entry = jobsById.get(id);
  if (entry?.chatId) chatToJob.delete(entry.chatId);
  jobsById.delete(id);
  if (activeJobId === id) activeJobId = null;
}

let serverChild = null;
let serverGguf = null;
let serverMmproj = null;
let serverCtx = 0;
const SERVER_PORT_BASE = require('./novaConfig.cjs').GGUF_SERVER_PORT_BASE;
const SERVER_PORT_MAX = SERVER_PORT_BASE + require('./novaConfig.cjs').GGUF_SERVER_PORT_MAX_TRIES;
let serverPort = SERVER_PORT_BASE;
// Context size is RAM-scaled via getGgufCtx() — not a fixed constant.

let lastServerError = null;

function getServerPort() {
  return serverPort;
}

function isGenerateBusy() {
  return Boolean(generateBusy || activeChild || activeAbort);
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

function cancelGguf(jobIdOrOpts) {
  let targetId = '';
  let scopedChatMiss = false;
  if (typeof jobIdOrOpts === 'string') {
    targetId = jobIdOrOpts.trim();
  } else if (jobIdOrOpts && typeof jobIdOrOpts === 'object') {
    const jid = String(jobIdOrOpts.jobId || '').trim();
    const cid = String(jobIdOrOpts.chatId || '').trim();
    if (jid) {
      targetId = jid;
    } else if (cid) {
      targetId = chatToJob.get(cid) || '';
      // Explicit chat-scoped Stop with no job yet — never kill another chat.
      if (!targetId) scopedChatMiss = true;
    }
  }

  // Chat-scoped Stop before job registered: still kill active generation if busy.
  if (scopedChatMiss) {
    if (generateBusy || activeChild || activeAbort) {
      cancelRequested = true;
      try { activeAbort?.abort(); } catch { /* ignore */ }
      activeAbort = null;
      if (activeChild) {
        killLlamaChild(activeChild);
        activeChild = null;
      }
      generateBusy = false;
      return { ok: true, cancelled: true };
    }
    return { ok: true, cancelled: false };
  }

  // No id → cancel active job (legacy Stop / single-flight).
  if (!targetId) {
    targetId = activeJobId || '';
    cancelRequested = true;
    try { activeAbort?.abort(); } catch { /* ignore */ }
    activeAbort = null;
    if (activeChild) {
      killLlamaChild(activeChild);
      activeChild = null;
    }
    if (targetId) {
      const entry = jobsById.get(targetId);
      if (entry) {
        try { entry.abort?.abort(); } catch { /* ignore */ }
        if (entry.child) killLlamaChild(entry.child);
        clearGgufJob(targetId);
      }
    } else {
      for (const [id, entry] of [...jobsById.entries()]) {
        try { entry.abort?.abort(); } catch { /* ignore */ }
        if (entry.child) killLlamaChild(entry.child);
        clearGgufJob(id);
      }
    }
    generateBusy = false;
    return { ok: true, cancelled: true };
  }

  const entry = jobsById.get(targetId);
  if (!entry) {
    // Unknown / already finished — do not kill a different chat's job.
    return { ok: true, cancelled: false };
  }

  const isActive = activeJobId === targetId;
  if (isActive) cancelRequested = true;
  try { entry.abort?.abort(); } catch { /* ignore */ }
  if (entry.child) killLlamaChild(entry.child);
  if (isActive) {
    if (activeAbort === entry.abort) activeAbort = null;
    if (activeChild === entry.child) activeChild = null;
    // Always free the lock — Stop used to leave generateBusy=true while bindLlamaServer
    // kept waiting, so every later chat sat on Thinking… forever with no llama process.
    generateBusy = false;
  }
  clearGgufJob(targetId);
  return { ok: true, cancelled: true };
}

function stopServer() {
  if (serverChild) {
    killLlamaChild(serverChild);
    serverChild = null;
    serverGguf = null;
    serverMmproj = null;
    serverCtx = 0;
  }
}

/** Kill every GGUF child (CLI + server) — app quit / reload. */
function stopAllGguf() {
  cancelRequested = true;
  try { activeAbort?.abort(); } catch { /* ignore */ }
  activeAbort = null;
  if (activeChild) {
    killLlamaChild(activeChild);
    activeChild = null;
  }
  for (const [id, entry] of [...jobsById.entries()]) {
    try { entry.abort?.abort(); } catch { /* ignore */ }
    if (entry.child) killLlamaChild(entry.child);
    clearGgufJob(id);
  }
  generateBusy = false;
  stopServer();
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

async function bindLlamaServer(bin, gguf, modelId) {
  lastServerError = null;
  const mmproj = findMmprojForModel(modelId);
  // Item 14: stick to a healthy server for the same GGUF — avoid multi-second reload churn.
  if (
    serverChild
    && serverGguf === gguf
    && serverMmproj === mmproj
    && serverCtx === getGgufCtx()
    && !serverChild.killed
    && await pingServer(serverPort)
  ) {
    return true;
  }
  for (let candidate = SERVER_PORT_BASE; candidate < SERVER_PORT_MAX; candidate += 1) {
    stopServer();
    const args = [
      '-m', gguf,
      '--host', '127.0.0.1',
      '--port', String(candidate),
      '-c', String(getGgufCtx()),
      '-t', String(getGgufThreads()),
      '--parallel', '1',
    ];
    // Offload layers to GPU when CUDA llama-server is present — cuts mid-reply freezes on 7B/14B.
    if (llamaLooksCuda()) args.push('-ngl', '99');
    if (mmproj) args.push('--mmproj', mmproj);
    const child = spawn(bin, args, { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    lowerChildPriority(child.pid);
    serverChild = child;
    serverGguf = gguf;
    serverMmproj = mmproj;
    serverCtx = getGgufCtx();
    serverPort = candidate;
    child.on('exit', () => {
      if (serverChild === child) {
        serverChild = null;
        serverGguf = null;
        serverMmproj = null;
        serverCtx = 0;
      }
    });
    // Large GGUFs (14B/32B) often need >20s to load into llama-server.
    const ggufMb = (() => {
      try { return Math.round(fs.statSync(gguf).size / (1024 * 1024)); } catch { return 0; }
    })();
    const bindWaitMs = ggufMb >= 12000 ? 180_000 : ggufMb >= 4000 ? 90_000 : 45_000;
    const deadline = Date.now() + bindWaitMs;
    while (Date.now() < deadline) {
      if (cancelRequested) {
        stopServer();
        return false;
      }
      if (child.killed || child.exitCode != null) break;
      if (await pingServer(candidate)) return true;
      await wait(250);
    }
    stopServer();
    if (cancelRequested) return false;
  }
  lastServerError = 'llama-server failed to start — NOVA will use one-shot CLI instead';
  return false;
}

/**
 * Keep llama-server loaded so follow-up chats skip the 8–12s model reload.
 */
async function ensureLlamaServer(modelId) {
  const gguf = findGgufForModel(modelId);
  const mmproj = findMmprojForModel(modelId);
  const bin = findLlamaServer();
  if (!gguf || !bin) return false;
  if (
    serverChild
    && serverGguf === gguf
    && serverMmproj === mmproj
    && serverCtx === getGgufCtx()
    && !serverChild.killed
    && await pingServer()
  ) {
    return true;
  }
  return bindLlamaServer(bin, gguf, modelId);
}

async function warmServer(modelId) {
  try {
    await ensureLlamaServer(modelId);
  } catch {
    /* warmup is best-effort */
  }
}

async function runGgufServerStream(modelId, prompt, onChunk, timeoutMs, nPredict = 4096, temperature = 0.55, visionImages = [], jobEntry = null, kind = null) {
  const images = normalizeVisionImages(visionImages);
  const promptStr = wrapChatPrompt(modelId, withVisionImageMarkers(prompt, images.length), kind);
  const started = Date.now();
  cancelRequested = false;
  const ac = new AbortController();
  activeAbort = ac;
  if (jobEntry) jobEntry.abort = ac;
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let out = '';
  try {
    const body = {
      prompt: promptStr,
      n_predict: nPredict,
      temperature,
      stream: true,
      cache_prompt: true,
      // Coding / @@@FILE: marker-only stops. English phrase stops ("If you want to", "Notes:")
      // cut legitimate landing-page copy mid-file — never use them for coding turns.
      stop: (kind === 'coding' || /\b@@@FILE\b/i.test(String(prompt || '')))
        ? ['// STRESS_END_MARKER_OK']
        : [stopToken(modelId)],
    };
    if (images.length) {
      body.image_data = images.map((data, id) => ({ data, id }));
    }
    const res = await fetch(`http://127.0.0.1:${serverPort}/completion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    if (!res.ok || !res.body) throw new Error(`llama-server ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let emitted = '';
    while (true) {
      if (cancelRequested) break;
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
      // Stream raw content pieces — clean once at close (not per chunk on main).
      if (typeof onChunk === 'function') {
        const rawLen = out.length;
        if (rawLen > emitted.length) {
          const delta = out.slice(emitted.length);
          emitted = out;
          if (delta) {
            try { onChunk(delta); } catch { /* ignore */ }
          }
        }
      }
    }
    const text = restoreCodingPrefill(kind, prompt, cleanGgufReply(promptStr, out), modelId);
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
      // Full reply — never truncate to last 6k (that cut craft @@@FILE bodies mid-file).
      reply: text || (cancelRequested ? '(stopped)' : ''),
      modelFile: path.basename(findGgufForModel(modelId) || ''),
      source: 'nova-gguf',
      streamed: Boolean(onChunk),
      cancelled: Boolean(cancelRequested),
    };
  } finally {
    clearTimeout(timer);
    if (activeAbort === ac) activeAbort = null;
    if (jobEntry && jobEntry.abort === ac) jobEntry.abort = null;
  }
}

const NOVA_SYSTEM =
  'You are NOVA, a helpful AI chat assistant on the user’s PC. Stay in chat mode unless they ask to build, edit, or create something. '
  + 'If someone asks what NOVA is, who you are, or what this app does: say you are NOVA, an AI creation studio that runs on their PC for chat, projects, and models. '
  + 'The product name is NOVA. Never call yourself by any other product name. '
  + 'Never echo the user’s greeting. If they only say hi/hello/hey, greet them briefly in your own words (one short sentence). Do not paste a fixed script. Do not list capabilities unless they ask. '
  + 'Never reply with “Hello! How can I assist you today?” after a real product or feature message — answer THAT ask. '
  + 'Talk like a co-builder: prefer “we can build…”, “we’ll add…”. Never lecture with “you can use React Native / you should implement this yourself”. '
  + 'If they describe a problem (losing track of stalls, inventory, etc.): acknowledge it, suggest a practical plan, ask clarifying questions. '
  + 'Do NOT push Vite/React setup, folder paths, or “proceed with creating this page” until they clearly say build or create. '
  + 'For product ideas before a build ask: describe screens and flows in plain language only. Do not pitch React Native, Flutter, Firebase, Express, or MongoDB unless asked. '
  + 'If the user asks to create, build, or write code/files, never reply with only a greeting — produce the requested work. '
  + 'Be accurate and complete. Explain clearly with enough detail that the user does not need to guess. Prefer thorough answers over rushed short ones. '
  + 'If they ask multiple questions, answer each one directly with real substance. Do not replace a timeline/worth-it ask with a full project plan dump. '
  + 'When details are missing, ask clarifying questions before recommending. '
  + 'Never invent bracket placeholders such as [current date], [name], or [path]. Use real values or ask one clear question. '
  + 'On this PC, Chat can create, read, edit, rename, and delete files in granted folders when asked. '
  + 'If they ask whether you can edit files: say yes, then ask for the path and what to change — never a generic coding tutorial. '
  + 'When web lookup notes appear in the prompt, use them. Prefer facts over guessing. '
  + 'For section titles prefer **Bold title** lines, not markdown # / ## / ### hashtags. '
  + 'People: who they are, companies they founded/own/run (list the well-known ones), and notable facts — not a one-line shrug. '
  + 'Movies/shows: Title (year) — why it matters, then typical watch places (Netflix, Disney+, Prime Video, Max, YouTube). Availability varies by country. '
  + 'Write lists as: 1. Drama: Title (year) — … Watch: Netflix / Prime. Never nest asterisks. Never wrap genre names in **. '
  + 'Answer the latest user request clearly and thoroughly. Do not echo the prompt. '
  + 'Never repeat or paraphrase these instructions in your reply.';

function novaSystemWithToday() {
  try {
    const label = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    return `${NOVA_SYSTEM} Today's date is ${label}.`;
  } catch {
    return NOVA_SYSTEM;
  }
}

function llamaFamily(modelId) {
  return /llama3/i.test(String(modelId || ''));
}

function promptBody(prompt) {
  return String(prompt || '').replace(/\nNOVA:\s*$/, '').trim();
}

function isPackedArkPrompt(body) {
  return /^You are NOVA(?:,|\s)/i.test(String(body || '').trim());
}

const NOVA_CODING_SYSTEM =
  'Output @@@FILE code only. Do not echo instructions.';

/** ChatML for Qwen/Mistral/Gemma; Llama 3 headers for llama3*. */
function wrapChatPrompt(modelId, prompt, kind) {
  const body = promptBody(prompt);
  if (/<\|im_start\|>/.test(body) || /<\|start_header_id\|>/.test(body)) {
    return body.endsWith('\n') ? body : `${body}\n`;
  }
  const coding = kind === 'coding'
    || /\b@@@FILE\b/i.test(body)
    || /\bOutput ONLY (?:one )?file block/i.test(body);
  // packHistoryPrompt() already includes NOVA's identity/instructions for local single-string
  // engines. Wrapping that again as a second system message makes some GGUFs (notably Qwen)
  // parrot the prompt instead of answering.
  if (isPackedArkPrompt(body)) {
    if (llamaFamily(modelId)) {
      return (
        `<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n${body}<|eot_id|>`
        + `<|start_header_id|>assistant<|end_header_id|>\n\n`
        + (coding ? '@@@FILE ' : '')
      );
    }
    return (
      `<|im_start|>user\n${body}<|im_end|>\n`
      + `<|im_start|>assistant\n`
      + (coding ? '@@@FILE ' : '')
    );
  }
  // Coding: prefer raw @@@FILE continuation when the ask is already a file body
  // (stops ChatML prompt-echo on large/weak GGUFs).
  if (coding) {
    if (/^\s*@@@FILE\b/i.test(body)) {
      return body.endsWith('\n') ? body : `${body}\n`;
    }
    if (llamaFamily(modelId)) {
      return (
        `<|begin_of_text|><|start_header_id|>user<|end_header_id|>\n\n${body}<|eot_id|>`
        + `<|start_header_id|>assistant<|end_header_id|>\n\n@@@FILE `
      );
    }
    return (
      `<|im_start|>user\n${body}<|im_end|>\n`
      + `<|im_start|>assistant\n@@@FILE `
    );
  }
  const system = novaSystemWithToday();
  if (llamaFamily(modelId)) {
    return (
      `<|begin_of_text|><|start_header_id|>system<|end_header_id|>\n\n${system}<|eot_id|>`
      + `<|start_header_id|>user<|end_header_id|>\n\n${body}<|eot_id|>`
      + `<|start_header_id|>assistant<|end_header_id|>\n\n`
    );
  }
  return (
    `<|im_start|>system\n${system}<|im_end|>\n`
    + `<|im_start|>user\n${body}<|im_end|>\n`
    + `<|im_start|>assistant\n`
  );
}

function stopToken(modelId) {
  return llamaFamily(modelId) ? '<|eot_id|>' : '<|im_end|>';
}

/** Prefill "@@@FILE " is consumed by the prompt and not re-emitted — restore for craft parsers. */
function restoreCodingPrefill(kind, prompt, text, modelId) {
  const raw = String(text || '');
  if (!raw) return raw;
  // Raw @@@FILE continuation prompts already include the header — don't double-prefix.
  if (/^\s*@@@FILE\b/i.test(String(prompt || ''))) {
    return raw;
  }
  const coding = kind === 'coding' || /\b@@@FILE\b/i.test(String(prompt || ''));
  if (!coding) return raw;
  if (/^\s*@@@FILE\b/i.test(raw)) return raw;
  return `@@@FILE ${raw}`;
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

  const markRe = /(?:^|\n)\s*(?:NOVA|Assistant)\s*:\s+(?!<\|)/gi;
  let lastMark = null;
  let mm;
  while ((mm = markRe.exec(t)) !== null) lastMark = mm;
  if (lastMark && typeof lastMark.index === 'number') {
    t = t.slice(lastMark.index + lastMark[0].length).replace(/^\s*NOVA\s*:\s*/i, '');
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
    if (/nova-engine[\\/]+models/i.test(trimmed)) continue;
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
    const file = path.join(app.getPath('userData'), 'nova-engine', 'last-gguf-chat.log');
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
function runGgufStream(modelId, prompt, onChunk, timeoutMs = 240000, nPredict = 4096, temperature = 0.55, extra = {}) {
  const visionImages = normalizeVisionImages(extra?.images);
  const kind = extra?.kind;
  if (generateBusy || activeChild) {
    try {
      const { BrowserWindow } = require('electron');
      for (const w of BrowserWindow.getAllWindows()) {
        w.webContents.send('NOVA:engine-queue', { queued: true, running: true, position: 1 });
      }
    } catch { /* ignore */ }
    const err = new Error(
      'Local brain is busy (loading a model or finishing another reply). Press Stop, wait a few seconds, then send again — do not start a second create while one is running.',
    );
    err.code = 'RATE_LIMITED';
    return Promise.reject(err);
  }
  generateBusy = true;
  try {
    const { BrowserWindow } = require('electron');
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send('NOVA:engine-queue', { queued: false, running: true, position: 0 });
    }
  } catch { /* ignore */ }
  cancelRequested = false;
  const { jobId, entry } = registerGgufJob({
    jobId: extra?.jobId,
    chatId: extra?.chatId,
  });
  return (async () => {
    try {
      // Vision: prefer dedicated qwen2vl/mtmd CLI — generic /completion often ignores pixels.
      const forceVlCli = visionImages.length > 0;
      if (!forceVlCli && await ensureLlamaServer(modelId)) {
        try {
          if (cancelRequested) {
            const stopped = new Error('Generation stopped');
            stopped.code = 'CANCELED';
            throw stopped;
          }
          const hit = await runGgufServerStream(modelId, prompt, onChunk, timeoutMs, nPredict, temperature, visionImages, entry, kind);
          if (hit?.cancelled) return hit;
          if (hit?.reply) return hit;
        } catch (err) {
          if (cancelRequested) {
            const stopped = new Error('Generation stopped');
            stopped.code = 'CANCELED';
            throw stopped;
          }
          /* fall through to one-shot llama-cli */
        }
      }
      if (cancelRequested) {
        const stopped = new Error('Generation stopped');
        stopped.code = 'CANCELED';
        throw stopped;
      }
      return await runGgufCliStream(modelId, prompt, onChunk, timeoutMs, nPredict, temperature, visionImages, entry, kind);
    } finally {
      generateBusy = false;
      clearGgufJob(jobId);
    }
  })();
}

function runGgufCliStream(modelId, prompt, onChunk, timeoutMs = 240000, nPredict = 4096, temperature = 0.55, visionImages = [], jobEntry = null, kind = null) {
  return new Promise((resolve, reject) => {
    const gguf = findGgufForModel(modelId);
    const mmproj = findMmprojForModel(modelId);
    const imagesEarly = normalizeVisionImages(visionImages);
    const bin = imagesEarly.length || mmproj ? findLlamaVlBinary() : findLlamaBinary();
    if (!gguf) {
      reject(new Error('No GGUF weights found in NOVA Engine models folder'));
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
      const err = new Error(
        'Local brain is busy (loading a model or finishing another reply). Press Stop, wait a few seconds, then send again.',
      );
      err.code = 'RATE_LIMITED';
      reject(err);
      return;
    }

    const promptStr = wrapChatPrompt(modelId, withVisionImageMarkers(prompt, normalizeVisionImages(visionImages).length), kind);
    const started = Date.now();
    const promptFile = path.join(os.tmpdir(), `nova-gguf-prompt-${process.pid}-${started}.txt`);
    try {
      fs.writeFileSync(promptFile, promptStr, 'utf8');
    } catch (err) {
      reject(err);
      return;
    }
    const images = normalizeVisionImages(visionImages);
    const tempImages = images.length ? writeTempVisionImages(images) : [];
    const args = [
      '-m', gguf,
      '-f', promptFile,
      '-n', String(nPredict),
      '-c', String(getGgufCtx()),
      '-t', String(getGgufThreads()),
      '--temp', String(temperature),
      '--no-conversation',
      '--single-turn',
      '--no-display-prompt',
      '--simple-io',
    ];
    if (mmproj) args.push('--mmproj', mmproj);
    for (const imgPath of tempImages) args.push('--image', imgPath);
    const child = spawn(bin, args, { windowsHide: true });
    lowerChildPriority(child.pid);
    try {
      child.stdin?.end();
    } catch {
      /* ignore */
    }
    activeChild = child;
    if (jobEntry) jobEntry.child = child;
    let out = '';
    let err = '';
    const cleanupPrompt = () => {
      try { fs.unlinkSync(promptFile); } catch { /* ignore */ }
      for (const p of tempImages) {
        try { fs.unlinkSync(p); } catch { /* ignore */ }
      }
    };
    const timer = setTimeout(() => {
      killLlamaChild(child);
      reject(new Error('GGUF generation timed out'));
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      const piece = d.toString();
      out += piece;
      // Stream raw deltas — full-buffer cleanGgufReply on every chunk is quadratic on main.
      // Final clean runs once on close below.
      if (typeof onChunk === 'function' && piece) {
        try { onChunk(piece); } catch { /* ignore */ }
      }
    });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => {
      clearTimeout(timer);
      cleanupPrompt();
      if (activeChild === child) activeChild = null;
      if (jobEntry && jobEntry.child === child) jobEntry.child = null;
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      cleanupPrompt();
      if (activeChild === child) activeChild = null;
      if (jobEntry && jobEntry.child === child) jobEntry.child = null;
      const text = restoreCodingPrefill(kind, prompt, cleanGgufReply(promptStr, out), modelId);
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
          reply: text || '(stopped)',
          modelFile: path.basename(gguf),
          source: 'nova-gguf',
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
        reply: text,
        modelFile: path.basename(gguf),
        source: 'nova-gguf',
        streamed: Boolean(onChunk),
        truncated: Boolean(nPredict && text.length > nPredict * 2),
      });
    });
  });
}

module.exports = {
  findGgufForModel,
  findMmprojForModel,
  hasVlBundle,
  findLlamaBinary,
  listGgufFiles,
  runGguf,
  runGgufStream,
  cancelGguf,
  ensureLlamaBinary,
  findLlamaServer,
  warmServer,
  stopServer,
  stopAllGguf,
  isGenerateBusy,
  getServerPort,
  getServerStatus,
  modelsDir,
  binDir,
  LLAMA_TAG,
  stripLlamaCliNoise,
  getGgufCtx,
  resolveGgufCtx,
  get GGUF_CTX() { return getGgufCtx(); },
};
