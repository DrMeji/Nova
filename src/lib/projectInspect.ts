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

const INSPECT_BUDGET = 14_000;
const INSPECT_FILE_CHARS = 3_600;
const INSPECT_MAX_FILES = 16;

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
    && !/\bwhat is this (project|app|code|folder) about\b/i.test(t)) {
    return false;
  }
  return /\bwhat is this(\s+(project|app|code|folder|repo))?\b/i.test(t)
    || /\bwhat (is|are) this (project|app|code|folder|repo) about\b/i.test(t)
    || /\bwhat does this (project|app|code|folder) do\b/i.test(t)
    || /\btell me (exactly )?what this (project|app|code|folder|repo) is(\s+about)?\b/i.test(t)
    || /\btell me about this (project|app|code|folder|repo)\b/i.test(t)
    || /\bexplain (this|the) (project|app|code|folder|repo)\b/i.test(t)
    || /\bsummarize (this|the) (project|app|code)\b/i.test(t)
    || /\bwalk me through (this|the) (project|app|code|folder|repo)\b/i.test(t)
    || /\bwhat'?s going on (here|in this (project|app|code|folder|repo))\b/i.test(t);
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

export function searchInFiles(files: ProjectFileMap, query: string, limit = 40): SearchHit[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const flat = flattenProjectFiles(files);
  const hits: SearchHit[] = [];
  for (const [rel, content] of Object.entries(flat)) {
    const lines = String(content || '').split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].toLowerCase().includes(q)) continue;
      hits.push({ path: rel, line: i + 1, text: lines[i].trim().slice(0, 220) });
      if (hits.length >= limit) return hits;
    }
  }
  return hits;
}

