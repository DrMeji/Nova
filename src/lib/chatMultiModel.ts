/**
 * Multi-model chat orchestration (sequential hops — not parallel GGUF loads).
 *
 * Engine reality: one local chat brain at a time, text-only GGUF today.
 * Vision hop uses cloud vision keys (Gemini / GPT-4o / Claude) when available.
 * Multi-agent = Design→Code→Verify on project files. Multi-model = vision then chat/coder.
 */

import { extractVisionImages } from '@/lib/recentStore';
import {
  cloudChatVisionKeys,
  hasAnyCloudChatKey,
} from '@/lib/cloudChat';
import { getProviderApiKeys, hasProviderApiKey } from '@/lib/localPrefs';
import { isCloudProviderEnabled } from '@/lib/cloudSources';
import type { RouterChatTurn } from '@/lib/chatHistory';

/** Catalog id we recommend once local VL downloads ship. */
export const RECOMMENDED_VISION_MODEL_ID = 'qwen2-vl-7b';
export const RECOMMENDED_VISION_MODEL_NAME = 'Qwen2-VL 7B';

const VISION_CLOUD_IDS = ['google', 'openai', 'anthropic'] as const;

export function messageHasImages(content: string): boolean {
  return /!\[[^\]]*]\(ark-media:[^)]+\)/.test(content)
    || /!\[[^\]]*]\(data:image\//.test(content)
    || extractVisionImages(content).length > 0;
}

export function historyHasImages(history: RouterChatTurn[] | undefined): boolean {
  return Boolean(history?.some(t => t.images?.length));
}

/** True when at least one cloud provider that can see images has a key enabled. */
export function hasCloudVisionCapability(): boolean {
  const keys = getProviderApiKeys();
  return VISION_CLOUD_IDS.some(
    id => Boolean(keys[id]) && isCloudProviderEnabled(id) && hasProviderApiKey(id),
  );
}

export function listVisionCloudProvidersReady(): string[] {
  const labels: Record<string, string> = {
    google: 'Google AI Studio (Gemini · free tier)',
    openai: 'OpenAI (GPT-4o)',
    anthropic: 'Anthropic (Claude)',
  };
  return VISION_CLOUD_IDS
    .filter(id => hasProviderApiKey(id) && isCloudProviderEnabled(id))
    .map(id => labels[id] || id);
}

/**
 * User wants the screenshot turned into a project fix (not just “what’s this?”).
 */
export function looksLikeScreenshotFixAsk(text: string): boolean {
  const t = String(text || '').replace(/!\[[^\]]*]\([^)]+\)/g, ' ').trim();
  if (!t) return false;
  if (/\b(what(?:'?s| is) (?:in|this)|describe|caption|tell me what you see)\b/i.test(t)
    && !/\b(fix|change|move|edit|update|broken|bug|wrong)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(fix|repair|patch|debug|broken|bug|issue|wrong|error|crash)\b/i.test(t)
    || /\b(change|move|resize|align|update|edit|replace|remove|add|make)\b[\s\S]{0,80}\b(button|icon|logo|nav|header|footer|text|color|layout|spacing|margin|padding|font|image|card|menu|link|click|page|ui|screen)\b/i.test(t)
    || /\b(can'?t|cannot|won'?t)\s+click\b/i.test(t)
    || /\bhere(?:'?s| is) (?:the |where the )?problem\b/i.test(t)
    || /\bthis\s+(?:is\s+)?(?:the\s+)?(?:bug|problem|issue)\b/i.test(t)
    || /\bi\s+want\s+(?:this|it)\s+(?:to\s+)?(?:change|look|be|say)\b/i.test(t)
  );
}

/** Honest gap message when pixels are attached but nothing can see them. */
export function visionCapabilityGapReply(opts?: { localOnly?: boolean }): string {
  const ready = listVisionCloudProvidersReady();
  if (ready.length) {
    return [
      'I can see you attached an image, but the vision providers I tried did not answer.',
      '',
      `Ready keys: ${ready.join(', ')}.`,
      'Check Models → Cloud, or try again in a moment.',
    ].join('\n');
  }

  if (opts?.localOnly) {
    return [
      'I can see you attached an image, but **Local-only** mode is on — and the local chat brain cannot see pixels yet.',
      '',
      '**To read screenshots now:**',
      '1. Settings → AI → turn off Local-only (use Automatic or Cloud when available)',
      '2. Models → Cloud → connect **Google AI Studio** (free), OpenAI, or Anthropic',
      '',
      `**Later on this PC:** download **${RECOMMENDED_VISION_MODEL_NAME}** from Models → Vision when local vision downloads ship — then ARK can hop vision → your chat/coder brain automatically.`,
      '',
      'Until then, describe the problem in a sentence and I can still help from text.',
    ].join('\n');
  }

  return [
    'I can see you attached an image, but I **cannot read it yet**.',
    '',
    'Your current chat brain is text-only. To look at screenshots I need a vision hop:',
    '',
    '**Fastest (works today):** Models → Cloud → connect **Google AI Studio** (free Gemini), or OpenAI / Anthropic.',
    '',
    `**On this PC later:** Models → Vision → download **${RECOMMENDED_VISION_MODEL_NAME}** when that install is available. ARK will then run vision + your coding brain as a **multi-model hop** (one after the other — the engine loads one local model at a time).`,
    '',
    'After vision is connected, paste a bug screenshot and say what to change — I will describe what I see, then fix the project files when a folder is open.',
  ].join('\n');
}

export function buildVisionDescribePrompt(userMessage: string): string {
  const ask = String(userMessage || '')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .trim();
  return [
    'You are ARK’s vision hop. Look carefully at the attached image(s).',
    'Describe what you see in concrete UI/product terms: layout, text, colors, controls, and anything that looks wrong or highlighted.',
    'If the user asked for a fix or change, end with a short bullet list of exact edits to make.',
    'Do not invent file paths you cannot see. Keep it under 220 words.',
    ask ? `User ask: ${ask}` : 'User ask: What stands out in this image?',
  ].join('\n');
}

export function composeVisionToCoderBrief(visionNotes: string, userMessage: string): string {
  const ask = String(userMessage || '')
    .replace(/!\[[^\]]*]\(ark-media:[^)]+\)/g, '')
    .replace(/!\[[^\]]*]\(data:image\/[^)]+\)/g, '')
    .trim();
  return [
    ask || 'Fix the issue shown in the screenshot.',
    '',
    '<!--ark-vision-brief-->',
    'Vision hop notes (from the screenshot):',
    String(visionNotes || '').trim(),
    '',
    'Apply those notes to the bound project files. Prefer surgical UI edits over a full rewrite.',
  ].join('\n');
}

