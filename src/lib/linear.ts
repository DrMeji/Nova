/** Live Linear helpers. */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

const LINEAR_URL = 'https://api.linear.app/graphql';

async function linearGql<T>(token: string, query: string): Promise<T> {
  const res = await desktopRequest(LINEAR_URL, {
    method: 'POST',
    headers: {
      Authorization: token.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
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

export async function runLinearLive(token: string, _userText: string): Promise<string> {
  const account = await verifyLinearToken(token);
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
    ].join('\n');
  }
  return [
    `Linear · my issues (@${account.label})`,
    '',
    ...issues.map((issue, i) => `${i + 1}. ${issue.identifier} ${issue.title} · ${issue.state.name}`),
    '',
    'Live data from Linear.',
  ].join('\n');
}
