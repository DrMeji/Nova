/** Chat-side web lookup (Electron IPC → DuckDuckGo / Wikipedia). */

/**
 * Mid-thread side quests: weather, lyrics, sports, news, stocks, etc.
 * These must NOT keep dragging a prior build/plan into the answer.
 */

/** Sports / esports / match predictions — need live web, not local-model guesses. */
function looksLikeSportsOrEsportsAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Traditional + esports titles / leagues.
  if (/\b(?:F1|formula\s*1|grand\s+prix|nascar|nba|nfl|mlb|nhl|mls|world\s+cup|premier\s+league|ufc|boxing|tennis|golf|olympics?)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:valorant|valora(?:nt|qnt)|cs2|counter[- ]?strike|league\s+of\s+legends|\blo\s*l\b|dota\s*2|overwatch|rocket\s+league|apex\s+legends|fortnite|call\s+of\s+duty|warzone|rainbow\s+six|r6\s+siege|esports?|e[- ]?sports)\b/i.test(t)) {
    return true;
  }
  // Common org acronyms when paired with a win/match/vs cue.
  if (/\b(?:PRX|paper\s*rex|team\s+liquid|\bTL\b|FNATIC|FNC|Sentinels|SEN|NRG|Cloud9|C9|Gen\.?\s*G|T1|DRX|Evil\s+Geniuses|\bEG\b|G2|NaVi|Natus\s+Vincere|100\s*Thieves|LOUD|KR[UÜ]|FURIA)\b/i.test(t)
    && /\b(?:win|won|vs\.?|versus|match|series|playoffs?|tournament|champions?|masters|vct|predict|or)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:upcoming|next)\s+(?:race|races|gp|grand\s+prix|match|game|series)\b/i.test(t)) return true;
  // “Who (do you think) will/gonna win A or B” — tolerate chat typos (u/you, gonman/gonna).
  if (/\bwho\s+(?:do\s+(?:you|u)\s+think\s+)?(?:i'?d\s+|is\s+)?(?:gonna|gon+a|gon\s*na|gonman|going\s+to|will|would)\s+win\b/i.test(t)) return true;
  if (/\bwho\s+(?:do\s+(?:you|u)\s+think\b).{0,40}\bwin\b/i.test(t)) return true;
  if (/\bwho\s+(?:wins?|winning)\b/i.test(t) && /\b(?:or|vs\.?|versus)\b/i.test(t)) return true;
  if (/\b(?:predict|prediction|favorite|favourite|underdog)\b/i.test(t)
    && /\b(?:win|match|game|series|vs\.?|versus|tournament)\b/i.test(t)) {
    return true;
  }
  return false;
}

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
  if (looksLikeSportsOrEsportsAsk(t)) return true;
  // People / brands / streamers / companies — always leave the build thread.
  if (/\b(?:who\s+(?:is|are|was|were|'s)|who(?:'s)\s+|tell\s+me\s+about|what\s+(?:is|are)\s+(?:the\s+)?(?:brand|company|streamer|player))\b/i.test(t)
    && !/\b(?:file|folder|project|website|app\.jsx|button|css)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:twitch|youtube\.com|streamer|stream\s+on|pro\s+player)\b/i.test(t)
    && /\b(?:who|what|about|info|information|details?)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:who\s+created|founded|founder|how\s+did\s+(?:they|it|the\s+brand|the\s+company)\s+(?:start|begin|get\s+started))\b/i.test(t)) {
    return true;
  }
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
  const sports = looksLikeSportsOrEsportsAsk(message);
  const news = /\b(?:white\s+house|news|president|headlines?|election|stock|F1|formula)\b/i.test(message) || sports;
  return [
    'The user switched topics mid-chat. Answer ONLY this latest question.',
    'Do NOT continue any prior product, website, marketplace, homepage, membership, craftsmen, or build advice in this reply.',
    'Do NOT invent facts, news, scores, prices, weather, or song lyrics.',
    'ANSWER SHAPE: Lead with a direct answer in plain sentences (or short bullets of facts). Do NOT reply with a directory of websites. Do NOT say “visit these sites” as the main answer. Optional source links only as a short footnote at the end.',
    weather
      ? 'WEATHER: Give highs/lows, rain/snow chances, and the weekly feel when the lookup notes include them. If notes lack numbers, say the lookup was thin and share only what the snippets actually say — still no link dump.'
      : '',
    sports
      ? 'SPORTS/ESPORTS: Use lookup snippets for team names, matchups, form, and tournament context. Give a clear pick or lean when asked who wins, with 1–2 reasons grounded in the notes. Never invent fake roster roles (do not invent “Primary Rifleman” / “Tactical Leader” expansions for org acronyms). If notes are thin, say so and still answer from what is available.'
      : '',
    /\b(?:who|twitch|streamer|brand|company|created|founded)\b/i.test(message)
      ? 'PEOPLE/BRANDS: Lead with the identity (name, what they are known for). Add role/game/team or company history/products. Include the best Twitch/YouTube/official/wiki link from the notes. Do not ask “who do you mean?” when snippets already match.'
      : '',
    news && !sports
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
  const mdLinks = (t.match(/\[[^\]]+\]\(https?:\/\/[^)]+\)/gi) || []).length;
  const linkCue = (t.match(/\b(?:visit|check(?:\s+out)?|explore|access this|you can (?:find|view|read|access)|official (?:website|site)|google news|click here)\b/gi) || []).length;
  const hasWeatherNums = /\b\d{1,3}\s*°|\b(?:high|low)s?\b.{0,20}\b\d{1,3}\b|\b\d{1,3}\s*(?:F|C)\b/i.test(t);
  const hasConcrete = /\b(?:announced|signed|said|proclaimed|executive order|closed at|opened at|\$\d|billion|million|net\s*worth|points?|grand prix|race|valorant|paper\s*rex|team\s+liquid|match|series|tournament|playoffs?|born|founded|ceo|entrepreneur)\b/i.test(t);
  // Real prose answers with a few source links are NOT link directories.
  const proseChars = t
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\[[^\]]+\]\([^)]+\)/g, '')
    .replace(/\s+/g, ' ')
    .trim().length;
  if (proseChars >= 160 && (hasConcrete || /quick facts|net worth|\*\*/i.test(t))) return false;
  if (urls + mdLinks >= 3 && proseChars < 120 && !(hasWeatherNums || hasConcrete)) return true;
  if (urls >= 3 && proseChars < 100 && !(hasWeatherNums || hasConcrete)) return true;
  if (linkCue >= 3 && urls >= 2 && proseChars < 140 && !(hasWeatherNums || hasConcrete)) return true;
  // Numbered list of news portals with almost no prose facts.
  if (/(?:White House Official|Google News|CNBC|NewsNow|Ease Weather|AccuWeather|Weather Channel)/i.test(t)
    && urls + linkCue >= 3
    && proseChars < 140
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
  const onQuest = /\b(?:weather|forecast|temperature|white house|president|stock|TSLA|F1|grand prix|lyrics|valorant|esports?|match|tournament|win|PRX|Team Liquid)\b/i.test(t.slice(0, 280));
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

/** True when this ask should stay offline (coding / build / disk / greetings). */
function looksLikeOfflineOnlyAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return true;
  if (t.length < 4) return true;
  if (/^(?:hi|hii+|hello|heelo|hell+o|hey|yo|sup|howdy)(?:\s+(?:nova|there|friend|team))?[!?.…]*$/i.test(t)) {
    return true;
  }
  if (/^(?:keep\s+building|continue\s+building|get\s+back\s+to\s+(?:building|the\s+(?:build|project|site|app)))\b/i.test(t)) {
    return true;
  }
  if (/\b(?:@@@FILE|App\.(?:jsx|tsx)|vite\.config|package\.json)\b/i.test(t)) return true;
  if (/\b(?:create|rename|delete|edit)\b.{0,40}\b(?:file|folder|\.ts\b|\.md\b|\.png\b|\.css\b|\.jsx?\b)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:build|scaffold|rewrite|create)\b[\s\S]{0,48}\b(?:project|website|app|site|page|landing)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:fix|debug|refactor|implement)\b[\s\S]{0,40}\b(?:bug|code|file|component|function|css|layout)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:this\s+project|these\s+files|attached\s+(?:folder|project)|in\s+explorer|file\s+tree)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Live web for nearly any real-world question.
 * Opt-out for builds/code/greetings — not an allowlist of topics.
 */
