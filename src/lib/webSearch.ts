/** Chat-side web lookup (Electron IPC → DuckDuckGo / Wikipedia). */

/**
 * Mid-thread side quests: weather, lyrics, sports, news, stocks, etc.
 * These must NOT keep dragging a prior build/plan into the answer.
 */
export function looksLikeSideQuestAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 4) return false;
  // Resume / continue building is not a side quest.
  if (/^(?:keep\s+building|continue\s+building|get\s+back\s+to\s+(?:building|the\s+(?:build|project|site|app)))\b/i.test(t)) {
    return false;
  }
  if (/\b(?:lyrics?|lyric\s+to|words\s+to\s+(?:the\s+)?(?:song|track))\b/i.test(t)) return true;
  if (/\b(?:song|track|album)\b/i.test(t) && /\b(?:by|from|lyrics|artist)\b/i.test(t)) return true;
  if (/\b(?:tell\s+me\s+a\s+story|write\s+(?:me\s+)?a\s+story|story\s+about|bedtime\s+story)\b/i.test(t)) return true;
  if (/\b(?:joke|poem|riddle|haiku)\b/i.test(t) && !/\b(?:code|file|project)\b/i.test(t)) return true;
  if (/\b(?:weather|forecast|temperature|humid(?:ity)?)\b/i.test(t)) return true;
  if (/\b(?:F1|formula\s*1|grand\s+prix|nascar|nba|nfl|mlb|nhl|world\s+cup|premier\s+league)\b/i.test(t)) return true;
  if (/\b(?:upcoming|next)\s+(?:race|races|gp|grand\s+prix)\b/i.test(t)) return true;
  if (/\b(?:stock|stocks|share\s+price|AAPL|TSLA|NVDA|S&P|nasdaq|dow\s+jones)\b/i.test(t)) return true;
  if (/\b(?:white\s+house|president|congress|election|headlines?|breaking\s+news|current\s+events)\b/i.test(t)) return true;
  if (/\bwhat(?:'s|\s+is)\s+(?:the\s+)?(?:weather|score|price|news)\b/i.test(t)) return true;
  if (/\bwho\s+won\b|\bwhat\s+happened\s+(?:today|yesterday|this\s+week|in\s+the\s+white\s+house)\b/i.test(t)) return true;
  return false;
}

export function looksLikeLyricsAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return /\blyrics?\b/i.test(t)
    || (/\b(?:words\s+to|sing(?:ing)?)\b/i.test(t) && /\b(?:song|track)\b/i.test(t));
}

/** Detect invented / hallucinated lyric pastes (repetitive fake verses). */
export function looksLikeInventedLyricsDump(reply: string): boolean {
  const t = String(reply || '');
  if (!/\blyrics?\b/i.test(t) && !/\b(?:verse|chorus|outro)\b/i.test(t)) return false;
  if (/I'm a gemstone in the world/i.test(t)) return true;
  if (/gemstone,\s*gemstone,\s*gemstone/i.test(t)) return true;
  if (/I(?:'m| am) a DJ,\s*I(?:'m| am) a DJ/i.test(t)) return true;
  // Same short line repeated 4+ times → almost always hallucinated.
  const lines = t.split(/\n/).map((l) => l.trim().toLowerCase()).filter((l) => l.length >= 12 && l.length <= 90);
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (/^(?:★|\d+\.|verse|chorus|outro|here are)/i.test(line)) continue;
    counts.set(line, (counts.get(line) || 0) + 1);
    if ((counts.get(line) || 0) >= 4) return true;
  }
  return false;
}

