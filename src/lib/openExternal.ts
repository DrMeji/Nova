/** Open a URL in the user's default system browser when possible. */
export async function openInSystemBrowser(url: string) {
  if (window.arkDesktop?.openExternal) {
    await window.arkDesktop.openExternal(url);
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
