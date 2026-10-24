/**
 * In-place rebuild of a node-api must keep server scaffold, not CLI bin.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-inplace-rebuild-api.mjs
 */
import assert from 'node:assert/strict';
import { wipeProjectUiFiles } from '../src/lib/inPlaceRebuild.ts';

const next = wipeProjectUiFiles({
  files: {
    'package.json': '{"name":"api"}',
    'src/server.js': 'old',
    'src/App.jsx': 'export default function App(){return null}',
  },
  name: 'BookingApi',
  summary: 'Rebuild Express API with rate limiting — no frontend',
  kind: 'node-cli',
  artifactKind: 'node-api',
});
const paths = Object.keys(next).map((p) => p.replace(/\\/g, '/'));
assert.ok(paths.some((p) => /src\/server\.js$/i.test(p)), 'keep/server scaffold');
assert.ok(!paths.some((p) => /bin\/cli\.js$/i.test(p)), 'no CLI hijack');
assert.ok(!/vite\.config/i.test(paths.join(',')), 'no Vite hijack');

console.log('smoke-inplace-rebuild-api: ok');
