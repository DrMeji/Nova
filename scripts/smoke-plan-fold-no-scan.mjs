/**
 * Smoke: fold-extras / wrong-stall must NOT classify as Local UI scan.
 */
import assert from 'assert';
import { classifyStudioIntent } from '../src/lib/studioAnswerEngine.ts';
import { looksLikePlainChatAsk } from '../src/lib/plainChatAsk.ts';
import { looksLikeGreenfieldKeepPlanning } from '../src/lib/chatIdeaIntent.ts';

const fold = 'love those. i also want three extras: a save-a-bag button for shoppers, an undo if i tap the wrong stall, and soft sage / cream / terracotta colors. fold those into the plan.';

assert.strictEqual(classifyStudioIntent(fold), 'freeform', 'fold extras must be freeform not ui');
assert.ok(looksLikeGreenfieldKeepPlanning(fold), 'keep-planning must match fold');
assert.ok(looksLikePlainChatAsk(fold), 'plain chat must match fold extras');

const uiScan = 'the submit button is broken and the layout looks wrong on this screen';
assert.strictEqual(classifyStudioIntent(uiScan), 'ui', 'real UI bug still scans as ui');

console.log('smoke-plan-fold-no-scan passed');
