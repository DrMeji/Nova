/** Detect Vite + React projects that need a dev server (not static file preview). */
export function isViteProject(files: Record<string, string>): boolean {
  const pkg = String(files['package.json'] || '');
  return (
    /"vite"\s*:/.test(pkg)
    || files['vite.config.js'] != null
    || files['vite.config.ts'] != null
  );
}

/** Placeholder / not-ready preview URL — never treat as live iframe src. */
export function isPlaceholderPreviewUrl(url: string | null | undefined): boolean {
  const raw = String(url || '').trim();
  if (!raw) return true;
  if (raw.startsWith('blob:')) return true;
  if (raw.includes('127.0.0.1:0') || raw.includes('localhost:0')) return true;
  if (/:\/\/0(?:\/|$|\?)/.test(raw)) return true;
  return false;
}

/** Prefer createJob / session URL — attach only, never start a second Vite. */
export async function attachPreviewIfExists(opts: {
  cwd?: string | null;
  preferUrl?: string | null;
}): Promise<{ ok: true; url: string; attached: true } | { ok: false }> {
  const prefer = String(opts.preferUrl || '').trim();
  if (prefer && !isPlaceholderPreviewUrl(prefer)) {
    return { ok: true, url: prefer, attached: true };
  }
  const root = String(opts.cwd || '').trim();
  if (root && window.novaDesktop?.previewSession) {
    try {
      const session = await window.novaDesktop.previewSession(root);
      const decision = decidePreviewSessionAttach(session);
      if (decision.action === 'attach') {
        return { ok: true, url: decision.url, attached: true };
      }
    } catch {
      /* fall through */
    }
  }
  return { ok: false };
}

/**
 * Prefer attaching an existing preview session over starting another Vite/dev server.
 * Pure decision helper — used by ensureViteDevServer / ensureBoundFolderPreview and smokes.
 */
export function decidePreviewSessionAttach(
  session: { ok?: boolean; url?: string | null } | null | undefined,
): { action: 'attach'; url: string } | { action: 'start' } {
  const url = String(session?.url || '').trim();
  if (session?.ok && url && !isPlaceholderPreviewUrl(url)) {
    return { action: 'attach', url };
  }
  return { action: 'start' };
}

export type PreviewOpenOpts = {
  projectId?: string | null;
  title?: string;
  forceNavigate?: boolean;
  /** Phone / tablet chrome around the preview URL. */
  device?: { label: string; width: number; height: number; family?: string } | null;
};

