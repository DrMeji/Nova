/**
 * Automatic multi-model website builds.
 * When 2+ ready brains exist on this PC (or local + cloud), NOVA splits the UI work
 * across them sequentially (one GGUF loaded at a time) and attributes each part in the footer.
 * No toggle — runs whenever enough models are ready.
 */

export type MultiModelCandidate = {
  id: string;
  name: string;
  source: 'local' | 'cloud' | 'free';
};

export type MultiModelPartPlan = {
  role: 'structure' | 'style' | 'interaction';
  label: string;
  model: MultiModelCandidate;
  promptHint: string;
};

export type MultiModelPartResult = MultiModelPartPlan & {
  ok: boolean;
  note: string;
  updated: string[];
};

/** Prefer coding-oriented local IDs for structure / JSX. */
function codingScore(id: string, name: string): number {
  const s = `${id} ${name}`.toLowerCase();
  if (/coder|code|deepseek|qwen2\.5-coder|starcoder|codellama/.test(s)) return 3;
  if (/instruct|chat|llama|mistral|phi|gemma/.test(s)) return 2;
  if (/vision|vl-|image|video|whisper|tts/.test(s)) return 0;
  return 1;
}

/**
 * Build a 2–3 part team from ready models. Returns null when multi-model cannot run.
 * Prefers downloaded/local brains; only fills with free/cloud when fewer than 2 locals.
 */
export function planMultiModelWebsiteTeam(
  ready: MultiModelCandidate[],
): MultiModelPartPlan[] | null {
  const usable = ready.filter((m) => codingScore(m.id, m.name) > 0);
  const rank = (list: MultiModelCandidate[]) => [...list].sort(
    (a, b) => codingScore(b.id, b.name) - codingScore(a.id, a.name)
      || a.name.localeCompare(b.name),
  );

  const locals = rank(usable.filter((m) => m.source === 'local'));
  const remote = rank(usable.filter((m) => m.source !== 'local'));

  const unique: MultiModelCandidate[] = [];
  const seen = new Set<string>();
  for (const m of [...locals, ...remote]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    unique.push(m);
    if (unique.length >= 3) break;
  }
  if (unique.length < 2) return null;

  const [a, b, c] = unique;
  const parts: MultiModelPartPlan[] = [
    {
      role: 'structure',
      label: 'layout + App.jsx',
      model: a,
      promptHint: [
        'PART 1 of a multi-model build — you own STRUCTURE only.',
        'Emit COMPLETE @@@FILE src/App.jsx only (optional src/main.jsx if missing).',
        'Do NOT emit index.html, package.json, css/styles.css, js/app.js, or markdown/prose.',
        'Build the full React layout/shell matching the brief (nav, sections, main regions).',
        'Use classNames that CSS can style. Do NOT write App.css in this pass — leave styling for the next model.',
        'Keep JSX valid and Preview-ready. Output code only inside @@@FILE blocks.',
      ].join(' '),
    },
    {
      role: 'style',
      label: 'App.css + look',
      model: b,
      promptHint: [
        'PART 2 of a multi-model build — you own VISUAL STYLE only.',
        'Emit COMPLETE @@@FILE src/App.css and src/index.css only.',
        'Match the classNames already in App.jsx. Dense, on-brief chrome. No blank / invisible UI.',
        'Do NOT rewrite App.jsx. Do NOT touch index.html. Do NOT write English explanations, notes, or markdown — CSS only.',
        'Never append sentences like "The updated file should…" after the CSS.',
      ].join(' '),
    },
  ];
  if (c) {
    parts.push({
      role: 'interaction',
      label: 'polish + interaction',
      model: c,
      promptHint: [
        'PART 3 of a multi-model build — you own POLISH + light interaction.',
        'Emit @@@FILE updates for src/App.jsx and/or src/App.css only as needed.',
        'Add hover states, selected states, simple local UI state (tabs/toggles) when the brief needs it.',
        'Do not scrap the previous models’ work. Do not rewrite index.html or package.json. Code only — no prose.',
      ].join(' '),
    });
  }
  return parts;
}

/** Footer label — show the actual brains that owned each part. */
export function formatMultiModelAttribution(parts: MultiModelPartResult[]): string {
  const ok = (parts || []).filter((p) => p?.model?.name);
  if (!ok.length) return 'Multi-model';
  const roleLabel: Record<MultiModelPartPlan['role'], string> = {
    structure: 'Layout',
    style: 'Style',
    interaction: 'Polish',
  };
  return ok
    .map((p) => `${roleLabel[p.role] || p.label} · ${p.model.name}${p.ok ? '' : ' (retry)'}`)
    .join(' → ');
}

export function multiModelStatusLine(part: MultiModelPartPlan, index: number, total: number): string {
  const jobs: Record<MultiModelPartPlan['role'], string> = {
    structure: 'Writing the React layout (App.jsx)',
    style: 'Designing styles (App.css)',
    interaction: 'Polishing interaction + hover states',
  };
  const brain = part.model?.name ? ` · ${part.model.name}` : '';
  return `Multi-model ${index + 1}/${total}: ${jobs[part.role]}${brain}…`;
}
