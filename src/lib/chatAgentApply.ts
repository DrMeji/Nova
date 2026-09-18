/**
 * Apply @@@FILE edits from Chat to the sticky workspace (Step 3).
 * Falls back to deterministic React/web micro-patches when the model only describes changes.
 * Also falls back to absolute disk writes when projectId write fails but diskRoot is known.
 */

import {
  applyFileEdits,
  buildFileTreeFromPaths,
  coerceCodingFileReply,
  extractChatStyleFileEdits,
  formatCodeChatReply,
  parseFileEdits,
  stripFileBlocks,
  type ProjectFileMap,
} from '@/lib/projectCodeEdit';
import { finalizeWebEdits, reactUiMicroAskEdits, isNovaSearchStub } from '@/lib/webProjectCanon';
import { safeProjectWrite } from '@/lib/projectWriteSafe';
import { skillPromptAppendix } from '@/lib/novaSkills';
import { detectProjectKind } from '@/lib/projectKind';
import { verifyProjectAfterPatch } from '@/lib/postPatchVerify';
import { applyAgentPatches, parseAgentPatches } from '@/lib/arkAgentPatch';
import { isSandboxBlockedPath } from '@/lib/agentSandbox';

export type ChatApplyResult = {
  ok: boolean;
  updated: string[];
  deleted: string[];
  files: ProjectFileMap;
  reply: string;
  error?: string;
};

