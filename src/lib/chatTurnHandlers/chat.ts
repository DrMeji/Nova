/**
 * Chat turn — Q&A / inspect. Only place besides edit.ts that may call answerStudio.
 * Pure social asks (story, hello, jokes) skip studio packing entirely.
 */

import { answerStudio } from '@/lib/studioAnswerEngine';
import { arkRoute, routerProviderLabel } from '@/lib/arkRouter';
import { buildRouterHistory, type RouterChatTurn } from '@/lib/chatHistory';
import { getLocalPrefs } from '@/lib/localPrefs';
import { chatSuccess, type ChatSuccess } from '@/lib/productContract';
import {
  hasRealStudioFiles,
  looksLikePlainChatAsk,
  looksLikePureGreeting,
  looksLikeCapabilityOverviewAsk,
  scrubFalseProjectChatPreamble,
  scrubTalkFirstCodeBleed,
} from '@/lib/plainChatAsk';
import { looksLikeTalkBeforeCreateAsk, looksLikeRequirementsAsk } from '@/lib/chatIdeaIntent';

/** Soft style hints for the model — never a canned user-visible reply. */
function plainChatHistorySeed(content: string): RouterChatTurn[] {
  if (looksLikePureGreeting(content)) {
    return [{
      role: 'user',
      content: '[Reply style for this turn: one short natural greeting only. Do not list features or capabilities.]',
    }, {
      role: 'assistant',
      content: 'Understood.',
    }];
  }
  if (looksLikeCapabilityOverviewAsk(content)) {
    return [{
      role: 'user',
      content: '[Reply style for this turn: ONE professional sentence (two max) about what NOVA actually does — chat with local or cloud models on this PC, build websites and apps when the user asks you to create them, edit files in folders they grant, and help with images and projects. No numbered lists. No fake categories like calendar, entertainment packages, or generic personal assistance.]',
    }, {
      role: 'assistant',
      content: 'Understood — one real sentence about NOVA.',
    }];
  }
  if (looksLikeTalkBeforeCreateAsk(content) || looksLikeRequirementsAsk(content)) {
    return [{
      role: 'user',
      content: [
        '[Reply style for this turn: answer the user\'s question fully in clear prose.',
        'If they ask whether you know a product (Discord, Twitch, Netflix, etc.), say yes and briefly what it is, then discuss what building something like it would involve (core features, rough stack choices, what to decide first).',
        'Finish every answer — never stop mid-sentence or after a colon.',
        'Do NOT dump code, @@@FILE blocks, markdown fences, Flask/Express scaffolds, or language tags like :javascript / :cpp.',
        'Do NOT create files. Talk only until they clearly ask you to build it out.]',
      ].join(' '),
    }, {
      role: 'assistant',
      content: 'Understood — full conversational answer, no code dump.',
    }];
  }
  return [];
}

export type ChatTurnHost = {
  content: string;
  files: Record<string, string>;
  projectName?: string;
  mode: 'chat' | 'code';
  allowFileEdits: boolean;
  preferredModelId?: string | null;
  preferredModelName?: string | null;
  preferredSource?: string | null;
  stickyModelId?: string | null;
  stickyModelName?: string | null;
  stickyPinnedSource?: string | null;
  planOnly?: boolean;
  shouldAbort: () => boolean;
  onDelta?: (live: string) => void;
  timeoutMs?: number;
};

export type ChatTurnResult = {
  status: 'handled';
  text: string;
  intent?: unknown;
  findings?: unknown;
  packedTokens?: number;
  contract: ChatSuccess;
  provider?: string;
};

/** Cap enrich at 120s, micro/chat at 45s. */
export async function runChatTurn(host: ChatTurnHost): Promise<ChatTurnResult> {
  const started = Date.now();
  const cap = host.timeoutMs ?? (host.allowFileEdits ? 120_000 : 45_000);

  // Plain social / creative / requirements chat — never invent empty project context.
  // Talk-before-create / requirements stay on this path even if a prior folder is bound,
  // so exploratory Discord/Netflix chats cannot dump @@@FILE into the bubble.
  const talkOrAdvice =
    looksLikeTalkBeforeCreateAsk(host.content) || looksLikeRequirementsAsk(host.content);
  if (
    looksLikePlainChatAsk(host.content)
    && (!hasRealStudioFiles(host.files) || talkOrAdvice)
  ) {
    const prefs = getLocalPrefs();
    let streamed = '';
    let lastGood = '';
    const routed = await arkRoute({
      message: host.content,
      kind: 'chat',
      preferredModelId: host.preferredModelId || undefined,
      preferredModelName: host.preferredModelName || undefined,
      preferredSource: host.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
      stickyModelId: host.stickyModelId || undefined,
      stickyModelName: host.stickyModelName || undefined,
      stickyPinnedSource: host.stickyPinnedSource as 'local' | 'cloud' | undefined,
      history: buildRouterHistory(plainChatHistorySeed(host.content), host.content, undefined, {
        keepContinuity: false,
        kind: 'chat',
      }),
      onAttemptReset: () => {
        // Keep the last visible stream so hops do not blank the bubble.
        streamed = '';
      },
      onChunk: prefs.streamResponses && host.onDelta
        ? (piece) => {
          if (host.shouldAbort() || Date.now() - started > cap) return;
          streamed += piece;
          let live = scrubFalseProjectChatPreamble(streamed);
          // Plain chat never ships file protocol / scaffold dumps into the bubble.
          live = scrubTalkFirstCodeBleed(live);
          if (live.length < 2) {
            if (lastGood.length >= 2) host.onDelta?.(lastGood);
            return;
          }
          lastGood = live;
          host.onDelta?.(live);
        }
        : undefined,
    });
    const raw = String(routed.reply || lastGood || streamed || '').trim();
    const text = scrubTalkFirstCodeBleed(scrubFalseProjectChatPreamble(raw))
      || 'What would you like to work on?';
    return {
      status: 'handled',
      text,
      intent: 'plain-chat',
      contract: chatSuccess(text),
      provider: routerProviderLabel(routed, 'NOVA'),
    };
  }

  const result = await answerStudio(
    {
      userMessage: host.content,
      files: host.files,
      projectName: host.projectName,
      mode: host.mode,
      preferredModelId: host.preferredModelId || undefined,
      preferredModelName: host.preferredModelName || undefined,
      preferredSource: host.preferredSource as 'local' | 'cloud' | 'auto' | undefined,
      stickyModelId: host.stickyModelId || undefined,
      stickyModelName: host.stickyModelName || undefined,
      stickyPinnedSource: host.stickyPinnedSource as 'local' | 'cloud' | undefined,
      planOnly: host.planOnly,
      allowFileEdits: host.allowFileEdits,
      shouldAbort: () => host.shouldAbort() || Date.now() - started > cap,
    },
    host.onDelta,
  );
  let text = String(result.text || '').trim() || 'I could not answer that.';
  if (!host.allowFileEdits) {
    text = scrubFalseProjectChatPreamble(text) || text;
    // Safety net: never leave @@@FILE / fence dumps in a non-edit chat bubble.
    if (talkOrAdvice || /@@@FILE\b|```/.test(text)) {
      text = scrubTalkFirstCodeBleed(text) || text;
    }
  }
  return {
    status: 'handled',
    text,
    intent: result.intent,
    findings: result.findings,
    packedTokens: result.packedTokens,
    contract: chatSuccess(text),
    provider: result.meta || 'NOVA',
  };
}
