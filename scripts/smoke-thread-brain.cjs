/** Thread brain keys must stay scoped by chat/project id + kind. */
function threadBrainKey(scopeId, kind = 'chat') {
  return `NOVA:chat-thread:brain:${scopeId}:${kind}`;
}

const chat = threadBrainKey('abc', 'chat');
const code = threadBrainKey('abc', 'coding');
if (chat === code) {
  console.error('FAIL: chat and coding brains share a key');
  process.exit(1);
}
if (threadBrainKey('a', 'chat') === threadBrainKey('b', 'chat')) {
  console.error('FAIL: different scopes share a key');
  process.exit(1);
}
if (!chat.includes('abc') || !chat.endsWith(':chat')) {
  console.error('FAIL: unexpected key', chat);
  process.exit(1);
}
console.log('OK: thread brain keys stay scoped');