/** Open localhost / preview in an NOVA-owned closable window (never a system browser). */
export async function openInAppPreview(
  url: string,
  opts?: PreviewOpenOpts,
): Promise<boolean> {
  if (!url) return false;
  const projectId = opts?.projectId || 'chat-preview';
  if (window.novaDesktop?.previewOpenWindow) {
    const device = opts?.device || null;
    try {
      await window.novaDesktop.previewSetActiveChat?.({ projectId });
    } catch { /* ignore */ }
    await window.novaDesktop.previewOpenWindow({
      projectId,
      url,
      title: opts?.title || (device ? `${device.label} · Preview` : 'Preview'),
      kind: device ? 'device' : 'web',
      device: device || undefined,
      show: true,
      // Reload only when forced or when switching projects (main compares base URL).
      forceNavigate: opts?.forceNavigate === true,
    });
    return true;
  }
  // Browser-only fallback (dev without Electron).
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/** True when a localhost Preview URL answers HTTP (dev server is actually up). */
export async function verifyLivePreviewUrl(url: string | null | undefined): Promise<boolean> {
  const raw = String(url || '').trim();
  if (!raw || !/localhost|127\.0\.0\.1|\[::1\]/i.test(raw)) return false;
  try {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(raw, {
      method: 'GET',
      signal: ctrl.signal,
      cache: 'no-store',
      mode: 'cors',
    });
    window.clearTimeout(timer);
    // Vite may return 200/304; some configs briefly 404 the root before HMR — treat 2xx–4xx as "server up".
    if (!(res.status > 0 && res.status < 500)) return false;
  } catch {
    return false;
  }

  // Reject raw TSX/JSX (blank Live + crash sound). Transformed modules include jsxDEV/createElement.
  for (const rel of ['/src/main.tsx', '/src/main.jsx', '/src/index.tsx', '/src/index.jsx']) {
    try {
      const ctrl = new AbortController();
      const timer = window.setTimeout(() => ctrl.abort(), 4000);
      const res = await fetch(new URL(rel, raw).href, {
        method: 'GET',
        signal: ctrl.signal,
        cache: 'no-store',
        mode: 'cors',
        headers: { Accept: 'text/javascript, application/javascript, */*' },
      });
      window.clearTimeout(timer);
      if (!res.ok) continue;
      const body = (await res.text()).slice(0, 40_000);
      if (!body) continue;
      if (/getElementById\([^)]*\)!/.test(body)) return false;
      if (/<React\.StrictMode>|<App\s*\/>/.test(body) && !/jsxDEV|createElement/.test(body)) return false;
      if (/\bimport\s+React\b/.test(body) && /from\s+['"]react['"]/.test(body) && /<[A-Z]/.test(body)) {
        return false;
      }
      if (/jsxDEV|createElement|createRoot/.test(body)) return true;
      // Transformed entry without classic markers — still accept.
      if (body.length > 200 && !/<\?xml|<html[\s>]/i.test(body)) return true;
    } catch {
      /* try next entry */
    }
  }
  // Fail closed for Vite — port up without a transformed entry is not Live.
  return false;
}

/**
 * Preflight before Live Preview — catch missing entry / assets so we don’t open a black window.
 * Returns ok:false with a human error when the tree isn’t ready to preview.
 */
export function verifyPreviewReady(files: Record<string, string>): { ok: true } | { ok: false; error: string } {
  const keys = Object.keys(files || {}).map((k) => k.replace(/\\/g, '/'));
  const has = (rel: string) => keys.some((k) => k === rel || k.endsWith(`/${rel}`));

  const htmlKey = keys.find((k) => /(^|\/)index\.html$/i.test(k) && !/(^|\/)dist\//i.test(k))
    || keys.find((k) => /(^|\/)index\.html$/i.test(k));
  if (!htmlKey) {
    return { ok: false, error: 'No index.html found — Live Preview needs an entry page before it can open.' };
  }
  const html = String(files[htmlKey] || files[Object.keys(files).find((k) => k.replace(/\\/g, '/') === htmlKey) || ''] || '');
  const entry = html.match(/<script[^>]+src=["']([^"']+)["']/i)?.[1]
    || html.match(/src=["'](\/?src\/main\.[tj]sx?)["']/i)?.[1];
  if (entry && !/^https?:/i.test(entry)) {
    const rel = entry.replace(/^\.\//, '').replace(/^\//, '');
    if (!has(rel) && !has(`src/${rel.split('/').pop()}`)) {
      // Vite resolves /src/main.tsx from disk; only fail when files map is rich and still missing.
      if (keys.length >= 8 && !keys.some((k) => k.endsWith(rel) || k.endsWith('main.tsx') || k.endsWith('main.jsx'))) {
        return {
          ok: false,
          error: `Entry script “${entry}” is missing — fix the entry file before opening Live Preview.`,
        };
      }
    }
  }

  // Icon / asset refs that would 404 and sometimes leave a broken first paint.
  const assetRefs = [...html.matchAll(/(?:href|src)=["']([^"']+\.(?:svg|png|jpe?g|ico|webp))["']/gi)]
    .map((m) => String(m[1] || '').trim())
    .filter((r) => r && !/^https?:/i.test(r) && !r.startsWith('data:'));
  for (const ref of assetRefs) {
    const clean = ref.replace(/^\.\//, '').replace(/^\//, '');
    const okAsset = has(clean)
      || has(`public/${clean}`)
      || keys.some((k) => k.endsWith(`/${clean}`) || k.endsWith(clean));
    if (!okAsset && keys.length >= 4) {
      return {
        ok: false,
        error: `Missing asset “${ref}” (referenced from index.html). Repair that finding first, then open Live.`,
      };
    }
  }

  if (isViteProject(files)) {
    if (!files['package.json'] && !keys.some((k) => k.endsWith('package.json'))) {
      return { ok: false, error: 'Vite project is missing package.json — cannot start Live Preview.' };
    }
  }

  return { ok: true };
}

/** Start / refresh the static preview server and open (or reload) the NOVA preview window. */
export async function ensureInAppPreview(opts: {
  projectId: string;
  title?: string;
  files: Record<string, string>;
  preferUrl?: string | null;
}): Promise<string | null> {
  const { projectId, title, files, preferUrl } = opts;
  // Vite / already-running localhost URL. open that host in the NOVA window.
  if (preferUrl && /localhost|127\.0\.0\.1/.test(preferUrl) && isViteProject(files)) {
    await openInAppPreview(preferUrl, { projectId, title });
    return preferUrl;
  }

  if (window.novaDesktop?.previewUpdate && Object.keys(files).length) {
    const updated = await window.novaDesktop.previewUpdate({
      projectId,
      files,
      projectName: title || 'Preview',
    });
    if (updated?.ok && updated.url) {
      if (!updated.reloaded) {
        await openInAppPreview(updated.url, { projectId, title });
      }
      return updated.url;
    }
  }

  if (window.novaDesktop?.previewStart && Object.keys(files).length) {
    const res = await window.novaDesktop.previewStart({
      projectId,
      projectName: title || 'Preview',
      files,
    });
    if (res?.ok && res.url) {
      await openInAppPreview(res.url, { projectId, title });
      return res.url;
    }
  }

  if (preferUrl) {
    await openInAppPreview(preferUrl, { projectId, title });
    return preferUrl;
  }
  return null;
}

/** After chat writes files. push into the live preview window if one is open (or start it). */
export async function refreshLivePreview(opts: {
  projectId: string | null | undefined;
  title?: string;
  files: Record<string, string>;
  previewUrl?: string | null;
  openIfClosed?: boolean;
}): Promise<string | null> {
  const pid = opts.projectId || 'chat-preview';
  const files = opts.files || {};
  if (!Object.keys(files).length && !opts.previewUrl) return opts.previewUrl || null;

  // Vite HMR already live-reloads; still poke the window so it comes to front after edits.
  if (opts.previewUrl && isViteProject(files) && /localhost|127\.0\.0\.1/.test(opts.previewUrl)) {
    const status = await window.novaDesktop?.previewStatus?.(pid);
    if (status?.windowOpen) {
      await window.novaDesktop?.previewReload?.(pid);
      return opts.previewUrl;
    }
    if (opts.openIfClosed !== false) {
      await openInAppPreview(opts.previewUrl, { projectId: pid, title: opts.title });
    }
    return opts.previewUrl;
  }

  const status = await window.novaDesktop?.previewStatus?.(pid);
  const windowOpen = Boolean(status?.windowOpen);
  if (!windowOpen && opts.openIfClosed === false) return opts.previewUrl || status?.url || null;

  return ensureInAppPreview({
    projectId: pid,
    title: opts.title,
    files,
    preferUrl: opts.previewUrl,
  });
}

/** Start Vite dev server (hidden) and return URL when the port is listening. */
export async function ensureViteDevServer(cwd: string): Promise<{ ok: boolean; url?: string; error?: string; attached?: boolean; reused?: boolean }> {
  const root = String(cwd || '').trim();
  // Prefer an already-running preview session — never spawn a second Vite for the same cwd.
  const attached = await attachPreviewIfExists({ cwd: root });
  if (attached.ok) {
    return { ok: true, url: attached.url, attached: true, reused: true };
  }
  if (root && window.novaDesktop?.getOrAttachPreview) {
    return window.novaDesktop.getOrAttachPreview(root);
  }
  if (!window.novaDesktop?.agentStartDevServer) {
    return { ok: false, error: 'Dev server not available in this build.' };
  }
  return window.novaDesktop.agentStartDevServer({ cwd: root || cwd });
}

function joinRoot(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${rel.replace(/\//g, sep)}`;
}

async function readTextRel(root: string, rel: string): Promise<string | null> {
  try {
    const read = await window.novaDesktop?.readTextFile?.({ path: joinRoot(root, rel) });
    if (read?.ok && typeof read.text === 'string') return read.text;
  } catch {
    /* missing */
  }
  return null;
}

/** Pull previewable + source text from a bound folder (recursive under src/). */
export async function loadPreviewFilesFromDisk(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const maxFiles = 220;
  const codeRe = /\.(html?|css|scss|js|jsx|mjs|cjs|ts|tsx|svg|json|md)$/i;
  const skipDir = /^(node_modules|dist|build|release|\.git|\.vite|coverage|out)$/i;
  const skipFile = /^(package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i;

  const textRels = [
    'index.html',
    'static/index.html',
    'public/index.html',
    'dist/index.html',
    'package.json',
    'vite.config.js',
    'vite.config.ts',
    'run.bat',
    'start.bat',
    'preview.bat',
    'dev.bat',
    'requirements.txt',
    'app/main.py',
    'src/main.jsx',
    'src/main.tsx',
    'src/App.jsx',
    'src/App.tsx',
    'src/App.css',
    'src/index.css',
    'src/index.js',
    'src/index.tsx',
    'css/styles.css',
    'js/app.js',
    'README.md',
    '.gitignore',
  ];
  for (const rel of textRels) {
    const text = await readTextRel(root, rel);
    if (text != null) files[rel] = text;
  }

  const walk = async (relDir: string, depth: number) => {
    if (depth > 6 || Object.keys(files).length >= maxFiles) return;
    try {
      const listing = await window.novaDesktop?.listDir?.(joinRoot(root, relDir));
      if (!listing?.ok) return;
      for (const item of listing.items || []) {
        if (Object.keys(files).length >= maxFiles) break;
        if (!item?.name) continue;
        if (skipDir.test(item.name)) continue;
        const rel = (relDir ? `${relDir}/${item.name}` : item.name).replace(/\\/g, '/');
        if (item.kind === 'dir') {
          await walk(rel, depth + 1);
          continue;
        }
        if (item.kind !== 'file') continue;
        if (skipFile.test(item.name) || !codeRe.test(item.name)) continue;
        if (files[rel]) continue;
        const text = await readTextRel(root, rel);
        if (text != null) files[rel] = text;
      }
    } catch {
      /* ignore */
    }
  };

  // Full recursive source tree — clinic + repairs need views/hooks/data, not only App.tsx.
  await walk('src', 0);
  await walk('public', 0);
  await walk('electron', 0);
  for (const dir of ['css', 'js', 'styles', 'static', 'components', 'pages', 'app']) {
    await walk(dir, 0);
  }

  // Static asset siblings next to static/index.html (text only — images stay on live server).
  // (Already covered by walk('static') / walk('public') / walk('dist') when present.)
  if (!files['dist/index.html']) {
    try {
      const listing = await window.novaDesktop?.listDir?.(joinRoot(root, 'dist'));
      if (listing?.ok) {
        for (const item of listing.items || []) {
          if (item.kind !== 'file' || !item.name) continue;
          if (!/\.(html?|css|js|mjs|svg|json)$/i.test(item.name)) continue;
          const rel = `dist/${item.name}`;
          if (files[rel]) continue;
          const text = await readTextRel(root, rel);
          if (text != null) files[rel] = text;
        }
      }
    } catch {
      /* ignore */
    }
  }

  // If only static/index.html exists, mirror it at / so NOVA's preview server can open it,
  // keeping /static/* links working for CSS/JS.
  if (!files['index.html'] && files['static/index.html']) {
    files['index.html'] = '<!DOCTYPE html><html><head><meta charset="utf-8" />'
      + '<meta http-equiv="refresh" content="0;url=/static/index.html" />'
      + '<title>Preview</title></head><body>'
      + '<p><a href="/static/index.html">Open preview</a></p></body></html>';
  }

  return files;
}

/**
 * Open the right preview for a bound folder:
 * Vite → npm run dev; FastAPI/run.bat → localhost; else static HTML in NOVA's preview window.
 */
export async function ensureBoundFolderPreview(opts: {
  root: string;
  projectId: string;
  title?: string;
  files?: Record<string, string>;
  device?: PreviewOpenOpts['device'];
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const root = String(opts.root || '').trim();
  if (!root) return { ok: false, error: 'No folder path bound.' };

  let files = opts.files && Object.keys(opts.files).length
    ? { ...opts.files }
    : await loadPreviewFilesFromDisk(root);

  // Prefer a live project server when the folder has one (Vite / run.bat / FastAPI).
  // Never fall through to static HTML for Vite — serving raw JSX is a blank black window.
  const viteLike = isViteProject(files);

  const ready = verifyPreviewReady(files);
  if (!ready.ok) return ready;

  // Attach to an existing preview session before starting another Vite.
  const attached = await attachPreviewIfExists({ cwd: root });
  if (attached.ok) {
    const alive = await verifyLivePreviewUrl(attached.url);
    if (alive) {
      await openInAppPreview(attached.url, {
        projectId: opts.projectId,
        title: opts.title,
        forceNavigate: true,
        device: opts.device,
      });
      return { ok: true, url: attached.url };
    }
    // Stale/dead session — fall through and start a fresh one.
  }

  if (window.novaDesktop?.getOrAttachPreview) {
    const live = await window.novaDesktop.getOrAttachPreview(root);
    if (live?.ok && live.url && !isPlaceholderPreviewUrl(live.url)) {
      const alive = await verifyLivePreviewUrl(live.url);
      if (alive) {
        await openInAppPreview(live.url, {
          projectId: opts.projectId,
          title: opts.title,
          forceNavigate: true,
          device: opts.device,
        });
        return { ok: true, url: live.url };
      }
    }
    // Vite (including Electron+Vite) must never open as static HTML — that is the black window.
    if (viteLike) {
      return {
        ok: false,
        error: live?.error
          || 'Could not start the live preview server. Say **install npm dependencies**, then click Live again.',
      };
    }
  } else if (window.novaDesktop?.agentStartFolderPreview) {
    const live = await window.novaDesktop.agentStartFolderPreview({ cwd: root });
    if (live?.ok && live.url && !isPlaceholderPreviewUrl(live.url)) {
      const alive = await verifyLivePreviewUrl(live.url);
      if (alive) {
        await openInAppPreview(live.url, {
          projectId: opts.projectId,
          title: opts.title,
          forceNavigate: true,
          device: opts.device,
        });
        return { ok: true, url: live.url };
      }
    }
    if (viteLike) {
      return {
        ok: false,
        error: live?.error
          || 'Could not start the live preview server. Say **install npm dependencies**, then click Live again.',
      };
    }
  } else if (viteLike) {
    // Renderer-only path (no Electron IPC). Still avoid electron-flavored npm run dev when possible.
    const lookElectron = (() => {
      try {
        const raw = files['package.json'] || '';
        return /"electron"|vite-plugin-electron|dist-electron/i.test(raw);
      } catch {
        return false;
      }
    })();
    if (!lookElectron) {
      const dev = await ensureViteDevServer(root);
      if (dev.ok && dev.url && !isPlaceholderPreviewUrl(dev.url)) {
        const alive = await verifyLivePreviewUrl(dev.url);
        if (alive) {
          await openInAppPreview(dev.url, {
            projectId: opts.projectId,
            title: opts.title,
            forceNavigate: true,
            device: opts.device,
          });
          return { ok: true, url: dev.url };
        }
      }
      return {
        ok: false,
        error: dev.error
          || 'Could not start the Vite preview. Say **install npm dependencies** then click Live again.',
      };
    }
    return {
      ok: false,
      error: 'Electron+Vite preview needs the desktop bridge. Restart NOVA, then click Live again.',
    };
  }

  if (!Object.keys(files).length) {
    files = await loadPreviewFilesFromDisk(root);
  }

  if (files['index.html'] || files['static/index.html'] || files['public/index.html']) {
    const url = await ensureInAppPreview({
      projectId: opts.projectId,
      title: opts.title,
      files,
      preferUrl: null,
    });
    if (url) {
      if (opts.device) {
        await openInAppPreview(url, {
          projectId: opts.projectId,
          title: opts.title,
          forceNavigate: true,
          device: opts.device,
        });
      }
      return { ok: true, url };
    }
  }

  return {
    ok: false,
    error: 'No previewable page found (index.html, static/, Vite, or run.bat localhost). Folder pill still opens Explorer.',
  };
}
