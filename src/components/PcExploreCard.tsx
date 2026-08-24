import type { PcExploreData } from '@/lib/pcExplore';
import { FolderOpen, Gamepad2, LayoutGrid, Monitor, Package } from 'lucide-react';

function ItemTable({ title, path, items }: { title: string; path?: string; items: PcExploreData['sections'][0]['items'] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-content-tertiary">{title}</p>
      {path ? (
        <p className="mb-2 font-mono text-[10px] text-content-tertiary/80 truncate" title={path}>{path}</p>
      ) : null}
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <span
            key={`${title}-${item.name}`}
            className="inline-flex items-center gap-1 rounded-lg border border-surface-border/70 bg-black/25 px-2 py-1 text-[11px] text-content-secondary"
          >
            <span className="text-[9px] uppercase text-content-tertiary">{item.kind === 'folder' ? 'dir' : item.kind.slice(0, 4)}</span>
            {item.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function modeIcon(mode: PcExploreData['mode']) {
  switch (mode) {
    case 'games': return Gamepad2;
    case 'installed_apps': return Package;
    case 'desktop_subfolder': return FolderOpen;
    default: return Monitor;
  }
}

export function PcExploreCard({ data }: { data: PcExploreData }) {
  const Icon = modeIcon(data.mode);
  return (
    <div className="space-y-2 text-[13px] leading-relaxed">
      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300/85" aria-hidden />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-content-primary">{data.headline}</p>
          {data.subtitle ? (
            <p className="text-[11px] text-content-tertiary mt-1 leading-snug">{data.subtitle}</p>
          ) : null}
          {data.limited ? (
            <p className="text-[10px] text-amber-400/90 mt-1 flex items-center gap-1">
              <LayoutGrid className="h-3 w-3 shrink-0" aria-hidden />
              Limited scan. not a full Windows install inventory
            </p>
          ) : null}
        </div>
      </div>
      {data.sections.map(sec => (
        <ItemTable key={sec.title} title={sec.title} path={sec.path} items={sec.items} />
      ))}
      {data.emptyNote ? (
        <p className="text-[12px] text-content-tertiary leading-snug pt-1">{data.emptyNote}</p>
      ) : null}
    </div>
  );
}
