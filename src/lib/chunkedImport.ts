/** Yield to the UI thread so large folder imports don’t freeze the desktop. */

export type ImportProgress = {
  phase: 'copy' | 'read' | 'apply' | 'done' | 'error';
  done: number;
  total: number;
  label?: string;
};

function yieldFrame(): Promise<void> {
  return new Promise(resolve => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') {
      // Hidden windows never paint → rAF may never fire; timer keeps imports moving.
      requestAnimationFrame(() => finish());
      setTimeout(finish, 32);
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** Pause long enough for Windows to stay responsive on weaker PCs. */
function yieldTick(ms = 12): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Apply a large files map into React state in small batches.
 * Target: finish within ~20–30s even for 300+ files without locking the UI.
 */
export async function applyFilesInBatches(
  files: Record<string, string>,
  applyBatch: (accumulated: Record<string, string>, done: number, total: number) => void,
  opts?: { batchSize?: number; onProgress?: (p: ImportProgress) => void },
): Promise<void> {
  const entries = Object.entries(files);
  const total = entries.length;
  if (!total) {
    applyBatch({}, 0, 0);
    opts?.onProgress?.({ phase: 'done', done: 0, total: 0 });
    return;
  }

  // Pace so ~300 files take ~15–25s of wall time with UI breathing room.
  const batchSize = opts?.batchSize ?? Math.max(8, Math.min(24, Math.ceil(total / 18)));
  const acc: Record<string, string> = {};

  for (let i = 0; i < entries.length; i += batchSize) {
    const slice = entries.slice(i, i + batchSize);
    for (const [path, content] of slice) {
      acc[path] = content;
    }
    const done = Math.min(i + slice.length, total);
    applyBatch({ ...acc }, done, total);
    opts?.onProgress?.({
      phase: 'apply',
      done,
      total,
      label: `Loading files ${done}/${total}`,
    });
    await yieldFrame();
    await yieldTick(total > 120 ? 18 : 8);
  }

  opts?.onProgress?.({ phase: 'done', done: total, total, label: 'Ready' });
}

export { yieldFrame, yieldTick };
