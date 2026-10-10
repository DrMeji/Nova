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
import { applyAgentPatches, parseAgentPatches } from '@/lib/novaAgentPatch';
import { isSandboxBlockedPath } from '@/lib/agentSandbox';

export type ChatApplyResult = {
  ok: boolean;
  updated: string[];
  deleted: string[];
  files: ProjectFileMap;
  reply: string;
  error?: string;
  /** Set when App.jsx still fails the Live syntax gate after heal — callers must not say Done. */
  syntaxFailed?: boolean;
  syntaxReasons?: string[];
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

/** True when SVG is the generic Lucide sparkles mark (must not clobber family logos). */
function isSparklesLogoSvg(svg: string): boolean {
  return /M9\.937 15\.5/i.test(String(svg || ''));
}

/** True when SVG looks like a product-family mark (wine / coffee / leaf). */
function isFamilyLogoSvg(svg: string): boolean {
  const s = String(svg || '');
  return /M8 22h8/i.test(s)
    || /M16 8a1 1 0 0 1 1 1v8/i.test(s)
    || /M10 2v2/i.test(s)
    || /M11 20A7 7 0 0 1 9\.8/i.test(s)
    || /M3 2v7c0 1\.1/i.test(s); // utensils (ceramic / tableware)
}

async function writeViaDiskRoot(
  diskRoot: string,
  files: Record<string, string>,
): Promise<{ ok: boolean; error?: string }> {
  if (!window.novaDesktop?.workspaceWriteFile) {
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
    // Never persist the generic sparkles mark as public/logo.svg — family stamps own the slot.
    // Previously we only skipped when a family mark was already on disk; invent could still
    // re-sparkle an empty/sparkles file after Ready and win the overnight ceramic race.
    const normRel = rel.replace(/\\/g, '/');
    if (/(^|\/)public\/logo\.svg$/i.test(normRel) && isSparklesLogoSvg(content)) {
      continue;
    }
    const written = await window.novaDesktop.workspaceWriteFile({
      targetPath,
      content,
    });
    if (!written.ok) {
      return { ok: false, error: written.error || `Could not write ${rel}` };
    }
    // Confirm bytes landed (dotted folder names / grant paths can silently miss).
    // IPC returns `{ ok, text }` — NOT `content` (that always failed verify and blocked edits).
    // Include .svg — genre logo/hero locks must not silently miss on disk.
    if (window.novaDesktop.readTextFile && /\.(?:jsx?|tsx?|css|html|json|svg)$/i.test(rel)) {
      try {
        const check = await window.novaDesktop.readTextFile({ path: targetPath });
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

/** Persist only accepted create keys (depth accept-first — never write rejects). */
export async function persistAcceptedCreateFiles(
  diskRoot: string,
  files: Record<string, string>,
  keys: string[],
  opts?: { deleteKeys?: string[] },
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, string> = {};
  for (const k of keys) {
    if (typeof files[k] === 'string') payload[k] = files[k]!;
  }
  // Drop App/main twins left on disk after in-memory cleanup (blank Live cause).
  const deletes = new Set((opts?.deleteKeys || []).map((k) => k.replace(/\\/g, '/')));
  try {
    const { cleanupAppTwins } = await import('@/lib/createBuildQuality');
    const twin = cleanupAppTwins({ ...files, ...payload });
    for (const rel of twin.removed || []) {
      if (rel) deletes.add(String(rel).replace(/\\/g, '/'));
    }
  } catch { /* best-effort */ }
  if (Object.keys(payload).length) {
    const written = await writeViaDiskRoot(diskRoot, payload);
    if (!written.ok) return written;
  }
  if (deletes.size) {
    try {
      const { deleteFileOnDisk } = await import('@/lib/chatDiskOps');
      for (const rel of deletes) {
        if (!rel || payload[rel]) continue;
        const abs = joinDisk(diskRoot, rel);
        await deleteFileOnDisk({ filePath: abs, projectId: '', relPath: rel }).catch(() => {});
      }
    } catch { /* ignore */ }
  }
  return { ok: true };
}

/** Write public/logo.svg alone and confirm it is not still sparkles. */
export async function persistGenreLogoSvg(
  diskRoot: string,
  logoSvg: string,
): Promise<{ ok: boolean; error?: string }> {
  const body = String(logoSvg || '');
  if (!body.trim()) return { ok: false, error: 'empty logo' };
  if (/M9\.937 15\.5/i.test(body)) return { ok: false, error: 'refusing to persist sparkles mark' };
  const once = await writeViaDiskRoot(diskRoot, { 'public/logo.svg': body });
  if (!once.ok) return once;
  try {
    const abs = joinDisk(diskRoot, 'public/logo.svg');
    const check = await window.novaDesktop?.readTextFile?.({ path: abs });
    const got = typeof check?.text === 'string' ? check.text : '';
    if (got && /M9\.937 15\.5/i.test(got)) {
      const retry = await writeViaDiskRoot(diskRoot, { 'public/logo.svg': body });
      if (!retry.ok) return retry;
      const check2 = await window.novaDesktop?.readTextFile?.({ path: abs });
      const got2 = typeof check2?.text === 'string' ? check2.text : '';
      if (got2 && /M9\.937 15\.5/i.test(got2)) {
        return { ok: false, error: 'logo still sparkles after retry' };
      }
    }
  } catch {
    /* verify best-effort */
  }
  // Brief settle — catch late invent overwrites that land within ~1s.
  await new Promise((r) => window.setTimeout(r, 400));
  try {
    const abs = joinDisk(diskRoot, 'public/logo.svg');
    const check = await window.novaDesktop?.readTextFile?.({ path: abs });
    const got = typeof check?.text === 'string' ? check.text : '';
    if (got && /M9\.937 15\.5/i.test(got)) {
      await writeViaDiskRoot(diskRoot, { 'public/logo.svg': body });
    }
  } catch { /* ignore */ }
  return { ok: true };
}

async function listDirItems(abs: string): Promise<{ name: string; isDirectory?: boolean; isFile?: boolean }[]> {
  try {
    const listing = await window.novaDesktop?.listDir?.(abs);
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
  if (!window.novaDesktop?.readTextFile) return {};
  const out: ProjectFileMap = {};
  const maxFiles = 220;
  const codeRe = /\.(jsx?|tsx?|css|scss|html|json|md|svg)$/i;
  const skipDir = /^(node_modules|dist|build|release|\.git|\.vite|coverage|out)$/i;

  const readRel = async (rel: string) => {
    if (Object.keys(out).length >= maxFiles) return;
    try {
      const read = await window.novaDesktop!.readTextFile!({ path: joinDisk(diskRoot, rel) });
      if (read?.ok && typeof read.text === 'string' && read.text.length < 400_000) {
        out[rel] = read.text;
      }
    } catch {
      /* missing */
    }
  };

  const walk = async (relDir: string, depth: number) => {
    if (depth > 6 || Object.keys(out).length >= maxFiles) return;
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

  // Prefer src/ first (full tree), then electron/public, then project roots.
  await walk('src', 0);
  await walk('electron', 0);
  await walk('public', 0);
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
  /** Create product brief — used for antiBleed family (not the micro-edit ask). */
  originalBrief?: string;
  productBrief?: string;
  generationBrief?: string;
  /** When true, apply in memory only — no disk / sandbox write (depth accept-first). */
  dryRun?: boolean;
}): Promise<ChatApplyResult> {
  const rawUser = opts.userMessage || '';
  const kind = detectProjectKind(rawUser);
  const appendix = skillPromptAppendix(rawUser, kind, {
    isEdit: Object.keys(opts.files || {}).length > 0,
    forCreateBuild: Object.keys(opts.files || {}).length === 0,
    hasReferenceImage: /unsplash|https?:\/\/\S+\.(?:png|jpe?g|webp)|nova-media:/i.test(rawUser),
  });
  // Keep the original ask for micro-patches. the skills appendix is only for model scaffolding.
  const userMessageForParse = appendix && !/NOVA skills/i.test(rawUser)
    ? `${rawUser}\n\n${appendix}`
    : rawUser;
  let baseFiles = normalizeStudioFileKeys(opts.files, opts.diskRoot);
  // dryRun: memory is source of truth — do not re-hydrate disk orphans into the apply.
  if (opts.diskRoot && !opts.dryRun) {
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
  // Family anti-bleed (all edit/apply paths) — strip COVER / orphan products.ts without inventing UI.
  {
    const hasViteApp = Object.keys(next).some((p) => /(^|\/)src\/App\.(jsx|tsx)$/i.test(p.replace(/\\/g, '/')));
    if (hasViteApp) {
      try {
        const { buildProductPlan, antiBleedForFamily } = await import('@/lib/createProductPlan');
        // Micro-edits must not re-infer family from "make the title bigger" (strips heroes).
        const briefForFamily = String(
          opts.originalBrief
          || opts.productBrief
          || opts.generationBrief
          || '',
        ).trim();
        const microEdit = rawUser.trim().length < 120
          && !/\b(?:rebuild|redesign|restyle|new\s+hero|change\s+the\s+layout)\b/i.test(rawUser);
        const plan = buildProductPlan(
          briefForFamily && microEdit ? briefForFamily : (briefForFamily || rawUser),
          opts.projectName || '',
        );
        const bled = antiBleedForFamily(next, plan);
        if (bled.changed) {
          const hadProducts = Boolean(next['src/data/products.ts']);
          for (const key of Object.keys(next)) {
            if (!Object.prototype.hasOwnProperty.call(bled.files, key)) {
              delete next[key];
              if (!twinRemoved.includes(key)) twinRemoved.push(key);
            }
          }
          Object.assign(next, bled.files);
          for (const key of Object.keys(bled.files)) {
            if (typeof next[key] === 'string' && !changed.includes(key)) changed.push(key);
          }
          if (hadProducts && !bled.files['src/data/products.ts'] && !twinRemoved.includes('src/data/products.ts')) {
            twinRemoved.push('src/data/products.ts');
          }
        }
      } catch {
        /* anti-bleed best-effort */
      }
    }
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
  // Heal App.jsx compile crashers before Live sees them (edit path used to skip create's gate).
  let syntaxFailed = false;
  let syntaxReasons: string[] = [];
  {
    const hasViteApp = Object.keys(next).some((p) => /(^|\/)src\/App\.(jsx|tsx)$/i.test(p.replace(/\\/g, '/')));
    if (hasViteApp) {
      try {
        const { runCreateSyntaxGate } = await import('@/lib/createSyntaxGate');
        const syn = runCreateSyntaxGate(next);
        Object.assign(next, syn.files);
        if (syn.healed) {
          for (const key of Object.keys(syn.files)) {
            if (/(^|\/)src\/App\.(jsx|tsx|css)$/i.test(key.replace(/\\/g, '/')) && !changed.includes(key)) {
              changed.push(key);
            }
          }
        }
        if (!syn.ok) {
          syntaxFailed = true;
          syntaxReasons = syn.reasons || [];
        }
      } catch {
        /* syntax gate best-effort */
      }
    }
  }

  // Never let invent/edit write the generic sparkles mark when this brief wants a family logo.
  // Also blocks late async invent writes that finish after genre lock and re-sparkle disk.
  try {
    const { brandLogoSvgFor, logoIconifyFor } = await import('@/lib/brandAssets');
    const { detectHeroProductKind } = await import('@/lib/createIdentity');
    let want = logoIconifyFor(String(opts.projectName || ''), String(opts.userMessage || ''));
    if (want === 'lucide:sparkles') {
      const hk = detectHeroProductKind(
        String(opts.projectName || ''),
        String(opts.userMessage || ''),
      );
      if (hk === 'bottle') want = 'lucide:wine';
      else if (hk === 'coffee') want = 'lucide:coffee';
      else if (hk === 'tea') want = 'lucide:leaf';
      else if (hk === 'ceramic') want = 'lucide:utensils';
    }
    for (const key of Object.keys(next)) {
      if (!/(^|\/)public\/logo\.svg$/i.test(key.replace(/\\/g, '/'))) continue;
      if (want === 'lucide:sparkles') continue;
      const incoming = String(next[key] || '');
      const matchesWant = want === 'lucide:wine' ? /M8 22h8/i.test(incoming)
        : want === 'lucide:coffee' ? /M16 8a1 1 0 0 1 1 1v8|M10 2v2/i.test(incoming)
          : want === 'lucide:leaf' ? /M11 20A7 7 0 0 1 9\.8/i.test(incoming)
            : want === 'lucide:utensils' ? /M3 2v7c0 1\.1/i.test(incoming)
              : !isSparklesLogoSvg(incoming);
      // Stomp sparkles OR wrong-family marks (e.g. coffee mug onto gin).
      if (matchesWant && !isSparklesLogoSvg(incoming)) continue;
      const prev = String(baseFiles[key] || opts.files?.[key] || '');
      const family = brandLogoSvgFor({
        productName: String(opts.projectName || ''),
        brief: String(opts.userMessage || ''),
      });
      const keep = (prev && isFamilyLogoSvg(prev) && !isSparklesLogoSvg(prev)) ? prev : family;
      if (keep && !isSparklesLogoSvg(keep)) {
        next[key] = keep;
        if (!changed.includes(key)) changed.push(key);
      }
    }
  } catch { /* brand logo guard best-effort */ }

  const payloadFiles = Object.fromEntries(
    changed.filter((p: string) => typeof next[p] === 'string').map((p: string) => [p, next[p]]),
  );

  // Depth accept-first: measure ledger gain in memory with zero disk side effects.
  if (opts.dryRun) {
    return {
      ok: true,
      updated: changed,
      deleted: [],
      files: next,
      reply: '',
      ...(syntaxFailed ? { syntaxFailed: true, syntaxReasons } : {}),
    };
  }

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
  // Same sparkles→family refuse as writeViaDiskRoot — this path used to bypass that guard
  // and re-sparkle logo.svg after genre lock.
  if (autoSave && opts.diskRoot && changed.length && window.novaDesktop?.workspaceWriteFile) {
    for (const rel of changed) {
      const body = next[rel];
      if (typeof body !== 'string') continue;
      const normRel = rel.replace(/\\/g, '/');
      // Never re-sparkle logo.svg on the post-apply guarantee pass either.
      if (/(^|\/)public\/logo\.svg$/i.test(normRel) && isSparklesLogoSvg(body)) {
        continue;
      }
      try {
        await window.novaDesktop.workspaceWriteFile({
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
    ...(syntaxFailed ? { syntaxFailed: true, syntaxReasons } : {}),
  };
}

export async function deleteChatWorkspacePath(opts: {
  projectId: string;
  relPath: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!window.novaDesktop?.workspaceDeletePath) {
    return { ok: false, error: 'Delete is only available in the desktop app.' };
  }
  return window.novaDesktop.workspaceDeletePath({
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
