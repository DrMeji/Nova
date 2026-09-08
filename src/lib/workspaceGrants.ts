import { getLocalPrefs, setLocalPrefs, type LocalPrefs } from '@/lib/localPrefs';
import { GRANT_OFF_FOLDER_MSG } from '@/lib/folderPathAsk';

export type WorkspaceGrants = {
  desktop: boolean;
  documents: boolean;
  fullPc: boolean;
  executionMode: LocalPrefs['agentExecutionMode'];
};

/** Last grants pulled from Electron main (survives prefs/localStorage drift). */
let cachedMainGrants: WorkspaceGrants | null = null;

export function grantsFromPrefs(): WorkspaceGrants {
  const p = getLocalPrefs();
  return {
    desktop: Boolean(p.allowDesktopFolderAccess),
    documents: Boolean(p.allowDocumentsFolderAccess),
    fullPc: Boolean(p.allowFullPcAccess),
    executionMode: p.agentExecutionMode || 'allowlist',
  };
}

/** Push Settings grants to the Electron main process (no-op in browser). Also heal prefs from main. */
export async function syncWorkspaceGrantsFromPrefs(): Promise<void> {
  const grants = grantsFromPrefs();
  try {
    await window.arkDesktop?.workspaceSetGrants?.(grants);
  } catch {
    /* ignore */
  }
  try {
    const remote = await window.arkDesktop?.workspaceGetGrants?.();
    if (remote?.ok && remote.grants) {
      cachedMainGrants = {
        desktop: Boolean(remote.grants.desktop),
        documents: Boolean(remote.grants.documents),
        fullPc: Boolean(remote.grants.fullPc),
        executionMode: remote.grants.executionMode || 'allowlist',
      };
      const p = getLocalPrefs();
      const prefsOff = !p.allowDesktopFolderAccess && !p.allowDocumentsFolderAccess && !p.allowFullPcAccess;
      const mainOn = cachedMainGrants.desktop || cachedMainGrants.documents || cachedMainGrants.fullPc;
      // Main process file can be ON while renderer localStorage drifted OFF (common after reinstall/rename).
      if (prefsOff && mainOn) {
        setLocalPrefs({
          allowDesktopFolderAccess: cachedMainGrants.desktop,
          allowDocumentsFolderAccess: cachedMainGrants.documents,
          allowFullPcAccess: cachedMainGrants.fullPc,
          agentExecutionMode: cachedMainGrants.executionMode,
        });
      }
    }
  } catch {
    /* ignore */
  }
}

export function hasFolderAccessGrant(): boolean {
  const g = grantsFromPrefs();
  if (g.desktop || g.documents || g.fullPc) return true;
  if (cachedMainGrants && (cachedMainGrants.desktop || cachedMainGrants.documents || cachedMainGrants.fullPc)) {
    return true;
  }
  return false;
}

function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

function normalizeFolderToken(name: string): string {
  return String(name || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '');
}

function scoreFolderMatch(dirName: string, want: string): number {
  const a = dirName.toLowerCase();
  const b = want.toLowerCase();
  const an = normalizeFolderToken(dirName);
  const bn = normalizeFolderToken(want);
  if (a === b) return 100;
  if (an === bn && an.length >= 2) return 95;
  if (a.includes(b) || b.includes(a)) return 80;
  if (an.includes(bn) || bn.includes(an)) return 70;
  return 0;
}

type DirHit = { name: string; path: string; score: number; nested: boolean };

/** Case-insensitive match; optional shallow nested search (depth 2). */
async function findFolderInRoot(
  rootPath: string,
  wantName: string,
  depth = 0,
  maxDepth = 2,
): Promise<DirHit | null> {
  const listing = await window.arkDesktop?.listDir?.(rootPath);
  if (!listing?.ok) return null;

  const dirs = (listing.items || []).filter(i => i.kind === 'dir' && i.name);
  let best: DirHit | null = null;

  for (const dir of dirs) {
    const score = scoreFolderMatch(dir.name, wantName);
    if (score >= 70) {
      const full = joinPath(rootPath, dir.name);
      // Prefer real project roots (package.json / src) over nested name/name clones.
      let bonus = 0;
      try {
        const probe = await window.arkDesktop?.listDir?.(full);
        if (probe?.ok) {
          const names = new Set((probe.items || []).map(i => String(i.name || '').toLowerCase()));
          if (names.has('package.json') || names.has('src') || names.has('index.html')) bonus += 8;
          // Penalize accidental Project\\Project nests.
          if (names.has(dir.name.toLowerCase()) && !names.has('package.json')) bonus -= 15;
        }
      } catch {
        /* ignore */
      }
      const hit: DirHit = { name: dir.name, path: full, score: score + bonus, nested: depth > 0 };
      // Shallower wins ties. avoid binding Desktop\\Projects\\X\\X.
      if (
        !best
        || hit.score > best.score
        || (hit.score === best.score && depth < (best.nested ? 1 : 0))
        || (hit.score === best.score && !hit.nested && best.nested)
      ) {
        best = hit;
      }
    }
  }

  if (best && best.score >= 95 && !best.nested) return best;

  if (depth >= maxDepth) return best;

  for (const dir of dirs) {
    const nestedRoot = joinPath(rootPath, dir.name);
    const nested = await findFolderInRoot(nestedRoot, wantName, depth + 1, maxDepth);
    if (
      nested
      && (
        !best
        || nested.score > best.score
        || (nested.score === best.score && best.nested && !nested.nested)
      )
    ) {
      best = nested;
    }
  }

  return best;
}

