/**
 * Smoke tests for Level-B agent loop helpers (no Electron required).
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-agent-loop.mjs
 */
import assert from 'node:assert/strict';

// Minimal browser stubs before importing app modules
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}
globalThis.window.arkDesktop = {
  projectWrite: async ({ files }) => ({
    ok: true,
    root: 'C:\\smoke\\project',
    files,
  }),
  workspaceWriteFile: async () => ({ ok: true }),
  agentRun: async ({ command }) => ({
    ok: true,
    output: `mocked: ${command}`,
  }),
};

const {
  parseAgentToolReply,
  shouldRunAgentLoop,
  agentLoopMaxSteps,
  runArkAgentLoop,
} = await import('../src/lib/arkAgentLoop.ts');
const {
  filterAgentFiles,
  listAgentTree,
  readAgentFile,
  isAgentIgnoredPath,
} = await import('../src/lib/arkAgentRepo.ts');

// --- repo helpers ---
assert.equal(isAgentIgnoredPath('node_modules/x/index.js'), true);
assert.equal(isAgentIgnoredPath('src/App.tsx'), false);
assert.equal(isAgentIgnoredPath('logo.png'), true);

const files = filterAgentFiles({
  'src/App.tsx': 'export default function App(){ return null }',
  'node_modules/x/index.js': 'nope',
  'dist/bundle.js': 'nope',
  'README.md': '# Hi',
});
assert.ok(files['src/App.tsx']);
assert.equal(files['node_modules/x/index.js'], undefined);
assert.ok(listAgentTree(files).includes('src/App.tsx'));

const read = readAgentFile(files, 'App.tsx');
assert.equal(read.ok, true);
assert.equal(read.path, 'src/App.tsx');

// --- tool parse ---
assert.equal(parseAgentToolReply('TOOL: list\nPATH: src')?.tool, 'list');
assert.equal(parseAgentToolReply('TOOL: read\nPATH: src/App.tsx')?.path, 'src/App.tsx');
assert.equal(parseAgentToolReply('TOOL: grep\nQUERY: useState')?.query, 'useState');
assert.equal(parseAgentToolReply('TOOL: run\nCOMMAND: npm test')?.command, 'npm test');
assert.ok(parseAgentToolReply('TOOL: done\nANSWER: Fixed the bug.')?.answer?.includes('Fixed'));

const json = parseAgentToolReply('{"tool":"read","path":"src/main.ts"}');
assert.equal(json?.tool, 'read');
assert.equal(json?.path, 'src/main.ts');

const writeBlock = parseAgentToolReply('@@@FILE src/App.tsx\n```\nconst x = 1\n```');
assert.equal(writeBlock?.tool, 'write');

// --- gate ---
assert.equal(shouldRunAgentLoop({
  composerMode: 'ask',
  hasWorkspace: true,
  message: 'fix the bug in login',
}), false);
assert.equal(shouldRunAgentLoop({
  composerMode: 'agent',
  hasWorkspace: true,
  message: 'fix the bug in login',
}), true);
assert.equal(shouldRunAgentLoop({
  composerMode: 'agent',
  hasWorkspace: false,
  message: 'fix the bug',
}), false);
assert.ok(agentLoopMaxSteps() >= 4 && agentLoopMaxSteps() <= 60);

// --- full mock loop ---
let calls = 0;
const loop = await runArkAgentLoop({
  brief: 'Add a hello constant to App',
  files: { 'src/App.tsx': 'export default function App(){ return null }\n' },
  projectId: 'smoke-project',
  projectName: 'Smoke',
  diskRoot: null,
  maxSteps: 6,
  autoRunAllowlisted: true,
  callModel: async () => {
    calls += 1;
    if (calls === 1) return { reply: 'TOOL: list' };
    if (calls === 2) return { reply: 'TOOL: read\nPATH: src/App.tsx' };
    if (calls === 3) {
      return {
        reply: [
          'TOOL: write',
          'PATH: src/App.tsx',
          '```',
          'export const hello = "world"',
          'export default function App(){ return null }',
          '```',
        ].join('\n'),
      };
    }
    if (calls === 4) return { reply: 'TOOL: run\nCOMMAND: npm test' };
    return { reply: 'TOOL: done\nANSWER: Added hello constant and ran tests.' };
  },
});

assert.ok(calls >= 4, `expected several model calls, got ${calls}`);
assert.ok(loop.steps.some(s => s.tool === 'list'), 'expected list step');
assert.ok(loop.steps.some(s => s.tool === 'read'), 'expected read step');
assert.ok(loop.steps.some(s => s.tool === 'write'), 'expected write step');
assert.ok(loop.steps.some(s => s.tool === 'run'), 'expected run step');
assert.ok(loop.steps.some(s => s.tool === 'done'), 'expected done step');
assert.ok(String(loop.files['src/App.tsx'] || '').includes('hello'), 'file should contain hello');
assert.ok(loop.reply.toLowerCase().includes('hello') || loop.ok);

console.log('ark-agent-loop smoke: ok');
console.log(`  model calls=${calls} steps=${loop.steps.map(s => s.tool).join('→')}`);
console.log(`  updated=${loop.updated.join(',') || '(none)'}`);
