/**
 * Chat spine routing — simple prompts stay on chat brain, not coder trap.
 * Run: npm run smoke:chat-spine
 */
import { classifyChatIntent, looksLikeCodeAsk, looksLikeSimpleBuildToyChatAsk } from '../src/lib/chatIntent.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { isChatTurnDead } from '../src/lib/chatTurnIsolation.ts';

let failed = 0;
function check(name, cond) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', name);
  } else {
    console.log('ok', name);
  }
}

  const ask = 'Can you help me build a simple calculator';
check('help build calculator → toy', looksLikeSimpleBuildToyChatAsk(ask));
check('help build calculator → chat intent', classifyChatIntent(ask) === 'chat');
check('help build calculator → chat turn', classifyTurn(ask).kind === 'chat');
for (const [prompt, kind] of [
  ['What is a ceramic glaze?', 'chat'],
  ['How long does it take to build a ceramics website?', 'chat'],
  ['Plan a ceramic website but do not create files yet', 'chat'],
  ['Build a brand-new ceramics website for Lumenforge Studio on disk', 'create'],
]) {
  check(`plain-vs-build "${prompt}" → ${kind}`, classifyTurn(prompt).kind === kind);
}
check('chat switch leaves in-flight origin running but detached', !isChatTurnDead({ originChatId: 'a', routeChatId: 'b', sequence: 1, currentSequence: 1, keepBackground: true }));
check('switch without background permission aborts origin work', isChatTurnDead({ originChatId: 'a', routeChatId: 'b', routeAtStartChatId: 'a', sequence: 1, currentSequence: 1 }));
check('background allowed survives route detach only', !isChatTurnDead({ originChatId: 'a', routeChatId: 'b', routeAtStartChatId: 'a', sequence: 1, currentSequence: 1, keepBackground: true }));
check('stop aborts background turn after switch', isChatTurnDead({ originChatId: 'a', routeChatId: 'b', sequence: 1, currentSequence: 1, stopped: true, keepBackground: true }));
check('superseding same-chat generation aborts prior turn', isChatTurnDead({ originChatId: 'a', routeChatId: 'a', sequence: 1, currentSequence: 2 }));
check('route detach aborts turn without explicit background ownership', isChatTurnDead({ originChatId: 'a', routeChatId: undefined, sequence: 1, currentSequence: 1 }));
{
  const { resolveAnswerContract } = await import('../src/lib/answerContract.ts');
  const { looksLikeTalkBeforeCreateAsk } = await import('../src/lib/chatIdeaIntent.ts');
  check('help build calculator → not talk-before-create', !looksLikeTalkBeforeCreateAsk(ask));
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: false });
  check('help build calculator → not plan_talk', c.job !== 'plan_talk');
  check('help build calculator → simple-build-toy', c.reason === 'simple-build-toy');
}
// classifyTurn owns create-vs-chat: imperative toy builds create, soft "help build" stays chat.
for (const [msg, kind] of [
  ['build me a calculator', 'create'],
  ['Build me a simple calculator app', 'create'],
  ['help build calculator', 'chat'],
  ['Can you help me build a simple calculator', 'chat'],
  ['help me build a todo app', 'chat'],
  ['help me build a calculator on disk', 'create'],
]) {
  const got = classifyTurn(msg);
  check(`"${msg}" → ${kind} (got ${got.kind}/${got.reason})`, got.kind === kind);
}

const follow = "I'm just, you know, a simple calculator. I just want to build one. It's not made for anyone, it's just made for one user.";
check('follow-up calculator → toy', looksLikeSimpleBuildToyChatAsk(follow));
{
  const { looksLikePlanDiscoveryAsk } = await import('../src/lib/planReport.ts');
  check('follow-up calculator → no plan discovery', !looksLikePlanDiscoveryAsk(follow));
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nok chat-spine');
