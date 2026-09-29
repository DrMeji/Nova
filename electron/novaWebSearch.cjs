/**
 * Lightweight web lookup for Chat (no API key).
 * Uses DuckDuckGo Instant Answer + lite HTML results + Wikipedia summary.
 * Caps work at ~45s and only returns reachable, non-junk source URLs.
 */

const FETCH_MS = 20_000;
const PROBE_MS = 4_500;
const SEARCH_BUDGET_MS = 45_000;

const JUNK_HOSTS = [
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
  'quora.com',
  'blogspot.com',
  'whatisthatbook.com',
  'whatbookisthis.com',
  'capitalizemytitle.com',
  'growthsummary.com',
  'bookbrain.ai',
  'bookbrain.com',
  'meetnewbooks.com',
  'scribd.com',
  'freepik.com',
  'behance.net',
];

const TRUSTED_HOSTS = [
  'wikipedia.org',
  'wikidata.org',
  'liquipedia.net',
  'vlr.gg',
  'hltv.org',
  'espn.com',
  'reuters.com',
  'bbc.com',
  'bbc.co.uk',
  'apnews.com',
  'theguardian.com',
  'nytimes.com',
  'britannica.com',
  'goodreads.com',
  'openlibrary.org',
  'scholastic.com',
  'scholastic.ca',
  'books.apple.com',
  'amazon.com',
  'neuralink.com',
  'tesla.com',
  'spacex.com',
  'apple.com',
  'x.com',
  'twitter.com',
  'github.com',
  'riotgames.com',
  'stripe.com',
  'linear.app',
  'notion.so',
  'notion.com',
  'barnesandnoble.com',
  'penguinrandomhouse.com',
  'harpercollins.com',
  'simonandschuster.com',
  'audible.com',
];

