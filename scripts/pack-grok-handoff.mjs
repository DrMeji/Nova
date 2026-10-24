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
  'docs/CHANGELOG.md',
  'docs/CREATE_PIPELINE.md',
  'src/lib/classifyTurn.ts',
  'src/lib/createThinPath.ts',
  'src/lib/createJobStore.ts',
  'src/lib/createReady.ts',
  'src/lib/liveOwnerKey.ts',
  'src/lib/createAskContract.ts',
  'src/lib/createBriefContext.ts',
  'src/lib/createQualityRubric.ts',
  'src/lib/createIdentity.ts',
  'src/lib/createBuildQuality.ts',
  'src/lib/brandAssets.ts',
  'src/lib/chatAgentApply.ts',
  'src/lib/chatTurnHandlers/dispatch.ts',
  'src/lib/chatTurnHandlers/create.ts',
  'src/lib/chatTurnHandlers/edit.ts',
  'src/lib/chatTurnHandlers/chat.ts',
  'src/components/AppShell.tsx',
  'src/views/aichat/AIChatFrame.tsx',
  'src/views/aichat/useAIChatSend.ts',
  'src/views/aichat/useAIChatController.ts',
  'electron/novaBrainApi.cjs',
  'electron/novaPreview.cjs',
  'electron/novaProjects.cjs',
];

/** Large files — extract the sections that own create / Live / send. */
const SLICES = {
  'src/lib/chatTurnHandlers/create.ts': [
    { title: 'thin / invent / Ready gates (head)', start: 1, end: 200 },
  ],
  'src/views/AIChat.tsx': [
    { title: 'module shell / re-exports', start: 1, end: 80 },
  ],
};

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function sliceLines(text, start, end) {
  const lines = text.split(/\r?\n/);
  return lines
    .slice(Math.max(0, start - 1), end)
    .map((line, i) => `${String(start + i).padStart(5, ' ')}|${line}`)
    .join('\n');
}

const pkg = JSON.parse(read('package.json'));
const changelogHead = read('docs/CHANGELOG.md').split(/\r?\n/).slice(0, 90).join('\n');

let body = `# Nova → Grok handoff

Generated: ${new Date().toISOString()}
Package version: ${pkg.version || '?'}
Repo: Nova / Nova-Source (DrMeji)
Workspace: Desktop/Projects/Nova

## Why you're here

Nova is an Electron AI creation studio (chat → write projects on disk → Live preview → follow-up edits).
**Fix Nova only** — never patch user project folders.

### Current ship: v${pkg.version} (Oct 2026)

Create honesty + thin compositional path + Live SSOT + edge sidebar:

| Area | What landed |
|------|-------------|
| **Ready / Abort** | Ready only when Quality Ready; abort polarity fixed; Stop returns; Live chrome uses \`originalBrief\` |
| **Thin invent** | Compositional craft contract; coder-first invent; PageBody drops on rich sections; invent stops when Live+genre clear |
| **Brand / Live** | Apple scrub; ceramic depth; gin≠bare store; sparkles hard-fail for ceramic/chocolate/lotion; genre lock before depth |
| **Disk / Live** | Twin App delete on persist; chat-scoped \`liveOwnerKey\`; ports 5200–5350; blank-fail overlay clears on late mount |
| **After-create** | antiBleed on create brief; polite concrete builds → create; voice refuses builds; hydrate keeps App/css/logo |
| **Shell** | Left edge hover nav (Search…); downloads dock outside pill; no wall clock |

### Architecture map (where to look)

| Job | Path |
|-----|------|
| Turn kind (create/chat/edit) | \`src/lib/classifyTurn.ts\` → \`src/lib/chatTurnHandlers/dispatch.ts\` |
| Create host | \`src/lib/chatTurnHandlers/create.ts\` + \`src/lib/createThinPath.ts\` |
| Create job / abort / Ready | \`src/lib/createJobStore.ts\`, \`src/lib/createReady.ts\` |
| Live ownership | \`src/lib/liveOwnerKey.ts\` |
| Ask / brief / quality | \`createAskContract.ts\`, \`createBriefContext.ts\`, \`createQualityRubric.ts\`, \`createBuildQuality.ts\` |
| Brand / logos / heroes | \`src/lib/brandAssets.ts\` |
| Chat UI / send | \`src/views/aichat/*\` (\`AIChatFrame\`, \`useAIChatSend\`, \`useAIChatController\`) |
| Left rail | \`src/components/AppShell.tsx\` + \`src/index.css\` (\`nova-sidebar-edge\`) |
| Brain HTTP for external apps | \`electron/novaBrainApi.cjs\` @ \`http://127.0.0.1:8787\` (Ollama + OpenAI compat) |
| Live preview | \`electron/novaPreview.cjs\` |

### Changelog head (docs/CHANGELOG.md)

\`\`\`
${changelogHead}
\`\`\`

### Ask Grok for
1. Remaining Ready/Live honesty gaps after the 0.1.338 wave.
2. Whether thin invent still thrash-loops on F&B genre after seed lock.
3. Edge-sidebar polish / a11y without bringing back the wall clock.
4. Next hardening smokes that should gate CI.

### Remotes
- \`origin\` → https://github.com/DrMeji/Nova-Source.git
- \`nova\` → https://github.com/DrMeji/Nova.git

### Brain for VS Code / Cline (free week)
- Keep **NOVA desktop running** (Brain API on :8787).
- Point Cline/Continue at \`http://127.0.0.1:8787\` (Ollama-compat) model \`qwen25-coder-14b\`.
- Do **not** also run standalone Ollama with the same 14B — double-loads VRAM and slows everything.

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
  const lines = text.split(/\r?\n/).length;
  // Cap huge files in the packed dump
  if (lines > 2500) {
    body += `\n### \`${rel}\` (${lines} lines — truncated head 800)\n\n\`\`\`\n${text.split(/\r?\n/).slice(0, 800).join('\n')}\n\n/* … truncated; see repo for full file … */\n\`\`\`\n`;
    continue;
  }
  body += `\n### \`${rel}\` (${lines} lines)\n\n\`\`\`\n${text}\n\`\`\`\n`;
}

for (const [rel, slices] of Object.entries(SLICES)) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  if (FULL_FILES.includes(rel)) continue;
  const text = read(rel);
  const total = text.split(/\r?\n/).length;
  body += `\n---\n\n## \`${rel}\` slices (${total} lines total)\n\n`;
  for (const slice of slices) {
    body += `\n### ${path.basename(rel)} — ${slice.title} (L${slice.start}–${slice.end})\n\n\`\`\`\n${sliceLines(text, slice.start, slice.end)}\n\`\`\`\n`;
  }
}

body += `\n---\n\n## File index tip\nRe-run: \`node scripts/pack-grok-handoff.mjs\`\nChat entry: \`src/views/AIChat.tsx\` + \`src/views/aichat/*\`\nBrain: \`http://127.0.0.1:8787\` while Nova desktop is open\n`;

fs.writeFileSync(outPath, body, 'utf8');
const mb = (Buffer.byteLength(body, 'utf8') / (1024 * 1024)).toFixed(2);
console.log(`Wrote ${outPath} (${mb} MiB, ${body.split(/\r?\n/).length} lines)`);
