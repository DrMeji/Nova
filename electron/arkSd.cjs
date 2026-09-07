/**
 * NOVA local image runtime — stable-diffusion.cpp (sd.exe) + on-disk weights.
 * Opt-in: install “Stable Diffusion 1.5 (Local)” from Local AI / Models.
 */

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { URL } = require('url');
const arkFetch = require('./arkFetch.cjs');
const arkPaths = require('./arkPaths.cjs');

/** Pinned sd.cpp Windows/Linux CPU build. */
const SD_TAG = 'master-656-0e4ee04';
const SD_COMMIT = '0e4ee04';

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
      reject(new Error(`Archive too small (${size} bytes) — download likely incomplete`));
      return;
    }
    if (process.platform === 'win32' && archivePath.toLowerCase().endsWith('.zip')) {
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
    execFile('tar', ['-xf', archivePath, '-C', destDir], (err) => (err ? reject(err) : resolve()));
  });
}

function sdReleaseUrl() {
  if (process.platform === 'win32') {
    return `https://github.com/leejet/stable-diffusion.cpp/releases/download/${SD_TAG}/sd-master-${SD_COMMIT}-bin-win-avx2-x64.zip`;
  }
  if (process.platform === 'darwin') {
    return `https://github.com/leejet/stable-diffusion.cpp/releases/download/${SD_TAG}/sd-master-${SD_COMMIT}-bin-Darwin-macOS-15.7.7-arm64.zip`;
  }
  return `https://github.com/leejet/stable-diffusion.cpp/releases/download/${SD_TAG}/sd-master-${SD_COMMIT}-bin-Linux-Ubuntu-24.04-x86_64.zip`;
}

function sdBinaryNames() {
  // Newer stable-diffusion.cpp Windows builds ship sd-cli.exe (not sd.exe).
  return process.platform === 'win32'
    ? ['sd.exe', 'sd-cli.exe']
    : ['sd', 'sd-cli'];
}

