/** Live Vercel API helpers for the NOVA Vercel plugin. */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export type VercelUser = {
  id?: string;
  username?: string;
  name?: string;
  email?: string;
};

export async function verifyVercelToken(token: string): Promise<{ label: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a Vercel token');
  const res = await desktopRequest('https://api.vercel.com/v2/user', {
    method: 'GET',
    headers: { Authorization: `Bearer ${trimmed}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Vercel error'));
  const data = res.data as { user?: VercelUser };
  const user = data.user || (res.data as VercelUser);
  return { label: user.username || user.name || user.email || 'Vercel' };
}

type VercelDeployment = {
  uid?: string;
  name?: string;
  url?: string;
  state?: string;
  readyState?: string;
  created?: number;
  createdAt?: number;
  projectId?: string;
};

export async function redeployVercel(token: string, deploymentId: string) {
  const res = await desktopRequest(`https://api.vercel.com/v13/deployments/${deploymentId}/redeploy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.trim()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Vercel redeploy failed'));
  return res.data as { id?: string; url?: string; readyState?: string };
}

export async function runVercelLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const account = await verifyVercelToken(token);
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  const res = await desktopRequest('https://api.vercel.com/v6/deployments?limit=12', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Could not list deployments'));
  const data = res.data as { deployments?: VercelDeployment[] };
  const list = data.deployments ?? [];

  if (/\b(redeploy|deploy again|retry deploy)\b/.test(lower)) {
    if (perms.length > 0 && !perms.includes('write') && !perms.includes('manage')) {
      return [
        'Vercel · permission needed',
        '',
        'Redeploy needs Write. Enable it under Plugins → Vercel → Permissions.',
      ].join('\n');
    }
    const top = list[0];
    if (!top?.uid) {
      return [
        `Vercel · redeploy (@${account.label})`,
        '',
        'No recent deployment to redeploy.',
      ].join('\n');
    }
    const created = await redeployVercel(token, top.uid);
    return [
      `Vercel · redeployed (@${account.label})`,
      '',
      `From: ${top.name || top.uid}`,
      created.url ? `https://${created.url}` : created.id || '',
      created.readyState ? `State: ${created.readyState}` : '',
      '',
      'Live write via Vercel redeploy API.',
    ].filter(Boolean).join('\n');
  }

  if (list.length === 0) {
    return [
      `Vercel · deployments (@${account.label})`,
      '',
      'No deployments found for this token.',
    ].join('\n');
  }

  const title = /fail|error/.test(lower) ? 'recent deployments' : 'recent deployments';

  return [
    `Vercel · ${title} (@${account.label})`,
    '',
    ...list.slice(0, 10).map((d, i) => {
      const state = d.readyState || d.state || 'unknown';
      const host = d.url ? `https://${d.url}` : '';
      return `${i + 1}. ${d.name || d.uid || 'deploy'} · ${state}${host ? `\n   ${host}` : ''}`;
    }),
    '',
    'Live data from Vercel. Say “redeploy” to retry the latest deployment.',
  ].join('\n');
}
