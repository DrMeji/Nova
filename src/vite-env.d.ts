/// <reference types="vite/client" />

export {};

declare global {
  interface Window {
    arkDesktop?: {
      isElectron: boolean;
      isPackaged?: boolean;
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
      onWindowMaximized?: (handler: (payload: { maximized?: boolean }) => void) => () => void;
      appMeta?: () => Promise<{
        ok: boolean;
        isPackaged?: boolean;
        isDev?: boolean;
        version?: string;
        name?: string;
        updateFeed?: string;
      }>;
      updateCheck?: () => Promise<{
        ok: boolean;
        newerAvailable?: boolean;
        currentVersion?: string;
        latestTag?: string;
        latestName?: string;
        setupAssetUrl?: string;
        message?: string;
      }>;
      updateDownload?: (payload?: {
        setupAssetUrl?: string;
        latestTag?: string;
      }) => Promise<{ ok: boolean; message?: string }>;
      updateState?: () => Promise<{
        status: string;
        percent: number;
        message: string;
        version?: string;
        error?: string;
      }>;
      postUpdateConsume?: () => Promise<{ ok: boolean; land?: string | null }>;
      onUpdateProgress?: (
        handler: (payload: {
          status: string;
          percent: number;
          message: string;
          version?: string;
          error?: string;
        }) => void,
      ) => () => void;
      authStorageGet?: (key: string) => Promise<string | null>;
      authStorageSet?: (key: string, value: string) => Promise<boolean>;
      authStorageRemove?: (key: string) => Promise<boolean>;
      loginItemGet?: () => Promise<{
        ok: boolean;
        openAtLogin?: boolean;
        openAsHidden?: boolean;
        isPackaged?: boolean;
        canSetLoginItem?: boolean;
      }>;
      loginItemSet?: (openAtLogin: boolean) => Promise<{
        ok: boolean;
        openAtLogin?: boolean;
        devBlocked?: boolean;
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
        downMBps?: number;
        upMBps?: number;
        source?: string;
        host?: string;
        preferredHost?: string;
        preferredHostName?: string;
        hosts?: Array<{
          id: string;
          name: string;
          ok: boolean;
          MBps: number;
          rttMs?: number;
          error?: string;
        }>;
        samples?: number;
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
          authProviderId?: string;
        },
      ) => Promise<{ ok: boolean; status: number; data: unknown }>;
      httpStream?: (
        url: string,
        options?: {
          method?: string;
          headers?: Record<string, string>;
          body?: string;
          streamId?: string;
        },
      ) => Promise<{ ok: boolean; status?: number; streamId?: string; text?: string; error?: string }>;
      onHttpStreamChunk?: (
        handler: (payload: {
          streamId?: string;
          type?: string;
          text?: string;
          error?: string;
          status?: number;
        }) => void,
      ) => () => void;
      brainStatus?: () => Promise<{
        ok: boolean;
        url: string;
        contractVersion?: string;
        engine?: unknown;
        auth?: string;
        hasToken?: boolean;
      }>;
      brainTokenGet?: () => Promise<{ ok: boolean; token?: string; url?: string; hasToken?: boolean; packaged?: boolean }>;
      brainTokenRotate?: () => Promise<{ ok: boolean; token?: string; url?: string }>;
      pluginOAuthStart?: (pluginId: string) => Promise<{
        ok: boolean;
        accessToken?: string;
        accountLabel?: string;
        message?: string;
        needsConfig?: boolean;
      }>;
      pluginOAuthStatus?: () => Promise<{ ok: boolean; github?: boolean; google?: boolean; notion?: boolean; stored?: Record<string, string> }>;
      pluginOAuthSetClient?: (pluginId: string, clientId: string) => Promise<{ ok: boolean }>;
      localReportsList?: () => Promise<{ ok: boolean; items?: unknown[]; path?: string }>;
      localReportsClear?: () => Promise<{ ok: boolean }>;
      localReportsOpen?: () => Promise<{ ok: boolean; path?: string }>;
      signingStatus?: () => Promise<{ ok: boolean; packaged?: boolean; signed?: boolean | null; status?: string }>;
      engineGenerateStream?: (
        message: string,
        modelId?: string,
        kind?: string,
      ) => Promise<{
        ok?: boolean;
        reply: string;
        modelName?: string;
        source?: string;
        cancelled?: boolean;
        media?: { kind: string; dataUrl: string; path?: string; libraryId?: string; real?: boolean };
      }>;
      engineGenerateCancel?: () => Promise<{ ok: boolean; error?: string }>;
      onEngineChunk?: (handler: (payload: { text?: string }) => void) => () => void;
      engineStatus?: () => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineStart?: () => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineStop?: () => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineSetModel?: (id: string) => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineDownload?: (id: string) => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineRegisterHunt?: (meta: {
        id: string;
        name: string;
        url: string;
        sizeGb: number;
        detail?: string;
        category?: 'coding' | 'chat';
      }) => Promise<{ ok: boolean; error?: string; model?: unknown }>;
      engineDownloadProgress?: (id: string) => Promise<number>;
      engineDownloadError?: (id: string) => Promise<string | null>;
      engineDownloadCancel?: (id: string) => Promise<{ ok: boolean; canceled?: boolean; canceling?: boolean; error?: string }>;
      engineImportGguf?: (filePath: string) => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineImportGgufPick?: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        count?: number;
        status?: import('@/lib/arkEngine').ArkEngineStatus;
      }>;
      engineDeleteModel?: (id: string) => Promise<
        import('@/lib/arkEngine').ArkEngineStatus & { ok: boolean; error?: string; deleted?: string; removed?: number }
      >;
      engineDiskSpace?: () => Promise<{
        ok: boolean;
        freeBytes?: number | null;
        totalBytes?: number | null;
        freeGb?: number | null;
        path?: string;
      }>;
      engineEnsureRuntime?: () => Promise<import('@/lib/arkEngine').ArkEngineStatus>;
      engineGenerate?: (
        message: string,
        modelId?: string,
        kind?: 'image' | 'video' | 'chat' | 'coding',
      ) => Promise<{
        ok: boolean;
        reply: string;
        modelId: string;
        modelName: string;
        source: string;
        media?: { kind: string; dataUrl: string; path?: string; libraryId?: string; real?: boolean };
      }>;
      modelsDirInfo?: () => Promise<{
        modelsDir: string;
        defaultModelsDir: string;
        isCustom: boolean;
      }>;
      modelsDirPick?: () => Promise<{
        ok: boolean;
        canceled?: boolean;
        modelsDir?: string;
        isCustom?: boolean;
        error?: string;
      }>;
      modelsDirSet?: (folderPath: string) => Promise<{
        ok: boolean;
        modelsDir?: string;
        isCustom?: boolean;
        error?: string;
      }>;
      modelsDirReset?: () => Promise<{
        ok: boolean;
        modelsDir: string;
        isCustom: boolean;
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
      previewOpenWindow?: (payload: {
        projectId: string;
        url: string;
        title?: string;
        kind?: 'web' | 'device';
        device?: { label: string; width: number; height: number; family?: string };
      }) => Promise<{ ok: boolean; error?: string }>;
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
      mediaRemove?: (id: string) => Promise<{ ok: boolean; removed?: boolean; error?: string }>;
      projectWrite?: (payload: {
        projectId: string;
        projectName?: string;
        files: Record<string, string>;
        sandbox?: boolean;
      }) => Promise<{ ok: boolean; root?: string; files?: string[]; error?: string; sandboxBlocked?: string[] }>;
      projectRead?: (projectId: string) => Promise<{
        ok: boolean;
        root?: string;
        files?: Record<string, string>;
        meta?: { id?: string; name?: string; root?: string } | null;
        error?: string;
      }>;
      projectPath?: (projectId: string) => Promise<{ ok: boolean; root?: string; error?: string }>;
      projectImportFolder?: (payload?: {
        projectId: string;
        projectName?: string;
        sourceDir?: string;
      }) => Promise<{
        ok: boolean;
        canceled?: boolean;
        root?: string;
        files?: Record<string, string>;
        copied?: number;
        name?: string;
        skipped?: { env?: number; large?: number; binary?: number; limit?: number };
        error?: string;
      }>;
      projectSearch?: (payload: {
        projectId: string;
        query: string;
        limit?: number;
      }) => Promise<{
        ok: boolean;
        hits?: { path: string; line: number; text: string }[];
        error?: string;
      }>;
      gitStatus?: (projectId: string) => Promise<{
        ok: boolean;
        git?: boolean;
        branch?: string | null;
        dirty?: number;
        files?: string[];
        log?: string[];
        diff?: string;
        remote?: string;
        error?: string;
      }>;
      gitClone?: (payload: {
        projectId: string;
        url: string;
        token?: string;
      }) => Promise<{
        ok: boolean;
        git?: boolean;
        branch?: string | null;
        dirty?: number;
        remote?: string;
        message?: string;
        error?: string;
      }>;
      gitCommit?: (payload: {
        projectId: string;
        message?: string;
      }) => Promise<{ ok: boolean; message?: string; dirty?: number; branch?: string | null; error?: string }>;
      gitPush?: (payload: {
        projectId: string;
        token?: string;
      }) => Promise<{ ok: boolean; message?: string; remote?: string; error?: string }>;
      gitDiff?: (projectId: string) => Promise<{
        ok: boolean;
        text?: string;
        git?: boolean;
        branch?: string | null;
        dirty?: number;
        log?: string[];
        diff?: string;
        remote?: string;
        error?: string;
      }>;
      gitSetOrigin?: (payload: {
        projectId: string;
        remoteUrl: string;
      }) => Promise<{ ok: boolean; remote?: string; error?: string }>;
      secretsStatus?: () => Promise<{ ok: boolean; encrypted?: boolean }>;
      secretsLoad?: () => Promise<{
        ok: boolean;
        keyStatus?: Record<string, boolean>;
        encrypted?: boolean;
        error?: string;
      }>;
      secretsGetKey?: (providerId: string) => Promise<{
        ok: boolean;
        key?: string;
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
