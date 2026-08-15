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
export const CLEAN_BOOT_TOKEN = 'clean-2026-08-15-g';

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

/** Run once per token so reopen is empty for testing. */
export function runCleanBootIfNeeded() {
  try {
    if (localStorage.getItem('ark:clean-boot-token') === CLEAN_BOOT_TOKEN) return false;
    clearArkSessionHistory();
    localStorage.setItem('ark:clean-boot-token', CLEAN_BOOT_TOKEN);
    return true;
  } catch {
    clearArkSessionHistory();
    return true;
  }
}
