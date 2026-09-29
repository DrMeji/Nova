import { useMemo, useState } from 'react';
import type { ClinicFinding, ClinicReport, ClinicSeverity } from '@/lib/debugClinic';

const SEV_LABEL: Record<ClinicSeverity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const SEV_TEXT: Record<ClinicSeverity, string> = {
  critical: 'text-rose-300',
  high: 'text-amber-300',
  medium: 'text-sky-300',
  low: 'text-content-secondary',
};

const SEV_TAB_ACTIVE: Record<ClinicSeverity, string> = {
  critical: 'text-rose-200 after:bg-rose-400',
  high: 'text-amber-200 after:bg-amber-400',
  medium: 'text-sky-200 after:bg-sky-400',
  low: 'text-content-primary after:bg-content-tertiary',
};

const CAT_LABEL: Record<string, string> = {
  crash: 'Crash risk',
  security: 'Security',
  'broken-UI': 'Broken UI',
  incomplete: 'Incomplete',
  config: 'Config',
  quality: 'Quality',
};

const CAT_ORDER = ['security', 'crash', 'broken-UI', 'incomplete', 'config', 'quality'] as const;

const ORDER: ClinicSeverity[] = ['critical', 'high', 'medium', 'low'];

function RepairButton({
  findingId,
  onRepair,
}: {
  findingId: string;
  onRepair?: (findingId: string) => void;
}) {
  if (!onRepair) return null;
  return (
    <button
      type="button"
      className="shrink-0 inline-flex items-center rounded-md border border-violet-400/40 bg-violet-500/10 px-2.5 py-1 text-[11px] font-medium text-violet-100 hover:bg-violet-500/20 hover:border-violet-300/60 transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        onRepair(findingId);
      }}
      aria-label={`Repair ${findingId}`}
      title={`Repair ${findingId}`}
    >
      Repair
    </button>
  );
}

