/** Detect Vite + React projects that need a dev server (not static file preview). */
export function isViteProject(files: Record<string, string>): boolean {
  const pkg = String(files['package.json'] || '');
  return (
    /"vite"\s*:/.test(pkg)
    || files['vite.config.js'] != null
    || files['vite.config.ts'] != null
  );
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
  if (window.arkDesktop?.previewOpenWindow) {
    const device = opts?.device || null;
    await window.arkDesktop.previewOpenWindow({
      projectId,
      url,
      title: opts?.title || (device ? `${device.label} · Preview` : 'Preview'),
      kind: device ? 'device' : 'web',
      device: device || undefined,
      // Always navigate when opening — never leave another project's page visible.
      forceNavigate: opts?.forceNavigate !== false,
    });
    return true;
  }
  // Browser-only fallback (dev without Electron).
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
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

  if (window.arkDesktop?.previewUpdate && Object.keys(files).length) {
    const updated = await window.arkDesktop.previewUpdate({
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

  if (window.arkDesktop?.previewStart && Object.keys(files).length) {
    const res = await window.arkDesktop.previewStart({
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
    const status = await window.arkDesktop?.previewStatus?.(pid);
    if (status?.windowOpen) {
      await window.arkDesktop?.previewReload?.(pid);
      return opts.previewUrl;
    }
    if (opts.openIfClosed !== false) {
      await openInAppPreview(opts.previewUrl, { projectId: pid, title: opts.title });
    }
    return opts.previewUrl;
  }

  const status = await window.arkDesktop?.previewStatus?.(pid);
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
export async function ensureViteDevServer(cwd: string): Promise<{ ok: boolean; url?: string; error?: string }> {
  if (!window.arkDesktop?.agentStartDevServer) {
    return { ok: false, error: 'Dev server not available in this build.' };
  }
  return window.arkDesktop.agentStartDevServer({ cwd });
}

function joinRoot(root: string, rel: string): string {
  const sep = root.includes('\\') ? '\\' : '/';
  return `${root.replace(/[/\\]+$/, '')}${sep}${rel.replace(/\//g, sep)}`;
}

async function readTextRel(root: string, rel: string): Promise<string | null> {
  try {
    const read = await window.arkDesktop?.readTextFile?.({ path: joinRoot(root, rel) });
    if (read?.ok && typeof read.text === 'string') return read.text;
  } catch {
    /* missing */
  }
  return null;
}

/** Pull previewable HTML/CSS/JS (and launchers) from a bound folder without dumping the whole tree. */
export async function loadPreviewFilesFromDisk(root: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
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
    '.gitignore',
  ];
  for (const rel of textRels) {
    const text = await readTextRel(root, rel);
    if (text != null) files[rel] = text;
  }

  // Pull additional source files from src/ (and common web folders) so studio
  // rebinds never drop App.jsx / CSS after a Recent switch.
  for (const dir of ['src', 'src/components', 'src/pages', 'css', 'js', 'styles']) {
    try {
      const listing = await window.arkDesktop?.listDir?.(joinRoot(root, dir));
      if (!listing?.ok) continue;
      for (const item of listing.items || []) {
        if (item.kind !== 'file' || !item.name) continue;
        if (!/\.(html?|css|js|jsx|mjs|cjs|ts|tsx|svg|json)$/i.test(item.name)) continue;
        const rel = `${dir}/${item.name}`.replace(/\\/g, '/');
        if (files[rel]) continue;
        const text = await readTextRel(root, rel);
        if (text != null) files[rel] = text;
      }
    } catch {
      /* ignore */
    }
  }

  // Static asset siblings next to static/index.html (text only — images stay on live server).
  for (const dir of ['static', 'public', 'dist']) {
    try {
      const listing = await window.arkDesktop?.listDir?.(joinRoot(root, dir));
      if (!listing?.ok) continue;
      for (const item of listing.items || []) {
        if (item.kind !== 'file' || !item.name) continue;
        if (!/\.(html?|css|js|mjs|svg|json)$/i.test(item.name)) continue;
        const rel = `${dir}/${item.name}`;
        if (files[rel]) continue;
        const text = await readTextRel(root, rel);
        if (text != null) files[rel] = text;
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
  const viteLike = isViteProject(files) || Boolean(files['package.json']);
  if (window.arkDesktop?.agentStartFolderPreview) {
    const live = await window.arkDesktop.agentStartFolderPreview({ cwd: root });
    if (live?.ok && live.url) {
      await openInAppPreview(live.url, {
        projectId: opts.projectId,
        title: opts.title,
        forceNavigate: true,
        device: opts.device,
      });
      return { ok: true, url: live.url };
    }
    if (viteLike) {
      return {
        ok: false,
        error: live?.error
          || 'Could not start the live preview. Say **install npm dependencies** then click Localhost again.',
      };
    }
  } else if (viteLike) {
    const dev = await ensureViteDevServer(root);
    if (dev.ok && dev.url) {
      await openInAppPreview(dev.url, {
        projectId: opts.projectId,
        title: opts.title,
        forceNavigate: true,
        device: opts.device,
      });
      return { ok: true, url: dev.url };
    }
    return {
      ok: false,
      error: dev.error
        || 'Could not start the Vite preview. Say **install npm dependencies** then click Localhost again.',
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