export function looksLikeWebGroundedAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 6) return false;
  if (looksLikeOfflineOnlyAsk(t)) return false;
  if (looksLikeSideQuestAsk(t)) return true;
  if (looksLikeSportsOrEsportsAsk(t)) return true;
  // Any substantive question / lookup / “who is X” style ask.
  if (/\?/.test(t)) return true;
  if (/\b(?:who|what|when|where|which|how|why)\b/i.test(t)) return true;
  if (/\b(?:tell\s+me\s+about|look\s+up|search\s+for|find\s+out|info(?:rmation)?\s+(?:on|about)|more\s+(?:info|information|details?)\s+(?:on|about))\b/i.test(t)) {
    return true;
  }
  if (/\b(?:twitch|youtube|streamer|stream|pro\s+player|esports?|company|brand|founded|creator|created)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:weather|news|stock(?:\s+price)?s?|current\s+events|headlines?|breaking|restaurant|near\s+me)\b/i.test(t)) {
    return true;
  }
  if (/\blook\s+(?:up|this)\s+up\b|\bsearch\s+(?:the\s+)?(?:web|internet|online)\b/i.test(t)) return true;
  // Short proper-noun / person / brand style asks without a question mark.
  if (t.length <= 160 && /\b(?:is|are|was|were|about|named|called)\b/i.test(t)) return true;
  return false;
}

