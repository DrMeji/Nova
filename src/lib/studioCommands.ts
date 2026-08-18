/**
 * Code workspace chat commands: find, git, GitHub repo/PR, Slack summary.
 */

import {
  classifyGitAsk,
  formatGitReview,
  gitClone,
  gitCommit,
  gitDiff,
  gitPush,
  gitSetOrigin,
  gitStatus,
  githubCloneUrl,
  parseGithubRemote,
  parseGithubRepoRef,
} from '@/lib/arkGitClient';
import { findQueryFromMessage, formatSearchHits, isFindInFilesAsk, searchInFiles } from '@/lib/projectInspect';
import { getPluginRuntime, loadPluginState } from '@/lib/plugins';
import { createGitHubPullRequest, createGitHubRepo } from '@/lib/github';
import { postSlackMessage } from '@/lib/slack';

export type StudioCommandResult = {
  reply: string;
  reload?: boolean;
};

function githubToken() {
  return getPluginRuntime('github', loadPluginState()).token?.trim() || '';
}

function slackToken() {
  return getPluginRuntime('slack', loadPluginState()).token?.trim() || '';
}

function slackPerms() {
  return getPluginRuntime('slack', loadPluginState()).permissions || [];
}

function githubPerms() {
  return getPluginRuntime('github', loadPluginState()).permissions || [];
}

function needGithubWrite() {
  const perms = githubPerms();
  if (perms.length && !perms.includes('write')) {
    return 'GitHub · permission needed\n\nThis needs Write. Enable it under Plugins → GitHub → Permissions.';
  }
  return null;
}

function repoNameFromProject(name: string) {
  return (name || 'ark-project')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'ark-project';
}

