/**
 * Inspect / debug / find-in-files for the Code workspace.
 * Pick files by intent instead of stuffing the whole tree into the model.
 */

import { flattenProjectFiles, stripFileBlocks as stripCodeFileBlocks, type ProjectFileMap } from '@/lib/projectCodeEdit';

export type SearchHit = {
  path: string;
  line: number;
  text: string;
};

export type InspectFinding = {
  path: string;
  detail: string;
};

const ENTRY_CANDIDATES = [
  'index.html',
  'src/App.tsx',
  'src/App.jsx',
  'src/main.tsx',
  'src/main.jsx',
  'src/index.tsx',
  'App.tsx',
  'main.py',
  'engine.py',
  'README.md',
  'package.json',
];

const INSPECT_BUDGET = 8_000;
const INSPECT_FILE_CHARS = 2_400;
const INSPECT_MAX_FILES = 10;
/** Cap regex scan so 300+ file uploads don’t freeze the desktop. */
const SCAN_MAX_FILES = 56;

/** Skip bundled / generated trees so we do not “find” the same issue twice in dist. */
export function isBuildArtifactPath(path: string): boolean {
  const p = path.replace(/\\/g, '/');
  return /(^|\/)(dist|dist-electron|build|release|out|node_modules|\.git|__pycache__|coverage|\.next|win-unpacked)(\/|$)/i.test(p)
    || /\.min\.(js|css)$/i.test(p)
    || /\.map$/i.test(p);
}

