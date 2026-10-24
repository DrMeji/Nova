import fs from 'fs';

const path =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
let t = fs.readFileSync(path, 'utf8');
if (t.includes('Tembo multi-repo background coding')) {
  console.log('already grown');
  process.exit(0);
}

const extra = `
  {
    capability: 'Tembo multi-repo background coding',
    lane: 'coding',
    nova: 'worst',
    leader: 'Tembo',
    howTheyDoIt: 'Background agents across many repos',
    novaNow: 'Single invent Acc project',
  },
  {
    capability: 'Cosine / Manus async cloud coding',
    lane: 'coding',
    nova: 'worst',
    leader: 'Cosine / Manus',
    howTheyDoIt: 'Async cloud engineer without local session',
    novaNow: 'Local desktop invent',
  },
  {
    capability: 'GitLab Duo / Rovo platform agents',
    lane: 'coding',
    nova: 'worst',
    leader: 'GitLab Duo / Rovo Dev',
    howTheyDoIt: 'Coding agents inside GitLab/Atlassian',
    novaNow: 'Out of platform — desktop Nova',
  },
  {
    capability: 'Netlify Agent Runners invent deploy',
    lane: 'product',
    nova: 'worst',
    leader: 'Netlify Agent',
    howTheyDoIt: 'Agent changes + deploy on Netlify',
    novaNow: 'deploy-descriptor Acc only',
  },
  {
    capability: 'IBM Bob / Tessl enterprise agents',
    lane: 'coding',
    nova: 'worst',
    leader: 'IBM Bob / Tessl',
    howTheyDoIt: 'Enterprise packaged coding agents',
    novaNow: 'No enterprise agent SKU',
  },
  {
    capability: 'Sweep / Comate IDE assistants',
    lane: 'coding',
    nova: 'worst',
    leader: 'Sweep / Comate',
    howTheyDoIt: 'Issue→PR / China IDE assistants',
    novaNow: 'Not integrated',
  },
  {
    capability: 'CodeGeeX / Blackbox coding assistants',
    lane: 'coding',
    nova: 'weak',
    leader: 'CodeGeeX / Blackbox',
    howTheyDoIt: 'Completion + chat coding helpers',
    novaNow: 'Full invent agent — different class',
  },
  {
    capability: 'Augment deep codebase engine',
    lane: 'coding',
    nova: 'weak',
    leader: 'Augment Code',
    howTheyDoIt: 'Deep context engine for large repos',
    novaNow: 'grep + map — not Augment-depth index',
  },
  {
    capability: 'Qodo / Zencoder PR test agents',
    lane: 'coding',
    nova: 'weak',
    leader: 'Qodo / Zencoder',
    howTheyDoIt: 'PR-focused test generation agents',
    novaNow: 'pr-review Acc — not Qodo test agent',
  },
  {
    capability: 'Tabnine private/on-prem coding',
    lane: 'coding',
    nova: 'partial',
    leader: 'Tabnine',
    howTheyDoIt: 'Enterprise private model serving',
    novaNow: 'Local GGUF privacy — not Tabnine enterprise mesh',
  },
  {
    capability: 'ForgeCode / Command Code CLI agents',
    lane: 'coding',
    nova: 'weak',
    leader: 'ForgeCode / Command Code',
    howTheyDoIt: 'Terminal coding agent niche tools',
    novaNow: 'Nova agent loop — not those CLIs',
  },
  {
    capability: 'Letta / Deep Agents long-memory coding',
    lane: 'coding',
    nova: 'weak',
    leader: 'Letta / Deep Agents',
    howTheyDoIt: 'Long-horizon memory agent architectures',
    novaNow: 'thread brain + memories Acc',
  },
  {
    capability: 'Plandex large-task coding planner',
    lane: 'coding',
    nova: 'partial',
    leader: 'Plandex',
    howTheyDoIt: 'Large task planning + execution',
    novaNow: 'Plan mode + create spine',
  },
  {
    capability: 'Warp AI terminal coding',
    lane: 'coding',
    nova: 'weak',
    leader: 'Warp',
    howTheyDoIt: 'AI inside a modern terminal product',
    novaNow: 'agentRun shell — not Warp UX',
  },
  {
    capability: 'Crush / Jules async coding tasks',
    lane: 'coding',
    nova: 'weak',
    leader: 'Jules / Crush',
    howTheyDoIt: 'Async cloud coding jobs',
    novaNow: 'orb stub Acc',
  },
  {
    capability: 'Continue shared custom coding agents',
    lane: 'coding',
    nova: 'weak',
    leader: 'Continue',
    howTheyDoIt: 'Team-shared custom agent defs',
    novaNow: 'skills registry local',
  },
  {
    capability: 'Zed parallel agent threads',
    lane: 'coding',
    nova: 'partial',
    leader: 'Zed',
    howTheyDoIt: 'Threads sidebar + ACP agents + worktrees',
    novaNow: 'chat-fork + ACP Acc',
  },
  {
    capability: 'Evidence-before-Done invent Ready',
    lane: 'coding',
    nova: 'strong',
    leader: 'safe-stack / Kane philosophy',
    howTheyDoIt: 'Binary evidence before success',
    novaNow: 'Ready gates + Live grade + secret preflight',
  },
  {
    capability: 'Invent craft pack smoke harness',
    lane: 'coding',
    nova: 'strong',
    leader: 'Nova',
    howTheyDoIt: 'Automated invent signal smoke',
    novaNow: 'smoke-invent-craft-pack',
  },
  {
    capability: 'Close-all invent Acc bundle',
    lane: 'product',
    nova: 'strong',
    leader: 'Nova',
    howTheyDoIt: 'Field+coding Acc bundle on invent',
    novaNow: 'inventCloseAllPack attached',
  },
`;

const marker = '  // —— STRONG (real Nova wiring) ——';
const idx = t.indexOf(marker);
if (idx < 0) throw new Error('marker missing');
// insert extras before STRONG section (they're mixed grades - better before WEAK end)
// Actually insert before STRONG so worst/weak/partial extras are in RAW before strong block
t = t.slice(0, idx) + extra + '\n' + t.slice(idx);
fs.writeFileSync(path, t);
const g = (k) => [...t.matchAll(new RegExp(`nova: '${k}'`, 'g'))].length;
console.log({
  rows: [...t.matchAll(/capability: '/g)].length,
  worst: g('worst'),
  weak: g('weak'),
  partial: g('partial'),
  strong: g('strong'),
});
