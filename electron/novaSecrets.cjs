/** Encrypted provider API key storage (Electron safeStorage / OS keychain). */

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

function secretsPath() {
  return path.join(app.getPath('userData'), 'NOVA-provider-keys.enc');
}

function loadMap() {
  try {
    const file = secretsPath();
    if (!fs.existsSync(file)) return {};
    const buf = fs.readFileSync(file);
    if (safeStorage.isEncryptionAvailable()) {
      const json = safeStorage.decryptString(buf);
      return JSON.parse(json);
    }
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return {};
  }
}

function saveMap(map) {
  if (!encryptionAvailable()) {
    const err = new Error('Secure storage unavailable on this PC — API keys cannot be saved safely');
    err.code = 'NO_ENCRYPTION';
    throw err;
  }
  const json = JSON.stringify(map && typeof map === 'object' ? map : {});
  const file = secretsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const encrypted = safeStorage.encryptString(json);
  fs.writeFileSync(file, encrypted);
}

function encryptionAvailable() {
  try {
    return Boolean(safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

module.exports = {
  loadMap,
  saveMap,
  encryptionAvailable,
};
