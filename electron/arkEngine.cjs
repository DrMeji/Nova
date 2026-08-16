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
const arkFetch = require('./arkFetch.cjs');
const arkPaths = require('./arkPaths.cjs');

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
    detail: 'Built-in image · Image tab · ARK Engine',
    sizeGb: 2.4,
    status: 'ready',
    builtin: true,
  },
  {
    id: 'ark-video-core',
    name: 'ARK Video Core',
    detail: 'Built-in video · Video tab · ARK Engine',
    sizeGb: 3.2,
    status: 'ready',
    builtin: true,
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
];

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
/** @type {Record<string, { progress: number, error?: string, phase?: string }>} */
const downloads = {};

function listModels() {
  const ggufs = arkGguf.listGgufFiles();
  return CATALOG.map((m) => {
    if (m.builtin) {
      return { ...m, status: 'ready', gguf: false };
    }
    const downloading = Boolean(downloads[m.id]);
    const ready = hasRealGguf(m.id);
    return {
      ...m,
      status: downloading ? 'downloading' : ready ? 'ready' : 'missing',
      progress: downloads[m.id]?.progress,
      gguf: ready,
    };
  }).concat(
    ggufs
      .filter((g) => !CATALOG.some((c) => !c.builtin && arkGguf.findGgufForModel(c.id) === g.path))
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
  setTimeout(() => {
    phase = 'online';
  }, 400);
  return getStatus();
}

function stop() {
  phase = 'offline';
  return getStatus();
}

function setActiveModel(id) {
  const models = listModels();
  const found = models.find((m) => m.id === id && m.status === 'ready');
  if (!found) throw new Error('Model not installed in ARK Engine');
  activeModelId = id;
  return getStatus();
}

function beginDownload(id) {
  const meta = CATALOG.find((m) => m.id === id);
  if (!meta) throw new Error('Unknown model');
  if (meta.builtin) return getStatus();
  if (!meta.url) throw new Error('No download URL for this model');
  if (downloads[id]) return getStatus();
  if (hasRealGguf(id) && arkGguf.findLlamaBinary()) {
    writeMarker(id, meta, { path: arkGguf.findGgufForModel(id) });
    activeModelId = id;
    return getStatus();
  }

  ensureDirs();
  downloads[id] = { progress: 1, phase: 'runtime' };

  void (async () => {
    try {
      await arkGguf.ensureLlamaBinary((pct) => {
        if (downloads[id]) {
          downloads[id].phase = 'runtime';
          downloads[id].progress = Math.max(1, Math.round(pct * 0.25));
        }
      });

      if (hasRealGguf(id)) {
        writeMarker(id, meta, { path: arkGguf.findGgufForModel(id) });
        if (downloads[id]) downloads[id].progress = 100;
        delete downloads[id];
        activeModelId = id;
        return;
      }

      const dest = path.join(modelsDir(), `${id}.gguf`);
      downloads[id].phase = 'weights';
      await arkFetch.downloadToFile(meta.url, dest, (pct) => {
        if (downloads[id]) {
          downloads[id].progress = Math.min(99, 25 + Math.round(pct * 0.75));
        }
      });

      writeMarker(id, meta, { path: dest, bytes: fs.statSync(dest).size });
      if (downloads[id]) downloads[id].progress = 100;
      delete downloads[id];
      activeModelId = id;
    } catch (err) {
      if (downloads[id]) {
        downloads[id].error = err instanceof Error ? err.message : String(err);
        downloads[id].progress = 0;
      }
      setTimeout(() => {
        delete downloads[id];
      }, 8000);
      try {
        const partial = path.join(modelsDir(), `${id}.gguf.partial`);
        if (fs.existsSync(partial)) fs.unlinkSync(partial);
      } catch {
        /* ignore */
      }
    }
  })();

  return getStatus();
}

function downloadProgress(id) {
  if (downloads[id]) return downloads[id].progress ?? 0;
  if (hasRealGguf(id)) return 100;
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
    'Install the default local brain from Local AI (Qwen2.5 1.5B) or connect Groq / Google / OpenRouter.',
  ].join('\n');
}

async function generate(message, opts = {}) {
  const modelId = opts.modelId || activeModelId;
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

  if (phase !== 'online') {
    throw new Error('ARK Engine is offline. Start it from Local AI.');
  }

  // Prefer any ready GGUF when caller asked for ark-core / auto / missing id
  const ggufReady = models.find((m) => m.gguf && m.status === 'ready');
  if ((!model || model.id === 'ark-core' || model.status !== 'ready') && ggufReady) {
    model = ggufReady;
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
      const gguf = await arkGguf.runGgufStream(ggufId, message, onChunk);
      return {
        ok: true,
        reply: gguf.reply,
        modelId: model.id,
        modelName: model.name,
        source: 'ark-gguf',
        streamed: Boolean(gguf.streamed),
      };
    } catch (err) {
      return {
        ok: true,
        reply: [
          'Local GGUF brain failed to run.',
          err instanceof Error ? err.message : 'unavailable',
          '',
          'Try Local AI → reinstall the brain, or connect a free cloud key.',
        ].join('\n'),
        modelId: model.id,
        modelName: model.name,
        source: 'ark-engine',
      };
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

  const reply = arkCoreGenerate(message, model.name);
  return {
    ok: true,
    reply,
    modelId: model.id,
    modelName: model.name,
    source: 'ark-engine',
  };
}

module.exports = {
  getStatus,
  start,
  stop,
  setActiveModel,
  beginDownload,
  downloadProgress,
  downloadError,
  ensureRuntime,
  generate,
  listModels,
  DEFAULT_BRAIN_ID,
};
