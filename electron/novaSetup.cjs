/**
 * Persist first-run setup completion in Electron userData.
 *
 * Bound to nova-install-id so a reinstall (new install id) always re-runs
 * Hardware → Models → Connect even if AppData was not fully wiped.
 * Fresh NSIS installs delete nova-setup.json + nova-install-id (see installer.nsh).
 * Upgrades keep both files so setup is not repeated.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

function setupFile() {
  return path.join(app.getPath('userData'), 'nova-setup.json');
}

function installIdFile() {
  return path.join(app.getPath('userData'), 'nova-install-id');
}

function ensureInstallId() {
  const file = installIdFile();
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing) return { id: existing, created: false };
  } catch {
    /* missing */
  }
  const id = crypto.randomUUID();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${id}\n`, 'utf8');
  } catch {
    /* read-only userData — still return ephemeral id for this session */
  }
  return { id, created: true };
}

function readSetup() {
  const { id: installId, created } = ensureInstallId();
  try {
    const raw = fs.readFileSync(setupFile(), 'utf8');
    const data = JSON.parse(raw);
    let completed = Boolean(data?.completed);
    const stamped = typeof data?.installId === 'string' ? data.installId.trim() : '';
    let freshInstall = Boolean(created);

    if (completed && stamped && stamped !== installId) {
      // Reinstall left an old setup flag under a new install id — force onboarding.
      completed = false;
      freshInstall = true;
      writeSetup(false, installId);
    } else if (completed && !stamped) {
      // Legacy builds had no install id — keep setup through upgrades, stamp this install.
      writeSetup(true, installId);
    }

    return { ok: true, completed, installId, freshInstall };
  } catch {
    return { ok: true, completed: false, installId, freshInstall: true };
  }
}

function writeSetup(completed, installIdOpt) {
  const installId = installIdOpt || ensureInstallId().id;
  const file = setupFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const payload = {
    completed: Boolean(completed),
    installId,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, completed: Boolean(completed), installId };
}

module.exports = {
  readSetup,
  writeSetup,
  ensureInstallId,
};
