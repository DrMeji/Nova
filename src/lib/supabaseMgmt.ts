/** Supabase Management API (personal access token). */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

type SupabaseProject = {
  id: string;
  name?: string;
  organization_id?: string;
  region?: string;
  status?: string;
};

export async function verifySupabaseMgmtToken(token: string): Promise<{ label: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a Supabase access token');
  const res = await desktopRequest('https://api.supabase.com/v1/projects', {
    method: 'GET',
    headers: { Authorization: `Bearer ${trimmed}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Supabase token rejected'));
  const projects = Array.isArray(res.data) ? res.data as SupabaseProject[] : [];
  const name = projects[0]?.name;
  return { label: name ? `Supabase · ${name}` : 'Supabase' };
}

export async function runSupabaseLive(token: string, userText: string): Promise<string> {
  const res = await desktopRequest('https://api.supabase.com/v1/projects', {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Supabase request failed'));

  const projects = (Array.isArray(res.data) ? res.data : []) as SupabaseProject[];
  const lower = userText.toLowerCase();
  const one = projects.find(p =>
    lower.includes(String(p.name || '').toLowerCase())
    || lower.includes(String(p.id || '').toLowerCase()),
  );

  if (one && /\b(status|detail|info)\b/i.test(userText)) {
    return [
      `Supabase · **${one.name || one.id}**`,
      '',
      `- Region: ${one.region || '—'}`,
      `- Status: ${one.status || '—'}`,
      `- ID: \`${one.id}\``,
    ].join('\n');
  }

  const lines = projects.slice(0, 12).map(p =>
    `- **${p.name || p.id}** · ${p.region || 'region?'} · ${p.status || '—'}`,
  );

  return [
    'Supabase · projects',
    '',
    lines.length ? lines.join('\n') : 'No projects on this token.',
    projects.length > 12 ? `\n…and ${projects.length - 12} more.` : '',
  ].filter(Boolean).join('\n');
}
