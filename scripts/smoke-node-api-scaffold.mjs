/**
 * Express API asks get node-api scaffold, not Vite React.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-node-api-scaffold.mjs
 */
import assert from 'node:assert/strict';
import { buildScaffoldFiles } from '../src/lib/projectScaffolds.ts';

const files = buildScaffoldFiles('node-cli', {
  name: 'TodoApi',
  summary: 'Build an Express REST API for todos — no frontend',
});
const paths = files.map((f) => f.path);
assert.ok(paths.includes('src/server.js'), 'has server entry');
assert.ok(!paths.includes('src/App.jsx'), 'no React App');
assert.ok(!paths.includes('vite.config.js'), 'no Vite');
const pkg = files.find((f) => f.path === 'package.json')?.content || '';
assert.match(pkg, /express/);
assert.match(pkg, /src\/server\.js/);

const cli = buildScaffoldFiles('node-cli', {
  name: 'RenameCli',
  summary: 'Build a node CLI tool that renames files',
});
assert.ok(cli.some((f) => f.path === 'bin/cli.js'), 'CLI keeps bin/cli.js');
assert.ok(!cli.some((f) => f.path === 'src/server.js'), 'CLI is not API');

console.log('smoke-node-api-scaffold: ok');
