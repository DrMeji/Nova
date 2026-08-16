/**
 * Persist Supabase auth session in Electron userData (survives updates).
 * localStorage alone is too easy to lose across reinstall/update edge cases.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function storePath() {
  return path.join(app.getPath('userData'), 'ark-auth-storage.json');
}

function readMap() {
  try {
    const raw = fs.readFileSync(storePath(), 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(map), 'utf8');
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
