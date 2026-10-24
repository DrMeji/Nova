/**
 * Renders Missing-items controls in their real home (Settings, Agents, Chat, Live…).
 * Each row is a real toggle/action stored on this PC — deepen wiring later.
 */
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import {
  Bot,
  Boxes,
  CalendarClock,
  ChevronDown,
  Cloud,
  CreditCard,
  FileText,
  FolderTree,
  Gauge,
  GitBranch,
  LayoutGrid,
  ListTodo,
  Mail,
  Network,
  Plug,
  Radar,
  ScrollText,
  Server,
  Sparkles,
  Terminal,
  Timer,
  Workflow,
  type LucideProps,
} from 'lucide-react';
import {
  MISSING_ITEMS,
  type MissingHome,
  type MissingItem,
  loadMissingPlaced,
  saveMissingPlaced,
} from '@/lib/missingItemsCatalog';
import {
  buildControlSuites,
  displayHelperTitle,
  type BuiltSuite,
} from '@/lib/homeControlSuites';
import { getLocalPrefs, setLocalPrefs } from '@/lib/localPrefs';

/** Collapse research duplicates (same stem, different peer/status) into one visible row. */
function suiteDetailRows(
  suite: BuiltSuite,
  toggles: Record<string, boolean>,
  defaultOn: boolean,
): Array<{ key: string; title: string; why: string; on: boolean; count: number }> {
  const map = new Map<string, { title: string; why: string; on: boolean; count: number }>();
  for (const item of suite.items) {
    const title = displayHelperTitle(item.title);
    const key = title.toLowerCase();
    const on = itemIsOn(item, toggles, defaultOn);
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { title, why: item.why, on, count: 1 });
    } else {
      prev.count += 1;
      prev.on = prev.on || on;
      if (item.why && item.why.length < prev.why.length) prev.why = item.why;
    }
  }
  return [...map.entries()].map(([key, v]) => ({ key, ...v }));
}

type MarkTone = { Icon: ComponentType<LucideProps>; bg: string };

