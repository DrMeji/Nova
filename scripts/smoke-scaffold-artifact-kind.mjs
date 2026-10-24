/**
 * artifactKind must drive scaffold — not ProjectKind collapse.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-scaffold-artifact-kind.mjs
 */
import assert from 'node:assert/strict';
import { buildScaffoldFiles } from '../src/lib/projectScaffolds.ts';
import { resolveArtifactKind, projectKindFromArtifactKind } from '../src/lib/createArtifactKind.ts';

const cases = [
  ['Build a CLI that fetches weather from an API', 'node-cli', /bin\/cli/],
  ['Create a TypeScript library that wraps an API', 'library', /src\/index/],
  ['Build an API with a CLI admin tool', 'node-api', /src\/server/],
  ['Build a Chrome extension that tracks tab time', 'extension', /manifest\.json/],
];

for (const [brief, wantKind, pathRe] of cases) {
  const kind = resolveArtifactKind(brief);
  assert.equal(kind, wantKind, `${brief} → ${kind}`);
  const pk = projectKindFromArtifactKind(kind);
  const files = buildScaffoldFiles(pk, { name: 'X', summary: brief, artifactKind: kind });
  const paths = files.map((f) => f.path.replace(/\\/g, '/')).join(',');
  assert.match(paths, pathRe, `${brief} scaffold ${paths}`);
  assert.doesNotMatch(paths, /vite\.config/, `${brief} no vite`);
}

console.log('smoke-scaffold-artifact-kind: ok');
