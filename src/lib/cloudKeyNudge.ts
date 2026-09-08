/**

 * Soft chat nudge when Auto has no cloud provider keys.

 * Does not block the turn — local can still run.

 */



import { hasAnyCloudChatKey } from '@/lib/cloudChat';

import { getLocalPrefs } from '@/lib/localPrefs';



const SHOWN_PREFIX = 'NOVA:cloud-key-nudge:';



export function cloudKeyNudgeAlreadyShown(chatId: string): boolean {

  if (!chatId) return false;

  try {

    return localStorage.getItem(`${SHOWN_PREFIX}${chatId}`) === '1';

  } catch {

    return false;

  }

}



export function markCloudKeyNudgeShown(chatId: string) {

  if (!chatId) return;

  try {

    localStorage.setItem(`${SHOWN_PREFIX}${chatId}`, '1');

  } catch {

    /* ignore */

  }

}



/** True when this turn should surface the professional key recommendation. */

export function looksLikeCloudKeyNudgeAsk(message: string): boolean {

  const t = String(message || '').trim();

  if (!t || t.length < 4) return false;

  // Skip pure acknowledgements — still nudge on real questions / builds.

  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yo|sure|cool|nice)[.!]?$/i.test(t)) return false;

  return true;

}



export function shouldOfferCloudKeyNudge(opts: {

  chatId: string;

  message: string;

}): boolean {

  if (hasAnyCloudChatKey()) return false;

  const mode = getLocalPrefs().aiMode;

  if (mode === 'local_only') return false;

  if (cloudKeyNudgeAlreadyShown(opts.chatId)) return false;

  return looksLikeCloudKeyNudgeAsk(opts.message);

}



export function cloudKeyNudgeReply(): string {

  return [

    '**Please add an API key for accurate answers**',

    '',

    'Without a cloud key, NOVA falls back to local models. That is fine for light chat, but answers can be less accurate, and apps, websites, and games are much more reliable with a cloud coding model.',

    '',

    'Go to **Models → Cloud**, plug in a key (Groq, OpenAI, Anthropic, OpenRouter, or Perplexity), and leave **Auto** on.',

    '',

    'I will continue with what is available now…',

  ].join('\n');

}



/** Append when a create/build wipe leaves an empty scaffold and no keys are present. */

export function cloudKeyNudgeAfterEmptyBuild(): string {

  return [

    '',

    '**Next step:** open **Models → Cloud**, add an API key, then tell me what to polish next (hero, sections, motion, or copy) so NOVA can generate the real interface.',

  ].join('\n');

}