/** Colored marks — same language as Plugins / Models brand plates. */
const MARK_BY_ID: Record<string, MarkTone> = {
  'agents-window': { Icon: LayoutGrid, bg: 'bg-gradient-to-br from-violet-500 to-indigo-700' },
  'worker-dag-ui': { Icon: GitBranch, bg: 'bg-gradient-to-br from-sky-400 to-blue-700' },
  'orb-registry-ui': { Icon: Cloud, bg: 'bg-gradient-to-br from-cyan-400 to-teal-700' },
  'nested-agents-ui': { Icon: FolderTree, bg: 'bg-gradient-to-br from-emerald-400 to-green-700' },
  'peer-messaging-ui': { Icon: Mail, bg: 'bg-gradient-to-br from-amber-400 to-orange-600' },
  'background-agents-ui': { Icon: Timer, bg: 'bg-gradient-to-br from-fuchsia-400 to-purple-700' },
  'quest-mode-ui': { Icon: Sparkles, bg: 'bg-gradient-to-br from-rose-400 to-pink-700' },
  'foreign-cli-ui': { Icon: Terminal, bg: 'bg-gradient-to-br from-lime-400 to-emerald-700' },
  'smoke-runner-ui': { Icon: Radar, bg: 'bg-gradient-to-br from-orange-400 to-red-600' },
  'semantic-index-ui': { Icon: Network, bg: 'bg-gradient-to-br from-blue-400 to-indigo-700' },
  'automations-ui': { Icon: CalendarClock, bg: 'bg-gradient-to-br from-violet-400 to-purple-700' },
  'integrations-hub': { Icon: Plug, bg: 'bg-gradient-to-br from-sky-400 to-cyan-700' },
  'audit-log-viewer': { Icon: ScrollText, bg: 'bg-gradient-to-br from-zinc-400 to-slate-700' },
  'mcp-invent-scopes': { Icon: Boxes, bg: 'bg-gradient-to-br from-teal-400 to-cyan-700' },
  'mcp-resources-ui': { Icon: Server, bg: 'bg-gradient-to-br from-indigo-400 to-violet-700' },
  'acp-session-ui': { Icon: Workflow, bg: 'bg-gradient-to-br from-amber-400 to-yellow-700' },
  'whats-new-changelog': { Icon: FileText, bg: 'bg-gradient-to-br from-emerald-400 to-teal-700' },
  'missing-items-nav': { Icon: ListTodo, bg: 'bg-gradient-to-br from-rose-400 to-red-700' },
  'model-latency-sla': { Icon: Gauge, bg: 'bg-gradient-to-br from-sky-400 to-blue-700' },
  'payments-panel': { Icon: CreditCard, bg: 'bg-gradient-to-br from-violet-400 to-fuchsia-700' },
  'task-subagent-launch': { Icon: Bot, bg: 'bg-gradient-to-br from-indigo-400 to-blue-700' },
  'explore-readonly-mode': { Icon: Radar, bg: 'bg-gradient-to-br from-teal-400 to-emerald-700' },
  'agent-dry-run-mode': { Icon: Workflow, bg: 'bg-gradient-to-br from-amber-400 to-orange-600' },
  'harness-runner-hub': { Icon: Radar, bg: 'bg-gradient-to-br from-rose-400 to-red-600' },
  'per-tool-permissions-ui': { Icon: Plug, bg: 'bg-gradient-to-br from-sky-400 to-indigo-700' },
  'custom-modes-ui': { Icon: Boxes, bg: 'bg-gradient-to-br from-violet-400 to-purple-700' },
  'custom-agent-md-ui': { Icon: FileText, bg: 'bg-gradient-to-br from-cyan-400 to-teal-700' },
  'browser-element-pick': { Icon: LayoutGrid, bg: 'bg-gradient-to-br from-pink-400 to-rose-700' },
  'craft-media-floor-toggle': { Icon: Sparkles, bg: 'bg-gradient-to-br from-amber-400 to-orange-700' },
  'model-potential-meter': { Icon: Gauge, bg: 'bg-gradient-to-br from-emerald-400 to-teal-700' },
  'vision-seat-indicator': { Icon: Radar, bg: 'bg-gradient-to-br from-sky-400 to-indigo-700' },
  'logo-lock-badge': { Icon: Boxes, bg: 'bg-gradient-to-br from-violet-400 to-fuchsia-700' },
  'underuse-warn-toast': { Icon: Timer, bg: 'bg-gradient-to-br from-rose-400 to-red-600' },
  'deep-rescan-loop-status': { Icon: ScrollText, bg: 'bg-gradient-to-br from-zinc-400 to-slate-700' },
};

const FALLBACK_TONES: MarkTone[] = [
  { Icon: Bot, bg: 'bg-gradient-to-br from-sky-500 to-indigo-700' },
  { Icon: Sparkles, bg: 'bg-gradient-to-br from-violet-500 to-purple-700' },
  { Icon: Workflow, bg: 'bg-gradient-to-br from-emerald-500 to-teal-700' },
  { Icon: Plug, bg: 'bg-gradient-to-br from-amber-500 to-orange-700' },
  { Icon: Boxes, bg: 'bg-gradient-to-br from-rose-500 to-pink-700' },
  { Icon: Radar, bg: 'bg-gradient-to-br from-cyan-500 to-blue-700' },
];

function markFor(id: string): MarkTone {
  if (MARK_BY_ID[id]) return MARK_BY_ID[id]!;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % FALLBACK_TONES.length;
  return FALLBACK_TONES[h]!;
}

const TOGGLE_KEY = 'NOVA:home-control-toggles-v1';

