/**
 * Chat spine routing — simple prompts stay on chat brain, not coder trap.
 * Run: npm run smoke:chat-spine
 */
import { classifyChatIntent, looksLikeCodeAsk, looksLikeSimpleBuildToyChatAsk } from '../src/lib/chatIntent.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';

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
{
  const { resolveAnswerContract } = await import('../src/lib/answerContract.ts');
  const { looksLikeTalkBeforeCreateAsk } = await import('../src/lib/chatIdeaIntent.ts');
  check('help build calculator → not talk-before-create', !looksLikeTalkBeforeCreateAsk(ask));
  const c = resolveAnswerContract({ message: ask, hasBoundFiles: false });
  check('help build calculator → not plan_talk', c.job !== 'plan_talk');
  check('help build calculator → simple-build-toy', c.reason === 'simple-build-toy');
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
