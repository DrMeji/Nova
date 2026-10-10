import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const preamble = readFileSync(join(root, 'src/views/aichat/aiChatSendPreamble.ts'), 'utf8');
const sender = readFileSync(join(root, 'src/views/aichat/useAIChatSend.ts'), 'utf8');
const controller = readFileSync(join(root, 'src/views/aichat/useAIChatController.ts'), 'utf8');
assert.match(preamble, /const routeChatIdAtTurnStart/);
assert.match(preamble, /backgroundAllowed: Boolean\(routeChatIdAtTurnStart/);
assert.match(sender, /isChatTurnDead\(/);
assert.match(sender, /keepBackground: backgroundAllowed === true/);
assert.match(sender, /routeAtStartChatId: routeChatIdAtTurnStart/);
assert.match(controller, /originGenChatId/);
assert.match(controller, /engineGenerateCancel\(originGenChatId \? \{ chatId: originGenChatId \}/);

console.log('smoke-chat-abort-boundaries: ok');