export function honestLyricsUnavailableReply(userMessage?: string): string {
  const ask = String(userMessage || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const title = ask.match(/(?:lyrics?\s+(?:to|for)\s+|song\s+)["“']?([^"'“”]+?)["”']?(?:\s+by\s+|$)/i)?.[1]?.trim();
  const label = title ? `“${title.replace(/\s+by\s+.*/i, '').trim()}”` : 'that song';
  return [
    `I can’t provide verified copyrighted lyrics for ${label} from here — and I won’t invent them.`,
    '',
    'Use an official lyrics source such as **Genius**, **Musixmatch**, or **Apple Music** for the real words.',
    '',
    'I can still help with non-lyric stuff (artist/album context) or jump straight back to your project whenever you want.',
  ].join('\n');
}

/** Prompt nudge: never invent lyrics or drag prior build context into a side quest. */
export function sideQuestAnswerHint(message: string): string {
  const lyrics = looksLikeLyricsAsk(message);
  const weather = /\b(?:weather|forecast|temperature)\b/i.test(message);
  const news = /\b(?:white\s+house|news|president|headlines?|election|stock|F1|formula)\b/i.test(message);
  return [
    'The user switched topics mid-chat. Answer ONLY this latest question.',
    'Do NOT continue any prior product, website, marketplace, homepage, membership, craftsmen, or build advice in this reply.',
    'Do NOT invent facts, news, scores, prices, weather, or song lyrics.',
    'ANSWER SHAPE: Lead with a direct answer in plain sentences (or short bullets of facts). Do NOT reply with a directory of websites. Do NOT say “visit these sites” as the main answer. Optional source links only as a short footnote at the end.',
    weather
      ? 'WEATHER: Give highs/lows, rain/snow chances, and the weekly feel when the lookup notes include them. If notes lack numbers, say the lookup was thin and share only what the snippets actually say — still no link dump.'
      : '',
    news
      ? 'NEWS/STOCKS/SPORTS: Summarize concrete items from the lookup snippets (who/what/when). If snippets are only headlines, paraphrase those headlines — still not a list of news portals.'
      : '',
    lyrics
      ? 'LYRICS: Do not invent or paraphrase fake lyrics. Copyrighted lyrics must not be pasted from memory. If live lookup does not confirm the real lyrics, say you cannot provide verified lyrics and point them to an official lyrics source (Genius, Musixmatch, Apple Music, the artist). You may share non-lyric facts (artist, album, year) only when confident.'
      : 'Prefer live lookup notes when present. If lookup failed, say so clearly instead of guessing.',
    'Never thank the lookup notes. Never start mid-sentence like “you for the detailed…”.',
  ].filter(Boolean).join(' ');
}

/** True when the reply is mostly “here are websites” instead of an answer. */
export function looksLikeLinkDirectoryReply(reply: string): boolean {
  const t = String(reply || '');
  if (!t.trim()) return false;
  const urls = (t.match(/https?:\/\/\S+/gi) || []).length;
  const linkCue = (t.match(/\b(?:visit|check(?:\s+out)?|explore|access this|you can (?:find|view|read|access)|official (?:website|site)|google news|click here)\b/gi) || []).length;
  const hasWeatherNums = /\b\d{1,3}\s*°|\b(?:high|low)s?\b.{0,20}\b\d{1,3}\b|\b\d{1,3}\s*(?:F|C)\b/i.test(t);
  const hasConcrete = /\b(?:announced|signed|said|proclaimed|executive order|closed at|opened at|\$\d|points?|grand prix|race)\b/i.test(t);
  if (urls >= 3 && !(hasWeatherNums || hasConcrete)) return true;
  if (linkCue >= 3 && urls >= 2 && !(hasWeatherNums || hasConcrete)) return true;
  // Numbered list of news portals with almost no prose facts.
  if (/(?:White House Official|Google News|CNBC|NewsNow|Ease Weather|AccuWeather|Weather Channel)/i.test(t)
    && urls + linkCue >= 3
    && !(hasWeatherNums || hasConcrete)) {
    return true;
  }
  return false;
}

/** Side-quest reply that drifted back into the prior build/product plan. */
export function looksLikeBuildBleedReply(reply: string, userMessage: string): boolean {
  if (!looksLikeSideQuestAsk(userMessage)) return false;
  const t = String(reply || '');
  const buildy = /\b(?:homepage|membership tiers?|craftsmen|marketplace|hero section|premium membership|featured craftsmen|sign up now)\b/i.test(t);
  if (!buildy) return false;
  // Allow incidental place names (Helena, Montana) only if the reply is still about the side quest.
  const onQuest = /\b(?:weather|forecast|temperature|white house|president|stock|TSLA|F1|grand prix|lyrics)\b/i.test(t.slice(0, 280));
  return !onQuest;
}

/** True when a side-quest reply has no real answer (link dump or “go check a website”). */
export function looksLikeThinSideQuestReply(reply: string, userMessage: string): boolean {
  const t = String(reply || '');
  const ask = String(userMessage || '');
  if (!t.trim()) return true;
  if (looksLikeLinkDirectoryReply(t)) return true;
  if (looksLikeBuildBleedReply(t, ask)) return true;
  // Soft deflect: “check Yahoo/Google Finance” with no price.
  if (/\b(?:stock|TSLA|Tesla|share\s+price)\b/i.test(ask)
    && !/\$\s?\d|\b\d{2,4}\.\d{1,2}\b|\b(?:up|down)\s+\d|\b\d+(?:\.\d+)?\s*%/i.test(t)
    && /\b(?:yahoo finance|google finance|check (?:recent |the )?stock|visit(?:ing)? financial|recommend visiting)\b/i.test(t)) {
    return true;
  }
  // Weather with no numbers/conditions — only portal names.
  if (/\b(?:weather|forecast|temperature)\b/i.test(ask)
    && !/\b\d{1,3}\s*°|\b(?:high|low)s?\b|\brain|\bsnow|\bcloudy|\bsunny|\b°F|\b°C\b/i.test(t)
    && /\b(?:accuweather|weather\.com|easeweather|visit|check)\b/i.test(t)) {
    return true;
  }
  // News ask answered only as “see the White House website / Google News”.
  if (/\b(?:white\s+house|what\s+happened|headlines?|news)\b/i.test(ask)
    && !/\b(?:announced|signed|said|proclaimed|executive order|press|president)\b/i.test(t)
    && /\b(?:google news|official (?:website|site)|visit (?:the )?(?:white house|these))\b/i.test(t)) {
    return true;
  }
  return false;
}

export function looksLikeWebGroundedAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 8) return false;
  // File / local disk intents should not hit the web.
  if (/\b(?:create|rename|delete|edit)\b.{0,40}\b(?:file|folder|\.ts\b|\.md\b|\.png\b)\b/i.test(t)) {
    return false;
  }
  if (looksLikeSideQuestAsk(t)) return true;
  if (/\b(?:restaurant|menu|carrabba|carrabas|olive\s*garden|near\s+me|closest|hours|address|directions)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:recommend|recommendation|best)\b/i.test(t)
    && /\b(?:eat|meal|food|dish|place|go|order|dinner|lunch)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:my\s+car|engine|transmission|\bAC\b|air\s*conditioning|alternator|brake|check\s+engine)\b/i.test(t)
    && /\b(?:noise|problem|fix|broken|stop|stall|rattle|squeak|help)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:what(?:'s| is)|who(?:'s| is)|where(?:'s| is))\b/i.test(t)
    && /\b(?:known\s+for|famous|located|mean|company|founded)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:weather|news|stock(?:\s+price)?s?|current\s+events|headlines?|breaking)\b/i.test(t)) return true;
  if (/\bwhat\s+happened\s+(?:today|yesterday|this\s+week|recently)\b/i.test(t)) return true;
  if (/\b(?:latest|today'?s|as\s+of\s+today|right\s+now)\b/i.test(t)
    && /\b(?:news|stock|market|tesla|apple|white\s+house|election|score|won|price)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:who\s+won|stock\s+market|tesla\s+stock|AAPL|TSLA|NVDA)\b/i.test(t)) return true;
  if (/\blook\s+(?:up|this)\s+up\b|\bsearch\s+(?:the\s+)?(?:web|internet|online)\b/i.test(t)) return true;
  return false;
}

