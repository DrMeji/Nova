/** Open a URL in the user's default system browser when possible. */
export async function openInSystemBrowser(url: string) {
  const href = String(url || '').trim();
  if (!/^https?:\/\//i.test(href)) return;
  if (window.novaDesktop?.openExternal) {
    await window.novaDesktop.openExternal(href);
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}
