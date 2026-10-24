/**
 * Wave 4 — keep growing. Coding-first + app chrome + field parity.
 * Dedupes by capability name. Honest grades.
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
function addAll(lane, rows) {
  for (const [cap, grade, leader, how, now] of rows) add(cap, lane, grade, leader, how, now);
}

// —— Agent loop edge cases ——
addAll('coding', [
  ['Agent mid-turn steer box', 'partial', 'Cursor', 'Steer while running', 'steer Acc soft'],
  ['Agent mid-turn append instruction', 'weak', 'Claude Code', 'Append to running', 'Missing UI'],
  ['Agent queue pause resume', 'weak', 'field', 'Pause queue', 'Partial'],
  ['Agent queue reorder jobs', 'worst', 'field', 'Drag reorder', 'Missing UI'],
  ['Agent queue priority boost', 'worst', 'field', 'Priority', 'Missing'],
  ['Agent retry failed step only', 'weak', 'field', 'Retry step', 'Partial'],
  ['Agent skip failed step continue', 'weak', 'field', 'Skip step', 'Partial'],
  ['Agent bookmark turn', 'worst', 'field', 'Bookmark', 'Missing'],
  ['Agent pin important file', 'weak', 'Cursor', 'Pin context', 'Partial'],
  ['Agent unpin context file', 'weak', 'Cursor', 'Unpin', 'Partial'],
  ['Agent context budget bar live', 'partial', 'Nova', 'Context bar', 'TokenUsageRing'],
  ['Agent context overflow warn', 'partial', 'field', 'Warn near limit', 'Partial'],
  ['Agent summarize old turns', 'weak', 'field', 'Compact history', 'Partial'],
  ['Agent forget turn privacy', 'weak', 'field', 'Forget turn', 'Partial'],
  ['Agent export transcript md', 'weak', 'Amp', 'Export md', 'Partial'],
  ['Agent export transcript json', 'weak', 'Amp', 'Export json', 'audit Acc'],
  ['Agent share transcript link', 'worst', 'field', 'Share link', 'Missing'],
  ['Agent compare two model replies', 'weak', 'field', 'A/B models', 'Partial'],
  ['Agent vote better reply', 'worst', 'field', 'Vote', 'Missing'],
  ['Agent regenerate with different seat', 'partial', 'Nova', 'Reseat', 'engineSeatSwap'],
  ['Agent temperature override UI', 'weak', 'field', 'Temp slider', 'Partial'],
  ['Agent top-p override UI', 'worst', 'field', 'Top-p', 'Missing'],
  ['Agent seed reproduce UI', 'worst', 'field', 'Seed', 'Missing'],
  ['Agent system prompt peek', 'weak', 'field', 'Show system', 'Partial'],
  ['Agent hidden tools reveal', 'weak', 'Claude Code', 'List tools', 'Partial'],
  ['Agent tool schema docs UI', 'worst', 'field', 'Tool docs', 'Missing'],
  ['Agent dry-run no writes', 'weak', 'field', 'Dry run mode', 'Missing UI'],
  ['Agent simulate patch only', 'partial', 'IDE', 'Preview patch', 'Partial'],
  ['Agent apply patch hunk select', 'weak', 'IDE', 'Hunk pick', 'Partial'],
  ['Agent reject hunk keep rest', 'weak', 'IDE', 'Reject hunk', 'Partial'],
  ['Agent conflict when file changed underfoot', 'partial', 'IDE', 'Dirty conflict', 'Partial'],
  ['Agent reload file before write', 'strong', 'Nova', 'Re-read', 'wired'],
  ['Agent binary file refuse', 'partial', 'field', 'Skip binary', 'Partial'],
  ['Agent large file chunk read', 'partial', 'field', 'Chunk read', 'Partial'],
  ['Agent image file describe', 'partial', 'Claude vision', 'Describe image', 'Partial'],
  ['Agent PDF extract text', 'worst', 'field', 'PDF read', 'Missing'],
  ['Agent zip inspect list', 'worst', 'field', 'Zip list', 'Missing'],
  ['Agent sqlite query tool', 'worst', 'field', 'SQLite tool', 'Missing'],
  ['Agent redis peek tool', 'worst', 'field', 'Redis', 'Missing'],
  ['Agent docker ps tool', 'worst', 'field', 'Docker', 'Missing'],
  ['Agent kubectl get tool', 'worst', 'field', 'K8s', 'Missing'],
  ['Agent aws cli gated', 'worst', 'field', 'Cloud CLI', 'Missing'],
  ['Agent terraform plan gated', 'worst', 'field', 'TF plan', 'Missing'],
  ['Agent prisma migrate gated', 'worst', 'field', 'Prisma', 'Missing'],
  ['Agent playwright codegen', 'weak', 'Playwright', 'Record e2e', 'Partial'],
  ['Agent storybook story gen', 'weak', 'field', 'Story gen', 'Partial'],
  ['Agent openapi client gen', 'weak', 'field', 'OpenAPI gen', 'Partial'],
  ['Agent graphql schema read', 'weak', 'field', 'GQL schema', 'Partial'],
  ['Agent prisma schema edit', 'weak', 'field', 'Prisma edit', 'Partial'],
  ['Agent drizzle schema edit', 'weak', 'field', 'Drizzle', 'Partial'],
  ['Agent tailwind class suggest', 'partial', 'field', 'TW suggest', 'Partial'],
  ['Agent shadcn add component', 'weak', 'field', 'shadcn add', 'Partial'],
  ['Agent radix primitive pick', 'weak', 'field', 'Radix pick', 'Partial'],
  ['Agent icon pack pick', 'weak', 'field', 'Icon pick', 'Partial'],
  ['Agent font pair suggest', 'weak', 'field', 'Fonts', 'Partial'],
  ['Agent color contrast check', 'weak', 'a11y', 'Contrast', 'a11y Acc'],
  ['Agent i18n key extract', 'weak', 'field', 'i18n extract', 'i18n Acc'],
  ['Agent copy deck invent', 'weak', 'field', 'Copy variants', 'Partial'],
  ['Agent A/B copy invent', 'worst', 'field', 'A/B copy', 'Missing'],
  ['Agent brand kit lock UI', 'partial', 'Nova', 'Brand lock', 'brandAssets soft'],
  ['Agent logo swap invent', 'partial', 'Nova', 'Logo lock', 'Partial'],
  ['Agent SKU glyph invent', 'partial', 'Nova', 'SKU glyphs', 'Partial'],
  ['Agent layout salt invent', 'strong', 'Nova', 'Anti-twin', 'craft'],
  ['Agent twin project detect', 'weak', 'Nova', 'Detect twins', 'Partial'],
  ['Agent name tip negation', 'partial', 'Nova', 'Name tips', 'Partial'],
  ['Agent folder name sanitize', 'strong', 'Nova', 'Safe names', 'novaProjects'],
  ['Agent disk quota warn', 'weak', 'field', 'Disk warn', 'Partial'],
  ['Agent VRAM seat warn', 'partial', 'Nova', 'VRAM', 'engineSeatSwap'],
  ['Agent CUDA OOM recover', 'weak', 'field', 'OOM recover', 'Partial'],
  ['Agent model unload UI', 'partial', 'Nova', 'Unload GGUF', 'LocalAI'],
  ['Agent model swap mid-job', 'weak', 'field', 'Hot swap', 'Partial'],
  ['Agent quant pick UI', 'weak', 'field', 'Q4/Q5/Q8', 'Partial'],
  ['Agent context length pick', 'partial', 'Nova', 'Ctx length', 'ggufContext'],
  ['Agent speculative decode toggle', 'worst', 'field', 'Spec decode', 'Missing'],
  ['Agent flash attention toggle', 'worst', 'field', 'Flash attn', 'Missing'],
  ['Agent GPU layers slider', 'partial', 'llama.cpp', 'n_gpu_layers', 'Partial'],
  ['Agent CPU threads slider', 'weak', 'llama.cpp', 'threads', 'Partial'],
  ['Agent mmap toggle', 'worst', 'llama.cpp', 'mmap', 'Missing'],
  ['Agent grammar constrain JSON', 'weak', 'field', 'JSON grammar', 'Partial'],
  ['Agent structured output schema', 'weak', 'field', 'JSON schema out', 'Partial'],
  ['Agent function call strict', 'partial', 'field', 'Strict tools', 'Partial'],
  ['Agent tool result size cap', 'strong', 'HAR', 'Elide large', 'wired'],
  ['Agent tool timeout per call', 'partial', 'field', 'Tool timeout', 'Partial'],
  ['Agent tool retry backoff', 'weak', 'field', 'Backoff', 'Partial'],
  ['Agent circuit breaker seat', 'weak', 'field', 'Breaker', 'Partial'],
  ['Agent rate limit backoff UI', 'weak', 'field', '429 backoff', 'Partial'],
  ['Agent provider failover auto', 'partial', 'field', 'Failover', 'model-latency Acc'],
  ['Agent provider health pings', 'weak', 'field', 'Health', 'Partial'],
  ['Agent BYOK key test button', 'partial', 'Nova', 'Test key', 'Settings'],
  ['Agent BYOK key rotate UI', 'weak', 'field', 'Rotate key', 'Partial'],
  ['Agent BYOK key vault encrypt', 'partial', 'field', 'Encrypt keys', 'Partial'],
  ['Agent local key never upload', 'strong', 'Nova', 'Local keys', 'wired'],
  ['Agent cloud key redact logs', 'partial', 'field', 'Redact logs', 'Partial'],
]);

// —— IDE coding chrome ——
addAll('coding', [
  ['Breadcrumb path click nav', 'weak', 'IDE', 'Breadcrumbs', 'Partial'],
  ['Minimap code overlay', 'worst', 'IDE', 'Minimap', 'Missing'],
  ['Sticky scroll headers', 'worst', 'IDE', 'Sticky scroll', 'Missing'],
  ['Bracket pair colorize', 'weak', 'IDE', 'Brackets', 'Partial'],
  ['Indent guide lines', 'weak', 'IDE', 'Guides', 'Partial'],
  ['Word wrap toggle code', 'partial', 'IDE', 'Wrap', 'Partial'],
  ['Soft wrap column marker', 'worst', 'IDE', 'Col 80', 'Missing'],
  ['Multi-cursor edit', 'worst', 'IDE', 'Multi-cursor', 'Missing'],
  ['Column select edit', 'worst', 'IDE', 'Column select', 'Missing'],
  ['Find in file UI', 'partial', 'IDE', 'Find', 'Partial'],
  ['Replace in file UI', 'partial', 'IDE', 'Replace', 'Partial'],
  ['Find in project UI', 'partial', 'IDE', 'Project find', 'Partial'],
  ['Replace in project gated', 'weak', 'IDE', 'Project replace', 'Partial'],
  ['Regex find toggle', 'weak', 'IDE', 'Regex', 'Partial'],
  ['Case sensitive find', 'weak', 'IDE', 'Case', 'Partial'],
  ['Whole word find', 'weak', 'IDE', 'Word', 'Partial'],
  ['Go to line UI', 'weak', 'IDE', 'Goto line', 'Partial'],
  ['Go to symbol in file', 'partial', 'IDE', 'Symbols', 'symbols Acc'],
  ['Go to symbol in workspace', 'weak', 'IDE', 'Workspace symbol', 'Partial'],
  ['Recent files picker', 'weak', 'IDE', 'Recent files', 'Partial'],
  ['Changed files picker', 'weak', 'IDE', 'Dirty files', 'Partial'],
  ['Split editor horizontal', 'worst', 'IDE', 'Split H', 'Missing'],
  ['Split editor vertical', 'worst', 'IDE', 'Split V', 'Missing'],
  ['Tabs overflow menu', 'weak', 'IDE', 'Tab overflow', 'Partial'],
  ['Pin editor tab', 'worst', 'IDE', 'Pin tab', 'Missing'],
  ['Preview tab mode', 'worst', 'IDE', 'Preview tab', 'Missing'],
  ['Close saved tabs', 'weak', 'IDE', 'Close saved', 'Partial'],
  ['Close all tabs', 'weak', 'IDE', 'Close all', 'Partial'],
  ['Reopen closed tab', 'worst', 'IDE', 'Reopen', 'Missing'],
  ['Format document action', 'partial', 'IDE', 'Format', 'Partial'],
  ['Format selection action', 'weak', 'IDE', 'Format sel', 'Partial'],
  ['Organize imports action', 'weak', 'IDE', 'Organize imports', 'Partial'],
  ['Fix all auto-fixable', 'weak', 'IDE', 'Fix all', 'Partial'],
  ['Quick fix lightbulb', 'weak', 'IDE', 'Code actions', 'Partial'],
  ['Rename symbol peek', 'weak', 'IDE', 'Rename peek', 'Partial'],
  ['Peek definition', 'weak', 'IDE', 'Peek def', 'Partial'],
  ['Peek references', 'weak', 'IDE', 'Peek refs', 'Partial'],
  ['Call hierarchy view', 'worst', 'IDE', 'Call hierarchy', 'Missing'],
  ['Type hierarchy view', 'worst', 'IDE', 'Type hierarchy', 'Missing'],
  ['Problems panel diagnostics', 'partial', 'IDE', 'Problems', 'Partial'],
  ['Output panel agent logs', 'partial', 'IDE', 'Output', 'Partial'],
  ['Debug console panel', 'worst', 'IDE', 'Debug console', 'Missing'],
  ['Breakpoints UI', 'worst', 'IDE', 'Breakpoints', 'Missing'],
  ['Watch expressions UI', 'worst', 'IDE', 'Watch', 'Missing'],
  ['Call stack UI', 'worst', 'IDE', 'Call stack', 'Missing'],
  ['Step over into out', 'worst', 'IDE', 'Step debug', 'Missing'],
  ['Launch.json debug config', 'worst', 'IDE', 'Launch config', 'Missing'],
  ['Test explorer tree', 'weak', 'IDE', 'Test tree', 'Partial'],
  ['Run test at cursor', 'weak', 'IDE', 'Run test', 'Partial'],
  ['Debug test at cursor', 'worst', 'IDE', 'Debug test', 'Missing'],
  ['Coverage gutter UI', 'worst', 'IDE', 'Coverage', 'Missing'],
  ['Snapshot update gated', 'weak', 'Jest', 'Update snap', 'Partial'],
  ['Playwright trace viewer link', 'weak', 'Playwright', 'Trace view', 'Partial'],
  ['Storybook open story', 'worst', 'Storybook', 'Open story', 'Missing'],
  ['Chromatic visual link', 'worst', 'Chromatic', 'Visual', 'Missing'],
]);

// —— Git / PR / CI deeper ——
addAll('coding', [
  ['Git stage hunk UI', 'weak', 'IDE', 'Stage hunk', 'Partial'],
  ['Git unstage hunk UI', 'weak', 'IDE', 'Unstage hunk', 'Partial'],
  ['Git discard hunk UI', 'weak', 'IDE', 'Discard hunk', 'Partial'],
  ['Git stage file UI', 'partial', 'IDE', 'Stage file', 'Partial'],
  ['Git commit message AI', 'partial', 'Copilot', 'AI commit msg', 'Partial'],
  ['Git amend gated', 'weak', 'IDE', 'Amend', 'Partial'],
  ['Git stash push UI', 'weak', 'IDE', 'Stash', 'Partial'],
  ['Git stash pop UI', 'weak', 'IDE', 'Stash pop', 'Partial'],
  ['Git stash list UI', 'weak', 'IDE', 'Stash list', 'Partial'],
  ['Git branch create UI', 'partial', 'IDE', 'New branch', 'Partial'],
  ['Git branch switch UI', 'partial', 'IDE', 'Switch branch', 'Partial'],
  ['Git branch delete gated', 'weak', 'IDE', 'Delete branch', 'Partial'],
  ['Git merge branch UI', 'weak', 'IDE', 'Merge', 'Partial'],
  ['Git rebase interactive UI', 'worst', 'IDE', 'Rebase -i', 'Missing'],
  ['Git cherry-pick UI', 'worst', 'IDE', 'Cherry-pick', 'Missing'],
  ['Git blame gutter', 'weak', 'IDE', 'Blame', 'Partial'],
  ['Git history file UI', 'weak', 'IDE', 'File history', 'Partial'],
  ['Git history line UI', 'worst', 'IDE', 'Line history', 'Missing'],
  ['Git compare branches UI', 'weak', 'IDE', 'Compare', 'Partial'],
  ['Git remote add UI', 'weak', 'IDE', 'Add remote', 'Partial'],
  ['Git push upstream UI', 'partial', 'IDE', 'Push -u', 'Partial'],
  ['Git pull rebase toggle', 'weak', 'IDE', 'Pull rebase', 'Partial'],
  ['Git fetch all UI', 'weak', 'IDE', 'Fetch', 'Partial'],
  ['Git LFS status UI', 'worst', 'IDE', 'LFS', 'Missing'],
  ['Git submodule status', 'worst', 'IDE', 'Submodules', 'Missing'],
  ['PR create draft UI', 'weak', 'GitHub', 'Draft PR', 'draft-pr Acc'],
  ['PR create ready UI', 'weak', 'GitHub', 'Ready PR', 'Partial'],
  ['PR title body AI', 'weak', 'Copilot', 'PR body AI', 'Partial'],
  ['PR reviewers suggest', 'worst', 'GitHub', 'Reviewers', 'Missing'],
  ['PR labels suggest', 'worst', 'GitHub', 'Labels', 'Missing'],
  ['PR checks status list', 'weak', 'GitHub', 'Checks', 'Partial'],
  ['PR failing check jump', 'weak', 'GitHub', 'Jump fail', 'ci-autofix Acc'],
  ['PR comment reply AI', 'weak', 'Copilot', 'Reply review', 'Partial'],
  ['PR resolve thread AI', 'weak', 'Copilot', 'Resolve thread', 'Partial'],
  ['PR merge squash UI', 'weak', 'GitHub', 'Squash merge', 'Partial'],
  ['PR merge rebase UI', 'worst', 'GitHub', 'Rebase merge', 'Missing'],
  ['Issue create from chat', 'weak', 'Linear / GH', 'Create issue', 'Partial'],
  ['Issue link in commit', 'weak', 'field', 'Fixes #', 'Partial'],
  ['Project board move card', 'worst', 'GitHub Projects', 'Board', 'Missing'],
  ['CODEOWNERS honor warn', 'weak', 'GitHub', 'Owners warn', 'Partial'],
  ['Branch protection respect', 'weak', 'GitHub', 'Protected', 'Partial'],
  ['Signed commit warn', 'worst', 'GitHub', 'GPG/SSH sign', 'Missing'],
]);

// —— Invent verticals (more kinds × quals) ——
const kinds2 = [
  'fintech', 'crypto', 'ai-saas', 'devtools', 'analytics', 'crm', 'hr',
  'inventory', 'booking', 'tickets', 'maps', 'travel', 'fashion', 'beauty',
  'pets', 'kids', 'sports', 'music', 'film', 'photo', 'architecture',
  'interior', 'real-estate', 'construction', 'logistics', 'farm', 'energy',
  'climate', 'gov', 'church', 'union', 'museum', 'library', 'university',
  'k12', 'bootcamp', 'coaching', 'therapy', 'dental', 'vet', 'pharmacy',
  'grocery', 'cafe', 'bar', 'bakery', 'food-truck', 'catering', 'wine',
  'brewery', 'distillery', 'auto', 'ev', 'bike', 'boat', 'aviation',
];
const quals2 = [
  ['unique brand voice', 'partial', 'Voice', 'craft'],
  ['trust signals', 'weak', 'Trust', 'Partial'],
  ['social proof strip', 'partial', 'Proof', 'Partial'],
  ['CTA hierarchy', 'strong', 'CTA', 'craft'],
  ['footer legal links', 'weak', 'Legal', 'Partial'],
  ['cookie banner opt', 'weak', 'Consent', 'Partial'],
  ['newsletter capture', 'weak', 'Email', 'Partial'],
  ['map embed section', 'weak', 'Maps', 'Partial'],
  ['hours / location', 'partial', 'Local biz', 'Partial'],
  ['menu / catalog grid', 'partial', 'Catalog', 'storefront'],
  ['booking CTA', 'weak', 'Booking', 'Partial'],
  ['team grid', 'partial', 'Team', 'Partial'],
  ['testimonials carousel', 'weak', 'Testimonials', 'Partial'],
  ['case studies', 'weak', 'Cases', 'Partial'],
  ['pricing tiers 3', 'partial', 'Pricing', 'storefront'],
  ['faq accordion', 'partial', 'FAQ', 'Partial'],
  ['blog index', 'weak', 'Blog', 'Partial'],
  ['blog post template', 'weak', 'Post', 'Partial'],
  ['docs sidebar', 'weak', 'Docs', 'Partial'],
  ['changelog page', 'weak', 'Changelog', 'Partial'],
  ['status page stub', 'worst', 'Status', 'Missing'],
  ['careers page', 'weak', 'Careers', 'Partial'],
  ['press kit', 'worst', 'Press', 'Missing'],
  ['investor page', 'worst', 'Investors', 'Missing'],
  ['dark/light invent toggle', 'weak', 'Theme toggle', 'Partial'],
  ['locale switcher', 'weak', 'i18n', 'i18n Acc'],
  ['RTL layout pass', 'worst', 'i18n', 'Missing'],
  ['print stylesheet', 'worst', 'Print', 'Missing'],
  ['PWA install prompt', 'weak', 'PWA', 'pwa Acc'],
  ['offline fallback', 'worst', 'PWA', 'Missing'],
];
for (const k of kinds2) {
  for (const [q, grade, how, now] of quals2) {
    add(`Invent ${k} ${q}`, 'coding', grade, 'v0 / Lovable / Framer', how, now);
  }
}

// —— Edit micro-ops on more targets ——
const targets = [
  'hero headline', 'hero subcopy', 'hero CTA', 'nav links', 'footer cols',
  'pricing card 1', 'pricing card 2', 'pricing card 3', 'faq item',
  'testimonial quote', 'team member', 'feature card', 'logo mark',
  'accent token', 'bg canvas', 'button radius', 'shadow depth',
  'section spacing', 'max-width container', 'mobile nav', 'form label',
  'input border', 'success toast', 'error toast', 'modal title',
  'drawer panel', 'tabs list', 'badge tone', 'icon size', 'image alt',
];
const ops2 = [
  ['reword shorter', 'partial', 'Copy edit', 'Partial'],
  ['reword longer', 'partial', 'Copy edit', 'Partial'],
  ['make bolder', 'partial', 'Type weight', 'Partial'],
  ['make quieter', 'partial', 'Type quiet', 'Partial'],
  ['shift left', 'weak', 'Layout', 'Partial'],
  ['shift right', 'weak', 'Layout', 'Partial'],
  ['full bleed', 'partial', 'Fullbleed', 'smoke-solid'],
  ['add border', 'weak', 'Border', 'Partial'],
  ['remove border', 'weak', 'Border', 'Partial'],
  ['raise contrast', 'partial', 'Contrast', 'a11y Acc'],
  ['soften contrast', 'weak', 'Contrast', 'Partial'],
  ['animate in', 'partial', 'Motion', 'craft'],
  ['kill animation', 'partial', 'Motion off', 'Partial'],
];
for (const tgt of targets) {
  for (const [op, grade, how, now] of ops2) {
    add(`Edit ${tgt} ${op}`, 'coding', grade, 'Cursor / Nova', how, now);
  }
}

// —— Product / Tools / Settings gaps ——
addAll('product', [
  ['Settings search filter', 'weak', 'IDE', 'Search settings', 'Missing UI'],
  ['Settings export JSON', 'weak', 'field', 'Export prefs', 'Partial'],
  ['Settings import JSON', 'weak', 'field', 'Import prefs', 'Partial'],
  ['Settings reset section', 'weak', 'field', 'Reset section', 'Partial'],
  ['Settings reset all gated', 'weak', 'field', 'Reset all', 'Partial'],
  ['Accent preview live shell', 'partial', 'Nova', 'Accent live', 'Partial'],
  ['Density compact code editor', 'partial', 'Nova', 'Density', 'Partial'],
  ['Font size live preview', 'partial', 'Nova', 'Font size', 'Partial'],
  ['Reduce motion master toggle', 'partial', 'Nova', 'Reduce motion', 'prefs'],
  ['High contrast mode', 'worst', 'a11y', 'High contrast', 'Missing'],
  ['Dyslexia-friendly font opt', 'worst', 'a11y', 'OpenDyslexic', 'Missing'],
  ['Screen reader announce agent', 'weak', 'a11y', 'SR live region', 'Partial'],
  ['Focus trap modals', 'partial', 'a11y', 'Focus trap', 'Partial'],
  ['Escape closes overlays', 'strong', 'Nova', 'Esc', 'wired soft'],
  ['Drag drop project folder', 'partial', 'field', 'Drop folder', 'chatDrop soft'],
  ['Drag drop images to chat', 'partial', 'field', 'Drop images', 'chatDrop'],
  ['Drag drop code files chat', 'partial', 'field', 'Drop files', 'chatDrop'],
  ['Paste image clipboard chat', 'partial', 'field', 'Paste image', 'Partial'],
  ['Paste URL unfurl chat', 'weak', 'field', 'Unfurl', 'Partial'],
  ['Link preview invent brief', 'weak', 'field', 'URL→brief', 'Partial'],
  ['Screenshot paste invent', 'partial', 'field', 'Shot→invent', 'image-to-invent'],
  ['Figma URL paste invent', 'weak', 'Figma', 'URL→invent', 'figma Acc'],
  ['Notion page paste invent', 'worst', 'Notion', 'Notion→invent', 'Missing'],
  ['Linear issue paste invent', 'weak', 'Linear', 'Issue→task', 'Partial'],
  ['GitHub issue paste invent', 'weak', 'GitHub', 'Issue→fix', 'Partial'],
  ['Slack thread paste context', 'worst', 'Slack', 'Slack context', 'Missing'],
  ['Discord message paste context', 'worst', 'Discord', 'Discord context', 'Missing'],
  ['GDrive file attach', 'weak', 'Drive', 'Drive attach', 'gdrive Acc'],
  ['Dropbox file attach', 'worst', 'Dropbox', 'Dropbox', 'Missing'],
  ['S3 bucket browse', 'worst', 'AWS', 'S3 browse', 'Missing'],
  ['Telegram bot plugin live', 'partial', 'Telegram', 'Bot', 'plugin soft'],
  ['WhatsApp channel plugin', 'worst', 'WhatsApp', 'WA', 'Missing'],
  ['Email IMAP plugin', 'worst', 'email', 'IMAP', 'Missing'],
  ['Calendar Google plugin', 'weak', 'Google', 'Calendar', 'Partial'],
  ['Stripe test mode banner', 'weak', 'Stripe', 'Test mode', 'payments Acc'],
  ['Stripe webhook log UI', 'worst', 'Stripe', 'Webhooks', 'Missing'],
  ['Supabase project link UI', 'weak', 'Supabase', 'Link project', 'Partial'],
  ['Firebase project link UI', 'worst', 'Firebase', 'Link', 'Missing'],
  ['Vercel project link UI', 'weak', 'Vercel', 'Link', 'deploy Acc'],
  ['Netlify project link UI', 'worst', 'Netlify', 'Link', 'Missing'],
  ['Cloudflare pages link UI', 'worst', 'CF', 'Link', 'Missing'],
  ['Railway project link UI', 'worst', 'Railway', 'Link', 'Missing'],
  ['Fly.io project link UI', 'worst', 'Fly', 'Link', 'Missing'],
  ['Render project link UI', 'worst', 'Render', 'Link', 'Missing'],
  ['Docker desktop status', 'worst', 'Docker', 'Docker status', 'Missing'],
  ['WSL path awareness', 'weak', 'Windows', 'WSL paths', 'Partial'],
  ['Windows defender exclude tip', 'worst', 'Windows', 'Exclude tip', 'Missing'],
  ['macOS quarantine tip', 'worst', 'macOS', 'Quarantine', 'Missing'],
  ['Linux AppImage path', 'worst', 'Linux', 'AppImage', 'Missing'],
  ['Auto-update channel UI', 'weak', 'Electron', 'Update channel', 'Partial'],
  ['Auto-update changelog modal', 'partial', 'Electron', 'Update notes', 'Partial'],
  ['Crash report opt-in UI', 'partial', 'field', 'Crash reports', 'Partial'],
  ['Telemetry event inspector', 'worst', 'field', 'Telemetry', 'Missing'],
  ['Feature flags panel', 'weak', 'field', 'Flags', 'Partial'],
  ['Experiments A/B panel', 'worst', 'field', 'Experiments', 'Missing'],
  ['Internal dogfood badge', 'worst', 'field', 'Dogfood', 'Missing'],
  ['Staff mode debug overlay', 'weak', 'field', 'Staff debug', 'Partial'],
  ['Performance FPS overlay', 'worst', 'field', 'FPS', 'Missing'],
  ['Memory leak warn Electron', 'weak', 'Electron', 'Memory warn', 'Partial'],
  ['GPU process crash recover', 'weak', 'Electron', 'GPU recover', 'Partial'],
]);

// —— Protocol / standards ——
addAll('protocol', [
  ['MCP sampling requests', 'worst', 'MCP', 'sampling', 'Missing'],
  ['MCP roots list UI', 'weak', 'MCP', 'roots', 'Partial'],
  ['MCP logging messages UI', 'weak', 'MCP', 'logging', 'Partial'],
  ['MCP completion autocomplete', 'weak', 'MCP', 'completions', 'Partial'],
  ['MCP elicitation forms', 'worst', 'MCP', 'elicitation', 'Missing'],
  ['ACP stream partials UI', 'weak', 'ACP', 'Partials', 'Partial'],
  ['ACP cancel request UI', 'weak', 'ACP', 'Cancel', 'Partial'],
  ['LSP code action apply', 'weak', 'LSP', 'CodeAction', 'Partial'],
  ['LSP rename prepare', 'weak', 'LSP', 'prepareRename', 'Partial'],
  ['LSP semantic tokens', 'worst', 'LSP', 'SemanticTokens', 'Missing'],
  ['LSP inlay hints toggle', 'worst', 'LSP', 'InlayHints', 'Missing'],
  ['LSP formatting provider', 'weak', 'LSP', 'Formatting', 'Partial'],
  ['DAP debug adapter', 'worst', 'DAP', 'Debug Adapter', 'Missing'],
  ['Tree-sitter parse fallback', 'weak', 'field', 'Tree-sitter', 'Partial'],
  ['Comby structural search', 'worst', 'Comby', 'Structural', 'Missing'],
  ['Semgrep rules run UI', 'worst', 'Semgrep', 'Semgrep', 'Missing'],
  ['CodeQL query UI', 'worst', 'CodeQL', 'CodeQL', 'Missing'],
  ['SBOM generate UI', 'worst', 'field', 'SBOM', 'Missing'],
  ['License scan UI', 'worst', 'field', 'License scan', 'Missing'],
  ['Secret scan pre-commit UI', 'weak', 'gitleaks', 'Secret scan', 'Partial'],
  ['Dependabot alerts UI', 'worst', 'GitHub', 'Dependabot', 'Missing'],
  ['OSV vulnerability UI', 'worst', 'OSV', 'Vulns', 'Missing'],
  ['SLSA provenance UI', 'worst', 'SLSA', 'Provenance', 'Missing'],
  ['Sigstore verify UI', 'worst', 'Sigstore', 'Verify', 'Missing'],
  ['OpenAPI lint UI', 'weak', 'Spectral', 'OpenAPI lint', 'Partial'],
  ['GraphQL lint UI', 'worst', 'field', 'GQL lint', 'Missing'],
  ['CSS lint UI', 'weak', 'Stylelint', 'CSS lint', 'Partial'],
  ['HTML validate UI', 'weak', 'field', 'HTML validate', 'Partial'],
  ['axe-core Live run UI', 'weak', 'axe', 'a11y run', 'a11y Acc'],
  ['Lighthouse score UI', 'weak', 'Lighthouse', 'LH score', 'Partial'],
  ['Web Vitals Live panel', 'weak', 'CWV', 'Web Vitals', 'Partial'],
  ['Bundle size budget UI', 'weak', 'field', 'Bundle budget', 'Partial'],
  ['Source map upload gated', 'worst', 'Sentry', 'Source maps', 'Missing'],
  ['Error tracking Sentry link', 'weak', 'Sentry', 'Sentry', 'Partial'],
  ['Log drain UI', 'worst', 'field', 'Logs', 'Missing'],
  ['Metrics Prometheus link', 'worst', 'Prometheus', 'Metrics', 'Missing'],
  ['Trace Jaeger link', 'worst', 'Jaeger', 'Traces', 'Missing'],
  ['OpenTelemetry export toggle', 'worst', 'OTel', 'Export', 'Missing'],
]);

// —— Multi-agent / orchestra ——
addAll('coding', [
  ['Orchestra planner seat', 'weak', 'Agent Teams', 'Planner', 'Partial'],
  ['Orchestra implementer seat', 'weak', 'Agent Teams', 'Implementer', 'Partial'],
  ['Orchestra reviewer seat', 'weak', 'Agent Teams', 'Reviewer', 'Partial'],
  ['Orchestra tester seat', 'weak', 'Agent Teams', 'Tester', 'Partial'],
  ['Orchestra librarian seat', 'weak', 'Amp', 'Librarian', 'Partial'],
  ['Orchestra oracle seat', 'weak', 'Amp', 'Oracle', 'Partial'],
  ['Orchestra merge arbiter', 'worst', 'Agent Teams', 'Merge arbiter', 'Missing'],
  ['Orchestra path ownership map', 'weak', 'MonkeysCode', 'Path owners', 'worker-dag Acc'],
  ['Orchestra lockfile on path', 'worst', 'field', 'Path locks', 'Missing'],
  ['Orchestra handoff packet', 'weak', 'field', 'Handoff', 'Partial'],
  ['Orchestra escalation human', 'partial', 'field', 'Escalate', 'Partial'],
  ['Orchestra timebox per seat', 'weak', 'field', 'Timebox', 'Partial'],
  ['Orchestra budget per seat', 'weak', 'field', 'Budget seat', 'Partial'],
  ['Orchestra shared scratchpad', 'weak', 'field', 'Shared notes', 'Partial'],
  ['Orchestra private scratchpad', 'weak', 'field', 'Private notes', 'Partial'],
  ['Orchestra vote on plan', 'worst', 'field', 'Vote plan', 'Missing'],
  ['Orchestra dissent record', 'worst', 'field', 'Dissent', 'Missing'],
  ['Orchestra replay from step', 'weak', 'field', 'Replay step', 'Partial'],
  ['Orchestra snapshot seats', 'weak', 'field', 'Snapshot', 'Partial'],
  ['Orchestra kill one seat', 'weak', 'field', 'Kill seat', 'Partial'],
  ['Orchestra kill all seats', 'partial', 'Nova', 'Stop all', 'Partial'],
  ['Orchestra health heartbeats', 'weak', 'field', 'Heartbeats', 'Partial'],
  ['Orchestra lag warn', 'weak', 'field', 'Lag warn', 'Partial'],
  ['Orchestra deadlock detect', 'worst', 'field', 'Deadlock', 'Missing'],
  ['Orchestra cycle detect DAG', 'weak', 'field', 'Cycle detect', 'Partial'],
]);

// —— Security / privacy coding ——
addAll('coding', [
  ['Prompt injection warn UI', 'weak', 'field', 'Injection warn', 'Partial'],
  ['Untrusted file warn UI', 'weak', 'field', 'Untrusted', 'Partial'],
  ['Supply chain lockfile pin', 'partial', 'field', 'Lockfile', 'Partial'],
  ['npm audit gate UI', 'weak', 'npm', 'npm audit', 'Partial'],
  ['pnpm audit gate UI', 'weak', 'pnpm', 'pnpm audit', 'Partial'],
  ['yarn audit gate UI', 'weak', 'yarn', 'yarn audit', 'Partial'],
  ['CVE auto-suggest fix', 'weak', 'Dependabot', 'CVE fix', 'Partial'],
  ['Secret in chat redact live', 'partial', 'field', 'Redact chat', 'Partial'],
  ['Secret in diff redact', 'partial', 'field', 'Redact diff', 'Partial'],
  ['PII detect warn', 'weak', 'field', 'PII warn', 'Partial'],
  ['License incompatible warn', 'weak', 'field', 'License warn', 'Partial'],
  ['Copyleft paste warn', 'worst', 'field', 'Copyleft', 'Missing'],
  ['Model training opt-out badge', 'partial', 'field', 'No-train', 'Partial'],
  ['Enterprise DLP hooks', 'worst', 'enterprise', 'DLP', 'Missing'],
  ['SSO SAML login', 'worst', 'enterprise', 'SAML', 'Out of scope'],
  ['SCIM provisioning', 'worst', 'enterprise', 'SCIM', 'Out of scope'],
  ['Audit log immutable export', 'weak', 'enterprise', 'Immutable audit', 'audit Acc'],
  ['Retention policy UI', 'worst', 'enterprise', 'Retention', 'Missing'],
  ['Legal hold UI', 'worst', 'enterprise', 'Legal hold', 'Missing'],
]);

// —— Verify matrix expansion ——
const verifyDims = [
  'syntax', 'types', 'unit', 'e2e', 'a11y', 'seo', 'perf', 'bundle',
  'security', 'i18n', 'visual', 'mobile', 'print', 'rtl', 'contrast',
  'keyboard', 'screenreader', 'lighthouse', 'vitals', 'csp',
];
const verifyActs = [
  ['gate before Ready', 'partial', 'Gate', 'createReady soft'],
  ['gate before Live', 'partial', 'Gate', 'Partial'],
  ['gate before deploy', 'weak', 'Gate', 'deploy Acc'],
  ['auto-fix attempt once', 'weak', 'Auto-fix', 'Partial'],
  ['report in chat', 'partial', 'Report', 'Partial'],
  ['report in Live badge', 'weak', 'Badge', 'Partial'],
  ['block merge soft', 'weak', 'Block', 'Partial'],
  ['allow override with reason', 'weak', 'Override', 'Missing UI'],
];
for (const d of verifyDims) {
  for (const [a, grade, how, now] of verifyActs) {
    add(`Verify ${d} ${a}`, 'coding', grade, 'HAR / Nova', how, now);
  }
}

// —— Named field tools more parity ——
const tools = [
  'Zed', 'VS Code', 'JetBrains Junie', 'Sourcegraph Cody', 'Tabnine',
  'Codeium', 'Amazon Q', 'Gemini Code Assist', 'Sweep', 'Mentat',
  'ChatGPT Canvas', 'v0', 'Lovable', 'Bolt.new', 'Framer AI',
  'Webflow AI', 'Typedream', 'Dora AI', 'Uizard', 'Galileo AI',
  'Builder.io', 'Plasmic', 'Retool AI', 'Appsmith AI', 'Tooljet',
  'Supabase AI', 'Prisma Studio', 'PlanetScale', 'Neon', 'Turso',
  'Postman AI', 'Insomnia', 'Hoppscotch', 'Bruno', 'HTTPie',
  'Datadog Bits', 'Sentry Seer', 'PagerDuty AI', 'Linear AI', 'Notion AI',
];
const aspects = [
  ['inline complete', 'weak', 'Inline complete', 'Partial'],
  ['chat side panel', 'partial', 'Side chat', 'wired soft'],
  ['repo index', 'partial', 'Index', 'semantic Acc'],
  ['edit apply', 'partial', 'Apply', 'Partial'],
  ['test run', 'weak', 'Tests', 'Partial'],
  ['deploy hook', 'weak', 'Deploy', 'deploy Acc'],
  ['review PR', 'weak', 'Review', 'Partial'],
  ['docs gen', 'weak', 'Docs', 'Partial'],
];
for (const tool of tools) {
  for (const [asp, grade, how, now] of aspects) {
    add(`Parity ${tool} ${asp}`, 'coding', grade, tool, how, now);
  }
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

t = t.replace(
  /Wave 3 deep research · coding-first · UI gaps flagged/g,
  'Wave 4 deep research · keep growing · coding-first',
);
t = t.replace(
  /Wave 3 grown\. Open = \{open\}\. Place new Missing UI homes next; Agents\/Automations toggles are opt-in stubs\./g,
  'Wave 4 grown. Open = {open}. Keep researching; place UI when you say go.',
);

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
