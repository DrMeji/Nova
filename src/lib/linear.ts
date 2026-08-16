/** Live Linear helpers. */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

const LINEAR_URL = 'https://api.linear.app/graphql';

async function linearGql<T>(token: string, query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await desktopRequest(LINEAR_URL, {
    method: 'POST',
    headers: {
      Authorization: token.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Linear error'));
  const data = res.data as { data?: T; errors?: { message: string }[] };
  if (data.errors?.length) throw new Error(data.errors[0].message);
  if (!data.data) throw new Error('Empty Linear response');
  return data.data;
}

export async function verifyLinearToken(token: string): Promise<{ label: string }> {
  if (!token.trim()) throw new Error('Paste a Linear API key');
  const data = await linearGql<{ viewer: { name: string; email: string } }>(
    token,
    `{ viewer { name email } }`,
  );
  return { label: data.viewer.name || data.viewer.email || 'Linear' };
}

export async function createLinearIssue(token: string, title: string, description?: string) {
  const teams = await linearGql<{ teams: { nodes: { id: string; name: string; key: string }[] } }>(
    token,
    `{ teams { nodes { id name key } } }`,
  );
  const team = teams.teams.nodes[0];
  if (!team) throw new Error('No Linear team found for this key');
  const created = await linearGql<{
    issueCreate: { success: boolean; issue: { identifier: string; title: string; url: string } };
  }>(
    token,
    `mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { identifier title url } }
    }`,
    {
      input: {
        teamId: team.id,
        title: title.slice(0, 200),
        description: description?.slice(0, 4000) || undefined,
      },
    },
  );
  if (!created.issueCreate?.success) throw new Error('Linear did not create the issue');
  return created.issueCreate.issue;
}

export async function runLinearLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const account = await verifyLinearToken(token);
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  if (/\b(create|new|add|write)\b/.test(lower) && /issue|ticket|bug|task/.test(lower)) {
    if (perms.length > 0 && !perms.includes('write')) {
      return [
        'Linear · permission needed',
        '',
        'Creating issues needs Write. Enable it under Plugins → Linear → Permissions.',
      ].join('\n');
    }
    const titleMatch = userText.match(/(?:create|new|add)\s+(?:an?\s+)?(?:issue|ticket|bug|task)\s*[:\-]?\s*(.+)$/i);
    const title = (titleMatch?.[1] || userText.replace(/using linear[,:]?/i, '').trim()).slice(0, 120)
      || 'New issue from ARK';
    const issue = await createLinearIssue(token, title);
    return [
      `Linear · created (@${account.label})`,
      '',
      `${issue.identifier} ${issue.title}`,
      issue.url,
      '',
      'Live write via Linear API.',
    ].join('\n');
  }

  const data = await linearGql<{
    issues: { nodes: { identifier: string; title: string; state: { name: string } }[] };
  }>(
    token,
    `{ issues(filter: { assignee: { isMe: { eq: true } } }, first: 10) { nodes { identifier title state { name } } } }`,
  );
  const issues = data.issues.nodes ?? [];
  if (issues.length === 0) {
    return [
      `Linear · my issues (@${account.label})`,
      '',
      'No open issues assigned to you right now.',
      '',
      'Try: “Using Linear, create an issue: Fix login flash”',
    ].join('\n');
  }
  return [
    `Linear · my issues (@${account.label})`,
    '',
    ...issues.map((issue, i) => `${i + 1}. ${issue.identifier} ${issue.title} · ${issue.state.name}`),
    '',
    'Live data from Linear. Ask to create an issue when Write is enabled.',
  ].join('\n');
}
