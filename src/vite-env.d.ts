/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    arkDesktop?: {
      isElectron: boolean;
      platform: string;
      versions: {
        electron: string;
        chrome: string;
        node: string;
      };
      openExternal?: (url: string) => Promise<boolean>;
      openPath?: (targetPath: string) => Promise<boolean>;
      windowControls?: boolean;
      windowMinimize?: () => Promise<boolean>;
      windowMaximizeToggle?: () => Promise<boolean>;
      windowIsMaximized?: () => Promise<boolean>;
      windowClose?: () => Promise<boolean>;
      appMeta?: () => Promise<{
        ok: boolean;
        isPackaged?: boolean;
        isDev?: boolean;
        version?: string;
        name?: string;
      }>;
      setupGet?: () => Promise<{ ok: boolean; completed?: boolean }>;
      setupSet?: (completed: boolean) => Promise<{ ok: boolean; completed?: boolean }>;
      systemInfo?: () => Promise<{
        ok: boolean;
        os?: string;
        platform?: string;
        arch?: string;
        cpu?: string;
        cpuCores?: number;
        cpuPhysicalCores?: number;
        ramGb?: number;
        ramRawGb?: number;
        ramFreeGb?: number;
        gpu?: string;
        vramGb?: number | null;
        motherboard?: string;
        acceleration?: string;
        hostname?: string;
      }>;
      speedTest?: () => Promise<{
        ok: boolean;
        MBps: number;
        source?: string;
        bytes?: number;
        ms?: number;
        error?: string;
      }>;
      httpGet?: (
        url: string,
        headers?: Record<string, string>,
      ) => Promise<{ ok: boolean; status: number; data: unknown }>;
      httpRequest?: (
        url: string,
        options?: {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
        },
      ) => Promise<{ ok: boolean; status: number; data: unknown }>;
      brainStatus?: () => Promise<{ ok: boolean; url: string; engine?: unknown }>;
      engineStatus?: () => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineStart?: () => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineStop?: () => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineSetModel?: (id: string) => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineDownload?: (id: string) => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineDownloadProgress?: (id: string) => Promise<number>;
      engineDownloadError?: (id: string) => Promise<string | null>;
      engineEnsureRuntime?: () => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineGenerate?: (
        message: string,
        modelId?: string,
        kind?: 'image' | 'video' | 'chat',
      ) => Promise<{
        ok: boolean;
        reply: string;
        modelId: string;
        modelName: string;
        source: string;
        media?: { kind: string; dataUrl: string; path?: string; libraryId?: string; real?: boolean };
      }>;
      previewStart?: (payload: {
        projectId: string;
        projectName?: string;
        files: Record<string, string>;
      }) => Promise<{ ok: boolean; url: string; port: number; root: string }>;
      previewStop?: (projectId: string) => Promise<{ ok: boolean }>;
      previewStatus?: (projectId: string) => Promise<{
        ok: boolean;
        running?: boolean;
        url?: string;
        port?: number;
      }>;
      mediaLibrary?: () => Promise<{
        ok: boolean;
        items: Array<{
          id: string;
          kind?: string;
          title?: string;
          prompt?: string;
          modelName?: string;
          dataUrl?: string;
          createdAt?: string;
          real?: boolean;
          source?: string;
          path?: string;
        }>;
        error?: string;
      }>;
      mediaClear?: () => Promise<{ ok: boolean; error?: string }>;
      mediaGet?: (id: string) => Promise<{
        ok: boolean;
        item?: {
          id: string;
          kind?: string;
          title?: string;
          prompt?: string;
          modelName?: string;
          dataUrl?: string;
          createdAt?: string;
          real?: boolean;
          source?: string;
        };
        error?: string;
      }>;
      projectWrite?: (payload: {
        projectId: string;
        projectName?: string;
        files: Record<string, string>;
      }) => Promise<{ ok: boolean; root?: string; files?: string[]; error?: string }>;
      projectRead?: (projectId: string) => Promise<{
        ok: boolean;
        root?: string;
        files?: Record<string, string>;
        meta?: { id?: string; name?: string; root?: string } | null;
        error?: string;
      }>;
      projectPath?: (projectId: string) => Promise<{ ok: boolean; root?: string; error?: string }>;
      secretsStatus?: () => Promise<{ ok: boolean; encrypted?: boolean }>;
      secretsLoad?: () => Promise<{
        ok: boolean;
        keys?: Record<string, string>;
        encrypted?: boolean;
        error?: string;
      }>;
      secretsSave?: (keys: Record<string, string>) => Promise<{
        ok: boolean;
        encrypted?: boolean;
        error?: string;
      }>;
    };
  }
}
