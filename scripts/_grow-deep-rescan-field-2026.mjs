/**
 * 2026 field refresh — Devin Desktop, Cursor Max/Background, Copilot agent, etc.
 */
import fs from 'fs';

const path =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
let t = fs.readFileSync(path, 'utf8');
const existing = new Set(
  [...t.matchAll(/capability: '([^']+)'/g)].map((m) => m[1].toLowerCase()),
);

/** @type {Array<[string, 'coding'|'product'|'protocol', 'worst'|'weak'|'partial'|'strong', string, string, string]>} */
const batch = [];
function add(cap, lane, nova, leader, how, now) {
  if (existing.has(cap.toLowerCase())) return;
  existing.add(cap.toLowerCase());
  batch.push([cap, lane, nova, leader, how, now]);
}

const rows = [
  ['Cursor Agent mode default', 'coding', 'partial', 'Cursor', 'Agent default chat', 'agent loop'],
  ['Cursor Ask read-only mode', 'coding', 'strong', 'Cursor / Nova', 'Ask = no edits', 'classifyTurn Ask'],
  ['Cursor Manual file-target mode', 'coding', 'weak', 'Cursor', 'Manual precise files', 'Partial'],
  ['Cursor Background cloud agents', 'coding', 'worst', 'Cursor', 'Async cloud agents', 'Desktop only'],
  ['Cursor Max mode large context', 'coding', 'weak', 'Cursor', 'Max context+tools', 'Partial'],
  ['Cursor Auto-run tools toggle', 'coding', 'partial', 'Cursor', 'YOLO/auto-run', 'Plan/Act'],
  ['Cursor lint detect auto-fix', 'coding', 'partial', 'Cursor', 'Lint→fix in agent', 'syntax gate'],
  ['Cursor MCP in Agent', 'protocol', 'partial', 'Cursor', 'MCP in agent', 'Partial'],
  ['Cursor privacy mode vs cloud', 'product', 'partial', 'Cursor', 'Privacy blocks cloud agents', 'local GGUF'],
  ['Cursor checkpoints review', 'coding', 'partial', 'Cursor', 'Checkpoints', 'createCheckpoint'],
  ['Devin Desktop local agent', 'coding', 'weak', 'Devin Desktop', 'Local agent (ex-Windsurf)', 'Electron agent'],
  ['Devin Desktop cloud delegate', 'coding', 'worst', 'Devin Desktop', 'Cloud VM delegate', 'Missing'],
  ['Devin Agent Command Center', 'coding', 'worst', 'Devin', 'Multi-agent command center', 'Jobs UI soft'],
  ['Devin Local project memory', 'coding', 'weak', 'Devin Local', 'Cross-session memory', 'threadBrain'],
  ['Devin Cloud isolated VM', 'coding', 'worst', 'Devin Cloud', 'Isolated VM tasks', 'Missing'],
  ['Windsurf Cascade legacy rename', 'coding', 'weak', 'Devin Desktop', 'Cascade→Devin Local', 'Partial'],
  ['Copilot coding agent Actions', 'coding', 'worst', 'GitHub Copilot', 'Issue→Actions→draft PR', 'Missing'],
  ['Copilot code review agent', 'coding', 'weak', 'Copilot', 'PR review agent', 'pr-review Acc'],
  ['Copilot deeper review mode', 'coding', 'worst', 'Copilot', 'Deep PR review', 'Missing'],
  ['Copilot initial review selection', 'coding', 'weak', 'Copilot', 'Selection review', 'Partial'],
  ['Claude Code subagents', 'coding', 'weak', 'Claude Code', 'Subagents', 'Partial'],
  ['Claude Code scheduled tasks', 'coding', 'weak', 'Claude Code', 'Scheduled agent', 'automations Acc'],
  ['Claude Code CI integration', 'coding', 'weak', 'Claude Code', 'CI agent tasks', 'ci-autofix Acc'],
  ['Claude Code IDE surfaces', 'coding', 'weak', 'Claude Code', 'IDE+desktop+browser', 'Electron'],
  ['Claude Code AGENTS.md import', 'coding', 'partial', 'Claude Code', '@AGENTS.md', 'Partial'],
  ['Codex parallel cloud jobs', 'coding', 'worst', 'Codex', 'Parallel delegated jobs', 'Missing'],
  ['Codex isolated worktrees', 'coding', 'weak', 'Codex', 'Worktree isolation', 'Partial'],
  ['Codex desktop app surface', 'coding', 'worst', 'Codex', 'Desktop app', 'Nova Desktop'],
  ['Amp usage-based tokens', 'product', 'weak', 'Amp', 'Pay-per-token', 'BYOK'],
  ['Amp best-model-only seat', 'coding', 'weak', 'Amp', 'No model picker', 'multi-seat'],
  ['Amp screenshot read', 'coding', 'partial', 'Amp', 'Read screenshots', 'previewCapture'],
  ['Amp Mermaid diagrams', 'coding', 'weak', 'Amp', 'Generate diagrams', 'Partial'],
  ['Amp team collaboration', 'product', 'worst', 'Amp', 'Team collab', 'Missing'],
  ['Aider open-source free path', 'coding', 'partial', 'Aider', 'OSS agent', 'Partial'],
  ['Cline open-source free path', 'coding', 'weak', 'Cline', 'OSS VS Code agent', 'Partial'],
  ['Continue open-source free path', 'coding', 'weak', 'Continue', 'OSS configs', 'Partial'],
  ['Lovable full-stack speed', 'product', 'weak', 'Lovable', 'NL→full app fast', 'invent SPA'],
  ['Bolt full-stack WebContainers', 'coding', 'weak', 'Bolt', 'In-browser full-stack', 'Missing'],
  ['Normal Ask vs Agent vs Plan trio', 'coding', 'strong', 'Cursor / Nova', 'Three modes', 'classify+Plan/Act'],
  ['Normal invent then edit loop', 'coding', 'strong', 'Nova', 'Create→edit continuum', 'wired'],
  ['Normal invent verify Live loop', 'coding', 'strong', 'Nova', 'Create→Live→fix', 'wired'],
  ['Normal local-first privacy path', 'product', 'strong', 'Nova', 'Local GGUF path', 'wired'],
  ['Normal BYOK multi-provider', 'coding', 'strong', 'Nova', 'BYOK seats', 'wired'],
  ['Normal desktop not browser-only', 'product', 'strong', 'Nova / Cursor', 'Desktop app', 'Electron'],
  ['Normal craft quality bar', 'product', 'strong', 'Nova', 'Craft rules > generic AI UI', 'wired'],
  ['Normal stop before exotic cloud', 'coding', 'strong', 'research gate', 'Defer Devin/Cursor cloud', 'impl gate'],
  ['Normal stop before multiplayer', 'product', 'strong', 'research gate', 'Defer collab edit', 'impl gate'],
  ['Normal stop before every language', 'coding', 'strong', 'research gate', 'JS/Vite first', 'impl gate'],
  ['Normal stop before enterprise SSO', 'product', 'strong', 'research gate', 'Defer SSO/SCIM', 'impl gate'],
  ['Normal impl queue from Worst top', 'coding', 'strong', 'research gate', 'Implement worst→best', 'next phase'],
];

for (const r of rows) add(...r);

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
  open: g('worst') + g('weak') + g('partial'),
});
