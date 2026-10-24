/**
 * Classify create/edit status lines into a professional activity timeline.
 * Kinds are open-ended: Thinking/List/Read/Run/Todos were examples — Nova also
 * surfaces Plan, Invent, Design, Assets, Scaffold, Heal, Verify, Preview, etc.
 */

export type ChatActivityKind =
  | 'thinking'
  | 'plan'
  | 'spine'
  | 'list'
  | 'read'
  | 'search'
  | 'browse'
  | 'analyze'
  | 'connect'
  | 'scaffold'
  | 'floor'
  | 'craft'
  | 'invent'
  | 'write'
  | 'edit'
  | 'apply'
  | 'design'
  | 'copy'
  | 'assets'
  | 'run'
  | 'install'
  | 'todos'
  | 'fix'
  | 'heal'
  | 'verify'
  | 'preview'
  | 'work';

/** All known kinds — UI + emitters can iterate; unknown labels still classify via heuristics. */
export const CHAT_ACTIVITY_KINDS: readonly ChatActivityKind[] = [
  'thinking',
  'plan',
  'spine',
  'list',
  'read',
  'search',
  'browse',
  'analyze',
  'connect',
  'scaffold',
  'floor',
  'craft',
  'invent',
  'write',
  'edit',
  'apply',
  'design',
  'copy',
  'assets',
  'run',
  'install',
  'todos',
  'fix',
  'heal',
  'verify',
  'preview',
  'work',
] as const;

export type ChatActivityRunStatus = 'running' | 'success' | 'fail' | null;

export type ChatActivityStep = {
  label: string;
  at: number;
  kind?: ChatActivityKind;
  /** Short detail shown beside the kind label (paths, command, thought preview). */
  summary?: string;
  /** Full expandable body (thinking monologue, terminal output). */
  detail?: string;
  runStatus?: ChatActivityRunStatus;
  paths?: string[];
};

const KIND_LABEL: Record<ChatActivityKind, string> = {
  thinking: 'Thinking',
  plan: 'Plan',
  spine: 'Spine',
  list: 'List',
  read: 'Read',
  search: 'Search',
  browse: 'Browse',
  analyze: 'Analyze',
  connect: 'Connect',
  scaffold: 'Scaffold',
  floor: 'Floor',
  craft: 'Craft',
  invent: 'Invent',
  write: 'Write',
  edit: 'Edit',
  apply: 'Apply',
  design: 'Design',
  copy: 'Copy',
  assets: 'Assets',
  run: 'Run',
  install: 'Install',
  todos: 'To-dos',
  fix: 'Fix',
  heal: 'Heal',
  verify: 'Verify',
  preview: 'Preview',
  work: 'Working',
};

export function activityKindLabel(kind: ChatActivityKind | string): string {
  if (kind in KIND_LABEL) return KIND_LABEL[kind as ChatActivityKind];
  // Allow future/custom kinds without a hard enum crash.
  const pretty = String(kind || 'work').replace(/[_-]+/g, ' ').trim();
  if (!pretty) return 'Working';
  return pretty.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pull file-like tokens from a status line. */
export function extractActivityPaths(label: string): string[] {
  const t = String(label || '');
  const found: string[] = [];
  const re = /\b((?:src\/|public\/|docs\/)?[\w./-]+\.(?:tsx?|jsx?|css|html|json|md|svg|mjs|cjs))\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const p = m[1].replace(/\\/g, '/');
    if (!found.includes(p)) found.push(p);
  }
  return found.slice(0, 6);
}