function readToggles(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(TOGGLE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, boolean> : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeToggles(map: Record<string, boolean>) {
  try {
    localStorage.setItem(TOGGLE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

/**
 * Seed helper toggles On once per home (install / first launch).
 * Used so Code-header helpers stay On without cluttering the Code pill.
 */
export function ensureHomeControlDefaultsOn(home: MissingHome): void {
  const bootKey = `NOVA:suite-default-on-v2:${home}`;
  try {
    if (localStorage.getItem(bootKey) === '1') return;
    const items = MISSING_ITEMS.filter((i) => i.eventualHome === home);
    if (!items.length) return;
    const next = { ...readToggles() };
    for (const item of items) {
      if (readBoundValue(item.id) !== null) continue;
      next[item.id] = true;
    }
    writeToggles(next);
    localStorage.setItem(bootKey, '1');
  } catch { /* ignore */ }
}

/** Prefer real prefs when a control already has a home in LocalPrefs. */
function readBoundValue(id: string): boolean | null {
  const p = getLocalPrefs();
  switch (id) {
    case 'yolo-autorun':
      return p.approvalPolicy === 'never' || p.approvalPolicy === 'auto';
    case 'terminal-policy':
      return p.approvalPolicy === 'on-request';
    case 'sandbox-profile':
      return p.sandboxMode === 'workspace-write' || p.sandboxMode === 'full-access';
    case 'network-allowlist':
      return p.networkDenyByDefault;
    case 'privacy-mode-cloud':
      return p.aiMode === 'local_only';
    case 'airgap-mode':
      return p.aiMode === 'local_only' && p.networkDenyByDefault;
    case 'analytics-panel':
      return p.shareUsageStats;
    case 'secret-redaction':
      return Boolean(p.sandboxAgent);
    default:
      return null;
  }
}

function writeBoundValue(id: string, on: boolean) {
  switch (id) {
    case 'yolo-autorun':
      setLocalPrefs({ approvalPolicy: on ? 'auto' : 'on-request' });
      break;
    case 'terminal-policy':
      setLocalPrefs({ approvalPolicy: on ? 'on-request' : 'never' });
      break;
    case 'sandbox-profile':
      setLocalPrefs({ sandboxMode: on ? 'workspace-write' : 'read-only' });
      break;
    case 'network-allowlist':
      setLocalPrefs({ networkDenyByDefault: on });
      break;
    case 'privacy-mode-cloud':
      setLocalPrefs({ aiMode: on ? 'local_only' : 'automatic' });
      break;
    case 'airgap-mode':
      setLocalPrefs({
        aiMode: on ? 'local_only' : 'automatic',
        networkDenyByDefault: on,
      });
      break;
    case 'analytics-panel':
      setLocalPrefs({ shareUsageStats: on });
      break;
    case 'secret-redaction':
      setLocalPrefs({ sandboxAgent: on });
      break;
    default:
      break;
  }
}

function itemIsOn(
  item: MissingItem,
  toggles: Record<string, boolean>,
  defaultOn = false,
): boolean {
  const bound = readBoundValue(item.id);
  if (bound !== null) return bound;
  if (Object.prototype.hasOwnProperty.call(toggles, item.id)) return Boolean(toggles[item.id]);
  return defaultOn;
}

function suiteOnCount(
  suite: BuiltSuite,
  toggles: Record<string, boolean>,
  defaultOn = false,
): number {
  let n = 0;
  for (const item of suite.items) {
    if (itemIsOn(item, toggles, defaultOn)) n += 1;
  }
  return n;
}

export function HomeControlsPanel({
  home,
  title,
  blurb,
  compact = false,
  markPlacedOnMount = true,
  /**
   * Side-by-side suite boxes: similar helpers are combined into one master
   * switch (flip On → every member turns On). Used by Agents / Integrations / Automations.
   */
  peerBoxes = false,
  /** Suite pages: helpers start On until the user turns a suite Off. */
  defaultOn = false,
}: {
  home: MissingHome;
  title?: string;
  blurb?: string;
  compact?: boolean;
  /** When true, mark these catalog rows Placed so Missing items count drops. */
  markPlacedOnMount?: boolean;
  peerBoxes?: boolean;
  defaultOn?: boolean;
}) {
  const items = useMemo(
    () => MISSING_ITEMS.filter((i) => i.eventualHome === home),
    [home],
  );
  const [toggles, setToggles] = useState(() => readToggles());
  const [openSuites, setOpenSuites] = useState<Record<string, boolean>>({});

  const suites = useMemo(
    () => (peerBoxes ? buildControlSuites(home, items) : null),
    [peerBoxes, home, items],
  );

  useEffect(() => {
    if (!markPlacedOnMount || !items.length) return;
    const placed = loadMissingPlaced();
    let dirty = false;
    for (const item of items) {
      if (!placed.has(item.id)) {
        placed.add(item.id);
        dirty = true;
      }
    }
    if (dirty) saveMissingPlaced(placed);
  }, [items, markPlacedOnMount]);

  // One-shot: mark suite helpers On in toggle storage (does NOT force Settings prefs
  // like air-gap / local_only — those stay bound to the user's real AI mode).
  useEffect(() => {
    if (!defaultOn || !items.length) return;
    const bootKey = `NOVA:suite-default-on-v2:${home}`;
    try {
      if (localStorage.getItem(bootKey) === '1') return;
      const next = { ...readToggles() };
      for (const item of items) {
        // Skip prefs-backed ids so we never silently flip local_only / sandbox / etc.
        if (readBoundValue(item.id) !== null) continue;
        next[item.id] = true;
      }
      writeToggles(next);
      setToggles(next);
      localStorage.setItem(bootKey, '1');
    } catch { /* ignore */ }
  }, [defaultOn, home, items]);

  if (!items.length) return null;

  const setOn = (item: MissingItem, on: boolean) => {
    writeBoundValue(item.id, on);
    const next = { ...toggles, [item.id]: on };
    setToggles(next);
    writeToggles(next);
  };

  const setSuiteOn = (suite: BuiltSuite, on: boolean) => {
    const next = { ...toggles };
    for (const item of suite.items) {
      writeBoundValue(item.id, on);
      next[item.id] = on;
    }
    setToggles(next);
    writeToggles(next);
  };

  const anyOn = items.some((item) => itemIsOn(item, toggles, defaultOn));
  const criticalOff = items.filter((item) => {
    if (!item.critical) return false;
    return !itemIsOn(item, toggles, defaultOn);
  });

  const renderRow = (item: MissingItem) => {
    const on = itemIsOn(item, toggles, defaultOn);
    const mark = markFor(item.id);
    const MarkIcon = mark.Icon;
    if (compact) {
      return (
        <li
          key={item.id}
          className="flex items-center gap-3 rounded-xl border border-surface-border px-3 py-2.5"
        >
          <span
            className={`w-8 h-8 rounded-lg ${mark.bg} text-white flex items-center justify-center shrink-0 shadow-sm ring-1 ring-black/20`}
            aria-hidden
          >
            <MarkIcon className="w-4 h-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-content-primary leading-snug">{item.title}</p>
            <p className="mt-0.5 text-[11px] text-content-tertiary leading-snug line-clamp-2">{item.why}</p>
          </div>
          <ToggleSwitch on={on} onChange={(v) => setOn(item, v)} label={item.title} />
        </li>
      );
    }
    return (
      <li key={item.id}>
        <div
          className={`h-full rounded-xl border px-3 py-3 transition-colors ${
            on
              ? 'border-sky-500/35 bg-sky-500/5 hover:bg-sky-500/10'
              : 'border-surface-border hover:bg-surface-hover/70'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-9 h-9 rounded-xl ${mark.bg} text-white flex items-center justify-center shrink-0 shadow-sm ring-1 ring-black/20 border border-white/10`}
              aria-hidden
            >
              <MarkIcon className="w-[18px] h-[18px]" strokeWidth={2.25} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-content-primary truncate">{item.title}</span>
              <span className="block text-[11px] truncate mt-0.5">
                <span className={on ? 'text-emerald-400 font-medium' : 'text-content-tertiary'}>
                  {on ? 'On' : 'Off'}
                </span>
                <span className="text-content-tertiary">
                  {' · '}
                  {item.why}
                </span>
              </span>
            </span>
            <ToggleSwitch on={on} onChange={(v) => setOn(item, v)} label={item.title} />
          </div>
        </div>
      </li>
    );
  };

  return (
    <section className={compact ? 'space-y-2' : 'mb-8'}>
      {title ? (
        <div className="min-w-0 mb-3">
          <h2 className={`font-semibold text-content-primary ${compact ? 'text-sm' : 'text-base'}`}>
            {title}
          </h2>
          {blurb ? (
            <p className={`mt-1 text-content-tertiary leading-relaxed ${compact ? 'text-[12px]' : 'text-sm'}`}>
              {blurb}
            </p>
          ) : null}
        </div>
      ) : null}
      {!peerBoxes && !anyOn ? (
        <div
          className={`rounded-xl border border-amber-500/35 bg-amber-500/10 text-content-primary ${
            compact ? 'px-3 py-2 mb-2 text-[12px]' : 'px-3.5 py-3 mb-3 text-sm'
          }`}
          role="status"
        >
          <p className="font-medium leading-snug">Turn a switch on to use these helpers</p>
          <p className={`mt-1 text-content-secondary leading-relaxed ${compact ? 'text-[11px]' : 'text-[12px]'}`}>
            Everything here starts Off so invent stays quiet. Flip On only for what you want on this PC —
            invent and chat still work with all switches Off.
          </p>
        </div>
      ) : criticalOff.length > 0 && !compact && !peerBoxes ? (
        <div
          className="rounded-xl border border-sky-500/30 bg-sky-500/8 px-3.5 py-2.5 mb-3 text-[12px] text-content-secondary leading-relaxed"
          role="status"
        >
          Recommended on: {criticalOff.slice(0, 3).map((i) => i.title).join(' · ')}
          {criticalOff.length > 3 ? ` (+${criticalOff.length - 3} more)` : ''}.
        </div>
      ) : null}

      {suites ? (
        <div className="flex flex-col gap-2.5 w-full">
          {suites.map((suite) => {
            const total = suite.items.length;
            const onCount = suiteOnCount(suite, toggles, defaultOn);
            const allOn = total > 0 && onCount === total;
            const mixed = onCount > 0 && !allOn;
            const open = Boolean(openSuites[suite.meta.id]);
            const details = open ? suiteDetailRows(suite, toggles, defaultOn) : [];
            return (
              <div
                key={suite.meta.id}
                className="group rounded-xl border border-surface-border bg-transparent p-4 flex flex-col min-h-0 w-full transition-colors duration-150 hover:border-white/30"
                data-nova-control-suite={suite.meta.id}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenSuites((prev) => ({
                        ...prev,
                        [suite.meta.id]: !prev[suite.meta.id],
                      }))
                    }
                    className="min-w-0 flex-1 text-left bg-transparent p-0 border-0 shadow-none"
                    aria-expanded={open}
                    aria-controls={`suite-detail-${suite.meta.id}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 text-content-tertiary transition-transform ${
                          open ? 'rotate-0' : '-rotate-90'
                        }`}
                        aria-hidden
                      />
                      <h3 className="text-[15px] font-semibold text-content-primary tracking-tight">
                        {suite.meta.label}
                      </h3>
                    </span>
                    <p className="mt-2 text-[13px] text-content-secondary leading-relaxed pl-6">
                      {suite.meta.hint}
                    </p>
                    <p className="mt-2 text-[12px] tabular-nums text-content-tertiary pl-6">
                      <span
                        className={
                          allOn
                            ? 'text-emerald-400 font-medium'
                            : mixed
                              ? 'text-amber-300 font-medium'
                              : undefined
                        }
                      >
                        {allOn ? 'On' : mixed ? 'Mixed' : 'Off'}
                      </span>
                      {` · ${onCount}/${total} active`}
                      <span className="text-content-tertiary/80">
                        {open ? ' · hide list' : ' · show what’s inside'}
                      </span>
                    </p>
                  </button>
                  <ToggleSwitch
                    on={allOn}
                    onChange={(v) => setSuiteOn(suite, v)}
                    label={`${suite.meta.label} suite (${total} helpers)`}
                  />
                </div>
                {open ? (
                  <ul
                    id={`suite-detail-${suite.meta.id}`}
                    className="mt-3.5 pt-3 border-t border-surface-border space-y-2.5 max-h-[min(28rem,55vh)] overflow-y-auto overscroll-contain"
                  >
                    {details.map((row) => (
                      <li
                        key={row.key}
                        className="flex items-start gap-2.5 px-0 py-1 bg-transparent"
                      >
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${
                            row.on ? 'bg-emerald-400' : 'bg-white/25'
                          }`}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium text-content-primary leading-snug">
                            {row.title}
                            {row.count > 1 ? (
                              <span className="ml-1.5 text-[11px] font-normal text-content-tertiary">
                                ×{row.count}
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-[12px] text-content-tertiary leading-relaxed mt-1">
                            <span className={row.on ? 'text-emerald-400 font-medium' : undefined}>
                              {row.on ? 'Active' : 'Off'}
                            </span>
                            {row.why ? ` · ${displayHelperTitle(row.why)}` : ''}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <ul
          className={
            compact
              ? 'space-y-1.5'
              : 'grid grid-cols-1 sm:grid-cols-2 gap-2'
          }
        >
          {items.map((item) => renderRow(item))}
        </ul>
      )}
    </section>
  );
}

/** Matches Settings toggles — flex-centered thumb (no absolute bottom-touch). */
function ToggleSwitch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-[22px] w-10 shrink-0 items-center rounded-full px-0.5 transition-colors ${
        on ? 'bg-sky-500' : 'bg-white/15'
      }`}
      title={on ? 'On' : 'Off'}
    >
      <span
        className={`pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-150 ${
          on ? 'translate-x-[18px]' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

/** Compact collapsible dock for Chat / Live / Code chrome. */
export function HomeControlsDock({
  home,
  label,
}: {
  home: MissingHome;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const count = useMemo(
    () => MISSING_ITEMS.filter((i) => i.eventualHome === home).length,
    [home],
  );
  if (!count) return null;
  return (
    <div className="rounded-xl border border-surface-border/60 bg-surface-hover/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-hover/30"
      >
        <span className="text-[12px] font-medium text-content-secondary">{label}</span>
        <span className="text-[10px] tabular-nums text-content-tertiary">
          {count} · {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open ? (
        <div className="px-2 pb-2 max-h-64 overflow-y-auto overscroll-contain">
          <HomeControlsPanel home={home} compact markPlacedOnMount />
        </div>
      ) : null}
    </div>
  );
}

/** One collapsed row for several homes (keeps chat composer short). */
export function HomeControlsDockGroup({
  label,
  homes,
}: {
  label: string;
  homes: Array<{ home: MissingHome; title: string }>;
}) {
  const [open, setOpen] = useState(false);
  const count = useMemo(
    () => homes.reduce((n, h) => n + MISSING_ITEMS.filter((i) => i.eventualHome === h.home).length, 0),
    [homes],
  );
  if (!count) return null;
  return (
    <div className="rounded-xl border border-surface-border/60 bg-surface-hover/15 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-surface-hover/30"
      >
        <span className="text-[12px] font-medium text-content-secondary">{label}</span>
        <span className="text-[10px] tabular-nums text-content-tertiary">
          {count} · {open ? 'Hide' : 'Show'}
        </span>
      </button>
      {open ? (
        <div className="px-2 pb-2 max-h-72 overflow-y-auto overscroll-contain space-y-4">
          {homes.map((h) => (
            <HomeControlsPanel
              key={h.home}
              home={h.home}
              title={h.title}
              compact
              markPlacedOnMount
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
