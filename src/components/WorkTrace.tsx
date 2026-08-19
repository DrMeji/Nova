import {
  CheckCircle2, Circle, FileSearch, FolderOpen, Lightbulb, Loader2, Pencil, Terminal,
} from 'lucide-react';

export type WorkTraceKind = 'think' | 'scan' | 'read' | 'run' | 'write';

export type WorkTraceItem = {
  id: string;
  kind: WorkTraceKind;
  label: string;
  status: 'pending' | 'active' | 'done';
};

const KIND_ICON: Record<WorkTraceKind, typeof Lightbulb> = {
  think: Lightbulb,
  scan: FileSearch,
  read: FolderOpen,
  run: Terminal,
  write: Pencil,
};

export function buildInspectTrace(
  step: 'understand' | 'plan' | 'generate' | 'apply' | 'done',
  files: string[],
  focusFile?: string,
): WorkTraceItem[] {
  const fileLabel = focusFile || (files.length ? files.slice(0, 3).join(' · ') : '');
  const items: Omit<WorkTraceItem, 'status'>[] = [
    { id: 'open', kind: 'think', label: 'Opening project' },
    { id: 'scan', kind: 'scan', label: 'Scanning project files' },
  ];
  if (fileLabel) {
    items.push({ id: 'read', kind: 'read', label: `Reading ${fileLabel}` });
  }
  items.push(
    { id: 'review', kind: 'think', label: 'Reviewing code' },
    { id: 'report', kind: 'write', label: 'Writing findings' },
  );

  const order = ['open', 'scan', 'read', 'review', 'report'];
  const activeId = step === 'understand' ? 'open'
    : step === 'plan' ? 'scan'
      : step === 'generate' ? (fileLabel ? 'review' : 'review')
        : step === 'apply' ? 'report'
          : 'report';
  const activeIdx = order.indexOf(activeId);

  return items.map(item => {
    const idx = order.indexOf(item.id);
    if (step === 'done') return { ...item, status: 'done' as const };
    if (idx < activeIdx) return { ...item, status: 'done' as const };
    if (idx === activeIdx) return { ...item, status: 'active' as const };
    return { ...item, status: 'pending' as const };
  });
}

export function buildCodeTrace(
  step: 'understand' | 'plan' | 'generate' | 'apply' | 'done',
  files: string[],
  focusFile?: string,
  kind: 'build' | 'fix' = 'build',
): WorkTraceItem[] {
  const fileLabel = focusFile || (files.length ? files.slice(0, 3).join(' · ') : '');
  const items: Omit<WorkTraceItem, 'status'>[] = [
    { id: 'open', kind: 'think', label: 'Understanding your request' },
    { id: 'plan', kind: 'scan', label: kind === 'fix' ? 'Finding what to change' : 'Planning files' },
    { id: 'write', kind: 'run', label: kind === 'fix' ? 'Editing code' : 'Writing code' },
  ];
  if (fileLabel) {
    items.push({ id: 'save', kind: 'write', label: `Saving ${fileLabel}` });
  } else {
    items.push({ id: 'save', kind: 'write', label: 'Saving to project' });
  }

  const order = items.map(i => i.id);
  const activeId = step === 'understand' ? 'open'
    : step === 'plan' ? 'plan'
      : step === 'generate' ? 'write'
        : step === 'apply' ? 'save'
          : 'save';
  const activeIdx = order.indexOf(activeId);

  return items.map(item => {
    const idx = order.indexOf(item.id);
    if (step === 'done') return { ...item, status: 'done' as const };
    if (idx < activeIdx) return { ...item, status: 'done' as const };
    if (idx === activeIdx) return { ...item, status: 'active' as const };
    return { ...item, status: 'pending' as const };
  });
}

export function WorkTrace({
  items,
  elapsed,
  title,
}: {
  items: WorkTraceItem[];
  elapsed?: string;
  title?: string;
}) {
  return (
    <div className="space-y-2.5 text-xs min-w-[14rem]">
      {title ? (
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-medium text-content-primary">{title}</p>
          {elapsed ? (
            <span className="text-[10px] text-content-tertiary tabular-nums shrink-0 pt-0.5">
              {elapsed}
            </span>
          ) : null}
        </div>
      ) : null}
      <ol className="relative pl-1 space-y-0">
        {items.map((item, i) => {
          const Icon = KIND_ICON[item.kind];
          const isLast = i === items.length - 1;
          const done = item.status === 'done';
          const active = item.status === 'active';
          return (
            <li key={item.id} className="relative flex gap-2.5 pb-2.5 last:pb-0">
              {!isLast ? (
                <span
                  className="absolute left-[11px] top-[22px] bottom-0 w-px bg-surface-border/80"
                  aria-hidden
                />
              ) : null}
              <span className="relative z-[1] mt-0.5 shrink-0">
                {done ? (
                  <CheckCircle2 className="w-[18px] h-[18px] text-emerald-400" />
                ) : active ? (
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-amber-500/15">
                    <Loader2 className="w-3 h-3 text-amber-400 animate-spin" />
                  </span>
                ) : (
                  <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-surface-hover/80">
                    <Icon className="w-3 h-3 text-content-tertiary" />
                  </span>
                )}
              </span>
              <span className={`min-w-0 pt-0.5 leading-snug ${
                active ? 'text-content-primary'
                  : done ? 'text-content-secondary'
                    : 'text-content-tertiary'
              }`}>
                {item.label}
              </span>
            </li>
          );
        })}
      </ol>
      {!title && elapsed ? (
        <p className="text-[11px] text-content-tertiary pt-0.5">Worked for {elapsed}</p>
      ) : null}
    </div>
  );
}
