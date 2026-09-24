/**
 * Ship-prep stretch owners (no UI). Run:
 *   node scripts/smoke-stretch-owners.mjs
 *   npx tsx --tsconfig tsconfig.app.json scripts/check-classify-turn.mjs
 *
 * Public bar: 3 (identity Live) + 6 (two chats) + 10 (rebind) — manual.
 * This smoke only locks classify + preview :0 + cancel-by-chatId contract.
 */
import { createRequire } from 'module';
import { pathToFileURL } from 'url';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// --- classify: requirements stay chat; start-building → create ---
const { classifyTurn } = await import(
  pathToFileURL(path.join(root, 'src/lib/classifyTurn.ts')).href
);
{
  const r = classifyTurn(
    'Discord-like, free, no paywall — what do I need? List requirements only.',
  );
  check('stretch#1 requirements → chat', r.kind === 'chat', `${r.kind}/${r.reason}`);
}
{
  const r = classifyTurn('Start building Nightcord first slice.');
  check('stretch#2 start building → create', r.kind === 'create' && r.reason === 'greenfield-create-go', `${r.kind}/${r.reason}`);
}
{
  const r = classifyTurn('ok start.', {
    pendingBrief: 'Build Nightcord — a chat app with servers, channels, and a working message pane.',
  });
  check('talk-then-build ok start. with pending → create', r.kind === 'create', `${r.kind}/${r.reason}`);
  const bare = classifyTurn('ok start.');
  check('talk-then-build ok start. bare → chat', bare.kind === 'chat', `${bare.kind}/${bare.reason}`);
}
{
  const r = classifyTurn('Put hours in the footer.', {
    diskRoot: 'C:\\NOVA\\Projects\\Ovenfold',
    files: { 'src/App.jsx': 'x' },
  });
  check('stretch#5 follow-up bound → edit', r.kind === 'edit', `${r.kind}/${r.reason}`);
}

// --- preview :0 must not attach as ready ---
const exec = require(path.join(root, 'electron/novaAgentExec.cjs'));
check('getOrAttachPreview exported', typeof exec.getOrAttachPreview === 'function');
check('attachLivePreviewSession exported', typeof exec.attachLivePreviewSession === 'function');

// portFromUrl is private — probe via attach with a fake session is heavy.
// Contract check: reading the source for the sealed reject.
import fs from 'fs';
const agentSrc = fs.readFileSync(path.join(root, 'electron/novaAgentExec.cjs'), 'utf8');
check('portFromUrl rejects :0', /raw === '0'/.test(agentSrc) && /return null/.test(agentSrc));
check('attach drops null port', /if \(!port\)/.test(agentSrc));

const ggufSrc = fs.readFileSync(path.join(root, 'electron/novaGguf.cjs'), 'utf8');
check('cancelGguf chat-scoped miss no nuke', /scopedChatMiss/.test(ggufSrc));

const stopSrc = fs.readFileSync(path.join(root, 'src/views/aichat/useAIChatController.ts'), 'utf8');
check('handleStop passes chatId', /engineGenerateCancel\(originGenChatId \? \{ chatId: originGenChatId \}/.test(stopSrc));

if (failed) {
  console.error(`\n${failed} stretch-owner checks failed`);
  process.exit(1);
}
console.log('\nStretch owner smokes passed (manual: 3 bakery Live, 6 dual create, 10 rebind)');
