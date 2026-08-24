/**
 * What the user is asking for — drives which ARK Engine model Auto loads.
 * Ollama is never part of this decision.
 */

import { looksLikeFolderPathAsk } from '@/lib/folderPathAsk';

export type ChatIntent = 'chat' | 'coding' | 'media';

const BUILD_ASK =
  /\b(build|create|make|scaffold|implement|refactor|debug|fix|add|upgrade)\b[\s\S]{0,80}\b(app|website|site|component|function|api|project|calculator|tool|page|ui|chat\s*gpt)\b/i;
const CODE_FILE =
  /\b(look (at|into)|review|open|edit|read)\b[\s\S]{0,40}\b(file|code|repo|project|source)\b/i;

export function looksLikeCodeAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Planning / “how do I get started” is chat, not a coding/scaffold turn.
  if (/planning conversation only/i.test(t)) return false;
  if (/\b(?:help\s+me\s+plan|planning\s+only|just\s+(?:talk|discuss)|get\s+started)\b/i.test(t)
    && !/\b(?:create\s+the\s+files|scaffold|lets?\s+build\s+this)\b/i.test(t)) {
    return false;
  }
  if (/\bi(?:'m| am)\s+building\b/i.test(t) && !/\b(?:create\s+project|files\s+now|scaffold)\b/i.test(t)) {
    return false;
  }
  if (looksLikeFolderPathAsk(t) && !/\b(build|create|make|scaffold|implement|fix|add|debug|code)\b/i.test(t)) {
    return false;
  }
  if (/```[\w]*\n/.test(t)) return true;
  if (BUILD_ASK.test(t)) return true;
  if (/\b(write|create|build|make)\b[\s\S]{0,64}\b(calculator|html|website|app|component|page|iphone|ipad|ios|android)\b/i.test(t)) return true;
  if (/\b(iphone|ipad|ios|android|app store|play store)\b/i.test(t) && /\b(build|create|make|want|app)\b/i.test(t)) return true;
  if (CODE_FILE.test(t)) return true;
  if (/\b(typescript|javascript|python|react|node\.?js|html|css)\b/i.test(t) && /\b(build|write|create|fix|add)\b/i.test(t)) {
    return true;
  }
  if (/\b(add|put|place|move|insert)\b[\s\S]{0,80}\b(button|icon|logo|search|settings|header|nav|page)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Show the “Switch to Code” banner — disabled while Code tab is parked. */
export function shouldSuggestCodeSwitch(
  _text: string,
  _opts?: { hasStudioFiles?: boolean; composerAsk?: boolean },
): boolean {
  return false;
}

const IMAGE_ASK = [
  /\b(draw me|paint me|picture of|photo of|image of|wallpaper of|logo for|icon for)\b/i,
  /\b(generate|create|make|draw|render|design|paint|produce)\b[\s\S]{0,48}\b(an?\s+)?(image|picture|photo|illustration|wallpaper|logo|icon|artwork|portrait|avatar|banner|poster)\b/i,
  /\b(image|picture|photo|illustration|wallpaper|logo|icon|artwork|portrait)\b[\s\S]{0,32}\b(of|for|showing|with)\b/i,
  /\b(recreate|upscale|img2img|image[\s-]?to[\s-]?image)\b/i,
  /\b(improve|enhance|fix)\b[\s\S]{0,40}\b(this\s+)?(image|picture|photo|artwork)\b/i,
  /\b(higher\s+(?:res|resolution)|4k|8k|ultra\s+sharp)\b[\s\S]{0,80}\b(image|picture|photo|render|recreate)?\b/i,
];

/** User wants a generated image — route to Image media pipeline (not chat text). */
export function looksLikeImageAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Attached chat media with recreate / improve intent.
  if (/ark-media:/i.test(t) && /\b(recreate|improve|enhance|upscale|4k|higher\s+res)\b/i.test(t)) {
    return true;
  }
  if (looksLikeCodeAsk(t)) return false;
  // Never treat product recommendations / “where to start” as image gen.
  if (/\brecommend/i.test(t) && !/\b(image|picture|photo|illustration|logo|icon|wallpaper)\b/i.test(t)) {
    return false;
  }
  if (/\b(video|clip|animation|mp4|gif|reel|trailer)\b/i.test(t) && /\b(generate|create|make|render)\b/i.test(t)) {
    return false;
  }
  return IMAGE_ASK.some(re => re.test(t));
}

export function classifyChatIntent(message: string, kind?: string): ChatIntent {
  if (kind === 'image' || kind === 'video') return 'media';
  if (kind === 'coding') return 'coding';
  if (looksLikeImageAsk(message)) return 'media';
  if (looksLikeCodeAsk(message)) return 'coding';
  return 'chat';
}
