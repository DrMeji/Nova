/**
 * Shared GitHub repo / PR workflows for Code header menu and chat commands.
 */

import {
  gitCommit,
  gitDiff,
  gitPush,
  gitSetOrigin,
  gitStatus,
  parseGithubRemote,
} from '@/lib/arkGitClient';
import { createGitHubPullRequest, createGitHubRepo } from '@/lib/github';
import { openInSystemBrowser } from '@/lib/openExternal';
import { getPluginRuntime, loadPluginState } from '@/lib/plugins';

export function repoNameFromProject(name: string) {
  return (name || 'ark-project')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'ark-project';
}

export function githubToken() {
  return getPluginRuntime('github', loadPluginState()).token?.trim() || '';
}

export function needGithubWrite(): string | null {
  const perms = getPluginRuntime('github', loadPluginState()).permissions || [];
  if (perms.length && !perms.includes('write')) {
    return 'GitHub · permission needed\n\nThis needs Write. Enable it under Plugins → GitHub → Permissions.';
  }
  return null;
}

export async function workflowCreateGitHubRepo(opts: {
  projectId: string;
  projectName: string;
  token: string;
  repoName: string;
  isPrivate: boolean;
  commitMessage?: string;
}): Promise<{ ok: boolean; reply: string }> {
  const { projectId, projectName, token, repoName, isPrivate } = opts;
  const commitMessage = opts.commitMessage?.trim() || 'Initial commit from ARK';

  const created = await createGitHubRepo(token, repoName, {
    private: isPrivate,
    description: `${projectName} from ARK`,
  });
  const remote = created.clone_url || (created.html_url ? `${created.html_url}.git` : '');
  if (!remote) {
    return { ok: false, reply: 'GitHub created the repo but no clone URL came back.' };
  }

  const committed = await gitCommit(projectId, commitMessage);
  if (!committed.ok && !/nothing to commit|no changes/i.test(committed.error || '')) {
    return { ok: false, reply: committed.error || 'Commit failed before push.' };
  }

  const origin = await gitSetOrigin(projectId, remote);
  if (!origin.ok) {
    return { ok: false, reply: origin.error || 'Could not set origin.' };
  }

  const pushed = await gitPush(projectId, token);
  const lines = [
    `GitHub · ${isPrivate ? 'private' : 'public'} repo`,
    created.full_name || repoName,
    created.html_url || '',
    pushed.ok ? 'Pushed this folder.' : (pushed.error || 'Repo created; push failed — try Push in the header.'),
  ].filter(Boolean);

  return { ok: true, reply: lines.join('\n') };
}

export async function workflowOpenPullRequest(opts: {
  projectId: string;
  token: string;
  title: string;
  pushFirst?: boolean;
}): Promise<{ ok: boolean; reply: string; url?: string }> {
  const { projectId, token, title, pushFirst = true } = opts;

  const blocked = needGithubWrite();
  if (blocked) return { ok: false, reply: blocked };

  const st = await gitStatus(projectId);
  const parsed = parseGithubRemote(st.remote || '');
  if (!parsed?.owner || !parsed?.repo) {
    return { ok: false, reply: 'No GitHub remote on this folder. Create or connect a repo first.' };
  }

  const head = st.branch && st.branch !== 'HEAD' ? st.branch : '';
  if (!head || head === 'main' || head === 'master') {
    return {
      ok: false,
      reply: `You're on ${head || 'HEAD'}. Create or switch to a feature branch, then open a PR.`,
    };
  }

  if (pushFirst) {
    if (st.git && st.dirty) {
      const committed = await gitCommit(projectId, 'Update from ARK');
      if (!committed.ok && !/nothing to commit|no changes/i.test(committed.error || '')) {
        return { ok: false, reply: committed.error || 'Commit failed before push.' };
      }
    }
    const pushed = await gitPush(projectId, token);
    if (!pushed.ok) {
      return { ok: false, reply: pushed.error || 'Push the branch first, then try again.' };
    }
  }

  const body = (await gitDiff(projectId)).text || 'Opened from ARK Code.';
  const preferredBases = ['main', 'master'];
  let lastError = 'Could not open PR';

  for (const base of preferredBases) {
    if (head === base) continue;
    try {
      const pr = await createGitHubPullRequest(token, parsed.owner, parsed.repo, { title, head, base, body });
      const url = pr.html_url || '';
      if (url) void openInSystemBrowser(url);
      return {
        ok: true,
        url,
        reply: [
          'GitHub · pull request',
          `${parsed.owner}/${parsed.repo}#${pr.number ?? '?'} “${pr.title || title}”`,
          url,
          `Compared ${head} → ${base}.`,
        ].filter(Boolean).join('\n'),
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : lastError;
    }
  }

  const compareUrl = `https://github.com/${parsed.owner}/${parsed.repo}/compare/main...${encodeURIComponent(head)}?expand=1`;
  void openInSystemBrowser(compareUrl);
  return {
    ok: false,
    reply: `Could not open a PR automatically (${lastError}). Opened the compare page — finish it in the browser.\n${compareUrl}`,
    url: compareUrl,
  };
}
