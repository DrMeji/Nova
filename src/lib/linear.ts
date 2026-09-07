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

export async function updateLinearIssue(
  token: string,
  identifier: string,
  patch: { stateName?: 'Done' | 'Canceled' | string; title?: string },
) {
  const looked = await linearGql<{
    issue: {
      id: string;
      identifier: string;
      title: string;
      url: string;
      team: { states: { nodes: { id: string; name: string; type: string }[] } };
    } | null;
  }>(
    token,
    `query Issue($id: String!) {
      issue(id: $id) {
        id identifier title url
        team { states { nodes { id name type } } }
      }
    }`,
    { id: identifier.trim() },
  );
  if (!looked.issue) throw new Error(`Linear issue ${identifier} not found`);

  const input: Record<string, unknown> = {};
  if (patch.title) input.title = patch.title.slice(0, 200);
  if (patch.stateName) {
    const want = patch.stateName.trim().toLowerCase();
    const states = looked.issue.team?.states?.nodes ?? [];
    let state = states.find(s => s.name.toLowerCase() === want);
    if (!state && want === 'done') state = states.find(s => s.type === 'completed');
    if (!state && (want === 'canceled' || want === 'cancelled')) {
      state = states.find(s => s.type === 'canceled');
    }
    if (!state) throw new Error(`No workflow state matching “${patch.stateName}”`);
    input.stateId = state.id;
  }
  if (Object.keys(input).length === 0) throw new Error('Nothing to update');

  const updated = await linearGql<{
    issueUpdate: {
      success: boolean;
      issue: { identifier: string; title: string; url: string; state: { name: string } };
    };
  }>(
    token,
    `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
      issueUpdate(id: $id, input: $input) {
        success
        issue { identifier title url state { name } }
      }
    }`,
    { id: looked.issue.id, input },
  );
  if (!updated.issueUpdate?.success) throw new Error('Linear did not update the issue');
  return updated.issueUpdate.issue;
}

export async function runLinearLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const account = await verifyLinearToken(token);
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  const closeMatch = userText.match(
    /\b(?:close|cancel)\s+(?:an?\s+)?(?:issue|ticket)?\s*([A-Z][A-Z0-9]+-\d+)\b/i,
  );
  const updateMatch = userText.match(
    /\bupdate\s+(?:an?\s+)?(?:issue|ticket)?\s*([A-Z][A-Z0-9]+-\d+)\s+(?:to|as)\s+(\w+)/i,
  );
  if (closeMatch || updateMatch) {
    if (perms.length > 0 && !perms.includes('write')) {
      return [
        'Linear · permission needed',
        '',
        'Updating issues needs Write. Enable it under Plugins → Linear → Permissions.',
      ].join('\n');
    }
    const identifier = (closeMatch?.[1] || updateMatch?.[1] || '').trim();
    const stateName = closeMatch
      ? (/cancel/i.test(closeMatch[0]) ? 'Canceled' : 'Done')
      : (updateMatch?.[2] || 'Done');
    const issue = await updateLinearIssue(token, identifier, { stateName });
    return [
      `Linear · updated (@${account.label})`,
      '',
      `${issue.identifier} ${issue.title} · ${issue.state.name}`,
      issue.url,
      '',
      'Live write via Linear API.',
    ].join('\n');
  }

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
      || 'New issue from NOVA';
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
    'Live data from Linear. Create, or “close issue ABC-123” / “update issue ABC-123 to Done”.',
  ].join('\n');
}
