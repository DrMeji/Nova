/**
 * ARK's own projects folder (Documents\ARK Projects preferred).
 * Used by create flow + Projects view listing.
 */

function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

export async function resolveArkProjectsHomes(): Promise<Array<{ label: string; path: string }>> {
  const out: Array<{ label: string; path: string }> = [];
  const roots = await window.arkDesktop?.browseRoots?.();
  const desktop = roots?.roots?.find(r => r.id === 'desktop')?.path;
  const documents = roots?.roots?.find(r => r.id === 'documents')?.path;

  if (documents) {
    out.push({ label: 'Documents\\ARK Projects', path: joinPath(documents, 'ARK Projects') });
  }
  if (desktop) {
    out.push({ label: 'Desktop\\ARK Projects', path: joinPath(desktop, 'ARK Projects') });
  }

  const sandbox = await window.arkDesktop?.workspaceSandboxRoot?.();
  if (sandbox?.ok && sandbox.path) {
    out.push({ label: 'ARK storage', path: sandbox.path });
  }

  return out;
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
