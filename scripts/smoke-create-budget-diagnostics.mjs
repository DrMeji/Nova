/** Verify the selected local model, effective budget, and timeout telemetry stay observable. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBudgetExceededReply } from '../src/lib/createRuntime.ts';

const engine = readFileSync(new URL('../src/lib/novaEngine.ts', import.meta.url), 'utf8');
const gguf = readFileSync(new URL('../electron/novaGguf.cjs', import.meta.url), 'utf8');
const create = readFileSync(new URL('../src/lib/chatTurnHandlers/create.ts', import.meta.url), 'utf8');

assert.match(engine, /kind === 'coding' \? 16384 : 8192/, 'coding output reserve must remain explicit');
assert.equal((gguf.match(/nPredict,\s*\n\s*nCtx: getGgufCtx\(\),\s*\n\s*promptChars:/g) || []).length, 2,
  'both server and CLI logs must record generation limits and prompt size');
assert.match(create, /Build uses \*\*\$\{coderGate\.name\}\*\*.*craft cap.*total cap/,
  'create status must show the selected coder and wall caps');
assert.match(create, /ggufCtxCapacityLabel\(\)/, 'local create status must show its effective context capacity');
assert.match(createBudgetExceededReply('standard', 'Replay'), /10 minute session cap/);

console.log('smoke-create-budget-diagnostics: ok');
