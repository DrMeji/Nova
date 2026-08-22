/**
 * Detect "create a new project from nothing" asks in Chat.
 */

import { looksLikeImplementGo } from '@/lib/chatPlanMode';
import { looksLikeFolderCatalogAsk } from '@/lib/folderCatalog';
import { looksLikeFolderPathAsk } from '@/lib/folderPathAsk';
import { looksLikePcExploreAsk, looksLikeInstalledAppsAsk } from '@/lib/pcExplore';

export type ProjectKind = 'static-web' | 'vite-react' | 'python' | 'node-cli' | 'unknown';

export type NewProjectIntent = {
  name: string;
  slug: string;
  kind: ProjectKind;
  summary: string;
  preferPlan: boolean;
  explicitPath?: string;
};

const CREATE_RE =
  /\b(?:create|scaffold|build\s+me\s+(?:a\s+)?|i\s+want\s+to\s+(?:make|build|create|start)|make\s+(?:a\s+)?new|start\s+(?:a\s+)?new|spin\s+up\s+(?:a\s+)?)\b/i;

const NEW_PROJECT_RE =
  /\bnew\s+(?:web\s+)?(?:app|application|project|website|site|python\s+project|react\s+app)\b/i;

const PROJECT_NOUN_RE =
  /\b(?:app|application|project|website|site|web\s*app|webapp|bot|program|starter)\b/i;

const RICH_FEATURE_RE =
  /\b(discord|webrtc|call\s+and\s+text|marketplace|full\s+stack|social|chat\s+app|video\s+call|e-?commerce|dashboard)\b/i;

import { slugifyProjectName } from '@/lib/projectNames';

export { slugifyProjectName } from '@/lib/projectNames';

export function detectProjectKind(text: string): ProjectKind {
  const t = String(text || '').toLowerCase();
  if (/\b(python|flask|fastapi|trading\s+bot|pip|\.py)\b/.test(t)) return 'python';
  if (/\b(html|landing\s+page|simple\s+site|static\s+site|plain\s+html)\b/.test(t)) return 'static-web';
  if (/\b(node\s+cli|command\s+line\s+tool|cli\s+tool)\b/.test(t)) return 'node-cli';
  if (/\b(react|vite|next|web\s+app|website|site|electron|discord|call|chat)\b/.test(t)) return 'vite-react';
  return 'vite-react';
}

function extractProjectName(text: string): string | null {
  const t = String(text || '').trim();
  const patterns = [
    /\b(?:called|named|name(?:d)?\s+it)\s+["“']([^"”']{2,48})["”']/i,
    /\b(?:called|named|name(?:d)?\s+it)\s+([A-Za-z][A-Za-z0-9 _-]{1,40})/i,
    /\b(?:app|project|website|site)\s+["“']([^"”']{2,48})["”']/i,
    /\bnew\s+(?:web\s+)?(?:app|project|website|site)\s+([A-Za-z][A-Za-z0-9_-]{1,40})/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[1]) {
      let raw = m[1].trim().replace(/[?.!,;:]+$/g, '');
      raw = raw.replace(/\s+(?:app|project|website|site|on|for|with)\b.*$/i, '').trim();
      if (raw.length >= 2 && raw.length <= 48) return raw;
    }
  }
  return null;
}

function extractExplicitPath(text: string): string | undefined {
  const m = String(text || '').match(/\b([A-Za-z]:\\(?:[^\s"'<>|]+\\)*[^\s"'<>|]+)\b/);
  return m?.[1];
}

export function parseNewProjectIntent(message: string): NewProjectIntent | null {
  const t = String(message || '').trim();
  if (!t) return null;

  if (
    /\b(?:add|create|make|write|put)\b[\s\S]{0,40}\bfiles?\b/i.test(t)
    && !/\b(?:web\s+)?(?:app|application|project|website|site)\b/i.test(t)
  ) {
    return null;
  }

  const isCreate = CREATE_RE.test(t) || NEW_PROJECT_RE.test(t);
  if (!isCreate || !PROJECT_NOUN_RE.test(t)) return null;

  if (looksLikePcExploreAsk(t)) return null;
  if (looksLikeFolderCatalogAsk(t)) return null;
  if (looksLikeInstalledAppsAsk(t)) return null;
  if (/\b(?:what|which|list|show|find|tell me)\b/i.test(t) && /\b(?:on|in)\s+(?:my\s+)?(?:pc|desktop)\b/i.test(t)) {
    return null;
  }
  if (looksLikeFolderPathAsk(t) && !isCreate) return null;
  if (/\b(?:open|attach|import)\s+(?:folder|project)\b/i.test(t) && !/\bnew\b/i.test(t)) return null;
  if (/\b(?:install|npm\s+i|pip\s+install)\b/i.test(t) && !/\bnew\b/i.test(t)) return null;
  if (/\b(delete|remove|trash|wipe)\b/i.test(t) && /\b(project|workspace|folder|directory)\b/i.test(t)) return null;

  const name = extractProjectName(t);
  if (!name) return null;

  const kind = detectProjectKind(t);
  const preferPlan = RICH_FEATURE_RE.test(t)
    || (kind === 'vite-react' && /\b(full|complete|production|marketplace|platform)\b/i.test(t));

  return {
    name,
    slug: slugifyProjectName(name),
    kind,
    summary: t,
    preferPlan,
    explicitPath: extractExplicitPath(t),
  };
}

export function buildCreateProjectPlan(intent: NewProjectIntent): string {
  const stack = intent.kind === 'python'
    ? 'Python 3 · `requirements.txt` · `app/main.py` · `run.bat`'
    : intent.kind === 'static-web'
      ? 'Static HTML/CSS/JS'
      : 'Vite + React · `npm run dev`';

  const lines = [
    `**Plan: ${intent.name}**`,
    '',
    `**Stack:** ${stack}`,
    `**Location:** Desktop\\Projects\\${intent.slug} (when Desktop access is on)`,
    '',
    '**Steps:**',
    '1. Create project folder on disk',
    '2. Bind this chat as the workspace',
    '3. Write scaffold files (README, entrypoints, config)',
    '4. Offer `npm install` or `pip install` when ready',
    '',
    intent.preferPlan
      ? '*Say **“go implement”** or **“create it”** when you want me to scaffold this on disk.*'
      : '',
  ].filter(Boolean);

  return lines.join('\n');
}

/** After a plan, user says "go implement" — recover create intent from recent turns. */
export function resolveCreateIntentFromThread(
  message: string,
  recentUserLines: string[],
  opts?: { workspaceActive?: boolean },
): NewProjectIntent | null {
  const direct = parseNewProjectIntent(message);
  if (direct) return direct;

  if (!looksLikeImplementGo(message) && !/\bcreate\s+it\b/i.test(message)) return null;

  if (opts?.workspaceActive && looksLikeImplementGo(message)) return null;

  for (let i = recentUserLines.length - 1; i >= 0; i--) {
    const hit = parseNewProjectIntent(recentUserLines[i]);
    if (hit) return hit;
  }

  const stripped = String(message || '')
    .replace(/\b(go ahead|go build|go implement|implement it|build it now|create it)\b/gi, '')
    .trim();
  return parseNewProjectIntent(stripped);
}
