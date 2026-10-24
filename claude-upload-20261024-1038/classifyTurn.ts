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
  looksLikeGreenfieldKeepPlanning,
  looksLikeSoftHelpBuildAsk,
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
  looksLikeProductVisualObjectAsk,
} from '@/lib/createProjectIntent';
import {
  looksLikeKeepBuildingAsk,
  looksLikeCodeEditAsk,
  hasActiveWorkspace,
} from '@/lib/chatAgentTurn';
import { looksLikeInPlaceRebuildAsk } from '@/lib/chatBuildIntent';
import { blankSolidColorFromAsk, isUiShellAsk, isWebMicroAsk } from '@/lib/webProjectCanon';
import { winningChatRoute } from '@/lib/chatMessageRouter';
import { looksLikeFolderPathAsk } from '@/lib/folderPathAsk';
import { classifyDiskIntent } from '@/lib/chatDiskIntent';
import { looksLikeConversationalEditShorthand } from '@/lib/editAskResolve';
import { looksLikeProjectDebugAsk } from '@/lib/chatProjectDebug';
import { looksLikeSimpleBuildToyChatAsk } from '@/lib/chatIntent';

/**
 * Create-vs-chat SSOT surface. Other modules must import these from here (not chatIdeaIntent /
 * chatPlanMode directly) so one file owns “does this turn create, or is it talk-first?”.
 */
