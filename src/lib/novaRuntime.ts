/**
 * Runtime profile: bat / source Electron vs installed Setup.exe.
 * Open-NOVA-Build.bat uses an unpackaged Electron + production Vite bundle —
 * that is NOT import.meta.env.DEV, but it IS a dev session (isPackaged === false).
 */

function viteDev(): boolean {
  try {
    return Boolean(import.meta.env?.DEV);
  } catch {
    return false;
  }
}

/** True for Start Menu / NOVA-Setup.exe installs. */
export function isArkPackagedApp(): boolean {
  if (typeof window === 'undefined') return !viteDev();
  return window.novaDesktop?.isPackaged === true;
}

/** True for Open-NOVA-Build.bat, electron:dev, and Vite dev. not retail installs. */
export function isNovaDevSession(): boolean {
  if (viteDev()) return true;
  if (typeof window !== 'undefined' && window.novaDesktop?.isPackaged === false) return true;
  return false;
}

/** Demo social data, friend-request testing (never Call — Call is removed). */
export function isSocialDemoEnabled(): boolean {
  return isNovaDevSession();
}

/** @deprecated Prefer isSocialDemoEnabled(). kept for existing imports. */
export const SOCIAL_DEMO_ENABLED = typeof window !== 'undefined'
  ? isNovaDevSession()
  : viteDev();
