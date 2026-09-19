import { classifyTurn } from '../src/lib/classifyTurn.ts';
import { looksLikeCodeAsk } from '../src/lib/chatIntent.ts';
import { looksLikeTruncatedAssistantReply } from '../src/lib/chatHistory.ts';

const prompts = [
  'i want to build something like Netflix, what would that take',
  'how do you build an actual gaming keyboard, like the hardware and parts',
  'how do I start a restaurant',
  'how do I start a small business',
  'how do I start learning to code',
  'how would I actually build something like Discord — what do I need first',
];
for (const p of prompts) {
  const r = classifyTurn(p);
  console.log({
    p: p.slice(0, 56),
    kind: r.kind,
    reason: r.reason,
    code: looksLikeCodeAsk(p),
  });
}
const trunc = 'Sure! Discord is popular among gamers. Here is a basic structure using Python and Flask:';
console.log('trunc?', looksLikeTruncatedAssistantReply(trunc));
console.log('full?', looksLikeTruncatedAssistantReply(
  'Yes, Discord is a chat platform. You need accounts, channels, and realtime messaging first.',
));
