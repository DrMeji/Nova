/**
 * Fail if secret env files are present in the repo root (should never ship / zip).
 * Also keeps encryption reject check.
 */
const fs = require('fs');
const path = require('path');
const arkSecrets = require('../electron/arkSecrets.cjs');

const root = path.join(__dirname, '..');
let failed = 0;
const ok = (m) => console.log('OK:', m);
const fail = (m) => { console.error('FAIL:', m); failed += 1; };

for (const name of ['.env.local', '.env.production', '.env.development']) {
  const p = path.join(root, name);
  if (fs.existsSync(p)) fail(`${name} must not exist in repo root (use .env.example only)`);
  else ok(`${name} absent`);
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

process.exit(failed ? 1 : 0);
