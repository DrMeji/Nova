/**
 * Apply @@@FILE edits from Chat to the sticky workspace (Step 3).
 * Falls back to deterministic React/web micro-patches when the model only describes changes.
 * Also falls back to absolute disk writes when projectId write fails but diskRoot is known.
 */

import {
  applyFileEdits,
  buildFileTreeFromPaths,
  extractChatStyleFileEdits,
  formatCodeChatReply,
  parseFileEdits,
  scaffoldFallbackEdits,
  stripFileBlocks,
  type ProjectFileMap,
} from '@/lib/projectCodeEdit';
import { finalizeWebEdits, reactUiMicroAskEdits } from '@/lib/webProjectCanon';
import { safeProjectWrite } from '@/lib/projectWriteSafe';
import { skillPromptAppendix } from '@/lib/arkSkills';
import { detectProjectKind } from '@/lib/projectKind';
import { verifyProjectAfterPatch } from '@/lib/postPatchVerify';
import { applyAgentPatches, parseAgentPatches } from '@/lib/arkAgentPatch';

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

async function writeViaDiskRoot(
  diskRoot: string,
  files: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  if (!window.arkDesktop?.workspaceWriteFile) {
    return { ok: false, error: 'Project write unavailable' };
  }
  for (const [rel, content] of Object.entries(files)) {
    const targetPath = joinDisk(diskRoot, rel);
    const written = await window.arkDesktop.workspaceWriteFile({
      targetPath,
      content,
    });
    if (!written.ok) {
      return { ok: false, error: written.error || `Could not write ${rel}` };
    }
  }
  return { ok: true };
}

async function hydrateFilesFromDiskRoot(diskRoot: string): Promise<ProjectFileMap> {
  if (!window.arkDesktop?.readTextFile) return {};
  const rels = [
    'src/App.jsx', 'src/App.tsx', 'src/App.css', 'src/index.css',
    'index.html', 'css/styles.css', 'js/app.js', 'package.json',
  ];
  const out: ProjectFileMap = {};
  for (const rel of rels) {
    try {
      const read = await window.arkDesktop.readTextFile({ path: joinDisk(diskRoot, rel) });
      if (read?.ok && typeof read.text === 'string') out[rel] = read.text;
    } catch {
      /* missing */
    }
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
    hasReferenceImage: /unsplash|https?:\/\/\S+\.(?:png|jpe?g|webp)|ark-media:/i.test(rawUser),
  });
  // Keep the original ask for micro-patches. the skills appendix is only for model scaffolding.
  const userMessageForParse = appendix && !rawUser.includes('NOVA design skills')
    ? `${rawUser}\n\n${appendix}`
    : rawUser;
  let baseFiles = normalizeStudioFileKeys(opts.files, opts.diskRoot);
  if (opts.diskRoot) {
    const fromDisk = await hydrateFilesFromDiskRoot(opts.diskRoot);
    if (Object.keys(fromDisk).length) {
      const merged: ProjectFileMap = { ...fromDisk, ...baseFiles };
      for (const [rel, text] of Object.entries(fromDisk)) {
        const cur = merged[rel];
        if (!cur || String(text).length > String(cur).length) merged[rel] = text;
      }
      baseFiles = normalizeStudioFileKeys(merged, opts.diskRoot);
    }
  }

  // Patch-first: SEARCH/REPLACE on existing files before full @@@FILE dumps.
  let edits = parseFileEdits(opts.reply);
  const patches = parseAgentPatches(opts.reply);
  if (patches.length) {
    const patched = applyAgentPatches(baseFiles, patches);
    if (patched.updated.length) {
      const fromPatches = patched.updated.map((p) => ({ path: p, content: patched.files[p]! }));
      // Prefer patches when they applied; keep any @@@FILE creates that patches did not cover.
      const patchedPaths = new Set(fromPatches.map((e) => e.path));
      edits = [
        ...fromPatches,
        ...edits.filter((e) => !patchedPaths.has(e.path)),
      ];
    }
  }
  if (!edits.length) {
    edits = extractChatStyleFileEdits(opts.reply, userMessageForParse, baseFiles);
  }

  // Prefer deterministic React/web patches for common UI asks. models often describe without writing.
  // Never fall back to canned landings when the model reply is empty — that reused the same hero/CTA template.
  const finalized = finalizeWebEdits(baseFiles, rawUser, edits, { projectName: opts.projectName });
  if (finalized.length) {
    edits = finalized;
  } else if (!edits.length) {
    const react = reactUiMicroAskEdits(baseFiles, rawUser, { projectName: opts.projectName });
    if (react.length) edits = react;
    else if (String(opts.reply || '').trim()) {
      edits = scaffoldFallbackEdits(userMessageForParse, baseFiles, { projectName: opts.projectName });
    }
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

  const next = applied.files;
  const payloadFiles = Object.fromEntries(changed.map((p: string) => [p, next[p]]));

  let wroteOk = false;
  let writeError: string | undefined;

  // Prefer the live disk folder when bound. projectId sandbox alone can "succeed"
  // while Desktop\Projects\… never changes (Localhost then looks unchanged).
  if (opts.diskRoot) {
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

  const spoken = formatCodeChatReply(
    rawUser,
    changed,
    stripFileBlocks(opts.reply),
    { surface: 'chat' },
  );
  const verify = await verifyProjectAfterPatch({
    diskRoot: opts.diskRoot,
    files: next,
    changedPaths: changed,
  });
  const reply = verify.summary ? `${spoken}${verify.summary}` : spoken;
  return {
    ok: true,
    updated: changed,
    deleted: [],
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
