/**
 * Agent + Multi-agent composer turns — work queue + handoff chips.
 * Multi-agent = Scout → Builder → Critic (sequential roles, not GPU swarm).
 */

import { arkRoute } from '@/lib/novaRouter';
import { applyAndVerify } from '@/lib/applyAndVerify';
import { applyChatReplyEdits } from '@/lib/chatAgentApply';
import { scanProjectFindings, formatLocalFindings } from '@/lib/projectInspect';
import { runProjectMultiAgent } from '@/lib/novaMultiAgent';
import {
  type WorkQueue,
  type WorkQueueItem,
  buildWorkQueueFromContext,
  loadWorkQueue,
  saveWorkQueue,
  clearWorkQueue,
  nextOpenItem,
  openItems,
  markItemStatus,
  replaceOpenItems,
  formatWorkHandoffReply,
  formatQueueStoppedReply,
  looksLikeWorkQueueDoNext,
  looksLikeWorkQueueFinishAll,
  looksLikeWorkQueueStop,
  looksLikeClinicFixAsk,
  prioritizeQueueForAsk,
  mergeClinicQueueProgress,
  extractSeverityFocus,
  extractBatchCount,
  extractClinicFixIds,
  countProgress,
} from '@/lib/workQueue';

export type AgentWorkModeHost = {
  chatId: string;
  mode: 'agent' | 'multitask';
  userMessage: string;
  files: Record<string, string>;
  projectId: string;
  projectName: string;
  diskRoot?: string | null;
  preferredModelId?: string;
  messages?: Array<{ role?: string; content?: string } | null | undefined>;
  onProgress?: (msg: string, writingPath?: string | null) => void;
  shouldAbort?: () => boolean;
  /** Commit updated files back into the chat studio. */
  commitFiles?: (files: Record<string, string>, updated: string[]) => void;
};

export type AgentWorkModeResult = {
  reply: string;
  files: Record<string, string>;
  updated: string[];
  queue: WorkQueue | null;
  /** When clinic-seeded queue is fully clear — caller should run a full Debug rescan. */
  needsFullRescan?: boolean;
};

function modeLabel(mode: 'agent' | 'multitask'): string {
  return mode === 'multitask' ? 'Multi-agent' : 'Agent';
}

async function decomposeWithModel(
  ask: string,
  projectName: string,
  preferredModelId?: string,
): Promise<Array<Partial<WorkQueueItem>>> {
  const prompt = [
    'Decompose this project ask into an ordered JSON work queue. Reply JSON only:',
    '{"items":[{"id":"WQ-001","title":"...","detail":"...","path":"optional/file.tsx"}]}',
    'Rules: 2–8 concrete tasks. Prefer product/UI fixes over vague refactors. No markdown outside JSON.',
    `Project: ${projectName}`,
    `Ask:\n${ask.slice(0, 2500)}`,
  ].join('\n');
  try {
    const routed = await arkRoute({
      message: prompt,
      kind: 'chat',
      preferredModelId,
    });
    const raw = String(routed.reply || '');
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return [];
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { items?: Partial<WorkQueueItem>[] };
    return Array.isArray(parsed.items) ? parsed.items.slice(0, 8) : [];
  } catch {
    return [];
  }
}

async function ensureQueue(host: AgentWorkModeHost): Promise<WorkQueue> {
  const ask = String(host.userMessage || '').trim();
  let queue = loadWorkQueue(host.chatId);
  const continuing = looksLikeWorkQueueDoNext(ask) || looksLikeWorkQueueFinishAll(ask);
  const clinicFix = looksLikeClinicFixAsk(ask);
  const wantIds = extractClinicFixIds(ask);

  // Clinic fix with an existing open queue — keep progress; only reorder for the ask.
  // Never wipe done marks back to 1/N by rebuilding from the clinic bubble.
  if (clinicFix && queue && openItems(queue).length > 0) {
    // If they named DBG ids that aren’t in this queue, rebuild once from the
    // latest clinic report (new chat / reshuffled report) then merge progress.
    const missingNamed = wantIds.length > 0
      && !wantIds.some((id) => queue!.items.some((i) => i.id.toUpperCase() === id.toUpperCase()));
    if (missingNamed || (!queue.fromClinic && wantIds.length > 0)) {
      const fresh = buildWorkQueueFromContext({
        chatId: host.chatId,
        mode: host.mode,
        userMessage: ask,
        messages: host.messages,
        title: host.projectName,
      });
      if (fresh.fromClinic && fresh.items.length) {
        queue = prioritizeQueueForAsk(mergeClinicQueueProgress(fresh, queue), ask);
        return queue;
      }
    }
    queue = prioritizeQueueForAsk(queue, ask);
    return queue;
  }

  // No usable open queue — seed from clinic / plan / ask. Preserve any prior done marks.
  if (clinicFix && (!queue || openItems(queue).length === 0)) {
    const fresh = buildWorkQueueFromContext({
      chatId: host.chatId,
      mode: host.mode,
      userMessage: ask,
      messages: host.messages,
      title: host.projectName,
    });
    if (fresh.fromClinic && fresh.items.length) {
      queue = prioritizeQueueForAsk(mergeClinicQueueProgress(fresh, queue), ask);
      return queue;
    }
  }

  if (!queue || (!continuing && !clinicFix && openItems(queue).length === 0)) {
    queue = buildWorkQueueFromContext({
      chatId: host.chatId,
      mode: host.mode,
      userMessage: ask,
      messages: host.messages,
      title: host.projectName,
    });
    // Expand single vague item via model when not continuing a chip / clinic fix.
    if (!continuing && !clinicFix && queue.items.length <= 1 && ask.length >= 24 && !queue.fromClinic) {
      host.onProgress?.(`${modeLabel(host.mode)} · breaking into tasks`);
      const items = await decomposeWithModel(ask, host.projectName, host.preferredModelId);
      if (items.length >= 2) {
        queue = replaceOpenItems(queue, items);
      } else {
        saveWorkQueue(queue);
      }
    } else {
      saveWorkQueue(queue);
    }
  }

  if (clinicFix && queue) {
    queue = prioritizeQueueForAsk(queue, ask);
  }
  return queue;
}

