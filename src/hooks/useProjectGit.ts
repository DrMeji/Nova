/** Git helpers extracted from ProjectWorkspace for maintainability. */

import { gitClone, gitCommit, gitPush, gitStatus } from '@/lib/novaGitClient';

export async function refreshProjectGit(projectId: string) {
  return gitStatus(projectId);
}

export async function pushProjectToGitHub(opts: {
  projectId: string;
  token: string;
  projectName?: string;
  files: Record<string, string>;
  messages: unknown[];
  packDiskFiles: (files: Record<string, string>, messages: unknown[]) => Record<string, string>;
  safeProjectWrite: (payload: { projectId: string; projectName?: string; files: Record<string, string> }) => Promise<{ root?: string }>;
}) {
  await opts.safeProjectWrite({
    projectId: opts.projectId,
    projectName: opts.projectName,
    files: opts.packDiskFiles(opts.files, opts.messages),
  });
  const status = await gitStatus(opts.projectId);
  if (!status?.git) {
    return { ok: false, error: 'Git is not installed on this PC. Install Git for Windows, then try again in NOVA.' };
  }
  if (status.dirty) {
    await gitCommit(opts.projectId, 'Update from NOVA');
  }
  return gitPush(opts.projectId, opts.token);
}

export { gitClone, gitCommit, gitPush, gitStatus };
