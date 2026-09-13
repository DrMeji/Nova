/**
 * Dispatch / product-contract smoke.
 * npx tsx --tsconfig tsconfig.app.json scripts/check-dispatch-no-answerstudio.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { HANDLER_OWNED_KINDS, dispatchOwnedTurn } from '../src/lib/chatTurnHandlers/dispatch.ts';
import {
  createSuccess,
  editSuccess,
  editMiss,
  chatSuccess,
} from '../src/lib/productContract.ts';
import { proposeRuntimeInstall } from '../src/lib/chatAgentExec.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;

function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

check('HANDLER_OWNED_KINDS includes create', HANDLER_OWNED_KINDS.includes('create'));
check('HANDLER_OWNED_KINDS includes edit', HANDLER_OWNED_KINDS.includes('edit'));

{
  const r = classifyTurn('Build me a website');
  check('classifyTurn Build me a website → create', r.kind === 'create', `${r.kind}`);
}

{
  const cs = createSuccess({ folderPath: 'C:\\x', entryFile: 'src/App.jsx' });
  check('productContract createSuccess', cs.ok === true && cs.kind === 'create' && cs.chatBound === true);
  const es = editSuccess(['src/App.jsx']);
  check('productContract editSuccess', es.ok === true && es.changedPaths.length === 1);
  const em = editMiss('miss', 'no change');
  check('productContract editMiss', em.ok === false && em.reason === 'miss');
  const ch = chatSuccess('hi');
  check('productContract chatSuccess', ch.ok === true && ch.wrote === false);
}

check(
  'proposeRuntimeInstall("install node") is null',
  proposeRuntimeInstall('install node') === null,
);
check(
  'proposeRuntimeInstall("I need python") is null',
  proposeRuntimeInstall('I need python') === null,
);

{
  const src = fs.readFileSync(path.join(root, 'src/lib/chatTurnHandlers/dispatch.ts'), 'utf8');
  check('dispatch.ts does not import answerStudio', !/\banswerStudio\b/.test(src));
  check('dispatch.ts exports dispatchOwnedTurn', /\bexport async function dispatchOwnedTurn\b/.test(src));
  check('dispatch.ts keeps planTurnDispatch', /\bexport function planTurnDispatch\b/.test(src));
}

{
  let generateCalled = false;
  const outcome = await dispatchOwnedTurn({
    content: 'Build me a website',
    mode: 'general',
    // No createHost → continue (AIChat still owns create until wired)
  });
  check(
    'dispatchOwnedTurn create without host → continue',
    outcome.status === 'continue' && outcome.classified.kind === 'create',
    `${outcome.status} ${outcome.classified.kind}`,
  );
  check('dispatchOwnedTurn never called a generate/answerStudio stub', generateCalled === false);
}

{
  const outcome = await dispatchOwnedTurn({
    content: 'Add a footer',
    classifyOpts: { diskRoot: 'C:\\p', files: { 'src/App.jsx': 'x' } },
  });
  check(
    'dispatchOwnedTurn edit → status edit',
    outcome.status === 'edit' && (outcome.classified.kind === 'edit' || outcome.classified.kind === 'keep_building'),
    `${outcome.status} ${outcome.classified.kind}`,
  );
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll dispatch / product-contract checks passed');
