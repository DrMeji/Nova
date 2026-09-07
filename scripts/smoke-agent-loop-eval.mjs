/**
 * Eval suite: 10 Level-B agent tasks.
 * npx tsx --tsconfig tsconfig.app.json scripts/smoke-agent-loop-eval.mjs
 */
import assert from 'node:assert/strict';

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
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  };
}
globalThis.window.arkDesktop = {
  projectWrite: async ({ files }) => ({ ok: true, root: 'C:\\smoke\\project', files }),
  workspaceWriteFile: async () => ({ ok: true }),
  agentRun: async ({ command }) => {
    if (/npm install/i.test(command)) return { ok: true, output: 'added 1 package' };
    if (/npm run build/i.test(command)) return { ok: true, output: 'built' };
    if (/git /i.test(command)) return { ok: true, output: 'ok' };
    return { ok: true, output: `mocked: ${command}` };
  },
};

const { parseAgentToolReply, runArkAgentLoop, shouldRunAgentLoop } = await import('../src/lib/arkAgentLoop.ts');
const { applyAgentPatches, parseAgentPatches } = await import('../src/lib/arkAgentPatch.ts');
const { buildAgentRepoIndex, searchAgentIndex } = await import('../src/lib/arkAgentIndex.ts');
const { detectKindFromFiles, agentKindGuidance } = await import('../src/lib/arkAgentPrompts.ts');
const {
  saveAgentContinue,
  loadAgentContinue,
  clearAgentContinue,
  looksLikeAgentContinueAsk,
} = await import('../src/lib/arkAgentContinue.ts');

let passed = 0;
async function task(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.log(`  ✗ ${name}: ${err instanceof Error ? err.message : err}`);
    throw err;
  }
}

console.log('NOVA-agent-loop eval (10 tasks)');

await task('1. parse TOOL: patch SEARCH/REPLACE', () => {
  const a = parseAgentToolReply([
    'TOOL: patch',
    'PATH: src/App.tsx',
    'SEARCH:',
    'const x = 1',
    'REPLACE:',
    'const x = 2',
  ].join('\n'));
  assert.equal(a?.tool, 'patch');
  assert.equal(a?.path, 'src/App.tsx');
});

await task('2. parse JSON patch + soft read recovery', () => {
  const j = parseAgentToolReply('{"tool":"patch","path":"a.ts","search":"old","replace":"new"}');
  assert.equal(j?.tool, 'patch');
  const soft = parseAgentToolReply('Please read src/main.ts');
  assert.equal(soft?.tool, 'read');
  assert.equal(soft?.path, 'src/main.ts');
});

await task('3. apply surgical patch', () => {
  const files = { 'src/App.tsx': 'export const hello = "a"\nexport default 1\n' };
  const patches = parseAgentPatches([
    'TOOL: patch',
    'PATH: src/App.tsx',
    'SEARCH:',
    'export const hello = "a"',
    'REPLACE:',
    'export const hello = "b"',
  ].join('\n'), 'src/App.tsx');
  assert.ok(patches.length >= 1, 'expected patches');
  const applied = applyAgentPatches(files, patches);
  assert.ok(applied.updated.includes('src/App.tsx'));
  assert.ok(applied.files['src/App.tsx'].includes('"b"'));
  assert.ok(applied.results[0].diff);
});

await task('4. repo index grep', () => {
  const index = buildAgentRepoIndex({
    'src/Login.tsx': 'function Login(){ const password = input }',
    'src/Home.tsx': 'export function Home(){}',
    'node_modules/x.js': 'password',
  });
  const { hits, total } = searchAgentIndex(index, 'password', 10);
  assert.ok(total >= 1);
  assert.ok(hits.some(h => h.path.includes('Login')));
});

await task('5. project-kind prompts', () => {
  const kind = detectKindFromFiles({
    'package.json': '{"dependencies":{"react":"18","vite":"5"}}',
    'src/App.tsx': 'export default function App(){}',
  });
  assert.equal(kind, 'vite-react');
  assert.ok(agentKindGuidance(kind).includes('patch'));
});

await task('6. continue state save/load', () => {
  clearAgentContinue('eval');
  saveAgentContinue({
    chatKey: 'eval',
    brief: 'fix login',
    observations: ['read src/Login.tsx'],
    updated: ['src/Login.tsx'],
    projectId: 'p1',
    projectName: 'Demo',
    at: Date.now(),
  });
  const loaded = loadAgentContinue('eval');
  assert.equal(loaded?.brief, 'fix login');
  assert.ok(looksLikeAgentContinueAsk('Continue'));
  clearAgentContinue('eval');
});

await task('7. agent gate Ask vs Agent', () => {
  assert.equal(shouldRunAgentLoop({
    composerMode: 'ask',
    hasWorkspace: true,
    message: 'fix the bug',
  }), false);
  assert.equal(shouldRunAgentLoop({
    composerMode: 'agent',
    hasWorkspace: true,
    message: 'fix the bug',
  }), true);
});

await task('8. loop: list→grep→patch→done', async () => {
  let calls = 0;
  const loop = await runArkAgentLoop({
    brief: 'Rename hello to greet',
    files: {
      'package.json': '{"scripts":{"build":"echo ok"},"dependencies":{"react":"18","vite":"5"}}',
      'src/App.tsx': 'export const hello = "world"\n',
    },
    projectId: 'eval',
    projectName: 'Eval',
    diskRoot: 'C:\\smoke\\project',
    maxSteps: 8,
    callModel: async () => {
      calls += 1;
      if (calls === 1) return { reply: 'TOOL: list' };
      if (calls === 2) return { reply: 'TOOL: grep\nQUERY: hello' };
      if (calls === 3) {
        return {
          reply: [
            'TOOL: patch',
            'PATH: src/App.tsx',
            'SEARCH:',
            'export const hello = "world"',
            'REPLACE:',
            'export const greet = "world"',
          ].join('\n'),
        };
      }
      return { reply: 'TOOL: done\nANSWER: Renamed hello to greet.' };
    },
  });
  assert.ok(loop.files['src/App.tsx'].includes('greet'), 'expected greet in file');
  assert.ok(loop.steps.some(s => s.tool === 'patch'));
  assert.ok(loop.steps.some(s => s.tool === 'done'));
});

await task('9. loop recovers from prose then tools', async () => {
  let calls = 0;
  const loop = await runArkAgentLoop({
    brief: 'read app',
    files: { 'src/App.tsx': 'export default 1\n' },
    projectId: 'eval2',
    maxSteps: 5,
    callModel: async () => {
      calls += 1;
      if (calls === 1) return { reply: 'Sure, I can help with that.' };
      if (calls === 2) return { reply: 'TOOL: read\nPATH: src/App.tsx' };
      return { reply: 'TOOL: done\nANSWER: Read App.' };
    },
  });
  assert.ok(calls >= 2);
  assert.ok(loop.steps.some(s => s.tool === 'read' || s.tool === 'done'));
});

await task('10. step-cap sets hitStepCap + observations', async () => {
  const loop = await runArkAgentLoop({
    brief: 'explore forever',
    files: { 'a.ts': '1' },
    projectId: 'eval3',
    maxSteps: 2,
    callModel: async () => ({ reply: 'TOOL: list' }),
  });
  assert.equal(loop.hitStepCap, true);
  assert.ok(loop.observations.length >= 1);
  assert.ok(/Continue/i.test(loop.reply));
});

console.log(`\nark-agent-loop eval: ${passed}/10 ok`);
