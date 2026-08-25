/** Local PIN lock. hash only, never store the PIN itself. */

const HASH_KEY = 'ark:pin-hash';
const SALT_KEY = 'ark:pin-salt';
const SESSION_KEY = 'ark:pin-unlocked';
const FAILURES_KEY = 'ark:pin-failures';
const LOCKOUT_KEY = 'ark:pin-lockout-until';
const MAX_FAILURES = 10_000;
const LOCKOUT_MS = 0; // testing: no PIN lockout delay for now


function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hasPinSet() {
  try {
    return Boolean(localStorage.getItem(HASH_KEY) && localStorage.getItem(SALT_KEY));
  } catch {
    return false;
  }
}

export function isPinUnlocked() {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPinUnlocked() {
  try {
    sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    /* ignore */
  }
}

export function lockPinSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event('ark:pin-lock'));
}

export async function setPin(pin: string) {
  const trimmed = pin.replace(/\D/g, '');
  if (trimmed.length < 4 || trimmed.length > 8) {
    throw new Error('PIN must be 4–8 digits');
  }
  const salt = randomSalt();
  const hash = await sha256Hex(`${salt}:${trimmed}`);
  localStorage.setItem(SALT_KEY, salt);
  localStorage.setItem(HASH_KEY, hash);
  markPinUnlocked();
}

export async function clearPin() {
  localStorage.removeItem(HASH_KEY);
  localStorage.removeItem(SALT_KEY);
  markPinUnlocked();
}

export function getPinLockoutMs() {
  try {
    return Math.max(0, Number(sessionStorage.getItem(LOCKOUT_KEY) || 0) - Date.now());
  } catch {
    return 0;
  }
}

export async function verifyPin(pin: string) {
  if (getPinLockoutMs() > 0) return false;
  const salt = localStorage.getItem(SALT_KEY) || '';
  const expected = localStorage.getItem(HASH_KEY) || '';
  if (!salt || !expected) return true;
  const hash = await sha256Hex(`${salt}:${pin.replace(/\D/g, '')}`);
  if (hash !== expected) {
    try {
      const failures = Number(sessionStorage.getItem(FAILURES_KEY) || 0) + 1;
      if (failures >= MAX_FAILURES) {
        sessionStorage.setItem(LOCKOUT_KEY, String(Date.now() + LOCKOUT_MS));
        sessionStorage.setItem(FAILURES_KEY, '0');
      } else {
        sessionStorage.setItem(FAILURES_KEY, String(failures));
      }
    } catch {
      /* throttle is best-effort when session storage is unavailable */
    }
    return false;
  }
  try {
    sessionStorage.removeItem(FAILURES_KEY);
    sessionStorage.removeItem(LOCKOUT_KEY);
  } catch {
    /* ignore */
  }
  markPinUnlocked();
  return true;
}

export function shouldLockOnLaunch(requirePinOnLaunch: boolean) {
  return requirePinOnLaunch && hasPinSet() && !isPinUnlocked();
}
