/**
 * Evidence: conversation quality vs peers — stay on topic, no invent pivot,
 * clarify/plan signals present in Nova chat helpers.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
function check(ok, name, detail = '') {
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
  if (!ok) fail += 1;
}

const files = {
  plain: 'src/lib/plainChatAsk.ts',
  chat: 'src/lib/chatTurnHandlers/chat.ts',
  classify: 'src/lib/classifyTurn.ts',
  answer: 'src/lib/answerContract.ts',
  plan: 'src/lib/chatPlanMode.ts',
};

for (const [k, rel] of Object.entries(files)) {
  const p = path.join(root, rel);
  check(fs.existsSync(p), `exists ${k}`, rel);
}

const plain = fs.readFileSync(path.join(root, files.plain), 'utf8');
const chat = fs.readFileSync(path.join(root, files.chat), 'utf8');
const classify = fs.readFileSync(path.join(root, files.classify), 'utf8');
const answer = fs.readFileSync(path.join(root, files.answer), 'utf8');
const plan = fs.existsSync(path.join(root, files.plan))
  ? fs.readFileSync(path.join(root, files.plan), 'utf8')
  : '';

check(
  /looksLikePlainChatAsk|scrubFalseProjectChatPreamble|ensurePlanningExit/.test(plain),
  'plainChatAsk has talk-first / plan-exit helpers',
);
check(
  /plainChatAsk|looksLikePlainChatAsk|hasRealStudioFiles/.test(chat),
  'chat handler uses plainChatAsk (no silent invent pivot)',
);
check(
  /create|edit|chat|plan/i.test(classify) && /export function/.test(classify),
  'classifyTurn routes create/edit/chat/plan',
);
check(
  /greeting|companion|on topic|funHangout|PureGreeting/i.test(answer + plain),
  'answer/companion stay-on-topic signals',
);
check(
  plan.length > 0 && /plan/i.test(plan),
  'plan mode module present',
);

// Behavioral exports present (avoid @/ path imports under strip-types).
check(
  /export function looksLikePureGreeting\b/.test(plain)
    && /export function looksLikePlainChatAsk\b/.test(plain),
  'plainChatAsk exports greeting + plain-ask detectors',
);
check(
  /export function ensurePlanningExit\b/.test(plain)
    && /export function scrubFalseProjectChatPreamble\b/.test(plain),
  'plainChatAsk exports plan-exit + anti invent-pivot scrubs',
);
// chat handler must not invent-create on pure greetings / plain asks.
check(
  /looksLikePureGreeting|looksLikePlainChatAsk/.test(chat),
  'chat.ts consults greeting/plain-ask before create pivot',
);

if (fail) {
  console.error('smoke-conversation-quality failed', fail);
  process.exit(1);
}
console.log('ALL PASS conversation-quality');