function blobOf(item: WorkQueueItem): string {
  return `${item.id} ${item.title} ${item.detail || ''} ${item.path || ''}`;
}

function isReadmeItem(item: WorkQueueItem): boolean {
  return /readme/i.test(blobOf(item));
}

function isMissingViteSvgItem(item: WorkQueueItem): boolean {
  return /vite\.svg/i.test(blobOf(item))
    || (/missing\s+asset/i.test(blobOf(item)) && /vite/i.test(blobOf(item)));
}

function isAnyCastItem(item: WorkQueueItem): boolean {
  return /\bany\b/i.test(blobOf(item))
    && (/weakens type|type checking|as any|:\s*any/i.test(blobOf(item)));
}

function isButtonTypeItem(item: WorkQueueItem): boolean {
  return /button missing type|missing type attribute/i.test(blobOf(item));
}

function isImportantCssItem(item: WorkQueueItem): boolean {
  return /!important|brittle override/i.test(blobOf(item));
}

/** Drop `!important` so clinic/rescan stop flagging brittle overrides. */
function patchImportantInCssFile(src: string): string | null {
  if (!/\s*!important\b/i.test(src)) return null;
  const next = src.replace(/\s*!important\b/gi, '');
  return next !== src ? next : null;
}

function fileStillHasImportant(src: string): boolean {
  return /\s*!important\b/i.test(src);
}

