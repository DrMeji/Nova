/**
 * ARK Engine — ARK's own local AI runtime (not Ollama, not a wrapper around another app).
 *
 * Models live under the app userData folder. Chat prefers real GGUF + llama-cli when
 * installed; ARK Core remains a builtin fallback template only.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const arkMedia = require('./arkMedia.cjs');
const arkGguf = require('./arkGguf.cjs');
const arkSd = require('./arkSd.cjs');
const arkFetch = require('./arkFetch.cjs');
const arkPaths = require('./arkPaths.cjs');
const arkModelRank = require('./arkModelRank.cjs');
const arkHunt = require('./arkHunt.cjs');
const os = require('os');

/** Default zero-key brain for new installs (~1 GB Q4). */
const DEFAULT_BRAIN_ID = 'qwen25-15b';

const CATALOG = [
  {
    id: 'ark-core',
    name: 'ARK Core',
    detail: 'Built-in template · not a live LLM',
    sizeGb: 0,
    status: 'ready',
    builtin: true,
  },
  {
    id: 'ark-image-core',
    name: 'ARK Image Core',
    detail: 'Free images · Pollinations · Image tab',
    sizeGb: 0,
    status: 'ready',
    builtin: true,
  },
  {
    id: 'ark-video-core',
    name: 'ARK Video Core',
    detail: 'Free / motion MP4 · Video tab · ARK Engine',
    sizeGb: 0,
    status: 'ready',
    builtin: true,
  },
  {
    id: 'sd15-local',
    name: 'Stable Diffusion 1.5 (Local)',
    detail: 'On-device images · ~4.0 GB · sd.cpp · 8 GB+ RAM',
    sizeGb: 4.0,
    status: 'missing',
    format: 'safetensors',
    runtime: 'sd',
    url: 'https://huggingface.co/stable-diffusion-v1-5/stable-diffusion-v1-5/resolve/main/v1-5-pruned-emaonly.safetensors',
  },
  {
    id: 'sdxl-turbo-local',
    name: 'SDXL Turbo (Local)',
    detail: 'Fast on-device images · ~6.9 GB · sd.cpp · 12 GB+ RAM',
    sizeGb: 6.9,
    status: 'missing',
    format: 'safetensors',
    runtime: 'sd',
    steps: 4,
    width: 512,
    height: 512,
    url: 'https://huggingface.co/stabilityai/sdxl-turbo/resolve/main/sd_xl_turbo_1.0_fp16.safetensors',
  },
  {
    id: 'flux-schnell-local',
    name: 'FLUX.1 Schnell (Local)',
    detail: 'On-device FLUX · ~13 GB bundle · sd.cpp · 16 GB+ RAM',
    sizeGb: 13,
    status: 'missing',
    format: 'bundle',
    runtime: 'flux',
    bundle: [
      {
        file: 'flux-schnell-local.gguf',
        url: 'https://huggingface.co/leejet/FLUX.1-schnell-gguf/resolve/main/flux1-schnell-q4_0.gguf',
        role: 'diffusion',
      },
      {
        file: 'flux-vae.safetensors',
        url: 'https://huggingface.co/black-forest-labs/FLUX.1-dev/resolve/main/ae.safetensors',
        role: 'vae',
      },
      {
        file: 'flux-clip_l.safetensors',
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/clip_l.safetensors',
        role: 'clip_l',
      },
      {
        file: 'flux-t5xxl.safetensors',
        url: 'https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors',
        role: 't5xxl',
      },
    ],
  },
  {
    id: 'qwen25-15b',
    name: 'Qwen2.5 1.5B Instruct',
    detail: 'Default local brain · ~1.0 GB · Q4_K_M',
    sizeGb: 1.0,
    status: 'missing',
    url: 'https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf',
  },
  {
    id: 'llama32-3b',
    name: 'Llama 3.2 3B Instruct',
    detail: 'General · ~2.0 GB · Q4_K_M',
    sizeGb: 2.0,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/Llama-3.2-3B-Instruct-GGUF/resolve/main/Llama-3.2-3B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'qwen25-coder-7b',
    name: 'Qwen2.5-Coder 7B Instruct',
    detail: 'Coding · ~4.7 GB · Q4_K_M',
    sizeGb: 4.7,
    status: 'missing',
    url: 'https://huggingface.co/Qwen/Qwen2.5-Coder-7B-Instruct-GGUF/resolve/main/qwen2.5-coder-7b-instruct-q4_k_m.gguf',
  },
  {
    id: 'qwen25-coder-14b',
    name: 'Qwen2.5-Coder 14B Instruct',
    detail: 'Coding · ~9.0 GB · Q4_K_M · 16 GB+ RAM',
    sizeGb: 9.0,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-14B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-14B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'qwen25-coder-32b',
    name: 'Qwen2.5-Coder 32B Instruct',
    detail: 'Coding · ~20 GB · Q4_K_M · 32 GB+ RAM',
    sizeGb: 20,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/Qwen2.5-Coder-32B-Instruct-GGUF/resolve/main/Qwen2.5-Coder-32B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'deepseek-coder-v2-lite',
    name: 'DeepSeek Coder V2 Lite',
    detail: 'Coding · ~8.9 GB · Q4_K_M',
    sizeGb: 8.9,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/DeepSeek-Coder-V2-Lite-Instruct-GGUF/resolve/main/DeepSeek-Coder-V2-Lite-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'starcoder2-7b',
    name: 'StarCoder2 7B',
    detail: 'Coding · ~4.3 GB · Q4_K_M',
    sizeGb: 4.3,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/StarCoder2-7B-GGUF/resolve/main/StarCoder2-7B-Q4_K_M.gguf',
  },
  {
    id: 'qwen25-7b',
    name: 'Qwen2.5 7B Instruct',
    detail: 'General · ~4.7 GB · Q4_K_M',
    sizeGb: 4.7,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/Qwen2.5-7B-Instruct-GGUF/resolve/main/Qwen2.5-7B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'llama31-8b',
    name: 'Llama 3.1 8B Instruct',
    detail: 'General · ~4.9 GB · Q4_K_M',
    sizeGb: 4.9,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf',
  },
  {
    id: 'mistral-7b',
    name: 'Mistral 7B Instruct',
    detail: 'General · ~4.1 GB · Q4_K_M',
    sizeGb: 4.1,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/Mistral-7B-Instruct-v0.3-GGUF/resolve/main/Mistral-7B-Instruct-v0.3-Q4_K_M.gguf',
  },
  {
    id: 'gemma2-2b',
    name: 'Gemma 2 2B Instruct',
    detail: 'Fast · ~1.6 GB · Q4_K_M',
    sizeGb: 1.6,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf',
  },
  {
    id: 'phi3-mini',
    name: 'Phi-3 Mini Instruct',
    detail: 'Fast · ~2.3 GB · Q4_K_M',
    sizeGb: 2.3,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/Phi-3-mini-4k-instruct-GGUF/resolve/main/Phi-3-mini-4k-instruct-Q4_K_M.gguf',
  },
  {
    id: 'deepseek-r1-distill-8b',
    name: 'DeepSeek-R1 Distill 8B',
    detail: 'Reasoning · ~5.2 GB · Q4_K_M',
    sizeGb: 5.2,
    status: 'missing',
    url: 'https://huggingface.co/bartowski/DeepSeek-R1-Distill-Llama-8B-GGUF/resolve/main/DeepSeek-R1-Distill-Llama-8B-Q4_K_M.gguf',
  },
];

