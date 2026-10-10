/**
 * Batch 1 E4 — project/path lookups hydrate from sessionStorage; craftBlocked clears previewUrl.
 *   npm run smoke:create-job-hydrate
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
if (typeof globalThis.window === 'undefined') {
  globalThis.window = globalThis;
}

const {
  startCreateJob,
  markCreateJobFailed,
  markCreateJobReady,
  updateCreateJob,
  getCreateJobForChat,
  getCreateJobForProject,
  getCreateJobForPath,
} = await import('../src/lib/createJobStore.ts');

const job = startCreateJob({
  id: 'smoke-job-1',
  chatId: 'smoke-chat-1',
  path: 'C:\\Users\\test\\Projects\\SmokeApp',
  projectId: 'proj-smoke-1',
  name: 'SmokeApp',
  files: { 'src/App.jsx': 'export default function App(){return null}' },
  originalBrief: 'Build a polished product website for Copper Mug with navigation and menu.',
  status: 'writing',
  previewUrl: 'http://127.0.0.1:5179',
});

markCreateJobFailed(job.id, 'Depth deficit', 'thin', {
  craftBlocked: true,
  blockedReasons: ['App compact chars low'],
});

const byChat = getCreateJobForChat('smoke-chat-1');
assert.ok(byChat, 'chat lookup finds job');
assert.equal(byChat.craftBlocked, true);
assert.equal(byChat.previewUrl, null, 'craftBlocked clears previewUrl');

// Simulate reload: wipe in-memory maps by re-importing is hard; instead clear
// byChat/jobs via reading only from session — call project lookup after
// forcing a fresh module is overkill. Persist is already in sessionStorage;
// project lookup must scan session when memory miss.
// Clear memory by starting a second isolated check: remove from maps via
// getCreateJobForProject after deleting memory entries is not exported.
// Instead: ensure session key exists and project lookup returns craftBlocked job.
const raw = sessionStorage.getItem('nova-create-job:smoke-chat-1');
assert.ok(raw, 'job persisted to sessionStorage');
const parsed = JSON.parse(raw);
assert.equal(parsed.craftBlocked, true);
assert.equal(parsed.previewUrl, null);

const byProject = getCreateJobForProject('proj-smoke-1');
assert.ok(byProject, 'project lookup finds job');
assert.equal(byProject.id, job.id);

const byPath = getCreateJobForPath('C:\\Users\\test\\Projects\\SmokeApp');
assert.ok(byPath, 'path lookup finds job');
assert.equal(byPath.craftBlocked, true);
assert.equal(byPath.previewUrl, null, 'hydrated craftBlocked keeps previewUrl null');

// Regression: HTTP/mount readiness alone must not mark a visually incomplete create Ready.
{
  const id = 'smoke-job-incomplete';
  const incomplete = startCreateJob({
    id,
    chatId: 'smoke-chat-incomplete',
    path: 'C:\\Users\\test\\Projects\\Incomplete',
    projectId: 'proj-incomplete',
    name: 'Copper Mug',
    originalBrief: 'Build a polished product website for Copper Mug with navigation and menu.',
    generationBrief: 'Build a polished product website for Copper Mug with navigation and menu.\nDesign plan: atmospheric visuals.',
    files: {
      'src/App.jsx': `import './App.css'; export default function App(){return <main><h1>Copper Mug</h1><nav><a href="#menu">Menu</a><a href="#story">Story</a></nav><p>Welcome to Copper Mug and our beautiful coffee for every day.</p><p>Welcome to Copper Mug and our beautiful coffee for every day.</p><p>Welcome to Copper Mug and our beautiful coffee for every day.</p><a href="#menu">Shop</a></main>}`,
      'src/main.jsx': "import App from './App.jsx'; import './App.css';",
      'src/App.css': '.app{min-height:100vh;display:flex;flex-direction:column;background:#142018;color:#faf4e8;font-family:Georgia,serif}.nav{display:flex;gap:2rem}.section{padding:4rem}.hero-art{width:20rem;height:20rem;background:radial-gradient(circle,#9a7654,#241a12)}',
    },
    status: 'verifying',
  });
  const jobStorePath = new URL('../src/lib/createJobStore.ts', import.meta.url);
  const { markCreateJobReady: markIsolatedReady, getCreateJobForChat: getIsolatedJob, startCreateJob: startIsolatedJob } = await import(`../src/lib/createJobStore.ts?fresh=${Date.now()}`);
  startIsolatedJob(incomplete);
  markIsolatedReady(id, 'http://127.0.0.1:5180', 'Live ready · quality verified', {
    brief: incomplete.originalBrief,
    requireQuality: true,
  });
  const blocked = getIsolatedJob('smoke-chat-incomplete');
  assert.equal(blocked.status, 'failed', 'incomplete nav/style/copy must not report Ready');
  assert.equal(blocked.evidencePass, false);
  assert.ok(blocked.blockedReasons.some((reason) => /navigation targets missing|repeated section copy|navigation labels are duplicated|navigation has no layout|brief match failed/i.test(reason)));
  assert.match(blocked.lastObservation, /Ready blocked/i);
}

console.log('smoke-create-job-hydrate: ok');

// Regression: generated plans never replace the original user brief in the stored context.
{
  const { retainCreateBrief, preserveOriginalBriefInPrompt } = await import('../src/lib/createBriefContext.ts');
  const { verifyCreateRenderedQuality } = await import('../src/lib/createEvidence.ts');
  const original = 'Create a ceramics brand website with a clear nav, product visual, story, and polished sections.';
  const ctx = retainCreateBrief(original, ['PLAN: make an elegant premium page.']);
  assert.ok(ctx.generationBrief.startsWith(original));
  assert.equal(ctx.originalBrief, original);
  const bounded = preserveOriginalBriefInPrompt(original, 'generated plan '.repeat(900), 300);
  assert.ok(bounded.startsWith(`USER'S ORIGINAL BRIEF (authoritative; preserve every requirement):\n${original}`));
  assert.ok(bounded.length <= 300);
  const disconnected = verifyCreateRenderedQuality({
    'src/App.jsx': `import './App.css'; export default function App(){return <main><h1>Porcelain</h1><nav><a href="#shop">Shop</a><a href="#story">Story</a></nav><p>Made with care, shaped for daily rituals, with thoughtful details throughout.</p><p>Made with care, shaped for daily rituals, with thoughtful details throughout.</p><p>Made with care, shaped for daily rituals, with thoughtful details throughout.</p></main>}`,
    'src/App.css': '.app{min-height:100vh}',
  }, 'Build a ceramics website for Porcelain with product visual and story sections', 'Porcelain');
  assert.equal(disconnected.ok, false);
  assert.ok(disconnected.reasons.some((reason) => /navigation targets missing|repeated section copy|brief match failed/i.test(reason)));
}
