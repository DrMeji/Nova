/**
 * Persist optional OAuth client ids (public) in userData so device login
 * works without shell env vars. Secrets still come from env when needed.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function configPath() {
  return path.join(app.getPath('userData'), 'NOVA-oauth-clients.json');
}

function load() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function save(map) {
  const clean = {};
  for (const [k, v] of Object.entries(map || {})) {
    if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
  }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(clean, null, 2), 'utf8');
  return clean;
}

function get(pluginId) {
  const map = load();
  return (map[pluginId] || '').trim() || null;
}

function set(pluginId, clientId) {
  const map = load();
  if (clientId && String(clientId).trim()) map[pluginId] = String(clientId).trim();
  else delete map[pluginId];
  return save(map);
}

module.exports = { load, save, get, set, configPath };