function catalogAll() {
  const hunt = arkHunt.list().filter((h) => !CATALOG.some((c) => c.id === h.id));
  return CATALOG.concat(hunt);
}

function modelsDir() {
  return arkPaths.modelsDir();
}

function ensureDirs() {
  fs.mkdirSync(modelsDir(), { recursive: true });
}

function modelMarkerPath(id) {
  return path.join(modelsDir(), `${id}.arkmodel`);
}

function hasRealGguf(id) {
  const p = arkGguf.findGgufForModel(id);
  if (!p) return false;
  try {
    return fs.statSync(p).size > 1024 * 1024;
  } catch {
    return false;
  }
}

function hasRealWeights(id) {
  const meta = catalogAll().find((m) => m.id === id);
  if (meta?.runtime === 'flux') {
    return arkSd.hasFluxBundle();
  }
  if (meta?.format === 'safetensors' || meta?.runtime === 'sd') {
    const p = arkSd.weightsPathForId(id);
    if (!p) return false;
    try {
      return fs.statSync(p).size > 50 * 1024 * 1024;
    } catch {
      return false;
    }
  }
  return hasRealGguf(id);
}

function writeMarker(id, meta, extra = {}) {
  fs.writeFileSync(
    modelMarkerPath(id),
    JSON.stringify({
      installedAt: new Date().toISOString(),
      name: meta.name,
      placeholder: false,
      ...extra,
    }, null, 2),
    'utf8',
  );
}

