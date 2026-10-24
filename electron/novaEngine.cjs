/**
 * NOVA Engine — NOVA's own local AI runtime (not Ollama, not a wrapper around another app).
 *
 * Models live under the app userData folder. Chat prefers real GGUF + llama-cli when
 * installed; NOVA Core remains a builtin fallback template only.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const novaMedia = require('./novaMedia.cjs');
const novaGguf = require('./novaGguf.cjs');
const novaSd = require('./novaSd.cjs');
const novaFetch = require('./novaFetch.cjs');
const novaPaths = require('./novaPaths.cjs');
const novaModelRank = require('./novaModelRank.cjs');
const novaHunt = require('./novaHunt.cjs');
const novaFfmpeg = require('./novaFfmpeg.cjs');
const { DEFAULT_BRAIN_ID, CATALOG } = require('./novaCatalog.cjs');
const novaExternalModels = require('./novaExternalModels.cjs');
const os = require('os');
function catalogAll() {
  const hunt = novaHunt.list().filter((h) => !CATALOG.some((c) => c.id === h.id));
  return CATALOG.concat(hunt);
}

function modelsDir() {
  return novaPaths.modelsDir();
}

function ensureDirs() {
  fs.mkdirSync(modelsDir(), { recursive: true });
}

function modelMarkerPath(id) {
  return path.join(modelsDir(), `${id}.arkmodel`);
}

function hasRealGguf(id) {
  const p = novaGguf.findGgufForModel(id);
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
    return novaSd.hasFluxBundle();
  }
  if (meta?.runtime === 'vl' && Array.isArray(meta.bundle)) {
    for (const part of meta.bundle) {
      const p = path.join(modelsDir(), part.file);
      try {
        if (!fs.existsSync(p) || fs.statSync(p).size < 1024 * 1024) return false;
      } catch {
        return false;
      }
    }
    return true;
  }
  if (meta?.format === 'safetensors' || meta?.runtime === 'sd') {
    const p = novaSd.weightsPathForId(id);
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
let activeModelId = 'NOVA-core';
/** @type {Record<string, { progress: number, error?: string, phase?: string, cancel?: boolean }>} */
const downloads = {};
/** @type {string[]} */
const downloadQueue = [];
const MAX_PARALLEL_DOWNLOADS = 2;

function downloadQueuePath() {
  return path.join(app.getPath('userData'), 'engine-download-queue.json');
}

function persistDownloadQueue() {
  try {
    fs.writeFileSync(downloadQueuePath(), JSON.stringify(downloadQueue), 'utf8');
  } catch {
    /* ignore */
  }
}

function loadPersistedDownloadQueue() {
  try {
    const p = downloadQueuePath();
    if (!fs.existsSync(p)) return;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(raw)) return;
    for (const id of raw) {
      if (typeof id === 'string' && !downloadQueue.includes(id) && !downloads[id]) {
        downloadQueue.push(id);
      }
    }
  } catch {
    /* ignore */
  }
}

loadPersistedDownloadQueue();

function listModels() {
  const ggufs = novaGguf.listGgufFiles();
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
      gguf: m.runtime === 'sd' || m.runtime === 'flux' || m.runtime === 'vl' ? false : ready,
      localImage: m.runtime === 'sd' || m.runtime === 'flux' ? ready : undefined,
    };
  }).concat(
    ggufs
      // mmproj is a vision projector companion — not a selectable chat/create brain.
      .filter((g) => !/mmproj/i.test(String(g.file || '')))
      .filter((g) => !catalogAll().some((c) => !c.builtin && novaGguf.findGgufForModel(c.id) === g.path))
      .map((g) => ({
        id: `gguf:${g.file}`,
        name: g.file.replace(/\.gguf$/i, ''),
        detail: `GGUF · ${g.sizeMb} MB · NOVA Engine`,
        sizeGb: Math.round((g.sizeMb / 1024) * 10) / 10,
        status: 'ready',
        gguf: true,
      })),
  );
}

