/** Encrypted provider API key storage (Electron safeStorage / OS keychain). */

const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');

function secretsPath() {
  return path.join(app.getPath('userData'), 'ark-provider-keys.enc');
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
  const json = JSON.stringify(map && typeof map === 'object' ? map : {});
  const file = secretsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(json);
    fs.writeFileSync(file, encrypted);
  } else {
    fs.writeFileSync(file, json, 'utf8');
  }
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
