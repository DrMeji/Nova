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

export async function uploadDriveTextFile(token: string, name: string, content: string) {
  const boundary = `ark_${Date.now().toString(36)}`;
  const safeName = (name.trim() || 'note.txt').slice(0, 200);
  const fileName = /\.[a-z0-9]+$/i.test(safeName) ? safeName : `${safeName}.txt`;
  const meta = JSON.stringify({ name: fileName, mimeType: 'text/plain' });
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    meta,
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    '',
    content.slice(0, 200_000),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  const res = await desktopRequest(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.trim()}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) throw new Error(apiErrorMessage(res, 'Drive upload failed'));
  return res.data as DriveFile;
}

export async function runDriveLive(
  token: string,
  userText: string,
  opts?: { permissions?: string[] },
): Promise<string> {
  const account = await verifyDriveToken(token);
  const lower = userText.toLowerCase();
  const perms = opts?.permissions || [];

  const uploadMatch = userText.match(
    /(?:upload\s+note|save\s+to\s+drive)\s*[:\-]?\s*(.+)$/i,
  );
  if (uploadMatch) {
    if (perms.length > 0 && !perms.includes('write')) {
      return [
        'Drive · permission needed',
        '',
        'Uploading needs Write. Enable it under Plugins → Drive → Permissions.',
      ].join('\n');
    }
    const rest = uploadMatch[1].trim();
    const parts = rest.split(/\s+[—–]\s+|\s+-{1,2}\s+/);
    const title = (parts[0] || 'NOVA note').trim();
    const content = (parts.slice(1).join('. ').trim() || title);
    const file = await uploadDriveTextFile(token, title, content);
    return [
      `Drive · uploaded (@${account.label})`,
      '',
      file.name || title,
      file.webViewLink || '',
      '',
      'Live write via Google Drive API.',
    ].filter(Boolean).join('\n');
  }

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
    'Live data from Google Drive. Try “search budget spreadsheet” or “upload note: Title. body”.',
  ].join('\n');
}
