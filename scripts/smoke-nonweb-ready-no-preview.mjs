/**
 * CLI / Python creates can Ready without a Live preview URL.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-nonweb-ready-no-preview.mjs
 */
import assert from 'node:assert/strict';

if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
if (typeof globalThis.sessionStorage === 'undefined') {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };
}
if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;

const {
  startCreateJob,
  markCreateJobReady,
  getCreateJobForChat,
} = await import('../src/lib/createJobStore.ts');

const { verifyArtifactFiles } = await import('../src/lib/artifactEvidence.ts');
const files = {
  'package.json': '{"name":"cli-tool","bin":{"cli":"bin/cli.js"}}',
  'bin/cli.js': '#!/usr/bin/env node\nconsole.log("ok")\n',
};
const evidence = verifyArtifactFiles(files, 'node-cli');
const job = startCreateJob({
  id: 'cli-job-1',
  chatId: 'cli-chat-1',
  path: 'C:\\Users\\test\\Projects\\CliTool',
  projectId: 'proj-cli',
  name: 'CliTool',
  files,
  originalBrief: 'Build a node CLI tool that renames files',
  artifactKind: 'node-cli',
  status: 'verifying',
});

markCreateJobReady(job.id, null, 'CLI verified', {
  brief: job.originalBrief,
  allowWithoutPreview: true,
  artifactKind: 'node-cli',
  artifactEvidence: evidence,
});

const ready = getCreateJobForChat('cli-chat-1');
assert.equal(ready?.status, 'ready', 'CLI Ready without preview URL');
assert.equal(ready?.evidencePass, true);
assert.equal(ready?.previewUrl, null);

// Website still requires URL
const web = startCreateJob({
  id: 'web-job-1',
  chatId: 'web-chat-1',
  path: 'C:\\Users\\test\\Projects\\WebApp',
  projectId: 'proj-web',
  name: 'WebApp',
  files: { 'src/App.jsx': 'export default function App(){return <h1>Hi</h1>}' },
  originalBrief: 'Build a Vite React dashboard',
  status: 'verifying',
});
markCreateJobReady(web.id, null, 'no url');
const webJob = getCreateJobForChat('web-chat-1');
assert.equal(webJob?.status, 'failed', 'web create still needs preview URL');

console.log('smoke-nonweb-ready-no-preview: ok');
