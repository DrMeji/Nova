import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { AgentFileChange, AgentTracePayload, AgentTraceStep } from '@/lib/agentTrace';
import { ChatMarkdown } from '@/lib/chatMarkdown';

function stepVerb(kind: AgentTraceStep['kind']): string {
  if (kind === 'read') return 'Read';
  if (kind === 'run') return 'Ran';
  if (kind === 'write') return 'Wrote';
  if (kind === 'answer') return 'Answer';
  return '';
}

function fileExtBadge(path: string): { label: string; tone: string } {
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'ts' || ext === 'tsx') return { label: 'TS', tone: 'bg-sky-500/25 text-sky-200' };
  if (ext === 'js' || ext === 'jsx' || ext === 'cjs' || ext === 'mjs') return { label: 'JS', tone: 'bg-amber-500/25 text-amber-200' };
  if (ext === 'py') return { label: 'PY', tone: 'bg-emerald-500/25 text-emerald-200' };
  if (ext === 'html') return { label: 'HTML', tone: 'bg-orange-500/25 text-orange-200' };
  if (ext === 'css') return { label: 'CSS', tone: 'bg-fuchsia-500/25 text-fuchsia-200' };
  if (ext === 'json') return { label: 'JSON', tone: 'bg-yellow-500/25 text-yellow-100' };
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), tone: 'bg-surface-hover text-content-tertiary' };
}

function ThoughtBlock({
  thought,
  actionSteps,
  startedAt,
  live,
  elapsedMs,
}: {
  thought?: AgentTraceStep;
  actionSteps: AgentTraceStep[];
  startedAt: number;
  live: boolean;
  elapsedMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const frozenSecs = Math.max(1, Math.round((elapsedMs || 0) / 1000) || 1);
  const [elapsed, setElapsed] = useState(live ? 1 : frozenSecs);

  useEffect(() => {
    if (live) setOpen(true);
  }, [live]);

  useEffect(() => {
    if (!live) {
      setElapsed(frozenSecs);
      return;
    }
    const t0 = startedAt;
    const tick = () => setElapsed(Math.max(1, Math.round((Date.now() - t0) / 1000)));
    tick();
    const id = window.setInterval(tick, 400);
    return () => window.clearInterval(id);
  }, [live, startedAt, frozenSecs]);

  if (!thought && !actionSteps.length) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        className="flex w-full items-center gap-1 text-left text-[11px] text-content-tertiary hover:text-content-secondary"
        onClick={() => setOpen(v => !v)}
      >
        <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span>{live ? `Thinking… ${elapsed}s` : `Thought for ${elapsed}s`}</span>
      </button>
      {open ? (
        <div className="pl-4 space-y-1.5">
          {thought?.label ? (
            <p className="text-[11px] leading-relaxed text-content-tertiary/90">{thought.label}</p>
          ) : null}
          {actionSteps.map(step => {
            if (step.kind === 'plan' || step.kind === 'status') {
              return (
                <p key={step.id} className="text-[11px] leading-snug text-content-tertiary">
                  {step.label}
                </p>
              );
            }
            if (step.kind === 'run' || step.kind === 'read' || step.kind === 'write') {
              const verb = stepVerb(step.kind);
              return (
                <p key={step.id} className="text-[11px] leading-snug text-content-tertiary">
                  · {verb ? `${verb} ` : ''}{step.label}
                </p>
              );
            }
            return null;
          })}
        </div>
      ) : null}
    </div>
  );
}