/** Compact row — expand for evidence + how to fix. */
function FindingRow({
  finding,
  onRepair,
}: {
  finding: ClinicFinding;
  onRepair?: (findingId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group">
      <button
        type="button"
        className="w-full text-left px-3.5 py-2.5 flex items-start gap-2.5 hover:bg-white/[0.035] transition-colors"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${finding.id}: ${finding.problem}`}
      >
        <span
          className={`mt-[3px] shrink-0 text-[9px] text-content-tertiary/80 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          aria-hidden
        >
          ▸
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-[13px] text-content-primary leading-snug font-medium">
              {finding.problem}
            </p>
            <span className="shrink-0 font-mono text-[10px] text-content-tertiary/80 tabular-nums pt-0.5">
              {finding.id}
            </span>
          </div>
          <div className="text-[11px] font-mono text-content-tertiary truncate">
            {finding.path}{finding.line ? `:${finding.line}` : ''}
          </div>
        </div>
        <div className="shrink-0 pt-0.5" onClick={(e) => e.stopPropagation()}>
          <RepairButton findingId={finding.id} onRepair={onRepair} />
        </div>
      </button>
      {open ? (
        <div className="px-3.5 pb-3 pl-9 space-y-2">
          {finding.evidence ? (
            <pre className="max-h-24 overflow-auto rounded-md bg-black/40 px-2.5 py-2 text-[11px] leading-relaxed text-content-secondary whitespace-pre-wrap">
              {finding.evidence}
            </pre>
          ) : null}
          <div className="rounded-md bg-emerald-950/45 px-3 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-emerald-200/70 mb-1">
              How to fix
            </div>
            <p className="text-sm text-content-primary leading-snug">{finding.fix}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CategoryBlock({
  category,
  items,
  onRepair,
}: {
  category: string;
  items: ClinicFinding[];
  onRepair?: (findingId: string) => void;
}) {
  const label = CAT_LABEL[category] || category;
  return (
    <div className="pt-1 first:pt-0">
      <div className="sticky top-0 z-[1] flex items-baseline gap-2 px-3.5 py-2 bg-zinc-950/90 backdrop-blur-sm">
        <span className="text-[10px] font-semibold text-content-tertiary uppercase tracking-[0.12em]">
          {label}
        </span>
        <span className="text-[10px] text-content-tertiary/70 tabular-nums">{items.length}</span>
      </div>
      <div className="divide-y divide-white/[0.04]">
        {items.map((f) => (
          <FindingRow key={f.id} finding={f} onRepair={onRepair} />
        ))}
      </div>
    </div>
  );
}

function groupByCategory(items: ClinicFinding[]): Array<{ category: string; items: ClinicFinding[] }> {
  const map = new Map<string, ClinicFinding[]>();
  for (const f of items) {
    const key = f.category || 'quality';
    const list = map.get(key);
    if (list) list.push(f);
    else map.set(key, [f]);
  }
  const keys = [...map.keys()].sort((a, b) => {
    const ia = CAT_ORDER.indexOf(a as typeof CAT_ORDER[number]);
    const ib = CAT_ORDER.indexOf(b as typeof CAT_ORDER[number]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  return keys.map((category) => ({ category, items: map.get(category)! }));
}

export function DebugClinicReport({
  report,
  onRepair,
  onRepairAll,
}: {
  report: ClinicReport;
  onRepair?: (findingId: string) => void;
  onRepairAll?: () => void;
}) {
  const { counts, findings, inventory, brief } = report;
  const layers = useMemo(
    () => ORDER
      .map((sev) => ({
        sev,
        items: findings.filter((f) => f.severity === sev),
      }))
      .filter((layer) => layer.items.length > 0),
    [findings],
  );
  const defaultSev = layers[0]?.sev ?? 'critical';
  const [activeSev, setActiveSev] = useState<ClinicSeverity>(defaultSev);
  const selectedSev = layers.some((l) => l.sev === activeSev) ? activeSev : defaultSev;
  const activeLayer = layers.find((l) => l.sev === selectedSev);
  const groups = useMemo(
    () => (activeLayer ? groupByCategory(activeLayer.items) : []),
    [activeLayer],
  );

  const totalProblems = findings.length
    || (counts.critical + counts.high + counts.medium + counts.low);
  const top = findings[0];
  const canRepairAll = Boolean(onRepairAll && findings.length > 0);

  return (
    <div className="my-1 w-full max-w-full">
      <header className="pb-3 space-y-2">
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-content-tertiary">
          Debug clinic
        </div>
        <h3 className="text-[15px] font-semibold text-content-primary leading-snug">
          {report.projectName}
        </h3>
        {brief?.overview ? (
          <p className="text-sm text-content-primary leading-relaxed">
            {brief.overview}
          </p>
        ) : null}
        {brief?.verdict ? (
          <p className="text-sm text-content-secondary leading-relaxed">
            {brief.verdict}
          </p>
        ) : (
          <p className="text-sm text-content-secondary leading-relaxed">
            Reviewed {report.fileCount} files
            {inventory.stack ? ` · ${inventory.stack}` : ''}
            {inventory.entrypoints[0] ? ` · ${inventory.entrypoints[0]}` : ''}.
          </p>
        )}
        <p className="text-xs text-content-tertiary">
          {inventory.stack}
          {inventory.entrypoints[0] ? ` · ${inventory.entrypoints[0]}` : ''}
          {report.scannedCount ? ` · reviewed ${Math.min(report.scannedCount, report.fileCount)} files` : ''}
        </p>
        {(totalProblems > 0 || canRepairAll) ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
            {ORDER.filter((sev) => counts[sev] > 0).map((sev) => (
              <span
                key={sev}
                className={`inline-flex items-center gap-1 text-[11px] ${SEV_TEXT[sev]}`}
              >
                <span className="font-semibold tabular-nums">{counts[sev]}</span>
                <span>{SEV_LABEL[sev]}</span>
              </span>
            ))}
            {totalProblems > 0 ? (
              <span
                className="inline-flex items-center gap-1 text-[11px] text-violet-300"
                title="Total problems found"
              >
                <span className="font-semibold tabular-nums">{totalProblems}</span>
                <span>{totalProblems === 1 ? 'problem' : 'problems'}</span>
              </span>
            ) : null}
            {canRepairAll ? (
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-violet-400/55 bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-violet-100 hover:bg-violet-500/25 hover:border-violet-300/70 transition-colors"
                onClick={() => onRepairAll?.()}
                aria-label="Repair all findings"
                title="Repair all findings"
              >
                Repair all
              </button>
            ) : null}
          </div>
        ) : null}
      </header>

      {layers.length ? (
        <div className="w-full rounded-xl border border-white/[0.08] bg-zinc-950/80 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] overflow-hidden">
          <div
            className="flex items-stretch gap-0.5 px-2 pt-1.5 bg-white/[0.02]"
            role="tablist"
            aria-label="Issue severity"
          >
            {layers.map(({ sev, items }) => {
              const active = sev === selectedSev;
              return (
                <button
                  key={sev}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={[
                    'relative shrink-0 px-3 py-2 text-[12px] font-medium transition-colors rounded-t-md',
                    'after:absolute after:left-2 after:right-2 after:bottom-0 after:h-[2px] after:rounded-full after:content-[""]',
                    active
                      ? `${SEV_TAB_ACTIVE[sev]} bg-white/[0.03]`
                      : 'text-content-tertiary after:bg-transparent hover:text-content-secondary hover:bg-white/[0.02]',
                  ].join(' ')}
                  onClick={() => setActiveSev(sev)}
                >
                  {SEV_LABEL[sev]}
                  <span className={`ml-1.5 tabular-nums ${active ? 'opacity-90' : 'opacity-55'}`}>
                    {items.length}
                  </span>
                </button>
              );
            })}
          </div>

          <div
            role="tabpanel"
            aria-label={`${SEV_LABEL[selectedSev]} issues`}
            className="max-h-[min(52vh,420px)] overflow-y-auto overscroll-contain border-t border-white/[0.05]"
          >
            {groups.map(({ category, items }) => (
              <CategoryBlock
                key={`${selectedSev}-${category}`}
                category={category}
                items={items}
                onRepair={onRepair}
              />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-sm text-content-secondary leading-relaxed">
          No issues found.
        </p>
      )}

      {top ? (
        <footer className="mt-3 pt-2.5 text-xs text-content-secondary">
          Top issue is <span className="font-medium text-content-primary">{top.id}</span>
          {' '}({SEV_LABEL[top.severity].toLowerCase()}). Open a row for the fix, press{' '}
          <span className="font-medium text-content-primary">Repair</span>
          {canRepairAll ? ', or ' : null}
          {canRepairAll ? <span className="font-medium text-content-primary">Repair all</span> : null}
          {onRepair ? '. Or say ' : '. Say '}
          <span className="font-medium text-content-primary">fix {top.id}</span>
          {' when you want Nova to start.'}
        </footer>
      ) : null}
    </div>
  );
}
