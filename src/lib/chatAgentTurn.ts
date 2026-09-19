/**
 * Chat agent turn helpers. workspace gates, Ask/Plan/Agent modes, edit/exec policy.
 */

import { looksLikeBuildStart } from '@/lib/chatStudio';
import { looksLikeImplementGo, isPlanPrefixedMessage } from '@/lib/chatPlanMode';
import { looksLikePromptEcho } from '@/lib/chatHistory';
import { looksLikeConversationalPlanningAsk, wantsPlanningOnly } from '@/lib/chatIdeaIntent';
import { looksLikeProjectDebugAsk } from '@/lib/chatProjectDebug';
import { looksLikeInPlaceRebuildAsk, looksLikeProductCorrectionAsk } from '@/lib/chatBuildIntent';

export const NO_WORKSPACE_MSG =
  'No workspace yet. Use **+ → Open folder** or name a folder on your Desktop (turn on access in **Settings → Security**).\n\nIf you want to talk through an app idea first, just keep chatting. say **lets build this** only when you want files on disk.';

/** Bare “keep building” / continue — polish the open project on disk (not chat-only planning). */
export function looksLikeKeepBuildingAsk(text: string): boolean {
  const t = String(text || '').replace(/^\[(?:Plan|Ask|Debug|Tasks)\]\s*/i, '').trim();
  if (!t || t.length > 120) return false;
  if (
    /^(?:keep\s+building|continue\s+building|keep\s+going|continue\s+(?:going|polish(?:ing)?)|build\s+more|expand\s+(?:it|this)|polish\s+(?:it|this|more))\s*[.!]?$/i.test(t)
  ) {
    return true;
  }
  return /\b(?:keep\s+building|continue\s+building)\b/i.test(t)
    && !/\b(?:from\s+scratch|rebuild|scrap|new\s+project|create\s+project)\b/i.test(t)
    && t.split(/\s+/).length <= 8;
}

export type ComposerAgentMode = 'ask' | 'plan' | 'agent' | 'debug' | 'multitask' | null;

/** Bound only when THIS chat has a disk folder or real file map — never a global pending bind. */
export function hasActiveWorkspace(opts: {
  files: Record<string, string>;
  projectId: string | null;
  diskRoot: string | null;
  chatId?: string | null;
}): boolean {
  if (opts.diskRoot || Object.keys(opts.files || {}).length > 0) return true;
  try {
    if (opts.chatId && typeof sessionStorage !== 'undefined') {
      const last = sessionStorage.getItem(`NOVA:last-disk:${opts.chatId}`);
      if (last && String(last).trim()) return true;
    }
    if (typeof localStorage !== 'undefined' && opts.chatId) {
      const last = localStorage.getItem(`NOVA:last-disk:${opts.chatId}`);
      if (last && String(last).trim()) return true;
    }
  } catch { /* ignore */ }
  return false;
}

export function normalizeComposerMode(mode: ComposerAgentMode): 'ask' | 'plan' | 'agent' {
  if (mode === 'plan') return 'plan';
  if (mode === 'ask') return 'ask';
  if (mode === 'agent' || mode === 'debug') return 'agent';
  // Default chat (no chip) and Tasks: allow code edits when the user asks to change code.
  return 'agent';
}

const PLAN_PREFIX = 'Plan this out step by step, then we can build:\n\n';
const AGENT_PREFIX = 'Agent mode. edit files and run approved tools in this workspace:\n\n';
const DEBUG_PREFIX = 'Debug this. find the issue and propose a fix:\n\n';
const TASKS_PREFIX = 'Break this into parallel tasks and tackle them clearly:\n\n';

export function stripComposerPrefix(text: string): string {
  return String(text || '')
    .replace(PLAN_PREFIX, '')
    .replace(AGENT_PREFIX, '')
    .replace(DEBUG_PREFIX, '')
    .replace(TASKS_PREFIX, '')
    .replace(/^[\[](?:Plan|Ask|Debug|Tasks)[\]]\s*/i, '')
    .trim();
}

export function isChatPlanTurn(content: string): boolean {
  return content.startsWith(PLAN_PREFIX) || isPlanPrefixedMessage(content);
}

export function isChatAgentTurn(content: string, composerMode: ComposerAgentMode): boolean {
  if (composerMode === 'agent' || composerMode === 'debug') return true;
  return content.startsWith(AGENT_PREFIX) || looksLikeImplementGo(content);
}

export function modeBlocksFileWrites(mode: 'ask' | 'plan' | 'agent', content: string): boolean {
  if (mode === 'ask') return true;
  // Plan mode still allows concrete UI/copy edits on an already-bound project.
  if (mode === 'plan') {
    if (looksLikeImplementGo(content)) return false;
    if (/\b(?:change|update|set|rename|edit|make)\b[\s\S]{0,100}\b(?:hero|headline|heading|title|h1|button|text|label|copy|wording|background|color)\b/i.test(content)) {
      return false;
    }
    return true;
  }
  return false;
}

