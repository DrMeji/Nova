/** Chat-side web lookup (Electron IPC → DuckDuckGo / Wikipedia). */

import { looksLikeColorCodeAsk } from '@/lib/colorCodeAsk';
import { detectLayoutReference } from '@/lib/layoutReference';
import { linkLabelMatchesUrl, shopSearchUrlForLabel } from '@/lib/replySanity';

/**
 * Mid-thread side quests: weather, lyrics, sports, news, stocks, etc.
 * These must NOT keep dragging a prior build/plan into the answer.
 */

/** Domains that look like “sources” but are social hangouts / unrelated junk. */
const JUNK_SOURCE_HOSTS = [
  'pairup.chat',
  'pairup.com',
  'omegle.com',
  'chatroulette.com',
  'monkey.app',
  'pinterest.com',
  'pin.it',
  'facebook.com',
  'instagram.com',
  'tiktok.com',
  'reddit.com',
  'quora.com',
  'medium.com',
  'blogspot.com',
  'wordpress.com',
  'wix.com',
  'squarespace.com',
  // Meta “AI book finder” tools — not real titles; they pollute identify answers.
  'whatisthatbook.com',
  'whatbookisthis.com',
  'capitalizemytitle.com',
  'growthsummary.com',
  'bookbrain.ai',
  'bookbrain.com',
  'meetnewbooks.com',
  'sobrief.com',
  'readthistwice.com',
  // Plot-keyword SEO / fanfic / stock-art pages that invent fake titles like “The Friendship Treehouse”.
  'scribd.com',
  'freepik.com',
  'behance.net',
];

/** Hosts that usually mean a real book page (not a plot-guessing gadget). */
const TRUSTED_BOOK_HOSTS = [
  'goodreads.com',
  'openlibrary.org',
  'wikipedia.org',
  'scholastic.com',
  'scholastic.ca',
  'amazon.com',
  'books.apple.com',
  'books.google.com',
  'barnesandnoble.com',
  'penguinrandomhouse.com',
  'harpercollins.com',
  'simonandschuster.com',
  'britannica.com',
];

function isTrustedBookHostUrl(url: string): boolean {
  const host = hostFromUrl(url);
  if (!host) return false;
  return TRUSTED_BOOK_HOSTS.some((h) => host === h || host.endsWith(`.${h}`) || host.includes(h.replace('.com', '')));
}

