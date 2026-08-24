/** First-run setup gate. localStorage + Electron userData (source of truth on desktop). */

const SETUP_KEY = 'ark:setup-completed';
const BYPASS_KEY = 'ark:bypass-enabled';
/** TEMP while building: always land on AuthScreen after rebuilds. Remove later. */
export const FORCE_AUTH_ON_LAUNCH = false;

let launchPrepared = false;
let gatePromise: Promise<void> | null = null;
/** True when this launch is a brand-new (or reinstalled) install that must start at Auth. */
let freshInstallGate = false;

export function isSetupCompleted() {
  return localStorage.getItem(SETUP_KEY) === '1';
}

/** True until this install finishes Hardware → Models → Connect once. */
export function needsFirstRunSetup() {
  return !isSetupCompleted();
}

/** Fresh / reinstalled desktop install. leftover sessions must not skip Auth. */
export function isFreshInstallGate() {
  return freshInstallGate;
}

export function markSetupCompleted() {
  localStorage.setItem(SETUP_KEY, '1');
  gatePromise = null;
  freshInstallGate = false;
  void window.arkDesktop?.setupSet?.(true)?.catch?.(() => {});
  window.dispatchEvent(new Event('ark:setup-changed'));
}

export function clearSetupCompleted() {
  localStorage.removeItem(SETUP_KEY);
  gatePromise = null;
  void window.arkDesktop?.setupSet?.(false)?.catch?.(() => {});
  window.dispatchEvent(new Event('ark:setup-changed'));
}

/**
 * Packaged / desktop installs: sync setup from Electron userData so a real
 * first install always runs Auth → Hardware → Models → Connect.
 * Cleared on uninstall, and invalidated when ark-install-id changes (reinstall
 * that left leftover AppData). Upgrades keep the same install id + setup flag.
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
          if (state.completed) {
            localStorage.setItem(SETUP_KEY, '1');
            freshInstallGate = false;
          } else {
            localStorage.removeItem(SETUP_KEY);
            freshInstallGate = Boolean((state as { freshInstall?: boolean }).freshInstall);
          }
          return;
        }
      } catch {
        /* ignore */
      }

      // No desktop file yet. treat as not completed until onboarding finishes.
      if (window.arkDesktop?.setupGet) {
        localStorage.removeItem(SETUP_KEY);
        freshInstallGate = true;
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
