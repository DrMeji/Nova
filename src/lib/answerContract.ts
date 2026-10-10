/**
 * Answer Contract — frozen product rules for chat replies (Answer Spine).
 *
 * Do NOT add new chat-path `looksLike*` winners that bypass this module.
 * Old gates may feed signals into `resolveAnswerContract`; they must not race to own the bubble.
 *
 * Grounding priority:
 * 1. Project-referential + bound folder → disk only (web/plugins off)
 * 2. Thread follow-up → stay on prior topic
 * 3. Clear open-world fact ask → web + cited compose
 * 4. Casual/creative → companion (model+thread); web only for explicit fact/buy/lookup
 * 5. Ambiguous + folder bound → prefer disk
 *
 * Honesty: missing evidence → say so. Never invent links, clinic dumps, or plugin data.
 */

import {
  looksLikeBoundProjectAsk,
  looksLikeProjectDebugAsk,
  looksLikeProjectOverviewAsk,
} from '@/lib/chatProjectDebug';
import { isTalkFirstChatTurn } from '@/lib/classifyTurn';
import {
  looksLikeWebGroundedAsk,
  looksLikeBookFindOrBuyAsk,
  looksLikeIdentifyMediaAsk,
  looksLikeExplicitResearchAsk,
  looksLikeRejectedPriorAnswerAsk,
  looksLikeCreativeAsk,
  looksLikeLyricsAsk,
  looksLikeSideQuestAsk,
  looksLikeThreadFollowUpAsk,
  looksLikeBareExpandAsk,
} from '@/lib/webSearch';
import { looksLikeShoppingOrPartsLinksAsk, looksLikeHowToGuideAsk, looksLikeBuildToolingAsk } from '@/lib/replySanity';
import { looksLikeSimpleBuildToyChatAsk } from '@/lib/chatIntent';
import { looksLikeColorCodeAsk } from '@/lib/colorCodeAsk';
import { looksLikePureGreeting } from '@/lib/plainChatAsk';

export type AnswerJob =
  | 'answer'
  | 'explain'
  | 'research'
  | 'entertain'
  | 'diagnose'
  | 'deterministic'
  | 'plan_talk';

export type AnswerTopic =
  | 'bound_project'
  | 'thread_entity'
  | 'open_world'
  | 'creative'
  | 'none';

export type AnswerGrounding =
  | 'disk'
  | 'thread'
  | 'web'
  | 'model'
  | 'none';

export type AnswerStance =
  | 'studio_precise'
  | 'companion'
  | 'research_cited'
  | 'deterministic';

export type AnswerContract = {
  job: AnswerJob;
  topic: AnswerTopic;
  grounding: AnswerGrounding;
  stance: AnswerStance;
  /** Primary gatherer may use the public web. */
  allowWeb: boolean;
  /** Catalog plugins may run for this turn. */
  allowPlugins: boolean;
  /** Route through answerStudio / disk inspect. */
  useStudioDisk: boolean;
  reason: string;
};

export type ResolveAnswerContractOpts = {
  message: string;
  /** Bound folder has real source files on disk / in studio map. */
  hasBoundFiles: boolean;
  priorHistory?: { role: string; content: string }[] | null;
};

function projectReferential(t: string): boolean {
  return /\b(?:this|the|my|our)\s+(?:project|folder|app|codebase|code)\b/i.test(t)
    || /\b(?:full\s+)?report\s+on\s+(?:this|the|my|our)\b/i.test(t)
    || looksLikeBoundProjectAsk(t);
}

