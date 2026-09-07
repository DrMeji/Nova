/**
 * Lightweight web lookup for Chat (no API key).
 * Uses DuckDuckGo Instant Answer + Wikipedia summary.
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

function cleanQuery(raw) {
  return String(raw || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
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
 * @param {string} query
 * @returns {Promise<{ ok: boolean; text: string; sources: { title: string; url: string }[]; error?: string }>}
 */
async function searchWeb(query) {
  const q = cleanQuery(query);
  if (!q) return { ok: false, text: '', sources: [], error: 'Empty query' };

  const [ddg, wiki] = await Promise.all([
    duckDuckGoInstant(q),
    wikipediaSummary(q),
  ]);

  const lines = [];
  const sources = [];

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
    text: lines.join('\n').slice(0, 3500),
    sources: sources.slice(0, 8),
  };
}

module.exports = {
  searchWeb,
};
