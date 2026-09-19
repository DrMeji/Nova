/**
 * Unit smoke for talk-first code-bleed scrubbing.
 */
import assert from 'node:assert/strict';
import { scrubTalkFirstCodeBleed, isTalkFenceJunk, looksLikePlainChatAsk } from '../src/lib/plainChatAsk.ts';
import { looksLikeRequirementsAsk, looksLikeTalkBeforeCreateAsk } from '../src/lib/chatIdeaIntent.ts';
import { looksLikeCodeAsk } from '../src/lib/chatIntent.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';

const a = scrubTalkFirstCodeBleed(
  'Yes Discord is a chat platform.\n@@@FILE src/App.css\n```css\nbody{}\n```',
);
assert.ok(!/@@@FILE|```|body\s*\{/i.test(a), `file bleed remains: ${a}`);

const b = scrubTalkFirstCodeBleed(
  'using Node.js and Express:javascript\nconst express = require("express");\napp.listen(3000);',
);
assert.ok(!/:javascript|require\(|app\.listen/i.test(b), `js bleed remains: ${b}`);

const c = scrubTalkFirstCodeBleed(
  'Example Firmware Code:cpp\n#include <Arduino.h>\nvoid setup(){}',
);
assert.ok(!/:cpp|#include/i.test(c), `cpp bleed remains: ${c}`);

const d = scrubTalkFirstCodeBleed(
  'Yes, Discord is familiar. You need accounts, servers, channels, and realtime messaging.',
);
assert.match(d, /Discord is familiar/i);

const outline = scrubTalkFirstCodeBleed(
  'Great idea! Here\'s a basic outline:\n```markdown\n1. Search trailheads\n2. Book a parking slot\n3. Email the ranger\n```\nWant to start building?',
);
assert.match(outline, /Search trailheads/i);
assert.match(outline, /Book a parking slot/i);
assert.match(outline, /Want to start building/i);
assert.ok(!/```/.test(outline), `planning fence markers should unwrap: ${outline}`);

// Empty / opener-only fences must not become "markdown ```" or empty CODE.
for (const junk of [
  'markdown ```',
  '```markdown',
  '```markdown\n',
  '```markdown\n```',
  '```\n',
  '```\n```',
]) {
  const scrubbed = scrubTalkFirstCodeBleed(junk);
  assert.equal(scrubbed, '', `expected empty scrub for ${JSON.stringify(junk)}, got ${JSON.stringify(scrubbed)}`);
  assert.equal(isTalkFenceJunk(junk), true, `expected fence junk: ${JSON.stringify(junk)}`);
}

const kb = 'how do you build an actual gaming keyboard, like the hardware and parts';
assert.equal(looksLikeRequirementsAsk(kb), true);
assert.equal(looksLikeCodeAsk(kb), false);
assert.equal(classifyTurn(kb).kind, 'chat');

// Feature-sketch follow-up must stay talk (not studio / create dump).
const shelf = 'yeah something like a little shelf you browse, tap a book to borrow it, and see who has what checked out. no accounts or payments.';
assert.equal(looksLikeTalkBeforeCreateAsk(shelf), true, 'shelf sketch should be talk-before-create');
assert.equal(looksLikePlainChatAsk(shelf), true, 'shelf sketch should be plain chat');
assert.equal(classifyTurn(shelf).kind, 'chat');

console.log('PASS scrub-talk-bleed + keyboard how-to routing + empty-fence + shelf talk');