export async function webSearchForChat(query: string): Promise<{
  ok: boolean;
  text: string;
  sources: { title: string; url: string }[];
  error?: string;
}> {
  try {
    if (window.arkDesktop?.webSearch) {
      const res = await window.arkDesktop.webSearch(query);
      return {
        ok: Boolean(res?.ok),
        text: String(res?.text || ''),
        sources: Array.isArray(res?.sources) ? res.sources : [],
        error: res?.error,
      };
    }
  } catch (err) {
    return {
      ok: false,
      text: '',
      sources: [],
      error: err instanceof Error ? err.message : 'Web search failed',
    };
  }
  return { ok: false, text: '', sources: [], error: 'Web search unavailable outside desktop' };
}

export function formatWebLookupForPrompt(result: {
  text: string;
  sources?: { title: string; url: string }[];
}): string {
  const body = String(result.text || '').trim();
  if (!body) return '';
  // Prefer snippet lines without raw URLs so the model answers from text, not a link list.
  const factLines = body
    .split('\n')
    .map((l) => l.replace(/\s*\(https?:\/\/[^)]+\)\s*/g, '').trim())
    .filter(Boolean)
    .slice(0, 14);
  const links = (result.sources || [])
    .filter((s) => s?.url)
    .slice(0, 4)
    .map((s) => `- ${s.title || 'Link'}: ${s.url}`)
    .join('\n');
  return [
    'INTERNAL LOOKUP DATA (not a user message — do not thank it, do not acknowledge it).',
    'Write a direct user-facing answer using the facts/snippets below.',
    'HARD RULE: Do not answer with only a list of websites or “visit these links”. Lead with concrete details. At most 2 optional source links at the very end.',
    '',
    factLines.join('\n'),
    links ? `\nOptional footnote sources (use at most two, only if helpful):\n${links}` : '',
  ].filter(Boolean).join('\n');
}

