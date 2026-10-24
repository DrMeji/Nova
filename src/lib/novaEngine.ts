import { getLocalPrefs } from '@/lib/localPrefs';
import { getChatJobId, getLastInflightChatId } from '@/lib/chatInflight';

export type ArkEngineModel = {
  id: string;
  name: string;
  detail: string;
  sizeGb: number;
  status: 'ready' | 'missing' | 'downloading';
  progress?: number;
};

export type ArkEngineStatus = {
  ok: boolean;
  service: string;
  version: string;
  phase: 'offline' | 'starting' | 'online' | 'degraded';
  activeModelId: string;
  activeModelName: string;
  modelsDir: string;
  modelsDirDefault?: string;
  modelsDirIsCustom?: boolean;
  models: ArkEngineModel[];
  modelFiles?: Array<{ file: string; path: string; sizeMb: number }>;
  note: string;
  ggufBinary?: boolean;
  ggufBinaryPath?: string | null;
  ggufCount?: number;
  defaultBrainId?: string;
};

export const DEFAULT_LOCAL_BRAIN_ID = 'qwen25-15b';

export async function getEngineStatus(): Promise<ArkEngineStatus> {
  if (window.novaDesktop?.engineStatus) {
    return window.novaDesktop.engineStatus();
  }
  return {
    ok: false,
    service: 'nova-engine',
    version: '0.4.0',
    phase: 'offline',
    activeModelId: 'NOVA-core',
    activeModelName: 'NOVA Core',
    modelsDir: '(desktop only)',
    models: [
      {
        id: 'NOVA-core',
        name: 'NOVA Core',
        detail: 'Built-in',
        sizeGb: 0,
        status: 'ready',
      },
    ],
    note: 'NOVA Engine runs inside the desktop app. Open NOVA via Electron for full local power.',
    defaultBrainId: DEFAULT_LOCAL_BRAIN_ID,
  };
}

export async function startEngine() {
  if (window.novaDesktop?.engineStart) return window.novaDesktop.engineStart();
  return getEngineStatus();
}

export async function stopEngine() {
  if (window.novaDesktop?.engineStop) return window.novaDesktop.engineStop();
  return getEngineStatus();
}

export async function setEngineModel(id: string) {
  const want = String(id || '').trim();
  if (!want) throw new Error('NOVA Engine model id required');
  // Skip reload when the engine already has this model active (create phase hops).
  try {
    const st = await getEngineStatus();
    if (st && String(st.activeModelId || '') === want) return st;
  } catch { /* fall through to set */ }
  if (window.novaDesktop?.engineSetModel) return window.novaDesktop.engineSetModel(want);
  throw new Error('NOVA Engine model switching needs the desktop app');
}

/** Currently loaded engine model id, or '' if unknown. */
export async function engineLoadedModel(): Promise<string> {
  try {
    const st = await getEngineStatus();
    return String(st?.activeModelId || '').trim();
  } catch {
    return '';
  }
}

export async function downloadEngineModel(id: string) {
  if (window.novaDesktop?.engineDownload) return window.novaDesktop.engineDownload(id);
  throw new Error('Model installs need the desktop app');
}

export async function engineDownloadProgress(id: string) {
  if (window.novaDesktop?.engineDownloadProgress) {
    return window.novaDesktop.engineDownloadProgress(id);
  }
  return 0;
}

export async function engineDownloadError(id: string) {
  if (window.novaDesktop?.engineDownloadError) {
    return window.novaDesktop.engineDownloadError(id);
  }
  return null;
}

export async function engineDownloadCancel(id: string) {
  if (window.novaDesktop?.engineDownloadCancel) {
    return window.novaDesktop.engineDownloadCancel(id);
  }
  return { ok: false, error: 'Desktop only' };
}

export async function importGgufPick() {
  if (window.novaDesktop?.engineImportGgufPick) {
    return window.novaDesktop.engineImportGgufPick();
  }
  throw new Error('Import needs the desktop app');
}

export async function importGgufPath(filePath: string) {
  if (window.novaDesktop?.engineImportGguf) {
    const result = await window.novaDesktop.engineImportGguf(filePath);
    window.dispatchEvent(new Event('NOVA:engine-models-changed'));
    return result;
  }
  throw new Error('Import needs the desktop app');
}

export type ExternalGgufHit = {
  path: string;
  fileName: string;
  sizeGb: number;
  source: string;
  catalogId: string | null;
  mmproj?: boolean;
};

export async function scanExternalGgufs(): Promise<{
  ok: boolean;
  count: number;
  models: ExternalGgufHit[];
  scannedRoots?: string[];
  note?: string;
  error?: string;
}> {
  if (window.novaDesktop?.engineScanExternalGgufs) {
    const r = await window.novaDesktop.engineScanExternalGgufs();
    return {
      ok: Boolean(r?.ok),
      count: r?.count ?? 0,
      models: r?.models || [],
      scannedRoots: r?.scannedRoots,
      note: r?.note,
      error: r?.error,
    };
  }
  return { ok: false, count: 0, models: [], error: 'Desktop only' };
}

export async function deleteEngineModel(id: string): Promise<ArkEngineStatus & { ok: boolean; error?: string; deleted?: string }> {
  if (!window.novaDesktop?.engineDeleteModel) {
    throw new Error('Deleting models needs the desktop app');
  }
  const result = await window.novaDesktop.engineDeleteModel(id);
  window.dispatchEvent(new Event('NOVA:engine-models-changed'));
  return result;
}

