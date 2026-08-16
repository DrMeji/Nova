/** First-run setup gate — localStorage + Electron userData (source of truth on desktop). */

const SETUP_KEY = 'ark:setup-completed';
const BYPASS_KEY = 'ark:bypass-enabled';
/** TEMP while building: always land on AuthScreen after rebuilds. Remove later. */
export const FORCE_AUTH_ON_LAUNCH = false;

let launchPrepared = false;
let gatePromise: Promise<void> | null = null;

export function isSetupCompleted() {
  return localStorage.getItem(SETUP_KEY) === '1';
}

/** True until this install finishes Hardware → Models → Connect once. */
export function needsFirstRunSetup() {
  return !isSetupCompleted();
}

export function markSetupCompleted() {
  localStorage.setItem(SETUP_KEY, '1');
  void window.arkDesktop?.setupSet?.(true)?.catch?.(() => {});
  window.dispatchEvent(new Event('ark:setup-changed'));
}

export function clearSetupCompleted() {
  localStorage.removeItem(SETUP_KEY);
  void window.arkDesktop?.setupSet?.(false)?.catch?.(() => {});
  window.dispatchEvent(new Event('ark:setup-changed'));
}

/**
 * Packaged / desktop installs: sync setup from Electron userData so a real
 * first install always runs Hardware → Models → Connect (sign-in and sign-up).
 * Cleared when the app is uninstalled (deleteAppDataOnUninstall).
 */
export async function ensureFirstRunGate(): Promise<void> {
  if (!gatePromise) {
    gatePromise = (async () => {
      try {
        const meta = await window.arkDesktop?.appMeta?.();
        if (meta?.isPackaged) {
          localStorage.removeItem(BYPASS_KEY);
        }
      } catch {
        /* ignore */
      }

      try {
        const state = await window.arkDesktop?.setupGet?.();
        if (state && typeof state.completed === 'boolean') {
          if (state.completed) localStorage.setItem(SETUP_KEY, '1');
          else localStorage.removeItem(SETUP_KEY);
          return;
        }
      } catch {
        /* ignore */
      }

      // No desktop file yet — treat as not completed until onboarding finishes.
      if (window.arkDesktop?.setupGet) {
        localStorage.removeItem(SETUP_KEY);
        await window.arkDesktop.setupSet?.(false)?.catch?.(() => {});
      }
    })();
  }
  await gatePromise;
}

export function waitForFirstRunGate() {
  return ensureFirstRunGate();
}

export function prepareLaunchForTesting() {
  if (!FORCE_AUTH_ON_LAUNCH || launchPrepared) return;
  launchPrepared = true;
  localStorage.removeItem(BYPASS_KEY);
  localStorage.removeItem(SETUP_KEY);
}
