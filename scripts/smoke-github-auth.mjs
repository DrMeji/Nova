/**
 * Smoke checks for GitHub-only auth gate (no Electron / no live OAuth).
 * Run: node --experimental-strip-types scripts/smoke-github-auth.mjs
 * or: node scripts/smoke-github-auth.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function mustInclude(path, needles, label) {
  const abs = join(root, path);
  assert.ok(existsSync(abs), `missing ${path}`);
  const text = readFileSync(abs, 'utf8');
  for (const n of needles) {
    assert.ok(text.includes(n), `${label || path} must include ${JSON.stringify(n)}`);
  }
}

function mustNotInclude(path, needles, label) {
  const abs = join(root, path);
  const text = readFileSync(abs, 'utf8');
  for (const n of needles) {
    assert.ok(!text.includes(n), `${label || path} must not include ${JSON.stringify(n)}`);
  }
}

// Phase 0 — social parked
mustInclude('src/lib/featurePark.ts', [
  "export function isSocialParked",
  "if (name === 'networking' || name === 'message') return true",
  'const ALWAYS_LIVE: ParkId[] = []',
]);

// Phase 1 — GitHub session + AuthScreen CTA
mustInclude('src/lib/githubSession.ts', [
  'saveGitHubSession',
  'clearGitHubSession',
  'setPluginToken',
  'formatGitHubIdentity',
]);
mustInclude('src/components/auth/AuthScreen.tsx', [
  'Continue with GitHub',
  'signInWithGitHub',
]);
mustNotInclude('src/components/auth/AuthScreen.tsx', [
  'signIn(',
  'Forgot password',
  'Create account',
]);

// AuthContext GitHub-first
mustInclude('src/context/AuthContext.tsx', [
  'signInWithGitHub',
  'loadGitHubSession',
  'clearGitHubSession',
  "Email sign-in is retired",
]);

// App boots without supabase hard-fail
mustNotInclude('src/App.tsx', ['supabaseConfigError']);
mustInclude('src/lib/supabase.ts', [
  'export const supabaseConfigError: string | null = null',
]);

// Identity = GitHub username
mustInclude('src/components/SettingsGeneral.tsx', [
  '>GitHub</label>',
  'Signed in with GitHub',
]);
mustInclude('src/lib/novaUserId.ts', ['GitHub-only identity']);

// Social quarantine
mustInclude('src/context/SocialContext.tsx', [
  'socialCloudLive',
  'Networking is coming soon',
]);

console.log('smoke-github-auth: ok');
