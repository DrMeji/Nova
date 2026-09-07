/** In-app updates via public DrMeji/Ark (installers only; source stays private). */

export const ARK_UPDATE_REPO = 'DrMeji/Ark';
/** Public download / issues surface — never ship the private source repo name in the client. */
export const ARK_GITHUB_REPO = 'DrMeji/Ark';
export const ARK_PUBLIC_REPO = 'DrMeji/Ark';
export const ARK_SOURCE_REPO = 'DrMeji/Ark';

export type ArkUpdateInfo = {
  ok: boolean;
  currentVersion: string;
  latestTag?: string;
  latestName?: string;
  newerAvailable: boolean;
  setupAssetUrl?: string;
  message: string;
};

export type ArkUpdateProgress = {
  status: string;
  percent: number;
  message: string;
  version?: string;
  error?: string;
};

export async function checkArkGitHubUpdate(): Promise<ArkUpdateInfo> {
  if (window.arkDesktop?.updateCheck) {
    const info = await window.arkDesktop.updateCheck();
    return {
      ok: Boolean(info?.ok),
      currentVersion: info?.currentVersion || '0.0.0',
      latestTag: info?.latestTag,
      latestName: info?.latestName,
      newerAvailable: Boolean(info?.newerAvailable),
      setupAssetUrl: info?.setupAssetUrl,
      message: info?.message || 'Update check finished.',
    };
  }

  let currentVersion = '0.1.5';
  try {
    const meta = await window.arkDesktop?.appMeta?.();
    if (meta?.version) currentVersion = meta.version;
  } catch {
    /* keep default */
  }

  return {
    ok: false,
    currentVersion,
    newerAvailable: false,
    message: 'Updates are available in the NOVA desktop app.',
  };
}

/** Sidebar “update available” cache — clear on failed Update so green CTA can’t outlive a 504. */
export const ARK_UPDATE_INDICATOR_CACHE_KEY = 'NOVA:update-indicator-cache-v1';

export function clearUpdateIndicatorCache() {
  try {
    localStorage.removeItem(ARK_UPDATE_INDICATOR_CACHE_KEY);
  } catch {
    /* ignore */
  }
}

export async function downloadAndInstallArkUpdate(info: Pick<ArkUpdateInfo, 'setupAssetUrl' | 'latestTag'>) {
  if (!window.arkDesktop?.updateDownload) {
    return { ok: false, message: 'Installer download is only available in the desktop app.' };
  }
  return window.arkDesktop.updateDownload({
    setupAssetUrl: info.setupAssetUrl,
    latestTag: info.latestTag,
  });
}
