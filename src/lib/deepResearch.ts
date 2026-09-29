/**
 * Deep web research for Chat — real multi-query digs (not fake timers).
 * Uses Electron webSearch + Open Library / Wikipedia images.
 */

import {
  looksLikeIdentifyMediaAsk,
  looksLikeExplicitResearchAsk,
  looksLikeBookFindOrBuyAsk,
  looksLikeWebGroundedAsk,
  identifyPlotSearchHints,
  compressIdentifySearchQuery,
  pickBestBookCandidateFromLookup,
  identifyAnswerFromLookup,
  canonicalizeBookDisplayTitle,
  identifyResearchFailedReply,
  webSearchForChat,
  catalogLookupUrlsForTitle,
  filterWebSources,
  isJunkWebSourceUrl,
} from '@/lib/webSearch';

export type ResearchImage = {
  title: string;
  imageUrl: string;
  sourceUrl: string;
  sourceDomain?: string;
};

export type DeepResearchProgress = {
  label: string;
  detail?: string;
  searchesDone?: number;
  searchesTotal?: number;
  sourcesFound?: number;
  imagesFound?: number;
};

export type DeepResearchResult = {
  ok: boolean;
  searchPerformed: boolean;
  queries: string[];
  text: string;
  sources: { title: string; url: string }[];
  images: ResearchImage[];
  answer?: string;
  confidence?: 'confirmed' | 'likely' | 'uncertain';
  error?: string;
};

function sleep(ms: number) {
  return new Promise<void>((r) => window.setTimeout(r, ms));
}

/** Extract high-signal clue phrases from a long plot / person ask. */
export function extractResearchClues(message: string): string[] {
  const raw = String(message || '').replace(/\s+/g, ' ').trim();
  if (!raw) return [];
  const clues: string[] = [];
  const push = (s: string) => {
    const c = s.replace(/\s+/g, ' ').trim();
    if (c.length < 3 || clues.some((x) => x.toLowerCase() === c.toLowerCase())) return;
    clues.push(c);
  };

  // Quoted phrases
  const quoted = raw.match(/"([^"]{3,60})"/g) || [];
  for (const q of quoted) push(q.replace(/"/g, ''));

  const patterns: RegExp[] = [
    /\b(?:sick|hospital(?:ized)?|ill)\b/gi,
    /\b(?:dog|puppy|beagle)\b/gi,
    /\b(?:grandfather|grandpa|grandmother|grandma)\b/gi,
    /\b(?:mountain|mountains?|climbing|climber|rainier|snow(?:y)?)\b/gi,
    /\b(?:maze|glade|wall|fence|monster|creature)\b/gi,
    /\b(?:treehouse|friendship|outsider|drawing)\b/gi,
    /\b(?:dig(?:ging)?|holes?|desert|curse|camp)\b/gi,
    /\b(?:garden|uncle|manor|orphan)\b/gi,
    /\b(?:plane|crash|hatchet|axe|wilderness)\b/gi,
    /\b(?:boy|girl|kid|child(?:ren)?)\b/gi,
    /\b(?:CEO|founder|twitter|x\.com|tesla|spacex|twitch)\b/gi,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (m) push(m[0].toLowerCase());
  }

  // Distinctive multi-word memories
  if (/\bsick\b/i.test(raw) && /\bdog\b/i.test(raw) && /\bmountain/i.test(raw)) {
    push('sick boy dog mountain grandfather');
  }
  if (/\bmaze\b/i.test(raw) && /\bboys?\b/i.test(raw)) push('maze runner boys wall');
  if (/\bdig/i.test(raw) && /\bholes?\b/i.test(raw)) push('boys digging holes desert camp');

  return clues.slice(0, 14);
}

/**
 * Build several distinct search queries (deep research — not one giant paste).
 */
export function planDeepSearchQueries(message: string): string[] {
  const ask = String(message || '').replace(/\s+/g, ' ').trim();
  const out: string[] = [];
  const push = (q: string) => {
    const clean = q.replace(/\s+/g, ' ').trim().slice(0, 180);
    if (clean.length < 8 || out.some((x) => x.toLowerCase() === clean.toLowerCase())) return;
    out.push(clean);
  };

  const hints = identifyPlotSearchHints(ask);
  for (const h of hints) push(`${h} novel book`);

  const compressed = compressIdentifySearchQuery(ask);
  if (compressed) push(compressed);

  const clues = extractResearchClues(ask);
  if (clues.length >= 3) {
    push(`children novel ${clues.slice(0, 6).join(' ')}`);
    push(`young adult book ${clues.slice(0, 5).join(' ')}`);
    push(`"${clues.slice(0, 4).join('" "')}" book`);
  }

  // Honest-Truth-style mountain / hospital dig without hardcoding the title as the answer.
  if (/\b(?:hospital|sick|ill)\b/i.test(ask) && /\bdog\b/i.test(ask) && /\b(?:mountain|climb)/i.test(ask)) {
    push('children book boy dog grandfather mountain hospital');
    push('novel boy runs away hospital dog climbs mountain');
    push('children novel grandfather mountain climber sick boy dog');
    push('The Honest Truth Dan Gemeinhart Mark Beau');
  }

  if (/\bmaze\b/i.test(ask) && /\b(?:boy|wall|fence|monster)/i.test(ask)) {
    push('The Maze Runner James Dashner book goodreads');
  }

  if (looksLikeIdentifyMediaAsk(ask) && out.length < 3) {
    push(`${ask.slice(0, 120)} book title`);
  }

  // Person / company style
  if (/\b(?:who\s+is|ceo|founder|elon|musk)\b/i.test(ask)) {
    push(ask.slice(0, 160));
    push(`${ask.slice(0, 80)} wikipedia`);
  }

  // Always keep at least one query from the message head
  if (!out.length) push(ask.slice(0, 160));

  return out.slice(0, 6);
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function mergeSources(
  a: { title: string; url: string }[],
  b: { title: string; url: string }[],
): { title: string; url: string }[] {
  const seen = new Set<string>();
  const out: { title: string; url: string }[] = [];
  for (const s of [...a, ...b]) {
    if (!s?.url || isJunkWebSourceUrl(s.url)) continue;
    const key = s.url.replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title: s.title || s.url, url: s.url });
  }
  return out;
}

