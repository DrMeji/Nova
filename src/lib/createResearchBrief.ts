/**
 * Research open references before a rich create/build pass.
 * Inspiration only — never claim cloned proprietary sites are original IP.
 */

import { webSearchForChat, formatWebLookupForPrompt } from '@/lib/webSearch';

export function looksLikeNeedsCreateResearch(brief: string): boolean {
  const t = String(brief || '').trim();
  if (t.length < 24) return false;
  return (
    /\b(?:exact\s+replica|identical|clone|look\s+like|inspired\s+by|reference|open\s+source|github)\b/i.test(t)
    || /\b(?:apple\.com|netflix\.com|twitch\.tv|spotify|airbnb|stripe\.com)\b/i.test(t)
    || (
      /\b(?:website|landing|homepage|marketing\s+site|web\s*app)\b/i.test(t)
      && /\b(?:build|create|scaffold|replica|professional|premium)\b/i.test(t)
    )
  );
}

export function researchQueryFromBrief(brief: string, projectName: string): string {
  const t = String(brief || '').replace(/\s+/g, ' ').trim().slice(0, 220);
  const name = String(projectName || '').trim();
  if (/\bapple\.com\b/i.test(t) || /^apple\.com$/i.test(name)) {
    return 'apple.com homepage design React Vite open source landing clone github reference nav hero sections footer';
  }
  if (/\bnetflix\b/i.test(t)) {
    return 'Netflix homepage React clone open source github streaming UI reference';
  }
  if (/\btwitch\b/i.test(t)) {
    return 'Twitch.tv homepage React clone open source github live streaming UI reference';
  }
  return `${name || 'website'} ${t} open source github React Vite landing UI reference`.slice(0, 220);
}

export async function researchCreateReferences(opts: {
  brief: string;
  projectName: string;
}): Promise<{ ok: boolean; notes: string; sources: { title: string; url: string }[] }> {
  const query = researchQueryFromBrief(opts.brief, opts.projectName);
  const hit = await webSearchForChat(query);
  const github = await searchGithubRepos(query);
  const parts: string[] = [];
  const sources = [...(hit.sources || [])];

  if (hit.ok && hit.text) {
    parts.push(formatWebLookupForPrompt(hit));
  }
  if (github.ok && github.text) {
    parts.push(github.text);
    sources.push(...github.sources);
  }

  if (!parts.length) {
    return {
      ok: false,
      notes: [
        'Reference research returned no usable public results.',
        'Build from the user brief carefully: premium desktop website layout, not a thin stub.',
        'Use known public design patterns for the category as inspiration only — do not claim trademark ownership.',
      ].join(' '),
      sources: [],
    };
  }

  const notes = [
    'Create research notes (inspiration only — do not copy proprietary assets/trademarks verbatim; rebuild an original lookalike for a private test):',
    ...parts,
    github.ok
      ? 'Prefer structural ideas from open-source landings (nav, hero stack, footer columns, typography scale). Rebuild in App.jsx + App.css.'
      : 'Use the web notes above as structure/layout reference while generating a dense desktop website UI.',
  ].join('\n\n');

  return { ok: true, notes: notes.slice(0, 6000), sources: sources.slice(0, 12) };
}

async function searchGithubRepos(query: string): Promise<{
  ok: boolean;
  text: string;
  sources: { title: string; url: string }[];
}> {
  try {
    if (window.arkDesktop?.webSearch) {
      // Prefer the desktop search path; append a github-focused query.
      const res = await window.arkDesktop.webSearch(`site:github.com ${query}`);
      if (res?.ok && res.text) {
        return {
          ok: true,
          text: `GitHub-oriented results:\n${String(res.text).slice(0, 2500)}`,
          sources: Array.isArray(res.sources) ? res.sources : [],
        };
      }
    }
  } catch {
    /* ignore */
  }
  try {
    const q = encodeURIComponent(query.replace(/\s+/g, ' ').trim().slice(0, 120));
    const url = `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=5`;
    const res = await fetch(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NOVA-Desktop/1.0' },
    });
    if (!res.ok) return { ok: false, text: '', sources: [] };
    const data = await res.json() as {
      items?: { full_name?: string; html_url?: string; description?: string; stargazers_count?: number }[];
    };
    const items = Array.isArray(data?.items) ? data.items : [];
    if (!items.length) return { ok: false, text: '', sources: [] };
    const lines = items.map((it) => {
      const name = it.full_name || 'repo';
      const desc = String(it.description || '').slice(0, 140);
      const stars = it.stargazers_count ?? 0;
      return `- ${name} (${stars}★): ${desc} — ${it.html_url || ''}`;
    });
    return {
      ok: true,
      text: `Open-source GitHub repositories (structure inspiration):\n${lines.join('\n')}`,
      sources: items
        .filter((it) => it.html_url)
        .map((it) => ({ title: it.full_name || 'GitHub', url: String(it.html_url) })),
    };
  } catch {
    return { ok: false, text: '', sources: [] };
  }
}
