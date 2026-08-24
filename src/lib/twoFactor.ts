/** Local second factor. hash only, never store the code itself. */

const HASH_KEY = 'ark:2fa-hash';
const SALT_KEY = 'ark:2fa-salt';

function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hasSecondFactorSet() {
  try {
    return Boolean(localStorage.getItem(HASH_KEY) && localStorage.getItem(SALT_KEY));
  } catch {
    return false;
  }
}

export async function setSecondFactor(code: string) {
  const trimmed = code.replace(/\s+/g, '');
  if (trimmed.length < 6 || trimmed.length > 32) {
    throw new Error('Security code must be 6–32 characters');
  }
  const salt = randomSalt();
  const hash = await sha256Hex(`${salt}:${trimmed}`);
  localStorage.setItem(SALT_KEY, salt);
  localStorage.setItem(HASH_KEY, hash);
}

export async function clearSecondFactor() {
  localStorage.removeItem(HASH_KEY);
  localStorage.removeItem(SALT_KEY);
}

export async function verifySecondFactor(code: string) {
  const salt = localStorage.getItem(SALT_KEY) || '';
  const expected = localStorage.getItem(HASH_KEY) || '';
  if (!salt || !expected) return true;
  const hash = await sha256Hex(`${salt}:${code.replace(/\s+/g, '')}`);
  return hash === expected;
}