/** Titles that are finder tools / SEO pages, not novels. */
function looksLikeMetaBookFinderTitle(title: string): boolean {
  const t = String(title || '');
  return /\b(?:find\s+a\s+book|book\s+finder|what\s+(?:is\s+that|book\s+is\s+this)|ai\s+tool|vague\s+description|plot\s+or\s+vague|capitalize\s+my\s+title|bookbrain|forgotten\s+(?:book|title)s?|how\s+to\s+find\s+a\s+book\s+you\s+can'?t|rediscover\s+a\s+forgotten)\b/i.test(t);
}

function hostFromUrl(raw: string): string {
  try {
    return new URL(String(raw || '').trim()).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

export function isJunkWebSourceUrl(url: string): boolean {
  const host = hostFromUrl(url);
  if (!host) return true;
  return JUNK_SOURCE_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

/** Prefer encyclopedic / official hosts when ranking Sources for the model. */
const PREFERRED_SOURCE_HOSTS = [
  'wikipedia.org',
  'wikidata.org',
  'britannica.com',
  'goodreads.com',
  'openlibrary.org',
  'scholastic.com',
  'scholastic.ca',
  'books.apple.com',
  'amazon.com',
  'liquipedia.net',
  'vlr.gg',
  'reuters.com',
  'bbc.com',
  'bbc.co.uk',
  'apnews.com',
  'neuralink.com',
  'tesla.com',
  'spacex.com',
  'apple.com',
  'riotgames.com',
  'github.com',
  'stripe.com',
  'linear.app',
];

function sourceHostRank(url: string): number {
  const host = hostFromUrl(url);
  if (!host) return 99;
  const idx = PREFERRED_SOURCE_HOSTS.findIndex((h) => host === h || host.endsWith(`.${h}`));
  return idx >= 0 ? idx : 50;
}

export function filterWebSources<T extends { title?: string; url?: string }>(sources: T[]): T[] {
  const cleaned = (sources || []).filter((s) => {
    const u = String(s?.url || '').trim();
    if (!/^https?:\/\//i.test(u)) return false;
    if (isJunkWebSourceUrl(u)) return false;
    const blob = `${s?.title || ''} ${u}`.toLowerCase();
    // Phrase-search bleed: pages about asking for “more information”, not the thread topic.
    if (/\b(?:polite ways to request more information|how to say ['"]?more information|request more information professionally|howtosayguide)\b/i.test(blob)) {
      return false;
    }
    return true;
  });
  return cleaned.sort((a, b) => sourceHostRank(String(a.url)) - sourceHostRank(String(b.url)));
}

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
  // Identify a real book/movie from a remembered plot — leave the build thread.
  if (looksLikeIdentifyMediaAsk(t) || looksLikeExplicitResearchAsk(t) || looksLikeBookFindOrBuyAsk(t)) return true;
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
  const identify = looksLikeIdentifyMediaAsk(message)
    || looksLikeExplicitResearchAsk(message)
    || looksLikeRejectedPriorAnswerAsk(message);
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
      ? 'SPORTS/ESPORTS: Use lookup snippets for team names, matchups, form, and tournament context. Give a clear pick or lean when asked who wins, with 1–2 reasons grounded in the notes. Never invent fake roster roles (do not invent “Primary Rifleman” / “Tactical Leader” expansions for org acronyms). Never cite social hangout / chat sites (e.g. PairUp.chat) as prediction sources. Prefer VLR.gg, Liquipedia, or official league pages from Sources. If notes are thin, say so and still answer from what is available.'
      : '',
    identify
      ? 'IDENTIFY BOOK/MOVIE: Use live lookup notes only. Name a title/author only if it appears in the notes. Map the user’s plot points to confirmed facts. Include real Sources links. Never invent alternate titles or claim a search you did not use.'
      : '',
    /\b(?:who|twitch|streamer|brand|company|created|founded)\b/i.test(message) && !identify
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
  // Hex / named color lookups are answered locally — no web needed.
  if (looksLikeColorCodeAsk(t)) return true;
  // Pure creative asks stay local by default (see looksLikeWebGroundedAsk for exceptions).
  if (looksLikeCreativeAsk(t) && !looksLikeDesignReferenceAsk(t)) return true;
  return false;
}

/** Stories, jokes, poems — answer from the model unless the user asked for a real-world reference. */
export function looksLikeCreativeAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  // Identifying a real book/movie from a plot is NOT creative writing.
  if (looksLikeIdentifyMediaAsk(t) || looksLikeExplicitResearchAsk(t)) return false;
  if (/\b(?:tell\s+me\s+a\s+story|write\s+(?:me\s+)?a\s+story|bedtime\s+story)\b/i.test(t)) return true;
  if (/\bstory\s+(?:about|with|that|which)\b/i.test(t) && !/\b(?:book|novel|movie|film)\b/i.test(t)) return true;
  if (/\b(?:thousand|1000|\d{3,4})\s+words?\b/i.test(t) && /\b(?:story|write|essay|fiction)\b/i.test(t)) return true;
  if (/\bwrite\s+(?:me\s+)?(?:a|an|some)\b[\s\S]{0,60}\b(?:story|poem|joke|haiku|riddle|fanfic|fiction|script)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:joke|poem|riddle|haiku|limerick)\b/i.test(t) && !/\b(?:code|file|project|bug)\b/i.test(t)) return true;
  return false;
}

/**
 * User is trying to identify a real book / movie / show from a remembered plot
 * (“what’s the name of this book?”, childhood plot dump, etc.).
 */
export function looksLikeIdentifyMediaAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 16) return false;
  // Already named the work / author and wants discussion — not “what book is this?”
  if (
    /\b(?:let'?s\s+talk|what\s+(?:makes|did\s+you\s+think)|storytelling|no\s+shopping\s+links|stay\s+on\s+this\s+book)\b/i.test(t)
    && /\b(?:by\s+[A-Z][a-z]+|rothfuss|kvothe|harry\s+potter|name\s+of\s+the\s+wind)\b/i.test(t)
  ) {
    return false;
  }
  if (/\b(?:what(?:'s|\s+is)\s+the\s+name\s+of\s+(?:this|the|that)\s+(?:book|novel|movie|film|show|series)|(?:name|title)\s+of\s+(?:this|the|that)\s+(?:book|novel|movie|film)|which\s+(?:book|novel|movie|film)|what\s+book\s+(?:is|was)\s+this|identify\s+(?:this|the)\s+(?:book|novel|movie|film)|what(?:'s|\s+is)\s+(?:this|that)\s+(?:book|novel|movie|film)\s+called)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:actual|real)\s+(?:book|novel|movie|film)\b/i.test(t)
    && /\b(?:name|title|called|remember|know)\b/i.test(t)) {
    return true;
  }
  // “don’t/can't/cannot remember the title/name” + book
  if (/\b(?:book|novel|movie|film)\b/i.test(t)
    && /\b(?:don'?t|do\s+not|can'?t|cannot|couldn'?t)\s+remember\b/i.test(t)) {
    return true;
  }
  if (/\b(?:book|novel|movie|film)\b/i.test(t)
    && /\b(?:don'?t\s+know\s+(?:the\s+)?(?:name|title)|can'?t\s+remember\s+(?:the\s+)?(?:name|title)|tell\s+me\s+the\s+(?:name|title)|what(?:'s|\s+is)\s+(?:the\s+)?(?:name|title)|trying\s+to\s+remember)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:from\s+my\s+childhood|when\s+i\s+was\s+younger|read\s+(?:as\s+a\s+(?:kid|child)|growing\s+up)|help\s+me\s+find\s+(?:the\s+)?(?:book|novel|movie|title)|what(?:'s|\s+that)\s+book)\b/i.test(t)) {
    return true;
  }
  // “figure out / know what book”, “sound familiar”, “what book am I talking about”
  if (/\b(?:figure\s+out\s+what\s+book|know\s+what\s+book|what\s+book\s+(?:i'?m|am\s+i|could\s+this|is\s+this)|book\s+i'?m\s+(?:talking\s+about|thinking\s+of)|does\s+that\s+sound\s+familiar)\b/i.test(t)) {
    return true;
  }
  // Long plot dump that clearly asks for a real book/movie title.
  // Do NOT treat “The Name of the Wind … Stay on this book” as identify — “name” is in the title.
  if (
    t.length >= 100
    && /\b(?:book|novel|movie|film)\b/i.test(t)
    && /\b(?:title|called|remember|author|familiar|talking\s+about|thinking\s+of)\b/i.test(t)
    && !/\b(?:let'?s\s+talk|what\s+makes|storytelling|no\s+shopping)\b/i.test(t)
    && !/\bthe\s+name\s+of\s+the\s+wind\b/i.test(t)
  ) {
    return true;
  }
  // Plot-heavy “what’s that book” without the word title (maze / treehouse / garden dumps).
  if (
    t.length >= 80
    && /\b(?:book|novel)\b/i.test(t)
    && /\b(?:maze|treehouse|garden|outsider|friendship|plane\s+crash|wilderness|hatchet|glade|wall|fence)\b/i.test(t)
  ) {
    return true;
  }
  return false;
}

/** Honest reply when identify research did not produce a trusted catalog match. */
export function identifyResearchFailedReply(userMessage?: string): string {
  const ask = String(userMessage || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  return [
    'I researched that plot online, but I could not confirm a single trusted title from live catalog sources (Goodreads / Wikipedia / Open Library / Amazon).',
    '',
    'I will not invent a book name. Add one more distinctive detail — a character name, place, object, or how it ends — and I will dig again.',
    ask ? `\n(Your ask so far: “${ask}${ask.length >= 120 ? '…' : ''}”)` : '',
  ].filter(Boolean).join('\n');
}

/** Explicit request to research / dig on the web. */
export function looksLikeExplicitResearchAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  return /\b(?:deep\s+research|do\s+(?:some\s+)?(?:deep\s+)?research|research\s+(?:this|that|it|please|deeper)|dig\s+(?:deep|deeper)|look\s+(?:this|it|that)\s+up|search\s+(?:the\s+)?(?:web|internet|online)|google\s+(?:it|this|that)|find\s+(?:it|this|that|out)\s+(?:online|on\s+the\s+web)|go\s+(?:look|search|find)\b)/i.test(t);
}

/** User rejected the prior guess (“nope”, “wrong book”, “not the name”). */
export function looksLikeRejectedPriorAnswerAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 4) return false;
  if (!/\b(?:nope|nah|wrong|incorrect|not\s+(?:the|that|it)|that(?:'s|\s+is)\s+not|try\s+again|guess\s+again|looked\s+it\s+up)\b/i.test(t)) {
    return false;
  }
  return /\b(?:book|name|title|movie|film|novel|answer|research|search)\b/i.test(t) || t.length < 220;
}

/**
 * High-signal plot fingerprints → catalog title/author strings to SEARCH
 * (not to return as answers). Live trusted hosts must still confirm the hit.
 * Without these, DDG keyword soup often returns SEO junk or empty pages.
 */
export function identifyPlotSearchHints(text: string): string[] {
  const t = String(text || '');
  const out: string[] = [];
  const push = (s: string) => {
    const clean = s.replace(/\s+/g, ' ').trim();
    if (!clean || out.some((x) => x.toLowerCase() === clean.toLowerCase())) return;
    out.push(clean);
  };

  // Bridge to Terabithia — treehouse / friendship / outsider / art / sad ending
  if (
    /\b(?:treehouse|tree\s*house)\b/i.test(t)
    && /\b(?:friend(?:ship)?|outsider|drawing|art|midwest|small\s+town)\b/i.test(t)
  ) {
    push('Bridge to Terabithia Katherine Paterson');
  }
  if (
    /\b(?:friend(?:ship)?|outsider)\b/i.test(t)
    && /\b(?:drawing|art)\b/i.test(t)
    && /\b(?:sad|lose|losing|died|death|pass(?:ed)?\s+away)\b/i.test(t)
    && /\b(?:book|novel|kid|school|younger)\b/i.test(t)
  ) {
    push('Bridge to Terabithia Katherine Paterson');
  }

  // The Maze Runner — wall/fence, boys, maze, monsters, escape, no memory
  if (
    /\bmaze\b/i.test(t)
    && /\b(?:wall|fence|glade|monster|creature|boys?|escape|memory|memories)\b/i.test(t)
  ) {
    push('The Maze Runner James Dashner');
  }

  // The Secret Garden — garden + uncle/manor + sick/weak + girl helper
  if (
    /\b(?:secret\s+garden|abandoned\s+garden|hidden\s+garden)\b/i.test(t)
    || (
      /\bgarden\b/i.test(t)
      && /\b(?:uncle|manor|cousin|orphan|sick|weak|invalid|mary|colin)\b/i.test(t)
    )
  ) {
    push('The Secret Garden Frances Hodgson Burnett');
  }

  // Hatchet — plane crash + axe/hatchet + wilderness survival
  if (
    /\b(?:plane|crash)\b/i.test(t)
    && /\b(?:axe|hatchet|wilderness|survive|survival|shelter)\b/i.test(t)
  ) {
    push('Hatchet Gary Paulsen');
  }

  // Holes — camp / digging holes / desert / curse
  if (
    /\b(?:dig(?:ging)?\s+holes|camp\s+green\s+lake|holes\b.*\bcamp|\bcamp\b.*\bholes)\b/i.test(t)
    || (
      /\bdig(?:ging)?\b/i.test(t)
      && /\b(?:desert|curse|boys?)\b/i.test(t)
      && /\b(?:hole|holes|camp|dirt)\b/i.test(t)
    )
  ) {
    push('Holes Louis Sachar');
  }

  // The Honest Truth — sick boy, dog, grandfather, mountain
  if (
    /\b(?:hospital|sick|ill)\b/i.test(t)
    && /\bdog\b/i.test(t)
    && /\b(?:mountain|climb|climber)\b/i.test(t)
    && /\b(?:grandfather|grandpa|family|boy)\b/i.test(t)
  ) {
    push('The Honest Truth Dan Gemeinhart');
  }

  return out.slice(0, 3);
}

/** Catalog search URLs so Sources is never an empty Goodreads/Amazon/Wikipedia shell. */
export function catalogLookupUrlsForTitle(title: string, author?: string): { title: string; url: string }[] {
  const t = canonicalizeBookDisplayTitle(title);
  if (!t || t.length < 2) return [];
  const q = encodeURIComponent(author ? `${t} ${author}` : t);
  // Wikipedia search (not a raw slug) — avoids wrong pages and parenthesis URL glitches.
  return [
    { title: `${t} · Goodreads`, url: `https://www.goodreads.com/search?q=${q}` },
    { title: `${t} · Amazon`, url: `https://www.amazon.com/s?k=${encodeURIComponent(`${t} book`)}` },
    { title: `${t} · Wikipedia`, url: `https://en.wikipedia.org/w/index.php?search=${q}` },
    { title: `${t} · Open Library`, url: `https://openlibrary.org/search?q=${q}` },
  ];
}

/** Prefer the novel title (“Holes”) over shelf/series labels (“Holes Series”). */
export function canonicalizeBookDisplayTitle(title: string): string {
  return String(title || '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s+Book\s+Series\s*$/i, '')
    .replace(/\s+Series\s*$/i, '')
    .replace(/\s*\((?:novel\s+series|book\s+series|novel|book|film|movie|series)\)\s*$/i, '')
    .replace(/\s*#\d+\s*$/i, '')
    .trim();
}

/**
 * Compress a long plot dump into a search-friendly keyword query.
 * Keeps distinctive nouns; drops filler so DuckDuckGo can match real titles.
 * High-signal plot tokens are front-loaded; meta “AI book finder” sites are excluded.
 */
export function compressIdentifySearchQuery(text: string): string {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw) return '';
  const media = /\b(?:movie|film|show|series)\b/i.test(raw) && !/\b(?:book|novel)\b/i.test(raw)
    ? 'movie'
    : 'book';
  const stop = new Set([
    'that', 'this', 'with', 'from', 'have', 'has', 'had', 'were', 'was', 'are', 'the',
    'and', 'but', 'for', 'you', 'your', 'just', 'know', 'dont', "don't", 'didnt', "didn't",
    'could', 'would', 'please', 'tell', 'name', 'title', 'actual', 'real', 'about', 'there',
    'their', 'they', 'them', 'then', 'than', 'when', 'what', 'whats', "what's", 'which',
    'where', 'into', 'onto', 'also', 'very', 'some', 'come', 'came', 'goes', 'went',
    'like', 'want', 'need', 'help', 'make', 'made', 'been', 'being', 'only', 'over',
    'now', 'here', 'back', 'well', 'even', 'still', 'something', 'someone', 'because',
    'who', 'whom', 'whose', 'away', 'little', 'specific', 'wanted', 'passed', 'reaches',
    'brings', 'find', 'goes', 'theres', "there's", 'named', 'else', 'looked', 'read',
    'younger', 'travels', 'before', 'after', 'learns', 'learning', 'spends', 'spend',
    'alone', 'left', 'given', 'gift', 'tool', 'maybe', 'possibly', 'area', 'long',
    'time', 'does', 'getting', 'gets', 'ends', 'ended', 'okay', 'remember', 'trying',
    'figure', 'sound', 'familiar', 'another', 'kinda', 'kind', 'really', 'vaguely',
  ]);
  // Distinctive plot tokens across survival / friendship / fantasy / garden stories.
  const boostRe =
    /\b(?:plane|crash(?:es|ed)?|pilot|axe|hatchet|wilderness|shelter|fish(?:ing)?|lake|storm|tornado|rescue(?:d|s)?|survival|survive[sd]?|moose|porcupine|canadian|canada|island|raft|fire|camp|animal|attack(?:ed)?|mother|mom|treehouse|friendship|outsider|midwest|school|drawing|art|maze|glade|monster|wall|fence|garden|secret|uncle|manor|orphan|bridge|terabithia|holes|camp)\b/gi;
  const boosted: string[] = [];
  let bm: RegExpExecArray | null;
  while ((bm = boostRe.exec(raw)) !== null) {
    const low = bm[0].toLowerCase();
    if (!boosted.includes(low)) boosted.push(low);
  }
  const words = raw.match(/[A-Za-z']{3,}/g) || [];
  const kept: string[] = [...boosted];
  for (const w of words) {
    const low = w.toLowerCase();
    if (stop.has(low)) continue;
    if (/^(?:book|novel|movie|film|story)$/i.test(low)) continue;
    if (kept.includes(low)) continue;
    kept.push(low);
    if (kept.length >= 18) break;
  }
  const kidCue = /\b(?:boy|girl|kid|child|hospital|school|grandpa|grandfather|grandma|young(?:er)?)\b/i.test(raw);
  const head = kidCue && media === 'book' ? 'children novel' : `${media} novel`;
  const survivalCue = /\b(?:axe|hatchet|plane|crash)\b/i.test(raw) && /\b(?:wilderness|shelter|survive|survival|alone)\b/i.test(raw)
    ? 'survival'
    : '';
  // Push DDG away from meta “AI find-a-book” gadgets toward real catalog pages.
  const exclusions = '-site:whatisthatbook.com -site:whatbookisthis.com -site:capitalizemytitle.com -"AI book finder" -"find a book by plot"';
  // Prefer known fingerprint titles first — keyword-only soup often returns junk or empty DDG pages.
  const hints = identifyPlotSearchHints(raw);
  const hintHead = hints.length ? `${hints[0]} ` : '';
  return `${hintHead}${head} ${survivalCue} ${kept.join(' ')} ${exclusions}`.replace(/\s+/g, ' ').trim().slice(0, 280);
}

export type BookIdentifyCandidate = {
  title: string;
  author?: string;
  score: number;
  urls: string[];
};

function normalizeBookTitleKey(title: string): string {
  return String(title || '')
    .toLowerCase()
    .replace(/\b(?:novel|book|paperback|hardcover|scholastic|gold|edition|series)\b/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlausibleBookTitle(title: string): boolean {
  const t = String(title || '').trim();
  if (t.length < 2 || t.length > 70) return false;
  if (looksLikeMetaBookFinderTitle(t)) return false;
  if (/^(?:amazon\.com|books?|find|what|home|search|free|how|best|top)\b/i.test(t)) return false;
  if (/\b(?:http|www\.|\.com|\.org)\b/i.test(t)) return false;
  if (/[:|]/.test(t) && !/\bby\b/i.test(t)) return false;
  // Too many filler words → almost never a real title.
  const words = t.split(/\s+/);
  if (words.length > 8) return false;
  return true;
}

/** Pull likely title/author pairs from live search titles + snippets. */
export function extractBookCandidatesFromLookup(hit: {
  text?: string;
  sources?: { title?: string; url?: string }[];
}): BookIdentifyCandidate[] {
  const rows: { title: string; author?: string; url?: string; trusted: boolean }[] = [];
  const push = (title: string, author?: string, url?: string) => {
    let t = String(title || '').replace(/\s+/g, ' ').trim();
    t = t
      .replace(/\s*[|—–-]\s*(?:Goodreads|Wikipedia|Open Library|Amazon\.com?|Google Books|LibraryThing|Scholastic|Apple Books|Barnes\s*&\s*Noble).*$/i, '')
      .replace(/\s*\((?:novel|book|Brian'?s Saga[^)]*|#[\d]+)\)\s*/gi, ' ')
      .replace(/\s+Book\s+Series\s*$/i, '')
      .replace(/\s+Series\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    // “Title by Author” stuck in title field after partial strip.
    const bySplit = t.match(/^(.+?)\s+by\s+(.+)$/i);
    if (bySplit && !author) {
      t = bySplit[1].trim();
      author = bySplit[2].trim();
    }
    if (!isPlausibleBookTitle(t)) return;
    if (url && (isJunkWebSourceUrl(url) || looksLikeMetaBookFinderTitle(`${t} ${url}`))) return;
    rows.push({
      title: t,
      author: author ? String(author).replace(/\s+/g, ' ').trim() : undefined,
      url: url && /^https?:\/\//i.test(url) ? url : undefined,
      trusted: Boolean(url && isTrustedBookHostUrl(url)),
    });
  };

  for (const s of hit.sources || []) {
    const rawTitle = String(s.title || '').replace(/&#x27;/gi, "'").replace(/&quot;/gi, '"').replace(/&amp;/gi, '&');
    const url = String(s.url || '').trim();
    if (url && isJunkWebSourceUrl(url)) continue;
    if (looksLikeMetaBookFinderTitle(rawTitle)) continue;

    let m = rawTitle.match(/^(.+?)\s+by\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){0,4})\b/i);
    if (m) {
      push(m[1], m[2], url);
      continue;
    }
    m = rawTitle.match(/^(.+?)\s*[-–—:]\s*([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){0,3})\s*$/);
    if (m && !/goodreads|wikipedia|amazon|open library|google|barnes/i.test(m[2])) {
      push(m[1], m[2], url);
      continue;
    }
    m = rawTitle.match(/^Amazon\.com:\s*(.+?):\s*\d+:\s*([^:]+?):\s*Books/i);
    if (m) {
      const author = m[2].includes(',')
        ? m[2].split(',').map((p) => p.trim()).reverse().join(' ')
        : m[2].trim();
      push(m[1], author, url);
      continue;
    }
    m = rawTitle.match(/^(.+?)\s*\((?:novel|book)\)\s*[-–—]/i);
    if (m) {
      push(m[1], undefined, url);
      continue;
    }
    // Bare catalog pages only (never SEO finder tools).
    if (url && isTrustedBookHostUrl(url)) {
      const bare = rawTitle
        .replace(/\s*[|—–-]\s*(?:Goodreads|Open Library|Scholastic|Google Books|Apple Books|Wikipedia|Amazon\.com?).*$/i, '')
        .replace(/\s+by\s+.+$/i, '')
        .trim();
      if (bare && bare.length < 60) push(bare, undefined, url);
    }
  }

  for (const line of String(hit.text || '').split('\n')) {
    const clean = line.replace(/^\s*[-•]\s*/, '').replace(/\s*\(https?:\/\/[^)]+\)\s*/g, '').trim();
    if (looksLikeMetaBookFinderTitle(clean)) continue;
    const m = clean.match(/\b([A-Z][\w''\-]+(?:\s+[A-Z][\w''\-]+){0,5})\s+by\s+([A-Z][\w.'’-]+(?:\s+[A-Z][\w.'’-]+){0,4})\b/);
    if (m) push(m[1], m[2]);
  }

  const map = new Map<string, BookIdentifyCandidate & { trustedHits: number }>();
  for (const row of rows) {
    const key = normalizeBookTitleKey(row.title);
    if (!key || key.length < 2) continue;
    const cur = map.get(key) || {
      title: row.title,
      author: row.author,
      score: 0,
      urls: [] as string[],
      trustedHits: 0,
    };
    cur.score += 1;
    if (row.trusted) cur.trustedHits += 1;
    if (row.author && (!cur.author || row.author.length > cur.author.length)) cur.author = row.author;
    if (row.url && !cur.urls.includes(row.url)) cur.urls.push(row.url);
    if (row.title.length > cur.title.length && isPlausibleBookTitle(row.title)) cur.title = row.title;
    map.set(key, cur);
  }

  return [...map.values()]
    .map((c) => ({
      title: canonicalizeBookDisplayTitle(c.title),
      author: c.author,
      urls: c.urls.filter((u) => !isJunkWebSourceUrl(u)),
      // Require trusted catalog hits to outrank SEO junk; prefer the novel over “X Series”.
      score: c.score
        + (c.author ? 2 : 0)
        + (c.trustedHits * 3)
        + Math.min(2, c.urls.filter((u) => isTrustedBookHostUrl(u)).length)
        + (/series$/i.test(c.title) ? -2 : 0)
        + (c.urls.some((u) => /wikipedia\.org\/wiki\//i.test(u) && !/series/i.test(u)) ? 2 : 0),
    }))
    .filter((c) => isPlausibleBookTitle(c.title) && !looksLikeMetaBookFinderTitle(c.title))
    .sort((a, b) => b.score - a.score || a.title.length - b.title.length || b.urls.length - a.urls.length);
}

export function pickBestBookCandidateFromLookup(hit: {
  text?: string;
  sources?: { title?: string; url?: string }[];
}): BookIdentifyCandidate | null {
  const list = extractBookCandidatesFromLookup(hit);
  if (!list.length) return null;
  const best = list[0];
  if (looksLikeMetaBookFinderTitle(best.title)) return null;
  const trustedUrls = best.urls.filter((u) => isTrustedBookHostUrl(u));
  // Only override the model when a real catalog host backs the title.
  if (trustedUrls.length < 1) return null;
  if (best.score < 3 && trustedUrls.length < 2) return null;
  return { ...best, urls: trustedUrls.length ? trustedUrls : best.urls };
}

/** Short neutral bridge — never invent plot beats from another book. */
function identifyPlotBridge(userMessage: string): string {
  const t = String(userMessage || '');
  const bits: string[] = [];
  if (/\b(?:plane|crash|axe|hatchet|wilderness)\b/i.test(t)) bits.push('wilderness survival');
  if (/\b(?:treehouse|friendship|outsider|drawing|art)\b/i.test(t)) bits.push('a close childhood friendship');
  if (/\b(?:maze|glade|wall|fence|monster)\b/i.test(t)) bits.push('a maze / confined group');
  if (/\b(?:garden|secret\s+garden|uncle|manor)\b/i.test(t)) bits.push('a hidden garden');
  if (/\b(?:midwest|small\s+town|school)\b/i.test(t)) bits.push('a small-town school setting');
  if (/\b(?:dig(?:ging)?|holes?|desert|curse|camp)\b/i.test(t)) bits.push('a desert camp and forced digging');
  if (/\b(?:hospital|sick|dog|mountain|grandfather|grandpa)\b/i.test(t)) bits.push('a sick boy, a dog, and a mountain');
  if (!bits.length) return 'Your remembered details line up with how this book is described on those pages.';
  return `Your details (${bits.slice(0, 3).join(', ')}) line up with how this book is described online.`;
}

/** Map the user’s plot points onto confirmed match bullets (grounded in their words). */
function identifyWhyItMatches(userMessage: string): string[] {
  const t = String(userMessage || '');
  const bullets: string[] = [];
  const push = (s: string) => {
    if (!bullets.includes(s)) bullets.push(s);
  };
  if (/\bdig(?:ging)?\b/i.test(t) && /\bholes?\b/i.test(t)) {
    push('Boys at a remote camp are forced to dig holes every day');
  }
  if (/\bcharacter\b/i.test(t) && /\bdig/i.test(t)) {
    push('Staff say the digging builds “character,” but there’s another reason behind it');
  }
  if (/\b(?:desert|dirt|middle\s+of\s+nowhere|nowhere)\b/i.test(t)) {
    push('The setting is a barren desert / dirt landscape far from town');
  }
  if (/\b(?:didn'?t\s+do|did\s+not\s+do|trouble|sent|wrongly|innocent)\b/i.test(t)) {
    push('The main character is sent there after getting in trouble for something he says he didn’t do');
  }
  if (/\b(?:curse|family\s+story|past\s+and\s+(?:the\s+)?present|switches?\s+between|timeline)\b/i.test(t)) {
    push('A family curse / older storyline weaves with what happens in the present');
  }
  if (/\b(?:buried|treasure|something\s+important)\b/i.test(t)) {
    push('Something important is buried out in the desert');
  }
  if (/\b(?:friend|friends|other\s+boys)\b/i.test(t)) {
    push('He befriends other boys at the camp while figuring out what’s really going on');
  }
  if (/\b(?:treehouse|friendship|outsider|drawing|art)\b/i.test(t)) {
    push('An outsider kid forms an unusual, close friendship (art / a special hideaway)');
  }
  if (/\b(?:maze|wall|fence|glade|monster)\b/i.test(t)) {
    push('Boys trapped behind a wall/fence with a deadly changing maze outside');
  }
  if (/\b(?:garden|uncle|manor|sick|weak)\b/i.test(t)) {
    push('A hidden/abandoned garden, an old house, and healing through bringing it back to life');
  }
  if (/\b(?:plane|crash|axe|hatchet|wilderness)\b/i.test(t)) {
    push('A plane crash and wilderness survival with a hatchet / axe');
  }
  if (/\b(?:hospital|sick|ill)\b/i.test(t) && /\bdog\b/i.test(t) && /\b(?:mountain|climb)/i.test(t)) {
    push('A sick boy leaves the hospital with his dog to climb a mountain tied to his grandfather');
  }
  if (/\b(?:steal|stealing|food|restaurant)\b/i.test(t) && /\b(?:mountain|climb|dog)\b/i.test(t)) {
    push('He gets in trouble along the way (food / running away) before reaching the mountain');
  }
  if (/\b(?:pass(?:ed)?\s+out|collapse|dog\s+(?:finds?|gets?|brings?)\s+help)\b/i.test(t)) {
    push('He collapses near the top and the dog goes for help');
  }
  return bullets.slice(0, 6);
}

/** Pull a short blurb from live Wikipedia / snippet lines for the confirmed title. */
function extractBookBlurbFromLookup(
  hit: { text?: string; sources?: { title?: string; url?: string }[] },
  title: string,
): string | null {
  const key = normalizeBookTitleKey(title);
  if (!key) return null;
  const text = String(hit.text || '');
  const wikiLine = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => /wikipedia/i.test(l) && normalizeBookTitleKey(l).includes(key) && /:\s*\S/.test(l));
  if (wikiLine) {
    const blurb = wikiLine.replace(/^.*?Wikipedia[^\n:]*:\s*/i, '').replace(/\s*\(https?:\/\/[^)]+\)\s*/g, '').trim();
    if (blurb.length >= 60) return blurb.slice(0, 480).replace(/\s+\S*$/, '') + (blurb.length > 480 ? '…' : '');
  }
  // Any Wikipedia · Title: extract line even if title wording differs slightly.
  const anyWiki = text.match(/Wikipedia\s*[·•|\-–—]\s*[^\n:]{2,60}:\s*([^\n]{60,500})/i);
  if (anyWiki?.[1]) {
    const blurb = anyWiki[1].replace(/\s*\(https?:\/\/[^)]+\)\s*/g, '').trim();
    if (blurb.length >= 60) return blurb.slice(0, 480).replace(/\s+\S*$/, '') + (blurb.length > 480 ? '…' : '');
  }
  // Fallback: longest trusted snippet mentioning the title.
  let best = '';
  for (const line of text.split('\n')) {
    const clean = line.replace(/^\s*[-•]\s*/, '').replace(/\s*\(https?:\/\/[^)]+\)\s*/g, '').trim();
    if (clean.length < 70 || clean.length > 420) continue;
    if (!normalizeBookTitleKey(clean).includes(key) && !new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(clean)) {
      continue;
    }
    if (clean.length > best.length) best = clean;
  }
  return best || null;
}

/** Prefer a direct Wikipedia article URL over a search page when live results include one. */
function preferDirectCatalogUrl(
  sources: { title?: string; url?: string }[],
  kind: 'wikipedia' | 'goodreads' | 'amazon' | 'openlibrary',
  title: string,
): string | null {
  const key = normalizeBookTitleKey(title);
  const scored = sources
    .filter((s) => s.url && /^https?:\/\//i.test(s.url))
    .map((s) => {
      const u = String(s.url);
      const t = String(s.title || '');
      let score = 0;
      if (kind === 'wikipedia' && /wikipedia\.org\/wiki\//i.test(u) && !/\/wiki\/Special:/i.test(u)) score += 5;
      if (kind === 'goodreads' && /goodreads\.com\/book\//i.test(u)) score += 5;
      if (kind === 'amazon' && /amazon\.com\/.+\/dp\//i.test(u)) score += 5;
      if (kind === 'openlibrary' && /openlibrary\.org\/(works|books)\//i.test(u)) score += 5;
      if (kind === 'wikipedia' && /wikipedia\.org/i.test(u)) score += 1;
      if (kind === 'goodreads' && /goodreads\.com/i.test(u)) score += 1;
      if (kind === 'amazon' && /amazon\.com/i.test(u)) score += 1;
      if (kind === 'openlibrary' && /openlibrary\.org/i.test(u)) score += 1;
      if (normalizeBookTitleKey(t).includes(key) || normalizeBookTitleKey(u).includes(key)) score += 2;
      if (/series/i.test(t) || /shelf\/show/i.test(u)) score -= 3;
      return { url: u, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.url || null;
}

/** Deterministic identify reply grounded in live search (local models often ignore notes). */
export function identifyAnswerFromLookup(
  userMessage: string,
  hit: { text?: string; sources?: { title?: string; url?: string }[] },
  candidate?: BookIdentifyCandidate | null,
): string {
  const best = candidate || pickBestBookCandidateFromLookup(hit);
  const sources = filterWebSources(hit.sources || [])
    .filter((s) => s.url && isTrustedBookHostUrl(s.url) && !looksLikeMetaBookFinderTitle(String(s.title || '')))
    .slice(0, 8);
  if (!best) {
    return [
      'I researched that plot online, but the live results did not agree on one clear title yet.',
      '',
      'Add one more distinctive detail (a character name, place, object, or how it ends) and I will dig again.',
    ].join('\n');
  }

  const displayTitle = canonicalizeBookDisplayTitle(best.title);
  const blurb = extractBookBlurbFromLookup(hit, displayTitle);
  const why = identifyWhyItMatches(userMessage);

  // Prefer live catalog hits; fill gaps with searchable catalog URLs for the confirmed title.
  const catalog = catalogLookupUrlsForTitle(displayTitle, best.author);
  const pickUrl = (kind: 'wikipedia' | 'goodreads' | 'amazon' | 'openlibrary', fallbackHint: RegExp) => {
    const direct = preferDirectCatalogUrl(sources, kind, displayTitle);
    if (direct) return direct;
    const fromSources = sources.find((x) => fallbackHint.test(`${x.title || ''} ${x.url || ''}`))?.url;
    if (fromSources) return fromSources;
    return catalog.find((c) => fallbackHint.test(`${c.title} ${c.url}`))?.url || null;
  };

  const linkLines: string[] = [];
  const addLink = (label: string, url: string | null | undefined) => {
    if (!url || linkLines.some((l) => l.includes(url))) return;
    linkLines.push(`- **${label}:** [${displayTitle}](${url})`);
  };
  addLink('Goodreads', pickUrl('goodreads', /goodreads/i));
  addLink('Amazon', pickUrl('amazon', /amazon\.com/i));
  addLink('Wikipedia', pickUrl('wikipedia', /wikipedia/i));
  addLink('Open Library', pickUrl('openlibrary', /openlibrary|open.?library/i));

  return [
    `That matches **${displayTitle}**${best.author ? ` by **${best.author}**` : ''}.`,
    '',
    ...(why.length
      ? ['**Why this fits what you remembered**', ...why.map((b) => `- ${b}`), '']
      : [identifyPlotBridge(userMessage), '']),
    ...(blurb
      ? ['**About the book**', blurb, '']
      : []),
    '**Where to look it up**',
    ...(linkLines.length ? linkLines : ['- (Search returned a title match, but no reachable store/wiki links this time.)']),
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');
}

/** Build a store/library link list when the user asked where to find / read a book. */
export function bookFindAnswerFromLookup(
  userMessage: string,
  hit: { text?: string; sources?: { title?: string; url?: string }[] },
): string {
  const sources = filterWebSources(hit.sources || [])
    .filter((s) => s.url && !isJunkWebSourceUrl(s.url) && !looksLikeMetaBookFinderTitle(String(s.title || '')))
    .slice(0, 8);
  const pick = (hint: RegExp) => sources.find((s) => hint.test(`${s.title || ''} ${s.url || ''}`));
  const lines: string[] = [];
  const used = new Set<string>();
  const add = (label: string, hint: RegExp) => {
    const s = pick(hint);
    if (!s?.url || used.has(s.url)) return;
    used.add(s.url);
    lines.push(`- **${label}:** [${s.title || label}](${s.url})`);
  };
  add('Amazon', /amazon\.com/i);
  add('Barnes & Noble', /barnesandnoble|barnes\s*&\s*noble/i);
  add('Google Books', /books\.google|google\.com\/books/i);
  add('Open Library', /openlibrary|open.?library/i);
  add('Goodreads', /goodreads/i);
  add('Audible', /audible\.com/i);
  add('Wikipedia', /wikipedia/i);
  for (const s of sources) {
    if (lines.length >= 5) break;
    if (!s.url || used.has(s.url)) continue;
    if (!isTrustedBookHostUrl(s.url) && !/kindle|libby|overdrive|hoopla|audible/i.test(s.url)) continue;
    used.add(s.url);
    lines.push(`- [${s.title || 'Source'}](${s.url})`);
  }
  const ask = String(userMessage || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (!lines.length) {
    return [
      `I researched where to get that${ask ? ` (“${ask}”)` : ''}, but live results did not return reachable store links this time.`,
      '',
      'Try Amazon, Barnes & Noble, your library app (Libby / Hoopla), or Kindle — or ask again with the exact title.',
    ].join('\n');
  }
  return [
    'Here are live links from the research:',
    '',
    ...lines,
    '',
    'Availability and free full-text access vary by title and region — use the store or library page for the legal copy.',
  ].join('\n');
}

/** True when the assistant named a title that does not appear in live lookup hits. */
export function identifyReplyConflictsWithLookup(
  reply: string,
  hit: { text?: string; sources?: { title?: string; url?: string }[] },
): boolean {
  const best = pickBestBookCandidateFromLookup(hit);
  if (!best) return false;
  const t = String(reply || '');
  const bestKey = normalizeBookTitleKey(best.title);
  if (!bestKey) return false;
  // Model already said the consensus title — keep its prose.
  if (normalizeBookTitleKey(t).includes(bestKey) || new RegExp(best.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(t)) {
    return false;
  }
  // Look for “**Title** by **Author**” / “titled X” style claims that disagree.
  const claim = t.match(/\b(?:book|novel|title)\s+(?:is|called|titled)?\s*\*{0,2}([A-Z][^.*\n]{2,60}?)\*{0,2}(?:\s+by\s+\*{0,2}([A-Z][^.*\n]{2,40}?)\*{0,2})?/i)
    || t.match(/\*{0,2}([A-Z][^.*\n]{2,50}?)\*{0,2}\s+by\s+\*{0,2}([A-Z][^.*\n]{2,40}?)\*{0,2}/);
  if (!claim) {
    // Strong consensus online + reply never mentions it → treat as conflict.
    return best.score >= 4;
  }
  const claimedKey = normalizeBookTitleKey(claim[1] || '');
  if (!claimedKey) return best.score >= 4;
  if (claimedKey === bestKey || bestKey.includes(claimedKey) || claimedKey.includes(bestKey)) return false;
  // Claimed title also appears in lookup → soft conflict only.
  const alts = extractBookCandidatesFromLookup(hit);
  if (alts.some((c) => normalizeBookTitleKey(c.title) === claimedKey && c.score >= 2)) return false;
  return true;
}

/**
 * Build / UI asks that need a live look at a real site or brand pattern
 * (“make it like apple.com”, “inspired by Linear”, pasted https://…).
 */
export function looksLikeDesignReferenceAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 8) return false;
  try {
    if (detectLayoutReference(t).wantsInspiration) return true;
  } catch { /* keep scanning */ }
  if (/\bhttps?:\/\/[^\s)\]}'"]+/i.test(t)
    && /\b(?:look|ui|layout|design|style|feel|vibe|homepage|landing|reference|inspired|clone|replica)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:look(?:s|ing)?\s+like|inspired\s+by|based\s+(?:on|off)|as\s+(?:a\s+)?(?:layout\s+)?reference|layout\s+(?:like|from)|ui\s+(?:like|from)|style\s+(?:of|like)|feel\s+like)\b/i.test(t)
    && (/\b\w+\.(?:com|io|app|dev|co|design)\b/i.test(t)
      || /\b(?:apple|discord|stripe|linear|notion|figma|spotify|netflix|airbnb|github)\b/i.test(t))) {
    return true;
  }
  return false;
}

/** User wants a deep / exhaustive profile — not a tight Quick facts card. */
export function looksLikeComprehensiveAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t) return false;
  if (looksLikeExplicitResearchAsk(t)) return true;
  if (/\b(?:everything|every\s+thing|all\s+(?:you\s+)?(?:know|got|have)|give\s+me\s+(?:all|everything)|full\s+(?:bio|biography|profile|rundown|breakdown)|comprehensive|in[- ]depth|as\s+much\s+as\s+you\s+can|tell\s+me\s+all)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:who\s+is|tell\s+me\s+about|what\s+do\s+you\s+know\s+about)\b/i.test(t)
    && /\b(?:everything|all|every|detail|details|know)\b/i.test(t)) {
    return true;
  }
  return false;
}

/** User wants store / library / online-read links for a known book or series. */
export function looksLikeBookFindOrBuyAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 8) return false;
  const bookish = /\b(?:book|books|novel|novels|series|trilogy|hunger\s+games|harry\s+potter|narnia|percy\s+jackson)\b/i.test(t);
  if (!bookish && !/\b(?:kindle|audiobook|paperback|hardcover|ebook)\b/i.test(t)) return false;
  if (/\b(?:where\s+(?:can|do)\s+i\s+(?:find|buy|get|read|download)|give\s+me\s+(?:a\s+)?links?|links?\s+so\s+i\s+can|read\s+them\s+online|buy\s+(?:them|it|the\s+books?)|purchase|order\s+(?:them|it)|barnes\s*&\s*noble|amazon\s+link)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:list|name)\b[\s\S]{0,40}\b(?:books?|series)\b/i.test(t)
    && /\b(?:where|find|buy|get|link|online|store)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Bare “more info / tell me more / give me more info” with no new subject in this message.
 * These are thread expands — never search the literal phrase “more information”.
 */
export function looksLikeBareExpandAsk(text: string): boolean {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (!raw || raw.length > 120) return false;
  // Has an explicit new subject after on/about → not bare.
  if (/\b(?:more\s+(?:info|information|details?)|tell\s+me\s+more)\s+(?:on|about)\s+(?!that\b|this\b|it\b)\S+/i.test(raw)) {
    return false;
  }
  if (/\b(?:who\s+(?:is|are)|what\s+is|net\s*worth|look\s+up|search\s+the\s+web)\b/i.test(raw)
    && !/^(?:can|could|would|please|hey|ok|okay|so)\b/i.test(raw)) {
    // Allow "who is" only if it's the whole ask with a name — those aren't bare expand.
    if (/\bwho\s+(?:is|are)\s+\S+/i.test(raw)) return false;
  }
  const core = raw
    .replace(/^(?:hey|hi|ok|okay|so|please|um+|uh+)\s*,?\s*/i, '')
    .replace(/^(?:can|could|would)\s+you\s+(?:please\s+)?/i, '')
    .replace(/^(?:give|gave|gimme|show|tell)\s+(?:me\s+)?/i, '')
    .replace(/[.!?]+$/g, '')
    .trim();
  if (/^(?:more\s+(?:info|information|details?)(?:\s+(?:on|about)\s+(?:that|this|it))?|tell\s+me\s+more(?:\s+(?:about|on)\s+(?:that|this|it))?|expand(?:\s+(?:on|upon)\s+(?:that|this|it))?|go\s+(?:deeper|on)|keep\s+going|continue|more)$/i.test(core)) {
    return true;
  }
  if (/^(?:can|could|would)\s+you\s+(?:please\s+)?(?:give|tell|show)\s+me\s+more\s+(?:info|information|details?)(?:\s+(?:on|about)\s+(?:that|this|it))?[.!?]*$/i.test(raw)) {
    return true;
  }
  if (/^(?:give|gave|gimme)\s+(?:me\s+)?more\s+(?:info|information|details?)[.!?]*$/i.test(raw)) {
    return true;
  }
  return false;
}

/**
 * Search when external info would actually help — not on every message.
 *
 * Yes: people / news / predictions, “more information about X”, design refs (apple.com UI),
 *      explicit “search the web”, book/movie identify-from-plot, build asks that need a live layout look.
 * No:  plain stories/jokes, greeting, color codes, routine coding without a reference,
 *      bare “more info” follow-ups (those expand the prior thread topic).
 */
export function looksLikeWebGroundedAsk(text: string): boolean {
  const t = String(text || '').trim();
  if (!t || t.length < 6) return false;

  // Bound-folder asks (“this project”, “more info about my app”) never hit the public web.
  if (/\b(?:this|the|my|our)\s+(?:project|folder|app|codebase|code)\b/i.test(t)
    && !/\b(?:github\.com|https?:\/\/|apple\.com|figma|dribbble)\b/i.test(t)) {
    return false;
  }
  // “Full report on this project” / overview phrasing — never web (even without “this project” pair).
  if (/\b(?:full\s+)?report\s+on\s+(?:this|the|my|our)\b/i.test(t)) return false;
  if (/\bmore\s+(?:info|information|details?)\s+(?:on|about)\s+(?:this|the|my|our)\s+(?:project|folder|app)\b/i.test(t)) {
    return false;
  }
  // Bare “more info” / “give me more info” — thread expand, not a web query for the phrase.
  if (looksLikeBareExpandAsk(t)) return false;

  // Design / layout references win even on build asks (“site like apple.com”).
  if (looksLikeDesignReferenceAsk(t)) return true;

  // Identify / research asks must hit the web even when the plot reads like a “story”.
  if (looksLikeIdentifyMediaAsk(t) || looksLikeExplicitResearchAsk(t) || looksLikeRejectedPriorAnswerAsk(t)) {
    return true;
  }
  // “Where can I buy / give me links to read” — need real store URLs.
  if (looksLikeBookFindOrBuyAsk(t)) return true;
  // Parts / product shopping links (any topic — keyboard, PC, drone, etc.).
  if (/\b(?:give\s+me\s+(?:some\s+)?links?|where\s+(?:can|do)\s+i\s+(?:buy|purchase|get|order)|links?\s+to\s+(?:where|buy))\b/i.test(t)
    && /\b(?:buy|purchase|parts?|components?|materials?|supplies|amazon|vendor|store)\b/i.test(t)) {
    return true;
  }
  // DIY / exactly-how-to-build guides — need live vendor / module context when possible.
  if (/\b(?:exactly\s+how|how\s+(?:do|can|would|to)\s+(?:i|you|we)?\s*(?:build|make|assemble)|from\s+scratch|step[- ]by[- ]step)\b/i.test(t)
    && /\b(?:camera|webcam|keyboard|drone|pcb|arduino|raspberry|hardware|sensor|lens|circuit|prototype|build)\b/i.test(t)) {
    return true;
  }

  if (looksLikeOfflineOnlyAsk(t)) return false;
  if (looksLikeCreativeAsk(t)) return false;
  if (looksLikeLyricsAsk(t)) return false;

  // User explicitly asked to search.
  if (/\blook\s+(?:up|this)\s+up\b|\bsearch\s+(?:the\s+)?(?:web|internet|online)\b|\bgoogle\s+(?:it|this|that)\b/i.test(t)) {
    return true;
  }

  // Time-sensitive: sports predictions, weather, markets, news.
  if (looksLikeSportsOrEsportsAsk(t)
    && /\b(?:predict|prediction|win|won|vs\.?|versus|odds|score|match|standings?|who\s+will|upcoming|next|today|tonight|live)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:weather|forecast|temperature|humid(?:ity)?)\b/i.test(t)) return true;
  if (/\b(?:stock|stocks|share\s+price|AAPL|TSLA|NVDA|S&P|nasdaq|dow\s+jones|net\s*worth|live\s+(?:price|odds|score)|current\s+price)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:white\s+house|president|congress|election|headlines?|breaking\s+news|current\s+events|what\s+happened\s+(?:today|yesterday|this\s+week))\b/i.test(t)) {
    return true;
  }
  if (/\bhow\s+much\s+(?:is|are|does|did|has|have)\b/i.test(t)) return true;

  // Deep / accurate lookups about people, orgs, products — needs a subject, not bare expand.
  if (looksLikeComprehensiveAsk(t)) return true;
  if (/\b(?:more\s+(?:info|information|details?)\s+(?:on|about)\s+\S|tell\s+me\s+more\s+about\s+\S|full\s+(?:bio|biography|profile)\b)/i.test(t)) {
    return true;
  }
  if (/\b(?:who\s+(?:is|are|was|were)|who(?:'s)|tell\s+me\s+about)\b/i.test(t)
    && !/\b(?:file|folder|project|button|css|component|function)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:info(?:rmation)?\s+(?:on|about)\s+\S|find\s+out\s+(?:about|more)\s+\S|look\s+up\s+\S)/i.test(t)) return true;
  if (/\b(?:who\s+created|founded|founder|when\s+was\b.{0,40}\bfounded)\b/i.test(t)) return true;

  // Specs / “is it worth it” product digs — not bare “what is a mouse”.
  if (/\b(?:specs?|specifications|review|is\s+it\s+worth|best\s+(?:price|deal)|compare)\b/i.test(t)) {
    return true;
  }

  // Planning how to implement a real product UI (still not routine file edits).
  if (/\b(?:how\s+(?:should|would|do)\s+(?:we|i|you)\s+(?:build|implement|structure|layout)|best\s+way\s+to\s+(?:build|implement|structure)|what(?:'s|\s+is)\s+the\s+best\s+(?:way|approach)\s+to\s+(?:build|implement))\b/i.test(t)
    && /\b(?:website|app|ui|page|landing|dashboard|homepage|site)\b/i.test(t)) {
    return true;
  }

  return false;
}

export async function webSearchForChat(
  query: string,
  opts?: { priorTurns?: { role: string; content: string }[]; timeoutMs?: number },
): Promise<{
  ok: boolean;
  text: string;
  sources: { title: string; url: string }[];
  error?: string;
}> {
  const cleaned = buildContextualWebQuery(query, opts?.priorTurns || []);
  // Identify / deep research asks benefit from a longer live dig (up to 45s).
  const budget = Math.max(6_000, Math.min(Number(opts?.timeoutMs) || 45_000, 45_000));
  const run = async () => {
    if (!window.novaDesktop?.webSearch) {
      return { ok: false, text: '', sources: [], error: 'Web search unavailable outside desktop' };
    }
    const res = await window.novaDesktop.webSearch(cleaned);
    const sources = filterWebSources(Array.isArray(res?.sources) ? res.sources : []);
    // Drop junk lines that cite filtered hosts from the text blob too.
    let text = String(res?.text || '');
    if (text) {
      text = text
        .split('\n')
        .filter((line) => {
          const urls = line.match(/https?:\/\/[^\s)]+/gi) || [];
          if (!urls.length) return true;
          return urls.every((u) => !isJunkWebSourceUrl(u));
        })
        .join('\n');
    }
    return {
      ok: Boolean(res?.ok) && (Boolean(text.trim()) || sources.length > 0),
      text,
      sources,
      error: res?.error,
    };
  };
  try {
    let timer: number | undefined;
    const timed = new Promise<{ ok: boolean; text: string; sources: { title: string; url: string }[]; error?: string }>((resolve) => {
      timer = window.setTimeout(() => {
        resolve({ ok: false, text: '', sources: [], error: 'Research timed out' });
      }, budget);
    });
    const hit = await Promise.race([run(), timed]);
    if (timer != null) window.clearTimeout(timer);
    return hit;
  } catch (err) {
    return {
      ok: false,
      text: '',
      sources: [],
      error: err instanceof Error ? err.message : 'Web search failed',
    };
  }
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
  if (!t || t.length < 4) return false;
  if (looksLikeBareExpandAsk(t)) return true;
  if (looksLikeRejectedPriorAnswerAsk(t) || looksLikeExplicitResearchAsk(t)) return true;
  if (/\b(?:he|she|they|him|his|her|them|their)\b/i.test(t) && t.length < 160) return true;
  if (/\b(?:the\s+game|that\s+game|this\s+game|more\s+(?:info|information|details?)|tell\s+me\s+more)\b/i.test(t)) {
    return true;
  }
  if (/\b(?:same\s+(?:guy|person|player|streamer)|what\s+about\s+(?:him|her|them))\b/i.test(t)) return true;
  if (/\b(?:the\s+(?:book|novel|movie|film|title)|that\s+(?:book|novel|movie|film))\b/i.test(t) && t.length < 200) {
    return true;
  }
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
      .replace(/\bC9\b/g, 'Cloud9 C9')
      .replace(/\bTYL\b/g, 'TYL Valorant');
  }
  // Match predictions → bias search toward VLR / Liquipedia style results, not social chat sites.
  if (/\b(?:predict|prediction|who\s+(?:will|gonna|going\s+to)\s+win|vs)\b/i.test(q)
    && /\b(?:valorant|cs2|esports?|vct)\b/i.test(q)) {
    if (!/\b(?:vlr|liquipedia|odds|vct)\b/i.test(q)) {
      q = `${q} VCT odds prediction`.trim();
    }
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

  // Book/movie identify: compress the plot (or prior plot on “nope / research” follow-ups).
  const priorPlot = [...priorTurns]
    .reverse()
    .find((t) => t.role === 'user' && looksLikeIdentifyMediaAsk(String(t.content || '')));
  const identifyNow = looksLikeIdentifyMediaAsk(ask);
  const identifyFollow =
    !identifyNow
    && (looksLikeExplicitResearchAsk(ask) || looksLikeRejectedPriorAnswerAsk(ask))
    && Boolean(priorPlot);
  if (identifyNow || identifyFollow) {
    const plotSrc = identifyNow ? ask : String(priorPlot?.content || ask);
    const compressed = compressIdentifySearchQuery(plotSrc);
    if (compressed.length >= 12) return compressed;
  }

  // Bare “more info” → search the prior substantive topic, never the phrase itself.
  if (looksLikeBareExpandAsk(ask)) {
    const priorUser = [...priorTurns]
      .reverse()
      .find((t) => {
        if (t.role !== 'user') return false;
        const c = String(t.content || '').trim();
        return c.length >= 8 && !looksLikeBareExpandAsk(c);
      });
    const topic = priorUser ? normalizeWebSearchQuery(String(priorUser.content || '').slice(0, 180)) : '';
    if (topic.length >= 8) {
      const withEntities = entities.length
        ? `${entities.join(' ')} ${topic}`.replace(/\s+/g, ' ').trim()
        : topic;
      return `${withEntities} detailed explanation`.replace(/\s+/g, ' ').trim().slice(0, 220);
    }
  }

  // How-to / DIY build → bias search toward real modules / vendor pages.
  if (/\b(?:webcam|web\s*camera|camera\s+module|build\s+(?:a\s+)?(?:webcam|camera|keyboard|drone))\b/i.test(ask)
    || (/\b(?:exactly\s+how|how\s+to\s+build|from\s+scratch)\b/i.test(ask) && /\b(?:build|camera|keyboard|drone|pcb)\b/i.test(ask))) {
    let q = normalizeWebSearchQuery(ask);
    if (/\b(?:webcam|web\s*camera|camera)\b/i.test(ask) && !/\b(?:IMX|Arducam|UVC)\b/i.test(q)) {
      q = `${q} Arducam IMX219 USB UVC camera module buy`.trim();
    }
    return q.slice(0, 220);
  }

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

export function formatWebLookupForPrompt(
  result: {
    text: string;
    sources?: { title: string; url: string }[];
  },
  opts?: { comprehensive?: boolean; identify?: boolean },
): string {
  const body = String(result.text || '').trim();
  if (!body) return '';
  const comprehensive = Boolean(opts?.comprehensive);
  const identify = Boolean(opts?.identify);
  // Prefer snippet lines without raw URLs so the model answers from text, not a link list.
  const factLines = body
    .split('\n')
    .map((l) => l.replace(/\s*\(https?:\/\/[^)]+\)\s*/g, '').trim())
    .filter(Boolean)
    .slice(0, comprehensive || identify ? 28 : 16);
  const links = filterWebSources(result.sources || [])
    .slice(0, comprehensive || identify ? 6 : 4)
    .map((s) => `- ${s.title || 'Link'}: ${s.url}`)
    .join('\n');
  const shapeRules = identify
    ? [
      '- The user is identifying a REAL book/movie/show from a remembered plot. Do NOT invent titles.',
      '- Lead with the best matching title + author/creator ONLY if that title appears in the lookup notes below.',
      '- If CANDIDATE TITLES FROM SEARCH lists a book, that is the answer — use that exact title/author.',
      '- Then map the user’s plot points to confirmed facts from the notes (character names, mountain, illness, dog, ending).',
      '- If notes disagree or are thin, say what matched and what is still uncertain — never pad with fake alternate titles.',
      '- Include 2–4 markdown links using ONLY exact URLs from the Sources list (Goodreads, Scholastic, Open Library, Wikipedia, publisher, store). Every source label MUST have a real https URL.',
      '- Never claim you “searched” without using these notes. Never invent Where-the-Mountain-style filler titles.',
    ]
    : comprehensive
    ? [
      '- The user asked for a FULL / deep answer — do NOT hold back to a short card.',
      '- If this is a how-to / DIY / build ask: give options (easy prototype vs advanced), a first build path, named parts when known, rough price bands, markdown buy links from Sources when available, and a simple text signal-flow. Professional tone, no emojis, no “would you like to start with hardware or software?” as the whole closer.',
      '- If this is a person/profile ask: write ~250–450 words with sections (Overview, Early life / background, Career, Companies & projects, Public role / recent notes).',
      '- Use every usable fact from the notes. Never pad with “Not specified” rows.',
      '- NEVER invent earnings, follower counts, birth dates, net worth figures, or fake product SKUs. Only use numbers that appear in the notes (or clearly mark estimates).',
      '- At the end, add a **Sources** list with at most 6 markdown links copied from the Sources list below (exact URLs). Prefer Wikipedia / official / vendor sites. Do not invent biography.com or random blog links.',
    ]
    : [
      '- Lead with who/what they are in 1–2 sentences, then a tight **Quick facts** list (only fields you actually know from the notes).',
      '- NEVER write “Not specified in the provided data” / “unknown” rows — omit fields you do not have.',
      '- NEVER invent earnings, follower counts, birth dates, net worth figures, or team history. Only quote numbers that appear in the notes.',
      '- If the user asked for a single fact (net worth / price / how much), lead with that number — do not open with a biography.',
      '- If the user asked for more information / who is, open with a short bio then deepen.',
      '- Include 1–3 markdown links using ONLY exact URLs from the Sources list below. Prefer Wikipedia / official sites. Do not invent links.',
    ];
  const candidates = identify ? extractBookCandidatesFromLookup(result).slice(0, 3) : [];
  const candidateBlock = candidates.length
    ? [
      '',
      'CANDIDATE TITLES FROM SEARCH (prefer the top match; do not invent others):',
      ...candidates.map((c, i) => `${i + 1}. ${c.title}${c.author ? ` by ${c.author}` : ''} (score ${c.score})`),
    ].join('\n')
    : '';
  return [
    'INTERNAL LOOKUP DATA (not a user message — do not thank it, do not acknowledge it).',
    'Write a direct user-facing answer using the facts/snippets below.',
    'HARD RULES:',
    ...shapeRules,
    '- Stay on the person/game/book from this thread. If the thread is about Apex / ItsTimmy, do NOT switch to Fortnite or another title unless the user asked.',
    '- For “the game he plays” follow-ups: answer about THAT player’s main game from the thread, with a short what-it-is + official link from Sources only.',
    '',
    factLines.join('\n'),
    candidateBlock,
    links ? `\nSources (copy exact URLs only — never invent new ones):\n${links}` : '',
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
  opts?: LinkRepairOpts,
): string {
  let out = String(reply || '');
  if (!out.trim()) return out;
  const urls = (sources || [])
    .map((s) => String(s?.url || '').trim())
    .filter((u) => /^https?:\/\//i.test(u) && !isJunkWebSourceUrl(u));
  const pick = (hint: RegExp) => {
    const hit = (sources || []).find((s) => {
      const u = String(s?.url || '').trim();
      if (!u || isJunkWebSourceUrl(u)) return false;
      return hint.test(`${s.title || ''} ${u}`);
    });
    return hit?.url && /^https?:\/\//i.test(hit.url) ? hit.url : urls[0] || '';
  };

  // [label]() / [label](#) / [label](undefined)
  out = out.replace(/\[([^\]]+)\]\((#|undefined|null|)\s*\)/gi, (_m, label) => {
    const lab = String(label || '');
    const url = /forbes/i.test(lab) ? pick(/forbes/i)
      : /wiki/i.test(lab) ? pick(/wikipedia|wiki/i)
      : /goodreads/i.test(lab) ? pick(/goodreads/i)
      : /open\s*library/i.test(lab) ? pick(/openlibrary|open.?library/i)
      : /amazon/i.test(lab) ? pick(/amazon\.com/i)
      : /scholastic/i.test(lab) ? pick(/scholastic/i)
      : /twitch/i.test(lab) ? pick(/twitch/i)
      : /live|net\s*worth|track/i.test(lab) ? pick(/forbes|bloomberg|net.?worth|track/i)
      : urls[0] || '';
    return url ? `[${lab}](${url})` : lab;
  });

  // Empty “Goodreads:” / “Wikipedia:” bullets with no URL — fill from live sources.
  out = out.replace(
    /^([ \t]*[-*•]\s*)\*{0,2}(Goodreads|Open Library|Wikipedia|Amazon|Scholastic|Google Books)\*{0,2}\s*:?\s*$/gim,
    (_m, bullet, label) => {
      const lab = String(label || '');
      const url = /goodreads/i.test(lab) ? pick(/goodreads/i)
        : /open\s*library/i.test(lab) ? pick(/openlibrary|open.?library/i)
        : /wiki/i.test(lab) ? pick(/wikipedia|wiki/i)
        : /amazon/i.test(lab) ? pick(/amazon\.com/i)
        : /scholastic/i.test(lab) ? pick(/scholastic/i)
        : /google\s*books/i.test(lab) ? pick(/books\.google|google\.com\/books/i)
        : urls[0] || '';
      if (!url) return `${bullet}**${lab}:**`;
      const hostLabel = lab;
      return `${bullet}**${hostLabel}:** [${hostLabel}](${url})`;
    },
  );

  // Shopping: empty “Raspberry Pi Zero W:” / “USB Webcams:” bullets → Amazon search link.
  if (opts?.allowShopHosts) {
    out = out.replace(
      /^([ \t]*[-*•]\s*)\*{0,2}([^:\n*]{2,60}?)\*{0,2}\s*:\s*$/gim,
      (_m, bullet, label) => {
        const lab = String(label || '').trim();
        if (!lab || /^(?:goodreads|open library|wikipedia|amazon|scholastic|google books|sources?|links?)$/i.test(lab)) {
          return `${bullet}**${lab}:**`;
        }
        // Prefer a verified source whose title/URL mentions the part; else Amazon search for THAT label.
        const fromSources = pick(new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').slice(0, 24), 'i'));
        const url = (fromSources && linkLabelMatchesUrl(lab, fromSources))
          ? fromSources
          : (shopSearchUrlForLabel(lab) || `https://www.amazon.com/s?k=${encodeURIComponent(lab)}`);
        return `${bullet}**${lab}:** [${lab}](${url})`;
      },
    );
  }

  // “live here ↗” / **live here** with no URL — attach best tracker link.
  if (/\blive\s+here\b/i.test(out) && !/\[live\s+here\]\(https?:\/\//i.test(out)) {
    const url = pick(/forbes|bloomberg|net.?worth|track/i) || urls[0];
    if (url) {
      out = out.replace(/\*{0,2}live\s+here\*{0,2}/gi, `[live here](${url})`);
    }
  }

  // Drop dangling ↗ that isn't next to a link.
  out = out.replace(/(?<!\])\s*↗/g, '');
  out = scrubJunkDomainMentions(out);
  return scrubUnverifiedMarkdownLinks(out, sources, opts);
}

/** Hosts that are reasonable for “where can I buy parts” answers (not junk blogs). */
export function isAllowedShopOrPartsHost(url: string): boolean {
  try {
    const host = new URL(String(url || '').trim()).hostname.replace(/^www\./i, '').toLowerCase();
    return /(?:^|\.)(?:amazon\.[a-z.]+|amzn\.to|ebay\.[a-z.]+|digikey\.com|mouser\.com|adafruit\.com|sparkfun\.com|aliexpress\.com|newegg\.com|bestbuy\.com|raspberrypi\.com|raspberrypi\.org|github\.com|shapeways\.com|printables\.com|thingiverse\.com|adafruit\.com|piishop\.com|microcenter\.com|arrow\.com|newark\.com|jlcpcb\.com|pcbway\.com)$/i.test(host);
  } catch {
    return false;
  }
}

export type LinkRepairOpts = {
  /** Keep Amazon/Digi-Key/etc. even when live search returned different URLs. */
  allowShopHosts?: boolean;
  /** Cap after scrub (default 4; shopping needs more part links). */
  maxLinks?: number;
};

/** Strip hallucinated citations to known junk hosts (even as plain prose). */
export function scrubJunkDomainMentions(reply: string): string {
  let out = String(reply || '');
  if (!out.trim()) return out;
  // Whole sentences that lean on PairUp / similar hangout sites as “prediction AI”.
  out = out.replace(
    /[^.!\n]*\b(?:pairup\.chat|pairup\.com|omegle\.com|chatroulette\.com)\b[^.!\n]*[.!?]?/gi,
    '',
  );
  // Bare leftover host tokens.
  out = out.replace(/\b(?:pairup\.chat|pairup\.com)\b/gi, '');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
  return out;
}

/**
 * Keep markdown links whose URL matches a verified lookup source.
 * Invented biography.com / blog URLs that look clickable but go nowhere are removed.
 * Shopping mode keeps known vendor hosts so streamed buy-links are not retracted on finalize.
 */
export function scrubUnverifiedMarkdownLinks(
  reply: string,
  sources?: { title: string; url: string }[],
  opts?: LinkRepairOpts,
): string {
  let out = String(reply || '');
  if (!out.trim()) return out;

  const verified = (sources || [])
    .map((s) => String(s?.url || '').trim())
    .filter((u) => /^https?:\/\//i.test(u) && !isJunkWebSourceUrl(u));
  const allowShop = Boolean(opts?.allowShopHosts);
  const maxLinks = Math.max(1, Math.min(Number(opts?.maxLinks) || (allowShop ? 8 : 4), 12));

  const urlAllowed = (href: string): boolean => {
    const h = String(href || '').trim().replace(/[),.;]+$/g, '');
    if (!/^https?:\/\//i.test(h)) return false;
    if (isJunkWebSourceUrl(h)) return false;
    if (allowShop && isAllowedShopOrPartsHost(h)) return true;
    if (!verified.length) {
      // No live sources: only keep shop hosts when shopping mode; otherwise strip invented links.
      return false;
    }
    try {
      const u = new URL(h);
      return verified.some((raw) => {
        try {
          const v = new URL(raw);
          const hostU = u.hostname.replace(/^www\./i, '').toLowerCase();
          const hostV = v.hostname.replace(/^www\./i, '').toLowerCase();
          if (h.replace(/\/$/, '') === raw.replace(/\/$/, '')) return true;
          if (hostU !== hostV) return false;
          const pathU = u.pathname.replace(/\/$/, '') || '/';
          const pathV = v.pathname.replace(/\/$/, '') || '/';
          return pathU === pathV || pathU.startsWith(`${pathV}/`) || pathV.startsWith(`${pathU}/`);
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  };

  // Keep the label when dropping a bad href — never leave a blank hole mid-sentence.
  // Shopping: if the URL host is fine but the product page does not match the label,
  // rewrite to an Amazon search for that exact label (stops “OV5647” → wrong Adafruit SKU).
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (full, label, href) => {
    const lab = String(label || '').trim();
    const h = String(href || '').trim();
    if (!urlAllowed(h)) return lab;
    if (allowShop && isAllowedShopOrPartsHost(h) && !linkLabelMatchesUrl(lab, h)) {
      const search = shopSearchUrlForLabel(lab);
      return search ? `[${lab}](${search})` : lab;
    }
    return full;
  });

  // Cap Sources dumps — prefer first N verified/allowed links only.
  let linkCount = 0;
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/gi, (full) => {
    linkCount += 1;
    return linkCount <= maxLinks ? full : full.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i, '$1');
  });

  // Bare https URLs not in the verified set (common under Sources)
  if (verified.length || allowShop) {
    out = out.replace(/https?:\/\/[^\s)\]>]+/gi, (url) => (urlAllowed(url) ? url : ''));
  } else {
    // No verified sources — remove markdown-style citation links already stripped;
    // also drop a trailing Sources block of bare URLs.
    out = out.replace(/(^|\n)(?:#{1,3}\s*)?Sources\s*:?\s*\n(?:[-*•]\s*.*\n?){0,12}$/i, '$1');
  }

  // Clean empty bullets / numbered leftovers and empty Sources headers
  out = out.replace(/^[ \t]*[-*•]\s*$/gm, '');
  out = out.replace(/^[ \t]*\d+[.)]\s*$/gm, '');
  out = out.replace(/(^|\n)(?:#{1,3}\s*)?\*{0,2}Sources\*{0,2}\s*:?\s*(?=\n|$)/gi, '$1');
  out = out.replace(/[ \t]+\n/g, '\n');
  out = out.replace(/\n{3,}/g, '\n\n').trim();
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
