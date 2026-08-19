/**
 * Compact background jobs: engine downloads, cancel, errors.
 */

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  cancelEngineDownload,
  dismissEngineDownloadError,
  getEngineDownloadJobs,
  subscribeEngineDownloads,
  type EngineDownloadJob,
} from '@/lib/engineDownloads';
import { ArkErrorInline } from '@/components/ArkErrorInline';

export function JobsStrip() {
  const [jobs, setJobs] = useState<EngineDownloadJob[]>(() => getEngineDownloadJobs());

  useEffect(() => subscribeEngineDownloads(() => {
    setJobs(getEngineDownloadJobs());
  }), []);

  const active = jobs.filter(j => j.progress < 100 || j.error || j.canceling);
  if (active.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-surface-border bg-ark-navy-950/95 px-3 py-2 space-y-1.5">
      {active.map(job => (
        <div key={job.id} className="flex items-start gap-2 text-xs">
          {!job.error && !job.canceling ? (
            <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin shrink-0 mt-0.5" />
          ) : null}
          <div className="min-w-0 flex-1">
            {job.error ? (
              <ArkErrorInline message={job.error} />
            ) : (
              <>
                <p className="text-content-secondary truncate">
                  {job.canceling ? 'Canceling…' : 'Downloading'} {job.name || job.id}
                  {!job.canceling ? ` · ${Math.round(job.progress)}%` : ''}
                </p>
                {!job.canceling && job.progress < 100 ? (
                  <div className="h-1 mt-1 bg-surface-hover rounded-full overflow-hidden">
                    <div
                      className="h-full bg-sky-500/70 transition-all"
                      style={{ width: `${Math.min(100, job.progress)}%` }}
                    />
                  </div>
                ) : null}
              </>
            )}
            {job.error ? (
              <div className="flex gap-2 mt-1">
                <button type="button" className="text-[10px] text-content-tertiary hover:text-content-secondary" onClick={() => dismissEngineDownloadError(job.id)}>
                  Dismiss
                </button>
              </div>
            ) : null}
          </div>
          {!job.error && !job.canceling ? (
            <button
              type="button"
              className="shrink-0 p-1 text-content-tertiary hover:text-rose-300"
              aria-label="Cancel download"
              onClick={() => void cancelEngineDownload(job.id)}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
