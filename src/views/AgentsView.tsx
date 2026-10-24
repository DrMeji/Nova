/**
 * Agents desk — real Kanban + coding DAG (not HomeControls-only).
 * Missing: agents-window / worker-dag-ui / background-agents-ui.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Square, ExternalLink } from 'lucide-react';
import { ToolsHomeShell } from '@/components/ToolsHomeShell';
import { CodingWorkerDagPanel } from '@/components/CodingWorkerDagPanel';
import {
  cancelCreateJob,
  createJobRetryBrief,
  listCreateJobs,
  subscribeCreateJobs,
  type CreateJob,
  type CreateJobStatus,
} from '@/lib/createJobStore';
import { useRouter } from '@/context/RouterContext';

type KanbanCol = {
  id: string;
  title: string;
  statuses: CreateJobStatus[];
  tone: string;
};

const COLUMNS: KanbanCol[] = [
  {
    id: 'queued',
    title: 'Writing',
    statuses: ['writing'],
    tone: 'border-violet-500/30 bg-violet-500/5',
  },
  {
    id: 'running',
    title: 'Running',
    statuses: ['npm', 'verifying'],
    tone: 'border-sky-500/30 bg-sky-500/5',
  },
  {
    id: 'done',
    title: 'Ready',
    statuses: ['ready'],
    tone: 'border-emerald-500/30 bg-emerald-500/5',
  },
  {
    id: 'failed',
    title: 'Failed',
    statuses: ['failed'],
    tone: 'border-rose-500/30 bg-rose-500/5',
  },
];

function statusLabel(status: CreateJobStatus): string {
  if (status === 'writing') return 'Writing';
  if (status === 'npm') return 'Installing';
  if (status === 'verifying') return 'Verifying';
  if (status === 'ready') return 'Ready';
  return 'Failed';
}

function AgentJobCard({
  job,
  onCancel,
  onRetry,
  onOpenChat,
}: {
  job: CreateJob;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  onOpenChat: (chatId: string) => void;
}) {
  const inflight = job.status === 'writing' || job.status === 'npm' || job.status === 'verifying';
  const ageMin = Math.max(0, Math.round((Date.now() - (job.updatedAt || 0)) / 60_000));
  return (
    <article
      className="rounded-xl border border-stroke-subtle bg-surface-raised/80 p-3 space-y-2 shadow-sm"
      data-nova-agent-job={job.id}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-content-primary truncate">
            {job.name || 'Untitled create'}
          </h3>
          <p className="text-[11px] text-content-tertiary mt-0.5">
            {statusLabel(job.status)}
            {job.stage ? ` · ${job.stage}` : ''}
            {ageMin > 0 ? ` · ${ageMin}m ago` : ''}
          </p>
        </div>
        {inflight ? (
          <Loader2 className="w-4 h-4 shrink-0 animate-spin text-sky-300" aria-hidden />
        ) : null}
      </div>
      {job.lastObservation || job.error ? (
        <p className="text-[11px] text-content-secondary line-clamp-3 leading-relaxed">
          {job.error || job.lastObservation}
        </p>
      ) : null}
      {job.blockedReasons?.length ? (
        <ul className="text-[10px] text-amber-100/90 space-y-0.5 list-disc pl-4">
          {job.blockedReasons.slice(0, 3).map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-1.5 pt-1">
        {inflight ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-rose-400/35 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
            onClick={() => onCancel(job.id)}
            aria-label={`Cancel ${job.name}`}
          >
            <Square className="w-3 h-3" />
            Cancel
          </button>
        ) : null}
        {(job.status === 'failed' || job.status === 'ready') && createJobRetryBrief(job.id) ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-amber-400/35 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20"
            onClick={() => onRetry(job.id)}
            aria-label={`Retry ${job.name}`}
          >
            <RotateCcw className="w-3 h-3" />
            Retry in Chat
          </button>
        ) : null}
        {job.chatId ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-stroke-subtle text-content-secondary hover:bg-surface-hover"
            onClick={() => onOpenChat(job.chatId)}
            aria-label={`Open chat for ${job.name}`}
          >
            <ExternalLink className="w-3 h-3" />
            Chat
          </button>
        ) : null}
      </div>
    </article>
  );
}

/** Multi-agent / create workers — Kanban desk + DAG + helper suites. */
export function AgentsView() {
  const { navigate } = useRouter();
  const [jobs, setJobs] = useState<CreateJob[]>(() => listCreateJobs());

  useEffect(() => {
    const sync = () => setJobs(listCreateJobs());
    sync();
    return subscribeCreateJobs(sync);
  }, []);

  const byCol = useMemo(() => {
    const map: Record<string, CreateJob[]> = {};
    for (const col of COLUMNS) map[col.id] = [];
    for (const job of jobs) {
      const col = COLUMNS.find((c) => c.statuses.includes(job.status));
      if (col) map[col.id].push(job);
    }
    return map;
  }, [jobs]);

  const onCancel = useCallback((id: string) => {
    cancelCreateJob(id);
    setJobs(listCreateJobs());
  }, []);

  const onRetry = useCallback((id: string) => {
    const brief = createJobRetryBrief(id);
    if (!brief) return;
    try {
      sessionStorage.setItem('nova-agents-retry-brief', brief);
    } catch { /* ignore */ }
    try {
      window.dispatchEvent(new CustomEvent('nova-agents-retry', { detail: { brief, jobId: id } }));
    } catch { /* ignore */ }
    navigate({ name: 'chat' });
  }, [navigate]);

  const onOpenChat = useCallback((chatId: string) => {
    navigate({ name: 'chat', chatId });
  }, [navigate]);

  return (
    <ToolsHomeShell
      title="Agents"
      summary="Watch create and coding workers — cancel, retry, and follow the build path. Capabilities are built in; nothing to turn on."
    >
      <div className="space-y-5" data-nova-agents-desk="1">
        <CodingWorkerDagPanel />

        <section aria-label="Create jobs Kanban">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-semibold text-content-primary">Create jobs</h2>
            <span className="text-[11px] text-content-tertiary">
              {jobs.length ? `${jobs.length} job${jobs.length === 1 ? '' : 's'}` : 'No jobs yet'}
            </span>
          </div>
          {!jobs.length ? (
            <p className="text-[12px] text-content-secondary rounded-xl border border-dashed border-stroke-subtle px-3 py-4 mb-2">
              Start a create in Chat — jobs show up here so you can cancel or retry without digging through threads.
            </p>
          ) : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {COLUMNS.map((col) => (
              <div
                key={col.id}
                className={`rounded-xl border p-2.5 min-h-[8rem] ${col.tone}`}
                data-nova-kanban-col={col.id}
              >
                <div className="flex items-center justify-between mb-2 px-0.5">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-content-secondary">
                    {col.title}
                  </h3>
                  <span className="text-[10px] text-content-tertiary tabular-nums">
                    {byCol[col.id]?.length || 0}
                  </span>
                </div>
                <div className="space-y-2">
                  {(byCol[col.id] || []).map((job) => (
                    <AgentJobCard
                      key={job.id}
                      job={job}
                      onCancel={onCancel}
                      onRetry={onRetry}
                      onOpenChat={onOpenChat}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </ToolsHomeShell>
  );
}
