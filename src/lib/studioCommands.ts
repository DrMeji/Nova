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
  gitStatus,
  githubCloneUrl,
  parseGithubRepoRef,
} from '@/lib/novaGitClient';
import { findQueryFromMessage, formatSearchHits, isFindInFilesAsk, searchInFiles } from '@/lib/projectInspect';
import { getPluginRuntime, loadPluginState } from '@/lib/plugins';
import {
  githubToken,
  needGithubWrite,
  repoNameFromProject,
  workflowCreateGitHubRepo,
  workflowOpenPullRequest,
} from '@/lib/codeGitHubWorkflow';
import { postSlackMessage } from '@/lib/slack';

export type StudioCommandResult = {
  reply: string;
  reload?: boolean;
};

function slackToken() {
  return getPluginRuntime('slack', loadPluginState()).token?.trim() || '';
}

function slackPerms() {
  return getPluginRuntime('slack', loadPluginState()).permissions || [];
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
    let hits = searchInFiles(files, query).hits;
    let total = hits.length;
    if (!hits.length && window.novaDesktop?.projectSearch) {
      const res = await window.novaDesktop.projectSearch({ projectId, query, limit: 40 });
      hits = res.hits || [];
      total = typeof res.total === 'number' ? res.total : hits.length;
    }
    return { reply: formatSearchHits(query, hits, total) };
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
      reply: `Cloned ${ref.owner}/${ref.repo} into this workspace.\n${cloned.branch ? `Branch: ${cloned.branch}` : ''}\nOpen Explorer. files are on disk.`.trim(),
      reload: true,
    };
  }

  if (gitKind === 'diff') {
    const st = await gitDiff(projectId);
    return { reply: formatGitReview(st) };
  }

  if (gitKind === 'commit') {
    const msg = message.match(/commit(?:\s+these changes)?(?:\s+with)?\s*[:-]\s*(.+)$/i)?.[1]
      || message.match(/["“](.+)["”]/)?.[1]
      || 'Update from NOVA';
    const committed = await gitCommit(projectId, msg.trim());
    if (!committed.ok) return { reply: committed.error || 'Commit failed.' };
    return { reply: committed.message || formatGitReview(committed) };
  }

  if (gitKind === 'push') {
    const token = githubToken();
    if (!token) {
      return { reply: 'Connect GitHub in Plugins so NOVA can push. Then try Push again.' };
    }
    const blocked = needGithubWrite();
    if (blocked) return { reply: blocked };
    const st = await gitStatus(projectId);
    if (st.git && st.dirty) {
      await gitCommit(projectId, 'Update from NOVA');
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
    const result = await workflowCreateGitHubRepo({
      projectId,
      projectName,
      token,
      repoName: named || repoNameFromProject(projectName),
      isPrivate,
    });
    return { reply: result.reply };
  }

  if (gitKind === 'pr') {
    const token = githubToken();
    if (!token) return { reply: 'Connect GitHub in Plugins to open a pull request.' };
    const blocked = needGithubWrite();
    if (blocked) return { reply: blocked };
    const st = await gitStatus(projectId);
    const title = message.match(/titled?\s+["“]?([^"”\n]+)["”]?/i)?.[1]?.trim()
      || st.log?.[0]?.replace(/^[a-f0-9]+\s+/i, '')
      || 'Changes from NOVA';
    const result = await workflowOpenPullRequest({
      projectId,
      token,
      title,
      pushFirst: true,
    });
    return { reply: result.reply };
  }

  if (gitKind === 'slack') {
    const ch = message.match(/#([\w-]+)/)?.[1] || 'dev';
    const review = await gitDiff(projectId);
    const summary = [
      `Update from NOVA · ${projectName}`,
      review.branch ? `Branch: ${review.branch}` : '',
      review.text || 'Files were updated in the Code workspace.',
    ].filter(Boolean).join('\n');
    const posted = await postSlackSummary(ch, summary.slice(0, 3500));
    return { reply: posted };
  }

  return null;
}