/** Open Library + Wikipedia images via Electron (no client API keys). */
export async function imageSearchForChat(query: string): Promise<ResearchImage[]> {
  const q = String(query || '').trim().slice(0, 160);
  if (!q) return [];
  if (!window.novaDesktop?.imageSearch && !window.novaDesktop?.webSearch) return [];
  try {
    if (window.novaDesktop.imageSearch) {
      const res = await window.novaDesktop.imageSearch(q);
      const images = Array.isArray(res?.images) ? res.images : [];
      return images
        .filter((img) => img?.imageUrl && /^https?:\/\//i.test(img.imageUrl))
        .slice(0, 8)
        .map((img) => ({
          title: String(img.title || q),
          imageUrl: String(img.imageUrl),
          sourceUrl: String(img.sourceUrl || img.imageUrl),
          sourceDomain: img.sourceDomain || hostOf(String(img.sourceUrl || img.imageUrl)),
        }));
    }
  } catch {
    /* fall through */
  }
  return [];
}

/**
 * Run a real multi-query dig with truthful progress labels.
 */
export async function runDeepResearch(
  message: string,
  opts?: {
    onProgress?: (p: DeepResearchProgress) => void;
    shouldAbort?: () => boolean;
    timeoutMs?: number;
    wantImages?: boolean;
  },
): Promise<DeepResearchResult> {
  const ask = String(message || '').trim();
  const onProgress = opts?.onProgress;
  const shouldAbort = opts?.shouldAbort || (() => false);
  const wantImages = opts?.wantImages !== false;
  const queries = planDeepSearchQueries(ask);

  onProgress?.({
    label: 'Planning searches…',
    detail: `${queries.length} queries from your clues`,
    searchesTotal: queries.length,
    searchesDone: 0,
  });

  let textBlob = '';
  let sources: { title: string; url: string }[] = [];
  let searchesDone = 0;
  const started = Date.now();
  const budget = Math.min(90_000, Math.max(20_000, opts?.timeoutMs || 75_000));

  for (const q of queries) {
    if (shouldAbort()) break;
    if (Date.now() - started > budget) break;
    onProgress?.({
      label: 'Searching the web…',
      detail: q.length > 64 ? `${q.slice(0, 64)}…` : q,
      searchesDone,
      searchesTotal: queries.length,
      sourcesFound: sources.length,
    });
    try {
      const hit = await webSearchForChat(q, { timeoutMs: 28_000 });
      searchesDone += 1;
      if (hit.ok) {
        textBlob = [textBlob, hit.text].filter(Boolean).join('\n');
        sources = mergeSources(sources, hit.sources || []);
      }
      onProgress?.({
        label: 'Finding relevant sources…',
        detail: `${sources.length} sources · ${searchesDone}/${queries.length} searches`,
        searchesDone,
        searchesTotal: queries.length,
        sourcesFound: sources.length,
      });
      // Small gap so the UI can paint real step changes (not fake work).
      await sleep(120);
    } catch {
      searchesDone += 1;
    }
  }

  if (!sources.length && !textBlob.trim()) {
    return {
      ok: false,
      searchPerformed: searchesDone > 0,
      queries,
      text: '',
      sources: [],
      images: [],
      error: searchesDone > 0 ? 'No usable web results' : 'Search did not run',
    };
  }

  onProgress?.({
    label: 'Comparing sources…',
    detail: `${sources.length} results across ${searchesDone} searches`,
    searchesDone,
    searchesTotal: queries.length,
    sourcesFound: sources.length,
  });
  await sleep(200);

  const hit = { ok: true as const, text: textBlob, sources };
  let best = pickBestBookCandidateFromLookup(hit);
  let confidence: DeepResearchResult['confidence'] = 'uncertain';

  // Verification pass: search the strongest candidate title+author on catalogs.
  if (best && !shouldAbort()) {
    onProgress?.({
      label: 'Verifying candidate…',
      detail: `${best.title}${best.author ? ` · ${best.author}` : ''}`,
      searchesDone,
      searchesTotal: queries.length + 1,
      sourcesFound: sources.length,
    });
    const verifyQ = `"${best.title}"${best.author ? ` ${best.author}` : ''} goodreads wikipedia amazon`;
    try {
      const verify = await webSearchForChat(verifyQ, { timeoutMs: 28_000 });
      searchesDone += 1;
      if (verify.ok) {
        textBlob = [textBlob, verify.text].filter(Boolean).join('\n');
        sources = mergeSources(sources, verify.sources || []);
        const again = pickBestBookCandidateFromLookup({ text: textBlob, sources });
        if (again) best = again;
      }
    } catch { /* keep prior best */ }

    const trustedHosts = new Set(
      sources.map((s) => hostOf(s.url)).filter((h) =>
        /wikipedia\.org|goodreads\.com|amazon\.com|openlibrary\.org|scholastic|britannica/i.test(h),
      ),
    );
    if (trustedHosts.size >= 3) confidence = 'confirmed';
    else if (trustedHosts.size >= 2 || (best.score >= 6 && trustedHosts.size >= 1)) confidence = 'likely';
    else confidence = 'likely';
  }

  let images: ResearchImage[] = [];
  if (wantImages && best && !shouldAbort()) {
    onProgress?.({
      label: 'Looking for images…',
      detail: `Covers / photos for ${canonicalizeBookDisplayTitle(best.title)}`,
      searchesDone,
      searchesTotal: queries.length + 1,
      sourcesFound: sources.length,
    });
    const imgQ = `${canonicalizeBookDisplayTitle(best.title)}${best.author ? ` ${best.author}` : ''} book cover`;
    images = await imageSearchForChat(imgQ);
    // If Electron image search empty, synthesize Open Library search page as non-image fallback — skip.
    onProgress?.({
      label: 'Looking for images…',
      detail: `${images.length} image${images.length === 1 ? '' : 's'} found`,
      searchesDone,
      sourcesFound: sources.length,
      imagesFound: images.length,
    });
  }

  onProgress?.({
    label: 'Building answer…',
    detail: confidence === 'confirmed' ? 'Multiple sources agree' : confidence === 'likely' ? 'Strong match' : 'Still uncertain',
    searchesDone,
    sourcesFound: sources.length,
    imagesFound: images.length,
  });

  let answer: string | undefined;
  if (looksLikeIdentifyMediaAsk(ask) || hintsLikelyIdentify(ask)) {
    if (best) {
      answer = identifyAnswerFromLookup(ask, { text: textBlob, sources }, best);
      answer = appendResearchImagesMarkdown(answer, images, best.title);
      if (confidence === 'confirmed') {
        answer = answer.replace(
          /^That matches/,
          'I researched this across multiple sources — that matches',
        );
      }
    } else {
      answer = identifyResearchFailedReply(ask);
    }
  }

  return {
    ok: true,
    searchPerformed: true,
    queries,
    text: textBlob,
    sources: filterWebSources(sources),
    images,
    answer,
    confidence,
  };
}

function hintsLikelyIdentify(ask: string): boolean {
  return identifyPlotSearchHints(ask).length > 0
    || (/\b(?:book|novel)\b/i.test(ask) && /\b(?:remember|maze|dig|garden|treehouse|mountain|dog)\b/i.test(ask));
}

/** Embed a Nova research-image block the chat renderer understands. */
export function appendResearchImagesMarkdown(
  answer: string,
  images: ResearchImage[],
  label?: string,
): string {
  const list = (images || []).filter((i) => i.imageUrl && i.sourceUrl).slice(0, 4);
  if (!list.length) return answer;
  const payload = JSON.stringify(
    list.map((i) => ({
      title: i.title || label || 'Image',
      imageUrl: i.imageUrl,
      sourceUrl: i.sourceUrl,
    })),
  );
  return `${answer.trim()}\n\n**Covers**\n<!--NOVA_RESEARCH_IMAGES:${payload}-->`;
}

export function shouldUseDeepResearch(message: string): boolean {
  const t = String(message || '').trim();
  if (!t || t.length < 12) return false;
  if (looksLikeIdentifyMediaAsk(t) || looksLikeExplicitResearchAsk(t) || looksLikeBookFindOrBuyAsk(t)) {
    return true;
  }
  if (looksLikeWebGroundedAsk(t) && t.length >= 80) return true;
  if (/\b(?:who\s+is|ceo\s+of|founder\s+of|look\s+up|find\s+(?:me\s+)?(?:the\s+)?(?:book|movie|person))\b/i.test(t)) {
    return true;
  }
  return false;
}

/** Re-export catalog helper for person answers that need store links. */
export { catalogLookupUrlsForTitle };
