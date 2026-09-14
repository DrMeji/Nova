/**
 * Preview session attach decision (no Electron).
 * Contract: if previewSession(cwd) returns ok+live URL → attach only; never start second Vite.
 */
import assert from 'node:assert/strict';

globalThis.window = globalThis.window || {};

const {
  decidePreviewSessionAttach,
  isPlaceholderPreviewUrl,
} = await import('../src/lib/projectPreview.ts');

assert.equal(isPlaceholderPreviewUrl('http://127.0.0.1:0'), true);
assert.equal(isPlaceholderPreviewUrl('http://127.0.0.1:5173'), false);
assert.equal(isPlaceholderPreviewUrl(''), true);

const attach = decidePreviewSessionAttach({
  ok: true,
  url: 'http://127.0.0.1:5173/',
});
assert.deepEqual(attach, { action: 'attach', url: 'http://127.0.0.1:5173/' });

const startMissing = decidePreviewSessionAttach(null);
assert.deepEqual(startMissing, { action: 'start' });

const startPlaceholder = decidePreviewSessionAttach({
  ok: true,
  url: 'http://127.0.0.1:0',
});
assert.deepEqual(startPlaceholder, { action: 'start' });

const startNotOk = decidePreviewSessionAttach({
  ok: false,
  url: 'http://127.0.0.1:5173',
});
assert.deepEqual(startNotOk, { action: 'start' });

console.log('smoke:preview-session ok');
