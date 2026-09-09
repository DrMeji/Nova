import type { CatalogItem, CatalogProject, FolderCatalogData } from '@/lib/folderCatalog';
import { Folder, FolderOpen } from 'lucide-react';

function TagRow({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="text-[10px] uppercase tracking-wide text-content-tertiary/90 shrink-0 mr-0.5">
        {label}
      </span>
      {items.map(item => (
        <span
          key={`${label}-${item}`}
          className="inline-flex rounded-md border border-surface-border/80 bg-black/20 px-1.5 py-0.5 text-[10px] font-mono text-content-secondary"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function ProjectRow({ index, project }: { index: number; project: CatalogProject }) {
  return (
    <div className="rounded-xl border border-surface-border/70 bg-surface-hover/30 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-violet-500/15 text-[10px] font-semibold text-violet-200/95">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-content-primary leading-snug">{project.name}</p>
          {project.description ? (
            <p className="mt-0.5 text-[12px] leading-snug text-content-secondary">{project.description}</p>
          ) : null}
          <TagRow label="Folders" items={project.folders} />
          <TagRow label="Key files" items={project.keyFiles} />
        </div>
      </div>
    </div>
  );
}

function ItemTable({ title, items }: { title: string; items: CatalogItem[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-content-tertiary">{title}</p>
      <div className="overflow-hidden rounded-xl border border-surface-border/70">
        <table className="w-full text-left text-[11px]">
          <thead>
            <tr className="border-b border-surface-border/70 bg-surface-hover/40">
              <th className="px-3 py-2 font-medium text-content-tertiary">Item</th>
              <th className="px-3 py-2 font-medium text-content-tertiary">Type</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.name} className="border-b border-surface-border/40 last:border-0">
                <td className="px-3 py-1.5 font-mono text-content-secondary">{item.name}</td>
                <td className="px-3 py-1.5 text-content-tertiary capitalize">
                  {item.kind === 'folder' ? 'Folder' : item.kind === 'shortcut' ? 'Shortcut' : 'File'}
                  {item.detail ? ` · ${item.detail}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function FolderCatalogCard({ data }: { data: FolderCatalogData }) {
  const intro = data.desktopPath
    ? (
      <>
        On your Desktop at{' '}
        <code className="rounded-md bg-black/30 px-1.5 py-0.5 text-[11px] text-sky-200/90">{data.desktopPath}</code>
        , there is a folder called <strong className="text-content-primary">{data.folderName}</strong>.
        {' '}Here is exactly what is inside it.
      </>
    )
    : (
      <>
        Folder <strong className="text-content-primary">{data.folderName}</strong> at{' '}
        <code className="rounded-md bg-black/30 px-1.5 py-0.5 text-[11px] text-sky-200/90">{data.folderPath}</code>.
      </>
    );

  return (
    <div className="max-w-none space-y-3 text-[13px] leading-relaxed">
      <div className="flex items-start gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2.5">
        <FolderOpen className="mt-0.5 h-4 w-4 shrink-0 text-sky-300/80" aria-hidden />
        <p className="text-[12px] text-content-secondary leading-snug">{intro}</p>
      </div>

      {data.projects.length ? (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-content-tertiary">
            <Folder className="h-3.5 w-3.5" aria-hidden />
            Top level · {data.projects.length} project folder{data.projects.length === 1 ? '' : 's'}
          </p>
          <div className="space-y-2">
            {data.projects.map((p, i) => (
              <ProjectRow key={p.name} index={i + 1} project={p} />
            ))}
          </div>
        </div>
      ) : null}

      ) : null}

      <ItemTable title="Files at this level" items={data.rootFiles} />

      {data.desktopSiblings.length ? (
        <ItemTable
          title={`Also on your Desktop (outside ${data.folderName})`}
          items={data.desktopSiblings}
        />
      ) : null}
    </div>
  );
}