export type VisionHopResult = {
  ok: boolean;
  notes: string;
  providerLabel?: string;
  error?: string;
};

/**
 * Sequential vision hop via cloud vision keys.
 * Call before the main chat/coder brain when images are present.
 */
export async function runVisionDescribeHop(opts: {
  userMessage: string;
  history: RouterChatTurn[];
  onChunk?: (text: string) => void;
}): Promise<VisionHopResult> {
  if (!hasCloudVisionCapability()) {
    return { ok: false, notes: '', error: 'no_vision' };
  }
  const attempted: string[] = [];
  const describePrompt = buildVisionDescribePrompt(opts.userMessage);
  try {
    const hit = await cloudChatVisionKeys(
      describePrompt,
      attempted,
      opts.history,
      opts.onChunk,
    );
    const notes = String(hit?.reply || '').trim();
    if (!notes) {
      return { ok: false, notes: '', error: 'empty', providerLabel: attempted.join(', ') };
    }
    return {
      ok: true,
      notes,
      providerLabel: hit ? `${hit.provider} · ${hit.model}` : undefined,
    };
  } catch (err) {
    return {
      ok: false,
      notes: '',
      error: err instanceof Error ? err.message : 'vision_failed',
    };
  }
}

/** Soft status line for the generating bubble. */
export function multiModelStatusLabel(phase: 'vision' | 'coder' | 'chat'): string {
  if (phase === 'vision') return 'Looking at your image…';
  if (phase === 'coder') return 'Applying the fix with your coding brain…';
  return 'Thinking…';
}

export function explainMultiModelVsMultiAgent(): string {
  return [
    '**Multi-model** = ARK hops between brains for one turn (vision sees the screenshot, then your chat/coder brain answers or edits). Local Engine still loads **one** GGUF at a time, so hops are sequential.',
    '',
    '**Multi-agent** = Design → Code → Verify workers on a **bound project** (skills + file edits). Same turn can use both: vision hop first, then multi-agent or normal code edit.',
  ].join('\n');
}

/** For Settings / docs snippets — keep in sync with product honesty. */
export function multiModelCapabilitySummary(): {
  parallelLocal: boolean;
  visionToday: string;
  visionSoon: string;
} {
  return {
    parallelLocal: false,
    visionToday: 'Cloud vision keys (Google / OpenAI / Anthropic) as an automatic hop when you attach an image.',
    visionSoon: `${RECOMMENDED_VISION_MODEL_NAME} local download + sequential vision→coder hop.`,
  };
}

export { hasAnyCloudChatKey };
