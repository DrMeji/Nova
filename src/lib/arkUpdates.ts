/** GitHub Releases update check for ARK (DrMeji/Ark). */

export const ARK_GITHUB_REPO = 'DrMeji/Ark';
export const ARK_RELEASES_URL = `https://github.com/${ARK_GITHUB_REPO}/releases`;
export const ARK_LATEST_RELEASE_URL = `${ARK_RELEASES_URL}/latest`;

export type ArkUpdateInfo = {
  ok: boolean;
  currentVersion: string;
  latestTag?: string;
  latestName?: string;
  newerAvailable: boolean;
  downloadUrl?: string;
  setupAssetUrl?: string;
  message: string;
};

function normalizeVersion(v: string) {
  return String(v || '').trim().replace(/^v/i, '');
}

function parseSemverParts(v: string): number[] {
  return normalizeVersion(v)
    .split(/[.+-]/)
    .map(p => parseInt(p.replace(/\D/g, ''), 10))
    .map(n => (Number.isFinite(n) ? n : 0));
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseSemverParts(latest);
  const b = parseSemverParts(current);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

type GhRelease = {
  tag_name?: string;
  name?: string;
  html_url?: string;
  assets?: Array<{ name?: string; browser_download_url?: string }>;
};

export async function checkArkGitHubUpdate(): Promise<ArkUpdateInfo> {
  let currentVersion = '0.1.0';
  try {
    const meta = await window.arkDesktop?.appMeta?.();
    if (meta?.version) currentVersion = meta.version;
  } catch {
    /* keep default */
  }

  try {
    const res = await window.arkDesktop?.httpGet?.(
      `https://api.github.com/repos/${ARK_GITHUB_REPO}/releases/latest`,
      {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ARK-Desktop',
      },
    );

    if (!res?.ok) {
      return {
        ok: false,
        currentVersion,
        newerAvailable: false,
        downloadUrl: ARK_LATEST_RELEASE_URL,
        message:
          'Could not reach GitHub Releases from the app (private repo may need you signed in). Opening the Releases page in your browser.',
      };
    }

    const data = res.data as GhRelease;
    const latestTag = data.tag_name || '';
    const setup = (data.assets || []).find(a =>
      /ARK-Setup-.*\.exe$/i.test(a.name || ''),
    );
    const newer = latestTag ? isNewerVersion(latestTag, currentVersion) : false;

    return {
      ok: true,
      currentVersion,
      latestTag,
      latestName: data.name || latestTag,
      newerAvailable: newer,
      downloadUrl: data.html_url || ARK_LATEST_RELEASE_URL,
      setupAssetUrl: setup?.browser_download_url,
      message: newer
        ? `Update available: ${data.name || latestTag}. Open Releases to download and install.`
        : `You are on the latest release (${currentVersion}).`,
    };
  } catch {
    return {
      ok: false,
      currentVersion,
      newerAvailable: false,
      downloadUrl: ARK_LATEST_RELEASE_URL,
      message: 'Could not check for updates. Open GitHub Releases in your browser to download the latest build.',
    };
  }
}

export async function openArkReleasesPage(url = ARK_LATEST_RELEASE_URL) {
  if (window.arkDesktop?.openExternal) {
    await window.arkDesktop.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
