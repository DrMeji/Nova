/**
 * After History chat delete, composer must unlock (no stuck loading / deleted re-nav).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  beginChatInflight,
  endChatInflight,
  hasChatInflight,
  isChatInflight,
  cancelAll,
  listInflightChatIds,
} from '@/lib/chatInflight';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const ctrl = fs.readFileSync(path.join(root, 'src/views/aichat/useAIChatController.ts'), 'utf8');
const store = fs.readFileSync(path.join(root, 'src/lib/recentStore.ts'), 'utf8');

assert.match(ctrl, /unlockComposerAfterDelete/);
assert.match(ctrl, /isChatDeleted\(route\.chatId\)/);
assert.match(ctrl, /isChatDeleted\(inflight\.chatId\)/);
assert.match(ctrl, /Blank New Chat must start ready/);
assert.match(ctrl, /Never leave the Loading-chat shell up after a wipe/);
assert.match(store, /Fire unlock BEFORE deferred disk work/);
assert.match(store, /NOVA:chats-bulk-deleted/);
// Bulk wipe must defer disk delete (not sync in the for-loop before the event).
const bulkFn = store.slice(store.indexOf('export function deleteRecentChatsPermanentlyBulk'));
const beforeEvent = bulkFn.slice(0, bulkFn.indexOf('NOVA:chats-bulk-deleted'));
assert.equal(
  /wipeLinkedChatProjects\(chatId/.test(beforeEvent),
  false,
  'bulk must not sync-wipe disk before unlock event',
);
assert.match(bulkFn, /window\.setTimeout\(\(\) => \{[\s\S]*wipeLinkedChatProjects/);

// Inflight drain model used by unlockComposerAfterDelete
cancelAll();
const id = `smoke-del-${Date.now()}`;
beginChatInflight(id, 'job-1');
beginChatInflight(); // legacy counter
assert.equal(isChatInflight(id), true);
assert.equal(hasChatInflight(), true);
endChatInflight(id);
assert.equal(isChatInflight(id), false);
assert.equal(hasChatInflight(), true, 'legacy slot remains until drained');
while (hasChatInflight()) endChatInflight();
assert.equal(hasChatInflight(), false);
assert.deepEqual(listInflightChatIds(), []);

console.log('PASS: composer unlock after chat delete contracts');
