/**
 * Create project from Chat. resolve path → mkdir → bind → scaffold write.
 */

import type { NewProjectIntent } from '@/lib/createProjectIntent';
import { resolveProjectKindForCreate } from '@/lib/projectKind';
import { buildScaffoldFiles, projectUsesNpm } from '@/lib/projectScaffolds';
import { grantsFromPrefs, hasFolderAccessGrant, syncWorkspaceGrantsFromPrefs } from '@/lib/workspaceGrants';
import { safeProjectWrite } from '@/lib/projectWriteSafe';
import { runAgentCommand } from '@/lib/chatAgentExec';
import { cleanProductTitle } from '@/lib/freshSpaFromBrief';
import { slugifyProjectName } from '@/lib/projectNames';
import { attachPreviewIfExists, isPlaceholderPreviewUrl, verifyLivePreviewUrl } from '@/lib/projectPreview';

export type ProjectBootstrapResult = {
  npmInstalled: boolean;
  /** Install kicked off in background — not a failure. */
  npmPending?: boolean;
  /** Set only when the Vite/dev server answered HTTP (localhost live). */
  devServerUrl?: string;
  bootstrapNote?: string;
  /** True when a localhost Preview probe succeeded for this create. */
  previewLive?: boolean;
  /** True when Preview Ready code scan passed before claiming Live verified. */
  codeVerified?: boolean;
};

export type CreateProjectResult = {
  ok: boolean;
  projectPath?: string;
  projectId?: string;
  parentSource?: string;
  written: string[];
  files: Record<string, string>;
  error?: string;
  grantHint?: string;
};

