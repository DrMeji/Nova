/**
 * Desktop drag-and-drop for Chat / Image / Code.
 * Electron folder drops are a single File with a disk path (via webUtils),
 * not nested browser File entries. resolve through pathStat + importFolder.
 */

import type { ChatAttachMeta } from '@/lib/chatAttach';

export type DroppedImage = { id: string; name: string; dataUrl: string };

export type DropApplyResult = {
  images: DroppedImage[];
  files: Record<string, string>;
  /** @deprecated prefer attaches. kept for callers that read a single chip */
  attach: ChatAttachMeta | null;
  attaches: ChatAttachMeta[];
  projectId?: string;
  note?: string;
};

function namespaceFiles(folderName: string, files: Record<string, string>): Record<string, string> {
  const safe = String(folderName || 'folder').replace(/[\\/]/g, '-').slice(0, 80) || 'folder';
  const out: Record<string, string> = {};
  for (const [rel, text] of Object.entries(files)) {
    const path = rel.replace(/\\/g, '/').replace(/^\//, '');
    out[path.startsWith(`${safe}/`) ? path : `${safe}/${path}`] = text;
  }
  return out;
}

const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;
const VIDEO_RE = /\.(mp4|webm|mov|mkv|avi|m4v)$/i;
const TEXTISH_RE =
  /\.(tsx?|jsx?|mjs|cjs|py|go|rs|java|kt|swift|cs|cpp|cxx|cc|c|h|hpp|rb|php|vue|svelte|css|scss|less|html?|json|toml|ya?ml|md|txt|csv|tsv|sql|sh|bash|zsh|ps1|xml|svg|log|ini|cfg|conf|env|dockerfile|makefile|pdf|rtf)$/i;

type ElectronFile = File & { path?: string; webkitRelativePath?: string };

function fileDiskPath(f: File): string {
  try {
    const via = window.arkDesktop?.getPathForFile?.(f);
    if (via) return String(via).trim();
  } catch {
    /* ignore */
  }
  return String((f as ElectronFile).path || '').trim();
}

function isImageFile(f: File): boolean {
  return f.type.startsWith('image/') || IMAGE_RE.test(f.name);
}

function isVideoFile(f: File): boolean {
  return f.type.startsWith('video/') || VIDEO_RE.test(f.name);
}

function isTextishName(name: string, type: string): boolean {
  if (TEXTISH_RE.test(name)) return true;
  return /javascript|typescript|json|text\/|xml|csv/.test(type);
}

export async function readFileAsDataUrl(f: File): Promise<string | null> {
  if (f.size > 12_000_000) return null;
  try {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(f);
    });
  } catch {
    return null;
  }
}

