/**
 * Natural-language PC exploration — games, desktop, installed apps, subfolders.
 * No folder-name templates required.
 */

import type { CatalogItem } from '@/lib/folderCatalog';
import { parseDesktopSubfolderAsk } from '@/lib/folderPathAsk';
import { grantsFromPrefs, type WorkspaceGrants } from '@/lib/workspaceGrants';

const FOLDER_NAMED_RE = /\b(?:folder|project)\s+(?:called|named)\b/i;

export type PcExploreMode = 'desktop_top' | 'desktop_subfolder' | 'games' | 'installed_apps';

export function looksLikeInstalledAppsAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!/\b(?:apps?|applications?|programs?|software)\b/i.test(t)) return false;
  if (/\b(?:installed|install(?:ed|ation)?s?|do\s+i\s+have|have\s+(?:on|in)\s+(?:my\s+)?(?:pc|computer)|other\s+(?:apps?|applications?|programs?))\b/i.test(t)) {
    if (/\b(?:on|in)\s+(?:my\s+)?desktop\b/i.test(t) && !/\binstalled\b/i.test(t)) return false;
    return true;
  }
  return false;
}

export function classifyPcExploreMode(text: string): PcExploreMode | null {
  const t = String(text || '').trim();
  if (!t) return null;
  if (FOLDER_NAMED_RE.test(t)) return null;

  if (looksLikeInstalledAppsAsk(t)) return 'installed_apps';

  if (/\bprojects?\b/i.test(t)
    && /\b(?:inside|in|on|have|what|which|type|kind|tell|show|pc|computer|desktop)\b/i.test(t)) {
    return 'desktop_subfolder';
  }

  if (/\b(games?|gaming|steam)\b/i.test(t)
    && /\b(desktop|pc|computer|downloaded|installed|have|found|find|any|whole|my)\b/i.test(t)) {
    return 'games';
  }

  if (parseDesktopSubfolderAsk(t)) return 'desktop_subfolder';

  if (/\bwhat(?:'s| is)\s+on\s+(?:my\s+)?desktop\b/i.test(t)) return 'desktop_top';
  if (/\b(?:list|show|tell me)\b[\s\S]{0,40}\b(?:my\s+)?desktop\b/i.test(t) && !looksLikeInstalledAppsAsk(t)) {
    return 'desktop_top';
  }
  if (/\b(find|list|show|tell me|did you find|do you see|any)\b/i.test(t)
    && /\b(on|in)\s+(?:my\s+)?(desktop|pc|computer|whole pc)\b/i.test(t)
    && !looksLikeInstalledAppsAsk(t)) {
    if (/\b(games?|gaming)\b/i.test(t)) return 'games';
    return 'desktop_top';
  }
  if (/\b(?:my|the)\s+(?:whole|entire)\s+pc\b/i.test(t) && /\b(games?|gaming)\b/i.test(t)) return 'games';
  if (/\b(?:my|the)\s+(?:whole|entire)\s+pc\b/i.test(t) && !looksLikeInstalledAppsAsk(t)) return 'desktop_top';

  if (/\b(?:inside|in)\s+(?:of\s+)?(?:my\s+)?(?:pc|computer)\b/i.test(t) && !looksLikeInstalledAppsAsk(t)) {
    return 'desktop_top';
  }

  return null;
}

/** @deprecated use classifyPcExploreMode */
export type PcExploreTopic = 'games' | 'desktop' | 'apps';

export function looksLikePcExploreAsk(text: string): boolean {
  return classifyPcExploreMode(text) != null;
}

export type PcExploreSection = {
  title: string;
  path?: string;
  items: CatalogItem[];
};

export type PcExploreData = {
  mode: PcExploreMode;
  headline: string;
  subtitle?: string;
  sections: PcExploreSection[];
  foundCount: number;
  emptyNote?: string;
  limited?: boolean;
};

const PC_EXPLORE_MARKER = /<!--ark-pc-explore:([\s\S]*?)-->/;

export function isPcExploreMessage(content: string): boolean {
  return PC_EXPLORE_MARKER.test(String(content || ''));
}

export function parsePcExploreMessage(content: string): PcExploreData | null {
  const m = String(content || '').match(PC_EXPLORE_MARKER);
  if (!m?.[1]) return null;
  try {
    const parsed = JSON.parse(m[1]) as PcExploreData & { topic?: string };
    if (!parsed.mode && parsed.topic) {
      parsed.mode = parsed.topic === 'games' ? 'games'
        : parsed.topic === 'apps' ? 'installed_apps'
          : 'desktop_top';
    }
    return parsed;
  } catch {
    return null;
  }
}

export function encodePcExploreMessage(data: PcExploreData): string {
  return `<!--ark-pc-explore:${JSON.stringify(data)}-->`;
}

export function pcExploreToPlainText(data: PcExploreData): string {
  const lines = [data.headline];
  if (data.subtitle) lines.push(data.subtitle);
  for (const sec of data.sections) {
    lines.push(`${sec.title}: ${sec.items.map(i => i.name).join(', ')}`);
  }
  return lines.join('\n');
}

export function pcExploreStatusStages(mode: PcExploreMode): string[] {
  switch (mode) {
    case 'games':
      return ['Thinking…', 'Exploring your Desktop…', 'Looking for games and shortcuts…', 'Checking Steam and common install folders…', 'Preparing answer…'];
    case 'installed_apps':
      return ['Thinking…', 'Listing installed applications…', 'Reading program inventory…', 'Preparing answer…'];
    case 'desktop_subfolder':
      return ['Thinking…', 'Finding that folder on your Desktop…', 'Listing contents…', 'Preparing answer…'];
    default:
      return ['Thinking…', 'Exploring your Desktop…', 'Listing what is on your Desktop…', 'Preparing answer…'];
  }
}

function formatBytes(size?: number): string {
  if (size == null || size < 0) return '';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `~${Math.round(size / 1024)} KB`;
  return `~${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function toCatalogItem(entry: {
  name: string;
  kind?: 'dir' | 'file';
  size?: number;
  source?: string;
}): CatalogItem {
  const baseName = entry.name.replace(/\.lnk$/i, '');
  if (entry.kind === 'dir') return { name: baseName, kind: 'folder' };
  if (/\.lnk$/i.test(entry.name)) return { name: baseName, kind: 'shortcut' };
  if (entry.source && entry.source !== 'desktop-apps') {
    return { name: baseName, kind: 'shortcut', detail: entry.source };
  }
  return {
    name: baseName,
    kind: 'file',
    detail: entry.size ? formatBytes(entry.size) : entry.source,
  };
}

async function tryListSection(
  title: string,
  path: string,
  filter?: (name: string, kind: 'dir' | 'file') => boolean,
  limit = 24,
): Promise<PcExploreSection | null> {
  const list = await window.arkDesktop?.listDir?.(path);
  if (!list?.ok || !list.items?.length) return null;
  const items = list.items
    .filter(i => !filter || filter(i.name, i.kind))
    .slice(0, limit)
    .map(toCatalogItem);
  if (!items.length) return null;
  return { title, path, items };
}

async function buildGamesExplore(sections: PcExploreSection[], grants: WorkspaceGrants, desktopPath: string | null) {
  if (!desktopPath) return;
  const desktop = await window.arkDesktop?.listDir?.(desktopPath);
  const items = desktop?.items || [];

  const gamesFolder = items.find(i => i.kind === 'dir' && /^games?$/i.test(i.name));
  if (gamesFolder) {
    const sec = await tryListSection(`Desktop\\${gamesFolder.name}`, gamesFolder.path);
    if (sec) sections.push(sec);
  }

  const gameShortcuts = items
    .filter(i => i.kind === 'file' && /\.lnk$/i.test(i.name))
    .map(toCatalogItem);
  if (gameShortcuts.length) {
    sections.push({ title: 'Desktop shortcuts', path: desktopPath, items: gameShortcuts.slice(0, 20) });
  }

  const gameLikeDirs = items.filter(i =>
    i.kind === 'dir'
    && /game|steam|epic|riot|blizzard|xbox/i.test(i.name)
    && !/^games?$/i.test(i.name));
  for (const dir of gameLikeDirs.slice(0, 3)) {
    const sec = await tryListSection(dir.name, dir.path, undefined, 12);
    if (sec) sections.push(sec);
  }

  if (grants.fullPc || grants.desktop) {
    const steamPaths = [
      'C:\\Program Files (x86)\\Steam\\steamapps\\common',
      'C:\\Program Files\\Steam\\steamapps\\common',
    ];
    for (const sp of steamPaths) {
      const sec = await tryListSection('Steam library', sp, (name, kind) => kind === 'dir' && name !== '.', 25);
      if (sec) {
        sections.push(sec);
        break;
      }
    }
  }

  if (grants.fullPc) {
    for (const base of ['C:\\Program Files (x86)', 'C:\\Program Files']) {
      const sec = await tryListSection(
        `Installed in ${base.split('\\').pop()}`,
        base,
        (name, kind) => kind === 'dir' && /game|steam|epic|riot|blizzard|ea |ubisoft|minecraft/i.test(name),
        15,
      );
      if (sec) sections.push(sec);
    }
  }
}

async function buildInstalledAppsExplore(sections: PcExploreSection[], grants: WorkspaceGrants, desktopPath: string | null) {
  const result = await window.arkDesktop?.pcInstalledApps?.({ limit: 70 });
  const apps = result?.apps || [];

  if (apps.length) {
    sections.push({
      title: result?.limited
        ? 'Shortcuts and Desktop apps (partial)'
        : 'Installed programs (sample)',
      items: apps.slice(0, 70).map(a => toCatalogItem({
        name: a.name,
        kind: 'file',
        source: a.source,
      })),
    });
  }

  if (desktopPath && grants.desktop) {
    const appsFolder = await tryListSection('Desktop\\Apps folder', `${desktopPath}\\Apps`, undefined, 20);
    if (appsFolder) sections.push(appsFolder);
  }

  return result;
}

async function buildDesktopSubfolderExplore(
  sections: PcExploreSection[],
  userMessage: string,
  desktopPath: string | null,
) {
  const { resolveCatalogFolderRef } = await import('@/lib/folderCatalog');
  const ref = parseDesktopSubfolderAsk(userMessage) || resolveCatalogFolderRef(userMessage);
  if (!ref || !desktopPath) return null;

  const { resolveScopedFolderPath } = await import('@/lib/workspaceGrants');
  const located = await resolveScopedFolderPath(ref);
  if (!located.ok || !located.path) return located.error || null;

  const sec = await tryListSection(
    located.matchedName || ref.name,
    located.path,
    undefined,
    30,
  );
  if (sec) sections.push(sec);
  return located;
}

function headlineForMode(mode: PcExploreMode, foundCount: number, folderName?: string): { headline: string; subtitle?: string } {
  switch (mode) {
    case 'games':
      return {
        headline: foundCount
          ? 'Here are games and game folders found on your PC'
          : 'I looked on your Desktop and common game locations',
      };
    case 'installed_apps':
      return {
        headline: foundCount
          ? 'Installed applications found on your PC'
          : 'No installed applications listed yet',
        subtitle: undefined,
      };
    case 'desktop_subfolder':
      return {
        headline: foundCount
          ? `Contents of ${folderName || 'that folder'} on your Desktop`
          : `Nothing listed in ${folderName || 'that folder'}`,
      };
    default:
      return {
        headline: foundCount ? "Here's what's on your Desktop" : 'Your Desktop looks empty from here',
      };
  }
}

export async function buildPcExploreData(userMessage: string, modeHint?: PcExploreMode | null): Promise<PcExploreData> {
  const mode = modeHint || classifyPcExploreMode(userMessage) || 'desktop_top';
  const sections: PcExploreSection[] = [];
  const grants = grantsFromPrefs();

  const roots = await window.arkDesktop?.browseRoots?.();
  const desktopPath = roots?.roots?.find(r => r.id === 'desktop')?.path || null;

  let limited = false;
  let inventoryNote: string | undefined;
  let subfolderName: string | undefined;

  if (mode === 'games') {
    await buildGamesExplore(sections, grants, desktopPath);
  } else if (mode === 'installed_apps') {
    const inv = await buildInstalledAppsExplore(sections, grants, desktopPath);
    limited = Boolean(inv?.limited);
    inventoryNote = inv?.note;
    if (!grants.fullPc && grants.desktop) {
      limited = true;
    }
  } else if (mode === 'desktop_subfolder') {
    const hit = await buildDesktopSubfolderExplore(sections, userMessage, desktopPath);
    if (typeof hit === 'object' && hit?.matchedName) subfolderName = hit.matchedName;
    else if (typeof hit === 'string') {
      return {
        mode,
        headline: 'Could not find that folder',
        sections: [],
        foundCount: 0,
        emptyNote: hit,
      };
    }
  } else if (desktopPath) {
    const sec = await tryListSection('Desktop (top level)', desktopPath, undefined, 18);
    if (sec) sections.push(sec);
  }

  const foundCount = sections.reduce((n, s) => n + s.items.length, 0);
  const { headline, subtitle } = headlineForMode(mode, foundCount, subfolderName);

  let emptyNote: string | undefined;
  if (mode === 'installed_apps') {
    if (limited) {
      emptyNote = inventoryNote
        || 'Desktop access shows shortcuts and folders on Desktop. Enable **Full PC access** in Settings → Security for the full installed-program list from Windows.';
    } else if (!foundCount) {
      emptyNote = 'No programs turned up in the registry inventory. Try opening Settings → Security and confirming Full PC access is on.';
    }
    if (foundCount && limited) {
      return {
        mode,
        headline: 'Desktop shortcuts and folders (not a full install list)',
        subtitle: inventoryNote,
        sections,
        foundCount,
        limited: true,
      };
    }
  } else if (!foundCount) {
    emptyNote = mode === 'games'
      ? 'No game folders or shortcuts turned up on Desktop or in Steam/common paths.'
      : mode === 'desktop_subfolder'
        ? 'That folder is empty or could not be read.'
        : 'Nothing listed — turn on Desktop access in Settings → Security.';
  }

  return {
    mode,
    headline: mode === 'installed_apps' && foundCount && !limited
      ? 'Installed applications (sample from Windows)'
      : headline,
    subtitle: mode === 'installed_apps' && limited ? inventoryNote : subtitle,
    sections,
    foundCount,
    emptyNote,
    limited: limited || undefined,
  };
}
