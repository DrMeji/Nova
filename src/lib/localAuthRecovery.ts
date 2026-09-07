/**
 * TEMP local login recovery (email + password on this PC only).
 * Not a substitute for real email reset — bridge until that exists.
 */

const NOTICE_KEY = 'NOVA:local-recovery-notice-shown';

export type LocalRecoveryInfo = {
  ok: boolean;
  path?: string;
  folder?: string;
  exists?: boolean;
  error?: string;
};

export async function saveLocalLoginRecovery(email: string, password: string): Promise<LocalRecoveryInfo> {
  const api = window.arkDesktop?.authRecoverySave;
  if (!api) {
    return { ok: false, error: 'Desktop only' };
  }
  try {
    return await api({ email: email.trim(), password });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}

export async function saveLocalPinRecovery(pin: string): Promise<LocalRecoveryInfo> {
  const api = window.arkDesktop?.authRecoverySave;
  if (!api) return { ok: false, error: 'Desktop only' };
  try {
    return await api({ pin: String(pin || '').replace(/\D/g, '') });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Save failed' };
  }
}

export async function clearLocalPinRecovery(): Promise<LocalRecoveryInfo> {
  const api = window.arkDesktop?.authRecoverySave;
  if (!api) return { ok: false, error: 'Desktop only' };
  try {
    return await api({ pin: '' });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Clear failed' };
  }
}

export async function getLocalLoginRecoveryInfo(): Promise<LocalRecoveryInfo> {
  const api = window.arkDesktop?.authRecoveryInfo;
  if (!api) return { ok: false, error: 'Desktop only' };
  try {
    return await api();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Lookup failed' };
  }
}

export async function revealLocalLoginRecovery(): Promise<LocalRecoveryInfo> {
  const api = window.arkDesktop?.authRecoveryReveal;
  if (!api) return { ok: false, error: 'Desktop only' };
  try {
    return await api();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not open folder' };
  }
}

export function shouldShowLocalRecoveryNotice(): boolean {
  try {
    return localStorage.getItem(NOTICE_KEY) !== '1';
  } catch {
    return true;
  }
}

export function markLocalRecoveryNoticeShown() {
  try {
    localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function formatForgotPasswordHelp(info: LocalRecoveryInfo): string {
  const folder = info.folder || '(NOVA app data → account-recovery)';
  const file = info.path || 'local-login-note.txt';
  if (info.exists) {
    return [
      'Temporary password / PIN help (this PC only)',
      '',
      'NOVA does not email password or PIN resets yet.',
      'Your last successful sign-in and PIN (if set) are saved in a private note on this computer only — nothing is sent to NOVA servers.',
      '',
      `Open this folder:\n${folder}`,
      '',
      `File:\n${file}`,
      '',
      'Read the Email / Password / PIN lines, then sign in again.',
      'Anyone who can use this Windows account can open that file — treat the PC like the vault.',
    ].join('\n');
  }
  return [
    'Temporary password help (this PC only)',
    '',
    'No local recovery note was found yet.',
    'Sign in or create an account once on this PC — NOVA will save a private note under the NOVA app data folder (not the internet).',
    '',
    `Expected folder:\n${folder}`,
    '',
    'Until then, you can still contact @DrMeji on GitHub if the account exists in the cloud but this PC never saved a note.',
  ].join('\n');
}
