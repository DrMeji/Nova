/**
 * Smoke: auth session expiry heal (post-login kickout defense).
 */
import assert from 'node:assert/strict';
import { healSessionExpires } from '../src/lib/supabase.ts';

const now = Math.floor(Date.now() / 1000);

// Server-skewed expires_at already in the past (classic Windows clock skew).
const skewed = healSessionExpires({
  access_token: 'a',
  refresh_token: 'refresh-token-long-enough',
  expires_in: 3600,
  expires_at: now - 120,
});
assert.ok((skewed.expires_at || 0) > now + 3000, 'healed expires_at must be in the future');
assert.equal(skewed.expires_at, now + 3600);

const alreadyGood = healSessionExpires({
  access_token: 'a',
  refresh_token: 'r',
  expires_in: 3600,
  expires_at: now + 3600,
});
assert.equal(alreadyGood.expires_at, now + 3600);

console.log('PASS  auth session heal checks');
