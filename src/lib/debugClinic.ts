/**
 * Debug clinic — multi-pass audit of a bound project (inventory → static → deep).
 * Read-only: never writes files. Returns ranked Problem | Fix findings with evidence.
 */

import { flattenProjectFiles, type ProjectFileMap } from '@/lib/projectCodeEdit';
import {
  isBuildArtifactPath,
  preferredEntryPath,
  scanProjectFindings,
  stripRegexLiteralsForScan,
  hasRealDynamicCodeCall,
  hasRealShellTrue,
  hasRealHtmlInjection,
  hasRealExecCall,
  type InspectFinding,
} from '@/lib/projectInspect';
import { arkRoute } from '@/lib/novaRouter';

export type ClinicSeverity = 'critical' | 'high' | 'medium' | 'low';
export type ClinicCategory =
  | 'crash'
  | 'security'
  | 'broken-UI'
  | 'incomplete'
  | 'config'
  | 'quality';

export type ClinicFinding = {
  id: string;
  severity: ClinicSeverity;
  category: ClinicCategory;
  path: string;
  line?: number;
  evidence: string;
  problem: string;
  fix: string;
  confidence: 'high' | 'med' | 'low';
};

export type ClinicInventory = {
  stack: string;
  entrypoints: string[];
  sourceFileCount: number;
  notes: string[];
};

/** Human-readable project read before findings. */
export type ClinicBrief = {
  /** What this project appears to be / do. */
  overview: string;
  /** Professional opener + severity framing before the list. */
  verdict: string;
};

export type ClinicReport = {
  projectName: string;
  fileCount: number;
  scannedCount: number;
  inventory: ClinicInventory;
  brief?: ClinicBrief;
  findings: ClinicFinding[];
  counts: { critical: number; high: number; medium: number; low: number };
};

const SEV_ORDER: Record<ClinicSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const SOURCE_RE = /\.(tsx?|jsx?|mjs|cjs|py|html?|css|scss|swift|kt|java|go|rs|vue|svelte|md|json|toml|ya?ml|svg)$/i;
/** Model deep is optional polish — one file at a time when it runs. */
const DEEP_BATCH = 1;
/** Full-file local deep; only truncate pathological megabyte blobs. */
const DEEP_FILE_CHARS = 400_000;
const DEEP_MODEL_MAX_FILES = 16;
const DEEP_BATCH_TIMEOUT_MS = 40_000;
/** Soft budget for optional model polish only — never cuts local deep. */
const MODEL_POLISH_BUDGET_MS = 3 * 60_000;
/** Soft cap after severity sort — critical/high kept preferentially via sort. */
const FINDING_CAP = 120;
/** Progress: update deep counter every file (coalesced in the status dropdown). */
const DEEP_PROGRESS_EVERY = 1;
const DEEP_PROGRESS_MS = 400;
/** Pathological single-file ceiling for inventory slim. */
const SLIM_FILE_CHARS = 500_000;

const CLINIC_OPEN = '<!--nova-clinic-report-->';
const CLINIC_CLOSE = '<!--/nova-clinic-report-->';
const STATUS_OPEN = '<!--nova-clinic-status-->';
const STATUS_CLOSE = '<!--/nova-clinic-status-->';

export type ClinicStatusStep = { label: string; at: number };


/** Yield so the chat status dropdown can paint between steps. */
async function progressYield(
  onProgress: ((msg: string) => void) | undefined,
  msg: string,
): Promise<void> {
  try {
    onProgress?.(msg);
  } catch { /* ignore UI status errors */ }
  await new Promise<void>((r) => {
    const t = typeof window !== 'undefined' ? window.setTimeout : setTimeout;
    t(r, 0);
  });
}

function shortPath(p: string): string {
  const n = String(p || '').replace(/\\/g, '/');
  if (n.length <= 48) return n;
  const parts = n.split('/');
  if (parts.length <= 2) return n.slice(-48);
  return `…/${parts.slice(-2).join('/')}`;
}

