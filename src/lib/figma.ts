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

export async function postFigmaComment(token: string, fileKey: string, message: string) {
  const res = await desktopRequest(`https://api.figma.com/v1/files/${fileKey}/comments`, {
    method: 'POST',
    headers: {
      'X-Figma-Token': token.trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message: message.slice(0, 8000) }),
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Figma comment failed'));
  return res.data as { id?: string; message?: string };
}

export async function listFigmaTeamProjects(_token: string, _teamId?: string) {
  // Figma requires a team id (`GET /v1/teams/:team_id/projects`). ARK opens files by URL instead.
  return [] as { id: string; name: string }[];
}

export async function runFigmaLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const account = await verifyFigmaToken(token);
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  const keyMatch =
    userText.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/)
    || userText.match(/\bfile\s+([a-zA-Z0-9]{10,})\b/i)
    || userText.match(/\b([a-zA-Z0-9]{22,})\b/);

  if (/\b(comment|post|write)\b/.test(lower)) {
    if (perms.length > 0 && !perms.includes('write')) {
      return [
        'Figma · permission needed',
        '',
        'Commenting needs Write. Enable it under Plugins → Figma → Permissions.',
      ].join('\n');
    }
    const fileKey = keyMatch?.[1];
    const bodyMatch = userText.match(
      /(?:comment|post|write)\s+(?:on\s+)?(?:figma\.com\/(?:file|design)\/[a-zA-Z0-9]+|[a-zA-Z0-9]{10,})\s*[:\-]?\s*(.+)$/i,
    )
      || userText.match(/\bcomment\s*[:\-]\s*(.+)$/i);
    const body = (bodyMatch?.[1] || '').trim();
    if (!fileKey || !body) {
      return [
        'Figma · comment',
        '',
        'Try: comment on figma.com/file/ABC123 Looks good. ship it',
      ].join('\n');
    }
    const posted = await postFigmaComment(token, fileKey, body);
    return [
      `Figma · commented (@${account.label})`,
      '',
      `File ${fileKey}`,
      body.slice(0, 200),
      posted.id ? `Comment id: ${posted.id}` : '',
      '',
      'Live write via Figma comments API.',
    ].filter(Boolean).join('\n');
  }

  if (keyMatch) {
    const file = await fetchFigmaFile(token, keyMatch[1]);
    const pages = file.document?.children?.map(c => c.name).slice(0, 12) ?? [];
    return [
      `Figma · ${file.name} (@${account.label})`,
      '',
      pages.length ? pages.map((p, i) => `${i + 1}. ${p}`).join('\n') : 'File opened (no page names).',
      file.lastModified ? `\nLast modified: ${file.lastModified}` : '',
      '',
      'Live file read from Figma. Comment with: comment on <file link> Your note',
    ].filter(Boolean).join('\n');
  }

  return [
    `Figma · account (@${account.label})`,
    '',
    'Connected. Paste a file link (figma.com/file/… or /design/…) to list pages.',
    'Comment: comment on figma.com/file/KEY Your note',
    '',
    'Live token verified against Figma.',
  ].join('\n');
}