function companionCreativeAsk(t: string): boolean {
  if (looksLikeCreativeAsk(t)) return true;
  // Explicit companion / no-research cues
  if (/\b(?:let'?s\s+talk|no\s+shopping\s+links|stay\s+on\s+this\s+book|what\s+did\s+you\s+think|what\s+makes)\b/i.test(t)
    && /\b(?:book|novel|story|chapter|character|plot|series|author|kvothe|rothfuss)\b/i.test(t)) {
    return true;
  }
  // Casual book/story chat without buy/find/identify research intent.
  if (
    /\b(?:book|novel|storytelling|story|chapter|character|plot|series|author)\b/i.test(t)
    && !looksLikeBookFindOrBuyAsk(t)
    && !looksLikeIdentifyMediaAsk(t)
    && !looksLikeExplicitResearchAsk(t)
    && !/\b(?:buy|purchase|order|price|where\s+can\s+i\s+(?:get|find|read)|amazon|barnes)\b/i.test(t)
  ) {
    return true;
  }
  // Titled fiction without the word "book"
  if (
    /\b(?:the\s+name\s+of\s+the\s+wind|city\s+of\s+ashes|harry\s+potter|lord\s+of\s+the\s+rings)\b/i.test(t)
    && !looksLikeBookFindOrBuyAsk(t)
    && !/\b(?:buy|purchase|amazon|where\s+can\s+i)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Single SSOT for how a chat turn may gather evidence and compose a reply.
 */
export function resolveAnswerContract(opts: ResolveAnswerContractOpts): AnswerContract {
  const t = String(opts.message || '').trim();
  const bound = Boolean(opts.hasBoundFiles);

  if (!t) {
    return {
      job: 'answer',
      topic: 'none',
      grounding: 'none',
      stance: 'companion',
      allowWeb: false,
      allowPlugins: false,
      useStudioDisk: false,
      reason: 'empty',
    };
  }

  // Deterministic short paths (no model invent / no web).
  if (looksLikeLyricsAsk(t) || looksLikeColorCodeAsk(t)) {
    return {
      job: 'deterministic',
      topic: 'none',
      grounding: 'none',
      stance: 'deterministic',
      allowWeb: false,
      allowPlugins: false,
      useStudioDisk: false,
      reason: 'deterministic-short',
    };
  }

  if (looksLikePureGreeting(t)) {
    return {
      job: 'deterministic',
      topic: 'none',
      grounding: 'none',
      stance: 'deterministic',
      allowWeb: false,
      allowPlugins: false,
      useStudioDisk: false,
      reason: 'greeting',
    };
  }

  // Mini demos (calculator / todo / timer) — explain with code in chat; never product plan_talk.
  if (looksLikeSimpleBuildToyChatAsk(t)) {
    return {
      job: 'explain',
      topic: 'open_world',
      grounding: 'model',
      stance: 'companion',
      allowWeb: false,
      allowPlugins: false,
      useStudioDisk: false,
      reason: 'simple-build-toy',
    };
  }

  // Shopping / buy-parts / store links — web research FIRST (never product-plan talk).
  // “give me links to buy parts to build X” must not become “Overall: keep v1 tiny…”.
  // Tooling / IDE asks (Python, VS Code) stay normal explain chat — never Plan.
  if (
    looksLikeShoppingOrPartsLinksAsk(t)
    || looksLikeHowToGuideAsk(t)
    || looksLikeBuildToolingAsk(t)
    || looksLikeBookFindOrBuyAsk(t)
    || looksLikeIdentifyMediaAsk(t)
    || looksLikeExplicitResearchAsk(t)
    || looksLikeRejectedPriorAnswerAsk(t)
  ) {
    return {
      job: (looksLikeHowToGuideAsk(t) || looksLikeBuildToolingAsk(t)) && !looksLikeShoppingOrPartsLinksAsk(t)
        ? 'explain'
        : 'research',
      topic: 'open_world',
      grounding: looksLikeBuildToolingAsk(t) && !looksLikeHowToGuideAsk(t) && !looksLikeShoppingOrPartsLinksAsk(t)
        ? 'model'
        : 'web',
      stance: looksLikeBuildToolingAsk(t) && !looksLikeHowToGuideAsk(t) && !looksLikeShoppingOrPartsLinksAsk(t)
        ? 'companion'
        : 'research_cited',
      allowWeb: !(looksLikeBuildToolingAsk(t) && !looksLikeHowToGuideAsk(t) && !looksLikeShoppingOrPartsLinksAsk(t)),
      allowPlugins: false,
      useStudioDisk: false,
      reason: looksLikeShoppingOrPartsLinksAsk(t)
        ? 'shopping-links'
        : looksLikeHowToGuideAsk(t)
          ? 'howto-guide'
          : looksLikeBuildToolingAsk(t)
            ? 'build-tooling'
            : 'explicit-research',
    };
  }

  // Product planning talk — never web/plugins/disk clinic.
  // Exclude real-world advice playbooks (validate SaaS idea, construction, business weeks).
  const realWorldAdvice =
    /\b(?:validate|validation|founder|budget|week[- ]by[- ]week|30\s+days|customer\s+interview)\b/i.test(t)
    && !/\b(?:vite|react|scaffold|landing\s+page|on\s+disk|create\s+(?:the\s+)?(?:files|project))\b/i.test(t);
  if (
    !realWorldAdvice
    && isTalkFirstChatTurn(t)
    && !looksLikeWebGroundedAsk(t)
    && !looksLikeShoppingOrPartsLinksAsk(t)
    && !looksLikeHowToGuideAsk(t)
    && !looksLikeBuildToolingAsk(t)
    && !looksLikeSimpleBuildToyChatAsk(t)
  ) {
    return {
      job: 'plan_talk',
      topic: 'none',
      grounding: 'model',
      stance: 'companion',
      allowWeb: false,
      allowPlugins: false,
      useStudioDisk: false,
      reason: 'talk-before-create',
    };
  }

  // Bound project wins over web / plugins / clinic dumps for overview.
  if (bound && projectReferential(t)) {
    if (looksLikeProjectDebugAsk(t)) {
      return {
        job: 'diagnose',
        topic: 'bound_project',
        grounding: 'disk',
        stance: 'studio_precise',
        allowWeb: false,
        allowPlugins: false,
        useStudioDisk: true,
        reason: 'bound-diagnose',
      };
    }
    if (looksLikeProjectOverviewAsk(t) || projectReferential(t)) {
      return {
        job: looksLikeProjectOverviewAsk(t) ? 'explain' : 'answer',
        topic: 'bound_project',
        grounding: 'disk',
        stance: 'studio_precise',
        allowWeb: false,
        allowPlugins: false,
        useStudioDisk: true,
        reason: 'bound-overview',
      };
    }
  }

  // Ambiguous + bound folder → prefer disk (never invent web filler).
  if (
    bound
    && /\b(?:more\s+(?:info|information|details?)|tell\s+me\s+more|full\s+report|what\s+(?:is|about))\b/i.test(t)
    && !/\b(?:who\s+is|elon|celebrity|net\s*worth|https?:\/\/)\b/i.test(t)
    && !looksLikeIdentifyMediaAsk(t)
    && !looksLikeBookFindOrBuyAsk(t)
  ) {
    return {
      job: 'explain',
      topic: 'bound_project',
      grounding: 'disk',
      stance: 'studio_precise',
      allowWeb: false,
      allowPlugins: false,
      useStudioDisk: true,
      reason: 'bound-ambiguous-prefer-disk',
    };
  }

  // Explicit research / identify / buy links → web (also handled earlier for shopping;
  // keep this block for any remaining web-grounded signals that skipped above).
  const research =
    looksLikeIdentifyMediaAsk(t)
    || looksLikeExplicitResearchAsk(t)
    || looksLikeRejectedPriorAnswerAsk(t)
    || looksLikeBookFindOrBuyAsk(t)
    || looksLikeShoppingOrPartsLinksAsk(t);

  if (research) {
    return {
      job: 'research',
      topic: 'open_world',
      grounding: 'web',
      stance: 'research_cited',
      allowWeb: true,
      allowPlugins: false,
      useStudioDisk: false,
      reason: 'explicit-research',
    };
  }

  // Companion creative / book chat — no research hijack.
  if (companionCreativeAsk(t) && !looksLikeWebGroundedAsk(t)) {
    return {
      job: 'entertain',
      topic: 'creative',
      grounding: 'model',
      stance: 'companion',
      allowWeb: false,
      allowPlugins: false,
      useStudioDisk: false,
      reason: 'companion-creative',
    };
  }

  // Thread follow-up: stay on prior topic; web only if prior was open-world or ask clearly needs facts.
  const followUp = looksLikeThreadFollowUpAsk(t);
  if (followUp) {
    const priorWasProject = (opts.priorHistory || []).some((h) =>
      h.role === 'user' && looksLikeBoundProjectAsk(String(h.content || '')),
    );
    if (bound && (priorWasProject || projectReferential(t))) {
      return {
        job: 'explain',
        topic: 'bound_project',
        grounding: 'disk',
        stance: 'studio_precise',
        allowWeb: false,
        allowPlugins: false,
        useStudioDisk: true,
        reason: 'thread-followup-project',
      };
    }
    const bareExpand = looksLikeBareExpandAsk(t);
    const lastSubstantiveUser = [...(opts.priorHistory || [])]
      .reverse()
      .find((h) => {
        if (h.role !== 'user') return false;
        const c = String(h.content || '').trim();
        return c.length >= 8 && !looksLikeBareExpandAsk(c);
      });
    const priorWasWebTopic = Boolean(
      lastSubstantiveUser
      && looksLikeWebGroundedAsk(String(lastSubstantiveUser.content || '')),
    );
    // Bare “more info” after a how-it-works / chat answer → deepen in-thread (no phrase web search).
    // Bare expand after a real research ask (Elon, news, identify) → keep web with prior topic as query.
    const needsWeb = bareExpand
      ? priorWasWebTopic
      : (looksLikeWebGroundedAsk(t)
        || /\b(?:net\s*worth|who\s+(?:is|are)|look\s+up|research|wrong|not\s+the\s+name)\b/i.test(t));
    if (needsWeb) {
      return {
        job: 'research',
        topic: 'thread_entity',
        grounding: 'web',
        stance: 'research_cited',
        allowWeb: true,
        allowPlugins: false,
        useStudioDisk: false,
        reason: bareExpand ? 'thread-followup-web-expand' : 'thread-followup-web',
      };
    }
    return {
      job: 'answer',
      topic: 'thread_entity',
      grounding: 'thread',
      stance: 'companion',
      allowWeb: false,
      allowPlugins: false,
      useStudioDisk: false,
      reason: bareExpand ? 'thread-followup-expand' : 'thread-followup-stay',
    };
  }

  // Open-world web asks.
  if (looksLikeWebGroundedAsk(t)) {
    return {
      job: 'research',
      topic: 'open_world',
      grounding: 'web',
      stance: 'research_cited',
      allowWeb: true,
      allowPlugins: false,
      useStudioDisk: false,
      reason: 'web-grounded',
    };
  }

  // Side quest without web → companion.
  if (looksLikeSideQuestAsk(t) || companionCreativeAsk(t)) {
    return {
      job: 'entertain',
      topic: 'creative',
      grounding: 'model',
      stance: 'companion',
      allowWeb: false,
      allowPlugins: false,
      useStudioDisk: false,
      reason: 'side-quest-companion',
    };
  }

  // Default: model answer; plugins only if caller already detected explicit plugin intent.
  return {
    job: 'answer',
    topic: 'none',
    grounding: 'model',
    stance: 'companion',
    allowWeb: false,
    allowPlugins: true,
    useStudioDisk: false,
    reason: 'default-model',
  };
}

/** True when plugins must not run (bound project / disk contract). */
export function contractBlocksPlugins(contract: AnswerContract): boolean {
  return !contract.allowPlugins || contract.grounding === 'disk' || contract.topic === 'bound_project';
}
