/** Persist NOVA Brain API bearer token (packaged installs get one on first run). */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

function tokenPath() {
  return path.join(app.getPath('userData'), 'NOVA-brain-token.dat');
}

function encryptionAvailable() {
  try {
    return Boolean(safeStorage.isEncryptionAvailable());
  } catch {
    return false;
  }
}

function loadToken() {
  const fromEnv = String(process.env.NOVA_BRAIN_TOKEN || '').trim();
  if (fromEnv) return fromEnv;
  try {
    const file = tokenPath();
    if (!fs.existsSync(file)) return '';
    const buf = fs.readFileSync(file);
    if (!encryptionAvailable()) {
      // Never treat a leftover plaintext file as a valid token.
      return '';
    }
    return safeStorage.decryptString(buf).trim();
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
  if (!encryptionAvailable()) {
    const err = new Error('Secure storage unavailable — brain token cannot be saved safely');
    err.code = 'NO_ENCRYPTION';
    throw err;
  }
  fs.mkdirSync(path.dirname(tokenPath()), { recursive: true });
  fs.writeFileSync(tokenPath(), safeStorage.encryptString(value));
  return value;
}

function ensureToken(packaged) {
  const existing = loadToken();
  if (existing) return existing;
  if (!packaged) return '';
  if (!encryptionAvailable()) return '';
  const next = crypto.randomBytes(24).toString('hex');
  return saveToken(next);
}

function rotateToken() {
  if (!encryptionAvailable()) {
    const err = new Error('Secure storage unavailable — brain token cannot be rotated safely');
    err.code = 'NO_ENCRYPTION';
    throw err;
  }
  const next = crypto.randomBytes(24).toString('hex');
  return saveToken(next);
}

module.exports = {
  loadToken,
  saveToken,
  ensureToken,
  rotateToken,
  encryptionAvailable,
};
