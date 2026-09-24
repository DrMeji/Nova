/**
 * Numbering + exit wrap-up checks for planning replies.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-list-exit.mjs
 */
import { normalizeAssistantLists } from '../src/lib/chatPlanMode.ts';
import { scrubHelpVoice, ensurePlanningExit } from '../src/lib/plainChatAsk.ts';

let failed = 0;
function ok(name, cond) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else console.log('ok', name);
}

const raw = [
  'Sure, I can help with that!',
  '1. Acknowledge the Problem',
  'Losing track of vendors is frustrating.',
  '2. Planning the Solution',
  'We will outline the screens.',
  '3. Vendor Registration Page: - Fields: name. - Purpose: register.',
  '4. User',
  '5. Must-Haves vs. Later: - Must-Have: list. - Later: search.',
].join('\n');

const cleaned = ensurePlanningExit(scrubHelpVoice(normalizeAssistantLists(raw)));
const nums = [...cleaned.matchAll(/^\s*(\d+)\.\s+/gm)].map((m) => Number(m[1]));
ok('sequential nums', nums.join(',') === [...nums.keys()].map((i) => i + 1).join(',') || (nums[0] === 1 && nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)));
ok('no empty User stub', !/\d+\.\s+User\b/i.test(cleaned));
ok('has overall exit', /Overall:/i.test(cleaned));
ok('ends with question', /\?\s*$/.test(cleaned.trim()));
ok('I can help opener', /^Sure, I can help/i.test(cleaned));

if (failed) {
  console.error(failed + ' failed');
  console.log(cleaned);
  process.exit(1);
}
console.log('all exit/number checks passed');
console.log(cleaned);
