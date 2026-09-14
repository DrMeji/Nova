/**
 * Serial background job queue for heavy local work (gguf / npm / vite).
 * One job at a time so Defender + disk storms don't freeze the PC.
 */

/** @typedef {'gguf' | 'npm' | 'vite'} JobKind */

/** @type {{ id: string, kind: JobKind, label?: string, run: () => Promise<unknown>, resolve: (v: unknown) => void, reject: (e: unknown) => void }[]} */
const queue = [];
let busy = false;
let seq = 0;

function status() {
  return {
    busy,
    pending: queue.length,
    kinds: queue.map((j) => j.kind),
  };
}

async function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  try {
    const result = await job.run();
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    busy = false;
    void pump();
  }
}

/**
 * @param {{ kind: JobKind, label?: string, run: () => Promise<unknown> }} job
 * @returns {Promise<unknown>}
 */
function enqueue(job) {
  const kind = String(job?.kind || '');
  if (kind !== 'gguf' && kind !== 'npm' && kind !== 'vite') {
    return Promise.reject(new Error(`arkJobs: unsupported kind "${kind}"`));
  }
  if (typeof job.run !== 'function') {
    return Promise.reject(new Error('arkJobs: run() required'));
  }
  const id = `job-${++seq}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    queue.push({
      id,
      kind,
      label: job.label,
      run: job.run,
      resolve,
      reject,
    });
    void pump();
  });
}

module.exports = { enqueue, status };
