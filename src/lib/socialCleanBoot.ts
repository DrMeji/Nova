/**
 * Wipe dev-only social data on packaged releases so public installs start clean.
 * Friend requests / demo notifications never leak to end users.
 */

import { loadLocalNotifications } from '@/lib/localNotifications';

/** Bump when shipping a release that must reset social dev residue. */
export const SOCIAL_RELEASE_CLEAN_TOKEN = 'social-release-2026-08-24';

const SOCIAL_WIPE_KEYS = [
  'ark:friend-requests',
];

function wipeFriendNotifications() {
  try {
    const list = loadLocalNotifications();
    const next = list.filter(n => {
      if (n.friendRequestId) return false;
      if (n.kind === 'friend') return false;
      if (n.title?.toLowerCase().includes('friend request')) return false;
      return true;
    });
    localStorage.setItem('ark:local-notifications', JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('ark:local-notifications'));
  } catch {
    /* ignore */
  }
}

export function clearSocialDevData() {
  for (const key of SOCIAL_WIPE_KEYS) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  wipeFriendNotifications();
  window.dispatchEvent(new CustomEvent('ark:friend-requests'));
}

/** Run once per token on packaged retail installs only (not bat/source builds). */
export function runSocialReleaseCleanIfNeeded(): boolean {
  try {
    if (window.arkDesktop?.isPackaged !== true) return false;
    const tokenKey = 'ark:social-release-clean';
    if (localStorage.getItem(tokenKey) === SOCIAL_RELEASE_CLEAN_TOKEN) return false;
    clearSocialDevData();
    localStorage.setItem(tokenKey, SOCIAL_RELEASE_CLEAN_TOKEN);
    return true;
  } catch {
    return false;
  }
}
