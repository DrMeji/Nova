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
  const replyForParse = coerceCodingFileReply(opts.reply);
  let edits = parseFileEdits(replyForParse);
  const patches = parseAgentPatches(replyForParse);
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
  // Hard reject accidental NOVA search-chrome stubs on Vite App.jsx (piece builds / black shell).
  {
    const searchWanted = /\bsearch\s*bar\b/i.test(rawUser)
      && !/\b(?:no|without|never|skip|omit|don't|do\s+not|dont)\b[\s\S]{0,40}\bsearch(?:\s*bar)?\b/i.test(rawUser);
    const wantsBlackOnly = /(?:ONLY this piece|full-viewport solid|near-black|#1e1f22)/i.test(rawUser)
      && /ONLY this piece|Stop after the black shell|black shell only/i.test(rawUser);
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
