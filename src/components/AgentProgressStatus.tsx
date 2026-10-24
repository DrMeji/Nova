/**
 * Professional activity timeline for create/edit turns.
 * Open-ended kinds (Thinking / List / Read / Run / Plan / Invent / Design /
 * Assets / Verify / Preview / Heal / …) with a vertical rail and expandable detail.
 */

import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Folder,
  GitBranch,
  Globe,
  Image,
  Layers,
  Lightbulb,
  ListChecks,
  Package,
  Palette,
  PenLine,
  Plug,
  ScanSearch,
  Search,
  Sparkles,
  SquareTerminal,
  Stethoscope,
  Type,
  Wand2,
  Wrench,
  CircleDot,
  Eye,
  BadgeCheck,
} from 'lucide-react';
import {
  formatStepDurationMs,
  normalizeStatusHistory,
  type ChatTurnStatusStep,
} from '@/lib/chatTurnStatusStore';
import {
  activityKindLabel,
  compressActivitySteps,
  enrichActivityStep,
  formatLiveWorkingHeader,
  formatWorkingDuration,
  type ChatActivityKind,
  type ChatActivityStep,
} from '@/lib/chatTurnActivity';

function looksLikeWebSearchStatus(label: string): boolean {
  return /\bsearch(?:ing)?\s+(?:the\s+)?web\b|\breading\s+(?:results|layout\s+references|sources?)\b|\blayout\s+references\b|\bfinding\s+relevant\s+sources\b|\bcomparing\s+sources\b|\bverifying\s+candidate\b|\blooking\s+for\s+images\b|\bplanning\s+searches\b|\bweb\s+lookup\b|\bdeep\s+research\b/i.test(
    String(label || ''),
  );
}

function KindIcon({ kind }: { kind: ChatActivityKind | string }) {
  const cls = 'w-3.5 h-3.5 shrink-0 text-content-tertiary';
  switch (kind) {
    case 'thinking':
      return <Sparkles className={cls} aria-hidden />;
    case 'plan':
      return <ClipboardList className={cls} aria-hidden />;
    case 'spine':
      return <GitBranch className={cls} aria-hidden />;
    case 'list':
      return <Folder className={cls} aria-hidden />;
    case 'read':
      return <FileText className={cls} aria-hidden />;
    case 'search':
      return <Search className={cls} aria-hidden />;
    case 'browse':
      return <Globe className={cls} aria-hidden />;
    case 'analyze':
      return <ScanSearch className={cls} aria-hidden />;
    case 'connect':
      return <Plug className={cls} aria-hidden />;
    case 'scaffold':
      return <Layers className={cls} aria-hidden />;
    case 'floor':
      return <Layers className={cls} aria-hidden />;
    case 'craft':
      return <Wand2 className={cls} aria-hidden />;
    case 'invent':
      return <Lightbulb className={cls} aria-hidden />;
    case 'write':
      return <PenLine className={cls} aria-hidden />;
    case 'edit':
      return <Wand2 className={cls} aria-hidden />;
    case 'apply':
      return <ListChecks className={cls} aria-hidden />;
    case 'design':
      return <Palette className={cls} aria-hidden />;
    case 'copy':
      return <Type className={cls} aria-hidden />;
    case 'assets':
      return <Image className={cls} aria-hidden />;
    case 'run':
      return <SquareTerminal className={cls} aria-hidden />;
    case 'install':
      return <Package className={cls} aria-hidden />;
    case 'todos':
      return <CheckSquare className={cls} aria-hidden />;
    case 'fix':
      return <Wrench className={cls} aria-hidden />;
    case 'heal':
      return <Stethoscope className={cls} aria-hidden />;
    case 'verify':
      return <BadgeCheck className={cls} aria-hidden />;
    case 'preview':
      return <Eye className={cls} aria-hidden />;
    default:
      return <CircleDot className={cls} aria-hidden />;
  }
}

/**
 * Proprietary build signal — luminous point travels a thin rail (construction, not “thinking”).
 * Stays mounted so the animation timeline does not reset on every status label tick.
 */