let phase = 'online';
let activeModelId = 'ark-core';
/** @type {Record<string, { progress: number, error?: string, phase?: string, cancel?: boolean }>} */
const downloads = {};
/** @type {string[]} */
const downloadQueue = [];
const MAX_PARALLEL_DOWNLOADS = 2;

function listModels() {
  const ggufs = arkGguf.listGgufFiles();
  return catalogAll().map((m) => {
    if (m.builtin) {
      return { ...m, status: 'ready', gguf: false };
    }
    const downloading = Boolean(downloads[m.id]);
    const ready = hasRealWeights(m.id);
    return {
      ...m,
      status: downloading ? 'downloading' : ready ? 'ready' : 'missing',
      progress: downloads[m.id]?.progress,
      downloadPhase: downloads[m.id]?.phase || null,
      gguf: m.runtime === 'sd' || m.runtime === 'flux' ? false : ready,
      localImage: m.runtime === 'sd' || m.runtime === 'flux' ? ready : undefined,
    };
  }).concat(
    ggufs
      .filter((g) => !catalogAll().some((c) => !c.builtin && arkGguf.findGgufForModel(c.id) === g.path))
      .map((g) => ({
        id: `gguf:${g.file}`,
        name: g.file.replace(/\.gguf$/i, ''),
        detail: `GGUF · ${g.sizeMb} MB · ARK Engine`,
        sizeGb: Math.round((g.sizeMb / 1024) * 10) / 10,
        status: 'ready',
        gguf: true,
      })),
  );
}

function getStatus() {
  const models = listModels();
  // Only auto-switch away from ark-core when caller did not explicitly pick Core.
  if (activeModelId === 'ark-core' && hasRealGguf(DEFAULT_BRAIN_ID)) {
    activeModelId = DEFAULT_BRAIN_ID;
  }
  const active = models.find((m) => m.id === activeModelId) || models[0];
  const llamaBin = arkGguf.findLlamaBinary();
  return {
    ok: phase === 'online',
    service: 'ark-engine',
    version: '0.4.0',
    phase,
    activeModelId: active?.id ?? 'ark-core',
    activeModelName: active?.name ?? 'ARK Core',
    modelsDir: modelsDir(),
    modelsDirDefault: arkPaths.defaultModelsDir(),
    modelsDirIsCustom: arkPaths.modelsDirInfo().isCustom,
    models,
    modelFiles: arkGguf.listGgufFiles(),
    ggufBinary: Boolean(llamaBin),
    ggufBinaryPath: llamaBin,
    ggufCount: arkGguf.listGgufFiles().length,
    ggufServerPort: arkGguf.getServerPort?.() || 8788,
    ggufServer: arkGguf.getServerStatus?.() || { ok: true, error: null, port: 8788 },
    defaultBrainId: DEFAULT_BRAIN_ID,
    note:
      phase === 'online'
        ? (llamaBin && arkGguf.listGgufFiles().length
          ? 'ARK Engine online · local GGUF brain ready'
          : 'ARK Engine online · install a local brain for zero-key chat')
        : phase === 'starting'
          ? 'Starting ARK Engine…'
          : 'ARK Engine offline',
  };
}

function start() {
  if (phase === 'online') return getStatus();
  phase = 'starting';
  void (async () => {
    try {
      await ensureRuntime();
    } catch {
      /* binary may still download later */
    }
    phase = 'online';
    const llamaBin = arkGguf.findLlamaBinary();
    const ready = listModels().find((m) => m.gguf && m.status === 'ready' && m.id !== 'ark-core');
    if (llamaBin && ready) {
      const ggufId = String(ready.id).startsWith('gguf:') ? String(ready.id).slice(5) : ready.id;
      void arkGguf.warmServer(ggufId);
    }
  })();
  return getStatus();
}

function stop() {
  phase = 'offline';
  arkGguf.stopServer();
  return getStatus();
}

function setActiveModel(id) {
  const models = listModels();
  const found = models.find((m) => m.id === id && m.status === 'ready');
  if (!found) throw new Error('Model not installed in ARK Engine');
  activeModelId = id;
  const ggufId = String(id).startsWith('gguf:') ? String(id).slice(5) : id;
  void arkGguf.warmServer(ggufId);
  return getStatus();
}

