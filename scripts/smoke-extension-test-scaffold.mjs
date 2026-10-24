/**
 * Extension / test-suite scaffolds must not become Vite React.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-extension-test-scaffold.mjs
 */
import assert from 'node:assert/strict';
import { buildScaffoldFiles } from '../src/lib/projectScaffolds.ts';
import { resolveArtifactKind, projectKindFromArtifactKind, artifactWantsVite, isNonWebArtifactKind } from '../src/lib/createArtifactKind.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';

assert.equal(resolveArtifactKind('Build a Chrome extension that blocks distracting sites'), 'extension');
assert.equal(isNonWebArtifactKind('extension'), true);
assert.equal(artifactWantsVite('static-web'), false);
assert.equal(artifactWantsVite('web-app'), true);

const ext = buildScaffoldFiles(projectKindFromArtifactKind('extension'), {
  name: 'FocusBlock',
  summary: 'Build a Chrome extension that blocks distracting sites',
});
const extPaths = ext.map((f) => f.path.replace(/\\/g, '/'));
assert.ok(extPaths.includes('manifest.json'));
assert.ok(!extPaths.some((p) => /vite\.config|src\/App\.jsx/i.test(p)));

const tests = buildScaffoldFiles(projectKindFromArtifactKind('test-suite'), {
  name: 'ParserTests',
  summary: 'Write a pytest test suite for the parser module',
});
assert.ok(tests.some((f) => /\.test\./i.test(f.path)));
assert.ok(!tests.some((f) => /vite\.config|src\/App\.jsx/i.test(f.path)));

const empty = classifyTurn('Write a pytest test suite for the parser module', {});
assert.equal(empty.kind, 'create', empty.reason);
const bound = classifyTurn('Write a pytest test suite for the parser module', {
  diskRoot: 'C:\\tmp\\proj',
  projectId: 'proj-1',
});
assert.equal(bound.kind, 'edit', bound.reason);

console.log('smoke-extension-test-scaffold: ok');