function joinPath(root: string, name: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${name}`;
}

export async function resolveNewProjectParent(
  intent: NewProjectIntent,
): Promise<{ parentPath: string; source: string; grantHint?: string }> {
  await syncWorkspaceGrantsFromPrefs();
  const grants = grantsFromPrefs();

  // Honor Settings → Projects → Default project location when it looks like a real path
  // AND folder grants allow writing there. Never force Documents/Desktop without grants
  // (that produced instant "Path is outside an approved NOVA workspace" on create).
  try {
    const { getLocalPrefs } = await import('@/lib/localPrefs');
    const locRaw = String(getLocalPrefs().projectLocation || '').trim();
    let loc = locRaw;
    if (loc.startsWith('~/') || loc === '~') {
      const roots = await window.novaDesktop?.browseRoots?.();
      const docs = roots?.roots?.find(r => r.id === 'documents')?.path;
      const desk = roots?.roots?.find(r => r.id === 'desktop')?.path;
      const base = (grants.documents && docs) || (grants.desktop && desk) || '';
      if (base) {
        const rest = loc === '~' ? 'NOVA Projects' : loc.replace(/^~[/\\]?/, '');
        loc = joinPath(base, rest.replace(/^NOVA\/Projects$/i, 'NOVA Projects'));
      } else {
        loc = '';
      }
    }
    if (
      loc
      && !loc.startsWith('~')
      && (/^[A-Za-z]:[\\/]/.test(loc) || loc.startsWith('/'))
      && (grants.fullPc || grants.documents || grants.desktop || hasFolderAccessGrant())
    ) {
      const parentPath = joinPath(loc.replace(/[/\\]+$/, ''), intent.slug);
      return { parentPath, source: loc };
    }
  } catch {
    /* fall through */
  }

  if (intent.explicitPath) {
    const parent = intent.explicitPath.replace(/[/\\][^/\\]+$/, '');
    return { parentPath: joinPath(parent, intent.slug), source: intent.explicitPath };
  }

  const roots = await window.novaDesktop?.browseRoots?.();
  const desktop = roots?.roots?.find(r => r.id === 'desktop')?.path;
  const documents = roots?.roots?.find(r => r.id === 'documents')?.path;

  // Prefer NOVA's own projects folder (not Desktop\Projects).
  if (grants.documents && documents) {
    const novaDir = joinPath(documents, 'NOVA Projects');
    await window.novaDesktop?.workspaceMkdir?.({ targetPath: novaDir });
    return { parentPath: joinPath(novaDir, intent.slug), source: 'Documents\\NOVA Projects' };
  }

  if (grants.desktop && desktop) {
    const novaDir = joinPath(desktop, 'NOVA Projects');
    await window.novaDesktop?.workspaceMkdir?.({ targetPath: novaDir });
    return { parentPath: joinPath(novaDir, intent.slug), source: 'Desktop\\NOVA Projects' };
  }

  // First create with grants never touched: enable Documents so mkdir is not blocked.
  if (documents && !grants.documents && !grants.desktop && !grants.fullPc) {
    try {
      const { setLocalPrefs } = await import('@/lib/localPrefs');
      setLocalPrefs({ allowDocumentsFolderAccess: true });
      await window.novaDesktop?.workspaceSetGrants?.({
        desktop: false,
        documents: true,
        fullPc: false,
        executionMode: grants.executionMode || 'allowlist',
      });
      const novaDir = joinPath(documents, 'NOVA Projects');
      const mkdir = await window.novaDesktop?.workspaceMkdir?.({ targetPath: novaDir });
      if (mkdir?.ok !== false) {
        return { parentPath: joinPath(novaDir, intent.slug), source: 'Documents\\NOVA Projects' };
      }
    } catch {
      /* fall through to sandbox */
    }
  }

  const sandbox = await window.novaDesktop?.workspaceSandboxRoot?.();
  if (sandbox?.ok && sandbox.path) {
    return {
      parentPath: joinPath(sandbox.path, intent.slug),
      source: 'NOVA Projects folder',
      grantHint: !hasFolderAccessGrant()
        ? 'Folder access is off. created inside NOVA storage. Enable **Settings → Security → Documents** (or Desktop) to use **NOVA Projects** next time.'
        : undefined,
    };
  }

  return {
    parentPath: '',
    source: '',
    grantHint: 'Turn on **Documents** or **Desktop** folder access in Settings → Security so NOVA can create projects in **NOVA Projects**.',
  };
}

export async function runCreateProjectFlow(
  intent: NewProjectIntent,
  projectId: string,
  opts?: {
    /** Fired before each scaffold file is written so chat can show “Building App.tsx…”. */
    onFileWrite?: (relPath: string, content?: string) => void;
  },
): Promise<CreateProjectResult> {
  const name = cleanProductTitle(intent.name);
  const cleaned: NewProjectIntent = {
    ...intent,
    name,
    slug: slugifyProjectName(name),
  };
  const { parentPath, source, grantHint } = await resolveNewProjectParent(cleaned);
  if (!parentPath) {
    return {
      ok: false,
      written: [],
      files: {},
      error: grantHint || 'Could not resolve a folder to create the project.',
      grantHint,
    };
  }

  // If the preferred name is taken, pick My 2 / Northline 3 — never block on a leftover folder.
  const parentDir = parentPath.replace(/[/\\][^/\\]+$/, '');
  let finalPath = parentPath;
  let finalName = cleaned.name;
  let finalSlug = cleaned.slug;
  let mkdir: { ok?: boolean; error?: string; path?: string; existed?: boolean; created?: boolean } | undefined;
  for (let i = 0; i < 80; i++) {
    const trySlug = i === 0 ? cleaned.slug : `${cleaned.slug}-${i + 1}`;
    const tryName = i === 0 ? cleaned.name : `${cleaned.name} ${i + 1}`;
    const tryPath = i === 0 ? parentPath : joinPath(parentDir, trySlug);
    mkdir = await window.novaDesktop?.workspaceMkdir?.({ targetPath: tryPath });
    if (mkdir?.ok) {
      finalPath = tryPath;
      finalName = tryName;
      finalSlug = trySlug;
      break;
    }
    if (mkdir?.error === 'exists_nonempty') continue;
    return {
      ok: false,
      written: [],
      files: {},
      error: mkdir?.error || 'Could not create project folder.',
      grantHint,
    };
  }
  if (!mkdir?.ok) {
    return {
      ok: false,
      written: [],
      files: {},
      error: `Could not find a free folder name near “${cleaned.name}”. Remove an old project in Projects, or pick another name.`,
      grantHint,
    };
  }

  const bind = await window.novaDesktop?.workspaceOpenRoot?.({
    projectId,
    projectName: finalName,
    sourceDir: finalPath,
    catalogOnly: true,
  });

  if (!bind?.ok || !bind.root) {
    return {
      ok: false,
      written: [],
      files: {},
      error: bind?.error || 'Could not open the new project folder.',
      grantHint,
    };
  }

  cleaned.name = finalName;
  cleaned.slug = finalSlug;

  const scaffoldKind = resolveProjectKindForCreate(cleaned.summary, cleaned.kind, cleaned.kind);
  // Skills are for LLM prompts only — never bake "NOVA design skills" copy into App.jsx.
  let preferredLanguage = 'TypeScript';
  try {
    const { getLocalPrefs } = await import('@/lib/localPrefs');
    preferredLanguage = getLocalPrefs().preferredLanguage || preferredLanguage;
  } catch { /* defaults */ }
  const scaffold = buildScaffoldFiles(scaffoldKind, {
    name: cleaned.name,
    summary: cleaned.summary,
    preferredLanguage,
  });
  const fileMap = Object.fromEntries(scaffold.map(f => [f.path.replace(/\\/g, '/'), f.content]));

  // Write one file at a time so the chat bubble can name each path (not a silent bulk dump).
  const orderedPaths = Object.keys(fileMap).sort((a, b) => {
    const rank = (p: string) => {
      if (/package\.json$/i.test(p)) return 0;
      if (/tsconfig/i.test(p)) return 1;
      if (/vite\.config/i.test(p)) return 2;
      if (/index\.html$/i.test(p)) return 3;
      if (/main\.(tsx|jsx)$/i.test(p)) return 4;
      if (/App\.(tsx|jsx)$/i.test(p)) return 5;
      if (/App\.css$/i.test(p)) return 6;
      if (/index\.css$/i.test(p)) return 7;
      if (/\.gitignore$/i.test(p)) return 8;
      return 9;
    };
    return rank(a) - rank(b) || a.localeCompare(b);
  });
  const written: string[] = [];
  for (const rel of orderedPaths) {
    const content = fileMap[rel];
    if (content == null) continue;
    opts?.onFileWrite?.(rel, content);
    const writeOne = await safeProjectWrite({
      projectId,
      projectName: cleaned.name,
      files: { [rel]: content },
    });
    if (!writeOne.ok) {
      return {
        ok: false,
        projectPath: bind.root,
        projectId,
        parentSource: source,
        written,
        files: {},
        error: writeOne.error || `Scaffold write failed on ${rel}.`,
        grantHint,
      };
    }
    written.push(...(writeOne.files || [rel]));
    // Yield so the generating bubble can paint the new status before the next file.
    await new Promise((r) => setTimeout(r, 140));
  }

  if (!written.length) {
    return {
      ok: false,
      projectPath: bind.root,
      projectId,
      parentSource: source,
      written: [],
      files: {},
      error: 'Scaffold write failed — no files written.',
      grantHint,
    };
  }

  // Fail-closed: confirm key files actually exist on disk (not just write ACK).
  const sep = finalPath.includes('\\') ? '\\' : '/';
  const mustCheck = Object.keys(fileMap).filter((p) =>
    /(^|\/)(package\.json|index\.html|vite\.config\.(js|ts)|src\/main\.(jsx|tsx)|src\/App\.(jsx|tsx)|src\/index\.css)$/i.test(p),
  );
  const missingOnDisk: string[] = [];
  for (const rel of mustCheck) {
    const full = `${finalPath.replace(/[/\\]+$/, '')}${sep}${rel.replace(/\//g, sep)}`;
    try {
      const st = await window.novaDesktop?.workspaceStatPath?.(full);
      if (!st?.ok || !st.isFile) missingOnDisk.push(rel);
    } catch {
      missingOnDisk.push(rel);
    }
  }
  if (missingOnDisk.length) {
    // One rewrite pass, then re-check.
    const retry = await safeProjectWrite({
      projectId,
      projectName: cleaned.name,
      files: Object.fromEntries(missingOnDisk.map((p) => [p, fileMap[p]]).filter(([, c]) => Boolean(c))),
    });
    if (!retry.ok) {
      return {
        ok: false,
        projectPath: bind.root,
        projectId,
        parentSource: source,
        written: [],
        files: {},
        error: `Scaffold wrote incompletely (missing ${missingOnDisk.slice(0, 4).join(', ')}). ${retry.error || ''}`.trim(),
        grantHint,
      };
    }
    const stillMissing: string[] = [];
    for (const rel of missingOnDisk) {
      const full = `${finalPath.replace(/[/\\]+$/, '')}${sep}${rel.replace(/\//g, sep)}`;
      const st = await window.novaDesktop?.workspaceStatPath?.(full);
      if (!st?.ok || !st.isFile) stillMissing.push(rel);
    }
    if (stillMissing.length) {
      return {
        ok: false,
        projectPath: bind.root,
        projectId,
        parentSource: source,
        written: [],
        files: {},
        error: `Could not verify files on disk: ${stillMissing.slice(0, 6).join(', ')}.`,
        grantHint,
      };
    }
  }

  return {
    ok: true,
    projectPath: bind.root,
    projectId,
    parentSource: source,
    written,
    files: fileMap,
    grantHint,
  };
}

/** True when cwd has a package.json (async disk check). */
async function folderHasPackageJson(projectPath: string): Promise<boolean> {
  const sep = projectPath.includes('\\') ? '\\' : '/';
  const pkg = `${projectPath.replace(/[/\\]+$/, '')}${sep}package.json`;
  try {
    const st = await window.novaDesktop?.workspaceStatPath?.(pkg);
    if (st?.ok && st.isFile) return true;
  } catch {
    /* fall through */
  }
  try {
    // Avoid node -e (blocked). Presence via directory listing is enough.
    const listed = await window.novaDesktop?.agentRun?.({
      command: 'npm --version',
      cwd: projectPath,
      skipConfirm: true,
      userConfirmed: true,
    });
    if (listed?.ok) {
      const st2 = await window.novaDesktop?.workspaceStatPath?.(pkg);
      if (st2?.ok && st2.isFile) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

function sanitizeBootstrapNote(raw: string | undefined): string | undefined {
  const t = String(raw || '').trim();
  if (!t) return undefined;
  // Drop raw stack / path dumps; keep a short human line when possible.
  if (/at\s+\S+\s+\(|node:internal\/|Error:\s*ENOENT:.*\\/i.test(t) && t.length > 180) {
    if (/node|npm|not recognized|not found|eresolve|peer dep/i.test(t)) {
      return 'npm install failed (Node/npm missing or dependency conflict).';
    }
    return undefined;
  }
  return t.replace(/\s+/g, ' ').slice(0, 280);
}

function npmInstallLooksFailed(outcome: { ok?: boolean; reply?: string; handled?: boolean }): boolean {
  // Prefer the shell exit flag from runAgentCommand.
  if (outcome.ok === true) return false;
  if (outcome.ok === false) return true;
  if (!outcome.handled) return true;
  const r = String(outcome.reply || '');
  if (/could not run|ENOENT|npm\s*err|ERESOLVE|not recognized|is not recognized|command failed/i.test(r)) {
    return true;
  }
  if (/dependencies installed successfully|added \d+ package|up to date|audited \d+ package/i.test(r)) {
    return false;
  }
  // Unknown outcome without ok:true — treat as failed so we never fake Ready.
  return true;
}

/** True when node_modules/vite is on disk (usable install, even if npm timed out). */
async function projectHasViteModules(projectPath: string): Promise<boolean> {
  try {
    const base = String(projectPath || '').replace(/[\\/]+$/, '');
    if (!base) return false;
    const candidates = [
      `${base}\\node_modules\\vite`,
      `${base}/node_modules/vite`,
    ];
    for (const vitePath of candidates) {
      const st = await window.novaDesktop?.pathStat?.(vitePath);
      if (st?.ok && (st.isDirectory || st.isFile)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** After a timed-out / killed npm, keep polling briefly — Windows often finishes unpack late. */
async function waitForViteModules(
  projectPath: string,
  opts?: { onStatus?: (label: string) => void; waitMs?: number },
): Promise<boolean> {
  const waitMs = Math.max(5_000, opts?.waitMs ?? 90_000);
  const t0 = Date.now();
  if (await projectHasViteModules(projectPath)) return true;
  opts?.onStatus?.(
    'npm reported a timeout — checking whether packages finished unpacking…',
  );
  while (Date.now() - t0 < waitMs) {
    await new Promise((r) => window.setTimeout(r, 2_500));
    if (await projectHasViteModules(projectPath)) return true;
    const s = Math.round((Date.now() - t0) / 1000);
    opts?.onStatus?.(
      `Waiting for node_modules/vite after npm timeout… ${s}s`,
    );
  }
  return projectHasViteModules(projectPath);
}

/** npm install + dev server. only when the project actually uses npm. */
export async function bootstrapProjectWorkspace(
  projectPath: string,
  kind: NewProjectIntent['kind'],
  opts?: {
    files?: Record<string, string>;
    preferPreviewUrl?: string | null;
    onStatus?: (label: string) => void;
    /** Hard wall for npm install (default 3 minutes). */
    npmTimeoutMs?: number;
    /** Internal: set on the single automatic re-install so it never loops. */
    autoRetried?: boolean;
  },
): Promise<ProjectBootstrapResult> {
  if (!projectPath) {
    return { npmInstalled: true };
  }

  const filesHavePkg = Boolean(
    opts?.files
    && Object.keys(opts.files).some(p => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/'))),
  );
  const diskHasPkg = filesHavePkg || (await folderHasPackageJson(projectPath));

  // Static HTML/CSS/JS scaffolds (no package.json) must never run npm.
  // If package.json exists on disk/files, ALWAYS install — wrong kind (e.g. static-web
  // mis-detect on a Vite todo) used to skip npm and then claim Live without node_modules.
  if (!diskHasPkg) {
    return { npmInstalled: true };
  }
  if (!projectUsesNpm(kind)) {
    // package.json present but kind says static — still treat as npm project.
    opts?.onStatus?.('package.json found — installing deps even though kind looked static…');
  }

  // If createJob already has a live URL, attach only when modules exist AND HTTP is healthy.
  const earlyAttach = await attachPreviewIfExists({
    cwd: projectPath,
    preferUrl: opts?.preferPreviewUrl,
  });
  if (earlyAttach.ok && earlyAttach.url) {
    const hasModules = await projectHasViteModules(projectPath).catch(() => false);
    const healthy = hasModules ? await verifyLivePreviewUrl(earlyAttach.url).catch(() => false) : false;
    if (hasModules && healthy) {
      return { npmInstalled: true, devServerUrl: earlyAttach.url, previewLive: true };
    }
  }

  // Windows Defender + first Vite install often needs >5 min; keep a long wall.
  const npmTimeoutMs = Math.max(180_000, opts?.npmTimeoutMs ?? 420_000);
  const depHint = (() => {
    const pkgRaw = opts?.files
      && Object.entries(opts.files).find(([p]) => /(^|\/)package\.json$/i.test(p.replace(/\\/g, '/')))?.[1];
    if (!pkgRaw) return 'react, vite, and friends';
    try {
      const pkg = JSON.parse(pkgRaw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const names = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
      ].filter(Boolean);
      if (!names.length) return 'react, vite, and friends';
      const head = names.slice(0, 4).join(', ');
      return names.length > 4 ? `${head}, +${names.length - 4} more` : head;
    } catch {
      return 'react, vite, and friends';
    }
  })();
  opts?.onStatus?.(
    `Installing npm packages (${depHint}) — up to ${Math.round(npmTimeoutMs / 60_000)} min…`,
  );
  let npmBeat: number | null = null;
  const npmStarted = Date.now();
  if (typeof window !== 'undefined') {
    npmBeat = window.setInterval(() => {
      const s = Math.round((Date.now() - npmStarted) / 1000);
      const m = Math.floor(s / 60);
      const rem = s % 60;
      const clock = m > 0 ? `${m}m ${rem}s` : `${s}s`;
      opts?.onStatus?.(
        s < 45
          ? `npm downloading ${depHint}… ${clock}`
          : `npm still unpacking node_modules (${depHint})… ${clock} — first install is slow on Windows`,
      );
    }, 5_000);
  }
  let install: Awaited<ReturnType<typeof runAgentCommand>>;
  try {
    // Single wall: Electron agentRun timeout. Do not Promise.race a second
    // renderer timer — that raced ahead, reported failure, and left npm/Vite half-done.
    install = await runAgentCommand({
      command: 'npm install',
      cwd: projectPath,
      skipConfirm: true,
      timeoutMs: npmTimeoutMs,
    });
  } finally {
    if (npmBeat != null) window.clearInterval(npmBeat);
  }

  if (npmInstallLooksFailed(install)) {
    // Timeout/kill often happens after packages are already on disk — recover.
    const recovered = await waitForViteModules(projectPath, {
      onStatus: opts?.onStatus,
      waitMs: 90_000,
    });
    if (!recovered) {
      // Probe node from the project folder (homedir often fails the workspace-grant check
      // and falsely reports “Node.js is not installed”).
      const nodeOk = await window.novaDesktop?.agentRun?.({
        command: 'node -v',
        cwd: projectPath,
        skipConfirm: true,
        userConfirmed: true,
      });
      const nodeMissing = !nodeOk?.ok
        && /not recognized|ENOENT|command not found|is not recognized/i.test(
          String(nodeOk?.error || nodeOk?.output || ''),
        );
      if (nodeMissing) {
        return {
          npmInstalled: false,
          previewLive: false,
          bootstrapNote: 'Node.js is not installed. Install Node.js LTS, then say **install npm dependencies** or **run Preview**.',
        };
      }
      return {
        npmInstalled: false,
        previewLive: false,
        bootstrapNote: sanitizeBootstrapNote(install.reply)
          || 'Could not install npm dependencies automatically. Say **install npm dependencies** to retry, or open the folder and run `npm install` once.',
      };
    }
    opts?.onStatus?.('Packages found on disk after npm timeout — continuing to Live…');
  }

  // Install "ok" but node_modules missing → still not runnable (Windows race / partial unpack).
  if (!(await projectHasViteModules(projectPath))) {
    const late = await waitForViteModules(projectPath, {
      onStatus: opts?.onStatus,
      waitMs: 45_000,
    });
    if (!late) {
      // Partial unpack / Defender race: auto-retry the install once instead of bouncing to the user.
      if (!opts?.autoRetried) {
        opts?.onStatus?.('npm finished without vite — retrying install once…');
        return bootstrapProjectWorkspace(projectPath, kind, { ...opts, autoRetried: true });
      }
      return {
        npmInstalled: false,
        previewLive: false,
        bootstrapNote:
          'npm finished twice without a usable node_modules (vite missing). Say **install npm dependencies** to try again, or delete `node_modules` and retry.',
      };
    }
  }

  // Prefer an already-running create/preview session — never start a second Vite.
  const attached = await attachPreviewIfExists({
    cwd: projectPath,
    preferUrl: opts?.preferPreviewUrl,
  });
  if (attached.ok) {
    return { npmInstalled: true, devServerUrl: attached.url, previewLive: true };
  }

  // SSOT: getOrAttachPreview attaches or starts once for this cwd.
  if (window.novaDesktop?.getOrAttachPreview) {
    let live = await window.novaDesktop.getOrAttachPreview(projectPath);
    if (live?.ok && live.url && !isPlaceholderPreviewUrl(live.url)) {
      return { npmInstalled: true, devServerUrl: live.url, previewLive: true };
    }
    // Zombie Vite on 5200–5350 is a common Windows fail — free ports and retry once.
    opts?.onStatus?.('Live port busy — clearing stale preview servers and retrying…');
    try {
      await window.novaDesktop?.agentRun?.({
        command: 'powershell -NoProfile -Command "5200..5350 | ForEach-Object { Get-NetTCPConnection -LocalPort $_ -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"',
        cwd: projectPath,
        skipConfirm: true,
        userConfirmed: true,
        timeoutMs: 20_000,
      });
    } catch { /* best-effort */ }
    await new Promise((r) => setTimeout(r, 1500));
    live = await window.novaDesktop.getOrAttachPreview(projectPath);
    if (live?.ok && live.url && !isPlaceholderPreviewUrl(live.url)) {
      return { npmInstalled: true, devServerUrl: live.url, previewLive: true };
    }
    // Last automatic attempt: start the dev server directly (deps already verified above).
    opts?.onStatus?.('Preview did not attach — starting the dev server directly…');
    try {
      const direct = await window.novaDesktop?.agentStartDevServer?.({ cwd: projectPath, depsReady: true });
      if (direct?.ok && direct.url && !isPlaceholderPreviewUrl(direct.url)) {
        return { npmInstalled: true, devServerUrl: direct.url, previewLive: true };
      }
    } catch { /* fall through to the note */ }
    return {
      npmInstalled: true,
      previewLive: false,
      bootstrapNote: sanitizeBootstrapNote(
        live?.error
          ? `Dependencies installed. I retried Preview and the dev server directly, but it still did not start (${live.error}). Click **Live** to try once more, or open the folder and run \`npm run dev\`.`
          : 'Dependencies installed. I retried Preview twice but the server did not respond. Click **Live** to try once more, or open the folder and run `npm run dev`.',
      ),
    };
  }

  // depsReady: skip a second npm install — double install was freezing the whole PC.
  const dev = await window.novaDesktop?.agentStartDevServer?.({
    cwd: projectPath,
    depsReady: true,
  });
  if (dev?.ok && dev.url && !isPlaceholderPreviewUrl(dev.url)) {
    return { npmInstalled: true, devServerUrl: dev.url, previewLive: true };
  }

  return {
    npmInstalled: true,
    previewLive: false,
    bootstrapNote: sanitizeBootstrapNote(
      dev?.error
        ? `Dependencies installed. Dev server did not start (${dev.error}). Say **run Preview** or **run dev server**.`
        : 'Dependencies installed, but the live Preview server did not respond yet. Say **run Preview** to retry.',
    ),
  };
}

export function formatCreateProjectReply(
  intent: NewProjectIntent,
  result: CreateProjectResult,
  bootstrap?: ProjectBootstrapResult,
): string {
  if (!result.ok) {
    return result.error || 'Could not create the project.';
  }

  const displayName = cleanProductTitle(intent.name);
  const hasPackageJson = Boolean(
    result.files && Object.keys(result.files).some(p => /package\.json$/i.test(p.replace(/\\/g, '/'))),
  );
  const isStatic = intent.kind === 'static-web'
    || (!hasPackageJson && intent.kind !== 'vite-react' && intent.kind !== 'python');
  const livePreview = Boolean(bootstrap?.previewLive && bootstrap?.devServerUrl);
  const codeVerified = bootstrap?.codeVerified === true;
  const folderLine = result.projectPath
    ? `- Folder: \`${result.projectPath}\``
    : '';

  let body: string;
  if (livePreview && codeVerified) {
    body = [
      `**${displayName}** is up — files on disk, install finished, Live checked out.`,
      folderLine,
      '',
      'Peek at **Live** under the chat, or tell me what to tweak.',
    ].filter(Boolean).join('\n');
  } else if (livePreview) {
    body = [
      `**${displayName}** is on disk. Live is open — tell me what to tighten if anything looks off.`,
      folderLine,
      '',
      'Open **Live** under the chat, or say what to fix.',
    ].filter(Boolean).join('\n');
  } else if (bootstrap?.npmPending) {
    body = [
      `Created **${displayName}** — finishing setup (installing packages).`,
      folderLine,
      '',
      'Live unlocks when Ready. If it stalls, say **install npm dependencies**.',
    ].filter(Boolean).join('\n');
  } else if (bootstrap?.npmInstalled === false) {
    body = [
      `Got **${displayName}** on disk, but install did not finish — Live stays locked until it does.`,
      folderLine,
      '',
      bootstrap.bootstrapNote || 'Say **install npm dependencies** and I will retry.',
    ].filter(Boolean).join('\n');
  } else if (intent.kind === 'python') {
    body = [
      `**${displayName}** is on disk.`,
      folderLine,
      '',
      'We can dig into `app/main.py` next, or you can tell me what to build.',
    ].filter(Boolean).join('\n');
  } else if (hasPackageJson || projectUsesNpm(intent.kind)) {
    // Vite/npm apps must never claim casual success without Live evidence.
    body = [
      `**${displayName}** is on disk, but Live did not verify.`,
      '',
      '- Project files written on disk',
      bootstrap?.npmInstalled !== true
        ? '- Dependencies are not installed yet'
        : '- Dependencies may be installed, but Live evidence did not pass',
      '- Live stays locked until mount + console + smoke verify',
      folderLine,
      '',
      bootstrap?.bootstrapNote
        || 'Tell me what to fix, or open **Live** under the chat to retry. I will not claim success until Live verifies.',
    ].filter(Boolean).join('\n');
  } else if (isStatic) {
    body = [
      `Created **${displayName}**.`,
      '',
      '- Project files written on disk',
      folderLine,
      '',
      bootstrap?.bootstrapNote
        || 'Open **Live** when it appears under the chat, or tell me what to change next.',
    ].filter(Boolean).join('\n');
  } else {
    body = [
      `Created **${displayName}**.`,
      '',
      '- Project files written on disk',
      folderLine,
      '',
      'Tell me what you want to change next.',
    ].filter(Boolean).join('\n');
  }

  return `${body}${result.grantHint ? `\n\n_${result.grantHint}_` : ''}`;
}

