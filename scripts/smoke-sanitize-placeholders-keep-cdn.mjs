/**
 * Placeholder sanitize must NOT wipe real CDN / brand https images.
 *   node scripts/smoke-sanitize-placeholders-keep-cdn.mjs
 */
import assert from 'node:assert/strict';

const { sanitizeCreatePolishPlaceholders } = await import('../src/lib/createBuildQuality.ts');

const app = `
<img src="https://cdn.brand.example/products/mouse.png" alt="Mouse" />
<img src="https://via.placeholder.com/400" alt="Fake" />
<img src="/heroes/desk.svg" alt="Desk" />
<img src="" alt="Empty" />
`;

const out = sanitizeCreatePolishPlaceholders(app);
assert.match(out, /cdn\.brand\.example\/products\/mouse\.png/, 'keeps real CDN art');
assert.match(out, /\/heroes\/desk\.svg/, 'keeps local heroes');
assert.doesNotMatch(out, /via\.placeholder\.com/, 'wipes placeholder hosts');
assert.match(out, /data:image\//, 'empty src becomes glyph');

console.log('smoke-sanitize-placeholders-keep-cdn: ok');
