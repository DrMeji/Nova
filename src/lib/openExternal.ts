/** Open a URL in the user's default system browser when possible. */
export async function openInSystemBrowser(url: string) {
  const href = String(url || '').trim();
  if (!/^https?:\/\//i.test(href)) return;
  if (window.novaDesktop?.openExternal) {
    try {
      const res = await window.novaDesktop.openExternal(href);
      if (res && res.ok === false) {
        window.open(href, '_blank', 'noopener,noreferrer');
      }
      return;
    } catch {
      window.open(href, '_blank', 'noopener,noreferrer');
      return;
    }
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}
