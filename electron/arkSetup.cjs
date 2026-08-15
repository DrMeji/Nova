/**
 * Persist first-run setup completion in Electron userData.
 * Cleared when the app is uninstalled (deleteAppDataOnUninstall).
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function setupFile() {
  return path.join(app.getPath('userData'), 'ark-setup.json');
}

function readSetup() {
  try {
    const raw = fs.readFileSync(setupFile(), 'utf8');
    const data = JSON.parse(raw);
    return { ok: true, completed: Boolean(data?.completed) };
  } catch {
    return { ok: true, completed: false };
  }
}

function writeSetup(completed) {
  const file = setupFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({ completed: Boolean(completed), updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
  return { ok: true, completed: Boolean(completed) };
}

module.exports = {
  readSetup,
  writeSetup,
};
