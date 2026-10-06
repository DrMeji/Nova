/**
 * Serial background job queue for heavy local work (gguf / npm / vite).
 * One job at a time so Defender + disk storms don't freeze the PC.
 *
 * Craft (gguf) must not sit forever behind abandoned jobs — cancel clears the queue.
 */

/** @typedef {'gguf' | 'npm' | 'vite'} JobKind */

/** @type {{ id: string, kind: JobKind, label?: string, run: () => Promise<unknown>, resolve: (v: unknown) => void, reject: (e: unknown) => void }[]} */
const queue = [];
let busy = false;
let seq = 0;
/** @type {{ id: string, kind: JobKind, label?: string } | null} */
let active = null;

function status() {
  return {
    busy,
    pending: queue.length,
    kinds: queue.map((j) => j.kind),
    active: active ? { id: active.id, kind: active.kind, label: active.label } : null,
  };
}

async function pump() {
  if (busy) return;
  const job = queue.shift();
  if (!job) return;
  busy = true;
  active = { id: job.id, kind: job.kind, label: job.label };
  try {
    const result = await job.run();
    job.resolve(result);
  } catch (err) {
    job.reject(err);
  } finally {
    busy = false;
    active = null;
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
    return Promise.reject(new Error(`novaJobs: unsupported kind "${kind}"`));
  }
  if (typeof job.run !== 'function') {
    return Promise.reject(new Error('novaJobs: run() required'));
  }
  const id = `job-${++seq}-${Date.now()}`;
  return new Promise((resolve, reject) => {
    // Craft first: cancel waiting npm (disk storm) but keep vite so Live can finish.
    if (kind === 'gguf') {
      const aheadGguf = [];
      const keepVite = [];
      for (const j of queue) {
        if (j.kind === 'gguf') {
          aheadGguf.push(j);
        } else if (j.kind === 'vite') {
          keepVite.push(j);
        } else {
          try { j.reject(new Error('novaJobs: cancelled — craft takes priority')); } catch { /* ignore */ }
        }
      }
      queue.length = 0;
      // gguf ahead of vite; vite preserved so preview attach isn't dropped mid-create.
      queue.push(...aheadGguf, {
        id,
        kind,
        label: job.label,
        run: job.run,
        resolve,
        reject,
      }, ...keepVite);
    } else {
      queue.push({
        id,
        kind,
        label: job.label,
        run: job.run,
        resolve,
        reject,
      });
    }
    void pump();
  });
}

/**
 * Reject waiting jobs (and optionally only one kind). Active job is not killed here —
 * pair with cancelGguf / process kill for the running generate.
 * @param {{ kind?: JobKind } | undefined} opts
 */
function cancelQueued(opts) {
  const only = opts?.kind ? String(opts.kind) : '';
  const keep = [];
  let n = 0;
  for (const j of queue) {
    if (only && j.kind !== only) {
      keep.push(j);
      continue;
    }
    try {
      j.reject(new Error('novaJobs: cancelled'));
    } catch { /* ignore */ }
    n += 1;
  }
  queue.length = 0;
  queue.push(...keep);
  return { ok: true, cancelled: n, pending: queue.length };
}

module.exports = { enqueue, status, cancelQueued };
