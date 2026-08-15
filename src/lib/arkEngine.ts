/** Client for ARK Engine — ARK's own local runtime (never a third-party local app). */

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
  phase: 'offline' | 'starting' | 'online';
  activeModelId: string;
  activeModelName: string;
  modelsDir: string;
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
  if (window.arkDesktop?.engineStatus) {
    return window.arkDesktop.engineStatus();
  }
  return {
    ok: false,
    service: 'ark-engine',
    version: '0.4.0',
    phase: 'offline',
    activeModelId: 'ark-core',
    activeModelName: 'ARK Core',
    modelsDir: '(desktop only)',
    models: [
      {
        id: 'ark-core',
        name: 'ARK Core',
        detail: 'Built-in',
        sizeGb: 0,
        status: 'ready',
      },
    ],
    note: 'ARK Engine runs inside the desktop app. Open ARK via Electron for full local power.',
    defaultBrainId: DEFAULT_LOCAL_BRAIN_ID,
  };
}

export async function startEngine() {
  if (window.arkDesktop?.engineStart) return window.arkDesktop.engineStart();
  return getEngineStatus();
}

export async function stopEngine() {
  if (window.arkDesktop?.engineStop) return window.arkDesktop.engineStop();
  return getEngineStatus();
}

export async function setEngineModel(id: string) {
  if (window.arkDesktop?.engineSetModel) return window.arkDesktop.engineSetModel(id);
  throw new Error('ARK Engine model switching needs the desktop app');
}

export async function downloadEngineModel(id: string) {
  if (window.arkDesktop?.engineDownload) return window.arkDesktop.engineDownload(id);
  throw new Error('Model installs need the desktop app');
}

export async function engineDownloadProgress(id: string) {
  if (window.arkDesktop?.engineDownloadProgress) {
    return window.arkDesktop.engineDownloadProgress(id);
  }
  return 0;
}

export async function engineDownloadError(id: string) {
  if (window.arkDesktop?.engineDownloadError) {
    return window.arkDesktop.engineDownloadError(id);
  }
  return null;
}

export async function ensureEngineRuntime() {
  if (window.arkDesktop?.engineEnsureRuntime) {
    return window.arkDesktop.engineEnsureRuntime();
  }
  throw new Error('Runtime install needs the desktop app');
}

export async function engineGenerate(
  message: string,
  modelId?: string,
  kind?: 'image' | 'video' | 'chat',
) {
  if (window.arkDesktop?.engineGenerate) {
    return window.arkDesktop.engineGenerate(message, modelId, kind);
  }
  return {
    ok: true,
    reply: [
      'ARK Engine · browser preview',
      '',
      `I heard: “${message.slice(0, 200)}”`,
      '',
      'Full local ARK Engine runs inside the desktop app.',
    ].join('\n'),
    modelId: modelId ?? 'ark-core',
    modelName: 'ARK Core',
    source: 'ark-engine',
  };
}
