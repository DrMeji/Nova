/**
 * NOVA projects folders (Documents\NOVA Projects preferred; still lists legacy ARK Projects).
 * Used by create flow + Projects view listing.
 */

/** Internal sandbox dirs — never show these as user projects. */
const RESERVED_PROJECT_DIR_NAMES = new Set(['code', 'uploads', '.ark', 'node_modules']);

function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

export async function resolveArkProjectsHomes(): Promise<Array<{ label: string; path: string }>> {
  const out: Array<{ label: string; path: string }> = [];
  const seen = new Set<string>();
  const roots = await window.arkDesktop?.browseRoots?.();
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
    push('Documents\\ARK Projects', joinPath(documents, 'ARK Projects'));
  }
  if (desktop) {
    push('Desktop\\NOVA Projects', joinPath(desktop, 'NOVA Projects'));
    push('Desktop\\ARK Projects', joinPath(desktop, 'ARK Projects'));
  }

  return out;
}

/** Preferred root for new projects (create NOVA Projects; legacy ARK still listed). */
export async function preferredArkProjectsHome(): Promise<{ label: string; path: string } | null> {
  const homes = await resolveArkProjectsHomes();
  return homes.find((h) => /NOVA Projects$/i.test(h.path)) || homes[0] || null;
}

export async function listArkProjectFolders(): Promise<Array<{
  id: string;
  name: string;
  path: string;
  sourceLabel: string;
  modified: Date;
}>> {
  const homes = await resolveArkProjectsHomes();
  const seen = new Set<string>();
  const rows: Array<{
    id: string;
    name: string;
    path: string;
    sourceLabel: string;
    modified: Date;
  }> = [];

  for (const home of homes) {
    await window.arkDesktop?.workspaceMkdir?.({ targetPath: home.path }).catch(() => undefined);
    const listed = await window.arkDesktop?.listDir?.(home.path);
    if (!listed?.ok || !listed.items?.length) continue;
    for (const item of listed.items) {
      if (item.kind !== 'dir') continue;
      if (RESERVED_PROJECT_DIR_NAMES.has(String(item.name || '').toLowerCase())) continue;
      const key = item.path.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        id: `ark-folder:${item.path}`,
        name: item.name,
        path: item.path,
        sourceLabel: home.label,
        modified: new Date(),
      });
    }
  }

  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
