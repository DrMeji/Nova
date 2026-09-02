/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
declare global {
  interface Window {
    arkDesktop?: {
      isElectron: boolean;
      isPackaged?: boolean;
      isDevBuild?: boolean;
      platform: string;
      versions: {
        electron: string;
        chrome: string;
        node: string;
      };
      /** Absolute path for a dropped/selected File (Electron 32+). */
      getPathForFile?: (file: File) => string;
      openExternal?: (url: string) => Promise<{ ok: boolean; error?: string }>;
      openPath?: (targetPath: string) => Promise<boolean | { ok: boolean; error?: string }>;
      windowControls?: boolean;
      windowMinimize?: () => Promise<boolean>;
      windowMaximizeToggle?: () => Promise<boolean>;
      windowIsMaximized?: () => Promise<boolean>;
      windowClose?: () => Promise<boolean>;
      onWindowMaximized?: (handler: (payload: { maximized?: boolean }) => void) => () => void;
      onSystemSuspend?: (handler: () => void) => () => void;
      appMeta?: () => Promise<{
        ok: boolean;
        isPackaged?: boolean;
        isDevBuild?: boolean;
        isDev?: boolean;
        userDataProfile?: string;
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
      authRecoverySave?: (payload: {
        email?: string;
        password?: string;
        pin?: string;
      }) => Promise<{
        ok: boolean;
        path?: string;
        folder?: string;
        error?: string;
      }>;
      authRecoveryInfo?: () => Promise<{
        ok: boolean;
        path?: string;
        folder?: string;
        exists?: boolean;
        error?: string;
      }>;
      authRecoveryReveal?: () => Promise<{
        ok: boolean;
        path?: string;
        folder?: string;
        exists?: boolean;
        error?: string;
      }>;
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
      setupGet?: () => Promise<{ ok: boolean; completed?: boolean; installId?: string; freshInstall?: boolean }>;
      setupSet?: (completed: boolean) => Promise<{ ok: boolean; completed?: boolean; installId?: string }>;
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
          authProviderId?: string;
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
        opts?: { temperature?: number; nPredict?: number; mediaDurationSec?: number; referenceImageDataUrl?: string; visionImages?: string[] },
      ) => Promise<{
        ok?: boolean;
        reply: string;
        modelName?: string;
        source?: string;
        cancelled?: boolean;
        media?: { kind: string; dataUrl: string; path?: string; libraryId?: string; real?: boolean };
      }>;
      engineGenerateCancel?: () => Promise<{ ok: boolean; error?: string }>;
      webSearch?: (query: string) => Promise<{
        ok: boolean;
        text?: string;
        sources?: { title: string; url: string }[];
        error?: string;
      }>;
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
        opts?: { temperature?: number; nPredict?: number; mediaDurationSec?: number; referenceImageDataUrl?: string; visionImages?: string[] },
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
        windowOpen?: boolean;
        url?: string;
        port?: number;
      }>;
      previewOpenWindow?: (payload: {
        projectId: string;
        url: string;
        title?: string;
        kind?: 'web' | 'device';
        device?: { label: string; width: number; height: number; family?: string };
        forceNavigate?: boolean;
      }) => Promise<{ ok: boolean; error?: string; reused?: boolean }>;
      /** Close the shared Localhost/Preview window (disconnect on chat switch). */
      previewCloseLive?: () => Promise<{ ok: boolean }>;
      previewUpdate?: (payload: {
        projectId: string;
        files?: Record<string, string>;
        projectName?: string;
      }) => Promise<{ ok: boolean; url?: string; reloaded?: boolean; error?: string }>;
      previewReload?: (projectId: string) => Promise<{ ok: boolean; error?: string }>;
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
        meta?: { id?: string; name?: string; root?: string; inPlace?: boolean; kind?: string } | null;
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
        listed?: number;
        imagePaths?: string[];
        name?: string;
        path?: string;
        inPlace?: boolean;
        skipped?: { env?: number; large?: number; binary?: number; limit?: number };
        error?: string;
      }>;
      workspaceOpenRoot?: (payload?: {
        projectId: string;
        projectName?: string;
        sourceDir?: string;
        catalogOnly?: boolean;
      }) => Promise<{
        ok: boolean;
        canceled?: boolean;
        root?: string;
        files?: Record<string, string>;
        listed?: number;
        name?: string;
        inPlace?: boolean;
        catalogOnly?: boolean;
        error?: string;
      }>;
      workspaceMkdir?: (payload: {
        targetPath: string;
        useExisting?: boolean;
      }) => Promise<{
        ok: boolean;
        path?: string;
        created?: boolean;
        existed?: boolean;
        error?: string;
      }>;
      workspaceSandboxRoot?: () => Promise<{ ok: boolean; path?: string; error?: string }>;
      workspaceStatPath?: (targetPath: string) => Promise<{
        ok: boolean;
        path?: string;
        name?: string;
        isDirectory?: boolean;
        isFile?: boolean;
        error?: string;
      }>;
      workspaceSetGrants?: (grants: {
        desktop?: boolean;
        documents?: boolean;
        fullPc?: boolean;
        executionMode?: 'allowlist' | 'auto_review' | 'run_all';
      }) => Promise<{
        ok: boolean;
        grants?: {
          desktop: boolean;
          documents: boolean;
          fullPc: boolean;
          executionMode: 'allowlist' | 'auto_review' | 'run_all';
        };
        error?: string;
      }>;
      workspaceGetGrants?: () => Promise<{
        ok: boolean;
        grants?: {
          desktop: boolean;
          documents: boolean;
          fullPc: boolean;
          executionMode: 'allowlist' | 'auto_review' | 'run_all';
        };
        error?: string;
      }>;
      agentRun?: (payload: {
        command: string;
        cwd?: string;
        /** Ignored by main — mode comes from stored grants only. */
        mode?: 'allowlist' | 'auto_review' | 'run_all';
        skipConfirm?: boolean;
        userConfirmed?: boolean;
      }) => Promise<{
        ok: boolean;
        command?: string;
        cwd?: string;
        output?: string;
        error?: string;
        needsConfirm?: boolean;
      }>;
      agentStartDevServer?: (payload: { cwd?: string }) => Promise<{
        ok: boolean;
        cwd?: string;
        url?: string;
        error?: string;
      }>;
      mcpListTools?: (payload: {
        id: string;
        transport: 'stdio' | 'sse';
        command?: string;
        args?: string;
        cwd?: string;
        url?: string;
      }) => Promise<{
        ok: boolean;
        tools?: { name: string; description?: string }[];
        error?: string | null;
      }>;
      mcpCallTool?: (payload: {
        server: {
          id: string;
          transport: 'stdio' | 'sse';
          command?: string;
          args?: string;
          cwd?: string;
          url?: string;
        };
        name: string;
        arguments?: Record<string, unknown>;
      }) => Promise<{
        ok: boolean;
        content?: string;
        error?: string | null;
        isError?: boolean;
      }>;
      mcpStop?: (payload: { id?: string }) => Promise<{ ok: boolean; error?: string }>;
      workspaceDeletePath?: (payload: {
        projectId: string;
        relPath: string;
      }) => Promise<{ ok: boolean; path?: string; error?: string }>;
      workspaceDeleteRoot?: (payload: {
        projectId: string;
      }) => Promise<{ ok: boolean; path?: string; error?: string }>;
      workspaceDeleteFolder?: (payload: {
        targetPath: string;
      }) => Promise<{ ok: boolean; path?: string; error?: string }>;
      workspaceWriteFile?: (payload: {
        targetPath: string;
        content?: string;
      }) => Promise<{ ok: boolean; path?: string; error?: string }>;
      workspaceRenamePath?: (payload: {
        fromPath: string;
        toPath: string;
      }) => Promise<{ ok: boolean; path?: string; from?: string; error?: string }>;
      gitCloneOpen?: (payload: {
        projectId: string;
        projectName?: string;
        url: string;
        token?: string;
        destDir?: string;
      }) => Promise<{
        ok: boolean;
        canceled?: boolean;
        root?: string;
        files?: Record<string, string>;
        name?: string;
        error?: string;
        cloneMessage?: string;
      }>;
      onProjectImportProgress?: (handler: (payload: {
        phase?: string;
        done?: number;
        total?: number;
        label?: string;
      }) => void) => () => void;
      /** Native file picker. shows files inside folders (unlike Open folder). */
      pickFiles?: (payload?: { imagesOnly?: boolean }) => Promise<{
        ok: boolean;
        canceled?: boolean;
        paths?: string[];
        error?: string;
      }>;
      /** Pick a folder to look inside (then listDir shows files/photos). */
      pickBrowseFolder?: () => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
      listDir?: (dirPath: string) => Promise<{
        ok: boolean;
        path?: string;
        name?: string;
        parent?: string | null;
        items?: Array<{
          name: string;
          path: string;
          kind: 'dir' | 'file';
          isImage?: boolean;
          size?: number;
        }>;
        error?: string;
      }>;
      browseRoots?: () => Promise<{
        ok: boolean;
        roots?: Array<{ id: string; label: string; path: string }>;
        error?: string;
      }>;
      pcInstalledApps?: (payload?: { limit?: number }) => Promise<{
        ok: boolean;
        apps?: Array<{ name: string; source?: string }>;
        source?: string;
        limited?: boolean;
        note?: string;
        error?: string;
      }>;
      pathStat?: (targetPath: string) => Promise<{
        ok: boolean;
        path?: string;
        name?: string;
        isDirectory?: boolean;
        isFile?: boolean;
        size?: number;
        error?: string;
      }>;
      readTextFile?: (payload: string | { path: string; maxBytes?: number }) => Promise<{
        ok: boolean;
        path?: string;
        name?: string;
        text?: string;
        binary?: boolean;
        size?: number;
        error?: string;
      }>;
      isProtectedPath?: (targetPath: string) => Promise<{ ok: boolean; protected?: boolean; error?: string }>;
      readDataUrl?: (payload: string | { path: string; maxBytes?: number }) => Promise<{
        ok: boolean;
        path?: string;
        name?: string;
        dataUrl?: string;
        error?: string;
      }>;
      projectSearch?: (payload: {
        projectId: string;
        query: string;
        limit?: number;
      }) => Promise<{
        ok: boolean;
        hits?: { path: string; line: number; text: string }[];
        total?: number;
        error?: string;
      }>;
      projectDeleteFiles?: (projectId: string) => Promise<{ ok: boolean; error?: string }>;
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
      gitPull?: (payload: {
        projectId: string;
        token?: string;
      }) => Promise<{ ok: boolean; message?: string; remote?: string; error?: string; git?: boolean; branch?: string | null; dirty?: number }>;
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
