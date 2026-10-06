/**
 * Detect casual chat that must NOT go through studio / empty project packing.
 */

import { looksLikeSideQuestAsk } from '@/lib/webSearch';
import {
  looksLikeTalkBeforeCreateAsk,
  looksLikeRequirementsAsk,
  looksLikeGreenfieldKeepPlanning,
} from '@/lib/chatIdeaIntent';

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
    .replace(/<!--nova-attach:[\s\S]*?-->/g, '')
    .replace(/<!--nova-auto-read-->/g, '')
    .replace(/^[\[](?:Plan|Ask|Debug|Tasks)[\]]\s*/i, '')
    .trim()
    .replace(/[!?.…]+$/g, '')
    .trim();
  if (!t || t.length > 36) return false;
  // Exact / near-exact greetings (incl. common typos: ehello, helo, helllo).
  if (/^(?:hi|hii+|hello|heelo|hell+o|helo|ehello|hellp|hey|yo|sup|howdy)(?:\s+(?:nova|there|friend|team))?$/i.test(t)) {
    return true;
  }
  const letters = t.toLowerCase().replace(/[^a-z]/g, '');
  if (!letters || letters.length > 12) return false;
  if (['hi', 'hii', 'hiii', 'hey', 'heyy', 'yo', 'sup', 'howdy'].includes(letters)) return true;
  // Fuzzy hello family: ehello / helllo / hrllo / hewlo
  return /^e?h+[ei]*l+o+$/.test(letters) && letters.length <= 10;
}

/** Instant greeting — no GGUF load (avoids 10–20s hangs + coding-tutor bleed). */
export function instantGreetingReply(): string {
  const opts = [
    'Hey — good to see you. What do you need?',
    'Hi. I’m here whenever you’re ready.',
    'Hello. What’s on your mind?',
  ];
  return opts[Math.floor(Math.random() * opts.length)]!;
}

/**
 * Soft check-in / “got a minute?” — still chat, never pivot to coding.
 * Longer than pure hi/hello but not a product ask yet.
 */
