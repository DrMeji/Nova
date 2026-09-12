/**
 * Pack a single Grok-ready handoff file from the critical Nova sources.
 * Usage: node scripts/pack-grok-handoff.mjs
 * Output: GROK-HANDOFF.md (project root)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'GROK-HANDOFF.md');

const FULL_FILES = [
  'package.json',
  'src/lib/webProjectCanon.ts',
  'src/lib/chatAgentTurn.ts',
  'src/lib/createProjectIntent.ts',
  'src/lib/createBuildQuality.ts',
  'src/lib/chatAgentApply.ts',
  'src/lib/createProgressCopy.ts',
  'src/lib/chatCodeReply.ts',
  'src/lib/chatStudioStore.ts',
  'src/lib/postPatchVerify.ts',
  'src/components/AgentProgressStatus.tsx',
  'src/index.css',
  'electron/arkProjects.cjs',
  'electron/arkAgentExec.cjs',
  'scripts/live-one-step.mjs',
  'scripts/live-brown-blank.mjs',
];

/** AIChat is huge — extract the sections that own the broken loops. */
const AICHAT_SLICES = [
  { title: 'bind-studio-disk listener', start: 2460, end: 2520 },
  { title: 'sendMessage start + pending-studio-bind', start: 3485, end: 3560 },
  { title: 'pushAssistantStatus throttle', start: 3880, end: 3960 },
  { title: 'workspace gate NO_WORKSPACE_MSG', start: 7110, end: 7140 },
  { title: 'wantsCodeEdit + micro/wording gates', start: 7235, end: 7290 },
  { title: 'fast path finalizeWebEdits micro', start: 7725, end: 7860 },
  { title: 'create blankSolid short-circuit', start: 5365, end: 5420 },
  { title: 'create intentionalBlank Ready gate', start: 6180, end: 6320 },
];

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function sliceLines(text, start, end) {
  const lines = text.split(/\r?\n/);
  return lines.slice(Math.max(0, start - 1), end).map((line, i) => `${String(start + i).padStart(5, ' ')}|${line}`).join('\n');
}

const pkg = JSON.parse(read('package.json'));
const aichat = read('src/views/AIChat.tsx');
const aichatLines = aichat.split(/\r?\n/).length;

let body = `# Nova → Grok handoff

Generated: ${new Date().toISOString()}
Package version: ${pkg.version || '?'}
Repo: Nova / Nova-Source (DrMeji)
Workspace: Desktop/Projects/Nova

## Why you're here

We are stuck in a diagnostic ladder for **Nightglass** (Vite React site under Documents/NOVA Projects/Nightglass). Cursor must NOT patch Nightglass files — only Nova. After each Nova code fix, test with a **new** natural prompt (never reuse the failed wording).

### Recurring failures
1. **UI freeze / desktop hitch** while generating — status line was re-rendering the whole chat every token; dots remounted and blinked in sync.
2. **Status dots** — must ripple 1→2→3 smoothly; remounts + bad delays broke that.
3. **Blank brown create** — multi-model landing build ignored "empty brown shell"; blankSolid path needed; preferPlan/"spin up"/"open" wording missed immediate build.
4. **Add centered words** — "center white words" was misread as **white blank shell** (wiped brown). Surgical micro-edits lost to blankSolid early-return. \`looksLikeCodeEditAsk\` missed "center words that say…". Bind set diskRoot only *after* slow file load → **No workspace yet** in ~50ms.
5. **138ms · NOVA · local patch** on micro-edits is expected (surgical path). Cursor must not fake this by writing Nightglass App.jsx itself.

### Current Nightglass target shape
- Full-viewport brown \`#8B4513\`
- Centered white multi-word title: **Nightglass After Hours**
- No icons/nav (words only for this step)

### Remotes
- \`origin\` → https://github.com/DrMeji/Nova-Source.git
- \`nova\` → https://github.com/DrMeji/Nova.git

### Ask Grok for
1. Hardening so blank-shell vs add-words never confuse again.
2. Reliable workspace bind (hash route + diskRoot) so edits never hit NO_WORKSPACE_MSG falsely.
3. Status UX that never freezes Electron/desktop.
4. Next ladder steps (logo corner, search, bag) without regressions.

---

## Critical source files (full)

`;

for (const rel of FULL_FILES) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    body += `\n### MISSING: \`${rel}\`\n\n`;
    continue;
  }
  const text = read(rel);
  body += `\n### \`${rel}\` (${text.split(/\r?\n/).length} lines)\n\n\`\`\`\n${text}\n\`\`\`\n`;
}

body += `\n---\n\n## \`src/views/AIChat.tsx\` slices (${aichatLines} lines total — too large to paste whole)\n\n`;
for (const slice of AICHAT_SLICES) {
  body += `\n### AIChat.tsx — ${slice.title} (L${slice.start}–${slice.end})\n\n\`\`\`\n${sliceLines(aichat, slice.start, slice.end)}\n\`\`\`\n`;
}

body += `\n---\n\n## File index tip\nRe-run: \`node scripts/pack-grok-handoff.mjs\`\nFull AIChat path: \`src/views/AIChat.tsx\`\n`;

fs.writeFileSync(outPath, body, 'utf8');
const mb = (Buffer.byteLength(body, 'utf8') / (1024 * 1024)).toFixed(2);
console.log(`Wrote ${outPath} (${mb} MiB, ${body.split(/\r?\n/).length} lines)`);
