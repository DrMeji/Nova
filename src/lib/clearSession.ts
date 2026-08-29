/** Wipe chat threads + recent lists for a clean test boot. */

const WIPE_KEYS = [
  'ark:chat-thread:general',
  'ark:chat-thread:image',
  'ark:chat-thread:video',
  'ark:chat-thread:code',
  'ark:chat-draft:image',
  'ark:chat-draft:video',
  'ark:recent-creations',
  'ark:recent-projects',
  'ark:recent-chats',
];

/** Bump this string whenever we need a forced clean slate on next launch. */
export const CLEAN_BOOT_TOKEN = 'clean-2026-08-28-product-spa';

export function clearArkSessionHistory() {
  for (const key of WIPE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  // Also clear any other chat-thread / draft keys
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (
        k.startsWith('ark:chat-thread:')
        || k.startsWith('ark:chat-draft:')
        || k.startsWith('ark:chat-studio:')
        || k.startsWith('ark:chat-studio-files:')
        || k.startsWith('ark:chat-code-pill:')
        || k.startsWith('ark:chat-last-folder:')
        || k.startsWith('ark:chat-last-disk-target:')
        || k.startsWith('ark:chat-pending-add-file:')
        || k.startsWith('ark:chat-pending-greenfield:')
        || k.startsWith('ark:media-feedback:')
        || k === 'ark:recent-creations'
        || k === 'ark:recent-projects'
        || k === 'ark:recent-chats'
      ) {
        localStorage.removeItem(k);
      }
    }
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem('ark:skip-library-sync', '1');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('ark:creations-changed'));
  window.dispatchEvent(new Event('ark:chats-changed'));
}

/** User-initiated: wipe chat threads and drafts. Does not delete models or API keys. */
export function clearLocalChatCache() {
  clearArkSessionHistory();
  try {
    localStorage.removeItem('ark:skip-library-sync');
  } catch {
    /* ignore */
  }
}

/** User-initiated: chat cache plus local reports. Models and keys stay. */
export async function clearLocalAppCaches() {
  clearLocalChatCache();
  try {
    await window.arkDesktop?.localReportsClear?.();
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('ark:cache-cleared'));
}

/** Run once per token so reopen is empty for testing. Skip in packaged installs. */
export function runCleanBootIfNeeded() {
  try {
    if (window.arkDesktop?.isPackaged) return false;
    if (localStorage.getItem('ark:clean-boot-token') === CLEAN_BOOT_TOKEN) return false;
    clearArkSessionHistory();
    localStorage.setItem('ark:clean-boot-token', CLEAN_BOOT_TOKEN);
    return true;
  } catch {
    if (window.arkDesktop?.isPackaged) return false;
    clearArkSessionHistory();
    return true;
  }
}
