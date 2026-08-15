/** First install / first run setup gate (local, once per machine profile). */

const SETUP_KEY = 'ark:setup-completed';
/** TEMP while building: always land on AuthScreen after rebuilds. Remove later. */
export const FORCE_AUTH_ON_LAUNCH = false;

let launchPrepared = false;

export function isSetupCompleted() {
  return localStorage.getItem(SETUP_KEY) === '1';
}

export function markSetupCompleted() {
  localStorage.setItem(SETUP_KEY, '1');
}

export function clearSetupCompleted() {
  localStorage.removeItem(SETUP_KEY);
}

export function prepareLaunchForTesting() {
  if (!FORCE_AUTH_ON_LAUNCH || launchPrepared) return;
  launchPrepared = true;
  // Clear guest bypass so the app opens on the sign in screen while we test.
  localStorage.removeItem('ark:bypass-enabled');
  // Re-run optimize flow each launch while testing first run UX.
  localStorage.removeItem(SETUP_KEY);
}
