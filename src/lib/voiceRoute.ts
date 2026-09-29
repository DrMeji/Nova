/**
 * Voice tab routing — cloud-first, short replies, no model hunts or failover chains.
 * Local GGUF is last-resort with a tiny token cap so voice does not freeze the PC.
 */

import { loadHardwareSnapshot, parseRamGb, detectHardware } from '@/lib/api';
import { engineGenerate, getEngineStatus } from '@/lib/novaEngine';
import { packHistoryPrompt, usableAssistantText, type RouterChatTurn } from '@/lib/chatHistory';
import {
  cloudChatFreeKeys,
  cloudChatPaidKeys,
  cloudChatPreferredThenCascade,
  hasAnyCloudChatKey,
} from '@/lib/cloudChat';
import { isWeakChatBrain, rankedReadyEngineIds } from '@/lib/enginePick';
import { getLocalPrefs } from '@/lib/localPrefs';
import { voiceBrainPrompt, scrubVoiceConstraintEcho } from '@/lib/voiceSession';
import { voiceConversationSystemPrompt } from '@/lib/voiceMode';
import { looksLikeWebGroundedAsk, looksLikeCreativeAsk, webSearchForChat } from '@/lib/webSearch';

export type VoiceRouteModel = {
  id: string;
  name: string;
  source: 'local' | 'cloud' | 'auto';
};

const VOICE_ROUTE_TIMEOUT_MS = 36_000;
const VOICE_CREATIVE_TIMEOUT_MS = 28_000;
/** Keep local voice replies short — full chat n_predict can peg CPU/RAM for minutes. */
const VOICE_LOCAL_N_PREDICT = 140;
const VOICE_CREATIVE_N_PREDICT = 110;

function voiceNoModelReply(): string {
  return [
    'I need a brain to answer out loud.',
    'Add a free cloud key in Models, or install a local brain in Local AI, then try again.',
  ].join(' ');
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer = 0;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = window.setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => window.clearTimeout(timer));
}

async function tryCloudRoute(
  message: string,
  history: RouterChatTurn[],
  attempted: string[],
  model?: VoiceRouteModel,
): Promise<string | null> {
  const prefs = getLocalPrefs();
  if (prefs.aiMode === 'local_only') return null;
  if (!hasAnyCloudChatKey()) return null;

  // Free-key cascade first — most reliable for Voice. Preferring a pinned cloud
  // model first often burned the timeout before any key was tried.
  const free = await cloudChatFreeKeys(message, attempted, history);
  if (free?.reply?.trim()) return free.reply.trim();

  if (model?.source === 'cloud' && model.id && model.id !== 'NOVA-auto') {
    const hit = await cloudChatPreferredThenCascade({
      modelId: model.id,
      modelName: model.name,
      message,
      cascade: true,
      attempted,
      history,
    });
    if (hit?.reply?.trim()) return hit.reply.trim();
  }

  const paid = await cloudChatPaidKeys(message, attempted, history);
  if (paid?.reply?.trim()) return paid.reply.trim();

  return null;
}

async function tryLocalVoiceRoute(
  message: string,
  history: RouterChatTurn[],
  nPredict = VOICE_LOCAL_N_PREDICT,
): Promise<string | null> {
  if (!window.novaDesktop?.engineGenerate) return null;

  let ranked: string[] = [];
  try {
    const status = await getEngineStatus();
    const ramGb = parseRamGb(loadHardwareSnapshot() || detectHardware()) || 8;
    ranked = rankedReadyEngineIds(status.models, 'chat', ramGb);
  } catch {
    return null;
  }

  const picked = ranked.find(id => !isWeakChatBrain(id));
  if (!picked) return null;

  const prompt = [
    voiceConversationSystemPrompt(),
    '',
    packHistoryPrompt(history, message),
  ].join('\n');
  const result = await engineGenerate(prompt, picked, 'chat', { nPredict });
  const reply = usableAssistantText(result.reply, message)?.trim() || String(result.reply || '').trim();
  return scrubVoiceConstraintEcho(reply) || null;
}