function stripNoise(label: string): string {
  return String(label || '')
    .replace(/\*\*/g, '')
    .replace(/\u2014/g, ':')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Explicit "Kind: detail" / "Kind · detail" prefixes from emitters. */
const EXPLICIT_KIND_RE = new RegExp(
  `^(${CHAT_ACTIVITY_KINDS.filter((k) => k !== 'todos').join('|')}|to-?dos?|working)\\s*[·•:\\-]\\s*`,
  'i',
);

function parseExplicitKind(label: string): { kind: ChatActivityKind; summary: string } | null {
  const m = label.match(EXPLICIT_KIND_RE);
  if (!m) return null;
  let raw = m[1].toLowerCase().replace(/\s+/g, '');
  if (raw === 'todos' || raw === 'todo' || raw === 'to-dos' || raw === 'to-do') raw = 'todos';
  if (raw === 'working') raw = 'work';
  if (!(CHAT_ACTIVITY_KINDS as readonly string[]).includes(raw)) return null;
  const summary = label.slice(m[0].length).trim() || label;
  return { kind: raw as ChatActivityKind, summary };
}

/**
 * Map a free-form Nova status string → activity kind + summary.
 * Existing pushStatus call sites keep working; the dropdown becomes accurate.
 * Not limited to Thinking/List/Read/Run — covers the full create/edit spine.
 */
export function classifyStatusActivity(
  rawLabel: string,
  extras?: Partial<Pick<ChatActivityStep, 'kind' | 'summary' | 'detail' | 'runStatus' | 'paths'>>,
): Omit<ChatActivityStep, 'label' | 'at'> & { summary: string } {
  if (extras?.kind) {
    return {
      kind: extras.kind,
      summary: extras.summary || stripNoise(rawLabel),
      detail: extras.detail,
      runStatus: extras.runStatus ?? null,
      paths: extras.paths || extractActivityPaths(rawLabel),
    };
  }

  const label = stripNoise(rawLabel);
  const paths = extractActivityPaths(label);
  const lower = label.toLowerCase();

  const explicit = parseExplicitKind(label);
  if (explicit) {
    // "Spine: Heal (8/12) · …" — map the stage name to Heal/Craft/… not a flat Spine row.
    if (explicit.kind === 'spine') {
      const stageHit = explicit.summary.match(
        /\b(Go|Brief|Disk|Scaffold|Floor|npm|Craft|Heal|Syntax|Live|Prove|Ready)\b/i,
      );
      const stage = String(stageHit?.[1] || '').toLowerCase();
      const kindFromStage: Record<string, ChatActivityKind> = {
        go: 'plan',
        brief: 'thinking',
        disk: 'list',
        scaffold: 'scaffold',
        floor: 'floor',
        npm: 'install',
        craft: 'craft',
        heal: 'heal',
        syntax: 'verify',
        live: 'preview',
        prove: 'verify',
        ready: 'verify',
      };
      const mapped = kindFromStage[stage];
      if (mapped) {
        return {
          kind: mapped,
          summary: explicit.summary,
          detail: label,
          runStatus: mapped === 'install' && /install|npm/i.test(lower) ? 'running' : null,
          paths,
        };
      }
    }
    const runish = explicit.kind === 'run' || explicit.kind === 'install';
    let runStatus: ChatActivityRunStatus = null;
    if (runish) {
      runStatus = /(?:running|installing|unpacking|downloading)\b/i.test(lower) ? 'running' : null;
      if (/\b(?:success|passed|exit:\s*0|ok)\b/i.test(lower)) runStatus = 'success';
      if (/\b(?:fail|failed|error|exit:\s*[1-9])\b/i.test(lower)) runStatus = 'fail';
    }
    return {
      kind: explicit.kind,
      summary: explicit.summary,
      detail: explicit.kind === 'thinking' || runish ? (explicit.summary || label) : extras?.detail,
      runStatus,
      paths,
    };
  }

  // --- Heuristics (order matters: specific before generic) ---

  // Create spine stage → one dropdown row kind (no separate chip strip).
  // "Spine: Heal (8/12) · remount + heal" → Heal, not a duplicate Go/Brief/Disk box row.
  if (
    /^spine\b/i.test(label)
    || /\bthin create\s*·/i.test(label)
    || /^create\s*·\s*(?:hard-go|freeze brief|bind project|vite scaffold|invent floor|npm\/vite|invent enrich|remount|syntax gate|live unlock|prove this|hand back)/i.test(label)
  ) {
    const summary = label.replace(/^spine\s*[:·-]?\s*/i, '').trim() || label;
    const stageHit = summary.match(
      /\b(Go|Brief|Disk|Scaffold|Floor|npm|Craft|Heal|Syntax|Live|Prove|Ready)\b/i,
    );
    const stage = String(stageHit?.[1] || '').toLowerCase();
    const kindFromStage: Record<string, ChatActivityKind> = {
      go: 'plan',
      brief: 'thinking',
      disk: 'list',
      scaffold: 'scaffold',
      floor: 'floor',
      npm: 'install',
      craft: 'craft',
      heal: 'heal',
      syntax: 'verify',
      live: 'preview',
      prove: 'verify',
      ready: 'verify',
    };
    const kind = kindFromStage[stage] || 'spine';
    return { kind, summary, detail: label, paths };
  }

  // Preview / Live server
  if (
    /\b(?:live preview|preview server|opening localhost|starting (?:the )?live|preview ready|paint(?:ing)? live)\b/i.test(label)
    || /^preview\b/i.test(label)
  ) {
    return { kind: 'preview', summary: label, paths };
  }

  // Verify / quality / Ready gate
  if (
    /\b(?:verify|verifying|preview ready|quality (?:gate|notes|accept)|originality|ask[- ]?match|ready gate|checking preview)\b/i.test(label)
    || /^verify\b/i.test(label)
  ) {
    return { kind: 'verify', summary: label, paths };
  }

  // Install (npm deps) — before generic Run
  if (
    /\b(?:installing (?:npm|project dependencies)|npm · installing|still installing npm|npm downloading|npm still unpacking|resolving packages)\b/i.test(label)
    || /^install\b/i.test(label)
  ) {
    let runStatus: ChatActivityRunStatus = /(?:installing|unpacking|downloading|resolving)\b/i.test(lower)
      ? 'running'
      : null;
    if (/\b(?:success|passed|exit:\s*0|done|complete)\b/i.test(lower)) runStatus = 'success';
    if (/\b(?:fail|failed|error)\b/i.test(lower)) runStatus = 'fail';
    return { kind: 'install', summary: label, detail: label, runStatus, paths };
  }

  // Terminal / typecheck / lint / git / build scripts
  if (
    /\bnpm\s+run\b/i.test(label)
    || /\b(?:typecheck|eslint|\blint\b|vitest|playwright|vite\s+build|\btsc\b)\b/i.test(label)
    || /\bgit\s+(?:status|diff|log|add|commit)\b/i.test(label)
    || /^(?:run|terminal|shell)\b/i.test(label)
    || /\bexit:\s*\d+/i.test(label)
    || /\bnpm\b/i.test(label)
  ) {
    let runStatus: ChatActivityRunStatus = /(?:running|installing|unpacking|downloading)\b/i.test(lower)
      ? 'running'
      : null;
    if (/\b(?:success|passed|exit:\s*0|ok)\b/i.test(lower)) runStatus = 'success';
    if (/\b(?:fail|failed|error|exit:\s*[1-9])\b/i.test(lower)) runStatus = 'fail';
    // Bare "npm · installing…" already handled above; leftover npm → install vs run
    if (/\binstall/i.test(label) && !/\bnpm\s+run\b/i.test(label)) {
      return { kind: 'install', summary: label, detail: label, runStatus, paths };
    }
    return {
      kind: 'run',
      summary: label.replace(/^(?:run|terminal|shell)\s*[:·-]?\s*/i, '').trim() || label,
      detail: label,
      runStatus,
      paths,
    };
  }

  // Invent / invent-floor / depth invent (before Assets — "hero" appears in invent lines)
  if (
    /\binvent\b/i.test(label)
    || /\b(?:invent-first|invent floor|depth craft|compositional|seeded hero|genre seed)\b/i.test(label)
  ) {
    return { kind: 'invent', summary: label, paths };
  }

  // Assets / images / logo / heroes
  if (
    /\b(?:hero|heroes|logo\.svg|product photography|openverse|brand assets|fetching images|wiring (?:logo|icons)|local icons|image fetch|svg)\b/i.test(label)
    || /^assets?\b/i.test(label)
  ) {
    return { kind: 'assets', summary: label, paths };
  }

  // Design / style / palette / atmosphere (not "Writing src/App.css…")
  if (
    !/^(?:write|writing|coding|building|updating)\b/i.test(label)
    && (
      /\b(?:style\s*[·•:\-]|design\s*[·•:\-]|palette|atmosphere|typography|parchment|css motion|premium css)\b/i.test(label)
      || /^(?:design|style)\b/i.test(label)
      || /\b(?:tuning typography|colors? and spacing)\b/i.test(label)
    )
  ) {
    return { kind: 'design', summary: label, paths };
  }

  // Copy / words (not code)
  if (
    /\bcopy ·\b/i.test(label)
    || /\b(?:words, not code|writing copy|product copy)\b/i.test(label)
    || /^copy\b/i.test(label)
  ) {
    return { kind: 'copy', summary: label, paths };
  }

  // Scaffold / Vite project skeleton
  if (
    /\bscaffold\b/i.test(label)
    || /\b(?:vite project|project files one by one|writing project files|bare vite)\b/i.test(label)
  ) {
    return { kind: 'scaffold', summary: label, paths };
  }

  // Heal / remount / syntax (before generic Fix)
  if (
    /\bheal\b/i.test(label)
    || /\b(?:remount|syntax gate|parchment palette|atelier-palette|truncat|jsx-open)\b/i.test(label)
  ) {
    return { kind: 'heal', summary: label, paths };
  }

  // Fix / repair / stall
  if (
    /^fix\b/i.test(label)
    || /\b(?:repair|stalled|step wall|step limit|craft wall|tool loop)\b/i.test(label)
  ) {
    return {
      kind: 'fix',
      summary: label.replace(/^fix\s*[:·-]?\s*/i, '').trim() || label,
      paths,
    };
  }

  // Apply patch / editor apply
  if (
    /\b(?:applying ui patch|editor · apply|apply architect|applying your change|patching)\b/i.test(label)
    || /^apply\b/i.test(label)
  ) {
    return { kind: 'apply', summary: label, paths };
  }

  // Edit path (user asked to change existing project)
  if (
    /\b(?:updating project files|edit ·|re-editing)\b/i.test(label)
    || (/^edit\b/i.test(label) && !/\beditor\b/i.test(label))
  ) {
    return { kind: 'edit', summary: label, paths };
  }

  // Plan / architect outline
  if (
    /\barchitect\b/i.test(label)
    || /^(?:plan)\s*[·•:\-]/i.test(label)
    || /\b(?:plan unique site|outline ready|plan mode|plan ·)\b/i.test(label)
  ) {
    return { kind: 'plan', summary: label, detail: label, paths };
  }

  // Connect / model load / relay / brain
  if (
    /\b(?:loading model|relay ready|single brain|craft on pinned|model load|using .+ for this build|coder reserved|engine)\b/i.test(label)
    || /^connect\b/i.test(label)
  ) {
    return { kind: 'connect', summary: label, paths };
  }

  // Analyze / clinic / triage / deep review
  if (
    /\b(?:debug clinic|deep review|deep ·|triage|clinic ready|pass [123]\s*·|static ·|analyz)\b/i.test(label)
    || /^analyze\b/i.test(label)
  ) {
    return { kind: 'analyze', summary: label, paths };
  }

  // Browse web (distinct from codebase Search)
  if (
    /\b(?:browsing|open(?:ing)? (?:the )?web|layout references|reading sources|comparing sources)\b/i.test(label)
    || /^browse\b/i.test(label)
  ) {
    return { kind: 'browse', summary: label, paths };
  }

  // Web / codebase search
  if (
    /\bsearch(?:ing)?\b/i.test(label)
    || /\bfinding\s+relevant\b/i.test(label)
    || /\bdeep\s+research\b/i.test(label)
    || /\bweb\s+lookup\b/i.test(label)
  ) {
    return {
      kind: 'search',
      summary: label.replace(/^search(?:ing)?\s*[:·-]?\s*/i, '').trim() || label,
      paths,
    };
  }

  // To-dos
  if (/^to-?dos?\b/i.test(label) || /\bto-?dos?\s+\d+\/\d+/i.test(label)) {
    return {
      kind: 'todos',
      summary: label.replace(/^to-?dos?\s*[:·-]?\s*/i, '').trim() || label,
      paths,
    };
  }

  // List / folder / inventory
  if (
    /^(?:list|listing)\b/i.test(label)
    || /\b(?:creating folder|folder in nova projects|listed project|inventory · listing|pass 1 · inventory|setting up the workspace)\b/i.test(label)
    || (/\bprep ·\b/i.test(label) && /\b(?:folder|disk|scaffold|binder)\b/i.test(label))
  ) {
    const summary = label
      .replace(/^(?:list|listing)\s*[:·-]?\s*/i, '')
      .replace(/^creating folder in nova projects\s*/i, '')
      .trim() || label;
    return { kind: 'list', summary, paths };
  }

  // Read files
  if (
    /^(?:read|reading)\b/i.test(label)
    || /\bdeep · reading\b/i.test(label)
    || /\breading your brief\b/i.test(label)
    || (paths.length >= 1 && /\b(?:reading|opened|loaded)\b/i.test(label))
  ) {
    const summary = paths.length
      ? paths.join(', ')
      : label.replace(/^(?:read|reading)\s+/i, '').trim() || label;
    return { kind: 'read', summary, paths };
  }

  // Write / craft files
  if (
    /^(?:write|writing|coding|building|updating)\b/i.test(label)
    || /\b(?:writing src\/|coding src\/|building src\/)\b/i.test(label)
    || /\b(?:placing nav|coding the react|coding page structure|building the product ui)\b/i.test(label)
    || (paths.length >= 1 && /\b(?:writing|coding|building|updating|wiring|linking)\b/i.test(label))
  ) {
    const summary = paths.length
      ? paths.join(', ')
      : label.replace(/^(?:write|writing|coding|building|updating)\s+/i, '').trim() || label;
    return { kind: 'write', summary, paths };
  }

  // Thinking / craft brain / spine beats
  if (
    /\bthinking\b/i.test(label)
    || /^(?:craft|critic)\s*[·•:\-]/i.test(label)
    || /\b(?:single brain|relay ready|preparing craft|understanding the product|mapping sections|coder is working)\b/i.test(label)
    || /^(?:thin create|spine|hard-go|brief)\b/i.test(label)
  ) {
    return { kind: 'thinking', summary: label, detail: label, paths };
  }

  // Default — still show the raw line (never hide work); kind stays honest as Working.
  return { kind: 'work', summary: label, paths };
}

/** Enrich a raw history step with classified activity fields. */
export function enrichActivityStep(step: {
  label: string;
  at: number;
  kind?: ChatActivityKind;
  summary?: string;
  detail?: string;
  runStatus?: ChatActivityRunStatus;
  paths?: string[];
}): ChatActivityStep {
  const classified = classifyStatusActivity(step.label, {
    kind: step.kind,
    summary: step.summary,
    detail: step.detail,
    runStatus: step.runStatus,
    paths: step.paths,
  });
  return {
    label: stripNoise(step.label),
    at: step.at,
    kind: classified.kind,
    summary: classified.summary,
    detail: classified.detail || step.detail,
    runStatus: classified.runStatus ?? step.runStatus ?? null,
    paths: classified.paths?.length ? classified.paths : step.paths,
  };
}

/** True when a status line is noise the user does not need in the Working dropdown. */
function isActivityNoise(label: string, kind: ChatActivityKind | undefined): boolean {
  if (!label || /^done$/i.test(label)) return true;
  if (/thinking \(step|model timed out|step time reached|fix: thinking|build: thinking/i.test(label)) {
    return true;
  }
  if (/^Pass 1 · Inventory · (?:listing|starting)/i.test(label)) return true;
  if (/^Pass 1 · note ·/i.test(label)) return true;
  if (/^Static · /i.test(label)) return true;
  if (/^Pass 2 · Assets ·/i.test(label)) return true;
  if (/^Pass 2 · Static scan ·/i.test(label)) return true;
  if (/^Deep review · batch \d+ skipped/i.test(label)) return true;
  if (/^Deep review · (?:asking|reading files)/i.test(label)) return true;
  // Heartbeat / diag spam that floods the dropdown.
  if (/^tick\b|^heartbeat\b|build diagnostics|diag ·/i.test(label)) return true;
  if (kind === 'work' && label.replace(/\s+/g, '').length < 12) return true;
  // Invent firehose — keep milestones only (Floor/Craft spine rows stay).
  if (
    kind === 'invent'
    && /invent\s+(?:first|large brief|directions|subagent|code-review|score|fork|dir-\d)/i.test(label)
  ) {
    return true;
  }
  if (/^Invent\s*[:·]/i.test(label) && /plan mode recommended|understand plan|dir-\d|subagent|code-review/i.test(label)) {
    return true;
  }
  // Tool-loop / step-wall chatter — one Fix row is enough (coalesced below).
  if (kind === 'fix' && /tool loop|step wall|step limit|craft wall|reading project/i.test(label)) {
    return false; // keep, but coalesce
  }
  return false;
}

/**
 * Collapse noisy consecutive ticks. Prefer one live row per kind when the work is
 * the same phase (spine/heal/install) so the dropdown does not scroll like a firehose.
 */
export function compressActivitySteps(steps: ChatActivityStep[]): ChatActivityStep[] {
  const out: ChatActivityStep[] = [];
  let clinicHeavy = false;
  for (const raw of steps) {
    const step = enrichActivityStep(raw);
    const label = step.label;
    if (isActivityNoise(label, step.kind)) continue;
    if (/^(?:Debug clinic|Pass [123]|Deep ·|Deep review|Clinic ready|Verify ·|Triage ·|Plan ·|Agent ·|Multi-agent ·)/i.test(label)) {
      clinicHeavy = true;
    }

    const prev = out[out.length - 1];
    // Same kind within 4s → update in place (stops identical spam scrolling).
    if (
      prev
      && prev.kind
      && prev.kind === step.kind
      && step.at - prev.at < 4000
      && prev.kind !== 'write'
      && prev.kind !== 'read'
    ) {
      Object.assign(prev, step);
      continue;
    }
    // Spine stages + invent/fix phases: one live row that advances (no stack of Invent×15).
    if (
      prev
      && step.kind
      && prev.kind === step.kind
      && /^(?:spine|floor|craft|heal|install|verify|preview|scaffold|invent|fix|connect|plan|thinking)$/i.test(step.kind)
    ) {
      Object.assign(prev, step);
      continue;
    }
    if (
      prev
      && (prev.kind === 'run' || prev.kind === 'install')
      && (step.kind === 'run' || step.kind === 'install')
    ) {
      const npmBeat = /^(?:npm (?:downloading|still unpacking)|Installing npm packages|Still installing npm|npm · installing)/i;
      if (npmBeat.test(prev.label) && npmBeat.test(label)) {
        Object.assign(prev, step);
        continue;
      }
    }
    if (prev && prev.kind === 'read' && step.kind === 'read') {
      const mergedPaths = [...new Set([...(prev.paths || []), ...(step.paths || [])])].slice(0, 6);
      prev.label = step.label;
      prev.at = step.at;
      prev.summary = mergedPaths.length ? mergedPaths.join(', ') : step.summary;
      prev.paths = mergedPaths;
      prev.detail = step.detail || prev.detail;
      continue;
    }
    if (prev && prev.kind === 'write' && step.kind === 'write') {
      // Coalesce rapid file writes into one Write row with latest path.
      Object.assign(prev, step);
      continue;
    }
    if (prev && prev.kind === step.kind && prev.summary === step.summary) {
      prev.at = step.at;
      if (step.runStatus) prev.runStatus = step.runStatus;
      if (step.detail) prev.detail = step.detail;
      continue;
    }
    if (prev && prev.label === step.label) {
      prev.at = step.at;
      continue;
    }
    out.push(step);
  }

  // Hard cap Invent / Fix rows so the dropdown stays milestone-shaped.
  const capped: ChatActivityStep[] = [];
  let inventSeen = 0;
  let fixSeen = 0;
  for (const step of out) {
    if (step.kind === 'invent') {
      inventSeen += 1;
      if (inventSeen > 2) continue;
    }
    if (step.kind === 'fix') {
      fixSeen += 1;
      if (fixSeen > 2) continue;
    }
    capped.push(step);
  }

  // Keep the trail short and skim-friendly — milestones only, not a firehose.
  return capped.slice(clinicHeavy ? -14 : -8);
}

export function formatWorkingDuration(ms: number, finished: boolean): string {
  const safe = Math.max(0, ms);
  const n = Math.floor(safe / 1000);
  let body: string;
  if (n < 1) body = '<1s';
  else if (n < 60) body = `${n}s`;
  else {
    const m = Math.floor(n / 60);
    const s = n % 60;
    body = `${m}m ${String(s).padStart(2, '0')}s`;
  }
  return finished ? `Worked for ${body}` : `Working for ${body}`;
}

/**
 * Collapsed Working header: show what Nova is doing now (not just elapsed time).
 * Duration stays available via tooltip / finished state.
 */
export function formatLiveWorkingHeader(opts: {
  kind?: string;
  summary?: string;
  maxLen?: number;
}): string {
  const kind = activityKindLabel(String(opts.kind || 'work'));
  const summary = String(opts.summary || '')
    .replace(/\*\*/g, '')
    .replace(/^\s*(?:now\s*[·•:-]\s*)?/i, '')
    .replace(new RegExp(`^${kind}\\s*[:·-]\\s*`, 'i'), '')
    .trim();
  const max = Math.max(40, opts.maxLen ?? 96);
  if (!summary) return kind;
  const line = `${kind} · ${summary}`;
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
