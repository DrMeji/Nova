/**
 * Field-wide pack — gaps from the broad AI landscape (not Claude-centric):
 * Kiro spec-driven, CodeRabbit PR review, Tabnine air-gap, Amp orbs,
 * Trae SOLO browser+terminal, Codex sandbox, Zed ACP (already), Dyad local privacy.
 */

import { attachCodingPackFiles } from '@/lib/inventCodingPack';
import { attachCloseAllPackFiles } from '@/lib/inventCloseAllPack';

/** Stamp canonical + Open Graph into invent index.html when present. */
export function stampInventHeadMeta(
  files: Record<string, string>,
  brand: string,
): Record<string, string> {
  const next = { ...files };
  const htmlPath = next['index.html'] ? 'index.html' : (next['public/index.html'] ? 'public/index.html' : '');
  if (!htmlPath) return next;
  let html = String(next[htmlPath] || '');
  if (!html || /rel=["']canonical["']/i.test(html)) return next;
  const slug = String(brand || 'site').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
  const canon = `https://${slug}.example/`;
  const tags = [
    `<link rel="canonical" href="${canon}" />`,
    `<meta property="og:title" content="${String(brand || 'Site').replace(/"/g, '')}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${canon}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
  ].join('\n    ');
  if (/<\/head>/i.test(html)) {
    html = html.replace(/<\/head>/i, `    ${tags}\n  </head>`);
  } else {
    html = `${tags}\n${html}`;
  }
  next[htmlPath] = html;
  return next;
}

/** Kiro-style spec-driven invent: requirements → design → tasks. */
export function specDrivenInventFiles(opts: {
  brand: string;
  brief: string;
}): Record<string, string> {
  const brand = String(opts.brand || 'Project').trim() || 'Project';
  const brief = String(opts.brief || '').slice(0, 3000);
  const req = `# Requirements — ${brand}

## Brief
${brief}

## Must
- One-of-one invent site (layout salt)
- Invent logo lock
- Live Ready before claim done
- Brand kit tokens honored

## Must not
- Lucide overwrite of invent logo
- Twin template skeleton
`;
  const design = `# Design — ${brand}

## Composition
- Genre from brief
- Layout salt from brand+brief
- SKU glyphs under public/products/

## Tokens
- See .nova/brand-kit.json
`;
  const tasks = `# Tasks — ${brand}

1. [ ] Compose invent-demo Acc
2. [ ] Premium pass
3. [ ] Brand kit + steering + stylelock
4. [ ] Live grade
5. [ ] Dual-live A/B salts
6. [ ] Ready gate
`;
  return {
    '.nova/spec/requirements.md': req,
    '.nova/spec/design.md': design,
    '.nova/spec/tasks.md': tasks,
    '.nova/spec.json': `${JSON.stringify({
      version: 1,
      brand,
      flow: ['requirements', 'design', 'tasks', 'implement'],
      source: 'kiro-style-spec-driven',
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  };
}

/** CodeRabbit / Copilot PR review lite — invent Acc diff review report. */
export function inventPrReviewReport(opts: {
  brand: string;
  findings: string[];
  score: number;
}): Record<string, string> {
  return {
    '.nova/pr-review.md': `# Invent PR review — ${opts.brand}

Score: ${opts.score}/100

## Findings
${(opts.findings || []).map((f) => `- ${f}`).join('\n') || '- (none)'}

## Next
- Fix critical invent gaps before Ready
- Keep logo lock + layout salt
`,
    '.nova/pr-review.json': `${JSON.stringify({
      version: 1,
      brand: opts.brand,
      score: opts.score,
      findings: opts.findings,
      kind: 'invent-acc-review',
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  };
}

/** Tabnine / air-gap privacy mode — local-first invent. */
export function privacyModeFiles(mode: 'local-gguf' | 'cloud-ok' | 'air-gap' = 'local-gguf'): Record<string, string> {
  return {
    '.nova/privacy-mode.json': `${JSON.stringify({
      version: 1,
      mode,
      codeLeavesMachine: mode === 'cloud-ok',
      preferLocalGguf: mode !== 'cloud-ok',
      note: mode === 'air-gap'
        ? 'No network craft — GGUF only.'
        : mode === 'local-gguf'
          ? 'Prefer local GGUF; cloud models optional.'
          : 'Cloud models allowed.',
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  };
}

/** Codex / Warp-style sandbox profile for invent shell. */
export function inventSandboxProfileFiles(): Record<string, string> {
  return {
    '.nova/sandbox-profile.json': `${JSON.stringify({
      version: 1,
      profiles: {
        invent: { network: false, workspaceWrite: true, deny: ['rm -rf', 'format'] },
        research: { network: true, workspaceWrite: false },
        brave: { network: true, workspaceWrite: true },
      },
      active: 'invent',
      note: 'Codex/Warp-inspired profiles; pairs with terminal-policy.json',
    }, null, 2)}\n`,
  };
}

/** Trae SOLO-style orchestrator: editor + terminal + browser context bundle. */
export function soloOrchestratorFiles(brand: string): Record<string, string> {
  return {
    '.nova/solo.json': `${JSON.stringify({
      version: 1,
      brand,
      lanes: ['editor', 'terminal', 'browser-live'],
      browser: { clickToSource: true, liveGrade: true, annotations: true },
      terminal: { policy: '.nova/terminal-policy.json' },
      editor: { ghostHints: '.nova/ghost-hints.json', codePill: true },
      note: 'Trae SOLO analogue — invent craft coordinates Acc + Live + shell policy',
    }, null, 2)}\n`,
  };
}

/** Amp-style orb registry (local invent runners). */
export function orbRegistryFiles(brand: string): Record<string, string> {
  return {
    '.nova/orbs.json': `${JSON.stringify({
      version: 1,
      brand,
      orbs: [
        { id: 'invent-local', kind: 'local', status: 'ready' },
        { id: 'review-subagent', kind: 'subagent', status: 'idle' },
        { id: 'polish-background', kind: 'background', status: 'ready' },
      ],
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  };
}

/** Field tool roster — what Nova tracks in competitive research. */
export function fieldRosterFiles(): Record<string, string> {
  const tools = [
    'Claude Code', 'Cursor', 'Copilot', 'Aider', 'Cline', 'Goose', 'OpenCode', 'OpenHands',
    'Kilo Code', 'Amp', 'Codex CLI', 'Gemini CLI', 'Antigravity', 'Devin', 'Devin Desktop',
    'Zed', 'Trae', 'Kiro', 'Qoder', 'Qwen Code', 'Tabby', 'JetBrains Junie', 'CodeRabbit',
    'Warp', 'Factory Droid', 'Lovable', 'Bolt', 'v0', 'Replit Agent', 'Blink', 'Base44',
    'Figma Make', 'InBuild', 'Dyad', 'Framer AI', 'Stagewise', 'Pi', 'Hermes', 'YYLO',
    'AdaL CLI', 'OpenClaw', 'Freebuff', 'Jules', 'Crush', 'Plandex', 'Kimi Code', 'Empryo',
    '1code', 'Tabnine', 'Sourcegraph Cody', 'Amazon Q', 'Roo Code (archived)', 'Continue (frozen)',
  ];
  return {
    '.nova/field-roster.json': `${JSON.stringify({
      version: 1,
      count: tools.length,
      tools,
      updatedAt: new Date().toISOString(),
      note: 'Broad field compare — not Claude-centric. Re-scan after every Nova bump.',
    }, null, 2)}\n`,
  };
}

/** Per-task worktree isolation descriptor (1code / Cursor / YYLO). */
export function worktreeIsolationFiles(brand: string): Record<string, string> {
  return {
    '.nova/worktree.json': `${JSON.stringify({
      version: 1,
      brand,
      mode: 'invent-isolated',
      base: 'HEAD',
      note: 'Prefer isolated checkout for invent hard-go; never craft on main without approve.',
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
  };
}

/** Lint/test gate checklist before Ready (safe agent stack). */
export function inventQualityGatesFiles(): Record<string, string> {
  return {
    '.nova/quality-gates.md': `# Invent quality gates

1. [ ] Invent logo lock present
2. [ ] Layout salt stamped
3. [ ] Brand kit on disk
4. [ ] Live grade score ≥ 70
5. [ ] No Lucide overwrite of invent mark
6. [ ] Spec tasks checked
7. [ ] PR review findings addressed
`,
    '.nova/quality-gates.json': `${JSON.stringify({
      version: 1,
      gates: ['logo-lock', 'layout-salt', 'brand-kit', 'live-grade', 'spec-tasks', 'pr-review'],
      failReadyIf: ['logo-lock', 'live-grade'],
    }, null, 2)}\n`,
  };
}

/** Nested AGENTS / monorepo instruction support. */
export function nestedAgentsFiles(brand: string): Record<string, string> {
  return {
    'AGENTS.md': `# AGENTS.md — ${brand}\n\nUniversal invent rules. Nested: src/AGENTS.md for App edits.\n`,
    'src/AGENTS.md': `# src/ — invent App rules\n- Keep data-nova-invent-demo and layout salt.\n- Prefer App.css surgical edits.\n`,
    '.github/copilot-instructions.md': `# Copilot instructions — ${brand}\nRespect .nova/brand-kit.json and invent logo lock.\n`,
  };
}

/** Chat fork / branch conversation marker (1code). */
export function chatForkFiles(brand: string): Record<string, string> {
  return {
    '.nova/chat-fork.json': `${JSON.stringify({
      version: 1,
      brand,
      forks: [],
      note: 'Fork invent chat from any assistant message; child inherits Acc + brand kit.',
    }, null, 2)}\n`,
  };
}

/** skills.sh install stub — cross-agent skills registry. */
export function skillsRegistryFiles(): Record<string, string> {
  return {
    '.nova/skills-registry.md': `# Skills registry

Install cross-agent skills (skills.sh pattern):

\`\`\`bash
npx skills add <owner/repo>
\`\`\`

Nova invent ships built-ins under .nova/skills/*/SKILL.md (premium-pass, redesign, code-review).
`,
  };
}

/** SEO / AI-search invent checklist (Blink/Lovable/Replit SEO agents). */
export function inventSeoGateFiles(brand: string): Record<string, string> {
  const b = String(brand || 'Site').trim() || 'Site';
  const slug = b.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: `What is ${b}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${b} is an invent-built product site owned on disk via Nova.`,
        },
      },
      {
        '@type': 'Question',
        name: `How do I get started with ${b}?`,
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'Open the site, browse the catalog, and contact or checkout from the invent Acc.',
        },
      },
    ],
  };
  const orgLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: b,
    url: `https://${slug}.example`,
  };
  return {
    'public/llms.txt': `# ${b}\n\n> Invent site owned on disk via Nova.\n\n## Links\n- /\n- /sitemap.xml\n`,
    'public/sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://${slug}.example/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
</urlset>
`,
    'public/robots.txt': `User-agent: *\nAllow: /\nSitemap: https://${slug}.example/sitemap.xml\n`,
    'public/structured-data.json': `${JSON.stringify({ faq: faqLd, organization: orgLd }, null, 2)}\n`,
    '.nova/seo-gates.md': `# SEO / AI search gates — ${b}

1. [ ] Single H1 with brand
2. [ ] title + meta description in index.html
3. [ ] public/llms.txt present
4. [ ] Crawlable text (not image-only hero)
5. [ ] logo alt / brand in nav
6. [ ] sitemap.xml + robots.txt
7. [ ] FAQ + Organization JSON-LD
8. [ ] link rel=canonical
9. [ ] Core Web Vitals invent gate proxy
`,
    '.nova/seo-gates.json': `${JSON.stringify({
      version: 2,
      brand: b,
      checks: [
        'h1', 'title', 'llms.txt', 'crawlable-text', 'logo-alt',
        'sitemap', 'robots', 'json-ld-faq', 'canonical', 'cwv-proxy',
      ],
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    '.nova/canonical.json': `${JSON.stringify({
      version: 1,
      brand: b,
      canonical: `https://${slug}.example/`,
      note: 'Inject <link rel="canonical"> into index.html at publish time.',
    }, null, 2)}\n`,
    '.nova/cwv-gate.json': `${JSON.stringify({
      version: 1,
      brand: b,
      proxy: 'live-grade',
      targets: { LCP_ms: 2500, CLS: 0.1, INP_ms: 200 },
      note: 'Live grade Acc acts as CWV invent proxy until real Lighthouse wiring.',
    }, null, 2)}\n`,
    '.nova/faq-jsonld.json': `${JSON.stringify(faqLd, null, 2)}\n`,
    '.nova/open-graph.json': `${JSON.stringify({
      version: 1,
      brand: b,
      'og:title': b,
      'og:description': `${b} — invent-built product site`,
      'og:type': 'website',
      'og:url': `https://${slug}.example/`,
      'twitter:card': 'summary_large_image',
      note: 'Merge into index.html head at publish.',
    }, null, 2)}\n`,
    'public/privacy.md': `# Privacy — ${b}

This invent Acc runs locally in Nova. Product data lives on your disk.
No visitor analytics ship by default. Do not commit secrets or .env files.
`,
    'public/terms.md': `# Terms — ${b}

Invent demo content for ${b}. Replace with counsel-reviewed terms before public launch.
`,
  };
}

/** Product JSON-LD from invent SKU names (Blink commerce SEO). */
export function inventProductSchemaFiles(opts: {
  brand: string;
  skus?: string[];
}): Record<string, string> {
  const b = String(opts.brand || 'Site').trim() || 'Site';
  const skus = (opts.skus || []).filter(Boolean).slice(0, 12);
  const products = skus.map((name, i) => ({
    '@type': 'Product',
    name,
    sku: `SKU-${i + 1}`,
    brand: { '@type': 'Brand', name: b },
  }));
  const graph = {
    '@context': 'https://schema.org',
    '@graph': products.length
      ? products
      : [{ '@type': 'Product', name: `${b} Catalog`, brand: { '@type': 'Brand', name: b } }],
  };
  return {
    'public/product-schema.json': `${JSON.stringify(graph, null, 2)}\n`,
    '.nova/product-schema.json': `${JSON.stringify({ version: 1, brand: b, count: products.length || 1 }, null, 2)}\n`,
  };
}

const DEFAULT_SECRET_ALLOWLIST = [
  'EXAMPLE_API_KEY',
  'YOUR_API_KEY_HERE',
  'sk-example',
  'placeholder',
];

/** Secret / context preflight (Context Armor lite). */
export function secretPreflightScan(files: Record<string, string>, opts?: {
  allowlist?: string[];
}): {
  findings: string[];
  ok: boolean;
  report: string;
} {
  const allow = new Set([...(opts?.allowlist || DEFAULT_SECRET_ALLOWLIST)].map((s) => s.toLowerCase()));
  const findings: string[] = [];
  const secretRe = /(?:sk-|ghp_|xox[baprs]-|AKIA[0-9A-Z]{16}|api[_-]?key\s*[:=]\s*['"][^'"]{8,})/i;
  for (const [path, body] of Object.entries(files || {})) {
    if (path.startsWith('.__')) continue;
    const text = String(body || '');
    if (secretRe.test(text)) {
      const lower = text.toLowerCase();
      const allowed = [...allow].some((a) => a && lower.includes(a));
      if (!allowed) findings.push(`${path}: possible secret pattern`);
    }
    if (/\.env$/i.test(path) && text.trim()) {
      findings.push(`${path}: env file in Acc (do not ship)`);
    }
  }
  const report = findings.length
    ? `Secret preflight FAIL\n${findings.map((f) => `- ${f}`).join('\n')}`
    : 'Secret preflight OK — no high-confidence secrets in Acc';
  return { findings, ok: findings.length === 0, report };
}

export function secretPreflightFiles(scan: { findings: string[]; ok: boolean }): Record<string, string> {
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'nova-secret-preflight', version: '1', informationUri: 'https://nova.local/invent' } },
      results: scan.findings.map((f, i) => ({
        ruleId: 'secret-pattern',
        level: 'error' as const,
        message: { text: f },
        locations: [{ physicalLocation: { artifactLocation: { uri: f.split(':')[0] || `finding-${i}` } } }],
      })),
    }],
  };
  return {
    '.nova/secret-preflight.json': `${JSON.stringify({
      version: 2,
      ok: scan.ok,
      findings: scan.findings,
      allowlist: DEFAULT_SECRET_ALLOWLIST,
      scannedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    '.nova/secret-preflight.md': `# Secret preflight\n\n${scan.ok ? 'OK' : 'FAIL'}\n\n${scan.findings.map((f) => `- ${f}`).join('\n') || '- none'}\n`,
    '.nova/secret-preflight.sarif.json': `${JSON.stringify(sarif, null, 2)}\n`,
    '.nova/secret-allowlist.json': `${JSON.stringify({
      version: 1,
      patterns: DEFAULT_SECRET_ALLOWLIST,
      note: 'Baseline placeholders ignored by invent secret preflight.',
    }, null, 2)}\n`,
  };
}

/** Amp-style invent craft modes + Oracle/Librarian orbs. */
export function inventCraftModesFiles(brand: string): Record<string, string> {
  return {
    '.nova/craft-modes.json': `${JSON.stringify({
      version: 1,
      brand,
      modes: {
        rush: { label: 'Rush', note: 'Fast invent pass — layout + brand + SKUs' },
        smart: { label: 'Smart', note: 'Default invent craft with Live grade' },
        deep: { label: 'Deep', note: 'Premium pass + SEO + secret + review' },
      },
      default: 'smart',
    }, null, 2)}\n`,
    '.nova/subagent-orbs.json': `${JSON.stringify({
      version: 1,
      brand,
      orbs: [
        { id: 'oracle', role: 'architecture-review', note: 'pr-review invent score' },
        { id: 'librarian', role: 'external-lib-research', note: 'roster + skills registry' },
        { id: 'painter', role: 'visual-brand', note: 'logo lock + brand kit' },
      ],
    }, null, 2)}\n`,
    '.nova/token-cost.json': `${JSON.stringify({
      version: 1,
      brand,
      transparency: true,
      note: 'Surface invent token/cost in status when cloud seats used; GGUF = local free.',
      localGguf: true,
    }, null, 2)}\n`,
    '.nova/retry-stop.json': `${JSON.stringify({
      version: 1,
      brand,
      retryBudget: 3,
      stopOn: ['secret-preflight-fail', 'live-grade-collapse', 'user-stop'],
      note: 'safe-stack invent loop guards',
    }, null, 2)}\n`,
    '.nova/aider-commit.md': `# Invent commit message template

\`\`\`
invent(${brand}): Ready Acc — Live grade + SEO + secret preflight
\`\`\`

Aider-style: one invent commit after Ready gates pass.
`,
  };
}

/** Don't-touch zones (AGENTS.md Always/Ask/Never). */
export function dontTouchZonesFiles(): Record<string, string> {
  return {
    '.nova/dont-touch.md': `# Don't-touch zones

## Always
- Keep invent logo lock
- Run Live grade before Ready

## Ask first
- Add npm dependencies
- Change brand kit colors
- Wipe catalog / SKU list

## Never
- Commit .env or secrets
- Force-push main
- Overwrite invent logo with Lucide
- Delete public/logo.svg
`,
  };
}

/** Image/screenshot → invent brief adapter (Codira image-to-code). */
export function imageToInventBrief(opts: {
  imageNote?: string;
  brand?: string;
}): string {
  return [
    `Invent from visual reference${opts.brand ? ` for ${opts.brand}` : ''}.`,
    opts.imageNote && `Image notes: ${opts.imageNote}`,
    'Match composition and palette; keep invent logo lock and layout salt uniqueness.',
  ].filter(Boolean).join('\n\n');
}

export function imageToInventFiles(brief: string): Record<string, string> {
  return {
    '.nova/image-to-invent.md': `# Image → invent\n\n${brief}\n`,
  };
}

/** Long-run credit/budget check-in (Lovable credit check-ins). */
export function inventBudgetFiles(): Record<string, string> {
  return {
    '.nova/budget.json': `${JSON.stringify({
      version: 1,
      checkInEveryMs: 120_000,
      note: 'Surface status if invent craft exceeds budget window; local GGUF has no cloud credits.',
      localGguf: true,
    }, null, 2)}\n`,
  };
}

/** Draft PR descriptor (GitHub Cloud Agent analogue — local). */
export function draftPrFiles(brand: string): Record<string, string> {
  return {
    '.nova/draft-pr.md': `# Draft invent PR — ${brand}

## Summary
Invent Acc Ready candidates for human review.

## Checklist
- [ ] Secret preflight OK
- [ ] SEO gates checked
- [ ] Live grade ≥ 70
- [ ] Logo lock intact
`,
  };
}

/** Blink-style SEO / AI-search invent audit score from Acc signals (0–100). */
export function inventSeoAuditFiles(files: Record<string, string>, brand: string): Record<string, string> {
  const checks: { id: string; ok: boolean; weight: number }[] = [
    { id: 'llms.txt', ok: Boolean(files['public/llms.txt']), weight: 12 },
    { id: 'sitemap', ok: Boolean(files['public/sitemap.xml']), weight: 12 },
    { id: 'robots', ok: Boolean(files['public/robots.txt']), weight: 8 },
    { id: 'faq-jsonld', ok: Boolean(files['.nova/faq-jsonld.json']), weight: 12 },
    { id: 'canonical', ok: Boolean(files['.nova/canonical.json']), weight: 10 },
    { id: 'open-graph', ok: Boolean(files['.nova/open-graph.json']), weight: 10 },
    { id: 'product-schema', ok: Boolean(files['public/product-schema.json']), weight: 10 },
    { id: 'structured-data', ok: Boolean(files['public/structured-data.json']), weight: 8 },
    { id: 'cwv-gate', ok: Boolean(files['.nova/cwv-gate.json']), weight: 8 },
    { id: 'privacy', ok: Boolean(files['public/privacy.md']), weight: 5 },
    { id: 'seo-gates', ok: Boolean(files['.nova/seo-gates.json']), weight: 5 },
  ];
  const score = checks.reduce((s, c) => s + (c.ok ? c.weight : 0), 0);
  const missing = checks.filter((c) => !c.ok).map((c) => c.id);
  return {
    '.nova/seo-audit.json': `${JSON.stringify({
      version: 1,
      brand,
      score,
      max: 100,
      missing,
      checks,
      note: 'Acc-signal SEO/AEO invent audit (Blink 0–100 analogue). Live URL scan TBD.',
      auditedAt: new Date().toISOString(),
    }, null, 2)}\n`,
    '.nova/seo-audit.md': `# SEO / AI search invent audit — ${brand}

**Score: ${score}/100**

${missing.length ? `Missing:\n${missing.map((m) => `- ${m}`).join('\n')}` : 'All Acc SEO signals present.'}
`,
  };
}

/** Stripe / Paddle invent checkout stub (Blink/Lovable payments lane — local Acc). */
export function inventPaymentsStubFiles(brand: string): Record<string, string> {
  return {
    '.nova/payments-stub.json': `${JSON.stringify({
      version: 1,
      brand,
      providers: ['stripe', 'paddle'],
      status: 'stub',
      note: 'Describe plans in chat later; invent Acc ships checkout UI hooks only — no live keys.',
      plans: [
        { id: 'monthly', label: '$29/mo', provider: 'stripe' },
        { id: 'yearly', label: '$290/yr', provider: 'stripe' },
      ],
      portal: false,
      webhook: false,
    }, null, 2)}\n`,
    '.nova/payments-stub.md': `# Payments invent stub — ${brand}

- Stripe / Paddle plan descriptors (no live secrets)
- Checkout UI hooks belong in Acc storefront
- Never commit sk_live / webhook signing secrets
`,
  };
}

/** Motion / interaction invent brief (Blink motion-from-prompt lane). */
export function inventMotionBriefFiles(brand: string): Record<string, string> {
  return {
    '.nova/motion-brief.json': `${JSON.stringify({
      version: 1,
      brand,
      prompts: [
        'staggered hero text on load',
        'scroll-driven section reveal',
        'soft hover lift on product cards',
      ],
      note: 'Invent CSS/JS motion targets — no Framer canvas dependency.',
    }, null, 2)}\n`,
  };
}

/** Lead capture / CRM invent stub (Blink HubSpot/Sheets/Slack lane). */
export function inventLeadsStubFiles(brand: string): Record<string, string> {
  return {
    '.nova/leads-stub.json': `${JSON.stringify({
      version: 1,
      brand,
      storage: 'local-acc',
      sinks: ['slack', 'sheets', 'hubspot'],
      status: 'stub',
      note: 'Forms write to Acc; CRM sinks optional via existing slack/notion integrations.',
    }, null, 2)}\n`,
  };
}

/** Claude-directory analogues: extended modes, local settings, worktree include, workflows, agent memory. */
export function inventClaudeDirAnalogFiles(brand: string): Record<string, string> {
  return {
    '.nova/permission-modes-extended.json': `${JSON.stringify({
      version: 1,
      brand,
      modes: {
        default: 'Ask before edits/shell/invent (Manual)',
        acceptEdits: 'Auto-accept file edits in Acc; ask for shell/network',
        plan: 'Read/explore only until invent plan approve',
        auto: 'Classifier-backed craft; common invent allowed',
        dontAsk: 'Deny anything that would prompt (CI/script)',
        bypassPermissions: 'Container/VM only — never for invent Ready',
        brave: 'Nova alias of high-trust auto',
      },
      defaultMode: 'auto',
      disableBypassPermissionsMode: true,
      note: 'Maps Claude Code permission modes onto invent ModeAcl',
    }, null, 2)}\n`,
    '.nova/settings.local.json': `${JSON.stringify({
      version: 1,
      brand,
      gitignored: true,
      note: 'Personal invent overrides — do not commit',
      permissionMode: 'auto',
    }, null, 2)}\n`,
    '.nova/worktreeinclude': `# Invent files to copy into isolated worktrees
.nova/brand-kit.json
.nova/invent-spec.json
public/logo.svg
AGENTS.md
`,
    '.nova/workflows/invent-ready.js': `/** Invent Ready workflow (Claude workflows/*.js analogue) */
export const name = 'invent-ready';
export async function run(ctx) {
  return {
    steps: ['secret-preflight', 'seo-audit', 'live-grade', 'logo-lock', 'human-Ready'],
    brand: ${JSON.stringify(brand)},
    note: ctx?.note || 'Gate invent Acc before Ready',
  };
}
`,
    '.nova/agent-memory/oracle/MEMORY.md': `# Oracle invent memory — ${brand}

- Prefer pr-review score ≥ 80 before Ready
- Flag missing SEO Acc signals from seo-audit
`,
    '.nova/agent-memory/librarian/MEMORY.md': `# Librarian invent memory — ${brand}

- Consult skills-registry and field roster before adding deps
`,
    '.nova/mcp.json': `${JSON.stringify({
      version: 1,
      brand,
      note: 'Team-shared MCP invent stubs — wire real servers in Nova settings',
      servers: {},
    }, null, 2)}\n`,
    '.nova/keybindings-invent.json': `${JSON.stringify({
      version: 1,
      bindings: {
        'invent.planApprove': 'mod+enter',
        'invent.stop': 'escape',
        'invent.ctsPick': 'mod+shift+c',
      },
    }, null, 2)}\n`,
  };
}

/** IDE-field analogues: Kiro specs/hooks, Qoder RepoWiki/Quest, Antigravity artifacts, Trae Builder. */
export function inventIdeFieldAnalogFiles(brand: string): Record<string, string> {
  return {
    '.nova/kiro-spec.md': `# Kiro-style invent spec — ${brand}

## Requirements
- Brand-first invent Acc with logo lock
- Live grade ≥ 70 before Ready
- Secret preflight OK

## Design
- Genre layout + layout salt uniqueness
- SEO Acc signals (llms.txt, sitemap, JSON-LD)

## Tasks
1. Craft invent Acc
2. Premium pass
3. SEO audit + secret preflight
4. Human Ready
`,
    '.nova/kiro-hooks.json': `${JSON.stringify({
      version: 1,
      brand,
      hooks: [
        { event: 'on-file-save', action: 'path-scoped-rules' },
        { event: 'on-Ready-request', action: 'invent-ready-gates' },
        { event: 'on-commit', action: 'secret-preflight' },
      ],
      note: 'Kiro event-hooks analogue for invent',
    }, null, 2)}\n`,
    '.nova/repo-wiki.md': `# RepoWiki invent lite — ${brand}

## Map
- src/App.jsx — invent shell
- .nova/brand-kit.json — tokens + salt
- public/logo.svg — logo lock
- public/products/ — SKU glyphs
- .nova/seo-audit.json — SEO/AEO score

## Quest Mode
Autonomous multi-file invent craft with Plan approve gate.
`,
    '.nova/quest-mode.json': `${JSON.stringify({
      version: 1,
      brand,
      mode: 'quest',
      note: 'Qoder Quest Mode analogue — multi-file invent with Plan→Act',
      requiresPlanApprove: true,
    }, null, 2)}\n`,
    '.nova/artifacts.json': `${JSON.stringify({
      version: 1,
      brand,
      artifacts: [
        { id: 'plan', path: '.nova/draft-pr.md' },
        { id: 'walkthrough', path: '.nova/explore-summary.md' },
        { id: 'review', path: '.nova/pr-review.md' },
        { id: 'seo', path: '.nova/seo-audit.md' },
        { id: 'security', path: '.nova/secret-preflight.md' },
      ],
      note: 'Antigravity artifacts analogue — reviewable invent trail',
    }, null, 2)}\n`,
    '.nova/agent-manager.json': `${JSON.stringify({
      version: 1,
      brand,
      note: 'Antigravity Agent Manager lite — orbs + solo orchestrator',
      parallel: false,
      agents: ['oracle', 'librarian', 'painter', 'invent-craft'],
    }, null, 2)}\n`,
    '.nova/trae-builder.json': `${JSON.stringify({
      version: 1,
      brand,
      mode: 'builder',
      note: 'Trae Builder/SOLO analogue — invent craft to Live result',
      solo: true,
    }, null, 2)}\n`,
  };
}

/** Cursor Automations / Bugbot invent analogues (local Acc stubs). */
export function inventAutomationsFiles(brand: string): Record<string, string> {
  return {
    '.nova/automations.json': `${JSON.stringify({
      version: 1,
      brand,
      note: 'Local invent automation descriptors — cloud schedule/triggers TBD',
      automations: [
        {
          id: 'invent-ready-gates',
          trigger: 'on-Ready-request',
          steps: ['secret-preflight', 'seo-audit', 'live-grade', 'logo-lock'],
        },
        {
          id: 'invent-pr-review',
          trigger: 'on-draft-pr',
          steps: ['pr-review', 'secret-sarif'],
        },
        {
          id: 'invent-security-scan',
          trigger: 'manual',
          steps: ['secret-preflight', 'dont-touch-check'],
        },
      ],
      memories: '.nova/MEMORIES.md',
    }, null, 2)}\n`,
    '.nova/MEMORIES.md': `# Invent automation memories — ${brand}

- Prefer Live grade ≥ 70 before Ready
- Never ship .env; honor secret-allowlist placeholders
`,
    '.nova/bugbot-invent.md': `# Invent Bugbot analogue — ${brand}

On draft-pr / Ready:
1. Run secret preflight (+ SARIF)
2. Run invent code-review score
3. Surface findings in .nova/pr-review.md
`,
  };
}

/** Pull SKU titles from invent App.jsx headings when brand-kit lacks skus. */
export function extractSkuTitlesFromApp(appSrc: string): string[] {
  const titles: string[] = [];
  const re = /<(?:h3|h4)[^>]*>([^<]{2,64})<\/(?:h3|h4)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(appSrc || ''))) && titles.length < 16) {
    const t = String(m[1] || '').replace(/\s+/g, ' ').trim();
    if (t && !/^(lineup|why|ask|contact|features)$/i.test(t)) titles.push(t);
  }
  return [...new Set(titles)];
}

/** Bundle field pack onto invent Acc. */
export function attachFieldPackFiles(
  files: Record<string, string>,
  opts: {
    brand: string;
    brief: string;
    reviewScore?: number;
    reviewFindings?: string[];
    skus?: string[];
  },
): Record<string, string> {
  const next = { ...files };
  Object.assign(next, attachCodingPackFiles(next, { brand: opts.brand }));
  Object.assign(next, attachCloseAllPackFiles(next, { brand: opts.brand, brief: opts.brief }));
  Object.assign(next, stampInventHeadMeta(next, opts.brand));
  Object.assign(next, specDrivenInventFiles({ brand: opts.brand, brief: opts.brief }));
  Object.assign(next, privacyModeFiles('local-gguf'));
  Object.assign(next, inventSandboxProfileFiles());
  Object.assign(next, soloOrchestratorFiles(opts.brand));
  Object.assign(next, orbRegistryFiles(opts.brand));
  Object.assign(next, fieldRosterFiles());
  Object.assign(next, worktreeIsolationFiles(opts.brand));
  Object.assign(next, inventQualityGatesFiles());
  Object.assign(next, nestedAgentsFiles(opts.brand));
  Object.assign(next, chatForkFiles(opts.brand));
  Object.assign(next, skillsRegistryFiles());
  Object.assign(next, inventSeoGateFiles(opts.brand));
  Object.assign(next, inventCraftModesFiles(opts.brand));
  {
    const skus = (opts.skus?.length
      ? opts.skus
      : extractSkuTitlesFromApp(String(next['src/App.jsx'] || next['src/App.tsx'] || '')));
    Object.assign(next, inventProductSchemaFiles({ brand: opts.brand, skus }));
  }
  Object.assign(next, inventPaymentsStubFiles(opts.brand));
  Object.assign(next, inventMotionBriefFiles(opts.brand));
  Object.assign(next, inventLeadsStubFiles(opts.brand));
  Object.assign(next, inventClaudeDirAnalogFiles(opts.brand));
  Object.assign(next, inventAutomationsFiles(opts.brand));
  Object.assign(next, inventIdeFieldAnalogFiles(opts.brand));
  Object.assign(next, dontTouchZonesFiles());
  Object.assign(next, inventBudgetFiles());
  Object.assign(next, draftPrFiles(opts.brand));
  Object.assign(next, imageToInventFiles(imageToInventBrief({ brand: opts.brand, imageNote: opts.brief.slice(0, 400) })));
  const scan = secretPreflightScan(next);
  Object.assign(next, secretPreflightFiles(scan));
  Object.assign(next, inventSeoAuditFiles(next, opts.brand));
  if (opts.reviewFindings || opts.reviewScore != null) {
    Object.assign(next, inventPrReviewReport({
      brand: opts.brand,
      findings: opts.reviewFindings || [],
      score: opts.reviewScore ?? 0,
    }));
  }
  return next;
}