export function modeBlocksExec(mode: 'ask' | 'plan' | 'agent'): boolean {
  return mode === 'ask' || mode === 'plan';
}

/** User wants Chat to change code/UI in the open workspace (Codex-style). */
export function looksLikeCodeEditAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Keep building is a disk polish ask when a folder is bound (handled by callers with workspace).
  // Still treat the bare phrase as an edit intent so Ready retries actually write files.
  if (looksLikeKeepBuildingAsk(t)) return true;
  // Planning / MVP sequencing. not a disk edit.
  if (wantsPlanningOnly(t)) return false;
  if (/\b(?:mvp\s+order|what\s+should\s+i\s+build|build\s+first|sequence\s+the\s+work|week\s+one)\b/i.test(t)) return false;
  if (/\b(?:also\s+)?add\b/i.test(t) && /\b(?:plan|reminder|chart|report|bill|feature|panel|modal|screen)\b/i.test(t)
    && !/\b(?:file|code|component|css|folder|scaffold|project)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:do\s+not|don't|dont)\s+create\b/i.test(t) && !/\b(?:new\s+project|sibling)\b/i.test(t)) {
    // "don't create a new project — rebuild this" still counts as an edit.
  } else if (/\b(?:do\s+not|don't|dont)\s+create\b/i.test(t)) {
    return false;
  }
  if (looksLikeImplementGo(t) || looksLikeBuildStart(t)) return true;
  if (looksLikeProductCorrectionAsk(t) || looksLikeInPlaceRebuildAsk(t)) return true;
  if (/\b(?:scrap|rebuild|redo|replace)\b[\s\S]{0,80}\b(?:ui|layout|app|folder|project|screen|page|everything|game|site)\b/i.test(t)) return true;
  if (/\bturn\s+(?:this|it)\s+into\b/i.test(t)) return true;
  if (/\b(?:not\s+what\s+i\s+(?:asked|wanted)|completely\s+wrong|actual\s+game)\b/i.test(t)) return true;
  if (/\b(title\s*bar|sidebar|note\s*list|main\s+editor|dark\s+theme)\b/i.test(t)) return true;
  if (/\blocalStorage\b/i.test(t) && /\b(add|change|update|persist|save|use|wire|hook)\b/i.test(t)) return true;
  // Explicit disk-apply asks always count as edits (even when phrasing is feature-heavy).
  if (/\bapply\b[\s\S]{0,80}\b(?:edits?|changes?|this|them|it)\b[\s\S]{0,40}\bon\s+disk\b/i.test(t)) return true;
  if (/\b(?:edits?|changes?)\s+on\s+disk\b/i.test(t) && /\b(?:apply|save|write|patch)\b/i.test(t)) return true;
  if (/\b(add|put|place|move|insert|create|drop|fold)\b[\s\S]{0,100}\b(button|icon|logo|header|footer|nav|navbar|search|settings|sidebar|menu|title|page|tab|modal|form|input|link|preference|note|about|section|hero|badge|avatar|chip|bar|indicator)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(drop|remove|delete|get rid of)\b[\s\S]{0,80}\b(page|section|about|button|nav|tab|footer|copyright|line|text|link|icon|panel|clutter|sidebar|hud|indicator)\b/i.test(t)) {
    return true;
  }
  if (/\bedit\s+this\s+(?:same\s+)?(?:project|app|game|site|folder)\b/i.test(t)) return true;
  // Bound-project game tweaks only — not casual chat like “a speed bump every few meals”.
  if (
    /\b(?:make\s+(?:the\s+)?(?:player|snake|pac|character)\s+(?:a\s+bit\s+)?faster|bump\s+(?:the\s+)?(?:power[\s-]?pellet|score)|power[\s-]?pellet\s+(?:score\s+)?(?:to\s+)?100)\b/i.test(t)
  ) {
    return true;
  }
  // Spatial / 3D editor micro-edits (grid, cube button, orbit) on the open project.
  if (
    /\b(?:grid|cube|sphere|mesh|orbit|viewport|contrast)\b/i.test(t)
    && /\b(?:bump|make|add|show|obvious|brighter|stronger|contrast|default)\b/i.test(t)
  ) {
    return true;
  }
  if (/\bsame\s+project(?:\s+folder)?\b/i.test(t) && /\b(?:bump|make|add|change|update|fix|edit)\b/i.test(t)) {
    return true;
  }
  if (/\bwaitlist\b/i.test(t) || (/\bcontact\b/i.test(t) && /\b(email|form|button)\b/i.test(t) && /\b(keep|only|just|add|change)\b/i.test(t))) {
    return true;
  }
  if (
    /\b(change|update|set|make|edit|fix|rename|restyle)\b[\s\S]{0,100}\b(background|color|colour|font|title|text|layout|style|css|button|icon|logo|header|hero|headline|heading|h1|copy|wording|theme|column|label|hint|gradient|teal|notes?|name)\b/i.test(t)
  ) {
    // Casual science / Q&A ("how do octopuses change color?"). not a UI edit.
    if (
      /\?\s*$/.test(t)
      || /\b(?:how|why|what|when|where)\s+(?:do|does|did|can|would|is|are)\b/i.test(t)
    ) {
      if (!/\b(?:app|project|file|code|css|theme|button|page|component|ui|screen|layout)\b/i.test(t)) {
        return false;
      }
    }
    return true;
  }
  if (
    /\b(add|implement|build|create|write)\b[\s\S]{0,100}\b(settings|preferences|search|login|profile|dashboard|page|component|feature|section|layout)\b/i.test(t)
  ) {
    return true;
  }
  if (/\b(refactor|extract|wire(?:\s+up)?|hook up)\b/i.test(t)) return true;
  if (/\b(top right|top left|bottom right|bottom left|center|middle)\b/i.test(t)
    && /\b(add|put|place|move|put)\b/i.test(t)) {
    return true;
  }
  // "Center white words that say …" / "wording only on the brown screen"
  if (
    /\b(?:center|centred|middle)\b[\s\S]{0,48}\b(?:words?|text|title|phrase|wording|copy)\b/i.test(t)
    || (
      /\b(?:words?|text|phrase|wording)\b/i.test(t)
      && /\b(?:says?|reading)\b/i.test(t)
      && /\b(?:screen|page|brown|center|centred|middle|viewport)\b/i.test(t)
    )
  ) {
    return true;
  }
  // "Add a comment near the top of app/main.py"
  if (/\b(add|insert|put|write)\b[\s\S]{0,100}\bcomments?\b/i.test(t)) return true;
  if (
    /\b(?:[\w.-]+\/)+[\w.-]+\.[a-z0-9]{1,8}\b/i.test(t)
    && /\b(add|edit|change|update|fix|insert|comment|patch|write)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

export function chatTurnAllowsFileEdits(content: string, composerMode: ComposerAgentMode): boolean {
  const mode = normalizeComposerMode(composerMode);
  // Explicit UI/code edits always write — even if the composer chip is Ask.
  if (looksLikeImplementGo(content) || looksLikeBuildStart(content) || looksLikeCodeEditAsk(content)) {
    return true;
  }
  if (mode === 'ask') return false;
  if (modeBlocksFileWrites(mode, content)) return false;
  if (looksLikePromptEcho(content)) return false;
  if (wantsPlanningOnly(content) || looksLikeConversationalPlanningAsk(content)) return false;
  if (looksLikeProjectDebugAsk(content)) return true;
  if (mode === 'agent') {
    const t = String(content || '').trim();
    // Casual Q&A like "what can you help me build?" must hit the model. not the no-workspace wall.
    if (
      /\?/.test(t)
      && /\b(what|how|why|which|can you|could you|help me|tell me|explain|would|will)\b/i.test(t)
      && !/\b(create|add|edit|write|implement|fix|change|update|delete|remove)\b[\s\S]{0,80}\b(file|code|component|page|button|layout|css|function)\b/i.test(t)
    ) {
      return false;
    }
    // "not ready to create" / planning talk still contains create|build words.
    if (/\b(?:not\s+ready|just\s+(?:talk|discuss|conversation)|no\s+project\s+yet|do\s+not\s+create)\b/i.test(t)) {
      return false;
    }
    // Timeline / feasibility ("how quick could a first usable version"). not an edit.
    if (/\b(?:how\s+(?:quick|long|fast|soon)|usable\s+version|scope\s+tiny|overthinking)\b/i.test(t)) {
      return false;
    }
    return /\b(create|add|edit|write|implement|build|fix|change|update|delete|remove|drop|fold|move)\b/i.test(t);
  }
  return false;
}

export function chatTurnAllowsExec(content: string, composerMode: ComposerAgentMode): boolean {
  const mode = normalizeComposerMode(composerMode);
  if (modeBlocksExec(mode)) return false;
  if (isChatAgentTurn(content, composerMode)) return true;
  const t = String(content || '');
  // "will it run fine on my PC" is planning. not shell exec.
  if (/\brun\b/i.test(t) && /\b(?:run\s+(?:fine|well|ok|okay|smooth|alright)|run\s+on\s+(?:my|a|the)|run\s+in\s+(?:the\s+)?browser)\b/i.test(t)) {
    return false;
  }
  return /\b(install|npm|pip|git|execute|winget|choco|restore\s+point|checkpoint)\b/i.test(t)
    || /\brun\s+(?:npm|npx|yarn|pnpm|pip|python|node|the\s+(?:dev\s+)?server|tests?|build|script)\b/i.test(t);
}

export function workspacePathLabel(opts: {
  diskRoot: string | null;
  name?: string | null;
}): string | null {
  if (opts.diskRoot) return opts.diskRoot;
  if (opts.name) return opts.name;
  return null;
}
