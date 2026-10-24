/**
 * Ranked project map for craft/edit (Aider-inspired, no tree-sitter dependency).
 * Scores files by brief keyword hits + centrality (App/css/main/package).
 * Cheap symbol skim (exports / components) fills the Missing "repo map" gap.
 */

function skimSymbols(text: string, limit = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (name: string) => {
    const n = String(name || '').trim();
    if (!n || n.length > 64 || seen.has(n)) return;
    seen.add(n);
    out.push(n);
  };
  for (const m of text.matchAll(
    /\b(?:export\s+(?:default\s+)?(?:async\s+)?function|export\s+(?:default\s+)?(?:const|class)|function|const)\s+([A-Z][A-Za-z0-9_]*)/g,
  )) {
    push(m[1]);
    if (out.length >= limit) break;
  }
  if (out.length < limit) {
    for (const m of text.matchAll(/\b(?:export\s+(?:async\s+)?function|function)\s+([a-z][A-Za-z0-9_]*)/g)) {
      push(m[1]);
      if (out.length >= limit) break;
    }
  }
  return out;
}

export function buildRankedProjectMap(
  files: Record<string, string>,
  brief: string,
  opts?: { limit?: number },
): string {
  const limit = Math.max(8, Math.min(40, opts?.limit ?? 24));
  const tokens = String(brief || '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/)
    .filter((t) => t.length > 2)
    .slice(0, 40);
  const rows: Array<{ path: string; score: number; peek: string; symbols: string[] }> = [];

  for (const [raw, body] of Object.entries(files || {})) {
    const path = raw.replace(/\\/g, '/');
    if (/node_modules|dist\/|\.lock$/i.test(path)) continue;
    if (/^\.__nova/i.test(path)) continue;
    const text = String(body || '');
    let score = 0;
    if (/^src\/App\.(jsx|tsx)$/i.test(path)) score += 50;
    if (/^src\/App\.css$/i.test(path)) score += 30;
    if (/^package\.json$/i.test(path)) score += 20;
    if (/^src\/main\./i.test(path)) score += 15;
    if (/index\.html$/i.test(path)) score += 12;
    if (/^src\/(components|sections|data)\//i.test(path)) score += 8;
    const symbols = /\.(jsx?|tsx?)$/i.test(path) ? skimSymbols(text) : [];
    if (symbols.length) score += Math.min(12, symbols.length * 2);
    const lower = `${path}\n${text.slice(0, 4000)}`.toLowerCase();
    for (const t of tokens) {
      if (lower.includes(t)) score += 2;
    }
    if (/\bexport\s+(?:default\s+)?function|\bexport\s+const\b/.test(text)) score += 4;
    rows.push({
      path,
      score,
      peek: text.replace(/\s+/g, ' ').trim().slice(0, 100),
      symbols,
    });
  }

  rows.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const top = rows.slice(0, limit);
  let scripts = '';
  try {
    const pkg = files['package.json'];
    if (pkg) {
      const j = JSON.parse(pkg) as { scripts?: Record<string, string> };
      scripts = Object.keys(j.scripts || {}).slice(0, 10).join(', ');
    }
  } catch { /* ignore */ }

  return [
    '## Ranked project map (symbols)',
    scripts ? `package scripts: ${scripts}` : '',
    ...top.map((r) => {
      const sym = r.symbols.length ? ` · [${r.symbols.slice(0, 6).join(', ')}]` : '';
      return `- ${r.path} (score ${r.score})${sym} · ${r.peek}${r.peek.length >= 100 ? '…' : ''}`;
    }),
  ].filter(Boolean).join('\n');
}

/** Cap observations for weak GGUF context (OpenHands condenser pattern). */
export function condenseObservations(obs: string[], max = 6): string[] {
  if (obs.length <= max) return obs;
  return obs.slice(-max);
}

export function condenseBrief(brief: string, maxChars = 1200): string {
  const t = String(brief || '').trim();
  if (t.length <= maxChars) return t;
  return `${t.slice(0, maxChars)}\n…(brief condensed)`;
}
