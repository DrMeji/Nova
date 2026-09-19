/**
 * Detect casual chat that must NOT go through studio / empty project packing.
 */

import { looksLikeSideQuestAsk } from '@/lib/webSearch';
import { looksLikeTalkBeforeCreateAsk, looksLikeRequirementsAsk } from '@/lib/chatIdeaIntent';

/** True when files map has real source content (not empty studio sticky). */
export function hasRealStudioFiles(files: Record<string, string> | null | undefined): boolean {
  const map = files || {};
  for (const [path, body] of Object.entries(map)) {
    if (/node_modules|\.git\b|package-lock/i.test(path)) continue;
    if (String(body || '').trim().length > 40) return true;
  }
  return false;
}

/** Detect pure greetings for prompt shaping (never a canned reply). */
export function looksLikePureGreeting(message: string): boolean {
  const t = String(message || '')
    .replace(/<!--ark-attach:[\s\S]*?-->/g, '')
    .replace(/<!--ark-auto-read-->/g, '')
    .replace(/^[\[](?:Plan|Ask|Debug|Tasks)[\]]\s*/i, '')
    .trim()
    .replace(/[!?.…]+$/g, '')
    .trim();
  if (!t || t.length > 36) return false;
  return /^(?:hi|hii+|hello|heelo|hell+o|hey|yo|sup|howdy)(?:\s+(?:nova|there|friend|team))?$/i.test(t);
}

/** “What can you do” — keep answers short and real (prompt shaping only). */
export function looksLikeCapabilityOverviewAsk(message: string): boolean {
  const t = String(message || '').trim();
  if (!t || t.length > 160) return false;
  return /\b(?:what\s+can\s+you\s+do(?:\s+for\s+me)?|what\s+(?:are\s+you\s+)?(?:able|capable)\s+(?:of|to)|what(?:'s|\s+is)\s+(?:your|nova(?:'s)?)\s+(?:job|purpose|role)|who\s+are\s+you)\b/i.test(t);
}

/**
 * Story / joke / greeting / who-are-you / side-quest — answer as normal chat.
 * Not create/edit/debug/file inspect.
 */
export function looksLikePlainChatAsk(message: string): boolean {
  const t = String(message || '')
    .replace(/<!--ark-attach:[\s\S]*?-->/g, '')
    .replace(/<!--ark-auto-read-->/g, '')
    .replace(/^[\[](?:Plan|Ask|Debug|Tasks)[\]]\s*/i, '')
    .trim();
  if (!t || t.length < 2) return false;

  if (looksLikePureGreeting(t)) return true;
  if (looksLikeCapabilityOverviewAsk(t)) return true;
  if (looksLikeRequirementsAsk(t) || looksLikeTalkBeforeCreateAsk(t)) return true;

  // Requirements / advice about building — still plain chat (no files).
  if (
    /\b(?:what\s+(?:do|would|will)\s+i\s+(?:actually\s+)?need|all\s+the\s+requirements|what\s+(?:are\s+)?(?:the\s+)?requirements)\b/i.test(t)
    && !/\b(?:scaffold\s+now|build\s+it\s+now|on\s+disk|create\s+(?:the\s+)?files)\b/i.test(t)
  ) {
    return true;
  }

  // Explicit project / coding intent stays on studio.
  if (/\b(?:@@@FILE|App\.(?:jsx|tsx)|vite\.config|package\.json)\b/i.test(t)) return false;
  if (/\b(?:build|create|scaffold|rewrite)\b[\s\S]{0,40}\b(?:project|website|app|site|page)\b/i.test(t)
    && !/\b(?:what\s+(?:do|would|will)\s+i\s+need|requirements?|are\s+you\s+familiar|do\s+you\s+know|i\s+want\s+to\s+build)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:edit|fix|debug|refactor)\b[\s\S]{0,40}\b(?:file|code|project|bug)\b/i.test(t)) return false;
  if (/\b(?:this\s+project|these\s+files|attached\s+(?:folder|project)|in\s+explorer|file\s+tree)\b/i.test(t)) {
    return false;
  }

  if (looksLikeSideQuestAsk(t)) return true;
  if (/^(?:hi|hello|hey|yo|sup|howdy)\b/i.test(t)) return true;
  if (/\b(?:tell\s+me\s+a\s+story|write\s+(?:me\s+)?a\s+story|story\s+about|make\s+up\s+a\s+story)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:joke|poem|riddle|haiku|bedtime\s+story)\b/i.test(t)) return true;
  if (/\b(?:who\s+are\s+you|what\s+are\s+you|what\s+is\s+nova|how\s+are\s+you)\b/i.test(t)) return true;
  if (/\b(?:can\s+you\s+help|what\s+can\s+you\s+do)\b/i.test(t) && t.length < 120) return true;
  return false;
}

