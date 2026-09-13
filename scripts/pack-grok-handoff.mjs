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
  'src/lib/classifyTurn.ts',
  'src/lib/chatTurnStatusStore.ts',
  'src/lib/pendingStudioBind.ts',
  'src/lib/createProjectFlow.ts',
  'src/lib/localPrefs.ts',
  'src/lib/chatIdeaIntent.ts',
  'src/lib/chatStudio.ts',
  'src/lib/createBuildQuality.ts',
  'src/lib/chatAgentApply.ts',
  'src/lib/createProgressCopy.ts',
  'src/lib/chatCodeReply.ts',
  'src/lib/chatStudioStore.ts',
  'src/lib/postPatchVerify.ts',
  'src/lib/chatMessageRouter.ts',
  'src/components/AgentProgressStatus.tsx',
  'src/components/MediaMessage.tsx',
  'src/index.css',
  'electron/arkProjects.cjs',
  'electron/arkAgentExec.cjs',
  'scripts/check-create-intent.mjs',
  'scripts/live-one-step.mjs',
  'scripts/live-brown-blank.mjs',
];

/** AIChat is huge — extract the sections that own create / bind / status / edit. */
const AICHAT_SLICES = [
  { title: 'bind-studio-disk listener', start: 2460, end: 2520 },
  { title: 'sendMessage start + pending-studio-bind', start: 3505, end: 3560 },
  { title: 'pushAssistantStatus → status store (C1)', start: 3895, end: 3975 },
  { title: 'createIntent + preferPlan force-create (A4)', start: 5085, end: 5190 },
  { title: 'create surgical-before-blank + scaffold-only (A6/B2)', start: 5410, end: 5480 },
  { title: 'multiModelCreate default off (C4)', start: 5525, end: 5550 },
  { title: 'background npm bootstrap (C2)', start: 6585, end: 6660 },
  { title: 'workspace gate + pending bind (B1)', start: 6875, end: 7210 },
  { title: 'micro edit verify soft-keep (B4)', start: 7860, end: 7960 },
  { title: 'code-edit stream status only (C3)', start: 8285, end: 8320 },
  { title: 'keep-building talk only when unbound (B5)', start: 9535, end: 9595 },
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

Nova is an Electron AI creation studio (chat → write projects on disk → follow-up edits).
**Fix Nova only** — never patch user project folders (Nightglass was only a diagnostic target).

### What we just shipped (Tier A–D + post-fix, Sep 2026)

| Tier | Fix |
|------|-----|
| **A–D** | Prior slice (create intent, bind, surgical title, status store, multi-model off, classifyTurn) |
| **Post** | Guest send works; create returns after scaffold (no LLM first paint); sleeps/planning veto removed; \`classifyTurn\` closed kinds + reason; \`hasActiveWorkspace\` pending bind; agent onStep → status store; \`check-classify-turn.mjs\` |

**Template-first create (Option A):** mkdir → scaffold → optional surgical/blank patch → reply → npm background. Model enrich is a follow-up.

Acceptance: \`npm run smoke:create-intent\` + \`npm run smoke:classify-turn\`

### Ask Grok for
1. Review template-first create — still too much left in AIChat ladder?
2. Remaining if-else branches that can override classifyTurn.
3. Next: move create/edit/plan into \`src/lib/chatTurnHandlers/\`.
4. Whether Option B agent loop should only run when patcher returns empty + capable model.

### Remotes
- \`origin\` → https://github.com/DrMeji/Nova-Source.git
- \`nova\` → https://github.com/DrMeji/Nova.git

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
