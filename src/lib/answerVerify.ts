/**
 * Post-compose verify for Answer Contract replies.
 * Reject off-topic invent (link dumps, clinic bleed, unrelated entities) → retry or honest gap.
 */

import type { AnswerContract } from '@/lib/answerContract';
import { looksLikeLinkDirectoryReply, looksLikeBareExpandAsk } from '@/lib/webSearch';
import { looksLikeRunawayTokenGarbage, scrubPlanExitBleed, looksLikeThinHowToOutline } from '@/lib/replySanity';

export type VerifyResult = {
  ok: boolean;
  reason?: string;
  /** Safe user-visible fallback when verify fails and retry is exhausted. */
  honestGap?: string;
};

const CLINIC_BLEED_RE =
  /\b(?:debug\s+clinic|fix\s+all|fix\s+all|#\d+\s+(?:critical|high|medium|low)|fix\s+this\s+issue)\b/i;

const UNSOLICITED_BOOK_RE =
  /\b(?:city\s+of\s+ashes|mortal\s+instruments|introduction\s+to\s+making\s+very\s+big\s+books|american\s+film\s+institute|information doesn'?t want to be free|art of thinking clearly)\b/i;

/** Links that mean we searched the phrase “more information” instead of the thread topic. */
const PHRASE_SEARCH_BLEED_RE =
  /openlibrary\.org|howtosayguide|polite ways to request more information|request more information professionally|how to say .{0,12}more information/i;

function countMarkdownLinks(text: string): number {
  const md = text.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/gi) || [];
  const bare = text.match(/https?:\/\/[^\s)]+/gi) || [];
  return md.length + bare.length;
}

export function honestGapForContract(contract: AnswerContract, userMessage: string): string {
  if (contract.grounding === 'disk' || contract.topic === 'bound_project') {
    return 'I could not pull a clean answer from the bound folder for that. Try asking what the project is about, or press + → Debug if you want a problem scan.';
  }
  if (contract.allowWeb || contract.grounding === 'web') {
    return 'I could not verify that cleanly from live sources. Ask again with a bit more detail and I will research it once more.';
  }
  if (contract.stance === 'companion') {
    return `I want to stay on what you asked (“${String(userMessage || '').trim().slice(0, 80)}”) — can you say a little more so I answer that directly?`;
  }
  return 'I do not have a solid answer for that yet. Rephrase once and I will try again.';
}

/**
 * Verify a composed reply against the Answer Contract.
 */
export function verifyAnswerReply(
  contract: AnswerContract,
  userMessage: string,
  reply: string,
): VerifyResult {
  const text = String(reply || '').trim();
  const ask = String(userMessage || '').trim();

  if (!text) {
    return { ok: false, reason: 'empty', honestGap: honestGapForContract(contract, ask) };
  }

  if (looksLikeRunawayTokenGarbage(text)) {
    return {
      ok: false,
      reason: 'runaway-garbage',
      honestGap: honestGapForContract(contract, ask),
    };
  }

  // Plan-exit bleed that survived scrub — reject so we can fall back cleanly.
  if (/\bOverall:\s*keep\s+(?:the\s+first\s+version\s+tiny|v1\s+tiny|every\s+band)\b/i.test(text)
    && contract.job !== 'plan_talk') {
    return {
      ok: false,
      reason: 'plan-exit-bleed',
      honestGap: scrubPlanExitBleed(text) || honestGapForContract(contract, ask),
    };
  }

  // Disk / project asks must not invent web link directories or random books.
  if (contract.grounding === 'disk' || contract.topic === 'bound_project') {
    if (CLINIC_BLEED_RE.test(text) && contract.job !== 'diagnose') {
      return {
        ok: false,
        reason: 'clinic-bleed',
        honestGap: honestGapForContract(contract, ask),
      };
    }
    if (looksLikeLinkDirectoryReply(text) || countMarkdownLinks(text) >= 3) {
      return {
        ok: false,
        reason: 'invented-link-dump',
        honestGap: honestGapForContract(contract, ask),
      };
    }
    if (UNSOLICITED_BOOK_RE.test(text) && !/\b(?:book|novel|ashes|film)\b/i.test(ask)) {
      return {
        ok: false,
        reason: 'unrelated-books',
        honestGap: honestGapForContract(contract, ask),
      };
    }
  }

  // Companion: no unsolicited store/link directories.
  if (contract.stance === 'companion' && !contract.allowWeb) {
    if (looksLikeLinkDirectoryReply(text) || (countMarkdownLinks(text) >= 2 && !/\b(?:link|url|buy|where)\b/i.test(ask))) {
      return {
        ok: false,
        reason: 'companion-link-dump',
        honestGap: honestGapForContract(contract, ask),
      };
    }
    if (PHRASE_SEARCH_BLEED_RE.test(text) || (UNSOLICITED_BOOK_RE.test(text) && !/\b(?:book|novel|read)\b/i.test(ask))) {
      return {
        ok: false,
        reason: 'companion-offtopic-links',
        honestGap: honestGapForContract(contract, ask),
      };
    }
    if (CLINIC_BLEED_RE.test(text)) {
      return {
        ok: false,
        reason: 'companion-clinic-bleed',
        honestGap: honestGapForContract(contract, ask),
      };
    }
  }

  // Research stance may include links, but not empty “Sources:” theater with zero URLs.
  if (contract.stance === 'research_cited') {
    if (/\bSources?\s*:/i.test(text) && countMarkdownLinks(text) === 0 && !/https?:\/\//i.test(text)) {
      return {
        ok: false,
        reason: 'empty-sources',
        honestGap: honestGapForContract(contract, ask),
      };
    }
    // Bare “more info” must never surface Open Library / “how to request more information” pages.
    if ((looksLikeBareExpandAsk(ask) || contract.reason.includes('followup'))
      && PHRASE_SEARCH_BLEED_RE.test(text)
      && !/\b(?:book|novel|library|read online)\b/i.test(ask)) {
      return {
        ok: false,
        reason: 'phrase-search-bleed',
        honestGap: honestGapForContract(contract, ask),
      };
    }
    // How-to / shopping: reject thin outline teases that withhold the actual guide.
    if (looksLikeThinHowToOutline(text, ask)) {
      return {
        ok: false,
        reason: 'thin-howto-outline',
        honestGap: honestGapForContract(contract, ask),
      };
    }
  }

  return { ok: true };
}

/** Strip obvious invented link blocks from a disk/companion reply (soft heal before honest gap). */
export function scrubInventedLinkDump(reply: string): string {
  let t = String(reply || '');
  t = t.replace(/\n+#{0,3}\s*Links?\s*:?\s*\n(?:\s*[-*•].*\n?){2,}/gi, '\n');
  t = t.replace(/\n+#{0,3}\s*Sources?\s*:?\s*\n(?:\s*[-*•].*\n?){2,}/gi, '\n');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}