async function routeVoiceReply(userText: string, model?: VoiceRouteModel): Promise<string> {
  const message = voiceBrainPrompt(userText);
  const creative = looksLikeCreativeAsk(message);
  const needsWeb = !creative && looksLikeWebGroundedAsk(message);
  const attempted: string[] = [];

  let grounded = '';
  if (needsWeb) {
    try {
      const hit = await withTimeout(
        webSearchForChat(message, { timeoutMs: 12_000 }),
        14_000,
        'lookup timed out',
      );
      if (hit.ok && hit.text.trim()) {
        grounded = hit.text.trim().slice(0, 2200);
      }
    } catch {
      /* lookup optional — still answer from model */
    }
  }

  // Cloud path — keep creative asks short so stories don't take a minute.
  // Put the full voice prompt in history so ensureHistory does not drop it.
  const cloudUserContent = grounded
    ? [
        voiceConversationSystemPrompt(),
        '',
        'Live research notes (use these; do not invent facts):',
        grounded,
        '',
        `User asked: ${message}`,
        'Answer out loud in a few clear sentences. Lead with the direct answer.',
      ].join('\n')
    : creative
      ? [
          voiceConversationSystemPrompt(),
          '',
          `User said: ${message}`,
          /\b(stor(?:y|ies)|tale|fable|bedtime)\b/i.test(message)
            ? 'Reply out loud with a short story (~60–90 words). Open with “Here’s a short story:” then tell it. No other preamble.'
            : /\b(joke|funny|pun)\b/i.test(message)
              ? 'Reply out loud with one short joke. Open with “Here’s one:” then the joke. No other preamble.'
              : 'Reply out loud briefly — about 60–90 words max. Start immediately; no preamble.',
        ].join('\n')
      : `${voiceConversationSystemPrompt()}\n\nUser said: ${message}`;

  const cloudHistory: RouterChatTurn[] = [{ role: 'user', content: cloudUserContent }];
  const cloud = await tryCloudRoute(cloudUserContent, cloudHistory, attempted, model);
  if (cloud) return scrubVoiceConstraintEcho(cloud);

  const prefs = getLocalPrefs();
  // Always try local as fallback when cloud fails (or when local-only / local pick).
  const localAsk = grounded
    ? `Research notes:\n${grounded}\n\nUser asked: ${message}\nAnswer briefly and accurately.`
    : creative
      ? `${message}\n\nKeep the spoken reply under 90 words.`
      : message;
  const localHistory: RouterChatTurn[] = [{ role: 'user', content: message }];
  const local = await tryLocalVoiceRoute(
    localAsk,
    localHistory,
    creative ? VOICE_CREATIVE_N_PREDICT : VOICE_LOCAL_N_PREDICT,
  );
  if (local) return local;

  if (grounded) {
    const digest = grounded.replace(/\s+/g, ' ').trim().slice(0, 420);
    if (digest) return digest;
  }

  if (hasAnyCloudChatKey() && prefs.aiMode !== 'local_only') {
    return 'I reached your cloud keys but none returned a reply just now. Check Models → Providers that the keys are still valid, then try again.';
  }

  void attempted;
  return voiceNoModelReply();
}

/** Route a spoken user turn — prefers cloud, caps local tokens, never hunt-installs. */
export async function voiceChatRoute(
  userText: string,
  model?: VoiceRouteModel,
): Promise<{ reply: string; error?: string }> {
  try {
    const creative = looksLikeCreativeAsk(userText);
    const reply = await withTimeout(
      routeVoiceReply(userText, model),
      creative ? VOICE_CREATIVE_TIMEOUT_MS : VOICE_ROUTE_TIMEOUT_MS,
      'Voice reply timed out. Try again in a moment — your keys may be rate-limited.',
    );
    return { reply };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Voice reply failed.';
    return { reply: msg, error: msg };
  }
}
