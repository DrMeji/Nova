/**
 * Lightweight web lookup for Chat (no API key).
 * Uses DuckDuckGo Instant Answer + lite HTML results + Wikipedia summary.
 */

async function fetchJson(url, timeoutMs = 12_000) {
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

async function fetchText(url, timeoutMs = 12_000) {
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
    while ((m = re.exec(html)) && results.length < 6) {
      let href = decodeHtml(m[1]);
      const title = decodeHtml(m[2]).slice(0, 160);
      // DDG wraps outbound links; unwrap uddg= when present.
      const uddg = href.match(/[?&]uddg=([^&]+)/);
      if (uddg) {
        try { href = decodeURIComponent(uddg[1]); } catch { /* keep */ }
      }
      if (!title || !href || !/^https?:\/\//i.test(href)) continue;
      if (/duckduckgo\.com/i.test(href)) continue;
      results.push({ title, url: href });
    }
    // Snippets
    const snipRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>|<td[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/td>/gi;
    const snips = [];
    let sm;
    while ((sm = snipRe.exec(html)) && snips.length < 6) {
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

/**
 * @param {string} query
 * @returns {Promise<{ ok: boolean; text: string; sources: { title: string; url: string }[]; error?: string }>}
 */
async function searchWeb(query) {
  const q = cleanQuery(query);
  if (!q) return { ok: false, text: '', sources: [], error: 'Empty query' };

  const [ddg, wiki, htmlLite] = await Promise.all([
    duckDuckGoInstant(q),
    wikipediaSummary(q),
    duckDuckGoHtmlLite(q),
  ]);

  const lines = [];
  const sources = [];

  if (htmlLite?.length) {
    lines.push('Web results (recent search):');
    for (const row of htmlLite) {
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
    if (ddg.url) sources.push({ title: ddg.heading || 'Source', url: ddg.url });
  }
  if (ddg?.related?.length) {
    lines.push('Related:');
    for (const row of ddg.related) {
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

  return {
    ok: true,
    text: lines.join('\n').slice(0, 4500),
    sources: sources.slice(0, 10),
  };
}

module.exports = {
  searchWeb,
};
