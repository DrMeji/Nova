/** Live Google Drive helpers (OAuth access token). */

import { apiErrorMessage, desktopRequest } from '@/lib/httpDesktop';

async function driveGet<T>(token: string, path: string) {
  const url = path.startsWith('http') ? path : `https://www.googleapis.com/drive/v3${path}`;
  const res = await desktopRequest(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token.trim()}` },
  });
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Drive error'));
  return res.data as T;
}

export async function verifyDriveToken(token: string): Promise<{ label: string }> {
  if (!token.trim()) throw new Error('Paste a Google OAuth access token with Drive scope');
  const about = await driveGet<{ user?: { emailAddress?: string; displayName?: string } }>(
    token,
    '/about?fields=user',
  );
  return {
    label: about.user?.emailAddress || about.user?.displayName || 'Google Drive',
  };
}

type DriveFile = {
  id: string;
  name?: string;
  mimeType?: string;
  modifiedTime?: string;
  webViewLink?: string;
};

export async function listDriveFiles(token: string, query?: string, limit = 12) {
  const q = query
    ? `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`
    : 'trashed = false';
  const result = await driveGet<{ files?: DriveFile[] }>(
    token,
    `/files?pageSize=${limit}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&q=${encodeURIComponent(q)}&orderBy=modifiedTime desc`,
  );
  return result.files ?? [];
}

export async function runDriveLive(
  token: string,
  userText: string,
  _opts?: { permissions?: string[] },
): Promise<string> {
  const account = await verifyDriveToken(token);
  const lower = userText.toLowerCase();
  const qMatch = userText.match(/(?:search|find|look up|list)\s+(.+)$/i);
  const query = qMatch?.[1]?.replace(/[?.!]+$/, '').trim()
    || (/(doc|sheet|slide|folder)/.test(lower) ? undefined : undefined);

  const files = await listDriveFiles(token, query && query.length < 80 ? query : undefined);
  if (files.length === 0) {
    return [
      `Drive · files (@${account.label})`,
      '',
      query ? `No files matching “${query}”.` : 'No recent files visible for this token.',
      '',
      'Token needs drive.readonly (or broader). Reconnect via OAuth Playground / Settings.',
    ].join('\n');
  }

  return [
    `Drive · recent (@${account.label})`,
    '',
    ...files.slice(0, 10).map((f, i) => {
      const kind = (f.mimeType || '').includes('folder')
        ? 'folder'
        : (f.mimeType || '').split('.').pop() || 'file';
      return `${i + 1}. ${f.name || f.id} · ${kind}${f.webViewLink ? `\n   ${f.webViewLink}` : ''}`;
    }),
    '',
    'Live data from Google Drive. Try “search budget spreadsheet”.',
  ].join('\n');
}