/** Resolve a folder name under Desktop/Documents via listDir (case-insensitive, shallow nested). */
export async function resolveScopedFolderPath(ref: {
  scope: 'desktop' | 'documents' | 'downloads' | 'absolute';
  name: string;
  rawPath?: string;
}): Promise<{ ok: boolean; path?: string; matchedName?: string; nested?: boolean; error?: string }> {
  if (ref.scope === 'absolute' && ref.rawPath) {
    const stat = await window.arkDesktop?.workspaceStatPath?.(ref.rawPath);
    if (stat?.ok && stat.isDirectory && stat.path) {
      return { ok: true, path: stat.path, matchedName: stat.name };
    }
    return { ok: false, error: stat?.error || 'That path is not a folder.' };
  }

  if (!hasFolderAccessGrant()) {
    return { ok: false, error: GRANT_OFF_FOLDER_MSG };
  }

  await syncWorkspaceGrantsFromPrefs();

  const roots = await window.arkDesktop?.browseRoots?.();
  const rootId = ref.scope === 'documents' ? 'documents' : ref.scope === 'downloads' ? 'downloads' : 'desktop';
  const rootPath = roots?.roots?.find(r => r.id === rootId)?.path;
  if (!rootPath) {
    return { ok: false, error: `Could not find your ${rootId} folder on this PC.` };
  }

  const hit = await findFolderInRoot(rootPath, ref.name, 0, 2);
  if (!hit) {
    return {
      ok: false,
      error: `No folder matching “${ref.name}” on your ${rootId}.\n\nCheck the spelling in File Explorer, or use **+ → Open folder** and pick it once.`,
    };
  }

  const stat = await window.arkDesktop?.workspaceStatPath?.(hit.path);
  if (!stat?.ok || !stat.isDirectory || !stat.path) {
    return { ok: false, error: stat?.error || 'Could not open that folder.' };
  }

  return {
    ok: true,
    path: stat.path,
    matchedName: hit.name,
    nested: hit.nested,
  };
}

/** Find a project folder on Desktop (nested ok) or inside a known parent path. */
export async function resolveWorkFolderPath(
  wantName: string,
  parentPath?: string | null,
): Promise<{ ok: boolean; path?: string; matchedName?: string; nested?: boolean; error?: string }> {
  if (!hasFolderAccessGrant()) {
    return { ok: false, error: GRANT_OFF_FOLDER_MSG };
  }

  await syncWorkspaceGrantsFromPrefs();

  // Prefer Desktop\Projects\<Name> when it exists. avoids nested Name\Name clones.
  const roots = await window.arkDesktop?.browseRoots?.();
  const desktopPath = roots?.roots?.find(r => r.id === 'desktop')?.path;
  if (desktopPath) {
    const projectsPath = joinPath(desktopPath, 'Projects');
    const preferred = joinPath(projectsPath, wantName);
    const stat = await window.arkDesktop?.workspaceStatPath?.(preferred);
    if (stat?.ok && stat.isDirectory && stat.path) {
      return { ok: true, path: stat.path, matchedName: stat.name || wantName, nested: false };
    }
    // Case-insensitive scan of Desktop\Projects
    const listing = await window.arkDesktop?.listDir?.(projectsPath);
    if (listing?.ok) {
      for (const item of listing.items || []) {
        if (item.kind !== 'dir') continue;
        if (scoreFolderMatch(item.name, wantName) >= 95) {
          return {
            ok: true,
            path: item.path || joinPath(projectsPath, item.name),
            matchedName: item.name,
            nested: false,
          };
        }
      }
    }
  }

  const desktopHit = await resolveScopedFolderPath({ scope: 'desktop', name: wantName });
  if (desktopHit.ok && desktopHit.path) return desktopHit;

  if (parentPath) {
    const listing = await window.arkDesktop?.listDir?.(parentPath);
    if (listing?.ok) {
      let best: { name: string; path: string; score: number } | null = null;
      for (const item of listing.items || []) {
        if (item.kind !== 'dir') continue;
        const score = scoreFolderMatch(item.name, wantName);
        if (score >= 70 && (!best || score > best.score)) {
          best = { name: item.name, path: item.path, score };
        }
      }
      if (best) {
        const stat = await window.arkDesktop?.workspaceStatPath?.(best.path);
        if (stat?.ok && stat.isDirectory && stat.path) {
          return { ok: true, path: stat.path, matchedName: best.name };
        }
      }
    }
  }

  if (desktopHit.error && !desktopHit.ok) return desktopHit;
  return {
    ok: false,
    error: `No folder matching “${wantName}” on your Desktop.\n\nCheck the spelling, or say **“On my desktop I have a folder called …”** with the exact name.`,
  };
}

export function formatFolderLocatedMessage(located: {
  path?: string;
  matchedName?: string;
  nested?: boolean;
}, askedName: string): string | null {
  if (!located.path) return null;
  if (located.nested) {
    return `Found **${located.matchedName || askedName}** at \`${located.path}\` (inside a subfolder on Desktop).`;
  }
  if (located.matchedName && located.matchedName.toLowerCase() !== askedName.toLowerCase()) {
    return `Matched folder **${located.matchedName}** on your Desktop.`;
  }
  return null;
}
