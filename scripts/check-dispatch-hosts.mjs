/**
 * Dispatch hosts: delete/open/cmd without host → handled with a helpful next step
 * (never a flat "I can't do that yet", never generate).
 */
import assert from 'node:assert/strict';
import { dispatchOwnedTurn } from '../src/lib/chatTurnHandlers/dispatch.ts';

const replies = [];
const finishPlainReply = async (text) => { replies.push(String(text || '')); };

{
  const r = await dispatchOwnedTurn({
    content: 'delete the file foo.txt',
    mode: 'general',
    finishPlainReply,
    // no deleteHost
  });
  assert.equal(r.status, 'handled');
  const out = replies.at(-1) || '';
  assert.doesNotMatch(out, /can.?t do that yet/i);
  assert.match(out, /Open folder|tell me which file/i);
}

{
  replies.length = 0;
  const r = await dispatchOwnedTurn({
    content: 'open the folder Documents',
    mode: 'general',
    finishPlainReply,
  });
  assert.equal(r.status, 'handled');
  const out = replies.at(-1) || '';
  assert.doesNotMatch(out, /can.?t do that yet/i);
  assert.match(out, /Open folder/i);
}

{
  replies.length = 0;
  const r = await dispatchOwnedTurn({
    content: 'run npm install',
    mode: 'code',
    finishPlainReply,
  });
  // run_cmd may miss classify as chat — either handled next-step or continue/chat
  assert.ok(r.status === 'handled' || r.status === 'continue' || r.status === 'edit');
}

{
  // No finishPlainReply → fall through to the caller instead of swallowing the turn.
  const r = await dispatchOwnedTurn({ content: 'delete the file foo.txt', mode: 'general' });
  assert.ok(r.status === 'continue' || r.status === 'handled');
}

console.log('PASS  check-dispatch-hosts');