export async function engineDiskSpace() {
  if (window.novaDesktop?.engineDiskSpace) {
    return window.novaDesktop.engineDiskSpace();
  }
  return { ok: false, freeBytes: null, totalBytes: null, freeGb: null };
}

export async function ensureEngineRuntime() {
  if (window.novaDesktop?.engineEnsureRuntime) {
    return window.novaDesktop.engineEnsureRuntime();
  }
  throw new Error('Runtime install needs the desktop app');
}

function ggufNPredictForKind(kind?: 'image' | 'video' | 'chat' | 'coding') {
  const prefs = getLocalPrefs();
  // Share-GPU / gaming: shorter coding generations so VRAM+decode do not pin the card for minutes.
  const share = prefs.shareGpuMode !== false;
  const min = kind === 'coding'
    ? (share ? 8192 : 16384)
    : (share ? 4096 : 8192);
  return Math.max(Number(prefs.ggufNPredict) || 0, min);
}

/** Push share-GPU / create-inflight policy into the Electron GGUF runtime. */
export async function syncEnginePerfPolicy(opts?: { createInflight?: boolean }): Promise<void> {
  try {
    const prefs = getLocalPrefs();
    const api = window.novaDesktop as { engineSetPerfPolicy?: (p: {
      shareGpu?: boolean;
      createInflight?: boolean;
    }) => Promise<unknown> } | undefined;
    await api?.engineSetPerfPolicy?.({
      shareGpu: prefs.shareGpuMode !== false,
      createInflight: Boolean(opts?.createInflight),
    });
  } catch {
    /* browser preview / older preload */
  }
}

export async function engineGenerate(
  message: string,
  modelId?: string,
  kind?: 'image' | 'video' | 'chat' | 'coding',
  opts?: {
    mediaDurationSec?: number;
    referenceImageDataUrl?: string;
    visionImages?: string[];
    /** Override n_predict (e.g. voice tab short replies). */
    nPredict?: number;
    jobId?: string;
    chatId?: string;
  },
) {
  const prefs = getLocalPrefs();
  const chatId = opts?.chatId || getLastInflightChatId() || undefined;
  const jobId = opts?.jobId || (chatId ? getChatJobId(chatId) || undefined : undefined);
  const sampling = {
    temperature: prefs.ggufTemperature,
    nPredict: opts?.nPredict ?? ggufNPredictForKind(kind),
    mediaDurationSec: opts?.mediaDurationSec,
    referenceImageDataUrl: opts?.referenceImageDataUrl,
    allowNsfw: Boolean(prefs.allowNsfw),
    visionImages: opts?.visionImages,
    jobId,
    chatId,
  };
  if (window.novaDesktop?.engineGenerate) {
    await syncEnginePerfPolicy({ createInflight: kind === 'coding' });
    // Let Thinking… dots paint before a heavy local GGUF turn can stall the UI thread.
    // Hidden/minimized windows never fire rAF — race a timer so generation always starts.
    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      requestAnimationFrame(() => {
        window.setTimeout(finish, 0);
      });
      window.setTimeout(finish, 32);
    });
    return window.novaDesktop.engineGenerate(message, modelId, kind, sampling);
  }
  return {
    ok: true,
    reply: [
      'NOVA Engine · browser preview',
      '',
      `I heard: “${message.slice(0, 200)}”`,
      '',
      'Full local NOVA Engine runs inside the desktop app.',
    ].join('\n'),
    modelId: modelId ?? 'NOVA-core',
    modelName: 'NOVA Core',
    source: 'nova-engine',
  };
}

/** Stream local GGUF tokens into onChunk as llama-cli prints them. */
export async function engineGenerateStream(
  message: string,
  modelId: string | undefined,
  onChunk: (text: string) => void,
  kind?: 'image' | 'video' | 'chat' | 'coding',
  opts?: { visionImages?: string[]; jobId?: string; chatId?: string },
) {
  const prefs = getLocalPrefs();
  const chatId = opts?.chatId || getLastInflightChatId() || undefined;
  const jobId = opts?.jobId || (chatId ? getChatJobId(chatId) || undefined : undefined);
  const sampling = {
    temperature: prefs.ggufTemperature,
    nPredict: ggufNPredictForKind(kind),
    visionImages: opts?.visionImages,
    jobId,
    chatId,
  };
  if (window.novaDesktop?.engineGenerateStream) {
    await syncEnginePerfPolicy({ createInflight: kind === 'coding' });
    const stop = window.novaDesktop.onEngineChunk?.((payload) => {
      if (payload?.text) onChunk(payload.text);
    });
    try {
      return await window.novaDesktop.engineGenerateStream(message, modelId, kind, sampling);
    } finally {
      stop?.();
      if (kind === 'coding') {
        void syncEnginePerfPolicy({ createInflight: false });
      }
    }
  }
  return engineGenerate(message, modelId, kind, { jobId, chatId });
}

export async function engineGenerateCancel(opts?: { jobId?: string; chatId?: string }) {
  if (window.novaDesktop?.engineGenerateCancel) {
    return window.novaDesktop.engineGenerateCancel(opts);
  }
  return { ok: false };
}