/** Cap giant blobs so inventory never freezes the UI on binary-as-text uploads. */
function slimFilesForClinic(files: ProjectFileMap, maxFileChars = SLIM_FILE_CHARS): ProjectFileMap {
  const flat = flattenProjectFiles(files || {});
  const out: ProjectFileMap = {};
  for (const [path, raw] of Object.entries(flat)) {
    if (isBuildArtifactPath(path)) continue;
    const text = String(raw || '');
    if (!text.trim() || /^\[(image|binary|file)/i.test(text.trim())) continue;
    out[path] = text.length > maxFileChars
      ? `${text.slice(0, maxFileChars)}\n/* …truncated for clinic */`
      : text;
  }
  return out;
}

/** Throttled deep progress: Deep · reading 5/60 · 55 left · App.tsx */
function makeDeepProgressReporter(
  onProgress: ((msg: string) => void) | undefined,
  total: number,
): {
  tick: (done: number, currentPath?: string) => Promise<void>;
  finish: () => Promise<void>;
} {
  let lastAt = 0;
  let lastDone = -1;
  let lastPath = '';
  const emit = async (done: number, currentPath?: string, force = false) => {
    const clamped = Math.min(Math.max(0, done), total);
    const now = Date.now();
    const pathHint = currentPath ? shortPath(currentPath) : '';
    const everyN = clamped === total || clamped === 0 || clamped % DEEP_PROGRESS_EVERY === 0;
    if (!force && !everyN && now - lastAt < DEEP_PROGRESS_MS) return;
    if (
      !force
      && clamped === lastDone
      && pathHint === lastPath
      && now - lastAt < DEEP_PROGRESS_MS
    ) return;
    lastAt = now;
    lastDone = clamped;
    lastPath = pathHint;
    const left = Math.max(0, total - clamped);
    // Prefer "on file N of M" once we've started; 0/M means about to open the first file.
    const label = total === 0
      ? 'Deep · no source files to review'
      : clamped === 0
        ? `Deep · reading 0/${total} · ${total} left`
        : `Deep · reading ${clamped}/${total} · ${left} left${pathHint ? ` · ${pathHint}` : ''}`;
    await progressYield(onProgress, label);
  };
  return {
    tick: (done, currentPath) => emit(done, currentPath),
    finish: () => emit(total, undefined, true),
  };
}

/** Drop findings whose evidence / rule pattern no longer matches the file. */
function verifyFindings(
  findings: ClinicFinding[],
  files: ProjectFileMap,
): ClinicFinding[] {
  const flat = flattenProjectFiles(files || {});
  const keys = Object.keys(flat);
  return findings.filter((f) => {
    // Missing-asset findings must check the whole tree — the href stays in HTML after repair.
    if (/missing asset/i.test(String(f.problem || ''))) {
      return assetRefStillMissing(f, keys);
    }

    const raw = String(flat[f.path] || '');
    let body = raw;
    if (!body) {
      const hit = Object.keys(flat).find((k) => k === f.path || k.endsWith(`/${f.path}`) || f.path.endsWith(`/${k}`));
      if (!hit) return f.confidence === 'high'; // keep high-confidence inventory hits
      body = String(flat[hit] || '');
    }
    // Rule-aware: once a surgical fix removes the pattern, stay gone on every severity.
    if (!rulePatternStillPresent(body, f)) return false;
    if (f.severity !== 'critical' && f.severity !== 'high') {
      return true;
    }
    return evidenceStillPresent(body, f);
  });
}

/** True when a “missing asset” finding’s file still isn’t on disk / in the bind. */
function assetRefStillMissing(f: ClinicFinding, keys: string[]): boolean {
  const fromProblem = String(f.problem || '').match(/missing asset\s+[“"]([^”"]+)[”"]/i)?.[1];
  const fromEvidence = String(f.evidence || '').match(/["']([^"']+\.(?:svg|png|jpe?g|gif|webp|ico))["']/i)?.[1];
  const ref = String(fromProblem || fromEvidence || '').replace(/^\.\//, '').trim();
  if (!ref || /^https?:/i.test(ref) || ref.startsWith('data:')) return false;
  const normPath = String(f.path || '').replace(/\\/g, '/');
  const base = normPath.includes('/') ? normPath.replace(/\/[^/]+$/, '/') : '';
  const candidates = [
    ref.replace(/^\//, ''),
    `${base}${ref}`.replace(/\/+/g, '/'),
    `public/${ref.replace(/^\//, '')}`,
    `src/assets/${ref.split('/').pop()}`,
  ];
  const hit = keys.some((k) => {
    const kn = k.replace(/\\/g, '/');
    return candidates.some((c) => kn === c || kn.endsWith(`/${c}`) || kn.endsWith(c));
  });
  return !hit;
}

/** True when the scanner rule that produced this finding still matches the file bytes. */
function rulePatternStillPresent(body: string, f: ClinicFinding): boolean {
  const problem = String(f.problem || '').toLowerCase();
  if (/button missing type/.test(problem)) {
    return fileHasUntypedButton(body);
  }
  if (/uses `any`|weakens type checking/.test(problem)) {
    return /:\s*any\b|<any>|as\s+any\b/.test(body);
  }
  if (/dynamic code execution|uses eval\/exec|eval\/exec/.test(problem)) {
    if (hasRealDynamicCodeCall(body) || hasRealExecCall(body)) return true;
    return false;
  }
  if (/shell:true/.test(problem)) {
    return hasRealShellTrue(body);
  }
  if (/html injection|innerhtml|dangerouslysetinnerhtml/.test(problem)) {
    return hasRealHtmlInjection(body);
  }
  if (/shell\/process spawn|child_process/.test(problem)) {
    return fileHasRiskySpawn(body);
  }
  if (/missing alt text/.test(problem)) {
    return /<img\b(?![^>]*\balt=)/i.test(body);
  }
  if (/debug console output/.test(problem)) {
    return /\bconsole\.(?:log|debug|info)\s*\(/.test(body);
  }
  if (/readme/i.test(problem) && /missing|no readme/i.test(problem)) {
    return false; // inventory handles readme presence; don't keep stale path notes here
  }
  // Fall through — evidence check handles critical/high; keep others.
  return true;
}

function fileHasUntypedButton(content: string): boolean {
  const re = /<button\b([\s\S]*?)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (!/\btype\s*=/i.test(m[1])) return true;
  }
  return false;
}

function fileHasSecureProcessUse(content: string): boolean {
  return /nova-secure:\s*fixed-argv/i.test(content)
    || /\bexecFile\s*\(/.test(content);
}

function fileHasRiskySpawn(content: string): boolean {
  if (hasRealShellTrue(content)) return true;
  // Agent surgical harden stamps nova-secure / execFile — treat the module as mitigated.
  if (fileHasSecureProcessUse(content)) return false;
  return (
    (/\b(?:execSync|spawnSync|spawn)\s*\(\s*['"`][^'"`]+['"`]\s*[,)]/.test(content)
      && !/\b(?:execSync|spawnSync|spawn)\s*\(\s*['"`][^'"`]+['"`]\s*,\s*\[/.test(content))
    || (/\bchild_process\b/.test(content)
      && (/\bexec\s*\(\s*['"`]/.test(content) || /shell\s*:\s*true/i.test(content)))
  );
}

function evidenceStillPresent(body: string, f: ClinicFinding): boolean {
  const evidence = String(f.evidence || '').trim();
  if (evidence && evidence.length >= 6) {
    const needle = evidence.slice(0, 80);
    if (body.includes(needle) || body.includes(evidence.slice(0, 40))) return true;
  }
  if (typeof f.line === 'number' && f.line > 0) {
    const lines = body.split('\n');
    const line = lines[f.line - 1] || '';
    if (!line.trim()) return false;
    // Line exists; if we have problem keywords, soft-check
    const tokens = String(f.problem || '')
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 4)
      .slice(0, 3);
    if (!tokens.length) return true;
    const lower = line.toLowerCase();
    return tokens.some((t) => lower.includes(t) || body.toLowerCase().includes(t));
  }
  // No line/evidence — keep medium-confidence and above from static patterns
  return f.confidence !== 'low';
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function eligiblePaths(files: ProjectFileMap): string[] {
  const flat = flattenProjectFiles(files);
  return Object.keys(flat)
    .filter((p) => !isBuildArtifactPath(p))
    .filter((p) => {
      const raw = String(flat[p] || '');
      if (!raw.trim() || /^\[(image|binary|file)/i.test(raw.trim())) return false;
      return SOURCE_RE.test(p) || /(^|\/)(Dockerfile|Makefile|\.env)/i.test(p);
    })
    .sort((a, b) => a.length - b.length || a.localeCompare(b));
}

function detectStack(keys: string[], flat: Record<string, string>): string {
  if (keys.some((k) => /electron\//i.test(k) || /from ['"]electron['"]/.test(String(flat[k] || '').slice(0, 1500)))) {
    return 'Electron / desktop';
  }
  if (keys.some((k) => k.endsWith('.swift'))) return 'Swift / Apple';
  if (keys.some((k) => k.endsWith('.kt'))) return 'Kotlin / Android';
  if (keys.some((k) => /(^|\/)vite\.config\./i.test(k))) return 'Vite';
  if (keys.some((k) => /(^|\/)next\.config\./i.test(k))) return 'Next.js';
  if (keys.some((k) => k.endsWith('.tsx') || k.endsWith('.jsx'))) return 'React';
  if (keys.filter((k) => k.endsWith('.py')).length >= 2) return 'Python';
  if (keys.some((k) => /\.html?$/i.test(k))) return 'HTML / static';
  if (keys.some((k) => /(^|\/)package\.json$/i.test(k))) return 'Node / JS';
  return 'Mixed / unknown';
}

function inventoryPass(files: ProjectFileMap, projectName: string): ClinicInventory {
  const flat = flattenProjectFiles(files);
  const keys = Object.keys(flat).filter((k) => !isBuildArtifactPath(k));
  const entry = preferredEntryPath(files);
  const entrypoints = [
    entry,
    ...['package.json', 'index.html', 'src/main.tsx', 'src/App.tsx', 'main.py', 'README.md']
      .map((p) => keys.find((k) => k === p || k.endsWith(`/${p}`)) || '')
      .filter(Boolean),
  ].filter((v, i, a) => v && a.indexOf(v) === i).slice(0, 6);

  const notes: string[] = [];
  if (!keys.length) notes.push('No source files visible after skipping build artifacts.');
  if (!keys.some((k) => /(^|\/)readme(\.md)?$/i.test(k))) notes.push('No README found.');
  if (!keys.some((k) => /(^|\/)package\.json$/i.test(k)) && keys.some((k) => /\.(tsx?|jsx?)$/i.test(k))) {
    notes.push('JS/TS sources present but no package.json.');
  }
  if (keys.length > 0 && keys.length < 3) notes.push('Very thin tree — may be an incomplete scaffold.');
  const emptyHandlers = keys.filter((k) => {
    const c = String(flat[k] || '');
    return /onClick\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}|TODO:\s*implement/i.test(c);
  });
  if (emptyHandlers.length) notes.push(`${emptyHandlers.length} file(s) look like stub UI handlers.`);

  return {
    stack: detectStack(keys, flat),
    entrypoints,
    sourceFileCount: keys.length,
    notes,
  };
}

function readPkgMeta(flat: Record<string, string>): { description?: string; name?: string } {
  const key = Object.keys(flat).find((k) => /(^|\/)package\.json$/i.test(k));
  if (!key) return {};
  try {
    const pkg = JSON.parse(String(flat[key] || '{}')) as { name?: string; description?: string };
    return {
      name: typeof pkg.name === 'string' ? pkg.name.trim() : undefined,
      description: typeof pkg.description === 'string' ? pkg.description.trim() : undefined,
    };
  } catch {
    return {};
  }
}

/** Strip markdown / list chrome so clinic copy stays plain prose. */
function plainClinicProse(text: string): string {
  return String(text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/\s*[•·]\s*/g, ' — ')
    .replace(/\s*(?:→|->|=>)\s*/g, ' to ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function readmeBlurb(flat: Record<string, string>): string {
  const key = Object.keys(flat).find((k) => /(^|\/)readme(\.md)?$/i.test(k));
  if (!key) return '';
  const raw = plainClinicProse(
    String(flat[key] || '')
      .replace(/^#+.*$/gm, '')
      .replace(/```[\s\S]*?```/g, ''),
  );
  if (!raw) return '';
  // Prefer a real sentence; skip leftover list/markup noise.
  const sentence = raw.match(/[A-Za-z][^.!?]{24,200}[.!?]/);
  const pick = (sentence?.[0] || raw.slice(0, 180)).trim();
  if (/[*_`#]|->|→|•/.test(pick)) return '';
  return pick;
}

function uiTitleHint(flat: Record<string, string>): string {
  for (const key of Object.keys(flat)) {
    if (!/\.(tsx?|jsx?|html?)$/i.test(key)) continue;
    const c = String(flat[key] || '');
    const title = c.match(/<title[^>]*>\s*([^<]{2,80})\s*<\/title>/i)?.[1]
      || c.match(/document\.title\s*=\s*['"]([^'"]{2,80})['"]/i)?.[1]
      || c.match(/<(?:h1)[^>]*>\s*([^<{]{2,60})\s*<\/h1>/i)?.[1];
    const clean = plainClinicProse(title || '').trim();
    if (!clean || clean.length < 3 || clean.length > 60) continue;
    if (/https?:|reactjs\.org|invalid-aria|warning|eslint|todo\b/i.test(clean)) continue;
    return clean;
  }
  return '';
}

function purposeFromSignals(projectName: string, keys: string[], flat: Record<string, string>): string {
  const name = projectName.replace(/[-_]+/g, ' ').trim();
  // Paths + source only — skip README so marketing markdown cannot mislabel the product.
  const sourceEntries = Object.entries(flat)
    .filter(([k]) => !/(^|\/)readme(\.md)?$/i.test(k) && !isBuildArtifactPath(k))
    .slice(0, 16)
    .map(([, t]) => String(t).slice(0, 320));
  const blob = [
    name,
    ...keys.slice(0, 40).map((k) => k.replace(/\\/g, '/')),
    ...sourceEntries,
  ].join(' ').toLowerCase();

  if (/\bclinic\s*gym|half[- ]built|intentionally broken|planted bugs\b/.test(blob) || /clinic.?gym/i.test(name)) {
    return `${projectName} is a half-built demo app used to practice finding and fixing real project issues.`;
  }
  if (/\bdebloat|de-bloat|bloat\b/.test(blob) || /debloat/i.test(name)) {
    return `${projectName} looks like a Windows debloat utility — turning off or trimming background services and startup noise, often aimed at gaming or lean desktop performance.`;
  }
  if (/\bcleaner|optimize|tweaker|services?\b/.test(blob) && /\bwindows|win32|powershell|registry\b/.test(blob)) {
    return `${projectName} appears to be a Windows system-tuning / cleanup tool that manages services or performance tweaks.`;
  }
  if (/\btodo|task\b/.test(blob) && /\blist|board|kanban\b/.test(blob)) {
    return `${projectName} looks like a task / to-do style app for organizing work.`;
  }
  if (/\bchat|messenger|discord\b/.test(blob)) {
    return `${projectName} appears to be a chat or messaging-oriented product.`;
  }
  if (/\bshop|store|cart|checkout|ecommerce\b/.test(blob)) {
    return `${projectName} looks like a storefront / commerce experience.`;
  }
  if (/\bdashboard|analytics|metrics\b/.test(blob)) {
    return `${projectName} looks like a dashboard for monitoring or operating data.`;
  }
  if (/\belectron\b/.test(blob) || keys.some((k) => /electron\//i.test(k))) {
    return `${projectName} is a desktop (Electron) app with a local UI shell.`;
  }
  if (keys.some((k) => /(^|\/)vite\.config\./i.test(k)) || keys.some((k) => /\.tsx$/i.test(k))) {
    return `${projectName} is a front-end web app (Vite/React-style) with a focused UI surface.`;
  }
  return `${projectName} is a software project with ${keys.length} source file${keys.length === 1 ? '' : 's'} in the bound tree.`;
}

function buildClinicBrief(
  files: ProjectFileMap,
  projectName: string,
  inventory: ClinicInventory,
  counts: ClinicReport['counts'],
  findingCount: number,
): ClinicBrief {
  const flat = flattenProjectFiles(files);
  const keys = Object.keys(flat).filter((k) => !isBuildArtifactPath(k));
  const pkg = readPkgMeta(flat);
  const fromReadme = readmeBlurb(flat);
  const title = uiTitleHint(flat);
  const purpose = purposeFromSignals(projectName, keys, flat);

  // Richer plain-English overview (white in UI). Stack/entry stay in the meta line too.
  const sourceCount = inventory.sourceFileCount || keys.length;
  const pageCount = keys.filter((k) => /\/pages?\//i.test(k) || /Page\.(jsx?|tsx?)$/i.test(k)).length;
  const componentCount = keys.filter((k) => /\/components?\//i.test(k)).length;
  const hasRouter = keys.some((k) => /react-router|BrowserRouter|createBrowserRouter/i.test(String(flat[k] || '')))
    || keys.some((k) => /(^|\/)App\.(jsx?|tsx?)$/i.test(k));
  const parts: string[] = [plainClinicProse(purpose).replace(/[.]+$/, '')];

  const shapeBits: string[] = [];
  if (inventory.stack) shapeBits.push(`built with ${inventory.stack}`);
  if (inventory.entrypoints[0]) shapeBits.push(`entry at ${inventory.entrypoints[0]}`);
  if (sourceCount > 0) shapeBits.push(`${sourceCount} source file${sourceCount === 1 ? '' : 's'} in the tree`);
  if (shapeBits.length) parts.push(`It is ${shapeBits.join(', ')}`);

  const surfaceBits: string[] = [];
  if (pageCount > 0) surfaceBits.push(`${pageCount} page${pageCount === 1 ? '' : 's'}`);
  if (componentCount > 0) surfaceBits.push(`${componentCount} component${componentCount === 1 ? '' : 's'}`);
  if (hasRouter) surfaceBits.push('client-side routing');
  if (surfaceBits.length) {
    parts.push(`The UI surface includes ${surfaceBits.join(', ')}`);
  }

  const pkgDesc = plainClinicProse(pkg.description || '');
  if (
    pkgDesc.length >= 24
    && pkgDesc.length <= 160
    && !/[*_`#]|->|→|•/.test(pkgDesc)
  ) {
    const bit = pkgDesc.replace(/[.]+$/, '');
    const overlap = bit.slice(0, 20).toLowerCase();
    if (overlap && !parts.join(' ').toLowerCase().includes(overlap)) {
      parts.push(bit);
    }
  } else if (
    fromReadme
    && fromReadme.length >= 40
    && fromReadme.length <= 180
    && !/half[- ]built|practice finding|clinic gym/i.test(parts.join(' '))
  ) {
    const bit = fromReadme.replace(/[.]+$/, '');
    const overlap = bit.slice(0, 24).toLowerCase();
    if (overlap && !parts.join(' ').toLowerCase().includes(overlap)) {
      parts.push(bit);
    }
  } else if (title && !new RegExp(projectName, 'i').test(title)) {
    parts.push(`On-screen titles lean toward “${title}”`);
  }

  let overview = parts
    .map((p) => plainClinicProse(p).replace(/[.]+$/, ''))
    .filter(Boolean)
    .join('. ');
  overview = plainClinicProse(overview).replace(/\s+/g, ' ').trim().replace(/[.]+$/, '') + '.';

  const material = counts.critical + counts.high + counts.medium;
  let health: string;
  if (!findingCount) {
    health = 'No issues found in what was scanned — the tree looks tidy.';
  } else if (counts.critical > 0) {
    health = `I found problems worth fixing soon, including ${counts.critical} critical issue${counts.critical === 1 ? '' : 's'}.`;
  } else if (counts.high > 0 && counts.medium === 0 && counts.low <= 2) {
    health = `Overall this looks like a solid project. Nothing critical or medium showed up — ${counts.high} high and ${counts.low} low to clean up.`;
  } else if (material === 0) {
    health = `Nothing urgent. Only low-priority notes (${counts.low}) — housekeeping more than blockers.`;
  } else {
    const parts: string[] = [];
    if (counts.critical) parts.push(`${counts.critical} critical`);
    if (counts.high) parts.push(`${counts.high} high`);
    if (counts.medium) parts.push(`${counts.medium} medium`);
    if (counts.low) parts.push(`${counts.low} low`);
    health = `Here is what stood out after review: ${parts.join(', ')}.`;
  }

  const verdict = findingCount
    ? [
      `I looked through ${inventory.sourceFileCount || keys.length} files in ${projectName}.`,
      health,
      'Below are the issues, each with what’s wrong and how to fix it.',
    ].join(' ')
    : [
      `I looked through ${inventory.sourceFileCount || keys.length} files in ${projectName}.`,
      health,
    ].join(' ');

  return { overview, verdict };
}

function lineFromDetail(detail: string): number | undefined {
  const m = detail.match(/Line\s+(\d+)/i);
  return m ? Number(m[1]) : undefined;
}

function categorizeStatic(detail: string, path: string): { severity: ClinicSeverity; category: ClinicCategory } {
  if (/\b(secret|password|api[_-]?key|\.env|eval|exec|innerHTML|dangerouslySetInnerHTML|shell:true|webSecurity|child_process)\b/i.test(detail)) {
    return { severity: 'critical', category: 'security' };
  }
  if (/NotImplemented|empty function|pass stubs|unfinished marker|coming soon/i.test(detail)) {
    return { severity: 'high', category: 'incomplete' };
  }
  if (/href="#"|handler|Search UI/i.test(detail)) {
    return { severity: 'high', category: 'broken-UI' };
  }
  if (/except|silent exception|generatingRef|beginChatInflight|__generating__/i.test(detail)) {
    return { severity: 'high', category: 'crash' };
  }
  if (/\.env|config/i.test(detail) || /\.(json|ya?ml|toml|env)/i.test(path)) {
    return { severity: 'medium', category: 'config' };
  }
  if (/print\(/i.test(detail)) return { severity: 'low', category: 'quality' };
  return { severity: 'medium', category: 'quality' };
}

function fixForStatic(detail: string): string {
  if (/eval|exec/i.test(detail)) {
    return 'Replace eval/exec with a safe parser or allowlisted commands; never run untrusted strings.';
  }
  if (/secret|password|api[_-]?key|\.env/i.test(detail)) {
    return 'Move secrets to env / keychain, remove from source, rotate leaked keys, add `.env` to `.gitignore`.';
  }
  if (/TODO|FIXME|HACK|NotImplemented|pass stubs|empty function/i.test(detail)) {
    return 'Finish the stub or remove the dead path so it cannot run in production.';
  }
  if (/except|silent exception/i.test(detail)) {
    return 'Catch a specific error type and log or surface it — do not swallow with bare `except`.';
  }
  if (/href="#"|handler|Search UI/i.test(detail)) {
    return 'Wire a real onClick/onSubmit (or real href) so the control does something.';
  }
  if (/innerHTML|dangerouslySetInnerHTML/i.test(detail)) {
    return 'Sanitize HTML (DOMPurify) or use textContent — never assign unsanitized user HTML.';
  }
  if (/child_process|shell:true|spawn/i.test(detail)) {
    return 'Avoid shell:true; pass args as an array; never concatenate untrusted input into a shell command.';
  }
  if (/webSecurity/i.test(detail)) {
    return 'Keep webSecurity enabled unless you have a documented, reviewed exception.';
  }
  if (/print\(/i.test(detail)) {
    return 'Replace debug prints with proper logging or remove them.';
  }
  return 'Open the file at the cited line, fix the flagged issue, then re-run Debug.';
}

function staticToFindings(raw: InspectFinding[]): ClinicFinding[] {
  return raw.map((f, i) => {
    const { severity, category } = categorizeStatic(f.detail, f.path);
    const line = lineFromDetail(f.detail);
    const problem = f.detail.replace(/^Line\s+\d+:\s*/i, '').trim() || f.detail;
    return {
      id: `DBG-${String(i + 1).padStart(3, '0')}`,
      severity,
      category,
      path: f.path,
      line,
      evidence: f.detail.slice(0, 220),
      problem: problem.slice(0, 200),
      fix: fixForStatic(f.detail),
      confidence: 'high' as const,
    };
  });
}

function inventoryFindings(inv: ClinicInventory): ClinicFinding[] {
  const out: ClinicFinding[] = [];
  if (inv.sourceFileCount === 0) {
    out.push({
      id: 'DBG-INV-001',
      severity: 'critical',
      category: 'incomplete',
      path: '(project root)',
      evidence: '0 source files after skipping node_modules/dist/.git',
      problem: 'Project tree is empty or only contains build artifacts.',
      fix: 'Bind the real source folder (not dist/node_modules) and re-run Debug.',
      confidence: 'high',
    });
  }
  for (const note of inv.notes) {
    if (/No source files/i.test(note)) continue;
    // Missing README is housekeeping, not a product bug — keep it low so real issues rank first.
    const sev: ClinicSeverity = /incomplete scaffold|thin tree/i.test(note)
      ? 'high'
      : /README/i.test(note)
        ? 'low'
        : 'medium';
    out.push({
      id: `DBG-INV-${String(out.length + 1).padStart(3, '0')}`,
      severity: sev,
      category: /README|package\.json/i.test(note) ? 'config' : 'incomplete',
      path: inv.entrypoints[0] || '(project root)',
      evidence: note,
      problem: note,
      fix: /README/i.test(note)
        ? 'Add a short README describing how to run and what the app does.'
        : /package\.json/i.test(note)
          ? 'Add a package.json with scripts/deps, or confirm this is not a Node project.'
          : 'Fill in missing scaffold files or confirm the bind path is correct.',
      confidence: 'high',
    });
  }
  return out;
}

/** Extra static checks for assets / SVGs / empty styling that inventory alone misses. */
function assetPass(files: ProjectFileMap): ClinicFinding[] {
  const flat = flattenProjectFiles(files);
  const out: ClinicFinding[] = [];
  const keys = Object.keys(flat).filter((k) => !isBuildArtifactPath(k));

  for (const path of keys) {
    const raw = String(flat[path] || '');
    const norm = path.replace(/\\/g, '/');

    if (/\.svg$/i.test(norm)) {
      if (!raw.trim() || raw.trim().length < 40) {
        out.push({
          id: 'DBG-ASSET',
          severity: 'medium',
          category: 'broken-UI',
          path,
          evidence: raw.trim().slice(0, 80) || '(empty file)',
          problem: 'SVG asset is empty or nearly empty — icon will render blank.',
          fix: 'Replace with a complete SVG path set, or remove the dead asset reference.',
          confidence: 'high',
        });
      } else if (!/<svg[\s>]/i.test(raw) && !/<path[\s>]/i.test(raw)) {
        out.push({
          id: 'DBG-ASSET',
          severity: 'medium',
          category: 'broken-UI',
          path,
          evidence: raw.slice(0, 120),
          problem: 'File named .svg but does not contain SVG markup.',
          fix: 'Restore valid SVG markup or rename/remove the file.',
          confidence: 'med',
        });
      }
    }

    if (/\.(png|jpe?g|gif|webp|ico)$/i.test(norm) && /^\[(image|binary|file)/i.test(raw.trim())) {
      // Catalog bind only — skip binary placeholders.
      continue;
    }

    if (/\.(css|scss)$/i.test(norm) && raw.trim().length > 0 && raw.trim().length < 12) {
      out.push({
        id: 'DBG-ASSET',
        severity: 'low',
        category: 'quality',
        path,
        evidence: raw.trim(),
        problem: 'Stylesheet is essentially empty.',
        fix: 'Add real styles or delete the unused stylesheet and its imports.',
        confidence: 'med',
      });
    }

    // Broken relative asset refs in source
    if (/\.(tsx?|jsx?|html?|css|vue|svelte)$/i.test(norm)) {
      const refs = raw.matchAll(/(?:src|href)=["']([^"']+\.(?:svg|png|jpe?g|gif|webp|ico))["']/gi);
      for (const m of refs) {
        const ref = String(m[1] || '').replace(/^\.\//, '');
        if (!ref || /^https?:/i.test(ref) || ref.startsWith('data:')) continue;
        const base = norm.includes('/') ? norm.replace(/\/[^/]+$/, '/') : '';
        const candidates = [
          ref.replace(/^\//, ''),
          `${base}${ref}`.replace(/\/+/g, '/'),
          `public/${ref.replace(/^\//, '')}`,
          `src/assets/${ref.split('/').pop()}`,
        ];
        const hit = keys.some((k) => {
          const kn = k.replace(/\\/g, '/');
          return candidates.some((c) => kn === c || kn.endsWith(`/${c}`) || kn.endsWith(c));
        });
        if (!hit) {
          out.push({
            id: 'DBG-ASSET',
            severity: 'high',
            category: 'broken-UI',
            path,
            evidence: String(m[0]).slice(0, 160),
            problem: `References missing asset “${ref}” — image/icon will 404.`,
            fix: `Add the file at a resolvable path, or update the ${String(m[0]).startsWith('href') ? 'href' : 'src'} to an existing asset.`,
            confidence: 'med',
          });
        }
      }
    }
  }
  return out.slice(0, 80);
}

function parseDeepJson(text: string): Array<Partial<ClinicFinding>> {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fence ? fence[1].trim() : raw;
  const start = body.indexOf('[');
  const end = body.lastIndexOf(']');
  if (start < 0 || end <= start) return [];
  try {
    const arr = JSON.parse(body.slice(start, end + 1));
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function normalizeDeepFinding(row: Partial<ClinicFinding>, fallbackPath: string): ClinicFinding | null {
  const problem = String(row.problem || '').trim();
  if (!problem || problem.length < 8) return null;
  const severity = (['critical', 'high', 'medium', 'low'] as ClinicSeverity[])
    .includes(row.severity as ClinicSeverity)
    ? (row.severity as ClinicSeverity)
    : 'medium';
  const category = (
    ['crash', 'security', 'broken-UI', 'incomplete', 'config', 'quality'] as ClinicCategory[]
  ).includes(row.category as ClinicCategory)
    ? (row.category as ClinicCategory)
    : 'quality';
  return {
    id: 'DBG-TMP',
    severity,
    category,
    path: String(row.path || fallbackPath).slice(0, 200) || fallbackPath,
    line: typeof row.line === 'number' && row.line > 0 ? Math.floor(row.line) : undefined,
    evidence: String(row.evidence || problem).slice(0, 240),
    problem: problem.slice(0, 220),
    fix: String(row.fix || 'Inspect the cited path and correct the issue.').slice(0, 320),
    confidence: row.confidence === 'high' || row.confidence === 'low' ? row.confidence : 'med',
  };
}

function findingRuleFamily(f: ClinicFinding): string {
  const p = String(f.problem || '').toLowerCase();
  if (/eval\/exec|dynamic code execution|\beval\b|\bexec\b/.test(p)) return 'eval-exec';
  if (/button missing type/.test(p)) return 'button-type';
  if (/uses `any`|weakens type/.test(p)) return 'any-cast';
  if (/shell:true/.test(p)) return 'shell-true';
  if (/shell\/process|child_process|spawn/.test(p)) return 'spawn';
  if (/missing alt/.test(p)) return 'img-alt';
  if (/debug console/.test(p)) return 'console';
  if (/readme/.test(p)) return 'readme';
  if (/hardcoded secret|credential/.test(p)) return 'secret';
  if (/innerhtml|dangerouslysetinnerhtml|xss/.test(p)) return 'xss';
  return p.slice(0, 48);
}

function dedupeKey(f: ClinicFinding): string {
  // Same rule + path collapses static vs deep duplicates (and multi-line any spam).
  return `${f.path}|${findingRuleFamily(f)}`;
}

function sortAndCap(findings: ClinicFinding[], cap = FINDING_CAP): ClinicFinding[] {
  const seen = new Set<string>();
  const sorted = [...findings].sort((a, b) => {
    const d = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
    if (d) return d;
    return a.path.localeCompare(b.path);
  });
  const out: ClinicFinding[] = [];
  for (const f of sorted) {
    const k = dedupeKey(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
    if (out.length >= cap) break;
  }
  return out.map((f, i) => ({ ...f, id: `DBG-${String(i + 1).padStart(3, '0')}` }));
}

function countBySeverity(findings: ClinicFinding[]) {
  return {
    critical: findings.filter((f) => f.severity === 'critical').length,
    high: findings.filter((f) => f.severity === 'high').length,
    medium: findings.filter((f) => f.severity === 'medium').length,
    low: findings.filter((f) => f.severity === 'low').length,
  };
}

async function deepPass(opts: {
  files: ProjectFileMap;
  projectName: string;
  preferredModelId?: string;
  onProgress?: (msg: string) => void;
  shouldAbort?: () => boolean;
}): Promise<{ findings: ClinicFinding[]; scannedCount: number }> {
  const flat = opts.files;
  // Local deep: every text source (incl. css/md/json/svg). No file-count cap.
  const paths = Object.keys(flat)
    .filter((p) => SOURCE_RE.test(p) || /(^|\/)(Dockerfile|Makefile|\.env)/i.test(p))
    .sort((a, b) => {
      const score = (p: string) => {
        if (/(^|\/)(App|main|index|Layout)\./i.test(p)) return 0;
        if (/\.(tsx|jsx|vue|svelte)$/i.test(p)) return 1;
        if (/\.html?$/i.test(p)) return 2;
        if (/\.(tsx?|jsx?|mjs|cjs|py)$/i.test(p)) return 3;
        return 4;
      };
      return score(a) - score(b) || a.length - b.length || a.localeCompare(b);
    });
  if (!paths.length) {
    await progressYield(opts.onProgress, 'Deep · no source files to review');
    return { findings: [], scannedCount: 0 };
  }

  const progress = makeDeepProgressReporter(opts.onProgress, paths.length);
  await progress.tick(0);
  const findings: ClinicFinding[] = [];
  for (let i = 0; i < paths.length; i++) {
    if (opts.shouldAbort?.()) break;
    const path = paths[i]!;
    // Show which file we're on before the work (N = current index, 1-based).
    await progress.tick(i + 1, path);
    findings.push(...localDeepFileFindings(path, String(flat[path] || '')));
  }
  await progress.finish();

  // Pass 3b — optional model polish on top app files (best-effort; never cuts local results).
  const modelPaths = paths
    .filter((p) => /\.(tsx?|jsx?|mjs|cjs|py|html?|vue|svelte|swift|kt)$/i.test(p))
    .slice(0, DEEP_MODEL_MAX_FILES);
  const modelDeadline = Date.now() + MODEL_POLISH_BUDGET_MS;
  if (!opts.shouldAbort?.() && modelPaths.length) {
    await progressYield(
      opts.onProgress,
      `Deep · model 0/${modelPaths.length} · ${modelPaths.length} left`,
    );
    let consecutiveTimeouts = 0;
    for (let i = 0; i < modelPaths.length; i += DEEP_BATCH) {
      if (opts.shouldAbort?.()) break;
      if (Date.now() >= modelDeadline) {
        await progressYield(opts.onProgress, 'Deep · model polish wrapped — local review kept');
        break;
      }
      const batch = modelPaths.slice(i, i + DEEP_BATCH);
      const remainingMs = Math.max(8_000, modelDeadline - Date.now());
      const batchTimeout = Math.min(DEEP_BATCH_TIMEOUT_MS, remainingMs);
      const modelDone = Math.min(i + batch.length, modelPaths.length);
      const modelLeft = Math.max(0, modelPaths.length - modelDone);
      await progressYield(
        opts.onProgress,
        `Deep · model ${modelDone}/${modelPaths.length} · ${modelLeft} left · ${shortPath(batch[0] || '')}`,
      );

      const chunks = batch.map((p) => {
        const body = String(flat[p] || '').slice(0, Math.min(DEEP_FILE_CHARS, 12_000));
        return `### ${p}\n\`\`\`\n${body}\n\`\`\``;
      }).join('\n\n');

      const prompt = [
        `Nova Debug Clinic — audit "${opts.projectName}" file ${batch[0]}.`,
        'Find real bugs only: crashes, broken UI, stubs, missing handlers, security. Reply JSON array only:',
        '[{"severity":"critical|high|medium|low","category":"crash|security|broken-UI|incomplete|config|quality","path":"...","line":1,"evidence":"snippet","problem":"one sentence","fix":"how to fix","confidence":"high|med|low"}]',
        'Max 8 items. Prefer real bugs over style nits. Return [] if clean.',
        '',
        chunks,
      ].join('\n');

      try {
        const routed = await withTimeout(
          arkRoute({
            message: prompt,
            kind: 'chat',
            preferredModelId: opts.preferredModelId,
          }),
          batchTimeout,
          `Deep · ${shortPath(batch[0] || '')}`,
        );
        consecutiveTimeouts = 0;
        const parsed = parseDeepJson(String(routed.reply || ''));
        let added = 0;
        for (const row of parsed) {
          const n = normalizeDeepFinding(row, batch[0] || '');
          if (n) {
            findings.push(n);
            added += 1;
          }
        }
        await progressYield(
          opts.onProgress,
          added
            ? `Deep · model ${modelDone}/${modelPaths.length} · ${modelLeft} left · ${added} finding${added === 1 ? '' : 's'}`
            : `Deep · model ${modelDone}/${modelPaths.length} · ${modelLeft} left · clean`,
        );
      } catch {
        consecutiveTimeouts += 1;
        await progressYield(
          opts.onProgress,
          `Deep · model ${modelDone}/${modelPaths.length} · ${modelLeft} left · timed out — kept local`,
        );
        if (consecutiveTimeouts >= 3) {
          await progressYield(opts.onProgress, 'Deep · model unavailable — local review complete');
          break;
        }
      }
    }
  }

  await progressYield(
    opts.onProgress,
    findings.length
      ? `Deep · complete · ${paths.length} files · ${findings.length} signal${findings.length === 1 ? '' : 's'}`
      : `Deep · complete · ${paths.length} files · clean`,
  );
  return { findings, scannedCount: paths.length };
}

/** Deterministic per-file deep checks — always runs; never depends on the model. */
function localDeepFileFindings(path: string, raw: string): ClinicFinding[] {
  const content = String(raw || '');
  if (!content.trim()) return [];
  const out: ClinicFinding[] = [];
  const push = (
    severity: ClinicSeverity,
    category: ClinicFinding['category'],
    problem: string,
    fix: string,
    evidence: string,
    line?: number,
  ) => {
    out.push({
      id: 'DBG-DEEP',
      severity,
      category,
      path,
      line,
      evidence: evidence.slice(0, 220),
      problem: problem.slice(0, 220),
      fix: fix.slice(0, 320),
      confidence: 'high',
    });
  };

  const isCode = /\.(tsx?|jsx?|mjs|cjs)$/i.test(path);
  const isStyle = /\.(css|scss)$/i.test(path);
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const n = idx + 1;
    const t = line.trim();
    if (!t) return;

    if (/throw new Error\(\s*['"](?:TODO|FIXME|not implemented)/i.test(line)) {
      push('high', 'incomplete', 'Throws a not-implemented error — runtime crash path.', 'Implement the feature or remove the throw until ready.', t, n);
    }
    if (isCode && /\bconsole\.(?:log|debug|info)\s*\(/.test(line) && !/eslint-disable/i.test(line)) {
      if (!out.some((f) => f.path === path && /Debug console output/i.test(f.problem))) {
        push('low', 'quality', 'Debug console output left in source.', 'Remove it or gate behind a debug flag / logger.', t.slice(0, 160), n);
      }
    }
    if (isCode && /@ts-ignore|@ts-nocheck|@ts-expect-error/.test(line)) {
      push('medium', 'quality', 'TypeScript error suppressed — type safety disabled on this line.', 'Fix the underlying type issue and remove the suppress comment.', t.slice(0, 160), n);
    }
    if (isCode && /:\s*any\b|<any>|as\s+any\b/.test(line) && !/eslint-disable/i.test(line)) {
      if (!out.some((f) => f.path === path && /Uses `any`/i.test(f.problem))) {
        push('low', 'quality', 'Uses `any` — weakens type checking.', 'Replace with a precise type or `unknown` + narrowing.', t.slice(0, 160), n);
      }
    }
    if (isCode && /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/.test(line)) {
      push('medium', 'incomplete', 'Unfinished work marker left in source.', 'Finish the marked work or remove the marker before shipping.', t.slice(0, 160), n);
    }
    if (isCode && /key=\{(?:i|idx|index)\}/.test(line)) {
      push('medium', 'quality', 'List uses array index as React key — reorder/update bugs.', 'Use a stable unique id from the data item.', t.slice(0, 160), n);
    }
    if (isCode && /<img\b(?![^>]*\balt=)/i.test(line)) {
      push('medium', 'broken-UI', 'Image missing alt text — accessibility gap.', 'Add a meaningful alt (or alt="" if decorative).', t.slice(0, 160), n);
    }
    // Button type is checked on full tags below (multiline-safe) — skip per-line false positives.
    if (isCode && /\bfetch\s*\(/.test(line) && !/\.catch|try\s*\{/.test(lines.slice(Math.max(0, idx - 2), idx + 8).join('\n'))) {
      // Soft signal — only if nearby lines lack catch/try
      const window = lines.slice(idx, Math.min(lines.length, idx + 12)).join('\n');
      if (!/\.catch\s*\(|await\s+.*\n[\s\S]*catch\s*\(/.test(window) && !/try\s*\{/.test(lines.slice(Math.max(0, idx - 3), idx + 1).join('\n'))) {
        push('medium', 'crash', 'fetch() without nearby error handling — network failures can crash the UI.', 'Add try/catch or .catch and surface a user-visible error.', t.slice(0, 160), n);
      }
    }
    if (isStyle && /!important/.test(line)) {
      push('low', 'quality', 'CSS !important — brittle override, hard to maintain.', 'Prefer higher specificity or restructure the cascade.', t.slice(0, 160), n);
    }
  });

  if (/onClick\s*=\s*\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/.test(content) || /onClick\s*=\s*\{\s*\(\)\s*=>\s*undefined\s*\}/.test(content)) {
    push('high', 'broken-UI', 'Empty onClick handler — control does nothing when clicked.', 'Wire a real handler or remove the dead control.', content.match(/onClick\s*=\s*\{[^}]+\}/)?.[0] || 'onClick={() => {}}');
  }
  // Multiline-safe button type check (avoids false positives when type= is on the next line).
  if (isCode && fileHasUntypedButton(content)) {
    const m = content.match(/<button\b[\s\S]*?>/i);
    push(
      'low',
      'quality',
      'Button missing type attribute — may submit forms unexpectedly.',
      'Add type="button" (or submit/reset intentionally).',
      (m?.[0] || '<button').slice(0, 160),
    );
  }
  if (/href=["']#["']/.test(content) && !/preventDefault|onClick/.test(content)) {
    push('high', 'broken-UI', 'Link uses href="#" with no handler — dead navigation.', 'Use a real route/href or attach an onClick that navigates.', 'href="#"');
  }
  if ((/\bTODO\b|\bFIXME\b/.test(content) || /coming soon|not implemented yet/i.test(content))
    && !out.some((f) => /Unfinished work marker/i.test(f.problem))) {
    const m = content.match(/.*(?:\bTODO\b|\bFIXME\b|coming soon|not implemented yet).*/i)
      || content.match(/.*\bTODO\b.*/);
    push('medium', 'incomplete', 'Unfinished work marker left in source.', 'Finish the marked work or remove the marker before shipping.', (m?.[0] || 'TODO').trim().slice(0, 160));
  }
  if (/catch\s*\(\s*\w*\s*\)\s*\{\s*\}/.test(content) || /except\s*:\s*(?:pass|#)/.test(content)) {
    push('high', 'crash', 'Empty catch / bare except swallows failures silently.', 'Log or surface the error; catch a specific type.', content.match(/catch\s*\([^)]*\)\s*\{\s*\}|except\s*:\s*pass/)?.[0] || 'empty catch');
  }
  if (hasRealDynamicCodeCall(content)) {
    const surface = stripRegexLiteralsForScan(content);
    push('critical', 'security', 'Dynamic code execution (eval/Function) can run untrusted input.', 'Replace with a safe parser or allowlisted commands.', surface.match(/\beval\s*\([^)]*\)|new\s+Function\s*\([^)]*\)/)?.[0] || 'eval(');
  }
  if (/(?:api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(content)) {
    push('critical', 'security', 'Hardcoded secret/credential in source.', 'Move to env/keychain, rotate the leaked value, keep secrets out of git.', content.match(/(?:api[_-]?key|secret|password)\s*[:=]\s*['"][^'"]+['"]/i)?.[0]?.slice(0, 120) || 'hardcoded secret');
  }
  if (hasRealHtmlInjection(content)) {
    const surface = stripRegexLiteralsForScan(content);
    push('high', 'security', 'Raw HTML injection surface — XSS risk if input is user-controlled.', 'Sanitize HTML or use textContent / safe components.', surface.match(/\bdangerouslySetInnerHTML\b|\.innerHTML\s*=/)?.[0] || 'innerHTML');
  }
  if (/\.map\s*\(\s*\([^)]*\)\s*=>\s*\{[\s\S]{0,80}return\s+null/.test(content) && /placeholder|coming soon/i.test(content)) {
    push('medium', 'incomplete', 'UI map returns null placeholders — incomplete screen.', 'Render real content or remove the stub section.', 'return null');
  }
  if (/disabled=\{true\}|disabled\s*=\s*true/.test(content) && /TODO|later|temp/i.test(content)) {
    push('low', 'incomplete', 'Control permanently disabled with a temporary note.', 'Enable when ready or hide until the feature ships.', 'disabled={true}');
  }
  if (isCode && /useEffect\s*\(\s*\(\)\s*=>\s*\{\s*\}\s*,\s*\[\s*\]\s*\)/.test(content)) {
    push('low', 'quality', 'Empty useEffect — dead lifecycle hook.', 'Remove it or implement the intended side effect.', 'useEffect(() => {}, [])');
  }
  if (isCode && /\bdebugger\b/.test(content)) {
    push('medium', 'quality', 'debugger statement left in source — will pause DevTools.', 'Remove debugger before shipping.', 'debugger');
  }
  if (isCode && /localhost:\d+|127\.0\.0\.1:\d+/.test(content) && !/vite|import\.meta|defineConfig/i.test(path)) {
    push('medium', 'config', 'Hardcoded localhost URL — breaks outside local dev.', 'Move the base URL to env config.', content.match(/localhost:\d+|127\.0\.0\.1:\d+/)?.[0] || 'localhost');
  }
  if (isCode && /password|secret|token/i.test(content) && /localStorage\.setItem|sessionStorage\.setItem/.test(content)) {
    push('high', 'security', 'Sensitive value written to web storage.', 'Prefer httpOnly cookies / secure storage; never store secrets in localStorage.', 'localStorage/sessionStorage');
  }
  if (/\.json$/i.test(path)) {
    try {
      JSON.parse(content);
    } catch {
      push('high', 'config', 'JSON file does not parse — tooling will fail.', 'Fix the JSON syntax (trailing commas, quotes, brackets).', content.slice(0, 120));
    }
  }

  // Cap per file so one noisy file cannot drown the clinic.
  return out.slice(0, 40);
}

/** Run full clinic audit. Read-only. */
export async function runDebugClinic(opts: {
  files: ProjectFileMap;
  projectName?: string;
  diskRoot?: string | null;
  userMessage?: string;
  preferredModelId?: string;
  onProgress?: (msg: string) => void;
  shouldAbort?: () => boolean;
}): Promise<ClinicReport> {
  const started = Date.now();
  const projectName = String(opts.projectName || opts.diskRoot?.split(/[/\\]/).pop() || 'project').trim() || 'project';

  // Paint immediately — never leave the UI on a vague "preparing" for minutes.
  await progressYield(opts.onProgress, `Pass 1 · Inventory · ${projectName}`);

  const slim = slimFilesForClinic(opts.files || {});
  const sourceKeys = Object.keys(slim);

  const inventory = inventoryPass(slim, projectName);
  await progressYield(
    opts.onProgress,
    `Pass 1 · ${sourceKeys.length} files · ${inventory.stack}`,
  );
  if (opts.shouldAbort?.()) {
    return emptyReport(projectName, sourceKeys.length, inventory);
  }

  const scanList = sourceKeys.filter(
    (p) => SOURCE_RE.test(p) || /(^|\/)(Dockerfile|Makefile|\.env)/i.test(p),
  );
  await progressYield(
    opts.onProgress,
    `Pass 2 · Static · scanning ${scanList.length} files`,
  );

  const staticRaw = scanProjectFindings(
    slim,
    `${opts.userMessage || ''} full clinic audit find problems security bugs incomplete broken UI stubs assets svg icons wider scan`,
  );
  const staticFindings = staticToFindings(staticRaw);
  const invFindings = inventoryFindings(inventory);
  const assetFindings = assetPass(slim);
  await progressYield(
    opts.onProgress,
    staticFindings.length || assetFindings.length
      ? `Pass 2 · ${staticFindings.length + assetFindings.length} static signal${staticFindings.length + assetFindings.length === 1 ? '' : 's'}`
      : 'Pass 2 · static clean',
  );

  let deepFindings: ClinicFinding[] = [];
  let deepScanned = 0;
  if (!opts.shouldAbort?.() && sourceKeys.length > 0) {
    await progressYield(opts.onProgress, `Pass 3 · Deep review · ${scanList.length} files`);
    const deep = await deepPass({
      files: slim,
      projectName,
      preferredModelId: opts.preferredModelId,
      onProgress: opts.onProgress,
      shouldAbort: opts.shouldAbort,
    });
    deepFindings = deep.findings;
    deepScanned = deep.scannedCount;
  }

  const merged = [...invFindings, ...staticFindings, ...assetFindings, ...deepFindings];
  await progressYield(opts.onProgress, 'Verify · confirming findings');
  const verified = verifyFindings(merged, slim);

  await progressYield(opts.onProgress, 'Triage · ranking by severity');
  const findings = sortAndCap(verified);
  const counts = countBySeverity(findings);
  const brief = buildClinicBrief(slim, projectName, inventory, counts, findings.length);
  const elapsedSec = Math.max(1, Math.round((Date.now() - started) / 1000));
  const scannedCount = Math.max(deepScanned, scanList.length);
  await progressYield(
    opts.onProgress,
    findings.length
      ? `Clinic ready · ${findings.length} finding${findings.length === 1 ? '' : 's'} · ${scannedCount} files · ${elapsedSec}s`
      : `Clinic ready · no issues found · ${scannedCount} files · ${elapsedSec}s`,
  );
  return {
    projectName,
    fileCount: sourceKeys.length,
    scannedCount,
    inventory,
    brief,
    findings,
    counts,
  };
}

function emptyReport(projectName: string, fileCount: number, inventory: ClinicInventory): ClinicReport {
  const findings = sortAndCap(inventoryFindings(inventory));
  const counts = countBySeverity(findings);
  return {
    projectName,
    fileCount,
    scannedCount: 0,
    inventory,
    brief: buildClinicBrief({}, projectName, inventory, counts, findings.length),
    findings,
    counts,
  };
}

/** Persist clinic as a comment envelope so chat sanitizers never dump raw JSON.
 *  Optional statusHistory is embedded so the Done dropdown survives app restart. */
export function formatClinicReportMessage(
  report: ClinicReport,
  statusHistory?: ClinicStatusStep[],
): string {
  const payload = {
    projectName: report.projectName,
    fileCount: report.fileCount,
    scannedCount: report.scannedCount,
    inventory: report.inventory,
    brief: report.brief || null,
    findings: report.findings,
    counts: report.counts,
  };
  const parts = [
    CLINIC_OPEN,
    JSON.stringify(payload),
    CLINIC_CLOSE,
  ];
  if (statusHistory?.length) {
    const steps = statusHistory
      .map((s) => ({
        label: String(s.label || '').trim(),
        at: typeof s.at === 'number' ? s.at : Date.now(),
      }))
      .filter((s) => s.label);
    if (steps.length) {
      parts.push(STATUS_OPEN, JSON.stringify(steps), STATUS_CLOSE);
    }
  }
  return parts.join('\n');
}

export function isClinicReportMessage(content: string): boolean {
  return /<!--\s*nova-clinic-report\s*-->/i.test(String(content || ''))
    || /```nova-debug-clinic/i.test(String(content || ''));
}

export function parseClinicStatusHistory(content: string): ClinicStatusStep[] | null {
  const raw = String(content || '');
  const env = raw.match(/<!--\s*nova-clinic-status\s*-->\s*([\s\S]*?)\s*<!--\s*\/nova-clinic-status\s*-->/i);
  if (!env?.[1]) return null;
  try {
    const arr = JSON.parse(env[1].trim()) as ClinicStatusStep[];
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr
      .map((s) => ({
        label: String(s?.label || '').trim(),
        at: typeof s?.at === 'number' ? s.at : Date.now(),
      }))
      .filter((s) => s.label);
  } catch {
    return null;
  }
}

export function parseClinicReportMessage(content: string): ClinicReport | null {
  const raw = String(content || '');
  const env = raw.match(/<!--\s*nova-clinic-report\s*-->\s*([\s\S]*?)\s*<!--\s*\/nova-clinic-report\s*-->/i);
  if (env?.[1]) {
    const parsed = parseClinicReportPayload(env[1].trim());
    if (parsed) return parsed;
  }
  const fence = raw.match(/```nova-debug-clinic\s*([\s\S]*?)```/i);
  if (fence?.[1]) return parseClinicReportPayload(fence[1].trim());
  return null;
}

/** Plain-text summary for history / slimTurnContent. */
export function clinicReportToPlainText(report: ClinicReport): string {
  const { counts, findings } = report;
  const lines = [
    `Debug clinic — ${report.projectName} (${report.fileCount} files)`,
  ];
  if (report.brief?.overview) lines.push(report.brief.overview);
  if (report.brief?.verdict) lines.push(report.brief.verdict);
  lines.push(
    `Severity: ${counts.critical} critical · ${counts.high} high · ${counts.medium} medium · ${counts.low} low`,
    `Stack: ${report.inventory.stack}`,
  );
  if (!findings.length) {
    lines.push('No issues found.');
    return lines.join('\n');
  }
  lines.push('');
  for (const f of findings.slice(0, 12)) {
    lines.push(`${f.id} [${f.severity}] ${f.path}${f.line ? `:${f.line}` : ''}`);
    lines.push(`  Problem: ${f.problem}`);
    lines.push(`  Fix: ${f.fix}`);
  }
  if (findings.length > 12) lines.push(`…and ${findings.length - 12} more`);
  return lines.join('\n');
}

export function parseClinicReportPayload(raw: string): ClinicReport | null {
  try {
    const data = JSON.parse(raw) as ClinicReport;
    if (!data || !Array.isArray(data.findings)) return null;
    const brief = data.brief && typeof data.brief === 'object'
      ? {
        overview: String((data.brief as ClinicBrief).overview || '').trim(),
        verdict: String((data.brief as ClinicBrief).verdict || '').trim(),
      }
      : undefined;
    return {
      projectName: String(data.projectName || 'project'),
      fileCount: Number(data.fileCount) || 0,
      scannedCount: Number(data.scannedCount) || 0,
      inventory: data.inventory || { stack: 'unknown', entrypoints: [], sourceFileCount: 0, notes: [] },
      brief: brief?.overview || brief?.verdict ? brief : undefined,
      findings: data.findings,
      counts: data.counts || countBySeverity(data.findings),
    };
  } catch {
    return null;
  }
}