export function looksLikeSoftCheckInAsk(message: string): boolean {
  const t = String(message || '')
    .replace(/<!--nova-attach:[\s\S]*?-->/g, '')
    .replace(/<!--nova-auto-read-->/g, '')
    .replace(/^[\[](?:Plan|Ask|Debug|Tasks)[\]]\s*/i, '')
    .trim();
  if (!t || t.length < 8 || t.length > 120) return false;
  // Already a product / build ask — not a soft check-in.
  if (/\b(?:build|app|website|plan|feature|code|create|scaffold)\b/i.test(t)) return false;
  if (looksLikePureGreeting(t)) return true;
  return (
    /^(?:hey|hi|hello|yo)\b/i.test(t)
    && /\b(?:got a (?:sec|second|minute|min)|quick question|quick ask|got a minute|if you(?:['’]ve| have) got a (?:sec|minute))\b/i.test(t)
  );
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
    .replace(/<!--nova-attach:[\s\S]*?-->/g, '')
    .replace(/<!--nova-auto-read-->/g, '')
    .replace(/^[\[](?:Plan|Ask|Debug|Tasks)[\]]\s*/i, '')
    .trim();
  if (!t || t.length < 2) return false;

  if (looksLikePureGreeting(t)) return true;
  if (looksLikeSoftCheckInAsk(t)) return true;
  if (looksLikeCapabilityOverviewAsk(t)) return true;
  if (looksLikeRequirementsAsk(t) || looksLikeTalkBeforeCreateAsk(t)) return true;

  // Continue-planning / fold extras into the plan — never studio Local scan.
  if (looksLikeGreenfieldKeepPlanning(t)) return true;
  if (/\bfold\s+(?:those|these|them|it|that)\s+into\s+the\s+plan\b/i.test(t)) return true;
  if (/\b(?:add|want)\s+(?:three|3|two|2|more)\s+extras?\b/i.test(t)) return true;
  if (/\bi\s+also\s+want\b/i.test(t) && /\b(?:button|undo|color|colors|feature|extras?)\b/i.test(t)) return true;
  // Feasibility questions must stay plain chat (no @@@FILE dumps).
  if (
    /\?/i.test(t)
    && (
      /\b(?:is\s+(?:that|this|it)\s+actually\s+possible)\b/i.test(t)
      || /\bpossible\s+to\s+build\b/i.test(t)
      || /\b(?:how\s+long|feasible)\b/i.test(t)
    )
  ) {
    return true;
  }

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
 * Turn loose CSS property / selector dumps into a fenced ```css block so the
 * chat renderer can show a professional code box (hex chips stay in prose).
 */
export function fenceLooseCssDumps(text: string): string {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let cssBuf: string[] = [];
  const isCssLine = (raw: string) => {
    const t = raw.trim();
    if (!t) return false;
    if (/^(?:html|body|header|nav|footer|main|h[1-6]|p|a|ul|li|button|input|textarea|img|div|span|section|article)(?:\s*[.#:][\w-]+)*\s*\{?\s*$/i.test(t)) {
      return true;
    }
    if (/^[.#][\w-]+(?:\s+[.#:][\w-]+)*(?:\s*:[\w-]+)?\s*\{?\s*$/i.test(t)) return true;
    if (/^[.#\w:*-]+\s*\{[^{}]*\}\s*$/i.test(t)) return true;
    if (/^(?:margin|padding|border|background|color|font|width|height|display|flex|grid|gap|opacity|outline|box-shadow|border-radius|letter-spacing|line-height|text-|min-|max-|overflow|position|top|left|right|bottom|z-index|cursor|transition|transform|align|justify|object-|box-sizing)[\w-]*\s*:\s*[^;{]+;?\s*$/i.test(t)) {
      return true;
    }
    if (/^\}?\s*$/.test(t) && t.includes('}')) return true;
    return false;
  };
  const flushCss = () => {
    if (!cssBuf.length) return;
    const code = cssBuf.join('\n').trim();
    cssBuf = [];
    if (!code) return;
    // Tiny single-property crumbs stay inline in backticks.
    if (code.split('\n').length < 2 && code.length < 48) {
      out.push('`' + code.replace(/`/g, "'") + '`');
      return;
    }
    out.push('```css', code, '```');
  };
  for (const line of lines) {
    if (isCssLine(line) || (cssBuf.length > 0 && (/^\s{2,}\S/.test(line) || /^[{}]$/.test(line.trim())))) {
      cssBuf.push(line);
    } else {
      flushCss();
      out.push(line);
    }
  }
  flushCss();
  return out.join('\n');
}

/**
 * Exploratory / how-to chat must stay readable. Strip @@@FILE dumps, keep
 * planning outlines, and put leaked CSS/JS into fenced code boxes (not raw prose).
 */
export function scrubTalkFirstCodeBleed(text: string): string {
  let body = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!body) return body;

  // Closed + unclosed @@@FILE protocol
  body = body.replace(/@@@FILE\s+[^\n\r]+\s*```[\w.+-]*\s*\n[\s\S]*?```/gi, '');
  body = body.replace(/@@@FILE\b[\s\S]*?(?=\n@@@FILE\b|$)/gi, '');
  body = body.replace(/^[ \t]*@@@FILE[^\n]*$/gim, '');
  body = body.replace(/\b@@@FILE\b/gi, '');

  // Unwrap planning fences first so outlines survive as prose lists.
  body = unwrapPlanningFencesForTalk(body);
  // Loose CSS → ```css boxes (do this BEFORE any fence stripping).
  body = fenceLooseCssDumps(body);
  // Talk-first: drop CSS dumps entirely (models paste stylesheet blobs mid-chat).
  body = body.replace(/```css\b[\s\S]*?```/gi, '\n');
  body = body.replace(/^(?:\s*[.#\w-]+(?:\s+[.#\w-]+)*\s*\{[^}]*\}\s*)$/gm, '');
  body = body.replace(/\n(?:\s*\.[A-Za-z_][\w-]*[^{\n]*\{[^}]*\})+/g, '\n');
  // Drop leftover bare ``` crumbs that aren't a real lang fence.
  body = body.replace(/(?:^|\n)\s*(?:markdown|md|text|plain|outline|plan)\s*```+\s*/gi, '\n');
  // Strip empty or unmarked fence openers that would break rendering.
  body = body.replace(/(?:^|\n)```\s*\n```/g, '\n');

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

  // Orphan lead-ins after code scrub ("Here's the basic HTML structure:") — drop empties.
  body = body.replace(
    /(?:^|\n)\s*(?:here(?:'s| is)\s+(?:the\s+)?(?:basic\s+)?(?:html|css|structure|code|markup)(?:\s+for\s+(?:the\s+)?(?:homepage|page|site))?)\s*:?\s*(?=\n|$)/gim,
    '\n',
  );
  // Trailing orphan lead-in with no body after (common talk stutter).
  body = body.replace(
    /\s*(?:here(?:'s| is)\s+(?:the\s+)?(?:basic\s+)?(?:html|css|structure|code|markup)(?:\s+for\s+(?:the\s+)?(?:homepage|page|site))?)\s*:?\s*$/gim,
    '',
  );
  body = body.replace(
    /(?:^|\n)\s*(?:let(?:'s| us)\s+(?:go\s+ahead\s+and\s+)?(?:create|write|start\s+with)\s+(?:the\s+)?(?:html|css|structure))\b[^\n]*/gim,
    '\n',
  );
  body = body.replace(
    /\s*(?:we(?:'ll| will)\s+use\s+(?:html|css)(?:\s+and\s+(?:html|css))?[^.!?\n]*)[.!]?\s*/gi,
    ' ',
  );
  // Collapse duplicated consecutive sentences (model stutter / silentUpgrade flash).
  body = collapseDuplicateSentences(body);

  body = body.replace(/\n{3,}/g, '\n\n').trim();
  // Never return fence-only crumbs — caller should keep lastGood / retry.
  if (isTalkFenceJunk(body)) return '';
  // Lead-in-only leftovers after scrub → empty so caller can use plan fallback.
  if (/^(?:here(?:'s| is)|let(?:'s| us)\s+(?:create|start))\b/i.test(body) && body.length < 120) {
    return '';
  }
  return body;
}

/** Collapse immediate duplicate sentences / phrases (stream retract leftovers). */
export function collapseDuplicateSentences(text: string): string {
  let body = String(text || '').replace(/\r\n/g, '\n');
  // Exact duplicate consecutive lines
  body = body.replace(/^(.*[^\n])\n+\1(\n|$)/gim, '$1$2');
  // Same sentence glued twice on one line: "Foo. Foo." or "Foo: Foo:"
  body = body.replace(/\b([A-Z][^.!?\n]{12,}[.!?:,])\s+\1/g, '$1');
  // Short lead-in repeated: "Here's X: Here's X:"
  body = body.replace(/\b((?:Here(?:'s| is)|Got it)[^.!\n]{8,60}:)\s+\1/gi, '$1');
  return body.trim();
}

/**
 * Truncated model tails like "? Or do you have any specific questions…" —
 * leftover quiz closings with the real answer stripped away.
 */
export function looksLikeOrphanChatTail(text: string): boolean {
  const t = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!t) return true;
  if (t.length < 12) return true;
  if (/^[?？]/.test(t)) return true;
  if (/^(?:or|and)\s+(?:do\s+you|would\s+you|any)\b/i.test(t)) return true;
  if (
    t.length < 220
    && /^(?:would you like|do you have|any (?:specific )?questions|let me know if|feel free to ask)\b/i.test(t)
  ) {
    return true;
  }
  if (
    t.length < 160
    && /\?\s*$/.test(t)
    && !/\n/.test(t)
    && /(?:specific questions|changes in mind|more (?:info|detail)|anything else)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/**
 * Homepage / apple.com-style planning reply when the model returns an orphan tail.
 * Only call when the user ask is clearly a marketing/homepage brief.
 */
export function marketingHomepagePlanFallback(message: string): string {
  const t = String(message || '');
  const apple = /\bapple\.com\b|\biphone\b|\bairpods\b|\bipad\b/i.test(t);
  const brand = apple ? 'Apple-style' : 'product';
  return [
    `Got it — an ${brand} homepage with a thin top nav, a huge phone hero, and colorful product bands.`,
    '',
    '1. **Header — Navigation**',
    '- **Appearance:** thin full-width bar, near-black background, small centered links',
    '- **Items:** logo mark, Store, Mac, iPad, iPhone, Watch, AirPods, Support, search and bag icons on the right',
    '',
    '2. **Hero — New phone**',
    '- **Look:** full-bleed dark band, huge centered headline, short subcopy, two pill CTAs (Learn more / Buy)',
    '- **Visual:** large product stage in the lower half — not a forest or ocean photo',
    '- **Motion:** slow fade / drift on the product, no busy loops',
    '',
    '3. **Product bands**',
    '- **Mac:** light gray band, product name, one line, Learn more + Buy, always visible',
    '- **iPad:** soft blue or silver band, same rhythm',
    '- **Watch:** contrasting band so the scroll feels like apple.com',
    '- **AirPods:** final colorful band before the footer',
    '',
    '4. **Footer**',
    '- **Links:** Store, Support, Privacy, Terms, Contact in quiet columns',
    '',
    'Overall: keep every band full-width and always on the page — never hide a product behind a nav click. White space and big type carry the premium feel.',
    '',
    'Which phone model should lead the hero, and do you want the bands black/white/light-gray like apple.com or more color?',
  ].join('\n');
}

function looksLikeMarketingHomepageAsk(message: string): boolean {
  return /\b(?:homepage|apple\.com|product\s+band|iphone|landing\s+page|marketing\s+(?:site|page))\b/i.test(
    String(message || ''),
  );
}

function looksLikeMarketStallAsk(message: string): boolean {
  return /\b(?:stall|vendor|farmers?\s*market|weekend\s+market)\b/i.test(String(message || ''));
}

function looksLikeShelfBorrowAsk(message: string): boolean {
  return /\b(?:shelf|borrow|book\s+lend|lend(?:ing)?|checkout)\b/i.test(String(message || ''));
}

/** Domain-scoped wrap-up when a planning reply ends on a bare list. */
export function planningExitForDomain(contextAsk: string): { overall: string; question: string } {
  const ctx = String(contextAsk || '');
  if (looksLikeMarketStallAsk(ctx)) {
    return {
      overall:
        'Overall: keep the first version tiny — one phone page that shows who is at which stall and what they sell, with a quick way to add or update a row. Nail that list before extras like maps or notifications.',
      question:
        'Who is this mainly for (you as organizer, or vendors too), and roughly how many stalls on a typical weekend?',
    };
  }
  if (looksLikeMarketingHomepageAsk(ctx)) {
    return {
      overall:
        'Overall: keep every band full-width and always on the page — never hide a product behind a nav click. White space and big type carry the premium feel.',
      question:
        'Which product should lead the hero, and do you want quiet black/white bands or more color?',
    };
  }
  if (looksLikeShelfBorrowAsk(ctx)) {
    return {
      overall:
        'Overall: keep v1 tiny — one list of items, who has them, and a simple check-in / check-out. Nail that loop before maps, notifications, or accounts.',
      question: 'Who mainly uses this, and what is the one action that has to work first?',
    };
  }
  return {
    overall:
      'Overall: keep the first version tiny — one core screen and one must-have action. Nail that before extras.',
    question: 'Who is the main user, and what is the one action that has to work first?',
  };
}

/**
 * Planning fallback when the model returns an orphan tail.
 * Domain-scoped so farmers-market / Apple copy never bleeds into unrelated chats.
 */
export function orphanChatPlanFallback(message: string): string {
  const t = String(message || '');
  if (looksLikeMarketingHomepageAsk(t)) return marketingHomepagePlanFallback(t);
  if (looksLikeMarketStallAsk(t)) {
    return [
      'Got it — losing track of who is selling what at a weekend market is a real pain.',
      'For a tiny phone page we can start with a stall list (number, vendor, what they sell, notes), a tap-to-update status during the day, and a quick end-of-day review.',
      'Must-haves for v1: add/edit stalls, search or filter by name, mark busy or sold out. Later: map layout, favorites, share a link.',
      'Who mainly uses this — you as organizer, or vendors too — and roughly how many stalls?',
    ].join(' ');
  }
  if (looksLikeShelfBorrowAsk(t)) {
    return [
      'Got it — a simple borrow / return loop is a solid first slice.',
      'For v1: a list of items, who has each one, and a check-in / check-out action. Later: reminders, categories, share links.',
      'Who mainly uses this, and what is the one action that has to work first?',
    ].join(' ');
  }
  return [
    'Got it. Here is a fuller plan: who it is for, what to track, day-of flows, must-haves for a tiny v1 vs later ideas, and what “done” looks like.',
    'Who is the main user, and what is the one action that has to work first?',
  ].join(' ');
}

/**
 * Fix unprofessional help openers: “We can help” → “I can help”.
 * Keep collaborative “we” when talking about joint next steps.
 */
export function scrubHelpVoice(text: string): string {
  let body = String(text || '');
  if (!body.trim()) return body;
  body = body.replace(
    /\bWe can definitely help(?:\s+with\s+that)?\b/gi,
    'I can definitely help with that',
  );
  body = body.replace(
    /\bWe can help(?:\s+with\s+that)?[!.,]?\s*/gi,
    (m) => (/with that/i.test(m) ? 'I can help with that. ' : 'I can help. '),
  );
  body = body.replace(
    /\bWe(?:'ll| will) (?:definitely )?help\b/gi,
    'I can help',
  );
  body = body.replace(
    /^(?:Got it!?|Sure!?)\s+Let'?s tackle this problem head-on\./i,
    'Got it — I can help tackle this.',
  );
  body = body.replace(
    /\bWe can create a simple solution to help streamline this process\./gi,
    'I can help map a simple way to streamline this.',
  );
  body = body.replace(
    /^(?:Got it!?|Sure!?)\s+Let'?s (?:create|build|make) a simple solution[^.!?\n]*[.!]?\s*/i,
    'Got it — I can help with that. ',
  );
  if (!/\n\nOverall:/i.test(body) && !/\?\s*$/.test(body.trim())) {
    /* keep ensurePlanningExit separate */
  }
  return body.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * If a planning reply ends on a numbered/bullet line with no wrap-up, append a short overall exit.
 * Pass `contextAsk` so wrap-up stays in the user’s domain (no stall/Apple bleed).
 */
export function ensurePlanningExit(text: string, contextAsk?: string): string {
  let body = String(text || '').trim();
  if (!body || body.length < 120) return body;
  // Already has a closing question or overall wrap-up.
  if (/\?\s*$/.test(body)) return body;
  if (/\b(?:overall|in short|putting (?:this|it) together|simplest path|nail first|start with)\b/i.test(body.slice(-420))) {
    return body;
  }
  const lines = body.split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || '';
  const endsOnList = /^(?:\d+[.)]\s+|[-*•]\s+)/.test(last)
    || (/^[A-Z].{0,80}:/.test(last) && !/[.!?]$/.test(last));
  if (!endsOnList && !/:\s*-\s+/.test(last)) return body;
  const exit = planningExitForDomain(String(contextAsk || body));
  return [
    body.replace(/\s+$/g, ''),
    '',
    exit.overall,
    '',
    exit.question,
  ].join('\n');
}

/**
 * Strip aggressive “let’s set up Vite / pick a folder / proceed with creating”
 * closers from talk-first replies. Small models often ignore system seeds.
 */
export function scrubBuildAggression(text: string): string {
  let body = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!body) return body;

  const cutTail = (re: RegExp) => {
    const m = body.search(re);
    if (m > 80) body = body.slice(0, m).trim();
  };

  // Whole closing paragraphs that push install / directory / Vite.
  cutTail(
    /\n+(?:Would you like (?:more information|to know more|any (?:specific )?questions)[^\n]*(?:\n(?![A-Z#*\d-])[^\n]*)*)/i,
  );
  cutTail(
    /\n+(?:\??\s*Or do you have any specific questions[^\n]*)/i,
  );
  cutTail(
    /\n+(?:Let(?:'s| us) start by setting up[^\n]*(?:\n(?![A-Z#*\d-])[^\n]*)*)/i,
  );
  cutTail(
    /\n+(?:Let(?:'s| us)\s+(?:go\s+ahead\s+and\s+)?(?:create|write|start\s+with)\s+(?:the\s+)?(?:html|css|javascript|code|structure)[^\n]*(?:\n[\s\S]*)?)/i,
  );
  cutTail(
    /\n+(?:Let(?:'s| us)\s+begin\s+by\s+creating\s+(?:the\s+)?(?:html|css)[^\n]*(?:\n[\s\S]*)?)/i,
  );
  cutTail(
    /\n+(?:Here(?:'s| is)\s+(?:the\s+)?(?:basic\s+)?(?:html|css|structure)[^\n]*(?:\n[\s\S]*)?)/i,
  );
  // Mid-paragraph HTML/CSS build aggression (talk path must stay plan-only).
  body = body.replace(
    /\s*(?:Let(?:'s| us)\s+begin\s+by\s+creating\s+(?:the\s+)?(?:HTML|CSS)[^.!?\n]*)[.!]?\s*/gi,
    ' ',
  );
  body = body.replace(
    /\s*(?:creating\s+the\s+HTML\s+and\s+CSS\s+for\s+this\s+layout)[^.!?\n]*[.!]?\s*/gi,
    ' ',
  );
  cutTail(
    /\n+(?:If so,? we can start by setting up[^\n]*(?:\n(?![A-Z#*\d-])[^\n]*)*)/i,
  );
  cutTail(
    /\n+(?:What directory (?:would you like|should we)[^\n]*(?:\n(?![A-Z#*\d-])[^\n]*)*)/i,
  );
  cutTail(
    /\n+(?:We can start by setting up (?:a )?(?:basic )?(?:Vite|React)[^\n]*(?:\n(?![A-Z#*\d-])[^\n]*)*)/i,
  );

  // Inline closers mid-paragraph
  body = body.replace(
    /\s*(?:Would you like to proceed with creating this (?:page|app|project|site|layout)\??)[^.!?\n]*(?:[.!?]\s*)?/gi,
    ' ',
  );
  body = body.replace(
    /\s*(?:Let(?:'s| us) start by setting up (?:a )?(?:basic )?(?:Vite\s*\+?\s*)?React[^.!?\n]*)[.!]?\s*/gi,
    ' ',
  );
  body = body.replace(
    /\s*(?:What directory (?:would you like|should we)[^.!?\n]*)[.!]?\s*/gi,
    ' ',
  );
  body = body.replace(
    /\s*(?:preferred directory where we should create this project)[^.!?\n]*[.!]?\s*/gi,
    ' ',
  );

  // Cut tech-implementation dumps that small models tack onto planning replies.
  cutTail(
    /\n+(?:\d+\.\s*)?(?:\*{0,2})?(?:Technical Implementation|Implementation(?:\s+(?:Steps?|Considerations))?|Choose a Technology|Develop the Backend|Design the UI|Test and Iterate|Technology Stack|Testing and Deployment|Maintenance and Support|Storage Solution)\b[^\n]*(?:\n(?![A-Z*\d★])[^\n]*)*/i,
  );
  // If tech dump is mid-list, drop from that numbered step to end-of-list (keep later Overall if any).
  body = body.replace(
    /\n+(?:\d+\.\s*)?(?:Technical Implementation|Testing and Deployment|Maintenance and Support)\b[\s\S]*?(?=\n\nOverall:|\n\nWho is this mainly for|\n*$)/i,
    '\n',
  );
  body = body.replace(
    /\n*(?:\d+\.\s*)?(?:Technical Approach|Technical Implementation|Testing and Deployment|Maintenance and Support)\s*-?\s*/gi,
    '\n',
  );
  cutTail(
    /\n+(?:For simplicity,? we can use (?:a )?web-based solution|We’ll handle data storage|Let’s start with the basic list|To start,? we can create a basic prototype|We can use a simple web framework|We can use a simple web framework like|Would you like to proceed with building)[^\n]*(?:\n(?![A-Z*\d★])[^\n]*)*/i,
  );
  // Image / casual asks — cut “given you’re into coding, we could build…” pitches.
  cutTail(
    /\n+(?:Given (?:that )?you(?:'re| are) interested in coding[^\n]*(?:\n(?![A-Z#*\d-])[^\n]*)*)/i,
  );
  cutTail(
    /\n+(?:We could (?:explore|build|create|make) (?:a |an )?(?:project|app|tool|filter)[^\n]*(?:\n(?![A-Z#*\d-])[^\n]*)*)/i,
  );
  cutTail(
    /\n+(?:Perhaps we could build[^\n]*(?:\n(?![A-Z#*\d-])[^\n]*)*)/i,
  );
  body = body.replace(
    /\s*(?:Given (?:that )?you(?:'re| are) interested in coding[^.!?\n]*)[.!]?\s*/gi,
    ' ',
  );
  body = body.replace(
    /\s*(?:Perhaps we could build[^.!?\n]*)[.!]?\s*/gi,
    ' ',
  );
  body = body.replace(
    /\s*(?:using (?:libraries|tools) like OpenCV[^.!?\n]*)[.!]?\s*/gi,
    ' ',
  );
  body = body.replace(
    /\n*(?:\d+\.\s*)?(?:Choose a Technology|Develop the Backend|Design the UI|Test and Iterate|Technology Stack|Implementation Considerations)\s*:[^\n]*/gi,
    '',
  );
  body = body.replace(
    /\n*(?:\d+\.\s*)?(?:Technology Stack|Database|Authentication)\s*:[^\n]*(?:\n(?!\d+\.|\s*[-•])[^\n]*)*/gi,
    '',
  );
  body = body.replace(
    /\n*★?\s*\*{0,2}Next Steps?\*{0,2}:?[^\n]*(?:\n(?![A-Z*\d★•-])[^\n]*)*/i,
    '',
  );
  body = body.replace(
    /\s*Would you like to proceed with building[^.!?\n]*[.!]?\s*/gi,
    ' ',
  );
  // Drop trailing orphan numbers like "7." with no body.
  body = body.replace(/\n+\d+[.)]\s*$/g, '');

  return body.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
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
