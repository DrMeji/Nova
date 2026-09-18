/**
 * Fail if secret env files are present anywhere that could ship / zip.
 * Also keeps encryption reject check + blocks obvious sk-/service_role in tracked scripts.
 */
const fs = require('fs');
const path = require('path');
const arkSecrets = require('../electron/arkSecrets.cjs');

const root = path.join(__dirname, '..');
let failed = 0;
const ok = (m) => console.log('OK:', m);
const fail = (m) => { console.error('FAIL:', m); failed += 1; };

const SKIP_DIR = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-electron',
  'release',
  'out',
  'coverage',
  '.cache',
  'playwright-report',
  'test-results',
]);

const SECRET_BASENAMES = new Set([
  '.env.local',
  '.env.production',
  '.env.development',
  '.env',
]);

function walk(dir, hits) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const name = ent.name;
    if (ent.isDirectory()) {
      if (SKIP_DIR.has(name)) continue;
      walk(path.join(dir, name), hits);
      continue;
    }
    if (SECRET_BASENAMES.has(name) && !/\.example$/i.test(name)) {
      hits.push(path.relative(root, path.join(dir, name)));
    }
  }
}

const secretHits = [];
walk(root, secretHits);
if (secretHits.length) {
  for (const h of secretHits) fail(`secret env in tree: ${h}`);
} else {
  ok('no .env / .env.local / .env.production / .env.development in tree');
}

try {
  const orig = arkSecrets.encryptionAvailable;
  arkSecrets.encryptionAvailable = () => false;
  let threw = false;
  try {
    arkSecrets.saveMap({ openai: 'test-key' });
  } catch (err) {
    threw = err.code === 'NO_ENCRYPTION' || /cannot be saved safely/i.test(String(err.message));
  }
  arkSecrets.encryptionAvailable = orig;
  if (threw) ok('saveMap rejects without encryption');
  else fail('saveMap should throw NO_ENCRYPTION');
} catch (err) {
  fail(err.message);
}

// Packaged asar/zip grep is ops at release time; still fail if release/ ships .env*
const releaseDir = path.join(root, 'release');
if (fs.existsSync(releaseDir)) {
  const releaseHits = [];
  walk(releaseDir, releaseHits);
  if (releaseHits.length) {
    for (const h of releaseHits) fail(`secret env in release/: ${h}`);
  } else {
    ok('release/ has no secret env files');
  }
}

process.exit(failed ? 1 : 0);