async function postSlackSummary(channelName: string, text: string) {
  const token = slackToken();
  if (!token) {
    return 'Slack is not connected. Open Plugins → Slack, then try again.';
  }
  const perms = slackPerms();
  if (perms.length && !perms.includes('write') && !perms.includes('send')) {
    return 'Slack · permission needed\n\nPosting needs Write. Enable it under Plugins → Slack → Permissions.';
  }
  const { desktopRequest } = await import('@/lib/httpDesktop');
  const res = await desktopRequest(
    'https://api.slack.com/api/conversations.list?limit=80&exclude_archived=true&types=public_channel,private_channel',
    { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
  );
  const data = res.data as { ok?: boolean; channels?: { id: string; name?: string }[] };
  const hit = (data.channels || []).find(c => (c.name || '').toLowerCase() === channelName.toLowerCase());
  if (!hit) {
    return `Slack · #${channelName} is not visible to this bot. Invite it, then try again.`;
  }
  await postSlackMessage(token, hit.id, text);
  return `Slack · posted to #${channelName}\n\n${text.slice(0, 500)}`;
}

export async function runCodeStudioCommand(opts: {
  message: string;
  projectId: string;
  projectName: string;
  files: Record<string, string>;
}): Promise<StudioCommandResult | null> {
  const { message, projectId, projectName, files } = opts;

  if (isFindInFilesAsk(message)) {
    const query = findQueryFromMessage(message);
    let hits = searchInFiles(files, query);
    if (!hits.length && window.arkDesktop?.projectSearch) {
      const res = await window.arkDesktop.projectSearch({ projectId, query, limit: 40 });
      hits = res.hits || [];
    }
    return { reply: formatSearchHits(query, hits) };
  }

  const gitKind = classifyGitAsk(message);
  if (!gitKind) return null;

  if (gitKind === 'clone') {
    const ref = parseGithubRepoRef(message);
    if (!ref) {
      return { reply: 'Say: clone owner/repo  (example: clone vercel/next.js)' };
    }
    const token = githubToken();
    const cloned = await gitClone(projectId, githubCloneUrl(ref.owner, ref.repo), token || undefined);
    if (!cloned.ok) return { reply: cloned.error || 'Clone failed.' };
    return {
      reply: `Cloned ${ref.owner}/${ref.repo} into this workspace.\n${cloned.branch ? `Branch: ${cloned.branch}` : ''}\nOpen Explorer — files are on disk.`.trim(),
      reload: true,
    };
  }

  if (gitKind === 'diff') {
    const st = await gitDiff(projectId);
    return { reply: formatGitReview(st) };
  }

  if (gitKind === 'commit') {
    const msg = message.match(/commit(?:\s+these changes)?(?:\s+with)?\s*[:\-]\s*(.+)$/i)?.[1]
      || message.match(/["“](.+)["”]/)?.[1]
      || 'Update from ARK';
    const committed = await gitCommit(projectId, msg.trim());
    if (!committed.ok) return { reply: committed.error || 'Commit failed.' };
    return { reply: committed.message || formatGitReview(committed) };
  }

  if (gitKind === 'push') {
    const token = githubToken();
    if (!token) {
      return { reply: 'Connect GitHub in Plugins so ARK can push. Then try Push again.' };
    }
    const blocked = needGithubWrite();
    if (blocked) return { reply: blocked };
    const st = await gitStatus(projectId);
    if (st.git && st.dirty) {
      await gitCommit(projectId, 'Update from ARK');
    }
    const pushed = await gitPush(projectId, token);
    if (!pushed.ok) return { reply: pushed.error || 'Push failed.' };
    return { reply: pushed.message || `Pushed to ${pushed.remote || 'origin'}.` };
  }

  if (gitKind === 'create-repo') {
    const token = githubToken();
    if (!token) {
      return { reply: 'Connect GitHub in Plugins (token with repo scope), then ask me to create the repo.' };
    }
    const blocked = needGithubWrite();
    if (blocked) return { reply: blocked };
    const isPrivate = !/\bpublic\b/i.test(message);
    const named = message.match(/repo(?:sitory)?\s+(?:named|called)\s+([\w.-]+)/i)?.[1];
    const created = await createGitHubRepo(token, named || repoNameFromProject(projectName), {
      private: isPrivate,
      description: `${projectName} from ARK`,
    });
    const remote = created.clone_url || (created.html_url ? `${created.html_url}.git` : '');
    if (!remote) return { reply: 'GitHub created the repo but no clone URL came back.' };
    await gitCommit(projectId, 'Initial commit from ARK');
    const origin = await gitSetOrigin(projectId, remote);
    if (!origin.ok) return { reply: origin.error || 'Could not set origin.' };
    const pushed = await gitPush(projectId, token);
    return {
      reply: [
        `GitHub · ${isPrivate ? 'private' : 'public'} repo`,
        created.full_name || '',
        created.html_url || '',
        pushed.ok ? 'Pushed this folder.' : (pushed.error || 'Repo created; push failed — try Push in the header.'),
      ].filter(Boolean).join('\n'),
    };
  }

  if (gitKind === 'pr') {
    const token = githubToken();
    if (!token) return { reply: 'Connect GitHub in Plugins to open a pull request.' };
    const blocked = needGithubWrite();
    if (blocked) return { reply: blocked };
    const st = await gitStatus(projectId);
    const parsed = parseGithubRemote(st.remote || '');
    const named = parseGithubRepoRef(message);
    const owner = named?.owner || parsed?.owner;
    const repo = named?.repo || parsed?.repo;
    if (!owner || !repo) {
      return { reply: 'No GitHub remote on this folder. Push or create a repo first, then ask for a PR.' };
    }
    const title = message.match(/titled?\s+["“]?([^"”\n]+)["”]?/i)?.[1]?.trim()
      || st.log?.[0]?.replace(/^[a-f0-9]+\s+/i, '')
      || 'Changes from ARK';
    const head = st.branch && st.branch !== 'HEAD' ? st.branch : '';
    if (!head || head === 'main' || head === 'master') {
      return {
        reply: `You're on ${head || 'HEAD'}. Create or switch to a feature branch, push, then ask me to open a PR.`,
      };
    }
    const preferredBases = ['main', 'master'];
    const body = (await gitDiff(projectId)).text || 'Opened from ARK Code.';
    let lastError = 'Could not open PR';
    for (const base of preferredBases) {
      if (head === base) continue;
      try {
        const pr = await createGitHubPullRequest(token, owner, repo, { title, head, base, body });
        return {
          reply: [
            'GitHub · pull request',
            `${owner}/${repo}#${pr.number ?? '?'} “${pr.title || title}”`,
            pr.html_url || '',
            `Compared ${head} → ${base}.`,
          ].filter(Boolean).join('\n'),
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : lastError;
      }
    }
    try {
      const pr = await createGitHubPullRequest(token, owner, repo, {
        title,
        head,
        base: 'main',
        body,
      });
      return {
        reply: [
          'GitHub · pull request',
          `${owner}/${repo}#${pr.number ?? '?'} “${pr.title || title}”`,
          pr.html_url || '',
        ].filter(Boolean).join('\n'),
      };
    } catch {
      return { reply: `Could not open a PR (${lastError}). Push the branch first, then try again.` };
    }
  }

  if (gitKind === 'slack') {
    const ch = message.match(/#([\w-]+)/)?.[1] || 'dev';
    const review = await gitDiff(projectId);
    const summary = [
      `Update from ARK · ${projectName}`,
      review.branch ? `Branch: ${review.branch}` : '',
      review.text || 'Files were updated in the Code workspace.',
    ].filter(Boolean).join('\n');
    const posted = await postSlackSummary(ch, summary.slice(0, 3500));
    return { reply: posted };
  }

  return null;
}
