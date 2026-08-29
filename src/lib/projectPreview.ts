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
};

/** Open localhost / preview in an ARK-owned closable window (never a system browser). */
export async function openInAppPreview(
  url: string,
  opts?: PreviewOpenOpts,
): Promise<boolean> {
  if (!url) return false;
  const projectId = opts?.projectId || 'chat-preview';
  if (window.arkDesktop?.previewOpenWindow) {
    await window.arkDesktop.previewOpenWindow({
      projectId,
      url,
      title: opts?.title || 'Preview',
      kind: 'web',
      // Always navigate when opening — never leave another project's page visible.
      forceNavigate: opts?.forceNavigate !== false,
    });
    return true;
  }
  // Browser-only fallback (dev without Electron).
  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}

/** Start / refresh the static preview server and open (or reload) the ARK preview window. */
export async function ensureInAppPreview(opts: {
  projectId: string;
  title?: string;
  files: Record<string, string>;
  preferUrl?: string | null;
}): Promise<string | null> {
  const { projectId, title, files, preferUrl } = opts;
  // Vite / already-running localhost URL. open that host in the ARK window.
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
