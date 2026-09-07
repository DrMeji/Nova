/**
 * Natural-language folder references. "on my desktop I have a folder called NOVA-demo".
 */

import { isProjectCreateBrief } from '@/lib/chatCreateBrief';

export type FolderPathRef = {
  scope: 'desktop' | 'documents' | 'downloads' | 'absolute';
  name: string;
  rawPath?: string;
};

/** Stop folder-name capture when the user continues with a question or new clause. */
const QUESTION_TAIL_RE = /\s+(?:what|how|who|where|when|why|can|could|would|should|is|are|was|were|do|does|did|tell|explain|describe|show|help|please|and\s+i|i\s+want|i\s+need|let'?s)\b/i;

const DESKTOP_HAVE_RE = /\b(?:on|in)\s+(?:my\s+)?desktop\b[\s\S]{0,60}?\b(?:i\s+)?have\s+a\s+(?:folder|project|directory|dir)\b[\s\S]{0,30}?\b(?:called|named|name[d]?)\s+(.+)/i;
const DESKTOP_FOLDER_RE = /\b(?:on\s+)?(?:my\s+)?desktop\b[\s\S]{0,80}?\b(?:folder|project|directory|dir)\b[\s\S]{0,40}?\b(?:called|named|name[d]?)\s+(.+)/i;
const DESKTOP_SHORT_RE = /\b(?:folder|project)\s+(?:on|in)\s+(?:my\s+)?desktop\b[\s\S]{0,30}?\b(?:called|named)\s+(.+)/i;
const WORK_ON_RE = /\b(?:start\s+)?work(?:ing)?\s+on\b[\s\S]{0,40}?\b(?:folder|project)\b[\s\S]{0,30}?\b(?:called|named)\s+(.+)/i;
const FOLDER_CALLED_RE = /\b(?:folder|project|directory|dir)\b[\s\S]{0,24}?\b(?:called|named)\s+(.+)/i;
const WHAT_ON_DESKTOP_RE = /\b(?:what(?:'s| is)|tell me (?:about )?|describe|explain)\s+([A-Za-z0-9_.-]+)\s+(?:on|in)\s+(?:my\s+)?desktop\b/i;
const TELL_ABOUT_ON_DESKTOP_RE = /\btell me about\s+([A-Za-z0-9_.-]+)\s+(?:on|in)\s+(?:my\s+)?desktop\b/i;
const OPEN_ON_DESKTOP_RE = /\b(?:open|show|find|locate|look at)\s+([A-Za-z0-9_.-]+)\s+(?:on|in)\s+(?:my\s+)?desktop\b/i;
const ABS_WIN_PATH_RE = /\b([A-Za-z]:\\(?:[^"'<>|\r\n]+\\)*[^"'<>|\r\n]+)\b/;
const ABS_WIN_QUOTED_RE = /["']([A-Za-z]:\\[^"']+)["']/;
const ABS_UNIX_PATH_RE = /(\/(?:Users|home|var|tmp|opt)\/[^\s"'<>|]+)/;
const INSTALLED_APPS_ASK_RE =
  /\b(?:apps?|applications?|programs?|software)\b[\s\S]{0,40}\b(?:installed|install(?:ed|ation)?s?|do\s+i\s+have)\b/i;

export const GRANT_OFF_FOLDER_MSG =
  'I need permission to read folders on your PC.\n\nOn first setup, enable **Give NOVA access to your PC** (or open **Settings → Security** → Allow Desktop folder access + Full PC access), confirm the dialog, then ask again.';

export function cleanFolderName(raw: string): string {
  let s = String(raw || '').trim();
  if (!s) return '';

  const quoted = s.match(/^["“'](.+)["”']$/);
  if (quoted?.[1]) s = quoted[1].trim();
  else s = s.replace(/^["“']|["”']$/g, '').trim();

  const qStop = s.search(QUESTION_TAIL_RE);
  if (qStop > 0) s = s.slice(0, qStop).trim();

  s = s.replace(/\s+(folder|project|directory)$/i, '').trim();
  s = s.replace(/[?.!,;:]+$/g, '').trim();

  if (!quoted && /^\S+$/.test(s)) return s;
  if (!quoted && /^[\w.-]+(?:\s+[\w.-]+)*$/i.test(s)) return s;

  const token = s.match(/^([A-Za-z0-9_.-]+)/);
  return token?.[1] || s;
}

function extractNamedFolder(text: string): string | null {
  for (const re of [DESKTOP_HAVE_RE, DESKTOP_FOLDER_RE, DESKTOP_SHORT_RE, WORK_ON_RE, FOLDER_CALLED_RE]) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = cleanFolderName(m[1]);
      if (name.length >= 2) return name;
    }
  }
  return null;
}

function extractDesktopSubject(text: string): string | null {
  for (const re of [WHAT_ON_DESKTOP_RE, TELL_ABOUT_ON_DESKTOP_RE, OPEN_ON_DESKTOP_RE]) {
    const m = text.match(re);
    if (m?.[1]) {
      const name = cleanFolderName(m[1]);
      if (name.length >= 2) return name;
    }
  }
  return null;
}

/** Parse "under project" / "inside Projects on desktop" style asks. */
export function parseDesktopSubfolderAsk(message: string): FolderPathRef | null {
  const t = String(message || '').trim();
  if (!/\bdesktop\b/i.test(t)) return null;

  const under = t.match(/\bunder\s+(?:the\s+(?:folder\s+)?)?([A-Za-z0-9_.-]+)/i);
  if (under?.[1]) {
    const name = cleanFolderName(under[1]);
    if (name.length >= 2) return { scope: 'desktop', name };
  }

  const insideOnDesktop = t.match(
    /\b(?:inside|in)\s+(?:my\s+)?([A-Za-z0-9_.-]+)\s+(?:folder\s+)?(?:on|in)\s+(?:my\s+)?desktop\b/i,
  );
  if (insideOnDesktop?.[1]) {
    const name = cleanFolderName(insideOnDesktop[1]);
    if (name.length >= 2) return { scope: 'desktop', name };
  }

  const desktopFolderUnder = t.match(
    /\b(?:inside|in)\s+(?:my\s+)?(?:desktop\s+)?folder\b[\s\S]{0,40}?\bunder\s+(?:the\s+)?([A-Za-z0-9_.-]+)/i,
  );
  if (desktopFolderUnder?.[1]) {
    const name = cleanFolderName(desktopFolderUnder[1]);
    if (name.length >= 2) return { scope: 'desktop', name };
  }

  if (/\b(?:inside|in)\s+(?:of\s+)?(?:the\s+)?projects?\b/i.test(t)) {
    return { scope: 'desktop', name: 'Projects' };
  }

  return null;
}

export function parseFolderPathAsk(message: string): FolderPathRef | null {
  const t = String(message || '').trim();
  if (!t) return null;
  if (/\b(delete|remove|trash|wipe|get rid of)\b/i.test(t)) return null;

  const sub = parseDesktopSubfolderAsk(message);
  if (sub) return sub;

  const quoted = t.match(ABS_WIN_QUOTED_RE);
  if (quoted?.[1] && !/\.(exe|dll|lnk|bat|cmd|msi)$/i.test(quoted[1])) {
    const rawPath = quoted[1].trim();
    return { scope: 'absolute', name: rawPath.split(/[/\\]/).pop() || rawPath, rawPath };
  }

  const abs = t.match(ABS_WIN_PATH_RE);
  if (abs?.[1] && !/\.(exe|dll|lnk|bat|cmd|msi)$/i.test(abs[1])) {
    // Keep spaces inside Windows paths (e.g. ...\Auto Trade).
    const rawPath = abs[1].replace(/[.,;:!?)]+$/g, '').trim();
    return { scope: 'absolute', name: rawPath.split(/[/\\]/).pop() || rawPath, rawPath };
  }

  const unix = t.match(ABS_UNIX_PATH_RE);
  if (unix?.[1]) {
    const rawPath = unix[1].replace(/[.,;:!?)]+$/g, '').trim();
    return { scope: 'absolute', name: rawPath.split(/[/\\]/).pop() || rawPath, rawPath };
  }

  const onDesktop = /\b(?:on|in)\s+(?:my\s+)?desktop\b/i.test(t) || /\bdesktop\b/i.test(t);

  const subjectOnDesktop = extractDesktopSubject(t);
  if (subjectOnDesktop && onDesktop) {
    return { scope: 'desktop', name: subjectOnDesktop };
  }

  const desktopName = extractNamedFolder(t);
  if (desktopName && onDesktop) {
    return { scope: 'desktop', name: desktopName };
  }
  if (desktopName && /\b(?:on|in)\s+(?:my\s+)?documents\b/i.test(t)) {
    return { scope: 'documents', name: desktopName };
  }
  if (desktopName && !onDesktop && /\b(?:folder|project)\b/i.test(t)) {
    return { scope: 'desktop', name: desktopName };
  }

  return null;
}

/** User is asking about a folder on Desktop/Documents (even before we can parse the exact name). */
export function looksLikeFolderPathAsk(text: string): boolean {
  if (isProjectCreateBrief(text)) return false;
  if (INSTALLED_APPS_ASK_RE.test(text)) return false;
  if (parseFolderPathAsk(text) != null) return true;
  if (parseDesktopSubfolderAsk(text) != null) return true;
  const t = String(text || '').trim();
  if (!t) return false;
  if (/\b(?:on|in)\s+(?:my\s+)?desktop\b/i.test(t)
    && /\b(?:folder|project|called|named|what(?:'s| is)|tell me about|open)\b/i.test(t)) {
    return true;
  }
  if (WHAT_ON_DESKTOP_RE.test(t) || OPEN_ON_DESKTOP_RE.test(t)) return true;
  return false;
}

export function looksLikeInstallDepsAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return (
    /\b(install|add|get|fetch|download|upgrade|update)\b[\s\S]{0,40}\b(npm|node_modules|dependencies|packages|pip|python|requirements)\b/i.test(t)
    || /\bnpm\s+(?:i(nstall)?|update|upgrade)\b/i.test(t)
    || /\bpip\s+install\b/i.test(t)
  );
}

export function looksLikeDeleteFilesAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return (
    /\b(delete|remove|trash|clean up|get rid of|clear out)\b[\s\S]{0,60}\b(file|files|folder|folders|desktop|junk|unwanted)\b/i.test(t)
    || /\bunwanted files\b/i.test(t)
  );
}

export function looksLikeRunDevServerAsk(text: string): boolean {
  const t = String(text || '').trim();
  return /\b(?:run|start)\b[\s\S]{0,24}\b(?:dev\s+server|dev\s+server|npm\s+run\s+dev|dev\s+mode)\b/i.test(t)
    || /\bopen\s+(?:the\s+)?(?:dev\s+)?(?:site|page|app)\b/i.test(t);
}

export function inferInstallCommand(text: string, hasPackageJson: boolean): string | null {
  const t = String(text || '').trim();
  if (looksLikeRunDevServerAsk(t) && hasPackageJson) return 'npm run dev';
  if (/\bpip\s+install\b/i.test(t)) {
    const m = t.match(/\bpip\s+install\b[\s\S]*/i);
    return m?.[0]?.trim() || 'pip install -r requirements.txt';
  }
  if (/\bnpm\s+i(nstall)?\b/i.test(t)) return 'npm install';
  if (/\bnpm\s+(?:update|upgrade)\b/i.test(t)) return 'npm update';
  if (looksLikeInstallDepsAsk(t)) {
    if (/\b(?:update|upgrade)\b/i.test(t) && hasPackageJson) return 'npm update';
    if (hasPackageJson) return 'npm install';
    if (/\bpython\b/i.test(t)) return 'pip install -r requirements.txt';
    return 'npm install';
  }
  return null;
}
