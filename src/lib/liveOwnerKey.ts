/**
 * Single Live BrowserWindow owner key for Chat + create + Electron.
 * Always chat-scoped so Workspace project ids never open a second Live.
 */
export function liveOwnerKey(chatIdOrProjectId?: string | null): string {
  const raw = String(chatIdOrProjectId || '').trim();
  if (!raw) return 'chat-preview';
  if (raw === 'NOVA-live-preview' || raw === 'chat-preview' || raw === 'default') return raw;
  if (/^chat[-:]/i.test(raw)) {
    return raw
      .replace(/[^a-zA-Z0-9._:-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 96) || 'chat-preview';
  }
  const safe = raw
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return safe ? `chat-${safe}` : 'chat-preview';
}