export {
  looksLikeTalkBeforeCreateAsk,
  looksLikeRequirementsAsk,
  looksLikeSoftHelpBuildAsk,
  looksLikeGreenfieldCreateGo,
  resolveGreenfieldFromThread,
  looksLikeHardCreateGo,
  looksLikeSimpleBuildToyChatAsk,
  wantsPlanningOnly,
};

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
  // Ignore refuse/negation (“do not edit any open folder”) so vibe/landing creates
  // that also list footer/button chrome still count as brand-new.
  const polishVerb = /\b(?:add|put|place|change|edit|fix|update|modify)\b/i.test(t)
    && !/\b(?:do\s+not|don't|dont|never)\s+(?:add|put|place|change|edit|fix|update|modify)\b/i.test(t);
  if (polishVerb
    && /\b(?:footer|header|nav|button|color|font|padding|margin|section)\b/i.test(t)) {
    return false;
  }
  const changeExisting = /\b(?:change|edit|fix|update|modify)\s+(?:this|the\s+)?(?:existing|current|bound)\b/i.test(t)
    || /\b(?:add|put|place)\s+(?:to|on|in)\s+(?:this|the|my)\s+(?:app|site|page|project)\b/i.test(t);
  if (changeExisting) return false;
  // "brand-new graphic design / layout" is an in-place redesign — not a new product.
  if (/\bbrand[- ]?new\s+(?:graphic\s+)?(?:design|layout|look|style|ui|visual)\b/i.test(t)) {
    return false;
  }
  return /\bbrand[- ]?new\s+(?:website|site|project|app|product)\b/i.test(t)
    || (/\bbrand[- ]?new\b/i.test(t) && !/\b(?:design|layout|look|style|ui|visual|graphic)\b/i.test(t))
    || /\b(?:create|make|build|scaffold|spin\s+up|start)\s+(?:a\s+)?(?:brand[- ]?new\s+)?new\s+(?:website|site|project|app)\b/i.test(t)
    || (/\bfrom\s+scratch\b/i.test(t) && /\b(?:create|build|make|rebuild|scrap)\b/i.test(t))
    || (/\b(?:create|start)\s+(?:a\s+)?new\s+project\b/i.test(t) && /\b(?:called|named)\b/i.test(t))
    // Ladder: “making a tip calculator called TipWise… start a new project… blank”
    || (
      /\b(?:called|named)\b/i.test(t)
      && /\b(?:start|create|make|build|scaffold)\s+(?:a\s+)?new\s+(?:website|site|project|app)\b/i.test(t)
    )
    // New named product while a folder is bound — create a fresh project, don't edit the splash.
    || (
      /\b(?:called|named)\b/i.test(t)
      && /\b(?:build|create|make|scaffold|making)\b/i.test(t)
      && /\b(?:app|website|site|project|chat|calculator|todo|timer)\b/i.test(t)
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

  // Estimation/explanation questions about building are conversation, not a create command.
  // An explicit on-disk/ship/build-now instruction below still wins.
  if (/\b(?:how\s+long|how\s+much\s+time|what\s+does\s+it\s+take|is\s+it\s+possible|can\s+it\s+be\s+built)\b/i.test(t0)
    && /\b(?:build|create|make|website|site|app|project)\b/i.test(t0)
    && !looksLikeHardCreateGo(t0)
    && !/\b(?:on\s+disk|put\s+it\s+on\s+disk|create\s+the\s+files)\b/i.test(t0)) {
    return { kind: 'chat', reason: 'build-feasibility-question' };
  }

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
  // UI shells win over toy/micro invent when editing — but never steal a brand-new project create
  // (“Create a new website… hero + cards…” is create, not surgical edit).
  if (
    isUiShellAsk(t)
    && !blankSolidColorFromAsk(t)
    && !brandNewProductAsk(t)
    && !(
      // Greenfield coding / dashboard creates must not be stolen into surgical edit.
      // Keep toy "Build a todo app with add…" as micro/edit when bound (ask-families).
      (
        looksLikeHardCreateGo(t)
        && /\b(?:website|site|project|app|homepage|landing|dashboard|cli|api|server|library|game|extension)\b/i.test(t)
        && /\b(?:create|make|build|scaffold|spin\s+up|start)\b/i.test(t)
      )
      || (
        // Unbound only — bound folders keep surgical shell edits (ask-families kanban/etc.).
        !hasActiveWorkspace({
          diskRoot: opts?.diskRoot || null,
          files: opts?.files || {},
          projectId: opts?.projectId || null,
          chatId: opts?.chatId || null,
        })
        && /^(?:please\s+)?(?:build|create|make|scaffold|ship|port|wrap|write|implement|convert|migrate|refactor|rewrite)\b/i.test(t)
        && /\b(?:dashboard|control\s+panel|admin\s+panel|cli|api|server|library|scraper|crawler|clone|pipeline|worker|plugin|bot|middleware|sdk|extension|composable|hooks?|generator|suite|flutter|react\s+native|electron|playwright|cypress|jest|vitest|pytest|test\s+suite|e2e|search\s+(?:engine|service|ui)|editor|scene|system|tracker|playground|router|client|board|synth|loader|splitter|crm|pos|kanban|gradio|streamlit|lambda|webhook|imap|mdx|folium|ocr|neural|cron|panel\s+dashboard|fuse\.?js|tiptap|codemirror|monaco|three\.?js|widget|schema|resolvers?|receiver|interceptor|formula|firmware|swiftui|kotlin|compose|yargs|arduino|esp32|homebrew|tauri)\b/i.test(t)
      )
    )
  ) {
    return { kind: 'edit', reason: 'micro-before-toy-create' };
  }

  if (
    looksLikeHardCreateGo(t)
    && !wantsPlanningOnly(t)
    && !isCreateRefusedAsk(t)
    && (!isUiShellAsk(t) || brandNewProductAsk(t))
  ) {
    const named = extractProjectName(t);
    const hasProduct = Boolean(named)
      || /\b(?:app|application|project|website|site|page|shop|store|storefront|landing|homepage|todo|dashboard|cli|api|server|library|package|script|tool|game|extension|service|scraper|crawler|clone|pipeline|worker|plugin|middleware|sdk|hook|parser|agent|rag|bot|workflow|module|terraform)\b/i.test(t);
    if (hasProduct) {
      return {
        kind: 'create',
        reason: 'hard-create-go',
        createName: named || fallbackCreateProjectName(t) || 'App',
      };
    }
  }

  // Test suite asks — create (or edit when a folder is bound), never fallback chat.
  if (
    !wantsPlanningOnly(t)
    && !/\?/.test(t)
    && !/\b(?:how\s+(?:do|can|would)|explain|what\s+is)\b/i.test(t)
    && (
      (
        /\b(?:write|add|create|generate|build|scaffold|make)\b/i.test(t)
        && /\b(?:unit\s+tests?|test\s+suite|e2e\s+suite|pytest|vitest|jest|playwright|cypress)\b/i.test(t)
      )
      || /\b(?:write|add|create|generate|build)\s+tests?\b/i.test(t)
    )
  ) {
    const bound = Boolean(opts?.diskRoot || opts?.projectId || (opts?.files && Object.keys(opts.files).length));
    if (bound) {
      return { kind: 'edit', reason: 'test-suite-edit-bound' };
    }
    return {
      kind: 'create',
      reason: 'test-suite-create',
      createName: extractProjectName(t) || fallbackCreateProjectName(t) || 'Tests',
    };
  }

  // Simple build toys (todo / timer / counter / calculator).
  // classifyTurn owns create-vs-chat for these (chatIdeaIntent only reports soft openers):
  //   imperative "build me a calculator"        → create (on disk, Nova Live — HTML paste in chat looks broken)
  //   soft "(can you) help (me) build a calc…"  → chat (talk + code in the bubble; no hard-go)
  if (looksLikeSimpleBuildToyChatAsk(t)) {
    // Native / non-web stacks mentioning toy nouns ("SwiftUI counter") are creates, not chat toys.
    if (/\b(?:swiftui|flutter|react\s+native|kotlin|jetpack\s+compose|compose\s+screen|electron|tauri|arduino|esp32|firmware)\b/i.test(t)) {
      return {
        kind: 'create',
        reason: 'native-toy-noun-create',
        createName: extractProjectName(t) || fallbackCreateProjectName(t) || 'App',
      };
    }
    const toyCreateApp = /\b(?:build|create|make|scaffold|start|write)\b/i.test(t)
      && !looksLikeSoftHelpBuildAsk(t)
      && !/\b(?:do\s+not|don't|dont)\s+(?:create|build)\b/i.test(t)
      && !wantsPlanningOnly(t)
      && !/\b(?:show\s+me|write\s+me|give\s+me|how\s+(?:do|would|can)|explain|what\s+if|thinking\s+about)\b/i.test(t)
      && !/\?/.test(t)
      && (
        // "build me a simple calculator" (no "app") still means on-disk create.
        // Ladder: "start a new project with a plain white blank page".
        /\b(?:app|application|project|calculator|todo|timer|counter|checklist|on\s+disk|scaffold|open\s+preview|get\s+it\s+live|blank\s+(?:white\s+)?page|plain\s+white)\b/i.test(t)
        || /^(?:please\s+)?(?:build|create|make|scaffold|start|write)\b/i.test(t)
      );
    if (toyCreateApp) {
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
  // Exclude single-object product visuals (“create a microphone on the page”).
  if (
    /^(?:please\s+)?(?:build|create|make|scaffold|implement|convert|migrate|refactor|rewrite|write)(?:\s+me)?\b/i.test(t)
    && !/^(?:please\s+)?(?:can\s+you|could\s+you|help\s+me)\b/i.test(t)
    && /\b(?:todo|to-?do|timer|counter|page|site|app|website|dashboard|control\s+panel|admin\s+panel|landing|list|vite|react|cli|api|server|library|package|script|tool|game|extension|service|scraper|crawler|spider|clone|pipeline|worker|plugin|middleware|sdk|hook|composable|parser|agent|rag|etl|bot|consumer|generator|converter|downloader|workflow|module|terraform|processor|engine|demo|physics|scene|editor|interface|system|tracker|puzzle|tester|playground|router|client|board|synth|loader|splitter|crm|pos|kanban|sudoku|quiz|habit|expense|booking|helpdesk|inventory|markdown|gradio|streamlit|lambda|webhook|imap|mdx|search\s+(?:engine|service|ui)|fuse\.?js|folium|ocr|neural|cron|load\s+tester|note\s+editor|chat\s+ui|prompt\s+playground|tiptap|codemirror|monaco|three\.?js|phaser|pixi|collaborative\s+filter|stable\s+diffusion|typing\s+(?:speed\s+)?test|serverless(?:\s+function)?|github\s+actions?|suite|widget|schema|resolvers?|receiver|interceptor|formula|firmware|flake|sketch|arduino|esp32|homebrew|rate\s+limiter|swiftui|kotlin|compose|yargs|playwright|tauri|electron|notepad|helm|dockerfile)\b/i.test(t)
    && (t.length < 520 || /\b(?:get\s+it\s+live|on\s+disk|vite|brand[- ]?new|one-?page)\b/i.test(t))
    && t.length < 4000
    && !/\b(?:how\s+(?:do|can|would)|what\s+is|explain|tell\s+me|familiar|want\s+to\s+build|thinking\s+about|are\s+you|i'?d\s+like|help\s+me)\b/i.test(t)
    && !wantsPlanningOnly(t)
    && !/\?/.test(t)
    && !looksLikeProductVisualObjectAsk(t)
    // Ladder section / micro shells on a bound folder must stay edit — not a new Site.
    && !isWebMicroAsk(t)
    && !(/\bHero\b/.test(t) && /\bFeatures?\b/.test(t))
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

  // Single-object product visuals always edit (glyph write on bound/latest create folder).
  // Never greenfield-create a new "Site" from "create a microphone on the page".
  if (looksLikeProductVisualObjectAsk(t)) {
    return { kind: 'edit', reason: workspace ? 'product-visual-bound' : 'product-visual-object' };
  }

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
    const hasProductNoun = /\b(?:app|application|website|site|web\s*app|project|page|landing|homepage|cli|api|sdk|bot|scraper|library|package|plugin|middleware|worker|extension|formula|firmware|flake|sketch|arduino|esp32|homebrew|game|electron|flutter|swiftui|kotlin)\b/i.test(t);
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
    if (looksLikeProductVisualObjectAsk(t)) {
      return { kind: 'edit', reason: 'product-visual-bound' };
    }
    if (looksLikeKeepBuildingAsk(t) || looksLikeInPlaceRebuildAsk(t)) {
      return { kind: 'keep_building', reason: looksLikeInPlaceRebuildAsk(t) ? 'inplace-rebuild-bound' : 'keep-building-bound' };
    }
    // "Create a blank purple screen" is a NEW project — never steal into edit/chat
    // just because a folder is already open.
    const blankCreateNew = Boolean(blankSolidColorFromAsk(t))
      && /\b(?:create|make|build|start|scaffold)\b/i.test(t)
      && /\b(?:blank|empty|nothing)\b/i.test(t);
    if (blankCreateNew) {
      const name = parseNewProjectIntent(t)?.name
        || extractProjectName(t)
        || fallbackCreateProjectName(t)
        || 'App';
      return { kind: 'create', reason: 'blank-solid-create-while-bound', createName: name };
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

  // Micro UI asks win over create-verb-noun — "Add a settings gear icon…" is edit, not a new App.
  // Edit turn resolves the latest create folder when the binder dropped after reload/HMR.
  // Never steal a named new-website create that happens to list hero/cards/footer.
  // Also never steal unbound greenfield creates ("Build a Fuse.js search", "Build a shop").
  // Bound folders keep surgical shell edits (ask-families kanban/landing/etc.).
  // looksLikeCodeEditAsk matches many "build …" asks via looksLikeBuildStart — gate those out when unbound.
  if (
    (isWebMicroAsk(t) || looksLikeCodeEditAsk(t))
    && !brandNewProductAsk(t)
    && !(looksLikeHardCreateGo(t) && /\b(?:website|site|project|app)\b/i.test(t))
    && !(
      !workspace
      && /^(?:please\s+)?(?:build|create|make|scaffold|ship|port|wrap|write|implement|convert|migrate|refactor|rewrite)\b/i.test(t)
      && /\b(?:dashboard|control\s+panel|cli|api|server|library|scraper|clone|pipeline|worker|plugin|bot|middleware|sdk|extension|composable|hooks?|generator|suite|flutter|react\s+native|electron|playwright|cypress|search\s+(?:engine|service|ui)|fuse\.?js|kanban\s+board|editor|scene|system|tracker|playground|router|client|crm|pos|gradio|streamlit|lambda|imap|mdx|folium|ocr|neural|cron|collaborative\s+filter|stable\s+diffusion|typing\s+(?:speed\s+)?test|tiptap|codemirror|monaco|three\.?js|shop|store|storefront|website|site|landing|homepage|online\s+store|widget|schema|resolvers?|receiver|formula|firmware|swiftui|kotlin|compose|yargs|arduino|esp32|homebrew|rate\s+limiter|tauri)\b/i.test(t)
    )
  ) {
    return { kind: 'edit', reason: workspace ? 'micro-or-code-edit-bound' : 'micro-or-code-edit-unbound' };
  }

  // Soft "I need an API" / "Gimme a CLI for renaming" / "want a scraper" /
  // bare "coffee inventory CLI" / "shop inventory API" → create.
  // Artifact kind still comes from resolveArtifactKind; this only opens the create path.
  if (
    !workspace
    && !wantsPlanningOnly(t)
    && !/\?/.test(t)
    && !/\b(?:how\s+(?:do|can|would)|explain|what\s+is|tell\s+me)\b/i.test(t)
    && !/\b(?:help\s+understanding|advice|recommend|should\s+i)\b/i.test(t)
    && (
      (
        /\b(?:need|want|gimme|give\s+me)\b/i.test(t)
        && /\b(?:cli|api|sdk|bot|scraper|crawler|library|package|plugin|middleware|worker|pipeline|hook|composable|parser|extension|dashboard|clone|server|backend|tool|script|game|agent|rag|processor|engine|graphql|schema|resolvers?|webhook|suite|generator|receiver|serverless|github\s+actions?|lambda|electron|tauri|notepad)\b/i.test(t)
      )
      || (
        // Trailing coding artifact with no verb — short inventory/tool briefs.
        t.length < 80
        && /(?:^|[\s])(?:cli|api|sdk|bot|scraper|worker|plugin|middleware|extension)\s*$/i.test(t)
        && /\b(?:inventory|shop|coffee|desk|file|rename|price|order|booking|hook|job|queue|keyboard|macro|chrome|browser)\b/i.test(t)
      )
      || (
        // Bare short coding nouns: "discord bot", "auth middleware", "vitest suite", "queue consumer"
        t.length < 48
        && /^(?:[\w.-]+\s+){0,3}(?:(?:discord|slack|telegram)\s+)?(?:bots?|cli|api|sdk|scraper|worker|plugin|middleware|extension|queue\s+consumer|message\s+consumer|(?:vitest|jest|pytest)\s+suite|test\s+suite|auth\s+middleware|rate\s+limiter)\s*$/i.test(t)
      )
      || (
        // Bare product invent without Build verb: "Online store for sneakers"
        t.length < 120
        && /\b(?:online\s+store|storefront|brand\s+website|landing\s+page)\b/i.test(t)
        && /\b(?:for|for\s+our|for\s+my)\b/i.test(t)
      )
      || (
        // Bare "Dashboard for my shoe store" / "Scraper for Amazon prices" / "Tests for checkout"
        t.length < 100
        && /^(?:[\w.-]+\s+){0,3}(?:dashboard|scraper|crawler|cli|api|tests?)\b/i.test(t)
        && /\b(?:for|of)\b/i.test(t)
      )
      || (
        // "Make something that renames PDFs" / "thing that batch-renames files"
        /\b(?:build|create|make|write)\b/i.test(t)
        && /\b(?:something|thing|tool|script|utility)\b/i.test(t)
        && /\brename/i.test(t)
        && /\b(?:files?|folders?|pdfs?|images?|docs?)\b/i.test(t)
      )
      || (
        // "Fine-tune an LLM" / "Train a model on images"
        /\b(?:fine-?tun(?:e|ing)?|train(?:ing)?\s+(?:a\s+)?(?:model|llm))\b/i.test(t)
        && !/\b(?:how|explain|what)\b/i.test(t)
      )
    )
  ) {
    return {
      kind: 'create',
      reason: 'soft-need-coding-create',
      createName: extractProjectName(t) || fallbackCreateProjectName(t) || 'App',
    };
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
    // Disk route is delete-only now (add_file no longer pushes disk). Keep this
    // as delete for delete_file / delete_project intents.
    return { kind: 'delete', reason: 'router-disk' };
  }
  if (route === 'pc_restore' || route === 'folder_catalog' || route === 'pc_explore') {
    return { kind: 'chat', reason: `router-${route}` };
  }

  return { kind: 'chat', reason: 'fallback-chat' };
}

type ClassifyTurnOpts = Parameters<typeof classifyTurn>[1];

/** Raw talk-first signal (soft “help me create…” or exploratory requirements). Not a final verdict. */
export function looksLikeTalkFirstProductAsk(message: string): boolean {
  const t = String(message || '');
  return looksLikeTalkBeforeCreateAsk(t) || looksLikeRequirementsAsk(t);
}

/** True when classifyTurn decides this turn creates a project. */
export function isCreateTurn(message: string, opts?: ClassifyTurnOpts): boolean {
  return classifyTurn(message, opts).kind === 'create';
}

/**
 * SSOT for preamble planning-hold: never hold when this turn is create.
 * Call sites must use this instead of raw wantsPlanningOnly / keep-planning alone.
 */
export function planningHoldAllowed(message: string, opts?: ClassifyTurnOpts): boolean {
  if (isCreateTurn(message, opts)) return false;
  const t = String(message || '');
  return wantsPlanningOnly(t) || looksLikeGreenfieldKeepPlanning(t);
}

/**
 * Talk-first product chat: exploratory / requirements wording AND classifyTurn did not pick create.
 * Use instead of re-deciding greenfield heuristics at call sites.
 */
export function isTalkFirstChatTurn(message: string, opts?: ClassifyTurnOpts): boolean {
  return looksLikeTalkFirstProductAsk(message) && !isCreateTurn(message, opts);
}

/** Soft “talk before create” opener that classifyTurn keeps as chat (never create). */
export function isTalkBeforeCreateChatTurn(message: string, opts?: ClassifyTurnOpts): boolean {
  return looksLikeTalkBeforeCreateAsk(String(message || '')) && !isCreateTurn(message, opts);
}
