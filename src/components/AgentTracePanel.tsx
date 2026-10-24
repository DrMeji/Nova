import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import type { AgentFileChange, AgentTracePayload, AgentTraceStep } from '@/lib/agentTrace';
import { cleanSpokenAgentAnswer, isInventAccNoisePath } from '@/lib/agentTrace';
import { ChatMarkdown } from '@/lib/chatMarkdown';
import { loadCheckpointStack } from '@/lib/createCheckpoint';

function stepVerb(kind: AgentTraceStep['kind']): string {
  if (kind === 'read') return 'Read';
  if (kind === 'run') return 'Ran';
  if (kind === 'write') return 'Wrote';
  if (kind === 'answer') return 'Answer';
  return '';
}

/** Human label for Nova internal harness keys (not real project files). */
function novaHarnessLabel(path: string): string | null {
  const base = path.split(/[/\\]/).pop() || path;
  if (!/^\.__nova/i.test(base)) return null;
  const key = base.replace(/^\.__nova/i, '');
  const map: Record<string, string> = {
    BrowserLoop: 'Browser loop',
    DriverAsk: 'Driver brief',
    NavigatorAsk: 'Navigator brief',
    GenericInventAsk: 'Invent brief',
    StorefrontInventAsk: 'Storefront brief',
    ProductInventAsk: 'Product brief',
    MetaHarness: 'Build route',
    ArchitectPlan: 'Architect plan',
    EditorAsk: 'Editor brief',
  };
  return map[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').trim() || 'Build note';
}

function fileExtBadge(path: string): { label: string; tone: string } {
  if (/^\.__nova/i.test(path.split(/[/\\]/).pop() || path)) {
    return { label: 'NV', tone: 'bg-cyan-500/30 text-cyan-100' };
  }
  if (/\.gitignore$/i.test(path)) {
    return { label: 'GIT', tone: 'bg-rose-500/25 text-rose-200' };
  }
  const ext = (path.split('.').pop() || '').toLowerCase();
  if (ext === 'ts' || ext === 'tsx') return { label: 'TS', tone: 'bg-sky-500/25 text-sky-200' };
  if (ext === 'js' || ext === 'jsx' || ext === 'cjs' || ext === 'mjs') return { label: 'JS', tone: 'bg-amber-500/25 text-amber-200' };
  if (ext === 'py') return { label: 'PY', tone: 'bg-emerald-500/25 text-emerald-200' };
  if (ext === 'html') return { label: 'HTML', tone: 'bg-orange-500/25 text-orange-200' };
  if (ext === 'css') return { label: 'CSS', tone: 'bg-fuchsia-500/25 text-fuchsia-200' };
  if (ext === 'json') return { label: 'JSON', tone: 'bg-yellow-500/25 text-yellow-100' };
  if (ext === 'md') return { label: 'MD', tone: 'bg-indigo-500/30 text-indigo-100' };
  if (ext === 'svg') return { label: 'SVG', tone: 'bg-teal-500/30 text-teal-100' };
  if (/^\.env/i.test(path.split(/[/\\]/).pop() || '')) return { label: 'ENV', tone: 'bg-lime-500/25 text-lime-100' };
  return { label: (ext || 'FILE').slice(0, 4).toUpperCase(), tone: 'bg-surface-hover text-content-tertiary' };
}

function fileRowName(path: string): string {
  return novaHarnessLabel(path) || path.split(/[/\\]/).pop() || path;
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

/** ~10 rows visible; rest scrolls inside the card. */
const PREVIEW = 6;
const EXPANDED_VISIBLE_ROWS = 10;
/** Rough row height (badge + text) for max-height calc. */
const ROW_PX = 28;

function FilesChangedCard({
  changes,
  paths,
  projectPath,
  checkpoints,
}: {
  changes: AgentFileChange[];
  paths: string[];
  projectPath?: string;
  checkpoints?: Array<{ label: string; at: number; productName: string }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const rawRows: AgentFileChange[] = changes.length
    ? changes
    : paths.map(path => ({ path, added: 0, removed: 0 }));
  // Acc/open-all dumps can be 200+ rows — keep the card about product files.
  const rows = rawRows.filter((r) => !isInventAccNoisePath(r.path));
  if (!rows.length && !projectPath && !checkpoints?.length) return null;

  const visible = expanded ? rows : rows.slice(0, PREVIEW);
  const hidden = Math.max(0, rows.length - PREVIEW);
  const totalAdd = rows.reduce((n, r) => n + (r.added || 0), 0);
  const totalDel = rows.reduce((n, r) => n + (r.removed || 0), 0);
  const latest = checkpoints?.[0];

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

      {latest ? (
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[11px]">
          <span className="font-medium text-content-secondary">Checkpoint</span>
          <span className="text-content-primary">{latest.label}</span>
          <span className="text-content-tertiary">
            {checkpoints!.length > 1 ? `· ${checkpoints!.length} saved` : null}
            {' · '}
            {new Date(latest.at).toLocaleString(undefined, {
              month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
            })}
          </span>
          <span className="w-full text-[10px] text-content-tertiary/90">
            Say “rollback” to restore the previous craft snapshot.
          </span>
        </div>
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

      <ul
        className={`space-y-1 ${expanded ? 'nova-nested-scroll overflow-y-auto overscroll-contain pr-0.5' : ''}`}
        style={expanded ? { maxHeight: EXPANDED_VISIBLE_ROWS * ROW_PX, overscrollBehavior: 'contain' } : undefined}
        onWheel={(e) => {
          if (!expanded) return;
          const el = e.currentTarget;
          if (el.scrollHeight <= el.clientHeight + 1) return;
          const atTop = el.scrollTop <= 0;
          const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
          const leaving = (e.deltaY < 0 && atTop) || (e.deltaY > 0 && atBottom);
          // Keep wheel inside this list — never chain into the chat thread.
          e.stopPropagation();
          if (leaving) e.preventDefault();
        }}
      >
        {visible.map(row => {
          const badge = fileExtBadge(row.path);
          const name = fileRowName(row.path);
          const harness = Boolean(novaHarnessLabel(row.path));
          const add = Math.max(0, row.added || 0);
          const del = Math.max(0, row.removed || 0);
          return (
            <li key={row.path} className="flex items-center gap-2.5 min-w-0">
              <span className={`inline-flex h-5 min-w-[1.6rem] items-center justify-center rounded-md px-1 text-[9px] font-bold ${badge.tone}`}>
                {badge.label}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-[12px] text-content-secondary ${harness ? '' : 'font-mono'}`}
                title={row.path}
              >
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

      {hidden > 0 && !expanded ? (
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
  const shownAnswer = cleanSpokenAgentAnswer(answer || payload.answer || '');
  const actionSteps = useMemo(
    () => payload.steps.filter(s => s.kind !== 'thought'),
    [payload.steps],
  );
  const thought = payload.steps.find(s => s.kind === 'thought');
  const changed = payload.changedPaths || [];
  const fileChanges = payload.fileChanges || [];
  const showFilesCard = payload.done && (fileChanges.length > 0 || changed.length > 0 || Boolean(payload.projectPath));
  const checkpoints = useMemo(() => {
    const root = String(payload.projectPath || '').trim();
    if (!root || !payload.done) return [] as Array<{ label: string; at: number; productName: string }>;
    const stack = loadCheckpointStack(root);
    // Newest first for the compact header line.
    return stack.slice().reverse().map((c) => ({
      label: c.label,
      at: c.at,
      productName: c.productName,
    }));
  }, [payload.projectPath, payload.done]);

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

      {shownAnswer && !stepsOnly ? (
        <div className={`${payload.steps.length ? 'pt-1' : ''} min-w-0 max-w-full overflow-hidden break-words [overflow-wrap:anywhere] text-content-primary`}>
          <ChatMarkdown text={shownAnswer} />
        </div>
      ) : null}

      {showFilesCard || checkpoints.length ? (
        <FilesChangedCard
          changes={fileChanges}
          paths={changed}
          projectPath={payload.projectPath}
          checkpoints={checkpoints}
        />
      ) : null}

      {payload.done && Array.isArray(payload.qualityGaps) && payload.qualityGaps.length ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5 max-w-full min-w-0">
          <p className="text-[12px] font-medium text-amber-100/95 mb-1.5">
            Quality gaps
            <span className="ml-2 text-[11px] font-normal text-content-tertiary">
              where Ready held back
            </span>
          </p>
          <ul className="space-y-1.5 m-0 p-0 list-none">
            {payload.qualityGaps.slice(0, 8).map((gap, i) => (
              <li
                key={`${i}-${String(gap).slice(0, 40)}`}
                className="flex items-start gap-2 text-[12px] leading-snug text-content-secondary"
              >
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400/80" aria-hidden />
                <span className="min-w-0 break-words [overflow-wrap:anywhere]">{gap}</span>
              </li>
            ))}
          </ul>
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