export function formatSearchHits(query: string, hits: SearchHit[]): string {
  if (!hits.length) {
    return `No matches for “${query}” in this project. Try another word, or open Find in files in Explorer.`;
  }
  return [
    `Find in files · “${query}”`,
    '',
    ...hits.slice(0, 24).map(h => `• \`${h.path}\`:${h.line}  ${h.text}`),
    hits.length > 24 ? `\n…and ${hits.length - 24} more` : '',
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
  for (const path of Object.keys(flat)) {
    if (text.includes(path)) found.add(path);
  }
  return [...found];
}

export function pickFilesForInspect(files: ProjectFileMap, message: string): string[] {
  const flat = flattenProjectFiles(files);
  const keys = Object.keys(flat);
  if (!keys.length) return [];
  const words = keywordsFromMessage(message);
  const scores = new Map<string, number>();

  const bump = (path: string, n: number) => scores.set(path, (scores.get(path) || 0) + n);

  for (const p of ENTRY_CANDIDATES) {
    if (flat[p]) bump(p, 8);
  }
  for (const path of keys) {
    const lower = path.toLowerCase();
    if (/\.(pbxproj|plist)$|Assets\.xcassets|\.xcodeproj\//.test(path)) continue;
    const body = String(flat[path] || '').toLowerCase();
    if (/(^|\/)readme(\.md)?$/i.test(path)) bump(path, 22);
    if (/(engine|models|main|app|crypto|stocks|risk|paper)\.(py|ts|js|swift|kt)$/i.test(lower)) bump(path, 14);
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

  for (const [path, raw] of Object.entries(flat)) {
    const content = String(raw || '');
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (/\bTODO\b|\bFIXME\b/.test(line) && findings.length < 12) {
        findings.push({ path, detail: `Line ${i + 1}: ${line.trim().slice(0, 140)}` });
      }
    });

    if (wantSearch || /search|find/i.test(content)) {
      const hasSearchUi = /search/i.test(content) && /<(button|input|a)\b/i.test(content);
      const hasHandler = /onClick|onSubmit|addEventListener\(|onChange/.test(content);
      if (hasSearchUi && !hasHandler) {
        findings.push({
          path,
          detail: 'Search UI is present but there is no click/submit handler in this file.',
        });
      }
    }

    if (/href\s*=\s*["']#["']/.test(content) && /search|find|button/i.test(content)) {
      findings.push({ path, detail: 'A control uses href="#" with no real navigation or handler.' });
    }
  }

  const seen = new Set<string>();
  return findings.filter(f => {
    const k = `${f.path}:${f.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 8);
}

export function formatLocalFindings(findings: InspectFinding[]): string {
  if (!findings.length) return '';
  return [
    'What I can see from the files:',
    '',
    ...findings.map(f => `• In \`${f.path}\` — ${f.detail}`),
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

  const tree = Object.keys(flat).sort().slice(0, 80).join('\n');
  const local = findings.length
    ? `Local scan hints (verify, do not copy blindly):\n${findings.map(f => `- ${f.path}: ${f.detail}`).join('\n')}`
    : '';

  const rules = mode === 'explain'
    ? `Rules:
- Read the files. In 5–10 sentences, say what this project is, how it is structured, and what the main files do.
- Then offer 2–3 concrete next steps (debug a real issue, a specific improvement, or a file to edit). Use file paths in backticks.
- Do NOT start editing. Do NOT write @@@FILE blocks and do NOT dump whole files.
- Do not repeat the user's wording as the answer.`
    : mode === 'improve'
      ? `Rules:
- Give 4–7 concrete ways to improve this project. Each point: what to change, which file in backticks, and why.
- Do not repeat a full project summary. One short sentence of context is enough.
- Do NOT write @@@FILE blocks and do NOT dump whole files.
- End with: Which of these should I start on?`
      : `Rules:
- Name 2–5 concrete issues with file paths in backticks.
- Be specific (missing onClick, dead button, TODO, broken import).
- End with: Would you like me to fix these, or only list the rest?
- If nothing looks broken, say what the app appears to do and one improvement.`;

  const job = mode === 'explain'
    ? 'Explain the project, then suggest what to do next. Do not edit yet.'
    : mode === 'improve'
      ? 'Propose concrete upgrades from the files.'
      : 'Report findings';

  return `You are ARK reviewing a local project on this PC. ${job} Do NOT write @@@FILE blocks and do NOT dump whole files.

${rules}

Project: ${projectName || 'ARK project'}

File tree (partial):
${tree}

${local}

Selected files:
${chunks.join('\n\n') || '(no files picked)'}

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

/** Honest local summary from the files on disk — does not need the brain. */
export function describeProjectFromFiles(files: ProjectFileMap, projectName?: string): string {
  const flat = flattenProjectFiles(files);
  const keys = Object.keys(flat).sort();
  const count = keys.length;
  if (!count) {
    return 'I do not see any files in Explorer yet. Open a folder with +, then ask again.';
  }
  const readmeKey = keys.find(k => /(^|\/)readme(\.md)?$/i.test(k));
  const readme = readmeKey ? String(flat[readmeKey] || '').replace(/^#+\s+/gm, '').trim() : '';
  const first = readme.split(/\n\n+/).map(p => p.replace(/\s+/g, ' ').trim()).find(p => p.length > 40)?.slice(0, 520);
  const engineKey = keys.find(k => /(^|\/)(engine|main|app|models)\.py$/i.test(k));
  const engineRaw = engineKey ? String(flat[engineKey] || '') : '';
  const engineDoc = (
    engineRaw.match(/"""([\s\S]*?)"""/)?.[1]
    || engineRaw.match(/'''([\s\S]*?)'''/)?.[1]
    || engineRaw.split('\n').filter(line => /^\s*#/.test(line)).slice(0, 6).join(' ')
  ).replace(/\s+/g, ' ').trim().slice(0, 420);

  const swift = keys.some(k => k.endsWith('.swift'));
  const kotlin = keys.some(k => k.endsWith('.kt'));
  const py = keys.filter(k => k.endsWith('.py')).length;
  const html = keys.some(k => /\.html?$/i.test(k) && !/ark-preview/i.test(k));
  const trading = keys.some(k => /(crypto|stock|trade|engine\.py|paper\.py|risk\.py|ingame)/i.test(k));
  let kind = 'a local project';
  if (trading && py) kind = 'a trading / markets app written in Python';
  else if (swift) kind = 'a native iPhone/iPad app (SwiftUI + Xcode)';
  else if (kotlin) kind = 'a native Android app (Kotlin)';
  else if (py) kind = 'a Python project';
  else if (html) kind = 'a website';

  const sample = keys
    .filter(k => !/(^|\/)(\.git|node_modules|__pycache__)\//.test(k))
    .slice(0, 10)
    .map(k => `\`${k}\``)
    .join(', ');

  return [
    `I read ${count} file${count === 1 ? '' : 's'}${projectName && !/^code$/i.test(projectName) ? ` in **${projectName}**` : ''}. This looks like ${kind}.`,
    '',
    first || engineDoc || `Key files: ${sample}.`,
    '',
    'Would you like me to debug it, or start working on a change?',
  ].join('\n');
}