function findSdBinary() {
  ensureDirs();
  const names = sdBinaryNames();
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
  // Recover a prior extract that left sd-cli.exe under _extract_sd_*
  try {
    const leftover = findFileRecursive(binDir(), names);
    if (leftover) {
      const dest = path.join(binDir(), process.platform === 'win32' ? 'sd.exe' : 'sd');
      if (path.resolve(leftover) !== path.resolve(dest)) fs.copyFileSync(leftover, dest);
      try { fs.chmodSync(dest, 0o755); } catch { /* ignore */ }
      try {
        const srcDir = path.dirname(leftover);
        for (const f of fs.readdirSync(srcDir)) {
          if (/\.(dll|dylib|so(\.\d+)?)$/i.test(f)) {
            fs.copyFileSync(path.join(srcDir, f), path.join(binDir(), f));
          }
        }
      } catch {
        /* ignore */
      }
      return dest;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {(pct: number) => void} [onProgress]
 */
async function ensureSdBinary(onProgress) {
  const existing = findSdBinary();
  if (existing) return existing;

  ensureDirs();
  const url = sdReleaseUrl();
  const archiveName = path.basename(new URL(url).pathname);
  const archivePath = path.join(binDir(), archiveName);
  const extractDir = path.join(binDir(), `_extract_sd_${SD_COMMIT}`);

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

  const names = sdBinaryNames();
  const found = findFileRecursive(extractDir, names);
  if (!found) throw new Error('sd binary not found inside release archive');

  const destName = process.platform === 'win32' ? 'sd.exe' : 'sd';
  const dest = path.join(binDir(), destName);
  fs.copyFileSync(found, dest);
  try {
    fs.chmodSync(dest, 0o755);
  } catch {
    /* ignore */
  }

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
  const bin = findSdBinary();
  if (!bin) throw new Error('sd install finished but binary not found');
  return bin;
}

function weightsPathForId(id) {
  const base = String(id || '').replace(/^gguf:/, '');
  const candidates = [
    path.join(modelsDir(), `${base}.safetensors`),
    path.join(modelsDir(), `${base}.ckpt`),
    path.join(modelsDir(), `${base}.gguf`),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 50 * 1024 * 1024) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function fluxPaths() {
  const dir = modelsDir();
  return {
    diffusion: path.join(dir, 'flux-schnell-local.gguf'),
    vae: path.join(dir, 'flux-vae.safetensors'),
    clipL: path.join(dir, 'flux-clip_l.safetensors'),
    t5: path.join(dir, 'flux-t5xxl.safetensors'),
  };
}

function fileOk(p, minMb = 1) {
  try {
    return fs.existsSync(p) && fs.statSync(p).size > minMb * 1024 * 1024;
  } catch {
    return false;
  }
}

function hasFluxBundle() {
  const p = fluxPaths();
  return fileOk(p.diffusion, 500) && fileOk(p.vae, 50) && fileOk(p.clipL, 50) && fileOk(p.t5, 500);
}

function fluxDiffusionPath() {
  return hasFluxBundle() ? fluxPaths().diffusion : null;
}

function hasLocalImageModel(id = 'sd15-local') {
  if (id === 'flux-schnell-local') return hasFluxBundle() && Boolean(findSdBinary());
  return Boolean(weightsPathForId(id) && findSdBinary());
}

function isLocalImageReady() {
  if (!findSdBinary()) return false;
  if (hasFluxBundle()) return true;
  const ids = ['sdxl-turbo-local', 'sd15-local'];
  for (const id of ids) {
    if (weightsPathForId(id)) return true;
  }
  try {
    return fs.readdirSync(modelsDir()).some((f) => {
      const lower = f.toLowerCase();
      if (!/\.(safetensors|ckpt)$/.test(lower)) return false;
      try {
        return fs.statSync(path.join(modelsDir(), f)).size > 50 * 1024 * 1024;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

function resolveAnyImageWeights() {
  if (hasFluxBundle()) return { path: fluxPaths().diffusion, id: 'flux-schnell-local', flux: true };
  for (const id of ['sdxl-turbo-local', 'sd15-local']) {
    const preferred = weightsPathForId(id);
    if (preferred) return { path: preferred, id };
  }
  try {
    const files = fs.readdirSync(modelsDir()).filter((f) => /\.(safetensors|ckpt)$/i.test(f));
    for (const f of files) {
      const full = path.join(modelsDir(), f);
      try {
        if (fs.statSync(full).size > 50 * 1024 * 1024) {
          return { path: full, id: f.replace(/\.(safetensors|ckpt)$/i, '') };
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Run local txt2img. Returns { buf, ext, source } or null.
 * @param {string} prompt
 * @param {{ width?: number, height?: number, steps?: number, timeoutMs?: number, modelId?: string }} [opts]
 */
async function generateLocalImage(prompt, opts = {}) {
  let resolved;
  if (opts.modelId === 'flux-schnell-local' || (!opts.modelId && hasFluxBundle())) {
    if (!hasFluxBundle()) return null;
    resolved = { path: fluxPaths().diffusion, id: 'flux-schnell-local', flux: true };
  } else {
    resolved = opts.modelId
      ? (weightsPathForId(opts.modelId) ? { path: weightsPathForId(opts.modelId), id: opts.modelId } : null)
      : resolveAnyImageWeights();
  }
  if (!resolved?.path) return null;

  let bin;
  try {
    bin = await ensureSdBinary();
  } catch {
    return null;
  }

  const mediaRoot = path.join(path.dirname(modelsDir()), 'media');
  fs.mkdirSync(mediaRoot, { recursive: true });
  const outPath = path.join(mediaRoot, `sd-tmp-${Date.now()}.png`);

  const isFlux = Boolean(resolved.flux) || /flux/i.test(resolved.id || '');
  const isTurbo = /turbo|sdxl/i.test(resolved.id || '');
  const width = opts.width || (isFlux ? 768 : 512);
  const height = opts.height || (isFlux ? 768 : 512);
  const steps = opts.steps || (isFlux || isTurbo ? 4 : 20);
  const timeoutMs = opts.timeoutMs || (isFlux ? 300_000 : isTurbo ? 120_000 : 180_000);
  const text = String(prompt || 'abstract art').slice(0, 450);

  await new Promise((resolve, reject) => {
    /** @type {string[]} */
    let args;
    if (isFlux) {
      const p = fluxPaths();
      args = [
        '--diffusion-model', p.diffusion,
        '--vae', p.vae,
        '--clip_l', p.clipL,
        '--t5xxl', p.t5,
        '-p', text,
        '-o', outPath,
        '-W', String(width),
        '-H', String(height),
        '--steps', String(steps),
        '--cfg-scale', '1',
        '--sampling-method', 'euler',
        '--clip-on-cpu',
        '-s', String(-1),
      ];
    } else {
      args = [
        '-m', resolved.path,
        '-p', text,
        '-o', outPath,
        '-W', String(width),
        '-H', String(height),
        '--steps', String(steps),
        '-s', String(-1),
      ];
      if (isTurbo) args.push('--cfg-scale', '1');
    }
    const child = spawn(bin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stderr = '';
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      reject(new Error('Local image timed out'));
    }, timeoutMs);
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !fs.existsSync(outPath)) {
        reject(new Error(stderr.trim() || `sd exited ${code}`));
        return;
      }
      resolve();
    });
  });

  const buf = fs.readFileSync(outPath);
  try {
    fs.unlinkSync(outPath);
  } catch {
    /* ignore */
  }
  if (buf.length < 1000) return null;
  return {
    buf,
    ext: 'png',
    source: isFlux ? 'NOVA-flux-schnell-local' : isTurbo ? 'NOVA-sdxl-turbo-local' : 'NOVA-sd-local',
    modelId: resolved.id,
  };
}

module.exports = {
  findSdBinary,
  ensureSdBinary,
  weightsPathForId,
  hasLocalImageModel,
  isLocalImageReady,
  generateLocalImage,
  hasFluxBundle,
  fluxDiffusionPath,
  fluxPaths,
  SD_TAG,
};