async function fetchJson(url, timeoutMs = FETCH_MS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'NOVA-Desktop/1.0' },
      signal: ac.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, timeoutMs = FETCH_MS) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent': 'Mozilla/5.0 (compatible; NOVA-Desktop/1.0; +https://nova.local)',
      },
      signal: ac.signal,
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function cleanQuery(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hostOf(raw) {
  try {
    return new URL(String(raw || '').trim()).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

function isJunkHost(url) {
  const host = hostOf(url);
  if (!host) return true;
  return JUNK_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

function isTrustedHost(url) {
  const host = hostOf(url);
  if (!host) return false;
  return TRUSTED_HOSTS.some((good) => host === good || host.endsWith(`.${good}`));
}

/** Quick reachability check — keep trusted hosts; probe the rest. */
async function urlLooksAlive(url, timeoutMs = PROBE_MS) {
  if (!url || !/^https?:\/\//i.test(url) || isJunkHost(url)) return false;
  if (isTrustedHost(url)) return true;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: ac.signal,
      headers: { 'User-Agent': 'NOVA-Desktop/1.0' },
    });
    // Some hosts reject HEAD — try a light GET.
    if (res.status === 405 || res.status === 403 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        redirect: 'follow',
        signal: ac.signal,
        headers: {
          'User-Agent': 'NOVA-Desktop/1.0',
          Range: 'bytes=0-0',
        },
      });
    }
    return res.status >= 200 && res.status < 400;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function filterReachableSources(sources, deadlineMs) {
  const list = (sources || [])
    .filter((s) => s?.url && /^https?:\/\//i.test(s.url) && !isJunkHost(s.url));
  // De-dupe by URL
  const seen = new Set();
  const unique = [];
  for (const s of list) {
    const key = String(s.url).replace(/\/$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
  }
  // Prefer trusted first, then probe the rest within remaining budget.
  const trusted = unique.filter((s) => isTrustedHost(s.url));
  const rest = unique.filter((s) => !isTrustedHost(s.url)).slice(0, 8);
  const left = Math.max(800, deadlineMs - Date.now());
  const per = Math.max(900, Math.floor(left / Math.max(1, rest.length)));
  const probed = await Promise.all(
    rest.map(async (s) => ((await urlLooksAlive(s.url, Math.min(PROBE_MS, per))) ? s : null)),
  );
  return [...trusted, ...probed.filter(Boolean)].slice(0, 8);
}

async function wikipediaSummary(query) {
  const q = cleanQuery(query);
  if (!q) return null;
  try {
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=1&namespace=0&format=json`;
    const search = await fetchJson(searchUrl);
    const title = Array.isArray(search?.[1]) ? search[1][0] : null;
    const link = Array.isArray(search?.[3]) ? search[3][0] : null;
    if (!title) return null;
    const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sum = await fetchJson(sumUrl);
    const extract = String(sum?.extract || '').trim();
    if (!extract) return null;
    return {
      title: String(sum?.title || title),
      extract: extract.slice(0, 900),
      url: String(sum?.content_urls?.desktop?.page || link || ''),
    };
  } catch {
    return null;
  }
}

async function duckDuckGoInstant(query) {
  const q = cleanQuery(query);
  if (!q) return null;
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`;
    const data = await fetchJson(url);
    const abstract = String(data?.AbstractText || '').trim();
    const heading = String(data?.Heading || '').trim();
    const abstractUrl = String(data?.AbstractURL || '').trim();
    const related = Array.isArray(data?.RelatedTopics)
      ? data.RelatedTopics
        .flatMap((row) => {
          if (row?.Text) return [row];
          if (Array.isArray(row?.Topics)) return row.Topics;
          return [];
        })
        .filter((row) => row?.Text)
        .slice(0, 5)
        .map((row) => ({
          text: String(row.Text).slice(0, 220),
          url: String(row.FirstURL || ''),
        }))
      : [];
    if (!abstract && !related.length) return null;
    return {
      heading,
      abstract: abstract.slice(0, 900),
      url: abstractUrl,
      related,
    };
  } catch {
    return null;
  }
}

/**
 * Lite HTML scrape of DuckDuckGo HTML results — better for news / "today" than Instant Answer.
 */
async function duckDuckGoHtmlLite(query) {
  const q = cleanQuery(query);
  if (!q) return null;
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`;
    const html = await fetchText(url);
    if (!html || html.length < 200) return null;
    const results = [];
    const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) && results.length < 8) {
      let href = decodeHtml(m[1]);
      const title = decodeHtml(m[2]).slice(0, 160);
      // DDG wraps outbound links; unwrap uddg= when present.
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) {
        try { href = decodeURIComponent(uddg[1]); } catch { /* keep */ }
      }
      if (!title || !href || !/^https?:\/\//i.test(href)) continue;
      if (/duckduckgo\.com/i.test(href)) continue;
      if (isJunkHost(href)) continue;
      results.push({ title, url: href });
    }
    // Snippets
    const snipRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<td[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/td>/gi;
    const snips = [];
    let sm;
    while ((sm = snipRe.exec(html)) && snips.length < 8) {
      const snip = decodeHtml(sm[1] || sm[2] || '').slice(0, 280);
      if (snip) snips.push(snip);
    }
    if (!results.length) return null;
    return results.map((r, i) => ({
      ...r,
      snippet: snips[i] || '',
    }));
  } catch {
    return null;
  }
}

async function openLibrarySearch(query) {
  const q = cleanQuery(query);
  if (!q) return null;
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=5`;
    const data = await fetchJson(url);
    const docs = Array.isArray(data?.docs) ? data.docs.slice(0, 5) : [];
    if (!docs.length) return null;
    return docs.map((d) => {
      const title = String(d?.title || '').trim();
      const author = Array.isArray(d?.author_name) ? String(d.author_name[0] || '').trim() : '';
      const key = String(d?.key || '').trim(); // e.g. /works/OL...
      const urlOut = key ? `https://openlibrary.org${key}` : 'https://openlibrary.org/search?q=' + encodeURIComponent(title);
      return {
        title: author ? `${title} by ${author}` : title,
        url: urlOut,
        snippet: author ? `Open Library · ${author}` : 'Open Library',
        coverId: d?.cover_i ? Number(d.cover_i) : null,
      };
    }).filter((r) => r.title);
  } catch {
    return null;
  }
}

/**
 * Image lookup for research answers (book covers, people, products).
 * Uses Open Library covers + Wikipedia thumbnails — no API key.
 * @param {string} query
 * @returns {Promise<{ ok: boolean; images: { title: string; imageUrl: string; sourceUrl: string; sourceDomain?: string }[]; error?: string }>}
 */
async function searchImages(query) {
  const q = cleanQuery(query);
  if (!q) return { ok: false, images: [], error: 'Empty query' };

  const images = [];
  const seen = new Set();
  const push = (row) => {
    const imageUrl = String(row?.imageUrl || '').trim();
    const sourceUrl = String(row?.sourceUrl || imageUrl).trim();
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return;
    if (seen.has(imageUrl)) return;
    seen.add(imageUrl);
    images.push({
      title: String(row?.title || q).slice(0, 120),
      imageUrl,
      sourceUrl,
      sourceDomain: hostOf(sourceUrl) || hostOf(imageUrl),
    });
  };

  // 1) Open Library covers
  try {
    const ol = await openLibrarySearch(q.replace(/\bbook\s+cover\b/gi, '').trim() || q);
    for (const row of ol || []) {
      if (!row.coverId) continue;
      push({
        title: row.title,
        imageUrl: `https://covers.openlibrary.org/b/id/${row.coverId}-L.jpg`,
        sourceUrl: row.url,
      });
      if (images.length >= 4) break;
    }
  } catch { /* keep going */ }

  // 2) Wikipedia page thumbnail (people / notable books)
  try {
    const wikiQ = q
      .replace(/\bbook\s+cover\b/gi, '')
      .replace(/\bphoto\b/gi, '')
      .trim()
      .slice(0, 120);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(wikiQ)}&limit=3&namespace=0&format=json`;
    const search = await fetchJson(searchUrl);
    const titles = Array.isArray(search?.[1]) ? search[1] : [];
    for (const title of titles.slice(0, 2)) {
      if (!title) continue;
      try {
        const sumUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const sum = await fetchJson(sumUrl);
        const thumb = String(sum?.originalimage?.source || sum?.thumbnail?.source || '').trim();
        const page = String(sum?.content_urls?.desktop?.page || '').trim();
        if (thumb) {
          push({
            title: String(sum?.title || title),
            imageUrl: thumb,
            sourceUrl: page || `https://en.wikipedia.org/wiki/${encodeURIComponent(String(title).replace(/\s+/g, '_'))}`,
          });
        }
      } catch { /* next */ }
      if (images.length >= 6) break;
    }
  } catch { /* keep */ }

  if (!images.length) {
    return { ok: false, images: [], error: 'No images found' };
  }
  return { ok: true, images: images.slice(0, 6) };
}

