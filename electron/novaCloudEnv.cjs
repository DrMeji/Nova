/**
 * Resolve Supabase cloud auth env for Electron.
 * Prefers project `.env.local` / `.env` (dev) then userData `cloud-auth.env`
 * so guest-local Vite builds can still sign in after keys are dropped on disk
 * without requiring a rebuild.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

function parseEnvFile(text) {
  const out = {};
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) out[key] = val;
  }
  return out;
}

function readEnvFile(filePath) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return {};
    return parseEnvFile(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function userDataCloudEnvPath() {
  try {
    return path.join(app.getPath('userData'), 'cloud-auth.env');
  } catch {
    return null;
  }
}

function candidateEnvFiles() {
  const files = [];
  try {
    // Unpackaged: app path is the repo root (Open-NOVA-Build).
    const appPath = app.getAppPath();
    files.push(path.join(appPath, '.env.local'));
    files.push(path.join(appPath, '.env'));
  } catch {
    /* ignore */
  }
  try {
    files.push(path.join(process.cwd(), '.env.local'));
    files.push(path.join(process.cwd(), '.env'));
  } catch {
    /* ignore */
  }
  const ud = userDataCloudEnvPath();
  if (ud) files.push(ud);
  return [...new Set(files)];
}

/**
 * @returns {{ url: string, anonKey: string, source: string | null, configured: boolean }}
 */
function getCloudAuthEnv() {
  let url = '';
  let anonKey = '';
  let source = null;
  for (const file of candidateEnvFiles()) {
    const parsed = readEnvFile(file);
    const nextUrl = String(parsed.VITE_SUPABASE_URL || '').trim();
    const nextKey = String(parsed.VITE_SUPABASE_ANON_KEY || '').trim();
    if (nextUrl && !url) {
      url = nextUrl;
      source = file;
    }
    if (nextKey && !anonKey) {
      anonKey = nextKey;
      source = source || file;
    }
    if (url && anonKey) break;
  }
  const configured = Boolean(url && anonKey && !/placeholder\.invalid/i.test(url));
  return {
    url: configured ? url : '',
    anonKey: configured ? anonKey : '',
    source: configured ? source : null,
    configured,
  };
}

module.exports = {
  getCloudAuthEnv,
  userDataCloudEnvPath,
  candidateEnvFiles,
};