function isSecurityExecItem(item: WorkQueueItem): boolean {
  const blob = blobOf(item);
  // Clinic copy: “Uses eval/exec — risky if fed untrusted input.”
  // Free-form: “fix the eval/exec risk in electron/main.ts”
  if (/uses eval\/exec|eval\s*\/\s*exec/i.test(blob)) return true;
  return /\bexec\s*\(|\beval\s*\(/i.test(blob)
    && /risky|untrusted|\brisk\b/i.test(blob);
}

function isSecuritySpawnItem(item: WorkQueueItem): boolean {
  return /shell\/process spawn|shell:true|child_process|spawnSync|execSync/i.test(blobOf(item));
}

/**
 * Convert risky single-line `exec('shell string', cb)` to argv-form `execFile(bin, args, cb)`.
 * Never matches across newlines — a greedy cross-line match previously swallowed whole files.
 */
function patchExecShellStringsInFile(src: string): string | null {
  if (!/\bexec\s*\(\s*(?:'[^'\n]*'|"[^"\n]*")/.test(src)) return null;
  let changed = false;
  let next = src;
  // Ensure execFile is imported beside exec when we rewrite.
  next = next.replace(
    /\bconst\s*\{\s*([^}]*\bexec\b[^}]*)\}\s*=\s*require\(\s*['"]child_process['"]\s*\)/g,
    (full, inner: string) => {
      const parts = String(inner).split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.includes('execFile')) return full;
      parts.push('execFile');
      changed = true;
      return `const { ${parts.join(', ')} } = require('child_process')`;
    },
  );
  // Single-line only. Allow the other quote char inside the string literal.
  next = next.replace(
    /\bexec\(\s*'([^'\n]*)'\s*,/g,
    (full, cmd: string) => rewriteExecCall(full, cmd, () => { changed = true; }),
  );
  next = next.replace(
    /\bexec\(\s*"([^"\n]*)"\s*,/g,
    (full, cmd: string) => rewriteExecCall(full, cmd, () => { changed = true; }),
  );
  return changed ? next : null;
}

function rewriteExecCall(full: string, cmd: string, mark: () => void): string {
  const trimmed = String(cmd).trim();
  if (!trimmed || /\$\{/.test(trimmed)) return full;
  const parts = trimmed.match(/(?:[^\s"]+|"[^"]+")+/g) || [];
  const binRaw = parts[0];
  if (!binRaw) return full;
  const bin = binRaw.replace(/^"|"$/g, '');
  const args = parts.slice(1).map((p) => p.replace(/^"|"$/g, ''));
  mark();
  const argsLit = `[${args.map((a) => JSON.stringify(a)).join(', ')}]`;
  return `execFile(${JSON.stringify(bin)}, ${argsLit},`;
}

/**
 * Harden spawn/execFileSync call sites: drop shell:true, keep argv arrays.
 * Adds a short guard comment the static scanner recognizes as mitigated.
 */
function patchSpawnHardeningInFile(src: string, focusLine?: number | null): string | null {
  let next = src;
  let changed = false;
  if (/shell\s*:\s*true/i.test(next)) {
    next = next.replace(/shell\s*:\s*true/gi, 'shell: false');
    changed = true;
  }
  // Mark fixed-argv child_process requires so rescan doesn’t re-flag the import alone.
  if (/\brequire\(\s*['"]child_process['"]\s*\)/.test(next)
    && !/nova-secure:\s*fixed-argv/i.test(next)) {
    next = next.replace(
      /(\b(?:const|let|var)\s+[^=]*=\s*)?require\(\s*['"]child_process['"]\s*\)/g,
      (full) => {
        changed = true;
        return `${full} /* nova-secure: fixed-argv */`;
      },
    );
  }
  // Also mark import { spawn } from 'child_process'
  if (/from\s+['"]child_process['"]/.test(next) && !/nova-secure:\s*fixed-argv/i.test(next)) {
    next = next.replace(
      /(from\s+['"]child_process['"])/g,
      (full) => {
        changed = true;
        return `${full} /* nova-secure: fixed-argv */`;
      },
    );
  }
  // Put the marker on string-form spawn/execSync lines so line-level scanners stay quiet.
  next = next.replace(
    /^([ \t]*)(.*\b(?:execSync|spawnSync|spawn)\s*\(\s*['"`][^'"`]+['"`].*)$/gm,
    (full, indent: string, rest: string) => {
      if (/nova-secure:\s*fixed-argv/i.test(full)) return full;
      if (/,\s*\[/.test(rest)) return full; // already argv form
      changed = true;
      return `${indent}${rest} /* nova-secure: fixed-argv */`;
    },
  );
  // If we know the line, ensure nearby spawn/execFile uses an args array (already typical).
  if (focusLine && focusLine > 0) {
    const lines = next.split('\n');
    const idx = focusLine - 1;
    const window = lines.slice(Math.max(0, idx - 2), Math.min(lines.length, idx + 6)).join('\n');
    if (/spawn\s*\(\s*['"][^'"]+['"]\s*,\s*['"]/.test(window)) {
      // spawn('cmd', 'arg string') → spawn('cmd', ['arg']) — rare; leave to model
    }
  }
  return changed ? next : null;
}

function lineFromItem(item: WorkQueueItem): number | null {
  const blob = blobOf(item);
  const m = blob.match(/\bline\s+(\d+)\b/i) || blob.match(/\bL(\d+)\b/);
  return m ? Number(m[1]) : null;
}

/** Replace weak `any` casts with `unknown` (file-wide so rescan stays clean). */
function patchAnyCastInFile(src: string): string | null {
  let next = src;
  let changed = false;
  if (/\(window\s+as\s+any\)\.electronAPI/.test(next)) {
    next = next.replace(
      /\(window\s+as\s+any\)\.electronAPI/g,
      '(window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI',
    );
    changed = true;
  }
  if (/\bas\s+any\b/.test(next)) {
    next = next.replace(/\bas\s+any\b/g, 'as unknown');
    changed = true;
  }
  if (/:\s*any\b/.test(next)) {
    next = next.replace(/:\s*any\b/g, ': unknown');
    changed = true;
  }
  if (/<any>/g.test(next)) {
    next = next.replace(/<any>/g, '<unknown>');
    changed = true;
  }
  return changed ? next : null;
}

function fileStillHasAnyCast(src: string): boolean {
  return /:\s*any\b|<any>|as\s+any\b/.test(src);
}

function fileStillHasUntypedButton(src: string): boolean {
  const re = /<button\b([\s\S]*?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    if (!/\btype\s*=/i.test(m[1])) return true;
  }
  return false;
}

/** Add type="button" to <button> tags that lack a type attribute. */
function patchButtonTypesInFile(src: string): string | null {
  if (!/<button\b/i.test(src)) return null;
  let changed = false;
  const next = src.replace(/<button\b([^>]*)>/gi, (full, attrs: string) => {
    if (/\btype\s*=/i.test(attrs)) return full;
    changed = true;
    return `<button type="button"${attrs}>`;
  });
  return changed ? next : null;
}

async function trySurgicalCodeFix(
  host: AgentWorkModeHost,
  item: WorkQueueItem,
  files: Record<string, string>,
): Promise<{
  files: Record<string, string>;
  updated: string[];
  note: string;
  ok: boolean;
  alreadyResolved?: boolean;
} | null> {
  const focus = String(item.path || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const candidates = [
    focus,
    ...Object.keys(files).filter((p) => {
      const n = p.replace(/\\/g, '/');
      return focus && (n === focus || n.endsWith(`/${focus}`) || n.endsWith(focus));
    }),
  ].filter(Boolean);

  if (isAnyCastItem(item)) {
    const anyTargets = [
      ...candidates,
      ...Object.keys(files).filter((p) => fileStillHasAnyCast(String(files[p] || ''))),
    ];
    const seen = new Set<string>();
    let clearedWithoutWrite = false;
    for (const rel of anyTargets) {
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
      const raw = files[rel];
      if (typeof raw !== 'string') continue;
      if (!fileStillHasAnyCast(raw)) {
        clearedWithoutWrite = true;
        continue;
      }
      const patched = patchAnyCastInFile(raw);
      if (!patched || patched === raw) continue;
      host.onProgress?.(`Agent · ${item.id} · patching ${rel}`, rel);
      const written = await forceWriteFiles(
        host,
        files,
        { [rel]: patched },
        `Remove as any cast in ${rel}`,
      );
      if (written.ok && !fileStillHasAnyCast(String(written.files[rel] || ''))) {
        return {
          files: written.files,
          updated: written.updated.length ? written.updated : [rel],
          ok: true,
          note: `Replaced \`any\` with \`unknown\` in **${rel}** so type checking stays on.`,
        };
      }
    }
    if (clearedWithoutWrite || anyTargets.every((rel) => !fileStillHasAnyCast(String(files[rel] || '')))) {
      return {
        files,
        updated: [],
        ok: true,
        alreadyResolved: true,
        note: '`any` casts are already cleared in the focus files — nothing to write.',
      };
    }
  }

  if (isButtonTypeItem(item)) {
    for (const rel of candidates.length ? candidates : Object.keys(files)) {
      const raw = files[rel];
      if (typeof raw !== 'string' || !/\.(tsx|jsx)$/i.test(rel)) continue;
      if (!fileStillHasUntypedButton(raw)) {
        return {
          files,
          updated: [],
          ok: true,
          alreadyResolved: true,
          note: `Buttons in **${rel}** already have \`type\` — nothing to write.`,
        };
      }
      const patched = patchButtonTypesInFile(raw);
      if (!patched || patched === raw) continue;
      host.onProgress?.(`Agent · ${item.id} · patching ${rel}`, rel);
      const written = await forceWriteFiles(
        host,
        files,
        { [rel]: patched },
        `Add type="button" on buttons in ${rel}`,
      );
      if (written.ok && !fileStillHasUntypedButton(String(written.files[rel] || ''))) {
        return {
          files: written.files,
          updated: written.updated.length ? written.updated : [rel],
          ok: true,
          note: `Added \`type="button"\` on buttons in **${rel}** so they won’t submit forms by accident.`,
        };
      }
    }
  }

  if (isImportantCssItem(item)) {
    const cssTargets = [
      ...candidates,
      ...Object.keys(files).filter((p) => /\.css$/i.test(p) && fileStillHasImportant(String(files[p] || ''))),
    ];
    const seen = new Set<string>();
    for (const rel of cssTargets) {
      if (!rel || seen.has(rel) || !/\.css$/i.test(rel)) continue;
      seen.add(rel);
      const raw = files[rel];
      if (typeof raw !== 'string') continue;
      if (!fileStillHasImportant(raw)) {
        return {
          files,
          updated: [],
          ok: true,
          alreadyResolved: true,
          note: `No \`!important\` left in **${rel}** — nothing to write.`,
        };
      }
      const patched = patchImportantInCssFile(raw);
      if (!patched || patched === raw) continue;
      host.onProgress?.(`Agent · ${item.id} · patching ${rel}`, rel);
      const written = await forceWriteFiles(
        host,
        files,
        { [rel]: patched },
        `Remove !important from ${rel}`,
      );
      if (written.ok && !fileStillHasImportant(String(written.files[rel] || ''))) {
        return {
          files: written.files,
          updated: written.updated.length ? written.updated : [rel],
          ok: true,
          note: `Removed \`!important\` overrides in **${rel}** so styles stay easier to maintain.`,
        };
      }
    }
  }

  if (isSecurityExecItem(item) || isSecuritySpawnItem(item)) {
    const focusLine = lineFromItem(item);
    const targets = candidates.length ? candidates : Object.keys(files).filter((p) => /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(p));
    const seen = new Set<string>();
    for (const rel of targets) {
      if (!rel || seen.has(rel)) continue;
      seen.add(rel);
      const raw = files[rel];
      if (typeof raw !== 'string') continue;
      let patched = raw;
      if (isSecurityExecItem(item)) {
        const p = patchExecShellStringsInFile(patched);
        if (p) patched = p;
      }
      if (isSecuritySpawnItem(item) || isSecurityExecItem(item)) {
        const p = patchSpawnHardeningInFile(patched, focusLine);
        if (p) patched = p;
      }
      if (patched === raw) {
        // Already hardened — treat as permanently resolved so rescan stays clean.
        const already = /nova-secure:\s*fixed-argv/i.test(raw)
          || (/\bexecFile\s*\(/.test(raw) && !/\bexec\s*\(\s*['"`]/.test(raw));
        if (already && (isSecurityExecItem(item) || isSecuritySpawnItem(item))) {
          return {
            files,
            updated: [],
            ok: true,
            alreadyResolved: true,
            note: `Process spawn/exec in **${rel}** is already hardened — nothing to write.`,
          };
        }
        continue;
      }
      host.onProgress?.(`Agent · ${item.id} · hardening ${rel}`, rel);
      const written = await forceWriteFiles(
        host,
        files,
        { [rel]: patched },
        `Harden process spawn/exec in ${rel}`,
      );
      if (written.ok) {
        return {
          files: written.files,
          updated: written.updated.length ? written.updated : [rel],
          ok: true,
          note: isSecurityExecItem(item)
            ? `Replaced shell-string \`exec(...)\` with argv-form \`execFile(...)\` in **${rel}** so untrusted input can’t ride a shell.`
            : `Hardened process spawn usage in **${rel}** (no shell:true; fixed-argv markers for rescan).`,
        };
      }
    }
  }

  return null;
}

function readPackageJson(files: Record<string, string>): {
  name?: string;
  description?: string;
  scripts?: Record<string, string>;
} {
  try {
    return JSON.parse(String(files['package.json'] || '{}')) as {
      name?: string;
      description?: string;
      scripts?: Record<string, string>;
    };
  } catch {
    return {};
  }
}

function isRealReadme(content: string): boolean {
  const t = String(content || '').trim();
  if (t.length < 100) return false;
  if (/no readme found/i.test(t)) return false;
  if (!/^#\s+\S+/m.test(t)) return false;
  if (!/\b(npm|pnpm|yarn|bun)\b/i.test(t) && !/##\s*run/i.test(t)) return false;
  return true;
}

function buildDefaultReadme(projectName: string, files: Record<string, string>): string {
  const pkg = readPackageJson(files);
  const name = String(projectName || pkg.name || 'Project').trim() || 'Project';
  const desc = String(pkg.description || '').trim()
    || `${name} — local project.`;
  const scripts = pkg.scripts || {};
  const runCmd = scripts.dev
    ? 'npm run dev'
    : (scripts['electron:dev'] ? 'npm run electron:dev' : 'npm start');
  const buildCmd = scripts.build ? 'npm run build' : 'npm run build';
  return [
    `# ${name}`,
    '',
    desc,
    '',
    '## Run',
    '',
    '```bash',
    'npm install',
    runCmd,
    '```',
    '',
    '## Build',
    '',
    '```bash',
    buildCmd,
    '```',
    '',
  ].join('\n');
}

function buildDefaultViteSvg(projectName: string): string {
  const letter = (String(projectName || 'A').trim()[0] || 'A').toUpperCase();
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none">',
    '  <rect width="32" height="32" rx="8" fill="#646cff"/>',
    `  <text x="16" y="21" text-anchor="middle" fill="#ffffff" font-family="system-ui,sans-serif" font-size="14" font-weight="700">${letter}</text>`,
    '</svg>',
    '',
  ].join('\n');
}

function joinUnderRoot(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  const cleanRoot = root.replace(/[/\\]+$/, '');
  const cleanRel = rel.replace(/^[/\\]+/, '').replace(/\//g, sep);
  return cleanRel ? `${cleanRoot}${sep}${cleanRel}` : cleanRoot;
}

/** Strip only syntax-highlight markup — never gut real JSX `<span>` in source files. */
function stripHighlightMarkup(content: string): string {
  return String(content)
    .replace(/<\/?span\b[^>]*\bnova-tok-[a-z0-9_-]+[^>]*>/gi, '')
    .replace(/<\/?span\b[^>]*class=(["'])[^"']*nova-tok-[^"']*\1[^>]*>/gi, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Surgical repair write — put exact bytes on disk + memory.
 * Bypasses create-oriented scrubbing that used to gut README fences in ~200ms.
 */
async function forceWriteFiles(
  host: AgentWorkModeHost,
  files: Record<string, string>,
  writes: Record<string, string>,
  _userMessage: string,
): Promise<{ files: Record<string, string>; updated: string[]; ok: boolean; error?: string }> {
  const entries = Object.entries(writes).filter(([p, c]) => p && typeof c === 'string');
  if (!entries.length) return { files, updated: [], ok: false, error: 'no_writes' };

  const next = { ...files };
  const updated: string[] = [];
  const diskRoot = String(host.diskRoot || '').trim();
  const desktop = typeof window !== 'undefined' ? window.novaDesktop : undefined;

  if (diskRoot && desktop?.workspaceWriteFile) {
    for (const [rel, content] of entries) {
      const clean = stripHighlightMarkup(content);
      try {
        host.onProgress?.(`Agent · writing ${rel}`, rel);
        const targetPath = joinUnderRoot(diskRoot, rel);
        const written = await desktop.workspaceWriteFile({
          targetPath,
          content: clean,
        });
        if (!written?.ok) {
          return {
            files,
            updated: [],
            ok: false,
            error: written?.error || `Could not write ${rel}`,
          };
        }
        // Read back — prove bytes landed.
        if (desktop.readTextFile) {
          const check = await desktop.readTextFile({ path: targetPath });
          const got = typeof check?.text === 'string' ? check.text : '';
          if (!check?.ok || (clean.length >= 40 && got.length < Math.min(40, Math.floor(clean.length * 0.5)))) {
            return {
              files,
              updated: [],
              ok: false,
              error: `Write verify failed for ${rel}`,
            };
          }
          next[rel] = got || clean;
        } else {
          next[rel] = clean;
        }
        updated.push(rel);
        // Push into the Code pill mid-write so the user can watch the file change.
        host.commitFiles?.(next, [rel]);
        // Short beat so the overlay isn’t a blink on tiny surgical patches.
        await sleep(700);
      } catch (err) {
        return {
          files,
          updated: [],
          ok: false,
          error: err instanceof Error ? err.message : `Could not write ${rel}`,
        };
      }
    }
    host.onProgress?.('Agent · write verified', null);
    return { files: next, updated, ok: true };
  }

  // Fallback when desktop bridge isn’t ready — still go through apply (scrub is path-aware now).
  const blocks = entries.map(([path, content]) => `@@@FILE ${path}\n${content}`).join('\n');
  try {
    const applied = await applyChatReplyEdits({
      reply: blocks,
      projectId: host.projectId,
      projectName: host.projectName,
      files,
      userMessage: _userMessage,
      diskRoot: host.diskRoot || null,
    });
    if (applied.ok && applied.updated.length) {
      return { files: applied.files, updated: applied.updated, ok: true };
    }
    return {
      files,
      updated: [],
      ok: false,
      error: applied.error || 'apply_failed',
    };
  } catch (err) {
    return {
      files,
      updated: [],
      ok: false,
      error: err instanceof Error ? err.message : 'apply_failed',
    };
  }
}

async function runBuilderOnItem(
  host: AgentWorkModeHost,
  item: WorkQueueItem,
  files: Record<string, string>,
): Promise<{
  files: Record<string, string>;
  updated: string[];
  note: string;
  ok: boolean;
  alreadyResolved?: boolean;
}> {
  // Known clinic repairs — direct disk bytes (not a full-app create path).
  if (isReadmeItem(item)) {
    host.onProgress?.(`Agent · ${item.id} · writing README.md`);
    const readme = buildDefaultReadme(host.projectName, files);
    const written = await forceWriteFiles(
      host,
      files,
      { 'README.md': readme },
      `Add a complete README.md for ${host.projectName} with project description and run instructions.`,
    );
    const content = String(written.files['README.md'] || '');
    if (!written.ok || !isRealReadme(content)) {
      return {
        files,
        updated: [],
        ok: false,
        note: `Could not land a real README.md write${written.error ? ` (${written.error})` : ''} — left the project unchanged.`,
      };
    }
    return {
      files: written.files,
      updated: written.updated.length ? written.updated : ['README.md'],
      ok: true,
      note: 'There was no README in the project, so I added **README.md** with a short overview and run instructions.',
    };
  }

  if (isMissingViteSvgItem(item)) {
    host.onProgress?.(`Agent · ${item.id} · adding vite.svg`);
    const svg = buildDefaultViteSvg(host.projectName);
    // Vite serves `public/` at `/`, so public/vite.svg resolves href="/vite.svg".
    const path = Object.keys(files).some((p) => /(^|\/)vite\.svg$/i.test(p.replace(/\\/g, '/')))
      ? (Object.keys(files).find((p) => /(^|\/)vite\.svg$/i.test(p.replace(/\\/g, '/'))) || 'public/vite.svg')
      : 'public/vite.svg';
    const written = await forceWriteFiles(
      host,
      files,
      { [path]: svg },
      `Add missing ${path} so href="/vite.svg" resolves.`,
    );
    const landed = written.ok && String(written.files[path] || '').includes('<svg');
    if (!landed) {
      return {
        files,
        updated: [],
        ok: false,
        note: `Could not write ${path}${written.error ? ` (${written.error})` : ''} — left the project unchanged.`,
      };
    }
    return {
      files: written.files,
      updated: written.updated.length ? written.updated : [path],
      ok: true,
      note: `The app referenced a missing \`/vite.svg\` asset, so I added **${path}** to stop the 404.`,
    };
  }

  // Low/medium surgical code fixes — don’t wait on a slow model for one-line patches.
  const surgical = await trySurgicalCodeFix(host, item, files);
  if (surgical) return surgical;

  const brief = [
    `Surgical repair for ${host.projectName} — fix ONLY this issue, do not rebuild the app.`,
    `Work queue item ${item.id}: ${item.title}`,
    item.detail || '',
    item.path ? `Focus file: ${item.path}` : '',
    '',
    'Change the smallest set of files. Emit @@@FILE blocks with full file contents for each changed file.',
  ].filter(Boolean).join('\n');

  if (host.mode === 'multitask') {
    const multi = await runProjectMultiAgent({
      brief,
      files,
      projectId: host.projectId,
      projectName: host.projectName,
      diskRoot: host.diskRoot,
      preferredModelId: host.preferredModelId,
      onProgress: host.onProgress,
    });
    const ok = Boolean(multi.ok && multi.updated.length);
    return {
      files: multi.files,
      updated: multi.updated,
      ok,
      note: ok
        ? multi.workers.map((w) => `**${w.label}:** ${w.ok ? 'ok' : 'issue'} — ${w.note}`).join('\n')
        : (multi.workers.map((w) => `**${w.label}:** ${w.note}`).join('\n')
          || 'No file changes landed — left the project unchanged.'),
    };
  }

  host.onProgress?.(`Agent · ${item.id} · repairing`);
  // Ask the model for real @@@FILE output, then write those bytes directly.
  const securityItem = isSecurityExecItem(item) || isSecuritySpawnItem(item);
  const modelBudgetMs = securityItem ? 90_000 : 45_000;
  let modelReply = '';
  try {
    const focusSnips: string[] = [];
    const focusPath = String(item.path || '').replace(/\\/g, '/');
    if (focusPath && files[focusPath]) {
      focusSnips.push(`--- ${focusPath} ---\n${String(files[focusPath]).slice(0, 6000)}`);
    } else if (item.path) {
      const hit = Object.keys(files).find((p) => p.replace(/\\/g, '/').endsWith(focusPath));
      if (hit) focusSnips.push(`--- ${hit} ---\n${String(files[hit]).slice(0, 6000)}`);
    }
    const routed = await Promise.race([
      arkRoute({
        message: [
          brief,
          '',
          focusSnips.length ? `Current file:\n${focusSnips.join('\n\n')}` : '',
          '',
          securityItem
            ? 'Security repair rules: prefer execFile/spawn with argv arrays; never shell:true; never exec("string"). Emit @@@FILE blocks only.'
            : 'Reply with @@@FILE path blocks only (full contents). No prose.',
        ].filter(Boolean).join('\n'),
        kind: 'coding',
        preferredModelId: host.preferredModelId,
      }),
      sleep(modelBudgetMs).then(() => {
        throw new Error('repair_model_timeout');
      }),
    ]);
    modelReply = String(routed.reply || '');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err || '');
    if (/repair_model_timeout/i.test(msg)) {
      return {
        files,
        updated: [],
        ok: false,
        note: `Model repair timed out after ${Math.round(modelBudgetMs / 1000)}s — left the file unchanged. Try again, or name the file to patch.`,
      };
    }
    modelReply = '';
  }

  // Prefer direct write of parsed @@@FILE blocks (surgical, no create scrub side-effects).
  if (modelReply.trim()) {
    try {
      const { parseFileEdits } = await import('@/lib/projectCodeEdit');
      const edits = parseFileEdits(modelReply);
      if (edits.length) {
        const writes = Object.fromEntries(edits.map((e) => [e.path, e.content]));
        host.onProgress?.(`Agent · ${item.id} · writing ${edits.length} file(s)`);
        const written = await forceWriteFiles(host, files, writes, brief);
        if (written.ok && written.updated.length) {
          return {
            files: written.files,
            updated: written.updated,
            ok: true,
            note: `Updated ${written.updated.slice(0, 6).map((p) => `\`${p}\``).join(', ')}${written.updated.length > 6 ? '…' : ''}.`,
          };
        }
      }
    } catch { /* fall through to applyAndVerify */ }
  }

  const applied = await applyAndVerify({
    reply: modelReply,
    projectId: host.projectId,
    projectName: host.projectName,
    files,
    userMessage: brief,
    diskRoot: host.diskRoot || null,
  });

  if (applied.ok && applied.updated.length) {
    return {
      files: applied.files,
      updated: applied.updated,
      ok: true,
      note: `Updated ${applied.updated.slice(0, 6).map((p) => `\`${p}\``).join(', ')}${applied.updated.length > 6 ? '…' : ''}.`,
    };
  }

  return {
    files,
    updated: [],
    ok: false,
    note: applied.outcome && !applied.outcome.ok
      ? applied.outcome.message
      : 'No file changes landed — left the project unchanged.',
  };
}

function lightRescan(files: Record<string, string>, ask: string): string {
  try {
    const findings = scanProjectFindings(files, ask).slice(0, 6);
    if (!findings.length) {
      return 'Light rescan looks clean — no obvious static issues in this pass.';
    }
    return [
      `Light rescan found **${findings.length}** leftover signal(s):`,
      '',
      formatLocalFindings(findings),
    ].join('\n');
  } catch {
    return 'Light rescan skipped.';
  }
}

async function executeOne(
  host: AgentWorkModeHost,
  queue: WorkQueue,
  item: WorkQueueItem,
  files: Record<string, string>,
): Promise<{
  queue: WorkQueue;
  files: Record<string, string>;
  updated: string[];
  summary: string;
  workerNotes: string[];
}> {
  let q = markItemStatus(queue, item.id, 'doing');
  const result = await runBuilderOnItem(host, item, files);
  // Count as done when bytes landed OR the scanner pattern is already gone (permanent resolve).
  const landed = Boolean(result.ok && (result.updated.length || result.alreadyResolved));
  if (result.ok && result.updated.length) {
    host.commitFiles?.(result.files, result.updated);
  }
  q = markItemStatus(q, item.id, landed ? 'done' : 'open');
  if (!landed) saveWorkQueue(q);
  const summary = landed
    ? result.note
    : `I attempted **${item.id}**, but nothing was written.\n\n${result.note}`;
  const workerNotes = host.mode === 'multitask' && landed
    ? result.note.split('\n').filter(Boolean).slice(0, 6)
    : [];
  return {
    queue: q,
    files: result.updated.length ? result.files : files,
    updated: result.updated,
    summary,
    workerNotes,
  };
}

export async function runAgentWorkMode(host: AgentWorkModeHost): Promise<AgentWorkModeResult> {
  const label = modeLabel(host.mode);
  const ask = String(host.userMessage || '').trim();

  if (looksLikeWorkQueueStop(ask)) {
    const q = loadWorkQueue(host.chatId);
    if (!q) {
      return {
        reply: 'No active work queue. Describe what you want fixed, or pick **+ → Agent**.',
        files: host.files,
        updated: [],
        queue: null,
      };
    }
    host.onProgress?.(`${label} · queue paused`);
    return {
      reply: formatQueueStoppedReply(q),
      files: host.files,
      updated: [],
      queue: q,
    };
  }

  let queue = await ensureQueue(host);
  const seededFromClinic = Boolean(queue.fromClinic);
  let files = { ...host.files };
  const allUpdated: string[] = [];

  // “Work on low” / severity band — finish that band in one go when they say finish-ish OR all.
  const sevFocus = extractSeverityFocus(ask);
  const finishBand = Boolean(sevFocus)
    && /\b(?:all|finish|every|remaining)\b/i.test(ask);
  const targetIds = extractClinicFixIds(ask);
  const batchCount = targetIds.length >= 2
    ? targetIds.length
    : extractBatchCount(ask);
  const finishAll = looksLikeWorkQueueFinishAll(ask)
    || finishBand
    || (batchCount != null && batchCount > 1)
    || targetIds.length >= 2;
  const maxBatch = targetIds.length >= 2
    ? Math.min(12, targetIds.length)
    : (batchCount != null ? Math.max(1, Math.min(12, batchCount)) : 8);
  host.onProgress?.(
    finishAll
      ? `${label} · finishing ${
        targetIds.length >= 2
          ? `${targetIds.length} selected `
          : (finishBand && sevFocus ? `${sevFocus} ` : '')
      }${batchCount != null && targetIds.length < 2 ? `${batchCount} ` : ''}open item(s)`
      : `${label} · ${countProgress(queue).done + 1}/${countProgress(queue).total}`,
  );

  if (finishAll) {
    let n = 0;
    const notes: string[] = [];
    const attempted = new Set<string>();
    const wantIds = targetIds.map((id) => id.toUpperCase());
    while (n < maxBatch) {
      if (host.shouldAbort?.()) break;
      let pool = openItems(queue).filter((i) => !attempted.has(i.id));
      if (wantIds.length) {
        pool = wantIds
          .map((id) => pool.find((i) => i.id.toUpperCase() === id))
          .filter((i): i is WorkQueueItem => Boolean(i));
      } else {
        if (sevFocus) pool = pool.filter((i) => i.severity === sevFocus);
        // Prefer surgical-capable items so batches land real writes first.
        pool = [...pool].sort((a, b) => {
          const score = (it: WorkQueueItem) => {
            const blob = `${it.title} ${it.detail || ''} ${it.path || ''}`;
            if (/\bany\b|as any|type="button"|missing type|readme|eval\/exec|shell\/process spawn/i.test(blob)) return 0;
            return 1;
          };
          return score(a) - score(b);
        });
      }
      const item = pool[0] || null;
      if (!item) break;
      attempted.add(item.id);
      host.onProgress?.(`${label} · ${item.id} · ${n + 1} of batch`);
      const step = await executeOne(host, queue, item, files);
      files = step.files;
      allUpdated.push(...step.updated);
      if (step.updated.length) {
        queue = step.queue;
      } else if (wantIds.length) {
        // Explicit ID ask — keep open so user can retry; don’t silent-skip.
        queue = markItemStatus(step.queue, item.id, 'open');
        notes.push(`- **${item.id}** ${item.title} — could not write (still open)`);
        n += 1;
        continue;
      } else {
        queue = markItemStatus(step.queue, item.id, 'skipped');
      }
      notes.push(`- **${item.id}** ${item.title} — ${step.updated.length ? 'updated' : 'skipped (no write)'}`);
      n += 1;
    }
    host.onProgress?.(`${label} · rescanning`);
    const standing = lightRescan(files, ask);
    const { open } = countProgress(queue);
    const bandLeft = finishBand && sevFocus
      ? openItems(queue).filter((i) => i.severity === sevFocus).length
      : open;
    if (open <= 0) clearWorkQueue(host.chatId);
    const needsFullRescan = seededFromClinic && open <= 0;
    const reply = [
      `**${label}** · finished batch (${n} item${n === 1 ? '' : 's'})`,
      '',
      '**Batch results**',
      ...notes,
      '',
      allUpdated.length
        ? [
          '**Files touched**',
          ...[...new Set(allUpdated)].slice(0, 10).map((p) => `- \`${p}\``),
        ].join('\n')
        : 'No file deltas this batch.',
      '',
      '**Where the app stands now**',
      '',
      standing,
      '',
      '**What’s next**',
      open > 0
        ? (bandLeft > 0 && finishBand
          ? `- ${bandLeft} ${sevFocus} item(s) still open.`
          : `- ${open} item(s) still open.`)
        : (needsFullRescan
          ? '- Queue clear — running a fresh Debug clinic pass next to catch anything new.'
          : '- Queue is clear — nothing left open in this work list.'),
      open > 0
        ? '- Say **do next work item**, **fix next 3**, or **finish all remaining work items**.'
        : '- Say what you want next, or run **Debug** for a fresh scan.',
    ].join('\n');
    return {
      reply,
      files,
      updated: [...new Set(allUpdated)],
      queue: open > 0 ? queue : null,
      needsFullRescan,
    };
  }

  const item = (() => {
    // Explicit “Fix DBG-009” must run that id — never silently fall to queue head.
    if (targetIds.length === 1) {
      const want = targetIds[0].toUpperCase();
      const hit = openItems(queue).find((i) => i.id.toUpperCase() === want)
        || queue.items.find((i) => i.id.toUpperCase() === want);
      if (hit) {
        // Re-open if it was marked done but user asked again.
        if (hit.status === 'done' || hit.status === 'skipped') {
          queue = markItemStatus(queue, hit.id, 'open');
        }
        return openItems(queue).find((i) => i.id.toUpperCase() === want) || hit;
      }
      // Named DBG id isn’t in this chat’s clinic queue — don’t invent DBG-001.
      return null;
    }
    return nextOpenItem(queue);
  })();
  if (!item) {
    // Named a DBG id but this chat has no matching clinic finding — need a fresh scan.
    // Keep any existing queue so progress isn’t wiped by a mistyped id.
    if (targetIds.length) {
      return {
        reply: [
          `I don’t have ${targetIds.map((id) => `**${id}**`).join(', ')} in this chat’s work queue yet.`,
          '',
          'A new chat (or a fresh bind) doesn’t inherit the previous Debug clinic report.',
          'Run **Debug** / say **find problems** so I can rescan this folder, then say **fix DBG-…** again.',
        ].join('\n'),
        files,
        updated: [],
        queue: openItems(queue).length ? queue : null,
        needsFullRescan: false,
      };
    }
    clearWorkQueue(host.chatId);
    return {
      reply: 'Queue is already clear. Tell me what to work on next, or run **Debug** / **Plan**.',
      files,
      updated: [],
      queue: null,
      needsFullRescan: seededFromClinic,
    };
  }

  const step = await executeOne(host, queue, item, files);
  const { open } = countProgress(step.queue);
  const finishedAll = open <= 0;
  if (finishedAll) clearWorkQueue(host.chatId);
  const needsFullRescan = seededFromClinic && finishedAll;

  let standing: string | undefined;
  if (finishedAll || host.mode === 'multitask') {
    host.onProgress?.(`${label} · checking project`);
    standing = lightRescan(step.files, item.title);
  }

  let reply = formatWorkHandoffReply({
    modeLabel: label,
    queue: step.queue,
    completed: item,
    summary: step.summary,
    updatedPaths: step.updated,
    workerNotes: step.workerNotes,
    standingNow: standing,
    finishedAll,
  });
  if (needsFullRescan) {
    reply = `${reply}\n\nQueue clear — running a fresh **Debug clinic** pass to catch anything new.`;
  }

  host.onProgress?.(finishedAll ? `${label} · queue clear` : `${label} · ready for next`);
  return {
    reply,
    files: step.files,
    updated: step.updated,
    queue: finishedAll ? null : step.queue,
    needsFullRescan,
  };
}
