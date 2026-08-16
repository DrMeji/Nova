const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('arkDesktop', {
  isElectron: true,
  isPackaged: process.argv.includes('--ark-packaged=1'),
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
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
  engineGenerateStream: (message, modelId, kind) =>
    ipcRenderer.invoke('ark:engine-generate-stream', { message, modelId, kind }),
  engineGenerateCancel: () => ipcRenderer.invoke('ark:engine-generate-cancel'),
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
  engineDownloadProgress: (id) => ipcRenderer.invoke('ark:engine-download-progress', id),
  engineDownloadError: (id) => ipcRenderer.invoke('ark:engine-download-error', id),
  engineDownloadCancel: (id) => ipcRenderer.invoke('ark:engine-download-cancel', id),
  engineImportGguf: (filePath) => ipcRenderer.invoke('ark:engine-import-gguf', filePath),
  engineImportGgufPick: () => ipcRenderer.invoke('ark:engine-import-gguf-pick'),
  engineDiskSpace: () => ipcRenderer.invoke('ark:engine-disk-space'),
  engineEnsureRuntime: () => ipcRenderer.invoke('ark:engine-ensure-runtime'),
  engineGenerate: (message, modelId, kind) =>
    ipcRenderer.invoke('ark:engine-generate', { message, modelId, kind }),
  modelsDirInfo: () => ipcRenderer.invoke('ark:models-dir-info'),
  modelsDirPick: () => ipcRenderer.invoke('ark:models-dir-pick'),
  modelsDirSet: (folderPath) => ipcRenderer.invoke('ark:models-dir-set', folderPath),
  modelsDirReset: () => ipcRenderer.invoke('ark:models-dir-reset'),
  previewStart: (payload) => ipcRenderer.invoke('ark:preview-start', payload),
  previewStop: (projectId) => ipcRenderer.invoke('ark:preview-stop', projectId),
  previewStatus: (projectId) => ipcRenderer.invoke('ark:preview-status', projectId),
  mediaLibrary: () => ipcRenderer.invoke('ark:media-library'),
  mediaClear: () => ipcRenderer.invoke('ark:media-clear'),
  mediaGet: (id) => ipcRenderer.invoke('ark:media-get', id),
  mediaRemove: (id) => ipcRenderer.invoke('ark:media-remove', id),
  projectWrite: (payload) => ipcRenderer.invoke('ark:project-write', payload),
  projectRead: (projectId) => ipcRenderer.invoke('ark:project-read', projectId),
  projectPath: (projectId) => ipcRenderer.invoke('ark:project-path', projectId),
  secretsStatus: () => ipcRenderer.invoke('ark:secrets-status'),
  secretsLoad: () => ipcRenderer.invoke('ark:secrets-load'),
  secretsSave: (keys) => ipcRenderer.invoke('ark:secrets-save', { keys }),
});