export async function webSearchForChat(
  query: string,
  opts?: { priorTurns?: { role: string; content: string }[] },
): Promise<{
  ok: boolean;
  text: string;
  sources: { title: string; url: string }[];
  error?: string;
}> {
  const cleaned = buildContextualWebQuery(query, opts?.priorTurns || []);
  try {
    if (window.novaDesktop?.webSearch) {
      const res = await window.novaDesktop.webSearch(cleaned);
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

/** Pull people/games from recent thread so follow-ups search the right topic. */
function extractLookupEntities(blob: string): string[] {
  const t = String(blob || '');
  const out: string[] = [];
  const push = (s: string) => {
    const clean = s.replace(/\s+/g, ' ').trim();
    if (!clean || out.some((x) => x.toLowerCase() === clean.toLowerCase())) return;
    out.push(clean);
  };

  if (/\b(?:its?\s*timmy|it'?s\s+timmy|timothy\s+an)\b/i.test(t)) push('ItsTimmy Apex Legends');
  if (/\b(?:curry|currytv|rahul\s+nemani)\b/i.test(t) && /\b(?:valorant|twitch|stream)\b/i.test(t)) {
    push('Curry Valorant Twitch');
  }
  if (/\bapex\s+legends?\b/i.test(t)) push('Apex Legends');
  if (/\bvalorant\b/i.test(t)) push('Valorant');
  if (/\bfortnite\b/i.test(t)) push('Fortnite');
  if (/\btwitch\b/i.test(t) && /\b(?:streamer|stream)\b/i.test(t)) push('Twitch');

  // Earnings asks → add earnings keyword for better hits.
  if (/\b(?:earn(?:ed|ings)?|prize\s*money|winnings)\b/i.test(t)) push('esports earnings');

  return out.slice(0, 4);
}

/** True when this ask depends on prior turn (he/his/the game/more info…). */
export function looksLikeThreadFollowUpAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 8) return false;
  if (/\b(?:he|she|they|him|his|her|them|their)\b/i.test(t) && t.length < 160) return true;
  if (/\b(?:the\s+game|that\s+game|this\s+game|more\s+(?:info|information|details?)|tell\s+me\s+more)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:same\s+(?:guy|person|player|streamer)|what\s+about\s+(?:him|her|them))\b/i.test(t)) return true;
  return false;
}

/** Light cleanup so chat typos still hit useful search results. */
function normalizeWebSearchQuery(raw: string): string {
  let q = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!q) return q;
  q = q
    .replace(/\bvaloraqnt\b/gi, 'Valorant')
    .replace(/\bgonman\b/gi, 'gonna')
    .replace(/\bdo\s+u\b/gi, 'do you')
    .replace(/\bid\s+gonna\b/gi, "I'd gonna")
    .replace(/\b(?:it'?s|its|his|is)\s+teammates?\b/gi, "it's Timmy")
    .replace(/\bapex\s+legend\b/gi, 'Apex Legends')
    .replace(/\bvs\.?\b/gi, 'vs')
    .replace(/\b\?+\s*$/g, '');
  // Expand common org acronyms when paired with esports titles.
  if (/\b(?:valorant|cs2|esports?)\b/i.test(q)) {
    q = q
      .replace(/\bPRX\b/g, 'Paper Rex PRX')
      .replace(/\bTL\b/g, 'Team Liquid TL')
      .replace(/\bSEN\b/g, 'Sentinels SEN')
      .replace(/\bFNC\b/g, 'Fnatic FNC')
      .replace(/\bC9\b/g, 'Cloud9 C9');
  }
  if (/\b(?:timmy|itstimmy)\b/i.test(q) && !/\bapex\b/i.test(q)) {
    q = `${q} Apex Legends`.trim();
  }
  return q.slice(0, 220);
}

/** Build a search string that keeps thread people/games on follow-ups. */
export function buildContextualWebQuery(
  ask: string,
  priorTurns: { role: string; content: string }[] = [],
): string {
  const priorBlob = priorTurns
    .slice(-8)
    .map((t) => String(t.content || '').slice(0, 400))
    .join('\n');
  const entities = extractLookupEntities(`${priorBlob}\n${ask}`);
  let q = normalizeWebSearchQuery(ask);

  if (looksLikeThreadFollowUpAsk(ask) && entities.length) {
    // Pronoun / “the game he plays” → pin the thread subject into the query.
    q = `${entities.join(' ')} ${q}`.replace(/\s+/g, ' ').trim();
  } else if (entities.length && !entities.some((e) => q.toLowerCase().includes(e.split(' ')[0].toLowerCase()))) {
    // Soft boost when ask already names someone but search needs game context.
    const boost = entities.filter((e) => !q.toLowerCase().includes(e.toLowerCase().slice(0, 8)));
    if (boost.length) q = `${q} ${boost[0]}`.trim();
  }
  return q.slice(0, 220);
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
    .slice(0, 16);
  const links = (result.sources || [])
    .filter((s) => s?.url)
    .slice(0, 6)
    .map((s) => `- ${s.title || 'Link'}: ${s.url}`)
    .join('\n');
  return [
    'INTERNAL LOOKUP DATA (not a user message — do not thank it, do not acknowledge it).',
    'Write a direct user-facing answer using the facts/snippets below.',
    'HARD RULES:',
    '- Lead with who/what they are in 1–2 sentences, then a tight **Quick facts** list (only fields you actually know from the notes).',
    '- NEVER write “Not specified in the provided data” / “unknown” rows — omit fields you do not have.',
    '- NEVER invent earnings, follower counts, birth dates, net worth figures, or team history. Only quote numbers that appear in the notes.',
    '- If the user asked for a single fact (net worth / price / how much), lead with that number — do not open with a biography.',
    '- If the user asked for more information / who is, open with a short bio then deepen.',
    '- Stay on the person/game from this thread. If the thread is about Apex / ItsTimmy, do NOT switch to Fortnite or another title unless the user asked.',
    '- Include 1–3 real markdown links with clear labels, e.g. [ItsTimmy on Twitch](https://twitch.tv/…) or [Apex Legends](https://www.ea.com/games/apex-legends). Prefer Twitch/official/Liquipedia/EsportsEarnings over random blogs.',
    '- For “the game he plays” follow-ups: answer about THAT player’s main game from the thread, with a short what-it-is + official link.',
    '',
    factLines.join('\n'),
    links ? `\nSources (pick the best 1–3 as markdown links in the reply):\n${links}` : '',
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

/** Repair empty / placeholder markdown links using live lookup sources. */
export function repairReplySourceLinks(
  reply: string,
  sources?: { title: string; url: string }[],
): string {
  let out = String(reply || '');
  if (!out.trim()) return out;
  const urls = (sources || [])
    .map((s) => String(s?.url || '').trim())
    .filter((u) => /^https?:\/\//i.test(u));
  const pick = (hint: RegExp) => {
    const hit = (sources || []).find((s) => hint.test(`${s.title || ''} ${s.url || ''}`));
    return hit?.url && /^https?:\/\//i.test(hit.url) ? hit.url : urls[0] || '';
  };

  // [label]() / [label](#) / [label](undefined)
  out = out.replace(/\[([^\]]+)\]\((#|undefined|null|)\s*\)/gi, (_m, label) => {
    const lab = String(label || '');
    const url = /forbes/i.test(lab) ? pick(/forbes/i)
      : /wiki/i.test(lab) ? pick(/wikipedia|wiki/i)
      : /twitch/i.test(lab) ? pick(/twitch/i)
      : /live|net\s*worth|track/i.test(lab) ? pick(/forbes|bloomberg|net.?worth|track/i)
      : urls[0] || '';
    return url ? `[${lab}](${url})` : lab;
  });

  // “live here ↗” / **live here** with no URL — attach best tracker link.
  if (/\blive\s+here\b/i.test(out) && !/\[live\s+here\]\(https?:\/\//i.test(out)) {
    const url = pick(/forbes|bloomberg|net.?worth|track/i) || urls[0];
    if (url) {
      out = out.replace(/\*{0,2}live\s+here\*{0,2}/gi, `[live here](${url})`);
    }
  }

  // Drop dangling ↗ that isn't next to a link.
  out = out.replace(/(?<!\])\s*↗/g, '');
  return out;
}

/** Strip empty “Not specified…” fact rows local models love to invent. */
export function scrubEmptyFactPlaceholders(reply: string): string {
  let out = String(reply || '');
  if (!out.trim()) return out;
  out = out.replace(
    /^[ \t]*[-*•]\s*\*?\*?[^:\n]{1,40}\*?\*?:\s*(?:Not specified(?: in the provided data)?|Unknown|N\/A|None)\.?[ \t]*$/gim,
    '',
  );
  out = out.replace(/\n{3,}/g, '\n\n').trim();
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
