import fs from 'fs';

const path =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
let t = fs.readFileSync(path, 'utf8');
const existing = new Set(
  [...t.matchAll(/capability: '([^']+)'/g)].map((m) => m[1].toLowerCase()),
);

const rows = [
  ['Invent createStorefrontFloor', 'product', 'strong', 'Nova', 'storefront floor', 'wired'],
  ['Invent createRuntime', 'coding', 'strong', 'Nova', 'createRuntime', 'wired'],
  ['Invent codingAgentPack', 'coding', 'strong', 'Nova', 'codingAgentPack', 'wired'],
  ['Invent agentHarness r7r10', 'coding', 'strong', 'Nova', 'agentHarness/r7r10', 'wired'],
  ['Invent agentHarness p0', 'coding', 'strong', 'Nova', 'agentHarness/p0', 'wired'],
  ['Invent agentHarness p1', 'coding', 'strong', 'Nova', 'agentHarness/p1', 'wired'],
  ['Invent agentHarness p2', 'coding', 'strong', 'Nova', 'agentHarness/p2', 'wired'],
  ['Copilot Chat invent inline', 'coding', 'weak', 'GitHub Copilot', 'Inline chat', 'Partial'],
  ['Copilot Completions invent NES', 'coding', 'partial', 'Copilot', 'Ghost text', 'NES'],
  ['Cursor Tab invent predict', 'coding', 'weak', 'Cursor', 'Tab predict', 'NES'],
  ['Cursor Composer invent multi', 'coding', 'weak', 'Cursor', 'Composer multi-file', 'agent loop'],
  ['Cursor Agent invent terminal', 'coding', 'partial', 'Cursor', 'Agent terminal', 'agentRun'],
  ['Cursor Rules invent MDC', 'coding', 'partial', 'Cursor', 'MDC rules', 'Partial'],
  ['Cursor Notepads invent context', 'coding', 'worst', 'Cursor', 'Notepads', 'Missing'],
  ['Cursor Docs invent index', 'coding', 'weak', 'Cursor', '@Docs', 'Partial'],
  ['Cursor Web invent @Web', 'coding', 'partial', 'Cursor', '@Web search', 'webSearch'],
  ['Cursor Git invent @Git', 'coding', 'partial', 'Cursor', '@Git', 'git ops'],
  ['Windsurf Cascade invent flows', 'coding', 'weak', 'Windsurf', 'Cascade flows', 'Partial'],
  ['Windsurf Memories invent', 'coding', 'weak', 'Windsurf', 'Memories', 'threadBrain'],
  ['Windsurf Previews invent', 'coding', 'weak', 'Windsurf', 'In-IDE preview', 'Live'],
  ['Trae invent builder mode', 'coding', 'weak', 'Trae', 'Builder mode', 'trae-builder Acc'],
  ['Trae invent SOLO mode', 'coding', 'weak', 'Trae', 'SOLO agent', 'Partial'],
  ['Kiro invent spec mode', 'coding', 'weak', 'Kiro', 'Spec-driven', 'kiro-spec Acc'],
  ['Kiro invent hooks', 'coding', 'weak', 'Kiro', 'Agent hooks', 'Partial'],
  ['Qoder invent quest mode', 'coding', 'weak', 'Qoder', 'Quest mode', 'quest-mode Acc'],
  ['Qoder invent repo wiki', 'coding', 'worst', 'Qoder', 'Repo wiki', 'Missing'],
  ['Augment invent context engine', 'coding', 'weak', 'Augment', 'Large context eng', 'Partial'],
  ['Augment invent next edit', 'coding', 'weak', 'Augment', 'Next edit', 'NES'],
  ['Supermaven invent completion', 'coding', 'weak', 'Supermaven', 'Fast complete', 'NES'],
  ['Cody invent context filters', 'coding', 'weak', 'Cody', 'Context filters', 'Partial'],
  ['Cody invent unit test gen', 'coding', 'weak', 'Cody', 'Test gen', 'Partial'],
  ['Amazon Q invent transform', 'coding', 'worst', 'Amazon Q', 'Code transform', 'Missing'],
  ['Amazon Q invent custom agents', 'coding', 'weak', 'Amazon Q', 'Custom agents', 'Partial'],
  ['Gemini Code Assist invent smart', 'coding', 'weak', 'Gemini', 'Smart actions', 'Partial'],
  ['Gemini Code Assist invent migrate', 'coding', 'worst', 'Gemini', 'Migrate code', 'Missing'],
  ['Blackbox invent coding', 'coding', 'weak', 'Blackbox AI', 'Blackbox agent', 'Partial'],
  ['Cursor Shadow Workspace invent', 'coding', 'worst', 'Cursor', 'Shadow workspace', 'Missing'],
  ['Cursor Worktrees invent agent', 'coding', 'weak', 'Cursor', 'Git worktrees', 'Partial'],
  ['Cursor Parallel Agents invent', 'coding', 'worst', 'Cursor', 'Parallel agents', 'Missing'],
  ['Cursor Best-of-N invent', 'coding', 'worst', 'Cursor', 'Best-of-N runs', 'Missing'],
  ['Nova invent Acc audit jsonl', 'coding', 'strong', 'Nova', 'coding-audit.jsonl', 'wired'],
  ['Nova invent Live CDP smokes', 'coding', 'strong', 'Nova', '_cdp-* scripts', 'wired'],
  ['Nova invent grade disk scripts', 'coding', 'strong', 'Nova', '_grade-*-disk', 'wired'],
  ['Nova invent invent demo path', 'product', 'strong', 'Nova', 'createInventDemo', 'wired'],
  ['Nova invent thin create path', 'coding', 'strong', 'Nova', 'createThinPath', 'wired'],
  ['Devin Secrets invent vault', 'coding', 'worst', 'Devin', 'Secrets vault', 'Missing'],
  ['Devin Checkpoints invent cloud', 'coding', 'weak', 'Devin', 'Cloud checkpoints', 'createCheckpoint'],
  ['Factory Terminal invent PTY', 'coding', 'weak', 'Factory', 'Full PTY', 'Buffered agentRun'],
  ['Aider Watch invent files', 'coding', 'weak', 'Aider', 'Watch mode', 'Partial'],
  ['Aider Architect invent separate', 'coding', 'partial', 'Aider', 'Separate architect model', 'Architect hop'],
];

const batch = [];
for (const row of rows) {
  if (existing.has(row[0].toLowerCase())) continue;
  existing.add(row[0].toLowerCase());
  batch.push(row);
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

const lines = batch.map(
  ([cap, lane, nova, leader, how, now]) =>
    `  {\n    capability: '${esc(cap)}',\n    lane: '${lane}',\n    nova: '${nova}',\n    leader: '${esc(leader)}',\n    howTheyDoIt: '${esc(how)}',\n    novaNow: '${esc(now)}',\n  },`,
);

const marker = '  // —— STRONG (real Nova wiring) ——';
const idx = t.indexOf(marker);
if (idx < 0) throw new Error('marker missing');
t = `${t.slice(0, idx)}${lines.join('\n')}\n\n${t.slice(idx)}`;
fs.writeFileSync(path, t);
const g = (k) => [...t.matchAll(new RegExp(`nova: '${k}'`, 'g'))].length;
console.log({
  added: batch.length,
  rows: [...t.matchAll(/capability: '/g)].length,
  worst: g('worst'),
  weak: g('weak'),
  partial: g('partial'),
  strong: g('strong'),
});