function activeDownloadCount() {
  return Object.values(downloads).filter((d) => d && !d.error && (d.progress || 0) < 100).length;
}

function diskSpaceForModels() {
  const dir = modelsDir();
  ensureDirs();
  try {
    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync(dir);
      const free = Number(s.bavail) * Number(s.bsize);
      const total = Number(s.blocks) * Number(s.bsize);
      return {
        ok: true,
        freeBytes: free,
        totalBytes: total,
        freeGb: Math.round((free / (1024 ** 3)) * 10) / 10,
        path: dir,
      };
    }
  } catch {
    /* try platform fallback */
  }
  if (process.platform === 'win32') {
    try {
      const { execFileSync } = require('child_process');
      const drive = path.parse(path.resolve(dir)).root.replace('\\', '');
      const script = `$d = Get-PSDrive -Name '${drive.replace(':', '')}' -ErrorAction SilentlyContinue; if ($d) { [math]::Round($d.Free/1GB, 1) } else { '' }`;
      const out = execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 8000,
      }).trim();
      const freeGb = Number(out);
      if (Number.isFinite(freeGb)) {
        return {
          ok: true,
          freeBytes: Math.round(freeGb * 1024 ** 3),
          totalBytes: null,
          freeGb,
          path: dir,
        };
      }
    } catch {
      /* ignore */
    }
  }
  return { ok: false, freeBytes: null, totalBytes: null, freeGb: null, path: dir };
}

function beginDownload(id) {
  const meta = catalogAll().find((m) => m.id === id);
  if (!meta) throw new Error('Unknown model');
  if (meta.builtin) return getStatus();
  if (!meta.url && !(meta.bundle && meta.bundle.length)) throw new Error('No download URL for this model');
  if (downloads[id] || downloadQueue.includes(id)) return getStatus();
  const runtimeReady =
    meta.runtime === 'sd' || meta.runtime === 'flux'
      ? arkSd.findSdBinary()
      : arkGguf.findLlamaBinary();
  if (hasRealWeights(id) && runtimeReady) {
    writeMarker(id, meta, {
      path:
        meta.runtime === 'flux'
          ? arkSd.fluxDiffusionPath()
          : meta.runtime === 'sd'
            ? arkSd.weightsPathForId(id)
            : arkGguf.findGgufForModel(id),
    });
    activeModelId = id;
    return getStatus();
  }

  const needBytes = Math.ceil((meta.sizeGb || 1) * 1024 ** 3 * 1.15);
  const disk = diskSpaceForModels();
  if (disk.ok && typeof disk.freeBytes === 'number' && disk.freeBytes < needBytes) {
    throw new Error(
      `Not enough disk space for ${meta.name} (need ~${meta.sizeGb} GB, free ${disk.freeGb ?? '?'} GB)`,
    );
  }

  ensureDirs();
  if (activeDownloadCount() >= MAX_PARALLEL_DOWNLOADS) {
    downloadQueue.push(id);
    downloads[id] = { progress: 0, phase: 'queued' };
    return getStatus();
  }

  startDownloadJob(id, meta);
  return getStatus();
}

function pumpDownloadQueue() {
  while (activeDownloadCount() < MAX_PARALLEL_DOWNLOADS && downloadQueue.length > 0) {
    const nextId = downloadQueue.shift();
    const meta = catalogAll().find((m) => m.id === nextId);
    if (!meta || (!meta.url && !(meta.bundle && meta.bundle.length))) {
      delete downloads[nextId];
      continue;
    }
    startDownloadJob(nextId, meta);
  }
}

