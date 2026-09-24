/**
 * Quick unit checks for list + help-voice scrubbing.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-list-voice.mjs
 */
import { normalizeAssistantLists } from '../src/lib/chatPlanMode.ts';
import { scrubHelpVoice } from '../src/lib/plainChatAsk.ts';

let failed = 0;
function ok(name, cond) {
  if (!cond) {
    console.error('FAIL', name);
    failed += 1;
  } else console.log('ok', name);
}

const messy = [
  'We can definitely help with that! Organizing stalls is hard.',
  '',
  '1. Acknowledge the Problem',
  'You’re losing track of vendors.',
  '★ **Planning the Solution:**',
  '1. Stall List: A list of stalls.',
  '2. Vendor Details: Names and products.',
  '★ **Next Steps:**',
  'To start, we can create a basic prototype.',
].join('\n');

const lists = scrubHelpVoice(normalizeAssistantLists(messy));
ok('no stars', !/[★☆✦]/.test(lists));
ok('has bullets', /- \*\*Stall List\*\*:/.test(lists) || /- \*\*Stall List:/.test(lists) || /- \*\*Stall List\*\*/.test(lists));
ok('no double colon junk', !/\*\*[^*]+\.:\*\*/.test(lists));
ok('I opener', /^I can definitely help with that/i.test(lists));
const nums = [...lists.matchAll(/^\s*(\d+)\.\s+/gm)].map((m) => Number(m[1]));
ok('numbers sequential start', nums[0] === 1);
ok('no double-1 mid list', !(nums.length >= 2 && nums[0] === 1 && nums[1] === 1));
ok('renumbered past 1', nums.length >= 2 && nums[nums.length - 1] >= 2);
ok('has Next Steps numbered', /3\.\s+Next Steps/i.test(lists));

const voice = scrubHelpVoice('We can definitely help with that! Organizing stalls is hard.');
ok('I can help', /^I can definitely help with that/i.test(voice));
ok('no We can definitely', !/\bWe can definitely help\b/i.test(voice));

const inline = [
  'We can definitely help with that!',
  '1. Basic Features: - Vendor List: Display vendors. - Stall Information: Show stall numbers.',
  '2. Detailed Layout: - Home Screen: A list view.',
  '★ **Next Steps:**',
  'Done.',
].join('\n');
const inlineOut = scrubHelpVoice(normalizeAssistantLists(inline));
ok('inline split has newline bullets', /\n\s*-\s+Vendor List:/i.test(inlineOut));
ok('inline nums 1,2,3', /^1\./m.test(inlineOut) && /^2\./m.test(inlineOut) && /^3\.\s+Next Steps/m.test(inlineOut));
ok('inline no stars', !/[★]/.test(inlineOut));
ok('inline I opener', /^I can definitely help/i.test(inlineOut));

if (failed) {
  console.error(`${failed} failed`);
  console.log('--- lists ---\n' + lists);
  console.log('--- inline ---\n' + inlineOut);
  process.exit(1);
}
console.log('all list/voice checks passed');
console.log('--- sample ---\n' + lists.slice(0, 500));
console.log('--- inline ---\n' + inlineOut);
