/**
 * NOVA projects folders (Documents\\NOVA Projects / Desktop\\NOVA Projects only).
 */

/** Internal sandbox dirs — never show these as user projects. */
const RESERVED_PROJECT_DIR_NAMES = new Set(['code', 'uploads', '.nova', '.ark', 'node_modules']);

function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

export async function resolveNovaProjectsHomes(): Promise<Array<{ label: string; path: string }>> {
  const out: Array<{ label: string; path: string }> = [];
  const seen = new Set<string>();
  const roots = await window.novaDesktop?.browseRoots?.();
  const desktop = roots?.roots?.find(r => r.id === 'desktop')?.path;
  const documents = roots?.roots?.find(r => r.id === 'documents')?.path;

  const push = (label: string, folderPath: string) => {
    const key = folderPath.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label, path: folderPath });
  };

  if (documents) {
    push('Documents\\NOVA Projects', joinPath(documents, 'NOVA Projects'));
  }
  if (desktop) {
    push('Desktop\\NOVA Projects', joinPath(desktop, 'NOVA Projects'));
  }

  return out;
}

/** Preferred root for new projects. */
export async function preferredNovaProjectsHome(): Promise<{ label: string; path: string } | null> {
  const homes = await resolveNovaProjectsHomes();
  return homes.find((h) => /NOVA Projects$/i.test(h.path)) || homes[0] || null;
}

export async function listNovaProjectFolders(): Promise<Array<{
  id: string;
  name: string;
  path: string;
  sourceLabel: string;
  modified: Date;
}>> {
  const homes = await resolveNovaProjectsHomes();
  const seen = new Set<string>();
  const rows: Array<{
    id: string;
    name: string;
    path: string;
    sourceLabel: string;
    modified: Date;
  }> = [];

  for (const home of homes) {
    await window.novaDesktop?.workspaceMkdir?.({ targetPath: home.path }).catch(() => undefined);
    const listed = await window.novaDesktop?.listDir?.(home.path);
    if (!listed?.ok || !listed.items?.length) continue;
    for (const item of listed.items) {
      if (item.kind !== 'dir') continue;
      if (RESERVED_PROJECT_DIR_NAMES.has(String(item.name || '').toLowerCase())) continue;
      const key = item.path.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: `nova-folder:${item.path}`,
        name: item.name,
        path: item.path,
        sourceLabel: home.label,
        modified: new Date(),
      });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
