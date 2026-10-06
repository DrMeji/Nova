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
  resolveGreenfieldFromThread,
} from '@/lib/chatIdeaIntent';
import { looksLikeHardCreateGo } from '@/lib/chatPlanMode';
import {
  parseNewProjectIntent,
  looksLikeCreateProjectBrief,
  fallbackCreateProjectName,
  extractProjectName,
  isCreateVerbNoun,
  isCreateRefusedAsk,
  findBestProductBrief,
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
import { looksLikeProjectDebugAsk } from '@/lib/chatProjectDebug';
import { looksLikeSimpleBuildToyChatAsk } from '@/lib/chatIntent';

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
    /** Recent user turns — rebuild brief when “go build” has no pending store entry. */
    recentUserLines?: string[] | null;
  },
): ClassifyTurnResult {
  const t0 = String(message || '').trim();
  if (!t0) return { kind: 'chat', reason: 'empty' };

  // Chip / composer explicit kind wins over regex (nova-kind or legacy ark-kind).
  const explicit = (() => {
    const m = t0.match(/<!--\s*(?:nova|ark)-kind:\s*(create|edit|plan|keep_building|chat|delete|open_folder|run_cmd)\s*-->/i);
    return m?.[1]?.toLowerCase() as TurnKind | undefined;
  })();
  const t = t0.replace(/<!--\s*(?:nova|ark)-kind:\s*[\w]+\s*-->/gi, '').trim() || t0;
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

  // Soft explore (“help me create…”, “can you help me make…”) — talk first, never instant-create stubs.
  // Hard go (“build it”, “on disk”, “start building”) still create below.
  if (looksLikeTalkBeforeCreateAsk(t)) {
    return { kind: 'chat', reason: 'talk-before-create' };
  }

  // Hard create-now: skip plan / on disk / get Live + a product signal → create immediately.
  // Catches soft assembly asks (“put a shop together… skip plan, on disk, Live”) without
  // requiring an imperative “build/create me a website” opener.
  if (looksLikeHardCreateGo(t) && !wantsPlanningOnly(t) && !isCreateRefusedAsk(t)) {
    const named = extractProjectName(t);
    const hasProduct = Boolean(named)
      || /\b(?:app|application|project|website|site|page|shop|store|storefront|landing|homepage|todo|dashboard)\b/i.test(t);
    if (hasProduct) {
      return {
        kind: 'create',
        reason: 'hard-create-go',
        createName: named || fallbackCreateProjectName(t) || 'App',
      };
    }
  }

  // Simple build toys (todo / timer / counter / calculator) — chat demos by default.
  // CREATE only on a clear hard command (no “help me / can you / show me”, no “?”).
  // Soft “help me make a click counter page” must NEVER fall through to create-verb-noun.
  if (looksLikeSimpleBuildToyChatAsk(t)) {
    const toyHardCreate = /\b(?:build|create|make|scaffold)\b/i.test(t)
      && !/\b(?:do\s+not|don't|dont)\s+(?:create|build)\b/i.test(t)
      && !wantsPlanningOnly(t)
      && !/\b(?:help\s+me|can\s+you|could\s+you|show\s+me|write\s+me|give\s+me|i'?d\s+like|i\s+want\s+to|what\s+if|thinking\s+about)\b/i.test(t)
      && !/\?/.test(t)
      && (
        /\b(?:on\s+disk|scaffold|create\s+(?:the\s+)?(?:files|project)|lets?\s+build\s+this|build\s+it\s+now|open\s+preview)\b/i.test(t)
        || /^(?:please\s+)?(?:build|create|make|scaffold)\b/i.test(t)
      );
    if (toyHardCreate) {
      return {
        kind: 'create',
        reason: 'simple-toy-create',
        createName: extractProjectName(t) || fallbackCreateProjectName(t) || 'App',
      };
    }
    return { kind: 'chat', reason: 'simple-build-toy-chat' };
  }

  // Bare “Build / Build me a … website|app|page” → create (avoids chat prose dumps).
  // Soft explore (“help me / can you / what if”) stays chat via talk-before above.
  // Long product briefs with Get it Live / Vite still create (520-char cap used to steal them).
  if (
    /^(?:please\s+)?(?:build|create|make|scaffold)(?:\s+me)?\b/i.test(t)
    && !/^(?:please\s+)?(?:can\s+you|could\s+you|help\s+me)\b/i.test(t)
    && /\b(?:todo|to-?do|timer|counter|page|site|app|website|dashboard|landing|list|vite|react)\b/i.test(t)
    && (t.length < 520 || /\b(?:get\s+it\s+live|on\s+disk|vite|brand[- ]?new|one-?page)\b/i.test(t))
    && t.length < 4000
    && !/\b(?:how\s+(?:do|can|would)|what\s+is|explain|tell\s+me|familiar|want\s+to\s+build|thinking\s+about|are\s+you|i'?d\s+like|help\s+me)\b/i.test(t)
    && !wantsPlanningOnly(t)
    && !/\?/.test(t)
  ) {
    return {
      kind: 'create',
      reason: 'simple-build-ask',
      createName: extractProjectName(t) || fallbackCreateProjectName(t) || 'App',
    };
  }

  // 1a. Requirements / exploratory "I want to build…" — plain chat only when
  // there is no named product and no go-build signal (otherwise fall through to create).
  if (looksLikeRequirementsAsk(t)) {
    const named = extractProjectName(t);
    const goBuild = looksLikeGreenfieldCreateGo(t) || looksLikeBuildStart(t);
    if (!named && !goBuild) {
      return { kind: 'chat', reason: 'requirements-advice' };
    }
  }

  // Confirming a plan in prose is a chat turn. The canned "I saved a plan" card
  // only fires for an explicit plan-only ask, not "do not create files, confirm the plan".
  if (
    /\bconfirm the plan\b/i.test(t)
    && /\b(?:do not|don't|dont)\s+(?:create|write|scaffold|build)\b/i.test(t)
  ) {
    return { kind: 'chat', reason: 'confirm-plan-in-prose' };
  }

  // Soft “talk me through / do not create files” = plain chat conversation.
  // Forbid lists (“Do not create a todo…”) next to hard create must still create.
  if (
    isCreateRefusedAsk(t)
    || /\btalk\s+me\s+through\b/i.test(t)
    || /\bfirst\s+version\s+only\b/i.test(t)
    || /\bno\s+files\s+yet\b/i.test(t)
  ) {
    return { kind: 'chat', reason: 'talk-first-no-plan-card' };
  }

  // Explicit Plan-mode card only (composer Plan pill / “plan only” / “help me plan”).
  if (
    /\b(?:plan\s+only|planning\s+only|help\s+me\s+plan|questions?\s+only|just\s+plan|plan\s+this\s+out|let'?s\s+plan(?:\s+this)?(?:\s+out)?|go\s+into\s+plan(?:\s+mode)?)\b/i.test(t)
    || (/\b(?:don't|do\s+not)\s+build\s+yet\b/i.test(t) && /\bplan\b/i.test(t))
    || (/\bstill\s+planning\s+only\b/i.test(t))
  ) {
    return { kind: 'plan', reason: 'explicit-plan-only' };
  }
  // Other wantsPlanningOnly signals (requirements / clarify) stay chat — talk first.
  if (wantsPlanningOnly(t)) {
    return { kind: 'chat', reason: 'planning-advice-chat' };
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
    let pendingBrief = String(opts?.pendingBrief || '').trim();
    const threadLines = (opts?.recentUserLines || []).map((l) => String(l || '').trim()).filter(Boolean);
    // Rebuild brief from prior user turns when the go-phrase itself has no product meat.
    if (pendingBrief.length < 40 && threadLines.length) {
      const fromThread = resolveGreenfieldFromThread(t, threadLines, null);
      const best = findBestProductBrief(threadLines) || String(fromThread?.summary || '').trim();
      if (best.length >= 40) pendingBrief = best;
    }
    const hasProductNoun = /\b(?:app|application|website|site|web\s*app|project|page|landing|homepage)\b/i.test(t);
    const named = extractProjectName(t) || extractProjectName(pendingBrief);
    const substantialBody = t.length >= 28 && !/^(?:lets?\s+build(?:\s+(?:this|that|it))?|build\s+this|build\s+that|go\s+implement|go\s+build|ok(?:ay)?(?:\s+lets?)?\s+start(?:\s+building)?|start\s+building)\s*[.!]?\s*$/i.test(t);
    if (!workspace && !hasProductNoun && !named && pendingBrief.length < 40 && !substantialBody) {
      return { kind: 'chat', reason: 'greenfield-go-needs-brief' };
    }
    return {
      kind: 'create',
      reason: 'greenfield-create-go',
      createName: named || fallbackCreateProjectName(pendingBrief || t) || 'App',
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

  // Explicit craft-fail nudge must never become soft chat (“Step 1: folder structure…”).
  // Prefer bound folder; if studio files exist but diskRoot was dropped after reload, still edit.
  if (looksLikeInPlaceRebuildAsk(t) && !brandNewProductAsk(t)) {
    const hasStudioFiles = Object.keys(opts?.files || {}).some((p) =>
      /^(?:src\/|index\.html|package\.json|vite\.config)/i.test(p),
    );
    if (workspace || hasStudioFiles) {
      return {
        kind: 'keep_building',
        reason: workspace ? 'inplace-rebuild-bound' : 'inplace-rebuild-studio-files',
      };
    }
  }

  // 2. Bound folder: edit / keep_building (unless brand-new product or a clear *new* create ask)
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
    // Create-wording on a bound folder → edit only when the ask targets *this* project,
    // not a different product noun (todo app / new site while folder is open).
    if (isCreateVerbNoun(t) || parseNewProjectIntent(t) || looksLikeBuildStart(t)) {
      const intent = parseNewProjectIntent(t);
      const named = intent?.name || extractProjectName(t);
      const asksDifferentProduct = Boolean(named && named.length >= 3)
        && !/\b(?:this|the\s+(?:app|site|page|project)|it)\b/i.test(t);
      if (asksDifferentProduct || brandNewProductAsk(t)) {
        return {
          kind: 'create',
          reason: 'create-new-while-bound',
          createName: named || fallbackCreateProjectName(t) || 'App',
        };
      }
      return { kind: 'edit', reason: 'create-wording-on-bound-folder' };
    }
    if (/\b(?:add|put|place|change|update|fix|remove|delete|move|nudge|shift|make|give|lay|close|keep|tighten|expand|show|wire|stick)\b/i.test(t)) {
      return { kind: 'edit', reason: 'mutate-verb-bound' };
    }
    // Bound folder + problem language (no fix verb yet) → chat diagnose (explain only).
    if (looksLikeProjectDebugAsk(t)) {
      return { kind: 'chat', reason: 'diagnose-explain-bound' };
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
