/**
 * Single winner for a chat turn. No file writes, no models, no sleeps.
 *
 * Kind union is closed — AIChat must switch on create/plan/edit first;
 * other routes become handler implementation details over time.
 */

import { looksLikeBuildStart } from '@/lib/chatStudio';
import {
  wantsPlanningOnly,
} from '@/lib/chatIdeaIntent';
import {
  parseNewProjectIntent,
  looksLikeCreateProjectBrief,
  fallbackCreateProjectName,
  extractProjectName,
  isCreateVerbNoun,
} from '@/lib/createProjectIntent';
import {
  looksLikeKeepBuildingAsk,
  looksLikeCodeEditAsk,
  hasActiveWorkspace,
} from '@/lib/chatAgentTurn';
import { blankSolidColorFromAsk, isWebMicroAsk } from '@/lib/webProjectCanon';
import { winningChatRoute } from '@/lib/chatMessageRouter';
import { looksLikeFolderPathAsk } from '@/lib/folderPathAsk';
import { classifyDiskIntent } from '@/lib/chatDiskIntent';

export type TurnKind =
  | 'chat'
  | 'plan'
  | 'create'
  | 'edit'
  | 'keep_building'
  | 'run_cmd'
  | 'open_folder'
  | 'delete';

export type ClassifyTurnResult = {
  kind: TurnKind;
  reason: string;
  createName?: string;
};

function brandNewProductAsk(t: string): boolean {
  // Require explicit new-product intent — not “footer on my new project”.
  return /\bbrand[- ]?new\b/i.test(t)
    || /\b(?:create|make|build|scaffold|spin\s+up)\s+(?:a\s+)?(?:brand[- ]?new\s+)?new\s+(?:website|site|project|app)\b/i.test(t)
    || (/\bfrom\s+scratch\b/i.test(t) && /\b(?:create|build|make|rebuild|scrap)\b/i.test(t))
    || (/\bcreate\s+(?:a\s+)?new\s+project\b/i.test(t) && /\b(?:called|named)\b/i.test(t));
}

export function classifyTurn(
  message: string,
  opts?: {
    diskRoot?: string | null;
    files?: Record<string, string>;
    projectId?: string | null;
    chatId?: string | null;
  },
): ClassifyTurnResult {
  const t0 = String(message || '').trim();
  if (!t0) return { kind: 'chat', reason: 'empty' };

  // Chip / composer explicit kind wins over regex.
  const explicit = (() => {
    const m = t0.match(/<!--\s*ark-kind:\s*(create|edit|plan|keep_building|chat|delete|open_folder|run_cmd)\s*-->/i);
    return m?.[1]?.toLowerCase() as TurnKind | undefined;
  })();
  const t = t0.replace(/<!--\s*ark-kind:\s*[\w]+\s*-->/gi, '').trim() || t0;
  if (explicit) {
    if (explicit === 'create') {
      return {
        kind: 'create',
        reason: 'explicit-ark-kind',
        createName: extractProjectName(t) || fallbackCreateProjectName(t) || 'App',
      };
    }
    return { kind: explicit, reason: 'explicit-ark-kind' };
  }

  // 1. Explicit plan-only
  if (wantsPlanningOnly(t) || /\b(?:plan\s+only|planning\s+only|don'?t\s+build\s+yet|questions?\s+only|just\s+plan)\b/i.test(t)) {
    return { kind: 'plan', reason: 'explicit-plan-only' };
  }

  const workspace = hasActiveWorkspace({
    diskRoot: opts?.diskRoot || null,
    files: opts?.files || {},
    projectId: opts?.projectId || null,
    chatId: opts?.chatId || null,
  });

  // Disk delete / add
  const disk = classifyDiskIntent(t);
  if (disk?.type === 'delete_project' || disk?.type === 'delete_file') {
    return { kind: 'delete', reason: `disk-${disk.type}` };
  }

  // Open folder path
  if (looksLikeFolderPathAsk(t) && !isCreateVerbNoun(t)) {
    return { kind: 'open_folder', reason: 'folder-path-ask' };
  }

  // 2. Bound folder: edit / keep_building (unless brand-new product)
  if (workspace && !brandNewProductAsk(t)) {
    if (looksLikeKeepBuildingAsk(t)) {
      return { kind: 'keep_building', reason: 'keep-building-bound' };
    }
    if (isWebMicroAsk(t) || looksLikeCodeEditAsk(t) || blankSolidColorFromAsk(t)) {
      return { kind: 'edit', reason: 'micro-or-code-edit-bound' };
    }
    if (isCreateVerbNoun(t) || parseNewProjectIntent(t) || looksLikeBuildStart(t)) {
      // Same chat create wording without brand-new → polish/edit the bound folder
      return { kind: 'edit', reason: 'create-wording-on-bound-folder' };
    }
    if (/\b(?:add|put|place|change|update|fix|remove|delete)\b/i.test(t)) {
      return { kind: 'edit', reason: 'mutate-verb-bound' };
    }
  }

  // 3. Create/build/make + product noun (name fallback)
  if (isCreateVerbNoun(t) || looksLikeBuildStart(t) || looksLikeCreateProjectBrief(t)) {
    const intent = parseNewProjectIntent(t);
    const name = intent?.name
      || extractProjectName(t)
      || fallbackCreateProjectName(t)
      || 'App';
    return { kind: 'create', reason: 'create-verb-noun', createName: name };
  }

  const intent = parseNewProjectIntent(t);
  if (intent) {
    return {
      kind: 'create',
      reason: 'parse-new-project',
      createName: intent.name || fallbackCreateProjectName(t) || 'App',
    };
  }

  // Unbound keep-building → create (pending name / App), never the workspace wall.
  if (looksLikeKeepBuildingAsk(t)) {
    return {
      kind: 'create',
      reason: 'keep-building-unbound-as-create',
      createName: fallbackCreateProjectName(t) || 'App',
    };
  }

  // Map leftover router kinds onto the closed union
  const route = winningChatRoute(t, { workspaceEmpty: !workspace });
  if (route === 'create_project' || route === 'greenfield_plan') {
    // greenfield_plan without explicit plan-only → still create if verb+noun, else chat
    if (route === 'create_project' || isCreateVerbNoun(t)) {
      return {
        kind: 'create',
        reason: `router-${route}`,
        createName: fallbackCreateProjectName(t) || 'App',
      };
    }
  }
  if (route === 'folder_path' || route === 'work_on_folder') {
    return { kind: 'open_folder', reason: `router-${route}` };
  }
  if (route === 'disk') {
    return { kind: 'delete', reason: 'router-disk' };
  }
  if (route === 'pc_restore' || route === 'folder_catalog' || route === 'pc_explore') {
    return { kind: 'chat', reason: `router-${route}` };
  }

  return { kind: 'chat', reason: 'fallback-chat' };
}