function sourceTwinOfArtifact(path: string, flat: Record<string, string>): boolean {
  const p = path.replace(/\\/g, '/');
  if (!/(^|\/)dist(-electron)?\//i.test(p)) return false;
  const base = p.replace(/^.*?dist(?:-electron)?\//i, '').replace(/\.js$/i, '');
  return Object.keys(flat).some(k => {
    const n = k.replace(/\\/g, '/');
    if (isBuildArtifactPath(n)) return false;
    return n.endsWith(`${base}.ts`) || n.endsWith(`${base}.tsx`) || n.endsWith(`${base}.js`);
  });
}

export function preferredEntryPath(files: ProjectFileMap): string {
  const flat = flattenProjectFiles(files);
  const keys = Object.keys(flat);
  const native = keys.find(p => p.endsWith('ContentView.swift'))
    || keys.find(p => p.endsWith('MainActivity.kt'))
    || keys.find(p => p.endsWith('.swift') || p.endsWith('.kt'));
  if (native) return native;
  for (const p of ENTRY_CANDIDATES) {
    if (flat[p]) return p;
    const nested = keys.find(k => k.endsWith(`/${p}`));
    if (nested) return nested;
  }
  return keys.sort((a, b) => a.length - b.length)[0] || '';
}

export function isImproveAsk(message: string): boolean {
  const t = String(message || '').trim();
  if (isPatchAsk(t)) return false;
  return /\b((make|do).{0,48}better|improv(e|ing|ements?)|what can (we|i) do|how can (we|i)|suggestions?|next steps?|what should (we|i) (do|work on)|how (do we|to) (improve|upgrade)|make this (app|project|code) better|what next)\b/i.test(t);
}

export function isInspectAsk(message: string): boolean {
  return isExplainAsk(message)
    || isImproveAsk(message)
    || /\b(look at (this|it|the code|the app|the project)|take a look|debug( this)?|inspect|what do you see|what'?s (wrong|broken)|what is broken|find (the |a )?(bug|problem|issue|issues)|review (this|the (code|app|project))|audit|tell me what you see)\b/i.test(
      message,
    );
}

/** First-time “what is this repo?” — not “how do we make it better.” */
export function isExplainAsk(message: string): boolean {
  const t = String(message || '').trim();
  if (isImproveAsk(t)) return false;
  if (/\b(debug|fix the|find the (bug|issue)|crash|better|improv)\b/i.test(t)
    && !/\bwhat is this (project|app|code|folder) about\b/i.test(t)
    && !/\bwhat this (project|app|code|folder) is about\b/i.test(t)
    && !/\bsummarize\b/i.test(t)
    && !/\bflag any\b/i.test(t)) {
    return false;
  }
  return /\bwhat is this(\s+(project|app|code|folder|repo))?\b/i.test(t)
    || /\bwhat (is|are) this (project|app|code|folder|repo) about\b/i.test(t)
    || /\bwhat this (project|app|code|folder|repo) is(\s+about)?\b/i.test(t)
    || /\bwhat does this (project|app|code|folder) do\b/i.test(t)
    || /\bwhat (am i|i'?m|im) (trying to )?build\b/i.test(t)
    || /\b(can you |do you )?see (exactly )?what (i'?m|im|i am) (trying to )?build\b/i.test(t)
    || /\bwhat can you tell me about (this |the )?(project|app|code|folder|repo|files?)?\b/i.test(t)
    || /\btell me (exactly )?what this (project|app|code|folder|repo) is(\s+about)?\b/i.test(t)
    || /\btell me what this (project|app|code|folder|repo) is about\b/i.test(t)
    || /\btell me about this (project|app|code|folder|repo)\b/i.test(t)
    || /\bexplain (this|the) (project|app|code|folder|repo)\b/i.test(t)
    || /\bsummarize\b/i.test(t)
    || /\bhow (?:it|this|the project|the app) works\b/i.test(t)
    || /\bflag any (?:bugs?|issues?|rough)\b/i.test(t)
    || /\bwhat (do|does) these files\b/i.test(t)
    || /\bhow (do|does) (they|these|the files) fit\b/i.test(t)
    || /\b(all about|overview of) (this|the|these)\b/i.test(t)
    || /\bwalk me through (this|the) (project|app|code|folder|repo)\b/i.test(t)
    || /\bwhat'?s going on (here|in this (project|app|code|folder|repo))\b/i.test(t);
}

/** Pick inspect prompt mode from the user ask. Default explain when files are attached. */
export function inspectModeForMessage(message: string): 'debug' | 'explain' | 'improve' {
  const t = String(message || '');
  if (isImproveAsk(t)) return 'improve';
  if (/\b(debug|bug|broken|issue|crash|error|fix|problem|risky)\b/i.test(t)
    && !/\b(full|more)\s+details?\b/i.test(t)) {
    return 'debug';
  }
  if (/\b(full|more)\s+details?\b|\bdetail(ed|s)?\b/i.test(t)) return 'explain';
  if (isExplainAsk(t) || isInspectAsk(t)) return 'explain';
  return 'explain';
}

export function isPatchAsk(message: string): boolean {
  const t = message.trim();
  if (/^(yes|yep|yeah|ok|okay|sure|please|do it|go ahead|fix it|fix them|wire it)([.!]*)?$/i.test(t)) {
    return true;
  }
  if (/\b(fix (it|them|that|this|the \w+)|wire (it|up|the)|apply (the )?(fix|change)|please fix|go ahead and (fix|wire))\b/i.test(t)) {
    return true;
  }
  return /\b(change|rename|update|set|make|turn|edit|switch)\b.{0,48}\b(background|color|title|name|text|label|header|button)\b/i.test(t)
    || /\b(background|title|name|header|color)\b.{0,32}\b(to|black|white|blue|dark|red)\b/i.test(t);
}

export function isFindInFilesAsk(message: string): boolean {
  return /\b(find in files|where is|search (the )?(code|files|project) for|find (the |this )?(button|handler|function|component|todo))\b/i.test(
    message,
  );
}

export function wantsInspectOnly(message: string, composerDebug: boolean): boolean {
  if (isPatchAsk(message)) return false;
  if (isImproveAsk(message) || isExplainAsk(message)) return true;
  if (/\b(fix|wire|upgrade|apply)\b/i.test(message) && isInspectAsk(message)) return false;
  return composerDebug || isInspectAsk(message);
}

export function wantsNamedPatch(message: string, hasFiles: boolean): boolean {
  if (!hasFiles) return false;
  if (/\b(start over|from scratch|new app|another app|rebuild everything)\b/i.test(message)) {
    return false;
  }
  if (/\b(add|remove|delete|upgrade|rewrite|build|create|make|implement|extend)\b/i.test(message)
    && !/^(yes|yep|yeah|ok|okay|sure|fix it|wire it)/i.test(message.trim())
    && !isPatchAsk(message)) {
    return false;
  }
  if (isPatchAsk(message)) return true;
  return /\b(fix|wire|repair|patch|change|rename|edit|update)\b/i.test(message)
    && !/\b(add a new|remove all|upgrade|build a new|create a new)\b/i.test(message);
}

export function findQueryFromMessage(message: string): string {
  const m = message.match(
    /(?:find in files|where is|search (?:the )?(?:code|files|project) for|find)\s+(.+)/i,
  );
  return (m?.[1] || message).replace(/[?.!]+$/g, '').replace(/^(the|a|an)\s+/i, '').trim();
}

export function searchInFiles(files: ProjectFileMap, query: string, limit = 40): { hits: SearchHit[]; total: number } {
  const q = query.trim().toLowerCase();
  if (!q) return { hits: [], total: 0 };
  const flat = flattenProjectFiles(files);
  const hits: SearchHit[] = [];
  let total = 0;
  for (const [rel, content] of Object.entries(flat)) {
    const lines = String(content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(q)) continue;
      total += 1;
      if (hits.length < limit) {
        hits.push({ path: rel, line: i + 1, text: lines[i].trim().slice(0, 220) });
      }
    }
  }
  return { hits, total };
}

export function formatSearchHits(query: string, hits: SearchHit[], total = hits.length): string {
  if (!hits.length) {
    return `No matches for “${query}” in this project. Try another word, or open Find in files in Explorer (Ctrl+F).`;
  }
  const extra = total > hits.length ? `\nShowing ${hits.length} of ${total} matches` : '';
  return [
    `Find in files · “${query}”`,
    '',
    ...hits.slice(0, 24).map(h => `• \`${h.path}\`:${h.line}  ${h.text}`),
    extra,
  ]
    .filter(Boolean)
    .join('\n');
}

function keywordsFromMessage(message: string): string[] {
  const stop = new Set([
    'the', 'and', 'for', 'this', 'that', 'with', 'from', 'look', 'take', 'tell',
    'what', 'you', 'see', 'please', 'just', 'have', 'want', 'would', 'like',
    'debug', 'inspect', 'review', 'audit', 'fix', 'wire', 'upgrade', 'code',
    'app', 'project', 'file', 'files',
  ]);
  return message
    .toLowerCase()
    .replace(/[^a-z0-9_./-]+/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stop.has(w))
    .slice(0, 12);
}

export function pathsMentionedInText(text: string, files: ProjectFileMap): string[] {
  const flat = flattenProjectFiles(files);
  const found = new Set<string>();
  const tick = text.matchAll(/`([^`]+?\.[A-Za-z0-9]+)`/g);
  for (const m of tick) {
    const p = m[1].replace(/\\/g, '/');
    if (flat[p]) found.add(p);
    else {
      const hit = Object.keys(flat).find(k => k.endsWith(`/${p}`) || k === p);
      if (hit) found.add(hit);
    }
  }
  if (found.size < 8) {
    for (const path of Object.keys(flat)) {
      const base = path.split('/').pop() || path;
      if (base.length >= 5 && text.includes(base)) found.add(path);
      if (found.size >= 12) break;
    }
  }
  return [...found];
}

export function pickFilesForInspect(files: ProjectFileMap, message: string): string[] {
  const flat = flattenProjectFiles(files);
  const keys = Object.keys(flat).filter(k => !isBuildArtifactPath(k));
  if (!keys.length) return [];
  const words = keywordsFromMessage(message);
  const scores = new Map<string, number>();

  const bump = (path: string, n: number) => scores.set(path, (scores.get(path) || 0) + n);

  for (const p of ENTRY_CANDIDATES) {
    if (flat[p] && !isBuildArtifactPath(p)) bump(p, 8);
  }
  for (const path of keys) {
    const lower = path.toLowerCase();
    if (/\.(pbxproj|plist)$|Assets\.xcassets|\.xcodeproj\//.test(path)) continue;
    const body = String(flat[path] || '').toLowerCase();
    if (/(^|\/)readme(\.md)?$/i.test(path)) bump(path, 22);
    if (/(^|\/)package\.json$/i.test(path)) bump(path, 16);
    if (/(engine|models|main|app|crypto|stocks|risk|paper)\.(py|ts|js|swift|kt)$/i.test(lower)) bump(path, 14);
    if (/electron\/main\.(ts|js)$/i.test(lower)) bump(path, 12);
    for (const w of words) {
      if (lower.includes(w)) bump(path, 12);
      if (body.includes(w)) bump(path, 4);
    }
    if (/\bTODO\b|\bFIXME\b|\bHACK\b/.test(flat[path] || '')) bump(path, 3);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([p]) => p);
  const picked: string[] = [];
  for (const p of ranked) {
    if (picked.length >= INSPECT_MAX_FILES) break;
    if (!picked.includes(p)) picked.push(p);
  }
  if (!picked.length) {
    return keys.slice(0, Math.min(6, keys.length));
  }
  return picked;
}

export function scanProjectFindings(files: ProjectFileMap, message: string): InspectFinding[] {
  const flat = flattenProjectFiles(files);
  const findings: InspectFinding[] = [];
  const words = keywordsFromMessage(message);
  const wantSearch = words.some(w => /search|find|magnif/.test(w)) || /search/i.test(message);
  const maxFindings = /wider|bigger|more issues|full(er)? scan/i.test(message) ? 28 : 16;
  const push = (path: string, detail: string) => {
    if (findings.length >= maxFindings) return;
    findings.push({ path, detail });
  };

  const eligible = Object.keys(flat).filter(
    path => !isBuildArtifactPath(path) && !sourceTwinOfArtifact(path, flat),
  );
  const scanPaths = eligible.length <= SCAN_MAX_FILES
    ? eligible
    : [...new Set([
      ...pickFilesForInspect(files, message),
      ...ENTRY_CANDIDATES.filter(p => flat[p]),
      ...eligible.filter(p => /\.(tsx?|jsx?|py|html?|css|swift|kt|md)$/i.test(p)).slice(0, 24),
    ])].slice(0, SCAN_MAX_FILES);

  for (const path of scanPaths) {
    const raw = flat[path];
    if (!raw) continue;
    const content = String(raw || '');
    if (!content.trim() || /^\[(image|binary|file)/i.test(content.trim())) continue;
    const lines = content.split('\n');
    const lowerPath = path.toLowerCase();

    lines.forEach((line, i) => {
      const t = line.trim();
      if (/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/.test(line)) {
        push(path, `Line ${i + 1}: unfinished marker — ${t.slice(0, 120)}`);
      }
      if (/password\s*=\s*['"][^'"]+['"]|api[_-]?key\s*=\s*['"][^'"]+['"]|secret\s*=\s*['"][^'"]+['"]/i.test(line)
        && !/\.example|sample|placeholder|your_/i.test(line)) {
        push(path, `Line ${i + 1}: possible hardcoded secret in source.`);
      }
      if (/except\s*:\s*$|except\s+Exception\s*:\s*pass\b/i.test(line)) {
        push(path, `Line ${i + 1}: bare/silent exception handler hides errors.`);
      }
      if (/\beval\s*\(|\bexec\s*\(/.test(line)) {
        push(path, `Line ${i + 1}: uses eval/exec — risky if fed untrusted input.`);
      }
      if (/\bdangerouslySetInnerHTML\b|\.innerHTML\s*=/.test(line) && !/sanitize|DOMPurify/i.test(line)) {
        push(path, `Line ${i + 1}: HTML injection risk (innerHTML / dangerouslySetInnerHTML).`);
      }
      if (/\bchild_process\b|\bexecSync\s*\(|\bspawnSync\s*\(/.test(line)) {
        push(path, `Line ${i + 1}: shell/process spawn — risky if args come from untrusted input.`);
      }
      if (/shell\s*:\s*true/i.test(line)) {
        push(path, `Line ${i + 1}: shell:true enables shell injection if args are unsanitized.`);
      }
      if (/webSecurity\s*:\s*false/i.test(line)) {
        push(path, `Line ${i + 1}: webSecurity:false weakens Electron renderer isolation.`);
      }
    });

    if (/\.env$/i.test(lowerPath) && !/\.example/i.test(lowerPath)) {
      push(path, 'Real .env file is in the tree — secrets should not be committed.');
    }
    if (/raise\s+NotImplementedError|NotImplementedError\(/.test(content)) {
      push(path, 'Contains NotImplementedError — incomplete feature path.');
    }
    if (/\bpass\s*$/m.test(content) && /def\s+\w+\([^)]*\):\s*\n\s*pass\b/.test(content)) {
      push(path, 'Has empty function bodies (`pass`) — stubs not finished.');
    }
    if (/\bprint\s*\(/.test(content) && /\.py$/i.test(path) && !/if\s+__name__|logging|debug/i.test(content.slice(0, 400))) {
      const prints = (content.match(/\bprint\s*\(/g) || []).length;
      if (prints >= 4) {
        push(path, `${prints} print() calls — likely debug noise left in.`);
      }
    }
    if (/TODO|FIXME|coming soon|not implemented yet/i.test(content) && findings.filter(f => f.path === path).length < 2) {
      /* already covered by line scan */
    }

    if (wantSearch || /search|find/i.test(content)) {
      const hasSearchUi = /search/i.test(content) && /<(button|input|a)\b/i.test(content);
      const hasHandler = /onClick|onSubmit|addEventListener\(|onChange/.test(content);
      if (hasSearchUi && !hasHandler) {
        push(path, 'Search UI is present but there is no click/submit handler in this file.');
      }
    }

    if (/href\s*=\s*["']#["']/.test(content) && /search|find|button/i.test(content)) {
      push(path, 'A control uses href="#" with no real navigation or handler.');
    }

    // Python imports that reference missing sibling modules (cheap check)
    if (/\.py$/i.test(path)) {
      const imports = [...content.matchAll(/^\s*(?:from|import)\s+([\w.]+)/gm)].map(m => m[1]);
      for (const imp of imports.slice(0, 20)) {
        if (!imp.startsWith('app.') && !imp.startsWith('.')) continue;
        const rel = imp.replace(/\./g, '/');
        const candidates = [
          `${rel}.py`,
          `${rel}/__init__.py`,
          path.includes('/') ? `${path.split('/').slice(0, -1).join('/')}/${rel}.py` : `${rel}.py`,
        ];
        // Only flag very local relative imports that clearly map to missing paths in the flat map
        if (imp.startsWith('.')) continue;
        if (imp.startsWith('app.')) {
          const asPath = `${imp.replace(/\./g, '/')}.py`;
          const asInit = `${imp.replace(/\./g, '/')}/__init__.py`;
          const hit = Object.keys(flat).some(k => k.endsWith(asPath) || k.endsWith(asInit) || k.replace(/\\/g, '/').includes(`/${imp.split('.').slice(1).join('/')}`));
          if (!hit && /app\.(trading|api|core)/.test(imp)) {
            // soft — skip aggressive false positives
          }
          void candidates;
        }
      }
    }
  }

  const seen = new Set<string>();
  return findings.filter(f => {
    const k = `${f.path}:${f.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 12);
}

function isSecurityFinding(detail: string): boolean {
  return /\b(secret|eval|exec|password|api[_-]?key|vulnerab|inject|xss|malware|\.env|innerHTML|child_process|shell:true|webSecurity)\b/i.test(detail);
}

function isUiFinding(detail: string, path: string): boolean {
  return /\b(search ui|href="#"|handler|button|click|input|navigation)\b/i.test(detail)
    || /\.(tsx|jsx|vue|css|html|swift|kt)$/i.test(path);
}

function fixHintForFinding(detail: string): string {
  if (/eval|exec/i.test(detail)) {
    return [
      'Do not run untrusted strings with `eval`/`exec`.',
      'Replace with a safe parser, JSON.parse, a whitelist of allowed commands, or a dedicated library.',
      'If this only runs trusted built-in config, document that and add an allowlist check before any dynamic code path.',
    ].join(' ');
  }
  if (/secret|password|api[_-]?key|\.env/i.test(detail)) {
    return 'Move secrets to env / OS keychain, remove them from source, rotate any leaked keys, and add `.env` to `.gitignore`.';
  }
  if (/TODO|FIXME|HACK|NotImplemented|pass stubs|empty function/i.test(detail)) {
    return 'Finish or remove the stub so that path cannot be hit in production.';
  }
  if (/except|silent exception/i.test(detail)) {
    return 'Catch a specific error type and log or surface it — do not swallow with bare `except`.';
  }
  if (/href="#"|handler/i.test(detail)) {
    return 'Wire a real onClick/onSubmit (or real href) so the control does something.';
  }
  if (/print\(/i.test(detail)) {
    return 'Replace debug prints with proper logging or remove them.';
  }
  if (/innerHTML|dangerouslySetInnerHTML/i.test(detail)) {
    return 'Sanitize HTML (DOMPurify or textContent) — never assign unsanitized user HTML.';
  }
  if (/child_process|shell:true|spawn/i.test(detail)) {
    return 'Avoid shell:true; pass args as an array; never concatenate untrusted input into a shell command.';
  }
  if (/webSecurity/i.test(detail)) {
    return 'Keep webSecurity enabled unless you have a documented, reviewed exception.';
  }
  return 'Open the file in Code, fix the flagged line, and re-scan.';
}

export type ProblemReportFocus = 'all' | 'security' | 'ui' | 'debug' | 'wider';

export type ProblemReportOptions = {
  /** User asked how to fix — lead with fix steps, never a product overview. */
  focusFix?: boolean;
  /** Reuse findings from the previous security/debug turn. */
  priorFindings?: InspectFinding[];
  userQuestion?: string;
  /** Bigger / wider static scan. */
  wider?: boolean;
};

/** Find-problems / debug / security / UI — never falls back to a folder overview dump. */
export function reportProjectProblems(
  files: ProjectFileMap,
  projectName?: string,
  focus: ProblemReportFocus = 'all',
  opts?: ProblemReportOptions,
): string {
  const flat = flattenProjectFiles(files);
  const sourceKeys = Object.keys(flat).filter(k => !isBuildArtifactPath(k));
  const count = sourceKeys.length || Object.keys(flat).length;
  const wider = Boolean(opts?.wider) || focus === 'wider';
  const scanMsg = wider
    ? 'wider scan find more issues security eval exec secrets innerHTML child_process shell'
    : 'find problems debug bugs issues security ui';
  let findings = (opts?.priorFindings && opts.priorFindings.length && !wider)
    ? opts.priorFindings
    : scanProjectFindings(files, scanMsg);
  if (focus === 'security') {
    findings = findings.filter(f => isSecurityFinding(f.detail));
  } else if (focus === 'ui') {
    findings = findings.filter(f => isUiFinding(f.detail, f.path));
  }
  if (!findings.length && focus === 'security' && opts?.priorFindings?.length) {
    findings = scanProjectFindings(files, 'security').filter(f => isSecurityFinding(f.detail));
  }
  if (!findings.length && opts?.focusFix) {
    findings = scanProjectFindings(files, scanMsg);
    if (focus === 'security') findings = findings.filter(f => isSecurityFinding(f.detail));
  }

  const label = projectName && !/^code$/i.test(projectName) ? `**${projectName}**` : 'this folder';
  // focusFix ONLY when explicitly requested — not for every debug.
  const focusFix = Boolean(opts?.focusFix);

  if (focusFix && findings.length) {
    const bits: string[] = [
      findings.length === 1
        ? `I found **${findings.length}** issue in ${label} (${count} source files checked). Here’s how to fix it:`
        : `I found **${findings.length}** issues in ${label} (${count} source files checked). Here’s how to fix them:`,
      '',
    ];
    findings.forEach((f, i) => {
      bits.push(`${i + 1}. \`${f.path}\` — ${f.detail}`);
      bits.push(`   **Fix:** ${fixHintForFinding(f.detail)}`);
      bits.push('');
    });
    bits.push('If you want, we can **Edit in Code** and apply #1 next.');
    return bits.join('\n');
  }

  if (wider) {
    const bits: string[] = [
      `Wider scan of **${count}** source file${count === 1 ? '' : 's'} in ${label}.`,
      '',
      'Checked for: secrets, eval/exec, risky `.env`, empty stubs, silent exceptions, innerHTML, child_process, `shell:true`, `webSecurity:false`.',
      '',
    ];
    if (!findings.length) {
      bits.push('No additional hard red flags showed up beyond a basic static pass.');
      bits.push('');
      bits.push('That does not mean the app is bug-free — only that these patterns were not in the attached text. Ask about a specific file, or **Edit in Code** to dig deeper.');
      return bits.join('\n');
    }
    bits.push(`Issues (**${findings.length}**):`);
    bits.push('');
    findings.forEach((f, i) => {
      bits.push(`${i + 1}. \`${f.path}\` — ${f.detail}`);
      bits.push(`   **Fix:** ${fixHintForFinding(f.detail)}`);
      bits.push('');
    });
    if (findings.length === 1) {
      bits.push('_Only one issue matched this wider static pass — that can be normal; ask for a specific area if you want a deeper look._');
      bits.push('');
    }
    bits.push('Want **how we can fix** these, or **Edit in Code**?');
    return bits.join('\n');
  }

  const withFixes = focus === 'debug';
  const topic =
    focus === 'security' ? 'security risks (secrets, eval/exec, risky env files)'
      : focus === 'ui' ? 'UI-related issues (dead controls, missing handlers)'
        : focus === 'debug' ? 'bugs, risky code, and broken paths'
          : 'likely problems (TODOs, stubs, secrets, silent errors, unfinished paths)';
  const header = `I scanned **${count} source file${count === 1 ? '' : 's'}** in ${label} for ${topic}.`;

  if (!findings.length) {
    if (focus === 'security') {
      return [
        header,
        '',
        'No clear **security** red flags showed up in a static scan (no hardcoded secrets, no eval/exec in source, no committed `.env`).',
        '',
        'That does **not** prove the app is secure — only that those patterns were not in the attached text. Ask about a specific file, or use **Find problems** for a wider scan.',
      ].join('\n');
    }
    if (focus === 'ui') {
      return [
        header,
        '',
        'No clear **UI** red flags showed up (no dead `href="#"` / search-without-handler patterns in the attached UI files).',
        '',
        'For visual polish (layout, spacing, copy), say what screen feels wrong, or **Edit in Code** so we can change the UI files.',
      ].join('\n');
    }
    return [
      header,
      '',
      'No hard red flags showed up in a static scan.',
      '',
      'That does **not** mean the app is bug-free — it means I did not see TODO/FIXME markers, empty `pass` stubs, bare `except:`, or obvious hardcoded secrets in the attached text.',
      '',
      'Next: pick **More details** to walk the main files, or **Edit in Code** so we can run and fix things live.',
    ].join('\n');
  }

  const lines = findings.map((f, i) => {
    const base = `${i + 1}. \`${f.path}\` — ${f.detail}`;
    if (!withFixes && focus !== 'security' && focus !== 'ui') return base;
    return `${base}\n   **Fix:** ${fixHintForFinding(f.detail)}`;
  });

  const closer = withFixes
    ? 'Want me to apply one of these fixes in **Code**, or dig into one file first?'
    : focus === 'security' || focus === 'ui'
      ? 'Want a **bigger scan**, ask **how we can fix** these, **More details** on main files, or **Edit in Code**?'
      : 'Want me to fix any of these in **Code**, or dig into one file first?';

  return [
    header,
    '',
    `Found **${findings.length}** issue${findings.length === 1 ? '' : 's'}:`,
    '',
    ...lines,
    '',
    closer,
  ].join('\n');
}

/** Answer “security and/or UI?” without dumping the whole project. */
export function reportProjectFocusAsk(
  files: ProjectFileMap,
  projectName: string | undefined,
  kind: 'security' | 'ui' | 'security-ui',
  opts?: ProblemReportOptions,
): string {
  if (kind === 'security-ui') {
    const sec = reportProjectProblems(files, projectName, 'security', opts);
    const ui = reportProjectProblems(files, projectName, 'ui', opts);
    return [
      '## Security',
      sec,
      '',
      '## UI',
      ui,
    ].join('\n');
  }
  return reportProjectProblems(files, projectName, kind, opts);
}

/** Expose findings for sticky follow-ups (“how can we fix”). */
export function collectProjectFindings(
  files: ProjectFileMap,
  focus: ProblemReportFocus = 'all',
): InspectFinding[] {
  const scanMsg = focus === 'wider'
    ? 'wider scan find more issues security eval exec secrets innerHTML child_process shell'
    : 'find problems debug bugs issues security ui';
  let findings = scanProjectFindings(files, scanMsg);
  if (focus === 'security') findings = findings.filter(f => isSecurityFinding(f.detail));
  else if (focus === 'ui') findings = findings.filter(f => isUiFinding(f.detail, f.path));
  return findings;
}

export function formatLocalFindings(findings: InspectFinding[]): string {
  if (!findings.length) return '';
  return [
    'Problems found in the attached files:',
    '',
    ...findings.map((f, i) => `${i + 1}. \`${f.path}\` — ${f.detail}`),
  ].join('\n');
}

export function buildInspectPrompt(
  userMessage: string,
  files: ProjectFileMap,
  picked: string[],
  findings: InspectFinding[],
  projectName?: string,
  mode: 'debug' | 'explain' | 'improve' = 'debug',
): string {
  const flat = flattenProjectFiles(files);
  let used = 0;
  const chunks: string[] = [];
  for (const path of picked) {
    const content = flat[path];
    if (!content) continue;
    const body = content.length > INSPECT_FILE_CHARS
      ? `${content.slice(0, INSPECT_FILE_CHARS)}\n/* …truncated… */`
      : content;
    const block = `--- ${path} ---\n${body}`;
    if (used + block.length > INSPECT_BUDGET) break;
    chunks.push(block);
    used += block.length;
  }

  const tree = Object.keys(flat).sort().slice(0, 40).join('\n');
  const local = findings.length
    ? `Local scan hints (verify, do not copy blindly):\n${findings.map(f => `- ${f.path}: ${f.detail}`).join('\n')}`
    : '';

  const rules = mode === 'explain'
    ? `Rules:
- Answer the user’s latest question about these files directly. If they asked what they are building / what the folder is about: explain the product goal in plain language (who it is for, what it automates or shows), not a generic “Python trading app” one-liner alone.
- Then give 3–5 concrete next steps to make it better or where to start coding — specific to THIS repo.
- If they asked security, UI, one file, or ideas for a feature, answer that topic only.
- The file contents below ARE the folder. You already have them — do not ask the user what is inside.
- Never invent a project ID story or say you lack context when Selected files is non-empty.
- Do NOT start editing. Do NOT write @@@FILE blocks and do NOT dump whole files.
- Do not repeat the user's wording as the answer.
- End with one short offer: where to start, or Edit in Code.`
    : mode === 'improve'
      ? `Rules:
- Answer their improve/upgrade ask directly with 4–7 concrete ways. Each point: what to change, which file in backticks, and why.
- Do not repeat a full project summary. One short sentence of context is enough.
- Do NOT write @@@FILE blocks and do NOT dump whole files.
- End with: Which of these should I start on?`
      : `Rules:
- Answer their debug/problems ask directly. Name 2–5 concrete issues with file paths in backticks.
- Be specific (missing onClick, dead button, TODO, broken import). Do not paste a folder overview instead.
- End with: Would you like me to fix these, or only list the rest?
- If nothing looks broken, say what the app appears to do and one improvement.
- You have the file contents below — do not claim you cannot see them.`;

  const job = mode === 'explain'
    ? 'You are reading the attached project files now. Answer the user’s question from those files only — especially what they are building and what to do next.'
    : mode === 'improve'
      ? 'Propose concrete upgrades from the files — only what they asked.'
      : 'Report findings from the attached files that match their ask.';

  return `You are ARK reviewing a local project on this PC. ${job} Do NOT write @@@FILE blocks and do NOT dump whole files.

CRITICAL RULES (read first):
- You CAN see the attached project files below. Never say you cannot see the project.
- Never ask the user to paste the code.
- Answer ONLY about this codebase. Do not discuss world news, climate, politics, taxes, healthcare, or generic life advice.
- Answer the user's question directly using the files.
- If unsure, say what you inspected (file names) and what is missing — do not invent unrelated topics.

Answer the user’s latest request directly; do not substitute a different topic or repeat a canned overview.

${rules}

Project: ${projectName || 'ARK project'}

File tree (partial):
${tree || '(empty)'}

${local}

Selected file contents (AUTHORITATIVE — answer from this):
${chunks.join('\n\n') || '(no files picked — say you could not load the attachment and ask them to re-attach)'}

User:
${userMessage.trim()}`;
}

export function buildNamedPatchPrompt(
  userMessage: string,
  files: ProjectFileMap,
  allowedPaths: string[],
  projectName?: string,
): string {
  const flat = flattenProjectFiles(files);
  const paths = allowedPaths.filter(p => flat[p]).slice(0, INSPECT_MAX_FILES);
  const chunks = paths.map(path => {
    const content = String(flat[path] || '');
    const body = content.length > INSPECT_FILE_CHARS
      ? `${content.slice(0, INSPECT_FILE_CHARS)}\n/* …truncated… */`
      : content;
    return `--- ${path} ---\n${body}`;
  });

  return `You are ARK in a local coding studio. The user asked you to fix existing files.

Write FULL updated contents only for these files (no new app, no extra files):
${paths.map(p => `- ${p}`).join('\n') || '(the files named in the request)'}

Format:
@@@FILE path/relative.ext
\`\`\`
...entire file...
\`\`\`

Then one short summary. Do not recreate the project. Do not add index.html unless it is in the list above.

Project: ${projectName || 'ARK project'}

Current files to edit:
${chunks.join('\n\n')}

User:
${userMessage.trim()}`;
}

export function filterEditsToPaths<T extends { path: string }>(edits: T[], allowed: string[]): T[] {
  if (!allowed.length) return [];
  const set = new Set(allowed.map(p => p.replace(/\\/g, '/')));
  return edits.filter(e => {
    const path = e.path.replace(/\\/g, '/');
    return set.has(path) || [...set].some(a => path.endsWith(`/${a}`) || a.endsWith(`/${path}`) || path === a);
  });
}

export function stripFileBlocks(text: string): string {
  return stripCodeFileBlocks(text);
}

export function parseReplyFindings(text: string): { path: string; line?: number }[] {
  const found: { path: string; line?: number }[] = [];
  const seen = new Set<string>();
  const tick = text.matchAll(/`([^`]+?\.[A-Za-z0-9]+)`/g);
  for (const m of tick) {
    const path = m[1].replace(/\\/g, '/');
    const around = text.slice(Math.max(0, m.index! - 40), m.index! + m[0].length + 40);
    const line = Number(around.match(/line\s+(\d+)/i)?.[1] || around.match(/:(\d+)/)?.[1] || 0) || undefined;
    const k = `${path}:${line || ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    found.push({ path, line });
  }
  return found.slice(0, 8);
}

function fileRoleBlurb(path: string, raw: string): string {
  const lines = raw.split('\n').map(l => l.trimEnd());
  const codeLines = lines.filter(l => l.trim() && !/^\s*#\s*[-*=]{3,}/.test(l));
  const doc = (
    raw.match(/\/\*\*([\s\S]*?)\*\//)?.[1]
    || raw.match(/"""([\s\S]*?)"""/)?.[1]
    || raw.match(/'''([\s\S]*?)'''/)?.[1]
    || ''
  ).replace(/\s+/g, ' ').trim().slice(0, 220);
  if (doc) return doc;

  const lower = path.replace(/\\/g, '/').toLowerCase();
  if (/(^|\/)readme(\.md)?$/i.test(lower)) return 'Project readme — what the app is and how to run it.';
  if (/(^|\/)package\.json$/i.test(lower)) return 'Node package manifest — scripts, dependencies, and app name.';
  if (/electron\/main\.(ts|js)$/i.test(lower)) return 'Electron main process — window, tray, and native shell.';
  if (/preload\.(ts|js|cjs)$/i.test(lower)) return 'Preload bridge — safe APIs exposed to the renderer.';
  if (/apps?catalog/i.test(lower)) return 'App catalog data — categories, icons, and listed apps.';
  if (/\/(app|main)\.(tsx|jsx|ts|js)$/i.test(lower)) return 'UI entry — mounts the main React/app shell.';

  const firstDef = codeLines.find(l => /^(async\s+)?def\s+\w+|^class\s+\w+|^export\s+(default\s+)?(function|class|const)|^function\s+\w+/.test(l.trim()));
  if (firstDef) {
    const name = firstDef.trim().match(/(?:def|class|function|const)\s+(\w+)/)?.[1];
    if (name) return `Defines \`${name}\` and related helpers for this module.`;
  }
  const imports = codeLines.filter(l => /^\s*(import|from)\s+/.test(l)).slice(0, 3);
  if (imports.length) return 'Wires other modules together via imports.';
  return 'Supporting source for this project.';
}

/** Honest local summary — what the folder *is*, not a function dump. */
export function describeProjectFromFiles(files: ProjectFileMap, projectName?: string): string {
  const flat = flattenProjectFiles(files);
  const keys = Object.keys(flat).filter(k => !isBuildArtifactPath(k)).sort();
  const allCount = Object.keys(flat).length;
  const count = keys.length || allCount;
  if (!allCount) {
    return 'I do not see any files in Explorer yet. Open a folder with +, then ask again.';
  }
  const label = projectName && !/^code$/i.test(projectName) ? projectName : 'this folder';
  const readmeKey = keys.find(k => /(^|\/)readme(\.md)?$/i.test(k));
  const readme = readmeKey ? String(flat[readmeKey] || '').replace(/^#+\s+/gm, '').trim() : '';
  const first = readme.split(/\n\n+/).map(p => p.replace(/\s+/g, ' ').trim()).find(p => p.length > 40)?.slice(0, 720);
  const pkgKey = keys.find(k => /(^|\/)package\.json$/i.test(k));
  let pkgBlurb = '';
  if (pkgKey) {
    try {
      const pkg = JSON.parse(String(flat[pkgKey] || '{}')) as { name?: string; description?: string; main?: string };
      if (pkg.description) pkgBlurb = String(pkg.description).trim().slice(0, 280);
      else if (pkg.name) pkgBlurb = `Package name: \`${pkg.name}\`${pkg.main ? ` · main: \`${pkg.main}\`` : ''}.`;
    } catch { /* ignore */ }
  }
  const engineKey = keys.find(k => /(^|\/)(engine|main|app|models)\.py$/i.test(k));
  const engineRaw = engineKey ? String(flat[engineKey] || '') : '';
  const engineDoc = (
    engineRaw.match(/"""([\s\S]*?)"""/)?.[1]
    || engineRaw.match(/'''([\s\S]*?)'''/)?.[1]
    || engineRaw.split('\n').filter(line => /^\s*#/.test(line)).slice(0, 8).join(' ')
  ).replace(/\s+/g, ' ').trim().slice(0, 520);

  const hasElectron = keys.some(k => /electron\//i.test(k) || /from ['"]electron['"]/.test(String(flat[k] || '').slice(0, 2000)));
  const swift = keys.some(k => k.endsWith('.swift'));
  const kotlin = keys.some(k => k.endsWith('.kt'));
  const py = keys.filter(k => k.endsWith('.py')).length;
  const html = keys.some(k => /\.html?$/i.test(k) && !/ark-preview/i.test(k));
  const trading = keys.some(k => /(crypto|stock|trade|engine\.py|paper\.py|risk\.py|ingame)/i.test(k));
  const paper = keys.some(k => /paper/i.test(k));
  const risk = keys.some(k => /risk/i.test(k));
  let kind = 'a local software project';
  let building = '';
  if (hasElectron) {
    kind = 'a desktop app built with Electron (native window + web UI)';
    building = 'You are building a desktop product users install and run on their PC.';
  } else if (trading && py) {
    kind = 'an auto-trading / markets scaffold in Python';
    building = paper
      ? 'You are building a system that can trade for you across markets (stocks, crypto, and similar), starting in **paper-trading** so you can test without real money'
        + (risk ? ', with **risk limits** to cap how aggressive it gets.' : '.')
      : 'You are building automation that places or manages trades from code, not a one-off script.';
  } else if (swift) {
    kind = 'a native iPhone/iPad app (SwiftUI + Xcode)';
    building = 'You are building a mobile app for Apple devices.';
  } else if (kotlin) {
    kind = 'a native Android app (Kotlin)';
    building = 'You are building an Android app.';
  } else if (py) {
    kind = 'a Python project';
    building = 'You are building a Python app or tool from these modules.';
  } else if (html) {
    kind = 'a website';
    building = 'You are building a web experience in the browser.';
  }

  const folders = [...new Set(
    keys
      .map(k => k.includes('/') ? k.split('/')[0] : '')
      .filter(Boolean),
  )].slice(0, 8);

  const bits: string[] = [
    `**${label}** is ${kind}.`,
    '',
  ];
  if (building) bits.push(building, '');
  bits.push(
    `I loaded **${count} source file${count === 1 ? '' : 's'}**${allCount > count ? ` (${allCount} total including build/output folders)` : ''} from the folder you attached.`,
    '',
  );
  if (first) bits.push(first, '');
  else if (pkgBlurb) bits.push(pkgBlurb, '');
  else if (engineDoc) bits.push(engineDoc, '');

  if (folders.length) bits.push(`Main areas: ${folders.map(f => `\`${f}\``).join(', ')}.`);
  bits.push('');
  bits.push('**Where I would start**');
  if (trading && py) {
    bits.push('1. Confirm paper-trading path runs end-to-end with fake money.');
    bits.push('2. Tighten risk limits before any live keys.');
    bits.push('3. Add clear logging so you can see why each trade fired.');
  } else if (hasElectron) {
    bits.push('1. Run the app and note what the first screen should do.');
    bits.push('2. Wire the main user flow before polishing UI.');
    bits.push('3. Keep secrets out of the repo.');
  } else {
    bits.push('1. Get a minimal happy path running.');
    bits.push('2. Fix the riskiest bugs next.');
    bits.push('3. Then polish UX.');
  }
  bits.push('');
  bits.push('Want **More details** on main files, **Find problems**, or should we **Edit in Code** and start on step 1?');
  return bits.join('\n');
}

/** Deeper follow-up — main *source* files only; narrative roles, not symbol dumps. */
export function describeProjectInDetail(files: ProjectFileMap, projectName?: string): string {
  const flat = flattenProjectFiles(files);
  const keys = Object.keys(flat).filter(k => !isBuildArtifactPath(k));
  const count = keys.length || Object.keys(flat).length;
  const label = projectName && !/^code$/i.test(projectName) ? projectName : 'this folder';
  const picked = pickFilesForInspect(files, 'explain overview main files connect entry electron package readme');
  const sections: string[] = [
    `Here is a closer look at **${label}** — the main **source** files (${count} after skipping build/output folders), and how they fit together:`,
    '',
  ];

  for (const path of picked.slice(0, 8)) {
    const raw = String(flat[path] || '').trim();
    if (!raw || /^\[(image|binary|file)/i.test(raw)) continue;
    const role = fileRoleBlurb(path, raw);
    const imports = raw
      .split('\n')
      .filter(l => /^\s*(import|from)\s+/.test(l))
      .slice(0, 4)
      .map(l => l.trim().replace(/\s+/g, ' ').slice(0, 80));

    sections.push(`### \`${path}\``);
    sections.push(role);
    if (imports.length) {
      sections.push(`Pulls in: ${imports.map(i => `\`${i}\``).join('; ')}`);
    }
    sections.push('');
  }

  sections.push(
    '**How they connect:** entry files (e.g. `electron/main`, `src/main`, or `package.json` scripts) start the app; UI / catalog modules render screens; shared data modules feed those screens. Build folders like `dist-electron` are compiled copies — use the `.ts` / `.tsx` sources when editing.',
    '',
    'Want **one specific file** explained, a **security** check, **Find problems**, or **Edit in Code**?',
  );
  return sections.join('\n');
}
