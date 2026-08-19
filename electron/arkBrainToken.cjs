/** Persist ARK Brain API bearer token (packaged installs get one on first run). */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

function tokenPath() {
  return path.join(app.getPath('userData'), 'ark-brain-token.dat');
}

function loadToken() {
  const fromEnv = String(process.env.ARK_BRAIN_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const file = tokenPath();
    if (!fs.existsSync(file)) return '';
    const buf = fs.readFileSync(file);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf).trim();
    }
    return buf.toString('utf8').trim();
  } catch {
    return '';
  }
}

function saveToken(token) {
  const value = String(token || '').trim();
  if (!value) {
    try {
      if (fs.existsSync(tokenPath())) fs.unlinkSync(tokenPath());
    } catch {
      /* ignore */
    }
    return value;
  }
  fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(tokenPath(), safeStorage.encryptString(value));
  } else {
    fs.writeFileSync(tokenPath(), value, 'utf8');
  }
  return value;
}

function ensureToken(packaged) {
  const existing = loadToken();
  if (existing) return existing;
  if (!packaged) return '';
  const next = crypto.randomBytes(24).toString('hex');
  return saveToken(next);
}

function rotateToken() {
  const next = crypto.randomBytes(24).toString('hex');
  return saveToken(next);
}

module.exports = {
  loadToken,
  saveToken,
  ensureToken,
  rotateToken,
};
