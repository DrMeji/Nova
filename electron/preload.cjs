const { contextBridge, ipcRenderer, webUtils } = require('electron');

const packagedFlag = process.argv.find(a => typeof a === 'string' && a.startsWith('--ark-packaged='));
const isPackagedApp = packagedFlag ? packagedFlag.endsWith('=1') : false;

const arkDesktopApi = {
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
  openExternal: (url) => ipcRenderer.invoke('NOVA:open-external', url),
  openPath: (targetPath) => ipcRenderer.invoke('NOVA:open-path', targetPath),
  systemInfo: () => ipcRenderer.invoke('NOVA:system-info'),
  speedTest: () => ipcRenderer.invoke('NOVA:speed-test'),
  appMeta: () => ipcRenderer.invoke('NOVA:app-meta'),
  updateCheck: () => ipcRenderer.invoke('NOVA:update-check'),
  updateDownload: (payload) => ipcRenderer.invoke('NOVA:update-download', payload || {}),
  updateState: () => ipcRenderer.invoke('NOVA:update-state'),
  postUpdateConsume: () => ipcRenderer.invoke('NOVA:post-update-consume'),
  authRecoverySave: (payload) => ipcRenderer.invoke('NOVA:auth-recovery-save', payload || {}),
  authRecoveryInfo: () => ipcRenderer.invoke('NOVA:auth-recovery-info'),
  authRecoveryReveal: () => ipcRenderer.invoke('NOVA:auth-recovery-reveal'),
  onUpdateProgress: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on('NOVA:update-progress', listener);
    return () => ipcRenderer.removeListener('NOVA:update-progress', listener);
  },
  authStorageGet: (key) => ipcRenderer.invoke('NOVA:auth-storage-get', key),
  authStorageSet: (key, value) => ipcRenderer.invoke('NOVA:auth-storage-set', key, value),
  authStorageRemove: (key) => ipcRenderer.invoke('NOVA:auth-storage-remove', key),
  loginItemGet: () => ipcRenderer.invoke('NOVA:login-item-get'),
  loginItemSet: (openAtLogin) => ipcRenderer.invoke('NOVA:login-item-set', { openAtLogin: Boolean(openAtLogin) }),
  setupGet: () => ipcRenderer.invoke('NOVA:setup-get'),
  setupSet: (completed) => ipcRenderer.invoke('NOVA:setup-set', { completed: Boolean(completed) }),
  windowMinimize: () => ipcRenderer.invoke('NOVA:window-minimize'),
  windowMaximizeToggle: () => ipcRenderer.invoke('NOVA:window-maximize-toggle'),
  windowIsMaximized: () => ipcRenderer.invoke('NOVA:window-is-maximized'),
  windowClose: () => ipcRenderer.invoke('NOVA:window-close'),
  onWindowMaximized: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on('NOVA:window-maximized', listener);
    return () => ipcRenderer.removeListener('NOVA:window-maximized', listener);
  },
  onSystemSuspend: (handler) => {
    const listener = () => handler?.();
    ipcRenderer.on('NOVA:system-suspend', listener);
    return () => ipcRenderer.removeListener('NOVA:system-suspend', listener);
  },
  httpGet: (url, headers) => ipcRenderer.invoke('NOVA:http-get', { url, headers }),
  httpRequest: (url, options) => ipcRenderer.invoke('NOVA:http-request', { url, ...(options || {}) }),
  httpStream: (url, options) =>
    ipcRenderer.invoke('NOVA:http-stream', { url, ...(options || {}) }),
  onHttpStreamChunk: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on('NOVA:http-stream-chunk', listener);
    return () => ipcRenderer.removeListener('NOVA:http-stream-chunk', listener);
  },
  brainStatus: () => ipcRenderer.invoke('NOVA:brain-status'),
  brainTokenGet: () => ipcRenderer.invoke('NOVA:brain-token-get'),
  brainTokenRotate: () => ipcRenderer.invoke('NOVA:brain-token-rotate'),
  engineGenerateStream: (message, modelId, kind, opts) =>
    ipcRenderer.invoke('NOVA:engine-generate-stream', { message, modelId, kind, ...(opts || {}) }),
  engineGenerateCancel: (opts) => ipcRenderer.invoke('NOVA:engine-generate-cancel', opts || {}),
  webSearch: (query) => ipcRenderer.invoke('NOVA:web-search', { query }),
  onEngineChunk: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on('NOVA:engine-chunk', listener);
    return () => ipcRenderer.removeListener('NOVA:engine-chunk', listener);
  },
  pluginOAuthStart: (pluginId) => ipcRenderer.invoke('NOVA:plugin-oauth-start', pluginId),
  pluginOAuthStatus: () => ipcRenderer.invoke('NOVA:plugin-oauth-status'),
  pluginOAuthSetClient: (pluginId, clientId) =>
    ipcRenderer.invoke('NOVA:plugin-oauth-set-client', { pluginId, clientId }),
  localReportsList: () => ipcRenderer.invoke('NOVA:local-reports-list'),
  localReportsClear: () => ipcRenderer.invoke('NOVA:local-reports-clear'),
  localReportsOpen: () => ipcRenderer.invoke('NOVA:local-reports-open'),
  signingStatus: () => ipcRenderer.invoke('NOVA:signing-status'),
  engineStatus: () => ipcRenderer.invoke('NOVA:engine-status'),
  engineStart: () => ipcRenderer.invoke('NOVA:engine-start'),
  engineStop: () => ipcRenderer.invoke('NOVA:engine-stop'),
  engineSetModel: (id) => ipcRenderer.invoke('NOVA:engine-set-model', id),
  engineDownload: (id) => ipcRenderer.invoke('NOVA:engine-download', id),
  engineRegisterHunt: (meta) => ipcRenderer.invoke('NOVA:engine-register-hunt', meta),
  engineDownloadProgress: (id) => ipcRenderer.invoke('NOVA:engine-download-progress', id),
  engineDownloadError: (id) => ipcRenderer.invoke('NOVA:engine-download-error', id),
  engineDownloadCancel: (id) => ipcRenderer.invoke('NOVA:engine-download-cancel', id),
  engineImportGguf: (filePath) => ipcRenderer.invoke('NOVA:engine-import-gguf', filePath),
  engineImportGgufPick: () => ipcRenderer.invoke('NOVA:engine-import-gguf-pick'),
  engineDeleteModel: (id) => ipcRenderer.invoke('NOVA:engine-delete-model', id),
  engineDiskSpace: () => ipcRenderer.invoke('NOVA:engine-disk-space'),
  engineEnsureRuntime: () => ipcRenderer.invoke('NOVA:engine-ensure-runtime'),
  engineGenerate: (message, modelId, kind, opts) =>
    ipcRenderer.invoke('NOVA:engine-generate', { message, modelId, kind, ...(opts || {}) }),
  modelsDirInfo: () => ipcRenderer.invoke('NOVA:models-dir-info'),
  modelsDirPick: () => ipcRenderer.invoke('NOVA:models-dir-pick'),
  modelsDirSet: (folderPath) => ipcRenderer.invoke('NOVA:models-dir-set', folderPath),
  modelsDirReset: () => ipcRenderer.invoke('NOVA:models-dir-reset'),
  previewStart: (payload) => ipcRenderer.invoke('NOVA:preview-start', payload),
  previewStop: (projectId) => ipcRenderer.invoke('NOVA:preview-stop', projectId),
  previewStatus: (projectId) => ipcRenderer.invoke('NOVA:preview-status', projectId),
  previewOpenWindow: (payload) => ipcRenderer.invoke('NOVA:preview-open-window', payload),
  previewCloseLive: () => ipcRenderer.invoke('NOVA:preview-close-live'),
  previewUpdate: (payload) => ipcRenderer.invoke('NOVA:preview-update', payload),
  previewReload: (projectId) => ipcRenderer.invoke('NOVA:preview-reload', projectId),
  previewSession: (cwd) => ipcRenderer.invoke('NOVA:preview-session', cwd),
  getOrAttachPreview: (cwd) => ipcRenderer.invoke('NOVA:preview-get-or-attach', cwd),
  mediaLibrary: () => ipcRenderer.invoke('NOVA:media-library'),
  mediaClear: () => ipcRenderer.invoke('NOVA:media-clear'),
  mediaGet: (id) => ipcRenderer.invoke('NOVA:media-get', id),
  mediaRemove: (id) => ipcRenderer.invoke('NOVA:media-remove', id),
  projectWrite: (payload) => ipcRenderer.invoke('NOVA:project-write', payload),
  projectRead: (projectId) => ipcRenderer.invoke('NOVA:project-read', projectId),
  projectPath: (projectId) => ipcRenderer.invoke('NOVA:project-path', projectId),
  projectImportFolder: (payload) => ipcRenderer.invoke('NOVA:project-import-folder', payload),
  workspaceOpenRoot: (payload) => ipcRenderer.invoke('NOVA:workspace-open-root', payload),
  workspaceMkdir: (payload) => ipcRenderer.invoke('NOVA:workspace-mkdir', payload || {}),
  workspaceSandboxRoot: () => ipcRenderer.invoke('NOVA:workspace-sandbox-root'),
  workspaceStatPath: (targetPath) => ipcRenderer.invoke('NOVA:workspace-stat-path', targetPath),
  workspaceSetGrants: (grants) => ipcRenderer.invoke('NOVA:workspace-set-grants', grants),
  workspaceGetGrants: () => ipcRenderer.invoke('NOVA:workspace-get-grants'),
  agentRun: (payload) => ipcRenderer.invoke('NOVA:agent-run', payload),
  agentStartDevServer: (payload) => ipcRenderer.invoke('NOVA:agent-start-dev-server', payload),
  agentStartFolderPreview: (payload) => ipcRenderer.invoke('NOVA:agent-start-folder-preview', payload),
  mcpListTools: (payload) => ipcRenderer.invoke('NOVA:mcp-list-tools', payload || {}),
  mcpCallTool: (payload) => ipcRenderer.invoke('NOVA:mcp-call-tool', payload || {}),
  mcpStop: (payload) => ipcRenderer.invoke('NOVA:mcp-stop', payload || {}),
  workspaceDeletePath: (payload) => ipcRenderer.invoke('NOVA:workspace-delete-path', payload),
  workspaceDeleteRoot: (payload) => ipcRenderer.invoke('NOVA:workspace-delete-root', payload),
  workspaceDeleteFolder: (payload) => ipcRenderer.invoke('NOVA:workspace-delete-folder', payload),
  workspaceWriteFile: (payload) => ipcRenderer.invoke('NOVA:workspace-write-file', payload),
  workspaceSaveAsset: (payload) => ipcRenderer.invoke('NOVA:workspace-save-asset', payload),
  brandSearchImages: (payload) => ipcRenderer.invoke('NOVA:brand-search-images', payload || {}),
  workspaceRenamePath: (payload) => ipcRenderer.invoke('NOVA:workspace-rename-path', payload),
  gitCloneOpen: (payload) => ipcRenderer.invoke('NOVA:git-clone-open', payload),
  onProjectImportProgress: (handler) => {
    const fn = (_e, payload) => {
      try {
        handler?.(payload);
      } catch {
        /* ignore */
      }
    };
    ipcRenderer.on('NOVA:project-import-progress', fn);
    return () => ipcRenderer.removeListener('NOVA:project-import-progress', fn);
  },
  pickFiles: (payload) => ipcRenderer.invoke('NOVA:pick-files', payload || {}),
  pickBrowseFolder: () => ipcRenderer.invoke('NOVA:pick-browse-folder'),
  listDir: (dirPath) => ipcRenderer.invoke('NOVA:list-dir', dirPath),
  browseRoots: () => ipcRenderer.invoke('NOVA:browse-roots'),
  pcInstalledApps: (payload) => ipcRenderer.invoke('NOVA:pc-installed-apps', payload || {}),
  pathStat: (targetPath) => ipcRenderer.invoke('NOVA:path-stat', targetPath),
  readTextFile: (payload) => ipcRenderer.invoke('NOVA:read-text-file', payload),
  isProtectedPath: (targetPath) => ipcRenderer.invoke('NOVA:is-protected-path', targetPath),
  readDataUrl: (payload) => ipcRenderer.invoke('NOVA:read-data-url', payload),
  projectSearch: (payload) => ipcRenderer.invoke('NOVA:project-search', payload),
  projectDeleteFiles: (projectId) => ipcRenderer.invoke('NOVA:project-delete-files', projectId),
  gitStatus: (projectId) => ipcRenderer.invoke('NOVA:git-status', projectId),
  gitClone: (payload) => ipcRenderer.invoke('NOVA:git-clone', payload),
  gitCommit: (payload) => ipcRenderer.invoke('NOVA:git-commit', payload),
  gitPush: (payload) => ipcRenderer.invoke('NOVA:git-push', payload),
  gitPull: (payload) => ipcRenderer.invoke('NOVA:git-pull', payload),
  gitDiff: (projectId) => ipcRenderer.invoke('NOVA:git-diff', projectId),
  gitSetOrigin: (payload) => ipcRenderer.invoke('NOVA:git-set-origin', payload),
  secretsStatus: () => ipcRenderer.invoke('NOVA:secrets-status'),
  secretsLoad: () => ipcRenderer.invoke('NOVA:secrets-load'),
  secretsGetKey: (providerId) => ipcRenderer.invoke('NOVA:secrets-get-key', providerId),
  secretsSave: (keys) => ipcRenderer.invoke('NOVA:secrets-save', { keys }),
  voiceNeuralVoices: () => ipcRenderer.invoke('NOVA:voice-neural-voices'),
  voiceNeuralSpeak: (payload) => ipcRenderer.invoke('NOVA:voice-neural-speak', payload || {}),
};

// Dev assert: create/apply must not silently miss these bridges.
if (!isPackagedApp) {
  const required = [
    'workspaceMkdir',
    'workspaceWriteFile',
    'workspaceOpenRoot',
    'workspaceGetGrants',
    'workspaceSetGrants',
    'readTextFile',
    'listDir',
    'projectWrite',
    'agentRun',
    'agentStartDevServer',
    'getOrAttachPreview',
    'previewSession',
  ];
  const absent = required.filter((k) => typeof arkDesktopApi[k] !== 'function');
  if (absent.length) {
    console.error('[NOVA preload] missing create/apply IPC:', absent.join(', '));
  }
}

contextBridge.exposeInMainWorld('arkDesktop', arkDesktopApi);

// Forward IPC push messages from main as DOM CustomEvents so the React app can listen.
ipcRenderer.on('NOVA:open-settings', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('NOVA:open-settings', { detail: payload || {} }));
});
ipcRenderer.on('NOVA:project-import-progress', (_event, payload) => {
  window.dispatchEvent(new CustomEvent('NOVA:project-import-progress', { detail: payload || {} }));
});
