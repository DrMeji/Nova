/**
 * Voice tab routing — cloud-first, short replies, no model hunts or failover chains.
 * Local GGUF is last-resort with a tiny token cap so voice does not freeze the PC.
 */

import { loadHardwareSnapshot, parseRamGb } from '@/lib/api';
import { engineGenerate, getEngineStatus } from '@/lib/arkEngine';
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

export type VoiceRouteModel = {
  id: string;
  name: string;
  source: 'local' | 'cloud' | 'auto';
};

const VOICE_ROUTE_TIMEOUT_MS = 28_000;
/** Keep local voice replies short — full chat n_predict can peg CPU/RAM for minutes. */
const VOICE_LOCAL_N_PREDICT = 180;

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

  if (!hasAnyCloudChatKey()) return null;

  const free = await cloudChatFreeKeys(message, attempted, history);
  if (free?.reply?.trim()) return free.reply.trim();

  const paid = await cloudChatPaidKeys(message, attempted, history);
  if (paid?.reply?.trim()) return paid.reply.trim();

  return null;
}

async function tryLocalVoiceRoute(
  message: string,
  history: RouterChatTurn[],
): Promise<string | null> {
  if (!window.arkDesktop?.engineGenerate) return null;

  let ranked: string[] = [];
  try {
    const status = await getEngineStatus();
    const ramGb = parseRamGb(loadHardwareSnapshot() || '') || 8;
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
  const result = await engineGenerate(prompt, picked, 'chat', { nPredict: VOICE_LOCAL_N_PREDICT });
  const reply = usableAssistantText(result.reply, message)?.trim() || String(result.reply || '').trim();
  return scrubVoiceConstraintEcho(reply) || null;
}

async function routeVoiceReply(userText: string, model?: VoiceRouteModel): Promise<string> {
  const message = voiceBrainPrompt(userText);
  const history: RouterChatTurn[] = [{ role: 'user', content: message }];
  const attempted: string[] = [];

  const cloud = await tryCloudRoute(message, history, attempted, model);
  if (cloud) return scrubVoiceConstraintEcho(cloud);

  const prefs = getLocalPrefs();
  const shouldTryLocal =
    prefs.aiMode === 'local_only'
    || model?.source === 'local'
    || !hasAnyCloudChatKey();

  if (shouldTryLocal) {
    const local = await tryLocalVoiceRoute(message, history);
    if (local) return local;
  }

  if (hasAnyCloudChatKey() && prefs.aiMode !== 'local_only') {
    return 'My cloud brains did not answer. Check your API keys in Models, then try again.';
  }

  return voiceNoModelReply();
}

/** Route a spoken user turn — prefers cloud, caps local tokens, never hunt-installs. */
export async function voiceChatRoute(
  userText: string,
  model?: VoiceRouteModel,
): Promise<{ reply: string; error?: string }> {
  try {
    const reply = await withTimeout(
      routeVoiceReply(userText, model),
      VOICE_ROUTE_TIMEOUT_MS,
      'Voice reply timed out. Try a cloud key in Models, or wait until your local brain is idle.',
    );
    return { reply };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Voice reply failed.';
    return { reply: msg, error: msg };
  }
}