/** Images from Ctrl+V / clipboard paste (Snipping Tool, screenshots, etc.). */
export async function imagesFromClipboardData(
  data: DataTransfer | null | undefined,
): Promise<DroppedImage[]> {
  if (!data) return [];
  const out: DroppedImage[] = [];
  const items = data.items;
  if (items?.length) {
    for (let i = 0; i < items.length && out.length < 4; i++) {
      const item = items[i];
      if (!item || !/^image\//i.test(item.type)) continue;
      const file = item.getAsFile();
      if (!file) continue;
      const dataUrl = await readFileAsDataUrl(file);
      if (!dataUrl?.startsWith('data:image/')) continue;
      const ext = (item.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
      out.push({
        id: `paste-${crypto.randomUUID().slice(0, 10)}`,
        name: file.name && /\.(png|jpe?g|gif|webp|bmp)$/i.test(file.name)
          ? file.name
          : `screenshot.${ext}`,
        dataUrl,
      });
    }
  }
  if (out.length) return out;
  const files = data.files;
  if (files?.length) {
    for (let i = 0; i < files.length && out.length < 4; i++) {
      const f = files[i];
      if (!f || !isImageFile(f)) continue;
      const dataUrl = await readFileAsDataUrl(f);
      if (!dataUrl?.startsWith('data:image/')) continue;
      out.push({
        id: `paste-${crypto.randomUUID().slice(0, 10)}`,
        name: f.name || 'screenshot.png',
        dataUrl,
      });
    }
  }
  return out;
}

async function readBrowserText(f: File): Promise<string | null> {
  try {
    return await f.text();
  } catch {
    return null;
  }
}

/**
 * Resolve a FileList / DataTransfer drop into attachable chat content.
 */
export async function resolveChatDrop(
  list: FileList | File[] | null | undefined,
  opts?: { projectId?: string; /** When true, reuse projectId for Code workspace merge */ mergeProject?: boolean },
): Promise<DropApplyResult> {
  const empty: DropApplyResult = { images: [], files: {}, attach: null, attaches: [] };
  if (!list || !('length' in list) || !list.length) return empty;

  const files = [...list] as ElectronFile[];
  const images: DroppedImage[] = [];
  const seedFiles: Record<string, string> = {};
  const attaches: ChatAttachMeta[] = [];
  const notes: string[] = [];
  let lastProjectId = opts?.projectId;

  // 1) Electron absolute paths (folders + files from Explorer)
  const diskPaths = [...new Set(files.map(fileDiskPath).filter(Boolean))];
  for (const disk of diskPaths) {
    const stat = await window.arkDesktop?.pathStat?.(disk);
    if (!stat?.ok) {
      notes.push(`Could not open ${disk}`);
      continue;
    }

    if (stat.isDirectory) {
      // Always a fresh project id per folder so a second drop never overwrites the first.
      const pid = (opts?.mergeProject && lastProjectId)
        ? lastProjectId
        : `proj-${crypto.randomUUID().slice(0, 8)}`;
      lastProjectId = pid;
      const res = await window.arkDesktop?.projectImportFolder?.({
        projectId: pid,
        projectName: stat.name,
        sourceDir: disk,
      });
      if (res?.ok && res.files) {
        const folderName = res.name || stat.name || 'folder';
        const namespaced = namespaceFiles(folderName, res.files);
        Object.assign(seedFiles, namespaced);
        const count = Object.keys(res.files).length;
        const meta: ChatAttachMeta = {
          kind: 'folder',
          name: folderName,
          count: Object.keys(namespaced).length || count,
          projectId: pid,
          id: pid,
        };
        attaches.push(meta);
        // Intentionally do NOT spill images into the preview strip —
        // everything stays inside the folder chip until the user sends.
        try {
          localStorage.setItem(`ark:chat-studio-files:${pid}`, JSON.stringify({
            name: folderName,
            files: namespaced,
          }));
        } catch {
          /* ignore */
        }
      } else if (res && !res.ok && (res as { error?: string }).error === 'file' && (res as { path?: string }).path) {
        // User dropped / selected something that resolved to a single file.
        const filePath = String((res as { path: string }).path);
        const base = (res as { name?: string }).name || filePath.split(/[/\\]/).pop() || 'file';
        if (IMAGE_RE.test(base)) {
          const data = await window.arkDesktop?.readDataUrl?.(filePath);
          if (data?.ok && data.dataUrl?.startsWith('data:image/')) {
            images.push({
              id: `attach-${crypto.randomUUID().slice(0, 10)}`,
              name: base,
              dataUrl: data.dataUrl,
            });
          }
        } else {
          const read = await window.arkDesktop?.readTextFile?.({ path: filePath });
          if (read?.ok && read.text != null) seedFiles[base] = read.text;
          else seedFiles[base] = `[Attached file: ${base}]`;
        }
      } else if (res && !res.ok && !res.canceled) {
        notes.push(res.error || `Could not open folder ${stat.name}`);
      } else if (!res?.ok) {
        notes.push(`Could not import folder ${stat.name || disk}`);
      }
      continue;
    }

    if (stat.isFile) {
      const base = stat.name || disk.split(/[/\\]/).pop() || 'file';
      if (IMAGE_RE.test(base)) {
        const match = files.find(f => fileDiskPath(f) === disk || f.name === base);
        if (match && isImageFile(match)) {
          const dataUrl = await readFileAsDataUrl(match);
          if (dataUrl?.startsWith('data:image/')) {
            images.push({
              id: `attach-${crypto.randomUUID().slice(0, 10)}`,
              name: base,
              dataUrl,
            });
            continue;
          }
        }
      }
      if (VIDEO_RE.test(base)) {
        seedFiles[base] = [
          `[Video file: ${base}]`,
          `Path: ${disk}`,
          `Size: ${stat.size ?? 0} bytes`,
          'Video generation is not live yet. describe what you want to recreate or review from this clip.',
        ].join('\n');
        notes.push(`Attached video ${base}`);
        continue;
      }
      const read = await window.arkDesktop?.readTextFile?.({ path: disk });
      if (read?.ok && read.text != null) {
        seedFiles[base] = read.text;
      } else {
        seedFiles[base] = `[Attached file: ${base}, ${stat.size ?? 0} bytes${read?.error ? `. ${read.error}` : ''}]`;
      }
    }
  }

  // 2) Browser-style entries (no disk path)
  for (const f of files) {
    if (fileDiskPath(f)) continue;

    if (isImageFile(f)) {
      const dataUrl = await readFileAsDataUrl(f);
      if (dataUrl?.startsWith('data:image/')) {
        images.push({
          id: `attach-${crypto.randomUUID().slice(0, 10)}`,
          name: f.name,
          dataUrl,
        });
      }
      continue;
    }

    if (isVideoFile(f)) {
      const rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
      seedFiles[rel] = [
        `[Video file: ${f.name}]`,
        `Size: ${f.size} bytes`,
        'Video generation is not live yet. describe what you want from this clip.',
      ].join('\n');
      continue;
    }

    if (!isTextishName(f.name, f.type) && f.size > 0) {
      const rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
      const text = await readBrowserText(f);
      if (text != null && text.length && !/[\u0000-\u0008]/.test(text.slice(0, 200))) {
        seedFiles[rel] = text;
      } else {
        seedFiles[rel] = `[Attached file: ${f.name}, ${f.size} bytes]`;
      }
      continue;
    }

    const rel = (f.webkitRelativePath || f.name).replace(/\\/g, '/');
    const text = await readBrowserText(f);
    if (text != null) seedFiles[rel] = text;
  }

  if (attaches.length) {
    return {
      images: images.slice(0, 4),
      files: seedFiles,
      attach: attaches[0],
      attaches,
      projectId: lastProjectId,
      note: notes[0],
    };
  }

  const paths = Object.keys(seedFiles);
  const count = paths.length;
  let attach: ChatAttachMeta | null = null;
  if (count > 0) {
    const looksFolder = paths.some(p => p.includes('/'));
    if (looksFolder) {
      const root = paths[0].split('/')[0] || 'folder';
      const pid = `proj-${crypto.randomUUID().slice(0, 8)}`;
      lastProjectId = pid;
      attach = { kind: 'folder', name: root, count, projectId: pid };
      attaches.push(attach);
      try {
        localStorage.setItem(`ark:chat-studio-files:${pid}`, JSON.stringify({
          name: root,
          files: seedFiles,
        }));
      } catch {
        /* ignore */
      }
    } else if (count === 1) {
      attach = { kind: 'file', name: paths[0].split('/').pop() || paths[0], count: 1 };
      attaches.push(attach);
    } else {
      attach = { kind: 'files', name: `${count} files`, count };
      attaches.push(attach);
    }
  }
  // Images only go in `images` (thumbnail strip). never as a second AttachCard.

  if (!attaches.length && !images.length && notes.length) {
    return { ...empty, note: notes[0] };
  }
  if (!attaches.length && !images.length && diskPaths.length === 0 && files.length > 0 && window.arkDesktop?.isElectron) {
    return {
      ...empty,
      note: 'Could not read that drop. Close ARK and run Open-ARK-Build.bat again.',
    };
  }

  return {
    images: images.slice(0, 4),
    files: seedFiles,
    attach: attaches[0] || null,
    attaches,
    projectId: lastProjectId,
    note: notes[0],
  };
}

/** True when the OS is dragging files. */
export function dropHasFiles(dt: DataTransfer | null | undefined): boolean {
  if (!dt) return false;
  const types = [...(dt.types || [])];
  if (types.includes('Files') || types.includes('application/x-moz-file')) return true;
  try {
    if (dt.items && dt.items.length > 0) {
      for (let i = 0; i < dt.items.length; i++) {
        if (dt.items[i]?.kind === 'file') return true;
      }
    }
  } catch {
    /* ignore */
  }
  return Boolean(dt.files?.length);
}

/** Always call on dragover so the cursor is copy (not the red blocked icon). */
export function allowWindowFileDrop(e: DragEvent | { preventDefault: () => void; stopPropagation: () => void; dataTransfer?: DataTransfer | null }): void {
  e.preventDefault();
  e.stopPropagation();
  try {
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  } catch {
    /* ignore */
  }
}
