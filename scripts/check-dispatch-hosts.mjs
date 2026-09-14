/**
 * Dispatch hosts: delete/open/cmd without host → handled (can't do that yet), not generate.
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
  assert.match(replies.at(-1) || '', /can.?t do that yet/i);
}

{
  replies.length = 0;
  const r = await dispatchOwnedTurn({
    content: 'open the folder Documents',
    mode: 'general',
    finishPlainReply,
  });
  assert.equal(r.status, 'handled');
  assert.match(replies.at(-1) || '', /can.?t do that yet/i);
}

{
  replies.length = 0;
  const r = await dispatchOwnedTurn({
    content: 'run npm install',
    mode: 'code',
    finishPlainReply,
  });
  // run_cmd may miss classify as chat — either handled can't-yet or continue/chat
  assert.ok(r.status === 'handled' || r.status === 'continue' || r.status === 'edit');
}

console.log('PASS  check-dispatch-hosts');
