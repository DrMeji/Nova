/**
 * Runtime profile: bat / source Electron vs installed Setup.exe.
 * Open-NOVA-Build.bat uses an unpackaged Electron + production Vite bundle —
 * that is NOT import.meta.env.DEV, but it IS a dev session (isPackaged === false).
 */

/** True for Start Menu / NOVA-Setup.exe installs. */
export function isArkPackagedApp(): boolean {
  if (typeof window === 'undefined') return !import.meta.env.DEV;
  return window.arkDesktop?.isPackaged === true;
}

/** True for Open-NOVA-Build.bat, electron:dev, and Vite dev. not retail installs. */
export function isArkDevSession(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window !== 'undefined' && window.arkDesktop?.isPackaged === false) return true;
  return false;
}

/** Demo social data, friend-request testing, call demo buttons. */
export function isSocialDemoEnabled(): boolean {
  return isArkDevSession();
}

/** @deprecated Prefer isSocialDemoEnabled(). kept for existing imports. */
export const SOCIAL_DEMO_ENABLED = typeof window !== 'undefined'
  ? isArkDevSession()
  : import.meta.env.DEV;