/**
 * Keep planning outlines wrapped in ```markdown / ```text / bare fences.
 * Only real code languages are stripped as talk-bleed.
 * Empty / opener-only fences are removed entirely (never leave "markdown ```").
 */
function unwrapPlanningFencesForTalk(input: string): string {
  let text = String(input || '');
  const planLang = /^(?:markdown|md|text|plain|outline|plan)?$/i;
  const codeLang = /^(?:jsx?|tsx?|javascript|typescript|html|css|python|json|bash|sh|shell|xml|sql|rust|go|cpp|c\+\+|c|java|swift|kotlin|vue|svelte)$/i;

  text = text.replace(/```([\w.+-]*)[^\n]*\n([\s\S]*?)```/g, (full, lang, body) => {
    const l = String(lang || '').trim();
    const inner = String(body || '').replace(/\s+$/, '');
    if (codeLang.test(l)) return full;
    // Empty planning fence → drop (causes blank CODE / "markdown ```" bleed).
    if ((planLang.test(l) || !l) && !inner.trim()) return '';
    if (planLang.test(l) || !l) return inner;
    if (/^\s*(?:\d+\.|[-*•]|\*\*[^*\n]+)/m.test(inner)
      && !/(?:export\s+default|className=|<!DOCTYPE|function\s*\()/m.test(inner)) {
      return inner;
    }
    return full;
  });

  const unclosed = text.match(/```([\w.+-]*)[^\n]*\n([\s\S]*)$/);
  if (unclosed) {
    const l = String(unclosed[1] || '').trim();
    const body = unclosed[2] || '';
    const looksCode = codeLang.test(l)
      || /(?:export\s+default|function\s*\(|const\s+\w+\s*=|className=|<!DOCTYPE)/.test(body);
    const looksPlan = planLang.test(l)
      || /^\s*(?:\d+\.|[-*•]|\*\*[^*\n]+)/m.test(body)
      || (body.length > 80 && !looksCode);
    if (looksPlan && !looksCode) {
      // Empty unclosed ```markdown → erase opener; do not leave the lang tag.
      text = text.replace(/```[\w.+-]*[^\n]*\n[\s\S]*$/, body.trim() ? body.replace(/\s+$/, '') : '');
    }
  }

  // Opener-only fences with no newline body yet: ```markdown / ``` at EOL
  text = text.replace(/```(?:markdown|md|text|plain|outline|plan)?\s*$/gi, '');
  // Glued leftovers: "markdown ```" / "``` markdown"
  text = text.replace(/(?:^|\n)\s*(?:markdown|md|text|plain|outline|plan)\s*```+\s*/gi, '\n');
  text = text.replace(/```+\s*(?:markdown|md|text|plain|outline|plan)?\s*$/gi, '');
  text = text.replace(/(?:^|\n)\s*```+\s*(?:markdown|md|text|plain|outline|plan)?\s*(?=\n|$)/gi, '\n');

  return text;
}

/** True when the bubble is only empty fences / lang tags — never commit this as a reply. */
export function isTalkFenceJunk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length >= 48 && /[a-zA-Z]{4,}/.test(t) && !/^```/.test(t) && (t.match(/```/g) || []).length < 2) {
    // Has real prose with maybe one leftover tick — not junk.
    const withoutFence = t.replace(/```[\w.+-]*/g, '').replace(/`+/g, '').trim();
    if (withoutFence.length >= 40) return false;
  }
  const stripped = t
    .replace(/```[\w.+-]*/g, ' ')
    .replace(/`+/g, ' ')
    .replace(/\b(?:markdown|md|text|plain|outline|plan|javascript|typescript|python|html|css|json|bash|sh|code|copy)\b/gi, ' ')
    .replace(/[~\s*_#>|\-.:;,/\\[\](){}'"]+/g, ' ')
    .trim();
  return stripped.length < 12;
}

/**
 * Exploratory / how-to chat must stay prose. Strip @@@FILE dumps and real code
 * fences, but keep planning outlines (markdown/list fences). Also strip glued
 * language tags like "Express:javascript" / "Code:cpp" that local models emit.
 */
export function scrubTalkFirstCodeBleed(text: string): string {
  let body = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!body) return body;

  // Closed + unclosed @@@FILE protocol
  body = body.replace(/@@@FILE\s+[^\n\r]+\s*```[\w.+-]*\s*\n[\s\S]*?```/gi, '');
  body = body.replace(/@@@FILE\b[\s\S]*?(?=\n@@@FILE\b|$)/gi, '');
  body = body.replace(/^[ \t]*@@@FILE[^\n]*$/gim, '');
  body = body.replace(/\b@@@FILE\b/gi, '');

  // Unwrap planning fences first so outlines survive; then drop real code fences.
  body = unwrapPlanningFencesForTalk(body);
  body = body.replace(/```[\w.+-]*[^\n]*\n[\s\S]*?```/g, '');
  body = body.replace(/```[\w.+-]*[^\n]*\n[\s\S]*$/g, '');
  // Any leftover bare ticks / opener crumbs
  body = body.replace(/(?:^|\n)\s*(?:markdown|md|text|plain|outline|plan)\s*```+\s*/gi, '\n');
  body = body.replace(/```+\s*(?:markdown|md|text|plain|outline|plan)?\s*$/gi, '');
  body = body.replace(/(?:^|\n)\s*```+\s*/g, '\n');

  // Glued lang tags: "Express:javascript", "Firmware Code:cpp", "structure:python"
  body = body.replace(
    /([A-Za-z0-9).\]"'])\s*:\s*(javascript|typescript|python|java|cpp|c\+\+|csharp|go|rust|php|ruby|swift|kotlin|html|css|sql|bash|shell|json|jsx|tsx|node)\b/gi,
    '$1',
  );
  // Orphan bare lang label on its own line after a colon / heading
  body = body.replace(
    /(?:^|\n)\s*(?:javascript|typescript|python|java|cpp|c\+\+|csharp|jsx|tsx|markdown|md)\s*(?=\n|$)/gi,
    '\n',
  );

  // Cut off raw source dumps that start mid-prose (import / const app = / #include)
  const codeCut = body.search(
    /\n(?:import\s+(?:express|react|mongoose|\{)|const\s+(?:app|express|router|server|User)\s*=|#include\s*<|from\s+flask\s+import|app\s*=\s*Flask\()/i,
  );
  if (codeCut > 60) {
    const head = body.slice(0, codeCut).trim();
    // Keep the head if it still looks like a real answer
    if (head.length >= 40 && /[.!?)]$/.test(head)) body = head;
    else if (head.length >= 80) body = head;
  }

  // Drop lines that are clearly unfinished code fragments
  body = body
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^(?:import |export |const |let |var |function |class |#include|from\s+\w+\s+import)/i.test(t)) return false;
      if (/^(?:app\.(?:get|post|use|listen)|mongoose\.|bcrypt\.|jwt\.|io\.on\()/i.test(t)) return false;
      if (/[{};]$/.test(t) && /\b(?:require\(|=>|function\s*\()/i.test(t)) return false;
      return true;
    })
    .join('\n');

  body = body.replace(/\n{3,}/g, '\n\n').trim();
  // Never return fence-only crumbs — caller should keep lastGood / retry.
  if (isTalkFenceJunk(body)) return '';
  return body;
}

/** Strip false “empty project / attached files” openings from social replies. */
export function scrubFalseProjectChatPreamble(text: string): string {
  let body = String(text || '').trim();
  if (!body) return body;
  // Drop lead-in that invents empty project context.
  body = body.replace(
    /^(?:Sure[,!.]?\s*)?(?:I(?:'ll| will| can)?\s+)?(?:tell\s+you\s+a\s+story|dive\s+into|craft(?:ing)?\s+a\s+story)[\s\S]{0,120}?(?:project\s+files?|attached\s+project|file\s+tree)[\s\S]{0,160}?(?:empty|no\s+files|currently\s+empty)[^.!?\n]*[.!?]\s*/i,
    '',
  );
  body = body.replace(
    /^(?:Sure[,!.]?\s*)?(?:You\s+can\s+see\s+the\s+attached\s+project[^.!?\n]*[.!?]\s*)+/i,
    '',
  );
  body = body.replace(
    /^(?:Since\s+(?:there\s+are\s+no\s+files|the\s+(?:file\s+tree|project)\s+(?:is|are)\s+(?:empty|currently\s+empty))[^.!?\n]*[.!?]\s*)+/i,
    '',
  );
  body = body.replace(
    /^(?:Let's\s+(?:create|imagine|weave)\s+a\s+story[\s\S]{0,80}?(?:project|files?|folder)[^.!?\n]*[.!?]\s*)+/i,
    '',
  );
  // Cut off a second concatenated answer that restarts into project framing.
  const cutMarkers = [
    /\n+The story continues\b/i,
    /\n+What would you like to happen next\??/i,
    /\n+Certainly!?\s+Let's weave a story around the context of this project/i,
    /\n+Let's weave a story around the context of this project/i,
    /\n+Once upon a time, in a world not too different from our own/i,
  ];
  for (const re of cutMarkers) {
    const m = body.search(re);
    if (m > 80) {
      body = body.slice(0, m).trim();
      break;
    }
  }
  // Deduplicate a full repeated "Once upon a time" block.
  const firstOnce = body.search(/Once upon a time/i);
  if (firstOnce >= 0) {
    const secondOnce = body.slice(firstOnce + 20).search(/Once upon a time/i);
    if (secondOnce >= 0) {
      body = body.slice(0, firstOnce + 20 + secondOnce).trim();
    }
  }
  return body.trim();
}