function startDownloadJob(id, meta) {
  downloads[id] = { progress: 1, phase: 'runtime', cancel: false };

  void (async () => {
    try {
      if (meta.runtime === 'sd' || meta.runtime === 'flux') {
        await arkSd.ensureSdBinary((pct) => {
          if (downloads[id]?.cancel) throw new Error('Download canceled');
          if (downloads[id]) {
            downloads[id].phase = 'runtime';
            downloads[id].progress = Math.max(1, Math.round(pct * 0.2));
          }
        });
      } else {
        await arkGguf.ensureLlamaBinary((pct) => {
          if (downloads[id]?.cancel) throw new Error('Download canceled');
          if (downloads[id]) {
            downloads[id].phase = 'runtime';
            downloads[id].progress = Math.max(1, Math.round(pct * 0.25));
          }
        });
      }

      if (downloads[id]?.cancel) throw new Error('Download canceled');

      if (hasRealWeights(id)) {
        writeMarker(id, meta, {
          path:
            meta.runtime === 'flux'
              ? arkSd.fluxDiffusionPath()
              : meta.runtime === 'sd'
                ? arkSd.weightsPathForId(id)
                : arkGguf.findGgufForModel(id),
        });
        if (downloads[id]) downloads[id].progress = 100;
        delete downloads[id];
        activeModelId = id;
        pumpDownloadQueue();
        return;
      }

      downloads[id].phase = 'weights';

      if (meta.runtime === 'flux' && Array.isArray(meta.bundle)) {
        const parts = meta.bundle;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i];
          const dest = path.join(modelsDir(), part.file);
          if (fs.existsSync(dest) && fs.statSync(dest).size > 1024 * 1024) {
            if (downloads[id]) {
              downloads[id].progress = Math.min(99, 20 + Math.round(((i + 1) / parts.length) * 80));
            }
            continue;
          }
          await arkFetch.downloadToFile(part.url, dest, (pct) => {
            if (downloads[id]?.cancel) throw new Error('Download canceled');
            if (downloads[id]) {
              const base = 20 + Math.round((i / parts.length) * 80);
              const slice = Math.round((pct / 100) * (80 / parts.length));
              downloads[id].progress = Math.min(99, base + slice);
            }
          });
          if (downloads[id]?.cancel) throw new Error('Download canceled');
        }
        writeMarker(id, meta, { path: arkSd.fluxDiffusionPath(), bundle: true });
      } else {
        const ext = meta.format === 'safetensors' ? 'safetensors' : 'gguf';
        const dest = path.join(modelsDir(), `${id}.${ext}`);
        await arkFetch.downloadToFile(meta.url, dest, (pct) => {
          if (downloads[id]?.cancel) throw new Error('Download canceled');
          if (downloads[id]) {
            downloads[id].progress = Math.min(99, 25 + Math.round(pct * 0.75));
          }
        });
        if (downloads[id]?.cancel) throw new Error('Download canceled');
        writeMarker(id, meta, { path: dest, bytes: fs.statSync(dest).size });
      }

      if (downloads[id]) downloads[id].progress = 100;
      delete downloads[id];
      activeModelId = id;
    } catch (err) {
      if (downloads[id]) {
        downloads[id].error = err instanceof Error ? err.message : String(err);
        downloads[id].progress = 0;
        downloads[id].phase = 'error';
      }
      try {
        if (meta.bundle) {
          for (const part of meta.bundle) {
            const partial = path.join(modelsDir(), `${part.file}.partial`);
            if (fs.existsSync(partial)) fs.unlinkSync(partial);
          }
        } else {
          const ext = meta.format === 'safetensors' ? 'safetensors' : 'gguf';
          const partial = path.join(modelsDir(), `${id}.${ext}.partial`);
          if (fs.existsSync(partial)) fs.unlinkSync(partial);
        }
      } catch {
        /* ignore */
      }
    } finally {
      pumpDownloadQueue();
    }
  })();
}

function cancelDownload(id) {
  const qi = downloadQueue.indexOf(id);
  if (qi >= 0) {
    downloadQueue.splice(qi, 1);
    delete downloads[id];
    return { ok: true, canceled: true };
  }
  if (downloads[id]) {
    downloads[id].cancel = true;
    downloads[id].phase = 'canceling';
    downloads[id].error = 'Download canceled';
    return { ok: true, canceling: true };
  }
  return { ok: false, error: 'No active download' };
}

function tryUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function deleteInstalledModel(id) {
  const raw = String(id || '').trim();
  if (!raw) return { ok: false, error: 'No model selected' };
  const meta = catalogAll().find((m) => m.id === raw);
  if (meta?.builtin || raw === 'ark-core' || raw === 'ark-image-core' || raw === 'ark-video-core') {
    return { ok: false, error: 'Cannot delete a built-in model' };
  }

  if (downloads[raw] || downloadQueue.includes(raw)) {
    cancelDownload(raw);
  }

  const targets = [];
  if (raw.startsWith('gguf:')) {
    targets.push(path.join(modelsDir(), raw.slice(5)));
  } else {
    const gguf = arkGguf.findGgufForModel(raw);
    if (gguf) targets.push(gguf);
    targets.push(modelMarkerPath(raw));
    if (meta?.runtime === 'flux' || raw === 'flux-schnell-local') {
      targets.push(...Object.values(arkSd.fluxPaths()));
    } else if (meta?.runtime === 'sd' || meta?.format === 'safetensors') {
      const weights = arkSd.weightsPathForId(raw);
      if (weights) targets.push(weights);
    }
  }

  const activeGguf = String(activeModelId).startsWith('gguf:')
    ? path.join(modelsDir(), String(activeModelId).slice(5))
    : arkGguf.findGgufForModel(activeModelId);
  if (raw === activeModelId || (activeGguf && targets.includes(activeGguf))) {
    try { arkGguf.stopServer(); } catch { /* ignore */ }
    activeModelId = 'ark-core';
  }

  try {
    for (const f of fs.readdirSync(modelsDir())) {
      if (
        f === `${raw}.arkmodel`
        || (f.startsWith(`${raw}.`) && f.endsWith('.partial'))
        || (raw.startsWith('gguf:') && f === raw.slice(5))
      ) {
        targets.push(path.join(modelsDir(), f));
      }
    }
  } catch {
    /* ignore */
  }

  let removed = 0;
  for (const p of [...new Set(targets)]) {
    if (tryUnlink(p)) removed += 1;
  }

  if (removed === 0) {
    return { ...getStatus(), ok: false, error: 'No files found for that model' };
  }
  return { ...getStatus(), ok: true, deleted: raw, removed };
}

function importGgufFile(filePath) {
  if (!filePath || typeof filePath !== 'string') throw new Error('No file path');
  const src = path.resolve(filePath);
  if (!fs.existsSync(src)) throw new Error('File not found');
  if (!src.toLowerCase().endsWith('.gguf')) throw new Error('Only .gguf files can be imported');
  ensureDirs();
  const base = path.basename(src);
  const dest = path.join(modelsDir(), base);
  if (path.resolve(dest) !== src) {
    fs.copyFileSync(src, dest);
  }
  const id = `gguf:${base}`;
  activeModelId = id;
  return getStatus();
}

function downloadProgress(id) {
  if (downloads[id]) {
    if (downloads[id].phase === 'queued') return 0;
    return downloads[id].progress ?? 0;
  }
  if (hasRealWeights(id)) return 100;
  return 0;
}

function downloadError(id) {
  return downloads[id]?.error || null;
}

async function ensureRuntime() {
  await arkGguf.ensureLlamaBinary();
  return getStatus();
}

function arkCoreGenerate(message, modelName) {
  const text = String(message || '').trim();
  if (!text) {
    return 'ARK Engine is online. Install a local GGUF brain from Local AI for live answers.';
  }

  const lower = text.toLowerCase();
  const preview = text.length > 280 ? `${text.slice(0, 280)}…` : text;

  if (/who are you|what are you|what is ark/.test(lower)) {
    return [
      'I am ARK Engine — the local runtime inside ARK.',
      'Install the default local brain (Qwen2.5 1.5B) from Local AI, or connect a free cloud key for full chat.',
    ].join('\n');
  }

  if (/model|engine|local ai/.test(lower)) {
    const status = getStatus();
    const ready = status.models.filter((m) => m.status === 'ready' && m.gguf).map((m) => m.name);
    return [
      'ARK Engine status',
      `• Phase: ${status.phase}`,
      `• Active: ${status.activeModelName}`,
      `• GGUF brains: ${ready.join(', ') || 'none yet'}`,
      `• llama-cli: ${status.ggufBinary ? 'ready' : 'not installed'}`,
      `• Model folder: ${status.modelsDir}`,
    ].join('\n');
  }

  return [
    `ARK Engine · ${modelName}`,
    '',
    `I heard: “${preview}”`,
    '',
    'ARK Core is a template helper, not a live LLM.',
    'Install the default local brain from Local AI (Llama 3.2 3B or Qwen2.5 7B when your PC can run it) or connect Groq / Google / OpenRouter.',
  ].join('\n');
}

