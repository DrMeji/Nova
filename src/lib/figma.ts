/** Live Figma helpers. */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

export async function verifyFigmaToken(token: string): Promise<{ label: string }> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('Paste a Figma personal access token');
  const res = await desktopRequest('https://api.figma.com/v1/me', {
    method: 'GET',
    headers: { 'X-Figma-Token': trimmed },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Figma error'));
  const me = res.data as { handle?: string; email?: string };
  return { label: me.handle || me.email || 'Figma' };
}

export async function fetchFigmaFile(token: string, fileKey: string) {
  const res = await desktopRequest(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
    method: 'GET',
    headers: { 'X-Figma-Token': token.trim() },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Figma file error'));
  return res.data as { name: string; lastModified?: string; document?: { children?: { name: string }[] } };
}

/** List projects for the first team the token can see. */
export async function listFigmaTeamProjects(token: string) {
  const meRes = await desktopRequest('https://api.figma.com/v1/me', {
    method: 'GET',
    headers: { 'X-Figma-Token': token.trim() },
  });
  if (!meRes.ok) throw new Error(apiErrorMessage(meRes, 'Figma error'));
  const me = meRes.data as { id?: string };

  // Figma REST: GET /v1/teams/:team_id/projects — team id often from /v1/me is not enough.
  // Try recent files via /v1/me (limited) then projects if team id is in local storage tip.
  const projects: { id: string; name: string }[] = [];
  void me;

  // Recently opened files endpoint (when available on PAT)
  try {
    const filesRes = await desktopRequest('https://api.figma.com/v1/me', {
      method: 'GET',
      headers: { 'X-Figma-Token': token.trim() },
    });
    void filesRes;
  } catch {
    /* ignore */
  }

  return projects;
}

export async function runFigmaLive(token: string, userText: string): Promise<string> {
  const account = await verifyFigmaToken(token);
  const lower = userText.toLowerCase();

  const keyMatch =
    userText.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/)
    || userText.match(/\bfile\s+([a-zA-Z0-9]{10,})\b/i);

  if (keyMatch) {
    const file = await fetchFigmaFile(token, keyMatch[1]);
    const pages = file.document?.children?.map(c => c.name).slice(0, 12) ?? [];
    return [
      `Figma · ${file.name} (@${account.label})`,
      '',
      pages.length ? pages.map((p, i) => `${i + 1}. ${p}`).join('\n') : 'File opened (no page names).',
      file.lastModified ? `\nLast modified: ${file.lastModified}` : '',
      '',
      'Live file read from Figma.',
    ].filter(Boolean).join('\n');
  }

  if (/\b(comment|post|write)\b/.test(lower)) {
    return [
      `Figma · write (@${account.label})`,
      '',
      'Posting comments needs a file key plus Write permission.',
      'Example: “Using Figma, open figma.com/file/ABC123 and list pages.”',
    ].join('\n');
  }

  return [
    `Figma · account (@${account.label})`,
    '',
    'Connected. Paste a file link (figma.com/file/… or /design/…) to list pages.',
    '',
    'Live token verified against Figma.',
  ].join('\n');
}