function getStatus() {
  const models = listModels();
  // Only auto-switch away from NOVA-core when caller did not explicitly pick Core.
  if (activeModelId === 'NOVA-core') {
    if (hasRealGguf(DEFAULT_BRAIN_ID)) {
      activeModelId = DEFAULT_BRAIN_ID;
    } else {
      const readyBrain = models.find((m) => m.status === 'ready' && m.gguf && m.id !== 'NOVA-core');
      if (readyBrain) activeModelId = readyBrain.id;
    }
  }
  const active = models.find((m) => m.id === activeModelId) || models[0];
  const llamaBin = novaGguf.findLlamaBinary();
  // One GGUF dir scan per status (cached in novaGguf) — was 3× readdir+stat.
  const modelFiles = novaGguf.listGgufFiles();
  return {
    ok: phase === 'online',
    service: 'nova-engine',
    version: '0.4.0',
    phase,
    activeModelId: active?.id ?? 'NOVA-core',
    activeModelName: active?.name ?? 'NOVA Core',
    modelsDir: modelsDir(),
    modelsDirDefault: novaPaths.defaultModelsDir(),
    modelsDirIsCustom: novaPaths.modelsDirInfo().isCustom,
    models,
    modelFiles,
    ggufBinary: Boolean(llamaBin),
    ggufBinaryPath: llamaBin,
    ggufCount: modelFiles.length,
    ggufServerPort: novaGguf.getServerPort?.() || 8788,
    ggufServer: novaGguf.getServerStatus?.() || { ok: true, error: null, port: 8788 },
    defaultBrainId: DEFAULT_BRAIN_ID,
    ffmpegHint: novaFfmpeg.ffmpegInstallHint?.() || null,
    note:
      phase === 'online'
        ? (llamaBin && modelFiles.length
          ? 'NOVA Engine online · local GGUF brain ready'
          : 'NOVA Engine online · install a local brain for zero-key chat')
        : phase === 'degraded'
          ? 'NOVA Engine degraded · runtime not ready yet'
        : phase === 'starting'
          ? 'Starting NOVA Engine…'
          : 'NOVA Engine offline',
  };
}

function start() {
  if (phase === 'online') return getStatus();
  phase = 'starting';
  void (async () => {
    let runtimeOk = false;
    try {
      await ensureRuntime();
      runtimeOk = Boolean(novaGguf.findLlamaBinary());
    } catch {
      runtimeOk = false;
    }
    const llamaBin = novaGguf.findLlamaBinary();
    const ready = listModels().find((m) => m.gguf && m.status === 'ready' && m.id !== 'NOVA-core');
    if (runtimeOk && llamaBin) {
      phase = 'online';
      // Defer GGUF warm so opening NOVA / typing does not peg CPU while the UI is settling.
      if (ready) {
        const ggufId = String(ready.id).startsWith('gguf:') ? String(ready.id).slice(5) : ready.id;
        setTimeout(() => {
          void novaGguf.warmServer(ggufId);
        }, 12_000);
      }
    } else {
      // Engine process is up, but binary/weights may still be missing.
      phase = 'degraded';
    }
  })();
  return getStatus();
}

function stop() {
  phase = 'offline';
  novaGguf.stopServer();
  return getStatus();
}

