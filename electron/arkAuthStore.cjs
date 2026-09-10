/**
 * Persist Supabase auth session in Electron userData (survives updates).
 * Encrypted with OS safeStorage when available.
 *
 * Serialized read/modify/write so concurrent token refresh + setItem cannot
 * truncate the map and drop the session mid-click.
 */

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

let chain = Promise.resolve();

function storePath() {
  return path.join(app.getPath('userData'), 'ark-auth-storage.dat');
}

function readMapSync() {
  try {
    const file = storePath();
    if (!fs.existsSync(file)) return {};
    if (!safeStorage.isEncryptionAvailable()) {
      // Never load legacy plaintext session into memory when OS encryption is off.
      return {};
    }
    const buf = fs.readFileSync(file);
    const raw = safeStorage.decryptString(buf);
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeMapSync(map) {
  const json = JSON.stringify(map && typeof map === 'object' ? map : {});
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  if (!safeStorage.isEncryptionAvailable()) {
    const err = new Error('Secure storage unavailable — auth session cannot be saved safely');
    err.code = 'NO_ENCRYPTION';
    throw err;
  }
  fs.writeFileSync(storePath(), safeStorage.encryptString(json));
}

function withLock(fn) {
  const run = chain.then(fn, fn);
  // Keep the chain alive even when fn throws.
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function getItem(key) {
  if (typeof key !== 'string' || !key) return null;
  return withLock(() => {
    const map = readMapSync();
    const v = map[key];
    return typeof v === 'string' ? v : null;
  });
}

function setItem(key, value) {
  if (typeof key !== 'string' || !key) return false;
  return withLock(() => {
    const map = readMapSync();
    map[key] = String(value ?? '');
    writeMapSync(map);
    return true;
  }).then(
    (ok) => ok,
    () => false,
  );
}

function removeItem(key) {
  if (typeof key !== 'string' || !key) return false;
  return withLock(() => {
    const map = readMapSync();
    if (key in map) {
      delete map[key];
      writeMapSync(map);
    }
    return true;
  }).then(
    (ok) => ok,
    () => false,
  );
}

module.exports = {
  getItem,
  setItem,
  removeItem,
};