/**
 * @param {string} query
 * @returns {Promise<{ ok: boolean; text: string; sources: { title: string; url: string }[]; error?: string }>}
 */
async function searchWeb(query) {
  const q = cleanQuery(query);
  if (!q) return { ok: false, text: '', sources: [], error: 'Empty query' };

  const started = Date.now();
  const deadline = started + SEARCH_BUDGET_MS;

  const [ddg, wiki, htmlLite, openLib] = await Promise.all([
    duckDuckGoInstant(q),
    wikipediaSummary(q),
    duckDuckGoHtmlLite(q),
    openLibrarySearch(q),
  ]);

  const lines = [];
  const sources = [];

  if (htmlLite?.length) {
    lines.push('Web results (recent search):');
    for (const row of htmlLite) {
      if (row.url && isJunkHost(row.url)) continue;
      lines.push(`- ${row.title}${row.snippet ? ` — ${row.snippet}` : ''}${row.url ? ` (${row.url})` : ''}`);
      if (row.url) sources.push({ title: row.title, url: row.url });
    }
  }
  if (openLib?.length) {
    lines.push('Open Library:');
    for (const row of openLib) {
      lines.push(`- ${row.title}${row.snippet ? ` — ${row.snippet}` : ''}${row.url ? ` (${row.url})` : ''}`);
      if (row.url) sources.push({ title: row.title, url: row.url });
    }
  }
  if (wiki?.extract) {
    lines.push(`Wikipedia · ${wiki.title}: ${wiki.extract}`);
    if (wiki.url) sources.push({ title: wiki.title, url: wiki.url });
  }
  if (ddg?.abstract) {
    lines.push(`Web · ${ddg.heading || q}: ${ddg.abstract}`);
    if (ddg.url && !isJunkHost(ddg.url)) {
      sources.push({ title: ddg.heading || 'Source', url: ddg.url });
    }
  }
  if (ddg?.related?.length) {
    lines.push('Related:');
    for (const row of ddg.related) {
      if (row.url && isJunkHost(row.url)) continue;
      lines.push(`- ${row.text}${row.url ? ` (${row.url})` : ''}`);
      if (row.url) sources.push({ title: row.text.slice(0, 48), url: row.url });
    }
  }

  if (!lines.length) {
    return {
      ok: false,
      text: '',
      sources: [],
      error: 'No web results for that lookup',
    };
  }

  const liveSources = await filterReachableSources(sources, deadline);
  const allowed = new Set(liveSources.map((s) => String(s.url).replace(/\/$/, '').toLowerCase()));

  // Drop text lines that only cite unreachable / junk URLs.
  const filteredText = lines
    .filter((line) => {
      const urls = line.match(/https?:\/\/[^\s)]+/gi) || [];
      if (!urls.length) return true;
      return urls.some((u) => allowed.has(u.replace(/\/$/, '').toLowerCase()) || isTrustedHost(u));
    })
    .join('\n')
    .slice(0, 4500);

  return {
    ok: true,
    text: filteredText || lines.join('\n').slice(0, 4500),
    sources: liveSources,
  };
}

module.exports = {
  searchWeb,
  searchImages,
};
