/**
 * Single winner for a chat turn. No file writes, no models, no sleeps.
 *
 * Kind union is closed — AIChat must switch on create/plan/edit first;
 * other routes become handler implementation details over time.
 */

import { looksLikeBuildStart } from '@/lib/chatStudio';
import {
  wantsPlanningOnly,
  looksLikeRequirementsAsk,
  looksLikeTalkBeforeCreateAsk,
  looksLikeGreenfieldCreateGo,
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
import { looksLikeInPlaceRebuildAsk } from '@/lib/chatBuildIntent';
import { blankSolidColorFromAsk, isWebMicroAsk } from '@/lib/webProjectCanon';
import { winningChatRoute } from '@/lib/chatMessageRouter';
import { looksLikeFolderPathAsk } from '@/lib/folderPathAsk';
import { classifyDiskIntent } from '@/lib/chatDiskIntent';
import { looksLikeConversationalEditShorthand } from '@/lib/editAskResolve';

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
  if (/\b(?:add|put|place|change|edit|fix|update|modify)\b/i.test(t)
    && /\b(?:footer|header|nav|button|color|font|padding|margin|section)\b/i.test(t)) {
    return false;
  }
  const changeExisting = /\b(?:change|edit|fix|update|modify)\s+(?:this|the\s+)?(?:existing|current|bound)\b/i.test(t)
    || /\b(?:add|put|place)\s+(?:to|on|in)\s+(?:this|the|my)\s+(?:app|site|page|project)\b/i.test(t);
  if (changeExisting) return false;
  return /\bbrand[- ]?new\b/i.test(t)
    || /\b(?:create|make|build|scaffold|spin\s+up)\s+(?:a\s+)?(?:brand[- ]?new\s+)?new\s+(?:website|site|project|app)\b/i.test(t)
    || (/\bfrom\s+scratch\b/i.test(t) && /\b(?:create|build|make|rebuild|scrap)\b/i.test(t))
    || (/\bcreate\s+(?:a\s+)?new\s+project\b/i.test(t) && /\b(?:called|named)\b/i.test(t))
    // New named product while a folder is bound — create a fresh project, don't edit the splash.
    || (
      /\b(?:called|named)\b/i.test(t)
      && /\b(?:build|create|make|scaffold)\b/i.test(t)
      && /\b(?:app|website|site|project|chat)\b/i.test(t)
    )
    || (
      /\b(?:discord|slack)(?:-|\s+)?like\b/i.test(t)
      && /\b(?:build|create|make)\b/i.test(t)
      && !/\b(?:add|fix|change|update)\s+(?:the\s+)?(?:existing|current)\b/i.test(t)
    );
}

export function classifyTurn(
  message: string,
  opts?: {
    diskRoot?: string | null;
    files?: Record<string, string>;
    projectId?: string | null;
    chatId?: string | null;
    /** Pending greenfield brief — used to allow bare “go build” creates. */
    pendingBrief?: string | null;
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

  // 1a. Requirements / exploratory "I want to build…" — plain chat, never scaffold.
  if (looksLikeRequirementsAsk(t) || looksLikeTalkBeforeCreateAsk(t)) {
    return { kind: 'chat', reason: looksLikeRequirementsAsk(t) ? 'requirements-advice' : 'talk-before-create' };
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

  // 1b. "Start building…" / "ok create it" after requirements — create (pending brief),
  // not chat. Bound folders stay edit/keep_building below unless brand-new.
  if (looksLikeGreenfieldCreateGo(t) && (!workspace || brandNewProductAsk(t))) {
    const pendingBrief = String(opts?.pendingBrief || '').trim();
    const hasProductNoun = /\b(?:app|application|website|site|web\s*app|project|page|landing|homepage)\b/i.test(t);
    const named = extractProjectName(t);
    const substantialBody = t.length >= 28 && !/^(?:lets?\s+build(?:\s+(?:this|that|it))?|build\s+this|build\s+that|go\s+implement|go\s+build|ok(?:ay)?(?:\s+lets?)?\s+start(?:\s+building)?|start\s+building)\s*[.!]?\s*$/i.test(t);
    if (!workspace && !hasProductNoun && !named && pendingBrief.length < 40 && !substantialBody) {
      return { kind: 'chat', reason: 'greenfield-go-needs-brief' };
    }
    return {
      kind: 'create',
      reason: 'greenfield-create-go',
      createName: named || extractProjectName(pendingBrief) || fallbackCreateProjectName(t) || 'App',
    };
  }

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
    if (looksLikeKeepBuildingAsk(t) || looksLikeInPlaceRebuildAsk(t)) {
      return { kind: 'keep_building', reason: looksLikeInPlaceRebuildAsk(t) ? 'inplace-rebuild-bound' : 'keep-building-bound' };
    }
    if (isWebMicroAsk(t) || looksLikeCodeEditAsk(t) || blankSolidColorFromAsk(t)) {
      return { kind: 'edit', reason: 'micro-or-code-edit-bound' };
    }
    if (looksLikeConversationalEditShorthand(t)) {
      return { kind: 'edit', reason: 'conversational-shorthand-bound' };
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

  // Map leftover router kinds onto the closed union — never create from router alone without a create verb.
  const route = winningChatRoute(t, { workspaceEmpty: !workspace });
  if (route === 'create_project' || route === 'greenfield_plan') {
    if (isCreateVerbNoun(t) || looksLikeBuildStart(t) || looksLikeCreateProjectBrief(t)) {
      return {
        kind: 'create',
        reason: `router-${route}`,
        createName: extractProjectName(t) || fallbackCreateProjectName(t) || undefined,
      };
    }
    return { kind: 'chat', reason: `router-${route}-no-create-verb` };
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