async function generate(message, opts = {}) {
  const requestedId = opts.modelId;
  const modelId = requestedId || activeModelId;
  const kind = opts.kind;
  const models = listModels();
  let model = models.find((m) => m.id === modelId) || models[0];

  if (kind === 'image' || (modelId && String(modelId).includes('image'))) {
    const media = await arkMedia.generateImage(message, model?.name || 'ARK Image Core');
    return {
      ok: true,
      reply: media.reply,
      modelId: modelId || 'ark-image-core',
      modelName: media.modelName,
      source: 'ark-media',
      media: {
        kind: 'image',
        dataUrl: media.dataUrl,
        path: media.path,
        libraryId: media.libraryId,
        real: Boolean(media.real),
      },
    };
  }
  if (kind === 'video' || (modelId && String(modelId).includes('video'))) {
    const media = await arkMedia.generateVideo(message, model?.name || 'ARK Video Core');
    return {
      ok: true,
      reply: media.reply,
      modelId: modelId || 'ark-video-core',
      modelName: media.modelName,
      source: 'ark-media',
      media: {
        kind: 'video',
        dataUrl: media.dataUrl,
        path: media.path,
        libraryId: media.libraryId,
        real: Boolean(media.real),
      },
    };
  }

  if (requestedId === 'ark-core') {
    return {
      ok: true,
      reply: arkCoreGenerate(message, 'ARK Core'),
      modelId: 'ark-core',
      modelName: 'ARK Core',
      source: 'ark-template',
      template: true,
    };
  }

  if (phase !== 'online') {
    throw new Error('ARK Engine is offline. Start it from Local AI.');
  }

  const ramGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  // Only honor a caller-specified id. activeModelId must not pin Lindsay/Auto to 1.5B.
  const explicit = requestedId && requestedId !== 'ark-core' && requestedId !== 'ark-auto';
  if (!explicit || !model || model.status !== 'ready' || !model.gguf) {
    const intent = arkModelRank.classifyIntent(message, kind);
    const pickedId = arkModelRank.pickReadyEngineId(models, intent, ramGb);
    if (pickedId) {
      const hit = models.find((m) => m.id === pickedId);
      if (hit) model = hit;
    } else {
      const ggufReady = models.find((m) => m.gguf && m.status === 'ready');
      if (ggufReady) model = ggufReady;
    }
  }

  if (!model || (model.status !== 'ready' && !model.gguf)) {
    throw new Error('Selected model is not ready in ARK Engine');
  }

  const ggufId = String(model.id).startsWith('gguf:')
    ? String(model.id).slice(5)
    : model.id;

  if (arkGguf.findGgufForModel(ggufId) && arkGguf.findLlamaBinary()) {
    try {
      const onChunk = typeof opts.onChunk === 'function' ? opts.onChunk : null;
      const timeoutMs = kind === 'coding' ? 300_000 : 90_000;
      const nPredict = kind === 'coding' ? 8192 : 1536;
      const gguf = await arkGguf.runGgufStream(ggufId, message, onChunk, timeoutMs, nPredict);
      return {
        ok: true,
        reply: gguf.reply,
        modelId: model.id,
        modelName: model.name,
        source: 'ark-gguf',
        streamed: Boolean(gguf.streamed),
      };
    } catch (err) {
      throw new Error(
        err instanceof Error ? err.message : 'Local GGUF brain failed to run',
      );
    }
  }

  // Also try DEFAULT brain if a specific id had no weights
  if (hasRealGguf(DEFAULT_BRAIN_ID) && arkGguf.findLlamaBinary()) {
    try {
      const gguf = await arkGguf.runGguf(DEFAULT_BRAIN_ID, message);
      return {
        ok: true,
        reply: gguf.reply,
        modelId: DEFAULT_BRAIN_ID,
        modelName: 'Qwen2.5 1.5B Instruct',
        source: 'ark-gguf',
      };
    } catch {
      /* fall through */
    }
  }

  throw new Error(
    'No local GGUF brain is loaded. Open Local AI to install one, or add a free cloud key in Settings.',
  );
}

function registerHunt(meta) {
  return arkHunt.register(meta);
}

module.exports = {
  getStatus,
  start,
  stop,
  setActiveModel,
  beginDownload,
  registerHunt,
  downloadProgress,
  downloadError,
  cancelDownload,
  importGgufFile,
  deleteInstalledModel,
  diskSpaceForModels,
  ensureRuntime,
  generate,
  listModels,
  DEFAULT_BRAIN_ID,
};
