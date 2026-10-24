/**
 * Unknown coding asks must not ship a website shell.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-unknown-coding-scaffold.mjs
 */
import assert from 'node:assert/strict';
import { resolveArtifactKind, projectKindFromArtifactKind } from '../src/lib/createArtifactKind.ts';
import { buildScaffoldFiles } from '../src/lib/projectScaffolds.ts';
import { buildCreateBrief } from '../src/lib/novaBuildLoop.ts';

const asks = [
  'Build a Go CLI that greps logs',
  'Build a React Native app',
  'Build a Tauri desktop app',
  'Build a Terraform module for VPC',
  'Build a Unity game',
  'Build an Arduino sketch for blink',
  'Build a R Shiny dashboard',
  'Build a .NET Web API',
  'Build a Qt desktop app',
  'Build a Zig CLI',
  'Build a Haskell library',
];

for (const ask of asks) {
  const kind = resolveArtifactKind(ask);
  assert.equal(kind, 'unknown', `${ask} → ${kind}`);
  const files = buildScaffoldFiles(projectKindFromArtifactKind(kind), {
    name: 'X',
    summary: ask,
    artifactKind: kind,
  });
  const paths = files.map((f) => f.path.replace(/\\/g, '/')).join(',');
  assert.match(paths, /README\.md/);
  assert.doesNotMatch(paths, /index\.html|src\/App|electron\//);
  const brief = buildCreateBrief({
    brief: ask,
    productName: 'X',
    projectId: 'p',
    coderId: 'c',
    coderName: 'c',
    files: Object.fromEntries(files.map((f) => [f.path, f.content])),
    host: { pushStatus() {} },
    artifactKind: 'unknown',
  });
  assert.match(brief, /CODING CREATE|unknown/);
  assert.doesNotMatch(brief, /Vite \+ React|Put the product in App/);
}

console.log('smoke-unknown-coding-scaffold: ok', asks.length, 'asks');