/** When the model only dumped links, rebuild a usable answer from lookup snippets. */
export function fallbackAnswerFromLookup(
  userMessage: string,
  hit: { text?: string; sources?: { title: string; url: string }[] },
): string {
  const raw = String(hit?.text || '');
  const bits = raw
    .split('\n')
    .map((l) => l
      .replace(/^Web results[^:]*:\s*/i, '')
      .replace(/^Related:\s*/i, '')
      .replace(/^\s*[-•]\s*/, '')
      .replace(/\s*\(https?:\/\/[^)]+\)\s*/g, '')
      .replace(/^Wikipedia ·\s*/i, '')
      .replace(/^Web ·\s*/i, '')
      .replace(/\s*[|—–-]\s*(?:Yahoo Finance|Google Finance|MarketBeat|Ease Weather|AccuWeather|Weather Channel|CNBC|NewsNow|Bloomberg|Google News).*$/i, '')
      .replace(/^(?:Tesla,? Inc\.?\s*\(TSLA\)\s*)?(?:Stock Price[^.]{0,40}\.|News Today[^.]{0,40}\.)\s*/i, '')
      .replace(/&#x27;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/&quot;/gi, '"')
      .trim())
    .filter((l) => l.length > 28 && !/^https?:\/\//i.test(l))
    .filter((l) => !/^(?:find the latest|get the|visit|access hourly|read full articles|site map)\b/i.test(l))
    .slice(0, 6);
  const ask = String(userMessage || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!bits.length) {
    return [
      `I looked that up, but the live results were mostly site titles — not enough detail to give a solid answer for “${ask}”.`,
      '',
      'Add a cloud key in **Models → Cloud** (Perplexity is best for live news/weather), then ask again. Or say **keep building** to return to your project.',
    ].join('\n');
  }
  return [
    `Here’s what turned up live for “${ask}”:`,
    '',
    ...bits.map((b) => `- ${b}`),
    '',
    'That’s the snippet-level detail available without a live news model. Want a deeper dig, or say **keep building** to jump back to your project?',
  ].join('\n');
}

/** Strip prior-build advice that leaked into a side-quest (lyrics/weather/news) reply. */
export function scrubSideQuestBleed(reply: string, userMessage: string): string {
  if (!looksLikeSideQuestAsk(userMessage)) return String(reply || '');
  let out = String(reply || '');
  if (!out.trim()) return out;
  if (looksLikeBuildBleedReply(out, userMessage)) return '';
  out = out
    .replace(/^(?:thank(?:s| you)?[^.!\n]{0,80}(?:lookup|notes|forecast|information)[^.!\n]*[.!]?\s*)/i, '')
    .replace(/^[a-z]{1,12}\s+for the detailed[^.!\n]*[.!]?\s*/i, '')
    .replace(/\n+(?:In terms of|Regarding|As for|Back to|Continuing with|Meanwhile)[\s\S]{0,80}(?:homepage|marketplace|membership|craftsmen|premium\s+membership)[\s\S]*$/i, '')
    .replace(/\n+(?:\*\*)?(?:Homepage Design|Homepage Layout|Membership Tiers|Product Experience|Design Elements)(?:\*\*)?:?[\s\S]*$/i, '')
    .replace(/\n+here are some additional ideas to enhance the product experience[\s\S]*$/i, '')
    .replace(/\n+Would you like me to help you access any specific piece of information[^.!\n]*[.!]?\s*$/i, '')
    .trim();
  return out;
}

/** Honest copy when live lookup failed and we should not invent 2023-cutoff news. */
export function webLookupUnavailableNote(): string {
  return [
    'Live web lookup did not return usable results for this question.',
    `Today's calendar date may be recent, but I do not have fresh headlines in this turn.`,
    'Say so clearly to the user: do not invent current events from training data.',
    'Recommend Models → Cloud (Perplexity Sonar is best for live news) or connect the Exa plugin, then ask again.',
  ].join(' ');
}
