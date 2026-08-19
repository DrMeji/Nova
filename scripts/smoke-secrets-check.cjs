/**
 * Smoke: secrets save must reject when encryption unavailable (mock).
 * node scripts/smoke-secrets-check.cjs
 */
const arkSecrets = require('../electron/arkSecrets.cjs');

let failed = 0;
const ok = (m) => console.log('OK:', m);
const fail = (m) => { console.error('FAIL:', m); failed += 1; };

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
