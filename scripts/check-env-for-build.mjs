/**
 * Fail fast before Vite build if Supabase client env is missing.
 * Reads .env.local then .env.production (later wins). Never prints secret values.
 *
 * Usage: node scripts/check-env-for-build.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REQUIRED = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'];

/** dotenv-style: KEY=VALUE, ignore comments/blank, strip optional quotes. */
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

function loadMergedEnv() {
  const merged = { ...process.env };
  for (const name of ['.env.local', '.env.production']) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) continue;
    try {
      Object.assign(merged, parseEnvFile(fs.readFileSync(full, 'utf8')));
    } catch {
      /* ignore unreadable */
    }
  }
  return merged;
}

const env = loadMergedEnv();
const missing = REQUIRED.filter((k) => !String(env[k] || '').trim());

if (missing.length) {
  if (String(process.env.NOVA_ALLOW_LOCAL_ONLY || '').trim() === '1') {
    console.warn('NOVA build env check: missing', missing.join(', '));
    console.warn('NOVA_ALLOW_LOCAL_ONLY=1 — building guest-local Electron (cloud sign-in off).');
    process.exit(0);
  }
  console.error('NOVA build env check failed.');
  console.error(`Missing: ${missing.join(', ')}`);
  console.error('Copy .env.example → .env.local and set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.');
  console.error('Or set NOVA_ALLOW_LOCAL_ONLY=1 for guest-local desktop builds (no cloud login).');
  console.error('(Do not commit real secrets. Keys stay on this machine.)');
  process.exit(1);
}

console.log('NOVA build env check: ok');
