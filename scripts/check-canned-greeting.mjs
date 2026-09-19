/**
 * Canned "Hello! How can I assist you today?" must not ship on idea pitches
 * that merely start with "hey" / "hi".
 */
import assert from 'node:assert/strict';
import {
  isCannedGreetingReply,
  userMessageIsPureGreeting,
  scrubCannedGreetingFlash,
} from '../src/lib/chatHistory.ts';

const HELLO = 'Hello! How can I assist you today?';

assert.equal(userMessageIsPureGreeting('hi'), true);
assert.equal(userMessageIsPureGreeting('Hey!'), true);
assert.equal(userMessageIsPureGreeting('hello nova'), true);
assert.equal(
  userMessageIsPureGreeting(
    'hey so my community center has a few quiet desks in the annex and people keep double-booking them. what if neighbors could see which desks are free and reserve a two-hour slot?',
  ),
  false,
);
assert.equal(
  userMessageIsPureGreeting('yeah something like that. keep it really simple though.'),
  false,
);

assert.equal(isCannedGreetingReply(HELLO, 'hi'), false);
assert.equal(
  isCannedGreetingReply(
    HELLO,
    'hey so my community center has a few quiet desks. what if neighbors could reserve a slot?',
  ),
  true,
);
assert.equal(
  isCannedGreetingReply(HELLO, 'yeah something like that. keep it really simple though.'),
  true,
);
assert.equal(isCannedGreetingReply('Sure — here is a simple plan.', 'hey so …'), false);

// Mid-stream flicker mashup from screenshots (Sure! Here's → Hello)
const mash = 'Sure! Here\'s" If.\nHello! How can I assist you today?';
assert.ok(scrubCannedGreetingFlash(mash).length > 0);
assert.equal(
  isCannedGreetingReply(mash, 'yeah keep it really simple. browse packages'),
  true,
);
assert.ok(!/Hello! How can I assist/i.test(scrubCannedGreetingFlash(mash)));

console.log('check-canned-greeting: ok');
