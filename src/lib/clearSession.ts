/** Wipe chat threads + recent lists for a clean test boot. */

const WIPE_KEYS = [
  'NOVA:chat-thread:general',
  'NOVA:chat-thread:image',
  'NOVA:chat-thread:video',
  'NOVA:chat-thread:code',
  'ark:chat-draft:image',
  'NOVA:chat-draft:video',
  'NOVA:recent-creations',
  'NOVA:recent-projects',
  'NOVA:recent-chats',
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
        k.startsWith('NOVA:chat-thread:')
        || k.startsWith('NOVA:chat-draft:')
        || k.startsWith('NOVA:chat-studio:')
        || k.startsWith('NOVA:chat-studio-files:')
        || k.startsWith('NOVA:chat-code-pill:')
        || k.startsWith('NOVA:chat-last-folder:')
        || k.startsWith('NOVA:chat-last-disk-target:')
        || k.startsWith('NOVA:chat-pending-add-file:')
        || k.startsWith('NOVA:chat-pending-greenfield:')
        || k.startsWith('NOVA:media-feedback:')
        || k === 'NOVA:recent-creations'
        || k === 'NOVA:recent-projects'
        || k === 'NOVA:recent-chats'
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
  window.dispatchEvent(new Event('NOVA:creations-changed'));
  window.dispatchEvent(new Event('NOVA:chats-changed'));
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
  window.dispatchEvent(new Event('NOVA:cache-cleared'));
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
