/** In-thread attachment cards for Chat / Code (folder, file, image receipt). */

export type ChatAttachKind = 'folder' | 'file' | 'image' | 'files';

export type ChatAttachMeta = {
  kind: ChatAttachKind;
  name: string;
  count?: number;
  projectId?: string;
  /** Stable id so two folders with the same name both stay attached. */
  id?: string;
  /** Optional thumb / media id for image cards already in markdown. */
  mediaId?: string;
  /** Path bound for listing only — file contents not loaded into chat. */
  catalogOnly?: boolean;
};

const MARKER_RE = /<!--ark-attach:([\s\S]*?)-->/g;
const MARKER_ONE = /<!--ark-attach:([\s\S]*?)-->/;

export function encodeChatAttach(meta: ChatAttachMeta): string {
  const payload: ChatAttachMeta = {
    kind: meta.kind,
    name: String(meta.name || 'attachment').slice(0, 120),
  };
  if (meta.count != null) payload.count = Math.max(0, Math.floor(meta.count));
  if (meta.projectId) payload.projectId = String(meta.projectId).slice(0, 64);
  if (meta.id) payload.id = String(meta.id).slice(0, 64);
  if (meta.mediaId) payload.mediaId = String(meta.mediaId).slice(0, 80);
  return `<!--ark-attach:${JSON.stringify(payload)}-->`;
}

export function encodeChatAttaches(metas: ChatAttachMeta[]): string {
  return metas.map(encodeChatAttach).join('\n');
}

export function parseChatAttach(content: string): ChatAttachMeta | null {
  const all = parseChatAttaches(content);
  return all[0] || null;
}

export function parseChatAttaches(content: string): ChatAttachMeta[] {
  const out: ChatAttachMeta[] = [];
  const re = new RegExp(MARKER_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(content || ''))) !== null) {
    try {
      const raw = JSON.parse(m[1]) as ChatAttachMeta;
      if (raw?.kind && raw?.name) out.push(raw);
    } catch {
      /* skip bad marker */
    }
  }
  return out;
}

export function stripChatAttach(content: string): string {
  return String(content || '').replace(new RegExp(MARKER_RE.source, 'g'), '').trim();
}

export function isChatAttachMessage(content: string): boolean {
  return MARKER_ONE.test(String(content || ''));
}

export function attachSubtitle(meta: ChatAttachMeta): string {
  const n = meta.count ?? 0;
  if (meta.kind === 'folder') {
    if (meta.catalogOnly) {
      return n === 1 ? '1 item at top level' : `${n} items at top level`;
    }
    return n === 1 ? '1 file inside' : `${n} files inside`;
  }
  if (meta.kind === 'files') {
    return n === 1 ? '1 file' : `${n} files`;
  }
  if (meta.kind === 'file') return 'File';
  return 'Image';
}

/** Detect a folder-style pick from webkitRelativePath (path has a slash). */
export function looksLikeFolderPick(paths: string[]): boolean {
  return paths.some(p => p.includes('/') || p.includes('\\'));
}

export function folderNameFromPaths(paths: string[], fallback = 'folder'): string {
  const first = paths.find(p => p.includes('/') || p.includes('\\'));
  if (!first) return fallback;
  const norm = first.replace(/\\/g, '/');
  const root = norm.split('/').filter(Boolean)[0];
  return root || fallback;
}

export function attachKey(meta: ChatAttachMeta): string {
  return meta.id || meta.projectId || `${meta.kind}:${meta.name}:${meta.count ?? 0}`;
}
