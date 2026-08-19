/**
 * Persist Supabase auth session in Electron userData (survives updates).
 * Encrypted with OS safeStorage when available.
 */

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

function storePath() {
  return path.join(app.getPath('userData'), 'ark-auth-storage.dat');
}

function readMap() {
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

function writeMap(map) {
  const json = JSON.stringify(map && typeof map === 'object' ? map : {});
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  if (!safeStorage.isEncryptionAvailable()) {
    const err = new Error('Secure storage unavailable — auth session cannot be saved safely');
    err.code = 'NO_ENCRYPTION';
    throw err;
  }
  fs.writeFileSync(storePath(), safeStorage.encryptString(json));
}

function getItem(key) {
  if (typeof key !== 'string' || !key) return null;
  const map = readMap();
  const v = map[key];
  return typeof v === 'string' ? v : null;
}

function setItem(key, value) {
  if (typeof key !== 'string' || !key) return false;
  const map = readMap();
  map[key] = String(value ?? '');
  writeMap(map);
  return true;
}

function removeItem(key) {
  if (typeof key !== 'string' || !key) return false;
  const map = readMap();
  if (key in map) {
    delete map[key];
    writeMap(map);
  }
  return true;
}

module.exports = {
  getItem,
  setItem,
  removeItem,
};
