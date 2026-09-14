/**
 * Bind isolation: chat A diskRoot must not leak to chat B via getBoundStudio.
 */
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(String(k), String(v)); },
  removeItem: (k) => { store.delete(String(k)); },
};
globalThis.window = globalThis.window || { localStorage: globalThis.localStorage };

const {
  saveChatStudio,
  getBoundStudio,
  clearChatStudio,
} = await import('../src/lib/chatStudioStore.ts');

const chatA = 'smoke-chat-a';
const chatB = 'smoke-chat-b';
const rootA = 'C:\\Users\\test\\Projects\\AlphaApp';

clearChatStudio(chatA);
clearChatStudio(chatB);

saveChatStudio(chatA, {
  files: { 'index.html': '<html></html>' },
  projectId: 'proj-a',
  name: 'AlphaApp',
  diskRoot: rootA,
  previewUrl: 'http://127.0.0.1:5173',
});

const boundA = getBoundStudio(chatA);
assert.ok(boundA);
assert.equal(boundA.diskRoot, rootA);
assert.equal(boundA.chatId, chatA);

const boundB = getBoundStudio(chatB);
assert.equal(boundB, null, 'chat B must not inherit chat A studio');

saveChatStudio(chatB, {
  files: { 'README.md': '# beta' },
  projectId: 'proj-b',
  name: 'BetaApp',
  diskRoot: 'D:\\other\\BetaApp',
});

const boundB2 = getBoundStudio(chatB);
assert.ok(boundB2);
assert.equal(boundB2.diskRoot, 'D:\\other\\BetaApp');
assert.notEqual(boundB2.diskRoot, rootA);

const stillA = getBoundStudio(chatA);
assert.equal(stillA?.diskRoot, rootA);

clearChatStudio(chatA);
clearChatStudio(chatB);

console.log('smoke:bind-isolation ok');
