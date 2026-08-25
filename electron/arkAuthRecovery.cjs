/**
 * TEMP local account recovery note (email + password + PIN) under Electron userData.
 * Does NOT leave this PC. Replace with real email / 2FA reset when that ships.
 */

const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');

function recoveryDir() {
  return path.join(app.getPath('userData'), 'account-recovery');
}

function recoveryFilePath() {
  return path.join(recoveryDir(), 'local-login-note.txt');
}

function readExistingFields() {
  try {
    const text = fs.readFileSync(recoveryFilePath(), 'utf8');
    const email = (text.match(/^Email:\s*(.*)$/m) || [])[1]?.trim() || '';
    const password = (text.match(/^Password:\s*(.*)$/m) || [])[1]?.trim() || '';
    const pin = (text.match(/^PIN:\s*(.*)$/m) || [])[1]?.trim() || '';
    return { email, password, pin };
  } catch {
    return { email: '', password: '', pin: '' };
  }
}

function buildNote({ email, password, pin }) {
  const when = new Date().toISOString();
  const lines = [
    'ARK — TEMPORARY local login note',
    '================================',
    '',
    'This file is ONLY on this PC (inside the ARK app data folder).',
    'It is NOT uploaded to ARK servers, GitHub, or the internet.',
    'Anyone with access to this Windows user profile can read it.',
    '',
    'Why it exists: email password-reset / PIN reset are not wired yet.',
    'When that ships, delete this file and stop relying on it.',
    '',
    `Saved at: ${when}`,
    `Email:    ${email || '(not saved yet — sign in once)'}`,
    `Password: ${password || '(not saved yet — sign in once)'}`,
    `PIN:      ${pin || '(not set)'}`,
    '',
    'Forgot password or PIN in ARK? Open this folder and read this file.',
    '',
  ];
  return lines.join('\n');
}

/**
 * Merge fields into the recovery note (pass only what you want to update).
 * @param {{ email?: string, password?: string, pin?: string | null }} payload
 */
function saveLoginNote(payload) {
  const prev = readExistingFields();
  const email = payload?.email != null ? String(payload.email).trim() : prev.email;
  const password = payload?.password != null ? String(payload.password) : prev.password;
  const pin = payload && 'pin' in payload
    ? (payload.pin == null || payload.pin === '' ? '' : String(payload.pin).replace(/\D/g, ''))
    : prev.pin;

  if (!email && !password && !pin) {
    return { ok: false, error: 'Nothing to save' };
  }

  try {
    const dir = recoveryDir();
    fs.mkdirSync(dir, { recursive: true });
    const filePath = recoveryFilePath();
    fs.writeFileSync(filePath, buildNote({ email, password, pin }), { encoding: 'utf8', mode: 0o600 });
    return { ok: true, path: filePath, folder: dir };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save recovery note' };
  }
}

function getRecoveryInfo() {
  const filePath = recoveryFilePath();
  const folder = recoveryDir();
  let exists = false;
  try {
    exists = fs.existsSync(filePath);
  } catch {
    exists = false;
  }
  return { ok: true, path: filePath, folder, exists };
}

async function revealRecoveryFolder() {
  const info = getRecoveryInfo();
  try {
    fs.mkdirSync(info.folder, { recursive: true });
  } catch {
    /* ignore */
  }
  try {
    if (info.exists) {
      shell.showItemInFolder(info.path);
    } else {
      const err = await shell.openPath(info.folder);
      if (err) return { ok: false, error: err, ...info };
    }
    return { ok: true, ...info };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not open folder',
      ...info,
    };
  }
}

module.exports = {
  saveLoginNote,
  getRecoveryInfo,
  revealRecoveryFolder,
  recoveryFilePath,
  recoveryDir,
};
