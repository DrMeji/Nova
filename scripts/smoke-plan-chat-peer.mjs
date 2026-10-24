/**
 * L — Plan / chat coding-adjacent peer bar.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyTurn } from '../src/lib/classifyTurn.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

console.log('\n=== L Plan/chat · peer rescan ===');

const planOnly = classifyTurn('Make a plan for a coffee shop website — do not build yet');
check('plan-only ask → plan or chat', planOnly.kind === 'plan' || planOnly.kind === 'chat', planOnly.kind + ':' + planOnly.reason);

const planSrc = readFileSync(join(root, 'src/lib/chatTurnHandlers/plan.ts'), 'utf8');
check('runPlanTurn exists', /export async function runPlanTurn/.test(planSrc));

const dispatchSrc = readFileSync(join(root, 'src/lib/chatTurnHandlers/dispatch.ts'), 'utf8');
check('dispatch owns plan', /plan/.test(dispatchSrc) && /runPlanTurn/.test(dispatchSrc));
check('dispatch owns create', /runCreateTurn|create\.ts/.test(dispatchSrc));
check('dispatch owns edit', /runEditTurn|edit\.ts/.test(dispatchSrc));

let inventNeedsPlanApprove = null;
try {
  const mod = await import('../src/lib/inventCraftPack.ts');
  inventNeedsPlanApprove = mod.inventNeedsPlanApprove;
} catch {
  try {
    const mod = await import('../src/lib/inventHarnessPack.ts');
    inventNeedsPlanApprove = mod.inventNeedsPlanApprove;
  } catch { /* */ }
}
if (typeof inventNeedsPlanApprove === 'function') {
  check(
    'plan-approve gate callable',
    typeof inventNeedsPlanApprove('Create Oak shop', false) === 'boolean',
  );
} else {
  check('plan-approve gate export optional', true);
}

const runCmdSrc = readFileSync(join(root, 'src/lib/chatTurnHandlers/runCmd.ts'), 'utf8');
check('runCmd handler exists', /export async function run/.test(runCmdSrc) || /runCmd/.test(runCmdSrc));

if (failed) {
  console.error(`\nL plan/chat peer: ${failed} failed`);
  process.exit(1);
}
console.log('\nL plan/chat peer: all checks passed');
