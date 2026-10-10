/**
 * Wave F — create job abort polarity + Ready vs Live-open honesty.
 */
import assert from 'node:assert/strict';
import {
  startCreateJob,
  shouldAbortCreateJob,
  markCreateJobReadyVerified,
  markCreateJobLiveOpen,
  markCreateJobFailed,
  markCreateJobNpm,
  getCreateJob,
  updateCreateJob,
} from '../src/lib/createJobStore.ts';

const chatA = 'chat-abort-a';
const chatB = 'chat-abort-b';

const job = startCreateJob({
  id: 'job-abort-1',
  chatId: chatA,
  path: 'C:/tmp/nova-abort',
  projectId: 'proj-abort',
  name: 'AbortTest',
  files: { 'src/App.jsx': 'export default function App(){return <main>Hi</main>}' },
  status: 'writing',
  backgroundAllowed: true,
  routeChatIdAtStart: chatA,
  originalBrief: 'coffee shop website',
});

assert.equal(shouldAbortCreateJob(job.id, chatA), false, 'viewing owner chat must not abort');
assert.equal(shouldAbortCreateJob(job.id, chatB), false, 'left chat with backgroundAllowed continues');

updateCreateJob(job.id, { backgroundAllowed: false });
assert.equal(shouldAbortCreateJob(job.id, chatA), false, 'still viewing → continue even if flag false');
assert.equal(shouldAbortCreateJob(job.id, chatB), true, 'left without background → abort');

markCreateJobFailed(job.id, 'Stopped');
markCreateJobNpm(job.id);
assert.equal(getCreateJob(job.id)?.status, 'failed', 'npm must not resurrect failed job');

const job2 = startCreateJob({
  id: 'job-live-open',
  chatId: 'chat-live',
  path: 'C:/tmp/nova-live',
  projectId: 'proj-live',
  name: 'LiveOpen',
  files: {
    'src/App.jsx': 'export default function App(){return <main><h1>Harbor</h1></main>}',
    'src/App.css': 'main{padding:2rem}',
    'public/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"><path d="M2 2h8v8H2z"/></svg>',
  },
  status: 'verifying',
  backgroundAllowed: true,
  originalBrief: 'Harbor coffee shop website with tasting notes',
});

markCreateJobReadyVerified(
  job2.id,
  'http://127.0.0.1:5201/',
  'Live mounted · quality not verified',
  'Harbor coffee shop website with tasting notes',
  job2.files,
  { qualityReady: false },
);
const after = getCreateJob(job2.id);
assert.ok(after);
assert.notEqual(after.status, 'ready', 'qualityReady false must not mark Ready');
assert.equal(after.evidencePass, false);
assert.ok(after.previewUrl, 'Live URL kept when quality fails');

markCreateJobLiveOpen(
  job2.id,
  'http://127.0.0.1:5201/',
  'Live open',
  'Harbor coffee shop website',
  job2.files,
);
assert.equal(getCreateJob(job2.id)?.status, 'verifying');

console.log('smoke-create-job-abort: ok');