function joinDisk(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const cleanRoot = root.replace(/[/\\]+$/, '');
  let cleanRel = rel.replace(/^[/\\]+/, '').replace(/\//g, sep);
  // Guard against Folder\\Folder nesting when studio keys were prefixed with the folder name.
  const base = cleanRoot.split(/[/\\]/).filter(Boolean).pop() || '';
  if (base) {
    const prefix = `${base}${sep}`;
    const prefixAlt = `${base}/`;
    if (cleanRel === base || cleanRel.startsWith(prefix) || cleanRel.startsWith(prefixAlt)) {
      cleanRel = cleanRel.slice(base.length).replace(/^[/\\]+/, '');
    }
  }
  return cleanRel ? `${cleanRoot}${sep}${cleanRel}` : cleanRoot;
}

/** Resolved write must stay under diskRoot (no .. escape, no sibling project). */
function isUnderDiskRoot(diskRoot: string, targetPath: string): boolean {
  const norm = (p: string) => p.replace(/[/\\]+/g, '/').replace(/\/+$/, '').toLowerCase();
  const root = norm(diskRoot);
  const target = norm(targetPath);
  return target === root || target.startsWith(`${root}/`);
}

async function writeViaDiskRoot(
  diskRoot: string,
  files: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  if (!window.arkDesktop?.workspaceWriteFile) {
    return { ok: false, error: 'Project write unavailable' };
  }
  for (const [rel, content] of Object.entries(files)) {
    if (isSandboxBlockedPath(rel)) {
      return { ok: false, error: `Blocked write: ${rel}` };
    }
    const targetPath = joinDisk(diskRoot, rel);
    if (!isUnderDiskRoot(diskRoot, targetPath)) {
      return { ok: false, error: `Path escapes project folder: ${rel}` };
    }
    const written = await window.arkDesktop.workspaceWriteFile({
      targetPath,
      content,
    });
    if (!written.ok) {
      return { ok: false, error: written.error || `Could not write ${rel}` };
    }
    // Confirm bytes landed (dotted folder names / grant paths can silently miss).
    // IPC returns `{ ok, text }` — NOT `content` (that always failed verify and blocked edits).
    if (window.arkDesktop.readTextFile && /\.(?:jsx?|tsx?|css|html|json)$/i.test(rel)) {
      try {
        const check = await window.arkDesktop.readTextFile({ path: targetPath });
        const got = typeof check?.text === 'string' ? check.text : '';
        if (!check?.ok) {
          return { ok: false, error: `Write verify failed for ${rel}` };
        }
        // Soft check: empty read after a non-empty write is a real miss; tiny files are fine.
        if (content.length > 0 && got.length === 0) {
          return { ok: false, error: `Write verify failed for ${rel}` };
        }
        if (content.length >= 80 && got.length < Math.min(40, Math.floor(content.length * 0.25))) {
          return { ok: false, error: `Write verify failed for ${rel}` };
        }
      } catch {
        /* best-effort verify — do not fail the write on read races */
      }
    }
  }
  return { ok: true };
}

async function listDirItems(abs: string): Promise<{ name: string; isDirectory?: boolean; isFile?: boolean }[]> {
  try {
    const listing = await window.arkDesktop?.listDir?.(abs);
    const raw = listing as {
      items?: { name?: string; kind?: string; isDirectory?: boolean; isFile?: boolean }[];
      entries?: { name?: string; kind?: string; isDirectory?: boolean; isFile?: boolean }[];
    } | undefined;
    const entries = Array.isArray(raw?.items)
      ? raw!.items!
      : Array.isArray(raw?.entries)
        ? raw!.entries!
        : [];
    return entries
      .map((ent) => {
        const name = String(ent?.name || '');
        const kind = String(ent?.kind || '').toLowerCase();
        const isDirectory = Boolean(ent?.isDirectory) || kind === 'dir' || kind === 'directory';
        const isFile = Boolean(ent?.isFile) || kind === 'file';
        return { name, isDirectory, isFile };
      })
      .filter((ent) => Boolean(ent.name));
  } catch {
    return [];
  }
}

/** Walk src/ (and a few roots) so follow-up edits see more than a fixed App.jsx list. */
async function hydrateFilesFromDiskRoot(diskRoot: string): Promise<ProjectFileMap> {
  if (!window.arkDesktop?.readTextFile) return {};
  const out: ProjectFileMap = {};
  const maxFiles = 80;
  const codeRe = /\.(jsx?|tsx?|css|html|json|md)$/i;
  const skipDir = /^(node_modules|dist|build|\.git|\.vite|coverage)$/i;

  const readRel = async (rel: string) => {
    if (Object.keys(out).length >= maxFiles) return;
    try {
      const read = await window.arkDesktop!.readTextFile!({ path: joinDisk(diskRoot, rel) });
      if (read?.ok && typeof read.text === 'string' && read.text.length < 400_000) {
        out[rel] = read.text;
      }
    } catch {
      /* missing */
    }
  };

  const walk = async (relDir: string, depth: number) => {
    if (depth > 4 || Object.keys(out).length >= maxFiles) return;
    const abs = relDir ? joinDisk(diskRoot, relDir) : diskRoot;
    const entries = await listDirItems(abs);
    for (const ent of entries) {
      if (Object.keys(out).length >= maxFiles) break;
      if (skipDir.test(ent.name)) continue;
      const rel = relDir ? `${relDir}/${ent.name}` : ent.name;
      const looksDir = ent.isDirectory || (!ent.isFile && !codeRe.test(ent.name));
      if (looksDir && (ent.isDirectory || !codeRe.test(ent.name))) {
        if (ent.isFile) {
          /* file without extension — skip */
        } else if (ent.isDirectory || !/\./.test(ent.name)) {
          await walk(rel, depth + 1);
          continue;
        }
      }
      if (codeRe.test(ent.name) || ent.isFile) {
        if (codeRe.test(ent.name)) await readRel(rel.replace(/\\/g, '/'));
      }
    }
  };

  // Prefer src/ first, then project roots.
  await walk('src', 0);
  for (const rootFile of [
    'index.html', 'package.json', 'vite.config.js', 'vite.config.ts',
    'css/styles.css', 'js/app.js', 'README.md',
  ]) {
    await readRel(rootFile);
  }
  if (Object.keys(out).length < 8) {
    await walk('', 0);
  }
  return out;
}

/** Strip accidental Folder/Folder prefixes from in-memory studio keys. */
function normalizeStudioFileKeys(files: ProjectFileMap, diskRoot?: string | null): ProjectFileMap {
  if (!diskRoot || !Object.keys(files).length) return files;
  const base = diskRoot.split(/[/\\]/).filter(Boolean).pop() || '';
  if (!base) return files;
  const out: ProjectFileMap = {};
  for (const [rel, content] of Object.entries(files)) {
    let key = String(rel).replace(/\\/g, '/').replace(/^\/+/, '');
    if (key.startsWith(`${base}/`)) key = key.slice(base.length + 1);
    // Collapse TaskRail/TaskRail/src → src when bound to outer root.
    while (key.startsWith(`${base}/`)) key = key.slice(base.length + 1);
    if (!out[key]) out[key] = content;
  }
  return out;
}

export async function applyChatReplyEdits(opts: {
  reply: string;
  projectId: string | null;
  projectName?: string;
  files: ProjectFileMap;
  userMessage?: string;
  diskRoot?: string | null;
}): Promise<ChatApplyResult> {
  const rawUser = opts.userMessage || '';
  const kind = detectProjectKind(rawUser);
  const appendix = skillPromptAppendix(rawUser, kind, {
    isEdit: Object.keys(opts.files || {}).length > 0,
    forCreateBuild: Object.keys(opts.files || {}).length === 0,
    hasReferenceImage: /unsplash|https?:\/\/\S+\.(?:png|jpe?g|webp)|ark-media:/i.test(rawUser),
  });
  // Keep the original ask for micro-patches. the skills appendix is only for model scaffolding.
  const userMessageForParse = appendix && !/NOVA skills/i.test(rawUser)
    ? `${rawUser}\n\n${appendix}`
    : rawUser;
  let baseFiles = normalizeStudioFileKeys(opts.files, opts.diskRoot);
  if (opts.diskRoot) {
    const fromDisk = await hydrateFilesFromDiskRoot(opts.diskRoot);
    if (Object.keys(fromDisk).length) {
      const isThinShell = (src: string) => {
        const s = String(src || '');
        return !s.trim()
          || s.length < 220
          || /return\s*\(\s*<div className=["']app["']\s*\/>\s*\)/i.test(s);
      };
      // Disk wins over stale empty memory for product files; this-turn memory still wins
      // when it has real content (wipe / surgical / model edits not yet flushed).
      const merged: ProjectFileMap = { ...fromDisk };
      for (const [k, mem] of Object.entries(baseFiles)) {
        const diskVal = fromDisk[k];
        if (diskVal == null) {
          merged[k] = mem;
          continue;
        }
        const appKey = /(^|\/)App\.(jsx|tsx|css)$/i.test(k.replace(/\\/g, '/'));
        if (appKey && isThinShell(mem) && !isThinShell(diskVal)) {
          merged[k] = diskVal;
        } else if (String(mem || '').trim()) {
          merged[k] = mem;
        } else {
          merged[k] = diskVal;
        }
      }
      baseFiles = normalizeStudioFileKeys(merged, opts.diskRoot);
    }
  }

  // Patch-first: SEARCH/REPLACE on existing files before full @@@FILE dumps.
  const replyForParse = coerceCodingFileReply(opts.reply);
  let edits = parseFileEdits(replyForParse);
  const patches = parseAgentPatches(replyForParse);
  if (patches.length) {
    const patched = applyAgentPatches(baseFiles, patches);
    const failed = patched.results.filter((r) => !r.ok);
    if (patched.updated.length) {
      const fromPatches = patched.updated.map((p) => ({ path: p, content: patched.files[p]! }));
      // Prefer patches when they applied; keep any @@@FILE creates that patches did not cover.
      const patchedPaths = new Set(fromPatches.map((e) => e.path));
      edits = [
        ...fromPatches,
        ...edits.filter((e) => !patchedPaths.has(e.path)),
      ];
    } else if (failed.length && !edits.length) {
      return {
        ok: false,
        updated: [],
        deleted: [],
        files: baseFiles,
        reply: failed[0]?.error || 'Patch could not be applied',
        error: failed[0]?.error || 'patch_failed',
      };
    }
  }
  if (!edits.length) {
    edits = extractChatStyleFileEdits(opts.reply, userMessageForParse, baseFiles);
  }

  // Prefer model edits. Surgical patches may help on an existing tree.
  // Never invent canned landings / full app shells when the model wrote nothing.
  const finalized = finalizeWebEdits(baseFiles, rawUser, edits, { projectName: opts.projectName });
  if (finalized.length) {
    edits = finalized;
  } else if (!edits.length && String(opts.reply || '').trim()) {
    const react = reactUiMicroAskEdits(baseFiles, rawUser, { projectName: opts.projectName });
    if (react.length) edits = react;
  }

  if (!edits.length) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: baseFiles,
      reply: '',
      error: 'no_edits',
    };
  }

  const tree = buildFileTreeFromPaths(baseFiles);
  const applied = applyFileEdits(baseFiles, tree, edits);
  const changed = applied.changedPaths;
  if (!changed.length) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: baseFiles,
      reply: 'No file changes could be applied from that reply.',
      error: 'no_changes',
    };
  }

  const next = { ...applied.files };
  let twinRemoved: string[] = [];
  // Strip assistant chatter + repair Vite shell before disk write (edit path used to skip this).
  {
    const { cleanupAppTwins, stripModelProseFromSource, ensureViteReactProjectFiles } = await import(
      '@/lib/createBuildQuality'
    );
    for (const key of Object.keys(next)) {
      if (typeof next[key] !== 'string') continue;
      const cleaned = stripModelProseFromSource(key, next[key]);
      if (cleaned !== next[key]) {
        next[key] = cleaned;
        if (!changed.includes(key)) changed.push(key);
      }
    }
    // Capture twin drop BEFORE ensureVite (which also collapses twins in-memory only).
    {
      const earlyTwin = cleanupAppTwins(next);
      twinRemoved = earlyTwin.removed;
      for (const key of Object.keys(next)) {
        if (!Object.prototype.hasOwnProperty.call(earlyTwin.files, key)) delete next[key];
      }
      Object.assign(next, earlyTwin.files);
    }
    const hasVite = Object.keys(next).some((p) => /(^|\/)src\/App\.(jsx|tsx)$/i.test(p.replace(/\\/g, '/')))
      || /"vite"/i.test(next['package.json'] || '');
    if (hasVite) {
      const repaired = ensureViteReactProjectFiles(next, opts.projectName || 'app');
      for (const key of Object.keys(next)) {
        if (!Object.prototype.hasOwnProperty.call(repaired.files, key)) delete next[key];
      }
      Object.assign(next, repaired.files);
      for (const r of repaired.repaired) {
        if (r.startsWith('removed:')) {
          const drop = r.slice('removed:'.length);
          if (drop && !twinRemoved.includes(drop)) twinRemoved.push(drop);
          continue;
        }
        if (!changed.includes(r) && typeof next[r] === 'string') changed.push(r);
      }
    }
    const twin = cleanupAppTwins(next);
    for (const drop of twin.removed) {
      if (!twinRemoved.includes(drop)) twinRemoved.push(drop);
    }
    for (const key of Object.keys(next)) delete next[key];
    Object.assign(next, twin.files);
  }
  // Hard reject accidental NOVA search-chrome stubs on Vite App.jsx (piece builds / black shell).
  {
    const searchWanted = /\bsearch\s*bar\b/i.test(rawUser)
      && !/\b(?:no|without|never|skip|omit|don't|do\s+not|dont)\b[\s\S]{0,40}\bsearch(?:\s*bar)?\b/i.test(rawUser);
    const wantsBlackOnly = /(?:ONLY this piece|full-viewport solid|near-black|#1e1f22|solid pure black|pure black full-viewport|full-viewport background)/i.test(rawUser)
      && /(?:ONLY this piece|Stop after the black shell|black shell only|first step ONLY|No nav,\s*no text|no icons yet)/i.test(rawUser);
    for (const key of Object.keys(next)) {
      const norm = key.replace(/\\/g, '/');
      if (/(?:^|\/)App\.(jsx|tsx)$/i.test(norm) && isNovaSearchStub(next[key]) && !searchWanted) {
        if (wantsBlackOnly) {
          next[key] = `import './App.css';\n\nexport default function App() {\n  return <div className="app" />;\n}\n`;
          next['src/App.css'] = `.app {\n  min-height: 100vh;\n  margin: 0;\n  background: #1e1f22;\n}\n`;
          next['src/index.css'] = `html, body, #root { height: 100%; margin: 0; background: #1e1f22; }\n`;
          if (!changed.includes(key)) changed.push(key);
          if (!changed.includes('src/App.css')) changed.push('src/App.css');
          if (!changed.includes('src/index.css')) changed.push('src/index.css');
        } else if (baseFiles[key] && !isNovaSearchStub(baseFiles[key])) {
          next[key] = baseFiles[key];
        }
      }
      if (/(?:^|\/)index\.html$/i.test(norm) && /NOVA-search|class=["']top-bar["']/i.test(next[key]) && !searchWanted) {
        next[key] = String(next[key])
          .replace(/\s*<header class=["']top-bar["'][\s\S]*?<\/header>\s*/i, '\n')
          .replace(/\s*<label class=["']search-bar["'][\s\S]*?<\/label>\s*/i, '\n');
        if (!changed.includes(key)) changed.push(key);
      }
    }
  }
  const payloadFiles = Object.fromEntries(
    changed.filter((p: string) => typeof next[p] === 'string').map((p: string) => [p, next[p]]),
  );

  let wroteOk = false;
  let writeError: string | undefined;
  let autoSaveNote = '';

  let autoSave = true;
  try {
    const { getLocalPrefs } = await import('@/lib/localPrefs');
    autoSave = getLocalPrefs().autoSaveProjects !== false;
  } catch { /* default on */ }

  // Prefer the live disk folder when bound. projectId sandbox alone can "succeed"
  // while Desktop\Projects\… never changes (Localhost then looks unchanged).
  if (!autoSave) {
    // Memory-only: chat still shows the edit; disk stays until Auto-save is on or user rebuilds.
    wroteOk = true;
    autoSaveNote = '\n\n_(Auto-save is off in Settings → Projects — changes stayed in this chat.)_';
  } else if (opts.diskRoot) {
    const disk = await writeViaDiskRoot(opts.diskRoot, payloadFiles);
    if (!disk.ok) {
      return {
        ok: false,
        updated: [],
        deleted: [],
        files: baseFiles,
        reply: disk.error || `Could not write into ${opts.diskRoot}`,
        error: disk.error || 'disk_write_failed',
      };
    }
    wroteOk = true;
    if (opts.projectId) {
      void safeProjectWrite({
        projectId: opts.projectId,
        projectName: opts.projectName,
        files: payloadFiles,
      });
    }
  } else if (opts.projectId) {
    const write = await safeProjectWrite({
      projectId: opts.projectId,
      projectName: opts.projectName,
      files: payloadFiles,
    });
    wroteOk = write.ok;
    writeError = write.error;
  }

  if (!wroteOk) {
    return {
      ok: false,
      updated: [],
      deleted: [],
      files: baseFiles,
      reply: writeError || (!opts.projectId && !opts.diskRoot ? 'No project bound' : 'Write failed.'),
      error: writeError || (!opts.projectId ? 'no_project' : 'write_failed'),
    };
  }

  // Guarantee disk bytes for every claimed update (apply can report ok with a thinned map).
  if (autoSave && opts.diskRoot && changed.length && window.arkDesktop?.workspaceWriteFile) {
    for (const rel of changed) {
      const body = next[rel];
      if (typeof body !== 'string') continue;
      try {
        await window.arkDesktop.workspaceWriteFile({
          targetPath: joinDisk(opts.diskRoot, rel),
          content: body,
        });
      } catch {
        /* best-effort; primary writeViaDiskRoot already ran */
      }
    }
  }

  // #6 — remove losing App twin from disk so Vite can't keep resolving the empty shell.
  const deleted: string[] = [];
  if (autoSave && twinRemoved.length) {
    const { deleteFileOnDisk } = await import('@/lib/chatDiskOps');
    for (const rel of twinRemoved) {
      try {
        const del = await deleteFileOnDisk({
          filePath: opts.diskRoot ? joinDisk(opts.diskRoot, rel) : rel,
          projectId: opts.projectId,
          relPath: rel,
        });
        if (del.ok) deleted.push(rel);
      } catch {
        /* best-effort */
      }
    }
  }

  const spoken = formatCodeChatReply(
    rawUser,
    changed,
    stripFileBlocks(opts.reply),
    { surface: 'chat' },
  );
  const verify = autoSave
    ? await verifyProjectAfterPatch({
      diskRoot: opts.diskRoot,
      files: next,
      changedPaths: changed,
    })
    : { summary: '' as string };
  const reply = `${verify.summary ? `${spoken}${verify.summary}` : spoken}${autoSaveNote}`;
  return {
    ok: true,
    updated: changed,
    deleted,
    files: next,
    reply,
  };
}

export async function deleteChatWorkspacePath(opts: {
  projectId: string;
  relPath: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!window.arkDesktop?.workspaceDeletePath) {
    return { ok: false, error: 'Delete is only available in the desktop app.' };
  }
  return window.arkDesktop.workspaceDeletePath({
    projectId: opts.projectId,
    relPath: opts.relPath,
  });
}

export function parseDeleteTargetFromMessage(message: string): string | null {
  const t = String(message || '').trim();
  const quoted = t.match(/(?:delete|remove|trash)\s+(?:file|folder)?\s*["\u201c']([^"\u201d']+)["\u201d']/i);
  if (quoted?.[1]) return quoted[1].trim();
  const bare = t.match(/(?:delete|remove)\s+(?:the\s+)?(?:file\s+)?([A-Za-z0-9_./\\-]+\.[A-Za-z0-9]+)/i);
  return bare?.[1]?.trim() || null;
}
