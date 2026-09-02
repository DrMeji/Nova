const { contextBridge, ipcRenderer, webUtils } = require('electron');

const packagedFlag = process.argv.find(a => typeof a === 'string' && a.startsWith('--ark-packaged='));
const isPackagedApp = packagedFlag ? packagedFlag.endsWith('=1') : false;

contextBridge.exposeInMainWorld('arkDesktop', {
  isElectron: true,
  isPackaged: isPackagedApp,
  isDevBuild: !isPackagedApp,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  /** Electron 32+ replacement for removed File.path (needed for Explorer drag-drop). */
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return '';
    }
  },
  windowControls: true,
  openExternal: (url) => ipcRenderer.invoke('ark:open-external', url),
  openPath: (targetPath) => ipcRenderer.invoke('ark:open-path', targetPath),
  systemInfo: () => ipcRenderer.invoke('ark:system-info'),
  speedTest: () => ipcRenderer.invoke('ark:speed-test'),
  appMeta: () => ipcRenderer.invoke('ark:app-meta'),
  updateCheck: () => ipcRenderer.invoke('ark:update-check'),
  updateDownload: (payload) => ipcRenderer.invoke('ark:update-download', payload || {}),
  updateState: () => ipcRenderer.invoke('ark:update-state'),
  postUpdateConsume: () => ipcRenderer.invoke('ark:post-update-consume'),
  authRecoverySave: (payload) => ipcRenderer.invoke('ark:auth-recovery-save', payload || {}),
  authRecoveryInfo: () => ipcRenderer.invoke('ark:auth-recovery-info'),
  authRecoveryReveal: () => ipcRenderer.invoke('ark:auth-recovery-reveal'),
  onUpdateProgress: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on('ark:update-progress', listener);
    return () => ipcRenderer.removeListener('ark:update-progress', listener);
  },
  authStorageGet: (key) => ipcRenderer.invoke('ark:auth-storage-get', key),
  authStorageSet: (key, value) => ipcRenderer.invoke('ark:auth-storage-set', key, value),
  authStorageRemove: (key) => ipcRenderer.invoke('ark:auth-storage-remove', key),
  loginItemGet: () => ipcRenderer.invoke('ark:login-item-get'),
  loginItemSet: (openAtLogin) => ipcRenderer.invoke('ark:login-item-set', { openAtLogin: Boolean(openAtLogin) }),
  setupGet: () => ipcRenderer.invoke('ark:setup-get'),
  setupSet: (completed) => ipcRenderer.invoke('ark:setup-set', { completed: Boolean(completed) }),
  windowMinimize: () => ipcRenderer.invoke('ark:window-minimize'),
  windowMaximizeToggle: () => ipcRenderer.invoke('ark:window-maximize-toggle'),
  windowIsMaximized: () => ipcRenderer.invoke('ark:window-is-maximized'),
  windowClose: () => ipcRenderer.invoke('ark:window-close'),
  onWindowMaximized: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on('ark:window-maximized', listener);
    return () => ipcRenderer.removeListener('ark:window-maximized', listener);
  },
  onSystemSuspend: (handler) => {
    const listener = () => handler?.();
    ipcRenderer.on('ark:system-suspend', listener);
    return () => ipcRenderer.removeListener('ark:system-suspend', listener);
  },
  httpGet: (url, headers) => ipcRenderer.invoke('ark:http-get', { url, headers }),
  httpRequest: (url, options) => ipcRenderer.invoke('ark:http-request', { url, ...(options || {}) }),
  httpStream: (url, options) =>
    ipcRenderer.invoke('ark:http-stream', { url, ...(options || {}) }),
  onHttpStreamChunk: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on('ark:http-stream-chunk', listener);
    return () => ipcRenderer.removeListener('ark:http-stream-chunk', listener);
  },
  brainStatus: () => ipcRenderer.invoke('ark:brain-status'),
  brainTokenGet: () => ipcRenderer.invoke('ark:brain-token-get'),
  brainTokenRotate: () => ipcRenderer.invoke('ark:brain-token-rotate'),
  engineGenerateStream: (message, modelId, kind, opts) =>
    ipcRenderer.invoke('ark:engine-generate-stream', { message, modelId, kind, ...(opts || {}) }),
  engineGenerateCancel: () => ipcRenderer.invoke('ark:engine-generate-cancel'),
  webSearch: (query) => ipcRenderer.invoke('ark:web-search', { query }),
  onEngineChunk: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on('ark:engine-chunk', listener);
    return () => ipcRenderer.removeListener('ark:engine-chunk', listener);
  },
  pluginOAuthStart: (pluginId) => ipcRenderer.invoke('ark:plugin-oauth-start', pluginId),
  pluginOAuthStatus: () => ipcRenderer.invoke('ark:plugin-oauth-status'),
  pluginOAuthSetClient: (pluginId, clientId) =>
    ipcRenderer.invoke('ark:plugin-oauth-set-client', { pluginId, clientId }),
  localReportsList: () => ipcRenderer.invoke('ark:local-reports-list'),
  localReportsClear: () => ipcRenderer.invoke('ark:local-reports-clear'),
  localReportsOpen: () => ipcRenderer.invoke('ark:local-reports-open'),
  signingStatus: () => ipcRenderer.invoke('ark:signing-status'),
  engineStatus: () => ipcRenderer.invoke('ark:engine-status'),
  engineStart: () => ipcRenderer.invoke('ark:engine-start'),
  engineStop: () => ipcRenderer.invoke('ark:engine-stop'),
  engineSetModel: (id) => ipcRenderer.invoke('ark:engine-set-model', id),
  engineDownload: (id) => ipcRenderer.invoke('ark:engine-download', id),
  engineRegisterHunt: (meta) => ipcRenderer.invoke('ark:engine-register-hunt', meta),
  engineDownloadProgress: (id) => ipcRenderer.invoke('ark:engine-download-progress', id),
  engineDownloadError: (id) => ipcRenderer.invoke('ark:engine-download-error', id),
  engineDownloadCancel: (id) => ipcRenderer.invoke('ark:engine-download-cancel', id),
  engineImportGguf: (filePath) => ipcRenderer.invoke('ark:engine-import-gguf', filePath),
  engineImportGgufPick: () => ipcRenderer.invoke('ark:engine-import-gguf-pick'),
  engineDeleteModel: (id) => ipcRenderer.invoke('ark:engine-delete-model', id),
  engineDiskSpace: () => ipcRenderer.invoke('ark:engine-disk-space'),
  engineEnsureRuntime: () => ipcRenderer.invoke('ark:engine-ensure-runtime'),
  engineGenerate: (message, modelId, kind, opts) =>
    ipcRenderer.invoke('ark:engine-generate', { message, modelId, kind, ...(opts || {}) }),
  modelsDirInfo: () => ipcRenderer.invoke('ark:models-dir-info'),
  modelsDirPick: () => ipcRenderer.invoke('ark:models-dir-pick'),
  modelsDirSet: (folderPath) => ipcRenderer.invoke('ark:models-dir-set', folderPath),
  modelsDirReset: () => ipcRenderer.invoke('ark:models-dir-reset'),
  previewStart: (payload) => ipcRenderer.invoke('ark:preview-start', payload),
  previewStop: (projectId) => ipcRenderer.invoke('ark:preview-stop', projectId),
  previewStatus: (projectId) => ipcRenderer.invoke('ark:preview-status', projectId),
  previewOpenWindow: (payload) => ipcRenderer.invoke('ark:preview-open-window', payload),
  previewCloseLive: () => ipcRenderer.invoke('ark:preview-close-live'),
  previewUpdate: (payload) => ipcRenderer.invoke('ark:preview-update', payload),
  previewReload: (projectId) => ipcRenderer.invoke('ark:preview-reload', projectId),
  mediaLibrary: () => ipcRenderer.invoke('ark:media-library'),
  mediaClear: () => ipcRenderer.invoke('ark:media-clear'),
  mediaGet: (id) => ipcRenderer.invoke('ark:media-get', id),
  mediaRemove: (id) => ipcRenderer.invoke('ark:media-remove', id),
  projectWrite: (payload) => ipcRenderer.invoke('ark:project-write', payload),
  projectRead: (projectId) => ipcRenderer.invoke('ark:project-read', projectId),
  projectPath: (projectId) => ipcRenderer.invoke('ark:project-path', projectId),
  projectImportFolder: (payload) => ipcRenderer.invoke('ark:project-import-folder', payload),
  workspaceOpenRoot: (payload) => ipcRenderer.invoke('ark:workspace-open-root', payload),
  workspaceMkdir: (payload) => ipcRenderer.invoke('ark:workspace-mkdir', payload || {}),
  workspaceSandboxRoot: () => ipcRenderer.invoke('ark:workspace-sandbox-root'),
  workspaceStatPath: (targetPath) => ipcRenderer.invoke('ark:workspace-stat-path', targetPath),
  workspaceSetGrants: (grants) => ipcRenderer.invoke('ark:workspace-set-grants', grants),
  workspaceGetGrants: () => ipcRenderer.invoke('ark:workspace-get-grants'),
  agentRun: (payload) => ipcRenderer.invoke('ark:agent-run', payload),
  agentStartDevServer: (payload) => ipcRenderer.invoke('ark:agent-start-dev-server', payload),
  mcpListTools: (payload) => ipcRenderer.invoke('ark:mcp-list-tools', payload || {}),
  mcpCallTool: (payload) => ipcRenderer.invoke('ark:mcp-call-tool', payload || {}),
  mcpStop: (payload) => ipcRenderer.invoke('ark:mcp-stop', payload || {}),
  workspaceDeletePath: (payload) => ipcRenderer.invoke('ark:workspace-delete-path', payload),
  workspaceDeleteRoot: (payload) => ipcRenderer.invoke('ark:workspace-delete-root', payload),
  workspaceDeleteFolder: (payload) => ipcRenderer.invoke('ark:workspace-delete-folder', payload),
  workspaceWriteFile: (payload) => ipcRenderer.invoke('ark:workspace-write-file', payload),
  workspaceRenamePath: (payload) => ipcRenderer.invoke('ark:workspace-rename-path', payload),
  gitCloneOpen: (payload) => ipcRenderer.invoke('ark:git-clone-open', payload),
  onProjectImportProgress: (handler) => {
    const fn = (_e, payload) => {
      try {
        handler?.(payload);
      } catch {
        /* ignore */
      }
    };
    ipcRenderer.on('ark:project-import-progress', fn);
    return () => ipcRenderer.removeListener('ark:project-import-progress', fn);
  },
  pickFiles: (payload) => ipcRenderer.invoke('ark:pick-files', payload || {}),
  pickBrowseFolder: () => ipcRenderer.invoke('ark:pick-browse-folder'),
  listDir: (dirPath) => ipcRenderer.invoke('ark:list-dir', dirPath),
  browseRoots: () => ipcRenderer.invoke('ark:browse-roots'),
  pcInstalledApps: (payload) => ipcRenderer.invoke('ark:pc-installed-apps', payload || {}),
  pathStat: (targetPath) => ipcRenderer.invoke('ark:path-stat', targetPath),
  readTextFile: (payload) => ipcRenderer.invoke('ark:read-text-file', payload),
  isProtectedPath: (targetPath) => ipcRenderer.invoke('ark:is-protected-path', targetPath),
  readDataUrl: (payload) => ipcRenderer.invoke('ark:read-data-url', payload),
  projectSearch: (payload) => ipcRenderer.invoke('ark:project-search', payload),
  projectDeleteFiles: (projectId) => ipcRenderer.invoke('ark:project-delete-files', projectId),
  gitStatus: (projectId) => ipcRenderer.invoke('ark:git-status', projectId),
  gitClone: (payload) => ipcRenderer.invoke('ark:git-clone', payload),
  gitCommit: (payload) => ipcRenderer.invoke('ark:git-commit', payload),
  gitPush: (payload) => ipcRenderer.invoke('ark:git-push', payload),
  gitPull: (payload) => ipcRenderer.invoke('ark:git-pull', payload),
  gitDiff: (projectId) => ipcRenderer.invoke('ark:git-diff', projectId),
  gitSetOrigin: (payload) => ipcRenderer.invoke('ark:git-set-origin', payload),
  secretsStatus: () => ipcRenderer.invoke('ark:secrets-status'),
  secretsLoad: () => ipcRenderer.invoke('ark:secrets-load'),
  secretsGetKey: (providerId) => ipcRenderer.invoke('ark:secrets-get-key', providerId),
  secretsSave: (keys) => ipcRenderer.invoke('ark:secrets-save', { keys }),
  voiceNeuralVoices: () => ipcRenderer.invoke('ark:voice-neural-voices'),
  voiceNeuralSpeak: (payload) => ipcRenderer.invoke('ark:voice-neural-speak', payload || {}),
});

// Forward IPC push messages from main as DOM CustomEvents so the React app can listen.
ipcRenderer.on('ark:open-settings', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('ark:open-settings', { detail: payload || {} }));
});
ipcRenderer.on('ark:project-import-progress', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('ark:project-import-progress', { detail: payload || {} }));
});
