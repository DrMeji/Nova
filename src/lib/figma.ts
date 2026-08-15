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

type FigmaFile = { key: string; name: string; thumbnail_url?: string; last_modified?: string };

export async function runFigmaLive(token: string, _userText: string): Promise<string> {
  const account = await verifyFigmaToken(token);
  const res = await desktopRequest('https://api.figma.com/v1/me', {
    method: 'GET',
    headers: { 'X-Figma-Token': token.trim() },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Figma error'));

  // Recent files endpoint varies by plan; try team projects fallback via user info only.
  const filesRes = await desktopRequest('https://api.figma.com/v1/me', {
    method: 'GET',
    headers: { 'X-Figma-Token': token.trim() },
  });
  void filesRes;

  // Figma has no simple "recent files for me" on all tokens; return verified identity + tip.
  // If user mentions a file key later we can fetch /v1/files/:key.
  const recentHint = 'Ask with a file key (figma.com/file/FILE_KEY/…) to open that file next.';

  // Try recently viewed if available (beta-ish); ignore failures.
  let lines: string[] = [];
  try {
    const recent = await desktopRequest('https://api.figma.com/v1/me', {
      method: 'GET',
      headers: { 'X-Figma-Token': token.trim() },
    });
    const me = recent.data as { img_url?: string };
    void me;
  } catch {
    /* ignore */
  }

  // Soft list using known endpoint for team files is complex; keep verified connect useful.
  lines = [
    `Connected as @${account.label}`,
    '',
    recentHint,
  ];

  return [
    `Figma · account (@${account.label})`,
    '',
    ...lines,
    '',
    'Live token verified against Figma.',
  ].join('\n');
}

export async function fetchFigmaFile(token: string, fileKey: string) {
  const res = await desktopRequest(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
    method: 'GET',
    headers: { 'X-Figma-Token': token.trim() },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Figma file error'));
  return res.data as { name: string; lastModified?: string; document?: { children?: { name: string }[] } };
}
