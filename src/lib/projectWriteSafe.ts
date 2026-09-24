import { filterSandboxWrites } from '@/lib/agentSandbox';
import { getLocalPrefs } from '@/lib/localPrefs';

export type ProjectWritePayload = {
  projectId: string;
  projectName?: string;
  files: Record<string, string>;
};

export type ProjectWriteResult = {
  ok: boolean;
  root?: string;
  files?: string[];
  error?: string;
  sandboxBlocked?: string[];
  meta?: { inPlace?: boolean };
};

export async function safeProjectWrite(payload: ProjectWritePayload): Promise<ProjectWriteResult> {
  if (!window.novaDesktop?.projectWrite) {
    return { ok: false, error: 'Project write unavailable' };
  }

  const sandbox = getLocalPrefs().sandboxAgent;
  let files = payload.files;
  let sandboxBlocked: string[] | undefined;

  if (sandbox) {
    const filtered = filterSandboxWrites(files);
    files = filtered.allowed;
    if (filtered.blocked.length) sandboxBlocked = filtered.blocked;
  }

  if (Object.keys(files).length === 0 && sandboxBlocked?.length) {
    return {
      ok: false,
      error: `Sandbox blocked ${sandboxBlocked.length} path(s): ${sandboxBlocked.slice(0, 3).join(', ')}`,
      sandboxBlocked,
    };
  }

  const result = await window.novaDesktop.projectWrite({
    ...payload,
    files,
    sandbox,
  });

  return { ...result, sandboxBlocked };
}
