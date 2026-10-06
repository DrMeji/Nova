/**
 * Evidence gatherers for the Answer Contract.
 * Gatherers collect notes for compose — they must not own the final user-visible bubble alone
 * (except true deterministics handled before compose).
 */

import type { AnswerContract } from '@/lib/answerContract';
import {
  webSearchForChat,
  formatWebLookupForPrompt,
  looksLikeComprehensiveAsk,
  looksLikeExplicitResearchAsk,
  looksLikeBookFindOrBuyAsk,
  looksLikeBareExpandAsk,
  honestLyricsUnavailableReply,
  looksLikeLyricsAsk,
} from '@/lib/webSearch';
import { runDeepResearch } from '@/lib/deepResearch';
import { colorCodeReply, looksLikeColorCodeAsk } from '@/lib/colorCodeAsk';

export type WebHit = Awaited<ReturnType<typeof webSearchForChat>>;

export type GatherResult = {
  kind: 'none' | 'deterministic' | 'web' | 'deep' | 'disk' | 'thread';
  /** Prompt notes for the model (not shown raw unless compose fails). */
  promptNote: string;
  webHit?: WebHit | null;
  deterministicText?: string;
  deepAnswer?: string;
};

export type GatherOpts = {
  message: string;
  contract: AnswerContract;
  priorTurns?: { role: string; content: string }[];
  shouldAbort?: () => boolean;
  onStatus?: (label: string) => void;
  timeoutMs?: number;
};

/** Companion stance hint — keep entertaining, stay on topic, no unsolicited link dumps. */
export function companionStanceHint(message: string, priorTopic?: string): string {
  const prior = String(priorTopic || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  if (prior) {
    return [
      'THREAD EXPAND: The user wants MORE depth on the prior topic — not a new subject.',
      `Prior topic to expand: ${prior}`,
      'Deepen that explanation with new angles, examples, and clearer detail.',
      'Do NOT add book-store links, Open Library, shopping catalogs, or articles about the phrase “more information”.',
      'Do NOT dump a numbered Sources list unless they asked for links or research.',
      'Do not talk about their bound project, Debug clinic, or GitHub unless they asked.',
      `User question: ${String(message || '').trim()}`,
    ].join(' ');
  }
  return [
    'COMPANION STANCE: Answer this question directly and stay on the user’s topic.',
    'Be warm and conversational when they are chatting (books, stories, banter).',
    'Do not invent store links, book catalogs, or unrelated titles.',
    'Do not dump a numbered “Sources” list unless they asked for links or research.',
    'Do not talk about their bound project, Debug clinic, or GitHub unless they asked.',
    `User question: ${String(message || '').trim()}`,
  ].join(' ');
}

/** Studio / disk stance — facts from the folder only. */
export function diskStanceHint(message: string): string {
  return [
    'DISK STANCE: Answer only from the bound project on disk.',
    'No public web links, no book titles, no GitHub unless the ask is explicitly about GitHub.',
    'If something is not in the folder, say you do not see it — never invent filler.',
    `User question: ${String(message || '').trim()}`,
  ].join(' ');
}

export async function gatherForContract(opts: GatherOpts): Promise<GatherResult> {
  const { message, contract } = opts;
  const t = String(message || '').trim();

  if (contract.job === 'deterministic') {
    if (looksLikeLyricsAsk(t)) {
      return { kind: 'deterministic', promptNote: '', deterministicText: honestLyricsUnavailableReply(t) };
    }
    if (looksLikeColorCodeAsk(t)) {
      return { kind: 'deterministic', promptNote: '', deterministicText: colorCodeReply(t) };
    }
    return { kind: 'none', promptNote: '' };
  }

  if (contract.grounding === 'disk' || contract.useStudioDisk) {
    return {
      kind: 'disk',
      promptNote: diskStanceHint(t),
    };
  }

  if (contract.stance === 'companion' && !contract.allowWeb) {
    const priorTopic = (opts.priorTurns || [])
      .slice()
      .reverse()
      .find((h) => {
        if (h.role !== 'user') return false;
        const c = String(h.content || '').trim();
        return c.length >= 8 && !looksLikeBareExpandAsk(c);
      });
    return {
      kind: contract.grounding === 'thread' ? 'thread' : 'none',
      promptNote: companionStanceHint(t, priorTopic ? String(priorTopic.content) : undefined),
    };
  }

  if (!contract.allowWeb || contract.grounding !== 'web') {
    return { kind: 'none', promptNote: '' };
  }

  const identify =
    contract.reason === 'explicit-research'
    && /\b(?:book|novel|movie|film|plot|remember|forgot)\b/i.test(t);

  // Deep research for identify / rejected-prior style asks.
  if (
    identify
    || /\b(?:what\s+(?:book|movie|film)|identify|forgot\s+the\s+(?:title|name))\b/i.test(t)
  ) {
    try {
      const deep = await runDeepResearch(t, {
        shouldAbort: () => Boolean(opts.shouldAbort?.()),
        timeoutMs: opts.timeoutMs ?? 75_000,
        wantImages: true,
        onProgress: (p) => {
          const detail = p.detail ? ` — ${p.detail}` : '';
          opts.onStatus?.(`${p.label}${detail}`);
        },
      });
      if (deep.answer) {
        return {
          kind: 'deep',
          promptNote: '',
          deepAnswer: deep.answer,
          webHit: deep.searchPerformed
            ? { ok: deep.ok, text: deep.text, sources: deep.sources }
            : null,
        };
      }
      return {
        kind: 'web',
        promptNote: '',
        webHit: deep.searchPerformed
          ? { ok: deep.ok, text: deep.text, sources: deep.sources }
          : null,
      };
    } catch {
      /* fall through to normal web */
    }
  }

  try {
    opts.onStatus?.('Researching…');
    const webHit = await webSearchForChat(t, {
      priorTurns: opts.priorTurns || [],
      timeoutMs: opts.timeoutMs ?? 45_000,
    });
    const note = webHit?.ok
      ? formatWebLookupForPrompt(webHit, {
        comprehensive: looksLikeComprehensiveAsk(t)
          || looksLikeExplicitResearchAsk(t)
          || looksLikeBookFindOrBuyAsk(t),
        identify: false,
      })
      : '';
    if (webHit?.ok) opts.onStatus?.('Reviewing sources…');
    else opts.onStatus?.('Thinking…');
    return { kind: 'web', promptNote: note, webHit };
  } catch {
    return { kind: 'web', promptNote: '', webHit: null };
  }
}
