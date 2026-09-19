/**
 * Plain chat must not invent empty project context.
 */
import assert from 'node:assert/strict';
import {
  hasRealStudioFiles,
  looksLikePlainChatAsk,
  scrubFalseProjectChatPreamble,
} from '../src/lib/plainChatAsk.ts';

assert.equal(looksLikePlainChatAsk('hello can you tell me a story'), true);
assert.equal(looksLikePlainChatAsk('tell me a story'), true);
assert.equal(looksLikePlainChatAsk('hi'), true);
assert.equal(looksLikePlainChatAsk('create a vite react project called apex'), false);
assert.equal(looksLikePlainChatAsk('fix the bug in App.jsx'), false);
assert.equal(
  looksLikePlainChatAsk('i want to build a app like discord, what do i need to build it Like all the requirements and stuff. What do I actually need'),
  true,
);
assert.equal(
  looksLikePlainChatAsk('i want to build a app like twitch tv, Are you familiar with Twitch TV the Streaming platform app'),
  true,
);
assert.equal(hasRealStudioFiles({}), false);
assert.equal(hasRealStudioFiles({ 'src/App.jsx': 'x'.repeat(50) }), true);

const scrubbed = scrubFalseProjectChatPreamble(
  'Sure, I\'ll tell you a story based on the project files you\'ve attached. Since there are no files in the project, let\'s imagine a story together.\n\nOnce upon a time, Elara found a library.',
);
assert.ok(!/project files|no files in the project/i.test(scrubbed));
assert.ok(/Elara/i.test(scrubbed));

const dup = scrubFalseProjectChatPreamble(
  [
    'Once upon a time, in a small village, Elara found a book.',
    'The story continues. What would you like to happen next?',
    'Certainly! Let\'s weave a story around the context of this project.',
    'Once upon a time, a programmer named Alex stared at an empty folder.',
  ].join('\n'),
);
assert.ok(/Elara/i.test(dup));
assert.ok(!/Alex|empty folder|context of this project/i.test(dup));

console.log('PASS  plain chat ask + scrub');
