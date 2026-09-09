import { shouldOfferCloudKeyNudge, looksLikeCloudKeyNudgeAsk } from '../src/lib/cloudKeyNudge.ts';

const issues = [];
if (!looksLikeCloudKeyNudgeAsk('build me a cafe site')) issues.push('real ask should match');
if (looksLikeCloudKeyNudgeAsk('ok')) issues.push('ack should not match');

// Without local brain → never soft-nudge (honest setup CTA instead).
if (shouldOfferCloudKeyNudge({ chatId: 't1', message: 'hello world question?', hasLocalBrain: false })) {
  issues.push('no local brain must not soft-nudge');
}

console.log(JSON.stringify({ issues }, null, 2));
if (issues.length) {
  console.error('FAIL', issues);
  process.exit(1);
}
console.log('OK #8 cloud nudge honesty');
