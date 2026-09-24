/** Resolve live brain URL (port may shift if 8787 is taken). */

let cachedUrl = 'http://127.0.0.1:8787';

export function getBrainUrl() {
  return cachedUrl;
}

export async function refreshBrainUrl(): Promise<string> {
  try {
    const row = await window.novaDesktop?.brainTokenGet?.();
    if (row?.url) cachedUrl = row.url;
    else {
      const status = await window.novaDesktop?.brainStatus?.();
      if (status?.url) cachedUrl = status.url;
    }
  } catch {
    /* keep last */
  }
  return cachedUrl;
}