function setActiveModel(id) {
  const models = listModels();
  const found = models.find((m) => m.id === id && m.status === 'ready');
  if (!found) throw new Error('Model not installed in NOVA Engine');
  // Same id already active — skip warmServer reload (tens of seconds on cold disk).
  if (String(activeModelId) === String(id)) {
    return getStatus();
  }
  activeModelId = id;
  const ggufId = String(id).startsWith('gguf:') ? String(id).slice(5) : id;
  // Defer warmup off this tick so engine-set-model IPC can reply immediately.
  // warmServer's sync prelude (findLlamaServer recursive walk + copyFileSync)
  // otherwise blocks the main event loop and freezes the renderer's await.
  setImmediate(() => {
    void novaGguf.warmServer(ggufId);
  });
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
      ? novaSd.findSdBinary()
      : novaGguf.findLlamaBinary();
  if (hasRealWeights(id) && runtimeReady) {
    writeMarker(id, meta, {
      path:
        meta.runtime === 'flux'
          ? novaSd.fluxDiffusionPath()
          : meta.runtime === 'sd'
            ? novaSd.weightsPathForId(id)
            : novaGguf.findGgufForModel(id),
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
  const diskUnknown = !disk.ok;

  ensureDirs();
  if (activeDownloadCount() >= MAX_PARALLEL_DOWNLOADS) {
    downloadQueue.push(id);
    persistDownloadQueue();
    downloads[id] = { progress: 0, phase: 'queued' };
    return getStatus();
  }

  startDownloadJob(id, meta);
  return getStatus();
}

function pumpDownloadQueue() {
  while (activeDownloadCount() < MAX_PARALLEL_DOWNLOADS && downloadQueue.length > 0) {
    const nextId = downloadQueue.shift();
    persistDownloadQueue();
    const meta = catalogAll().find((m) => m.id === nextId);
    if (!meta || (!meta.url && !(meta.bundle && meta.bundle.length))) {
      delete downloads[nextId];
      continue;
    }
    startDownloadJob(nextId, meta);
  }
}

function startDownloadJob(id, meta) {
  const disk = diskSpaceForModels();
  const diskWarning = disk.ok ? undefined : 'Free disk space unknown — download may fail if storage is low.';
  downloads[id] = { progress: 1, phase: 'runtime', cancel: false, diskWarning };

  void (async () => {
    try {
      // C6: wait out an active craft/chat generation before heavy download IO.
      for (let i = 0; i < 120; i += 1) {
        try {
          if (!novaGguf.isGenerateBusy?.()) break;
        } catch { break; }
        await new Promise((r) => setTimeout(r, 1000));
        if (downloads[id]?.cancel) throw new Error('Download canceled');
      }
      if (meta.runtime === 'sd' || meta.runtime === 'flux') {
        await novaSd.ensureSdBinary((pct) => {
          if (downloads[id]?.cancel) throw new Error('Download canceled');
          if (downloads[id]) {
            downloads[id].phase = 'runtime';
            downloads[id].progress = Math.max(1, Math.round(pct * 0.2));
          }
        });
      } else {
        await novaGguf.ensureLlamaBinary((pct) => {
          if (downloads[id]?.cancel) throw new Error('Download canceled');
          if (downloads[id]) {
            downloads[id].phase = 'runtime';
            downloads[id].progress = Math.max(1, Math.round(pct * 0.25));
          }
        });
      }

      if (downloads[id]?.cancel) throw new Error('Download canceled');

      if (hasRealWeights(id)) {
        const mainPath =
          meta.runtime === 'flux'
            ? novaSd.fluxDiffusionPath()
            : meta.runtime === 'sd'
              ? novaSd.weightsPathForId(id)
              : meta.runtime === 'vl' && Array.isArray(meta.bundle)
                ? path.join(modelsDir(), (meta.bundle.find((p) => p.role === 'llm') || meta.bundle[0]).file)
                : novaGguf.findGgufForModel(id);
        writeMarker(id, meta, {
          path: mainPath,
          ...(meta.runtime === 'vl' ? { bundle: true, vl: true } : {}),
        });
        if (downloads[id]) downloads[id].progress = 100;
        delete downloads[id];
        activeModelId = id;
        if (meta.runtime !== 'vl') {
          try {
            const ggufId = String(id).startsWith('gguf:') ? String(id).slice(5) : id;
            void novaGguf.warmServer(ggufId);
          } catch {
            /* warmup is best-effort */
          }
        }
        pumpDownloadQueue();
        return;
      }

      downloads[id].phase = 'weights';

      if ((meta.runtime === 'flux' || meta.runtime === 'vl') && Array.isArray(meta.bundle)) {
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
          try {
            await novaFetch.downloadToFile(part.url, dest, (pct) => {
              if (downloads[id]?.cancel) throw new Error('Download canceled');
              if (downloads[id]) {
                const base = 20 + Math.round((i / parts.length) * 80);
                const slice = Math.round((pct / 100) * (80 / parts.length));
                downloads[id].progress = Math.min(99, base + slice);
              }
            });
            if (downloads[id]?.cancel) throw new Error('Download canceled');
          } catch (partErr) {
            throw new Error(
              `Failed downloading ${part.file}: ${partErr instanceof Error ? partErr.message : String(partErr)}`,
            );
          }
        }
        writeMarker(id, meta, {
          path:
            meta.runtime === 'flux'
              ? novaSd.fluxDiffusionPath()
              : path.join(modelsDir(), (meta.bundle.find((p) => p.role === 'llm') || meta.bundle[0]).file),
          bundle: true,
          ...(meta.runtime === 'vl' ? { vl: true } : {}),
        });
      } else {
        const ext = meta.format === 'safetensors' ? 'safetensors' : 'gguf';
        const dest = path.join(modelsDir(), `${id}.${ext}`);
        await novaFetch.downloadToFile(meta.url, dest, (pct) => {
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
      if (meta.runtime !== 'vl') {
        try {
          const ggufId = String(id).startsWith('gguf:') ? String(id).slice(5) : id;
          void novaGguf.warmServer(ggufId);
        } catch {
          /* warmup is best-effort */
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/download canceled/i.test(msg)) {
        delete downloads[id];
        return;
      }
      if (downloads[id]) {
        downloads[id].error = msg;
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
      } catch (cleanupErr) {
        try {
          const novaCrashLog = require('./novaCrashLog.cjs');
          novaCrashLog.appendReport('download-cleanup', {
            modelId: id,
            error: cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr),
          });
        } catch {
          /* ignore */
        }
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
  if (meta?.builtin || raw === 'NOVA-core' || raw === 'NOVA-image-core' || raw === 'NOVA-video-core') {
    return { ok: false, error: 'Cannot delete a built-in model' };
  }

  if (downloads[raw] || downloadQueue.includes(raw)) {
    cancelDownload(raw);
  }

  const targets = [];
  if (raw.startsWith('gguf:')) {
    targets.push(path.join(modelsDir(), raw.slice(5)));
  } else {
    const gguf = novaGguf.findGgufForModel(raw);
    if (gguf) targets.push(gguf);
    targets.push(modelMarkerPath(raw));
    if (meta?.runtime === 'flux' || raw === 'flux-schnell-local') {
      targets.push(...Object.values(novaSd.fluxPaths()));
    } else if (meta?.runtime === 'sd' || meta?.format === 'safetensors') {
      const weights = novaSd.weightsPathForId(raw);
      if (weights) targets.push(weights);
    }
  }

  const activeGguf = String(activeModelId).startsWith('gguf:')
    ? path.join(modelsDir(), String(activeModelId).slice(5))
    : novaGguf.findGgufForModel(activeModelId);
  if (raw === activeModelId || (activeGguf && targets.includes(activeGguf))) {
    try { novaGguf.stopServer(); } catch { /* ignore */ }
    activeModelId = 'NOVA-core';
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

function linkOrCopyGguf(src, dest) {
  if (path.resolve(src) === path.resolve(dest)) return 'same';
  if (fs.existsSync(dest)) {
    const a = fs.statSync(src);
    const b = fs.statSync(dest);
    if (a.size === b.size) return 'exists';
    throw new Error(`Destination already exists with a different size: ${path.basename(dest)}`);
  }
  // Prefer hardlink (no extra disk) → symlink → full copy.
  try {
    fs.linkSync(src, dest);
    return 'hardlink';
  } catch { /* cross-volume */ }
  try {
    fs.symlinkSync(src, dest, 'file');
    return 'symlink';
  } catch { /* needs privilege on some Windows setups */ }
  fs.copyFileSync(src, dest);
  return 'copy';
}

function importGgufFile(filePath) {
  if (!filePath || typeof filePath !== 'string') throw new Error('No file path');
  const src = path.resolve(filePath);
  if (!fs.existsSync(src)) throw new Error('File not found');
  if (!src.toLowerCase().endsWith('.gguf')) throw new Error('Only .gguf files can be imported');
  ensureDirs();
  const base = path.basename(src);
  const catalogId = novaExternalModels.guessCatalogId(base);
  const destName = catalogId ? `${catalogId}.gguf` : base;
  const dest = path.join(modelsDir(), destName);
  const mode = linkOrCopyGguf(src, dest);
  let id = `gguf:${destName}`;
  if (catalogId) {
    const meta = catalogAll().find((m) => m.id === catalogId);
    if (meta) {
      writeMarker(catalogId, meta, { path: dest, importedFrom: src, importMode: mode });
      id = catalogId;
    }
  }
  activeModelId = id;
  const status = getStatus();
  return { ...status, ok: true, importedId: id, importMode: mode, sourcePath: src };
}

function scanExternalGgufs() {
  return novaExternalModels.scanExternalGgufs();
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
  await novaGguf.ensureLlamaBinary();
  return getStatus();
}

function novaCoreGenerate(message, modelName) {
  const text = String(message || '').trim();
  if (!text) {
    return 'NOVA Engine is online. Install a local GGUF brain from Local AI for live answers.';
  }

  const lower = text.toLowerCase();
  const preview = text.length > 280 ? `${text.slice(0, 280)}…` : text;

  if (/who are you|what are you|what is NOVA/.test(lower)) {
    return [
      'I am NOVA Engine — the local runtime inside NOVA.',
      'Install the default local brain (Qwen2.5 1.5B) from Local AI, or connect a free cloud key for full chat.',
    ].join('\n');
  }

  if (/model|engine|local ai/.test(lower)) {
    const status = getStatus();
    const ready = status.models.filter((m) => m.status === 'ready' && m.gguf).map((m) => m.name);
    return [
      'NOVA Engine status',
      `• Phase: ${status.phase}`,
      `• Active: ${status.activeModelName}`,
      `• GGUF brains: ${ready.join(', ') || 'none yet'}`,
      `• llama-cli: ${status.ggufBinary ? 'ready' : 'not installed'}`,
      `• Model folder: ${status.modelsDir}`,
    ].join('\n');
  }

  return [
    `NOVA Engine · ${modelName}`,
    '',
    `I heard: “${preview}”`,
    '',
    'NOVA Core is a template helper, not a live LLM.',
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
    const localOnlyIds = new Set(['sd15-local', 'sdxl-turbo-local', 'flux-schnell-local']);
    if (localOnlyIds.has(String(modelId || '')) && !novaSd.isLocalImageReady()) {
      return {
        ok: false,
        reply: 'Local image weights are not installed. Open Local AI to install them, or use NOVA Image Core.',
        modelId: modelId || 'NOVA-image-core',
        modelName: model?.name || String(modelId),
        source: 'none',
      };
    }
    const mediaLabel = (!model || model.id === 'NOVA-core' || model.builtin)
      ? 'NOVA Image Core'
      : (model.name || 'NOVA Image Core');
    const media = await novaMedia.generateImage(message, mediaLabel, {
      referenceImageDataUrl: opts.referenceImageDataUrl,
      allowNsfw: Boolean(opts.allowNsfw),
    });
    return {
      ok: media.ok !== false,
      reply: media.reply,
      modelId: modelId || 'NOVA-image-core',
      modelName: media.modelName || mediaLabel,
      source: media.source || 'ark-media',
      media: media.dataUrl ? {
        kind: 'image',
        dataUrl: media.dataUrl,
        path: media.path,
        libraryId: media.libraryId,
        real: Boolean(media.real),
      } : undefined,
    };
  }
  if (kind === 'video' || (modelId && String(modelId).includes('video'))) {
    const media = await novaMedia.generateVideo(message, model?.name || 'NOVA Video Core', {
      durationSec: opts.mediaDurationSec,
    });
    return {
      ok: media.ok !== false,
      reply: media.reply,
      modelId: modelId || 'NOVA-video-core',
      modelName: media.modelName,
      source: media.source || 'ark-media',
      media: media.dataUrl ? {
        kind: 'video',
        dataUrl: media.dataUrl,
        path: media.path,
        libraryId: media.libraryId,
        real: Boolean(media.real),
      } : undefined,
    };
  }

  const visionImages = opts.visionImages;
  if (Array.isArray(visionImages) && visionImages.length > 0) {
    const vlId = 'qwen2-vl-7b';
    if (!hasRealWeights(vlId) || !(novaGguf.hasVlBundle?.(vlId))) {
      throw new Error('Qwen2-VL is not installed. Download the vision bundle from Models → Vision in Local AI.');
    }
    if (phase !== 'online' && phase !== 'degraded') {
      throw new Error('NOVA Engine is offline. Start it from Local AI.');
    }
    const onChunk = typeof opts.onChunk === 'function' ? opts.onChunk : null;
    const gguf = await novaGguf.runGgufStream(
      vlId,
      message,
      onChunk,
      300_000,
      2048,
      0.35,
      {
        images: visionImages,
        jobId: opts.jobId,
        chatId: opts.chatId,
      },
    );
    return {
      ok: true,
      reply: gguf.reply,
      modelId: vlId,
      modelName: 'Qwen2-VL 7B Instruct',
      source: 'ark-gguf-vl',
      streamed: Boolean(gguf.streamed),
    };
  }

  if (requestedId === 'NOVA-core') {
    return {
      ok: true,
      reply: novaCoreGenerate(message, 'NOVA Core'),
      modelId: 'NOVA-core',
      modelName: 'NOVA Core',
      source: 'NOVA-template',
      template: true,
    };
  }

  if (phase !== 'online' && phase !== 'degraded') {
    throw new Error('NOVA Engine is offline. Start it from Local AI.');
  }
  if (phase === 'degraded' && !novaGguf.findLlamaBinary()) {
    throw new Error('NOVA Engine is degraded — local runtime is not ready. Open Local AI to install a brain.');
  }

  const ramGb = Math.round(os.totalmem() / (1024 * 1024 * 1024));
  // Only honor a caller-specified id. activeModelId must not pin Lindsay/Auto to 1.5B.
  const explicit = requestedId && requestedId !== 'NOVA-core' && requestedId !== 'NOVA-auto';
  if (!explicit || !model || model.status !== 'ready' || !model.gguf) {
    const intent = novaModelRank.classifyIntent(message, kind);
    const pickedId = novaModelRank.pickReadyEngineId(models, intent, ramGb);
    if (pickedId) {
      const hit = models.find((m) => m.id === pickedId);
      if (hit) model = hit;
    } else {
      const ggufReady = models.find((m) => m.gguf && m.status === 'ready');
      if (ggufReady) model = ggufReady;
    }
  }

  if (!model || (model.status !== 'ready' && !model.gguf)) {
    throw new Error('Selected model is not ready in NOVA Engine');
  }

  const ggufId = String(model.id).startsWith('gguf:')
    ? String(model.id).slice(5)
    : model.id;

  if (novaGguf.findGgufForModel(ggufId) && novaGguf.findLlamaBinary()) {
    try {
      const onChunk = typeof opts.onChunk === 'function' ? opts.onChunk : null;
      // Coding crafts need long walls — 32B Q4 often needs 15–25+ min for a full App.
      // Old 7-minute cap killed mid-@@@FILE and looked like "incomplete code".
      const timeoutMs = kind === 'coding' ? 1_800_000 : 600_000;
      const shareGpu = Boolean(novaGguf.getGgufPerfPolicy?.()?.shareGpu);
      const nPredictMin = kind === 'coding'
        ? (shareGpu ? 8192 : 16384)
        : (shareGpu ? 4096 : 8192);
      const requested = typeof opts.nPredict === 'number' && Number.isFinite(opts.nPredict)
        ? opts.nPredict
        : nPredictMin;
      // Cap output to what the real window can hold — never floor at 16k when ctx cannot fit it.
      // Old Math.max(nPredictMin, ctx - reserve) forced coding n_predict=16384 on 8–27 GB machines.
      const ctx = typeof novaGguf.getGgufCtx === 'function'
        ? novaGguf.getGgufCtx()
        : (Number(novaGguf.GGUF_CTX) || 16384);
      const promptStr = String(message || '');
      const promptTokens = Math.ceil(promptStr.length / 3.6);
      const nPredictCap = Math.max(512, ctx - promptTokens - 256);
      const nPredict = Math.max(512, Math.min(Math.max(requested, 1024), nPredictCap));
      try {
        console.log(
          `[NOVA-engine] nPredict kind=${kind} ctx=${ctx} promptTokens≈${promptTokens} nPredict=${nPredict} (cap=${nPredictCap} req=${requested} min=${nPredictMin})`,
        );
      } catch { /* ignore */ }
      // Per-kind defaults: coding stays precise; chat a bit freer. Caller opts still win.
      const kindTemp = kind === 'coding' ? 0.2 : kind === 'chat' ? 0.6 : 0.55;
      const temperature = typeof opts.temperature === 'number' ? opts.temperature : kindTemp;
      const gguf = await novaGguf.runGgufStream(
        ggufId,
        message,
        onChunk,
        timeoutMs,
        nPredict,
        temperature,
        { jobId: opts.jobId, chatId: opts.chatId, kind },
      );
      let reply = gguf.reply;
      if (gguf.truncated || (reply && reply.length > nPredict * 3)) {
        reply = `${reply}\n\n_Stopped at length limit — ask to continue._`;
      }
      return {
        ok: true,
        reply,
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
  if (hasRealGguf(DEFAULT_BRAIN_ID) && novaGguf.findLlamaBinary()) {
    try {
      const gguf = await novaGguf.runGguf(DEFAULT_BRAIN_ID, message);
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
  return novaHunt.register(meta);
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
  scanExternalGgufs,
  deleteInstalledModel,
  diskSpaceForModels,
  ensureRuntime,
  generate,
  listModels,
  DEFAULT_BRAIN_ID,
};