function FilesChangedCard({
  changes,
  paths,
  projectPath,
}: {
  changes: AgentFileChange[];
  paths: string[];
  projectPath?: string;
}) {
  // Collapsed by default so long SVG lists don't eat the chat viewport.
  const [expanded, setExpanded] = useState(false);
  const rows: AgentFileChange[] = changes.length
    ? changes
    : paths.map(path => ({ path, added: 0, removed: 0 }));
  if (!rows.length && !projectPath) return null;
  const PREVIEW = 6;
  const visible = expanded ? rows : rows.slice(0, PREVIEW);
  const hidden = Math.max(0, rows.length - visible.length);
  const totalAdd = rows.reduce((n, r) => n + (r.added || 0), 0);
  const totalDel = rows.reduce((n, r) => n + (r.removed || 0), 0);

  return (
    <div className="rounded-xl border border-surface-border/70 bg-surface-hover/30 px-3 py-2.5 max-w-full min-w-0">
      {projectPath ? (
        <p className="mb-2 text-[11px] leading-snug text-content-tertiary">
          <span className="text-content-secondary">Location</span>
          <span className="mt-0.5 block truncate font-mono text-[11px] text-content-secondary" title={projectPath}>
            {projectPath}
          </span>
        </p>
      ) : null}
      <p className="text-[12px] font-medium text-content-primary mb-1.5">
        {rows.length} File{rows.length === 1 ? '' : 's'} Changed
        {totalAdd > 0 || totalDel > 0 ? (
          <span className="ml-2 text-[11px] font-normal text-content-tertiary">
            {totalAdd > 0 ? <span className="text-emerald-400">+{totalAdd}</span> : null}
            {totalAdd > 0 && totalDel > 0 ? ' ' : null}
            {totalDel > 0 ? <span className="text-rose-400">-{totalDel}</span> : null}
          </span>
        ) : null}
      </p>
      <ul className="space-y-1">
        {visible.map(row => {
          const badge = fileExtBadge(row.path);
          const name = row.path.split(/[/\\]/).pop() || row.path;
          const add = Math.max(0, row.added || 0);
          const del = Math.max(0, row.removed || 0);
          return (
            <li key={row.path} className="flex items-center gap-2.5 min-w-0">
              <span className={`inline-flex h-5 min-w-[1.6rem] items-center justify-center rounded-md px-1 text-[9px] font-bold ${badge.tone}`}>
                {badge.label}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-content-secondary font-mono" title={row.path}>
                {name}
              </span>
              <span className="shrink-0 text-[11px] font-mono tabular-nums text-content-tertiary">
                {add > 0 ? <span className="text-emerald-400">+{add}</span> : null}
                {add > 0 && del > 0 ? ' ' : null}
                {del > 0 ? <span className="text-rose-400">-{del}</span> : null}
                {add === 0 && del === 0 ? <span className="text-content-tertiary">·</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1.5 text-[11px] text-content-tertiary hover:text-content-secondary"
        >
          Show more ({hidden})
        </button>
      ) : null}
      {expanded && rows.length > PREVIEW ? (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="mt-1 text-[11px] text-content-tertiary hover:text-content-secondary"
        >
          Show less
        </button>
      ) : null}
    </div>
  );
}

export function AgentTracePanel({
  payload,
  answer,
  live = false,
  stepsOnly = false,
  onContinue,
}: {
  payload: AgentTracePayload;
  answer?: string;
  live?: boolean;
  stepsOnly?: boolean;
  onContinue?: () => void;
}) {
  const shownAnswer = (answer || payload.answer || '').trim();
  const actionSteps = useMemo(
    () => payload.steps.filter(s => s.kind !== 'thought'),
    [payload.steps],
  );
  const thought = payload.steps.find(s => s.kind === 'thought');
  const changed = payload.changedPaths || [];
  const fileChanges = payload.fileChanges || [];
  const showFilesCard = payload.done && (fileChanges.length > 0 || changed.length > 0 || Boolean(payload.projectPath));

  return (
    <div className="space-y-2 min-w-0 max-w-full">
      <ThoughtBlock
        thought={thought}
        actionSteps={actionSteps}
        startedAt={payload.startedAt}
        live={live && !payload.done}
        elapsedMs={payload.elapsedMs}
      />

      {live && !payload.done ? (
        <div className="flex items-center gap-2 pt-0.5 text-[11px] text-content-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
          <span>Working…</span>
        </div>
      ) : null}

      {showFilesCard ? (
        <FilesChangedCard
          changes={fileChanges}
          paths={changed}
          projectPath={payload.projectPath}
        />
      ) : null}

      {shownAnswer && !stepsOnly ? (
        <div className={`${payload.steps.length || showFilesCard ? 'pt-1' : ''} min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere] text-content-primary`}>
          <ChatMarkdown text={shownAnswer} />
        </div>
      ) : null}

      {payload.canContinue && payload.done && onContinue ? (
        <button
          type="button"
          onClick={onContinue}
          className="inline-flex items-center rounded-full border border-sky-500/35 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20 transition-colors"
        >
          Continue agent
        </button>
      ) : null}
    </div>
  );
}
