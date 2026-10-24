/**
 * Library / CLI scaffolds must not become Vite React.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-library-scaffold.mjs
 */
import assert from 'node:assert/strict';
import { buildScaffoldFiles } from '../src/lib/projectScaffolds.ts';
import { resolveArtifactKind, projectKindFromArtifactKind } from '../src/lib/createArtifactKind.ts';
import { canUnlockCreateLive } from '../src/lib/createReady.ts';

const libBrief = 'Build a publishable TypeScript library for string utils';
assert.equal(resolveArtifactKind(libBrief), 'library');
const pk = projectKindFromArtifactKind('library');
assert.equal(pk, 'node-cli');
const files = buildScaffoldFiles(pk, { name: 'StrUtils', summary: libBrief, preferredLanguage: 'typescript' });
const paths = files.map((f) => f.path.replace(/\\/g, '/'));
assert.ok(paths.includes('package.json'), 'pkg');
assert.ok(paths.some((p) => /src\/index\.ts$/i.test(p)), 'entry');
assert.ok(!paths.some((p) => /vite\.config|src\/App\.jsx/i.test(p)), 'no vite hijack');

const cli = buildScaffoldFiles('node-cli', { name: 'MyCli', summary: 'Build a node CLI tool with commander' });
assert.ok(cli.some((f) => /bin\/cli\.js/i.test(f.path)));
assert.ok(!cli.some((f) => /vite\.config/i.test(f.path)));

const unlock = canUnlockCreateLive(
  {
    id: 'j1',
    chatId: 'c1',
    status: 'ready',
    previewUrl: null,
    artifactKind: 'library',
    artifactEvidence: {
      kind: 'library',
      runOk: true,
      runDetail: 'library package + entry',
      evidencePath: 'src/index.ts',
    },
    files: Object.fromEntries(files.map((f) => [f.path, f.content])),
    name: 'StrUtils',
    originalBrief: libBrief,
  },
  Object.fromEntries(files.map((f) => [f.path, f.content])),
  libBrief,
);
assert.equal(unlock.ok, true, unlock.reasons.join('; '));

console.log('smoke-library-scaffold: ok');