const BuildSignal = memo(function BuildSignal() {
  return (
    <span className="nova-build-signal" aria-hidden>
      <span className="nova-build-signal-rail" />
      <span className="nova-build-signal-point" />
    </span>
  );
});

/** Width of build signal + gap — list icons align under the header text, not under the signal. */
const BUILD_SIGNAL_GUTTER = 'pl-[30px]';

function ActivityRow({
  step,
  isCurrent,
  finished,
  defaultOpen,
}: {
  step: ChatActivityStep;
  isCurrent: boolean;
  finished: boolean;
  defaultOpen?: boolean;
}) {
  const kind = step.kind || 'work';
  const kindLabel = activityKindLabel(kind);
  const summary = (step.summary || step.label || '').replace(/\*\*/g, '');
  const detail = String(step.detail || '').trim();
  const canExpand = Boolean(
    detail
    && detail.length > 48
    && detail !== summary
  ) || (kind === 'run' && Boolean(detail))
    || (kind === 'thinking' && summary.length > 72);
  const [open, setOpen] = useState(Boolean(defaultOpen && canExpand));
  const expandBody = open && canExpand
    ? (detail || summary)
    : '';

  const runBadge = (kind === 'run' || kind === 'install')
    ? (step.runStatus === 'success'
      ? 'Success'
      : step.runStatus === 'fail'
        ? 'Failed'
        : (isCurrent && !finished ? 'Running' : null))
    : null;

  return (
    <li className="relative pl-0 list-none">
      <button
        type="button"
        className={`group flex w-full min-w-0 items-start gap-2.5 rounded-md px-1 py-1.5 text-left transition-colors ${
          canExpand ? 'hover:bg-white/[0.04] cursor-pointer' : 'cursor-default'
        }`}
        aria-expanded={canExpand ? open : undefined}
        disabled={!canExpand}
        onClick={() => {
          if (!canExpand) return;
          setOpen((v) => !v);
        }}
      >
        {/* Icons only — never rounded-full / ring / border circle chrome */}
        <span className="relative z-[1] mt-0.5 flex h-3.5 w-3.5 shrink-0 items-center justify-center border-0 ring-0 outline-none shadow-none bg-transparent rounded-none">
          <KindIcon kind={kind} />
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="flex min-w-0 items-baseline gap-1.5 flex-wrap">
            <span className={`text-[12.5px] font-semibold tracking-wide ${
              isCurrent && !finished ? 'text-content-primary' : 'text-content-secondary'
            }`}
            >
              {kindLabel}
            </span>
            <span
              className={`min-w-0 text-[12.5px] leading-snug break-words [overflow-wrap:anywhere] ${
                isCurrent && !finished ? 'text-content-secondary' : 'text-content-tertiary'
              }`}
              title={summary}
            >
              {summary.length > 110 && !open ? `${summary.slice(0, 108)}…` : summary}
            </span>
          </span>
        </span>
        <span className="mt-0.5 flex shrink-0 items-center gap-1.5">
          {runBadge ? (
            <span
              className={`text-[11px] tabular-nums ${
                runBadge === 'Success'
                  ? 'text-emerald-400/90'
                  : runBadge === 'Failed'
                    ? 'text-rose-400/90'
                    : 'text-amber-300/90'
              }`}
            >
              {runBadge}
            </span>
          ) : null}
          {canExpand ? (
            open
              ? <ChevronDown className="w-3.5 h-3.5 text-content-tertiary" aria-hidden />
              : <ChevronRight className="w-3.5 h-3.5 text-content-tertiary" aria-hidden />
          ) : null}
        </span>
      </button>
      {expandBody ? (
        <div className="ml-5 mb-1.5 mr-1 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
          <pre className="m-0 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-content-tertiary [overflow-wrap:anywhere]">
            {expandBody}
          </pre>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Current work line + expandable Cursor-style activity timeline.
 */
export function AgentProgressStatus({
  label,
  history = [],
}: {
  label: string;
  /** Work lines (strings or enriched steps) for the expandable list. */
  history?: Array<string | ChatTurnStatusStep>;
}) {
  const rawLabel = (label?.trim() || 'Working…').replace(/\u2014/g, ':').replace(/\*\*/g, '');
  const finished = /^done$/i.test(rawLabel);
  const steps = useMemo(
    () => compressActivitySteps(
      normalizeStatusHistory(history, rawLabel).map((s) => enrichActivityStep(s)),
    ),
    [history, rawLabel],
  );
  const displaySteps = steps.length
    ? steps
    : [enrichActivityStep({ label: rawLabel, at: Date.now() })];
  const latestStep = displaySteps[displaySteps.length - 1];
  const latestSummary = latestStep?.summary || latestStep?.label || rawLabel;
  const webSearch = looksLikeWebSearchStatus(latestSummary) || latestStep?.kind === 'search';
  const [open, setOpen] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement | null>(null);
  const startedAt = displaySteps[0]?.at || Date.now();

  useEffect(() => {
    if (finished) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [displaySteps.length, finished]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      rootRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, [open, displaySteps.length]);

  const elapsedMs = Math.max(
    0,
    finished
      ? ((displaySteps[displaySteps.length - 1]?.at || now) - startedAt)
      : (now - startedAt),
  );
  const durationLabel = formatWorkingDuration(elapsedMs, finished);
  // Live header = current work (Spine · Thin create…), not elapsed time.
  // Finished turns keep "Worked for …"; duration stays in the tooltip while running.
  const header = finished
    ? durationLabel
    : formatLiveWorkingHeader({
      kind: latestStep?.kind || 'work',
      summary: latestSummary,
      maxLen: 110,
    });
  const headerTitle = finished
    ? (open ? 'Hide activity' : 'Show activity')
    : `${durationLabel} · ${open ? 'Hide activity' : 'Show full activity trail'}`;

  const canExpand = displaySteps.length >= 1;

  return (
    <div ref={rootRef} className="relative w-full min-w-0 max-w-full overflow-hidden">
      <button
        type="button"
        className="flex w-full min-w-0 max-w-full items-center gap-2 py-0.5 pl-0 text-left rounded-md hover:bg-white/[0.04] transition-colors"
        aria-live="polite"
        aria-label={finished ? header : `${header} (${durationLabel})`}
        aria-expanded={open}
        title={headerTitle}
        onClick={() => {
          if (!canExpand) return;
          setOpen((v) => !v);
        }}
      >
        {finished ? (
          <span className="inline-block w-[22px] shrink-0" aria-hidden />
        ) : webSearch ? (
          <Globe className="w-[22px] h-3.5 shrink-0 text-content-tertiary" aria-hidden />
        ) : (
          <BuildSignal />
        )}
        <span className={`min-w-0 flex-1 text-sm font-medium tracking-wide break-words [overflow-wrap:anywhere] ${finished ? 'text-content-tertiary' : 'text-content-secondary'}`}>
          {header}
        </span>
        {canExpand ? (
          <ChevronDown
            className={`w-3.5 h-3.5 shrink-0 text-content-tertiary transition-transform ${open ? 'rotate-180' : ''}`}
          />
        ) : null}
      </button>

      {open && canExpand ? (
        <div className={`relative mt-1 ${BUILD_SIGNAL_GUTTER}`}>
          {/* Icons start under the header text — build signal sits alone to the left. */}
          <ul className="relative m-0 w-full max-w-full space-y-0.5 p-0" role="list">
            {displaySteps.map((step, i) => {
              const isCurrent = i === displaySteps.length - 1;
              return (
                <ActivityRow
                  key={`${i}-${step.kind}-${step.label.slice(0, 48)}-${step.at}`}
                  step={step}
                  isCurrent={isCurrent}
                  finished={finished}
                  defaultOpen={isCurrent && step.kind === 'thinking' && !finished}
                />
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Kept for any caller that still wants a duration chip. */
export { formatStepDurationMs };
