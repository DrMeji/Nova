/**
 * useWorkspace — file tree / contents / disk root for a projectId.
 * Peel ProjectWorkspace business logic here over time.
 */

import { useCallback, useEffect, useState } from 'react';
import { safeProjectWrite } from '@/lib/projectWriteSafe';

export type WorkspaceState = {
  projectId: string | null;
  diskRoot: string | null;
  files: Record<string, string>;
  selectedFile: string | null;
  loading: boolean;
  error: string | null;
};

export function useWorkspace(projectId: string | null) {
  const [state, setState] = useState<WorkspaceState>({
    projectId,
    diskRoot: null,
    files: {},
    selectedFile: null,
    loading: Boolean(projectId),
    error: null,
  });

  const hydrate = useCallback(async (id: string | null) => {
    if (!id) {
      setState({
        projectId: null,
        diskRoot: null,
        files: {},
        selectedFile: null,
        loading: false,
        error: null,
      });
      return;
    }
    setState((prev) => ({ ...prev, projectId: id, loading: true, error: null }));
    try {
      const read = await window.arkDesktop?.projectRead?.(id);
      if (!read?.ok || !read.files) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: read?.error || 'Could not load project',
        }));
        return;
      }
      const files = read.files as Record<string, string>;
      const first = Object.keys(files).find((p) => /\.(jsx?|tsx?|html|css|md)$/i.test(p))
        || Object.keys(files)[0]
        || null;
      setState({
        projectId: id,
        diskRoot: (read as { root?: string }).root || null,
        files,
        selectedFile: first,
        loading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Load failed',
      }));
    }
  }, []);

  useEffect(() => {
    void hydrate(projectId);
  }, [projectId, hydrate]);

  const selectFile = useCallback((path: string | null) => {
    setState((prev) => ({ ...prev, selectedFile: path }));
  }, []);

  const writeFile = useCallback(async (path: string, content: string) => {
    const id = state.projectId;
    if (!id) return { ok: false as const, error: 'no_project' };
    const next = { ...state.files, [path]: content };
    const written = await safeProjectWrite({
      projectId: id,
      files: { [path]: content },
    });
    if (!written.ok) return { ok: false as const, error: written.error || 'write_failed' };
    setState((prev) => ({ ...prev, files: next }));
    return { ok: true as const };
  }, [state.projectId, state.files, state.diskRoot]);

  return {
    ...state,
    hydrate,
    selectFile,
    writeFile,
    fileTree: Object.keys(state.files).sort(),
  };
}
