/**
 * Shared ARK on-disk paths. Models folder can be overridden by the user.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const CONFIG_NAME = 'ark-paths.json';

function configPath() {
  return path.join(app.getPath('userData'), CONFIG_NAME);
}

function defaultModelsDir() {
  return path.join(app.getPath('userData'), 'ark-engine', 'models');
}

function defaultBinDir() {
  return path.join(app.getPath('userData'), 'ark-engine', 'bin');
}

function readConfig() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeConfig(partial) {
  const next = { ...readConfig(), ...partial, updatedAt: new Date().toISOString() };
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function modelsDir() {
  const custom = readConfig().modelsDir;
  if (typeof custom === 'string' && custom.trim()) {
    return path.resolve(custom.trim());
  }
  return defaultModelsDir();
}

function setModelsDir(nextPath) {
  if (typeof nextPath !== 'string' || !nextPath.trim()) {
    throw new Error('Choose a valid folder path.');
  }
  const resolved = path.resolve(nextPath.trim());
  fs.mkdirSync(resolved, { recursive: true });
  // Prove the folder is writable before we commit the preference.
  const probe = path.join(resolved, `.ark-write-test-${Date.now()}`);
  try {
    fs.writeFileSync(probe, 'ok', 'utf8');
    fs.unlinkSync(probe);
  } catch {
    throw new Error('That folder is not writable. Pick another location.');
  }
  writeConfig({ modelsDir: resolved });
  return { ok: true, modelsDir: resolved, isCustom: true };
}

function resetModelsDir() {
  const cfg = readConfig();
  delete cfg.modelsDir;
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(
    configPath(),
    JSON.stringify({ ...cfg, updatedAt: new Date().toISOString() }, null, 2),
    'utf8',
  );
  const dir = defaultModelsDir();
  fs.mkdirSync(dir, { recursive: true });
  return { ok: true, modelsDir: dir, isCustom: false };
}

function modelsDirInfo() {
  const dir = modelsDir();
  const def = defaultModelsDir();
  return {
    modelsDir: dir,
    defaultModelsDir: def,
    isCustom: path.resolve(dir) !== path.resolve(def),
  };
}

module.exports = {
  modelsDir,
  setModelsDir,
  resetModelsDir,
  modelsDirInfo,
  defaultModelsDir,
  defaultBinDir,
  binDir: defaultBinDir,
};
