/**
 * Weak local coder + micro edit must skip answerStudio coding hop.
 * npx tsx --tsconfig tsconfig.app.json scripts/check-edit-weak-no-hop.mjs
 */
import {
  shouldSkipWeakModelCodingHop,
  isWeakCoderModel,
} from '../src/lib/chatTurnHandlers/edit.ts';

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const modelId = 'qwen2.5-1.5b-instruct';
const modelName = 'Qwen 1.5B';
const ask = 'add a title';

check('1.5B is weak coder', isWeakCoderModel(modelId, modelName) === true);
check(
  '1.5B + "add a title" skips hop',
  shouldSkipWeakModelCodingHop({
    userMessage: ask,
    modelId,
    modelName,
    surgicalMissed: true,
  }) === true,
);
check(
  'strong model does not skip on same ask',
  shouldSkipWeakModelCodingHop({
    userMessage: ask,
    modelId: 'qwen2.5-coder-7b',
    modelName: 'Qwen2.5-Coder 7B',
    surgicalMissed: true,
  }) === false,
);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll edit-weak-no-hop checks passed');
