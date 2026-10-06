/**
 * Public harden owner smokes — fail CI if isolation / secrets / disk / cancel unplugged.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-public-harden.mjs
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(String(k), String(v)); },
  removeItem: (k) => { store.delete(String(k)); },
};
globalThis.window = { localStorage: globalThis.localStorage };

const {
  saveChatStudio,
  getBoundStudio,
  clearChatStudio,
  setLastPendingGreenfield,
  getLastPendingGreenfield,
  clearLastPendingGreenfield,
} = await import('../src/lib/chatStudioStore.ts');
const { isSandboxBlockedPath } = await import('../src/lib/agentSandbox.ts');
const { classifyTurn } = await import('../src/lib/classifyTurn.ts');
const { formatCreateProjectReply } = await import('../src/lib/createProjectFlow.ts');
const { pendingCreateBootstrap } = await import('../src/lib/chatTurnHandlers/createBootstrap.ts');

let failed = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`PASS  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

clearChatStudio('pub-a');
clearChatStudio('pub-b');
clearLastPendingGreenfield('pub-a');
clearLastPendingGreenfield('pub-b');

saveChatStudio('pub-a', {
  files: { 'src/App.jsx': 'a' },
  projectId: 'a',
  name: 'Ovenfold',
  diskRoot: 'C:\\NOVA\\Projects\\Ovenfold',
  previewUrl: 'http://127.0.0.1:5201',
});
saveChatStudio('pub-b', {
  files: { 'src/App.jsx': 'b' },
  projectId: 'b',
  name: 'Watchlane',
  diskRoot: 'C:\\NOVA\\Projects\\Watchlane',
  previewUrl: 'http://127.0.0.1:5202',
});
const a = getBoundStudio('pub-a');
const b = getBoundStudio('pub-b');
check('two chats different diskRoot', a?.diskRoot !== b?.diskRoot && /Ovenfold/.test(a?.diskRoot || ''));
check('two chats different previewUrl', a?.previewUrl !== b?.previewUrl);

setLastPendingGreenfield('pub-a', {
  name: 'Nightcord',
  slug: 'nightcord',
  kind: 'vite-react',
  summary: 'Discord-like',
  problemLine: 'chat',
});
setLastPendingGreenfield('pub-b', {
  name: 'LampShop',
  slug: 'lampshop',
  kind: 'vite-react',
  summary: 'lamps',
  problemLine: 'store',
});
check('pending brief A stays Nightcord', getLastPendingGreenfield('pub-a')?.name === 'Nightcord');
check('pending brief B not Nightcord', getLastPendingGreenfield('pub-b')?.name === 'LampShop');

check(
  'requirements ≠ create',
  classifyTurn('requirements for a Discord-like app, free, no paywall').kind === 'chat',
);
check(
  'start building → create',
  classifyTurn('Start building Nightcord first slice.').kind === 'create',
);

check('.env blocked', isSandboxBlockedPath('.env') === true);
check('.env.local blocked', isSandboxBlockedPath('.env.local') === true);
check('.env.example allowed', isSandboxBlockedPath('.env.example') === false);
check('path escape .. blocked', isSandboxBlockedPath('../other/.env') === true);
check('src/App.jsx allowed', isSandboxBlockedPath('src/App.jsx') === false);

const projectsSrc = fs.readFileSync(path.join(root, 'electron/novaProjects.cjs'), 'utf8');
check('writeGrantedFile blocks .env', /Writing \.env secret files is blocked/.test(projectsSrc));

const exec = require(path.join(root, 'electron/novaAgentExec.cjs'));
const winget = exec.commandAllowed('winget install NodeJS.NodeJS', 'run_all', true);
check('winget blocked', winget.ok === false);
check('stopAllPreviews exported', typeof exec.stopAllPreviews === 'function');
check('stopAllPreviews clears', exec.stopAllPreviews().ok === true);

const mainSrc = fs.readFileSync(path.join(root, 'electron/main.cjs'), 'utf8');
check('before-quit calls stopAllPreviews', /stopAllPreviews\(\)/.test(mainSrc));

const ggufSrc = fs.readFileSync(path.join(root, 'electron/novaGguf.cjs'), 'utf8');
check('cancel scopedChatMiss', /scopedChatMiss/.test(ggufSrc));
const stopSrc = fs.readFileSync(path.join(root, 'src/views/aichat/useAIChatController.ts'), 'utf8');
check('handleStop chatId', /engineGenerateCancel\(originGenChatId \? \{ chatId: originGenChatId \}/.test(stopSrc));

const reply = formatCreateProjectReply(
  { name: 'Ovenfold', slug: 'ovenfold', kind: 'vite-react' },
  { ok: true, written: ['package.json'], files: { 'package.json': '{}' } },
  pendingCreateBootstrap('installing'),
);
check(
  'npmPending copy not Ready',
  /finishing setup|Live unlocks when Ready|not Ready/i.test(reply) && !/\*\*Ready\*\*/i.test(reply),
  reply.slice(0, 160),
);

check('localPrefs vault-only desktop', /Secure key vault unavailable/.test(
  fs.readFileSync(path.join(root, 'src/lib/localPrefs.ts'), 'utf8'),
));

const applySrc = fs.readFileSync(path.join(root, 'src/lib/chatAgentApply.ts'), 'utf8');
check('apply uses isSandboxBlockedPath', /isSandboxBlockedPath/.test(applySrc));
check('apply checks isUnderDiskRoot', /isUnderDiskRoot/.test(applySrc));

clearChatStudio('pub-a');
clearChatStudio('pub-b');

if (failed) {
  console.error(`\n${failed} public-harden checks failed`);
  process.exit(1);
}
console.log('\nPublic harden owner smokes passed');
