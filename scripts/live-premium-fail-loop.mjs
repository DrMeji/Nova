/**
 * Premium Live invent → miss report (why it failed, not taste).
 *
 *   $env:NOVA_CDP_PORT='9466'
 *   node scripts/live-premium-fail-loop.mjs
 *
 * Uses live-create-to-live for the create hop, then scores the Acc folder.
 * Exit: 0 = no critical misses; 1 = create/script fail; 2 = critical misses (loop food).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = Number(process.env.NOVA_CDP_PORT || 9466);
const BRAND = process.env.NOVA_CREATE_BRAND || 'Meridian Leather Atelier';
const OUT = path.join(root, '.tmp-live-fail-loop');
const HISTORY = path.join(OUT, 'history');
fs.mkdirSync(HISTORY, { recursive: true });

const PROMPT = process.env.NOVA_PREMIUM_PROMPT || [
  `Create a new website project called ${BRAND} on disk now.`,
  'Professional premium leather-goods atelier site.',
  'Soft parchment paper background, deep espresso navy type, warm brass accent.',
  'Full-bleed quiet hero with the brand name and one short line about handcrafted bags.',
  'Sticky top nav with logo mark + Shop / Story / Contact.',
  'A grid of 4 product cards: each real bag name + short material line (not Book One / Card one).',
  'Story band with real copy about craft, then a simple contact strip.',
  'Polished single-page invent — unique layout, no generic ladder shells.',
  'Skip Plan — build it and get Live.',
].join(' ');

function scoreProject(diskRoot, brand, brief) {
  const misses = [];
  const appPath = ['src/App.jsx', 'src/App.tsx']
    .map((p) => path.join(diskRoot, p))
    .find((p) => fs.existsSync(p));
  const app = appPath ? fs.readFileSync(appPath, 'utf8') : '';
  const css = fs.existsSync(path.join(diskRoot, 'src/App.css'))
    ? fs.readFileSync(path.join(diskRoot, 'src/App.css'), 'utf8')
    : '';
  const sections = {};
  const secDir = path.join(diskRoot, 'src', 'sections');
  if (fs.existsSync(secDir)) {
    for (const n of fs.readdirSync(secDir)) {
      if (/\.jsx?$/i.test(n)) {
        sections[n] = fs.readFileSync(path.join(secDir, n), 'utf8');
      }
    }
  }
  const blob = [app, css, ...Object.values(sections)].join('\n');
  const brandCore = String(brand).replace(/\s+[a-z0-9]{3,5}$/i, '').trim() || brand;

  if (!app.trim()) {
    misses.push({
      id: 'no-app',
      severity: 1,
      why: 'No src/App.jsx on disk after create — craft never shipped a mountable App',
      research: 'create craft path / applyChatReplyEdits / syntax gate swallowing writes',
    });
    return misses;
  }
  const appCompact = app.replace(/\s+/g, '');
  const bareNavOnly = (
    (/Bare Vite mount|id=["']root-app["']/i.test(app) && appCompact.length < 900)
    || (appCompact.length < 700 && /sticky-nav/i.test(app) && !/from\s+['"]\.\/sections\//i.test(app) && !/<section\b/i.test(app))
  ) && Object.keys(sections).filter((n) => !/PageBody/i.test(n)).length < 2;
  if (bareNavOnly) {
    misses.push({
      id: 'bare-scaffold',
      severity: 1,
      why: 'App still Bare Vite / nav-only — invent never shipped hero/shop/story sections',
      research: 'seedCompositionalInventFloor / isBareOrNavOnlyInventApp / depth bail too early',
    });
  }
  if (/\bcards\.map\b/.test(app) && !/\b(?:const|let|var)\s+cards\b/.test(app)) {
    misses.push({
      id: 'undeclared-cards',
      severity: 1,
      why: 'App uses cards.map without declaring cards — blank Live ReferenceError',
      research: 'createSyntaxGate undeclaredCollectionReasons must block Ready',
    });
  }
  if (/Card one|Short text for card one/i.test(blob)) {
    misses.push({
      id: 'card-one-ladder',
      severity: 2,
      why: 'Generic Card-one ladder stamped over invent — micro shell won vs marketing create',
      research: 'webProjectCanon isWebMicroAsk / reactSurgicalMicroAskEdits cards+grid',
    });
  }
  if (!new RegExp(brandCore.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(blob)) {
    misses.push({
      id: 'brand-missing',
      severity: 3,
      why: `Brand "${brandCore}" never appears in App/sections — invent ignored product identity`,
      research: 'verifyCreateBriefAgainstFiles / invent fidelity / craft prompt brand lock',
    });
  }
  const heroFile = Object.keys(sections).find((n) => /Hero/i.test(n));
  const heroMounted = /<(?:HeroSection|Hero)\b/.test(app)
    || /from\s+['"]\.\/sections\/[^'"]*Hero/i.test(app);
  if (heroFile && !heroMounted) {
    misses.push({
      id: 'hero-unmounted',
      severity: 4,
      why: `${heroFile} landed on disk but App never mounts it — compose shell skipped`,
      research: 'ensureLandedSectionsMountedInApp / assembleCompositionalAppShell late flush',
    });
  }
  if (!heroFile && !heroMounted && !/<section\b[^>]*hero|className=["'][^"']*hero/i.test(app)) {
    misses.push({
      id: 'no-hero',
      severity: 3,
      why: 'Brief required full-bleed hero; neither Hero section nor in-App hero shipped',
      research: 'compositional section specs / depth invent hero slot / craft order',
    });
  }
  if (heroFile && String(sections[heroFile] || '').replace(/\s+/g, '').length < 280) {
    misses.push({
      id: 'thin-hero',
      severity: 3,
      why: 'Hero section is a stub (<280 compact chars) — not full-bleed premium invent',
      research: 'compositionalSectionFileSubstantial / depth top-up / invent underuse on hero',
    });
  }
  if (/\bBook\s+One\b|\bAuthor\s+A\b|\bCard\s+one\b|\bBag\s+One\b|\bProduct\s+One\b|\bItem\s+One\b/i.test(blob)) {
    misses.push({
      id: 'placeholder-copy',
      severity: 5,
      why: 'Placeholder Bag/Book/Product One titles — invent never wrote real product copy',
      research: 'thinAskMatchDeficits placeholder gate + craft anti-placeholder rules',
    });
  }
  if (!fs.existsSync(path.join(diskRoot, 'node_modules', 'vite'))) {
    misses.push({
      id: 'vite-not-installed',
      severity: 1,
      why: 'node_modules/vite missing — npm install never finished, Live cannot paint',
      research: 'create npm/bootstrap before Live / markCreateJobNpm / install timeout',
    });
  }
  if (!/sticky|nav|header/i.test(app) && !Object.values(sections).some((s) => /nav|header/i.test(s))) {
    misses.push({
      id: 'no-nav',
      severity: 3,
      why: 'Brief asked sticky nav with Shop/Story/Contact — missing',
      research: 'formatCompositionalSectionSpecs nav slot / craft must-haves',
    });
  }
  if (app.replace(/\s+/g, '').length < 400 && Object.keys(sections).length < 2) {
    misses.push({
      id: 'thin-invent',
      severity: 3,
      why: 'Invent stayed thin (<400 App, <2 sections) — depth/compositional bail too early',
      research: 'thinNeedsDepthPass / THIN_DEPTH_ZERO_GAIN_BAIL / invent model underuse',
    });
  }
  if (!/parchment|paper|cream|#f[0-9a-f]{2,5}|espresso|brass|#[cb][0-9a-f]{5}/i.test(blob)) {
    misses.push({
      id: 'palette-miss',
      severity: 6,
      why: 'Brief palette (parchment / espresso / brass) not reflected in CSS or copy',
      research: 'DESIGN.md tokens / inventCraftPack brand kit / CSS craft rules',
    });
  }
  // Permanent atelier fixes (2026-10-23): dark SaaS stomp + Footer mount + App ../context
  if (/linear-gradient\(\s*165deg[^;]*#0c0f14/i.test(css)
    || (/#0c0f14/.test(css) && /--paper|#f4efe6|#f3eee4/i.test(css))) {
    misses.push({
      id: 'dark-tech-stomp',
      severity: 2,
      why: 'App.css still has dark #0c0f14 SaaS atmosphere on a parchment atelier brief',
      research: 'healAtelierPaletteCss / briefWantsLightPaperGround / healNearReadyCreateUi',
    });
  }
  const footFile = Object.keys(sections).find((n) => /Footer|Contact/i.test(n));
  const footMounted = /<(?:FooterSection|Footer|ContactSection|Contact)\b/.test(app)
    || /from\s+['"]\.\/sections\/[^'"]*(?:Footer|Contact)/i.test(app);
  if (footFile && !footMounted) {
    misses.push({
      id: 'footer-unmounted',
      severity: 4,
      why: `${footFile} landed but App does not mount it — ensureLanded used to skip lone Footer`,
      research: 'ensureLandedSectionsMountedInApp always remount + THIN_FOOTER_MOUNTABLE_MIN_CHARS',
    });
  }
  if (/from\s+['"]\.\.\/(?:context|contexts|providers|store)\b/.test(app)) {
    misses.push({
      id: 'app-context-import',
      severity: 1,
      why: 'App.jsx has ../context-style imports (PageBody rewrite leaked) — Vite kids:0 Live',
      research: 'healAppShellRelativeImports / healSectionRelativeImports',
    });
  }
  void brief;
  return misses.sort((a, b) => a.severity - b.severity);
}

function projectInventScore(diskRoot) {
  // Prefer Acc that actually invented (sections + brand App), not a newer empty -2 twin.
  try {
    const app = ['src/App.jsx', 'src/App.tsx']
      .map((p) => path.join(diskRoot, p))
      .find((p) => fs.existsSync(p));
    const appBody = app ? fs.readFileSync(app, 'utf8') : '';
    const secDir = path.join(diskRoot, 'src', 'sections');
    const secCount = fs.existsSync(secDir)
      ? fs.readdirSync(secDir).filter((n) => /\.jsx$/i.test(n) && !/PageBody/i.test(n)).length
      : 0;
    const hasVite = fs.existsSync(path.join(diskRoot, 'node_modules', 'vite'));
    const compact = appBody.replace(/\s+/g, '').length;
    const mountsHero = /<(?:HeroSection|Hero)\b|from\s+['"]\.\/sections\/[^'"]*Hero/i.test(appBody);
    return (secCount * 1000) + (mountsHero ? 500 : 0) + Math.min(compact, 4000) + (hasVite ? 200 : 0);
  } catch {
    return 0;
  }
}

function findLatestProject(brand) {
  const PROJECTS = path.join(os.homedir(), 'Documents', 'NOVA Projects');
  const slug = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const core = slug.split('-')[0];
  if (!fs.existsSync(PROJECTS) || !core) return null;
  // Ash Latch 2026-10-23: meridian/leather catch-all scored a stale folder when create
  // never wrote disk — only accept slug / brand-core matches (prefer exact slug).
  // Fern Latch: fern-latch-atelier-2 was newer but bare — invent score must beat mtime.
  const hits = fs.readdirSync(PROJECTS)
    .map((n) => {
      try {
        const p = path.join(PROJECTS, n);
        return {
          n,
          p,
          t: fs.statSync(p).mtimeMs,
          invent: projectInventScore(p),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter((x) => {
      const low = x.n.toLowerCase();
      return low === slug || low.startsWith(`${slug}-`) || low.includes(core);
    })
    .sort((a, b) => {
      if (b.invent !== a.invent) return b.invent - a.invent;
      const aExact = a.n.toLowerCase() === slug || a.n.toLowerCase().startsWith(`${slug}-`) ? 1 : 0;
      const bExact = b.n.toLowerCase() === slug || b.n.toLowerCase().startsWith(`${slug}-`) ? 1 : 0;
      if (bExact !== aExact) return bExact - aExact;
      return b.t - a.t;
    });
  return hits[0]?.p || null;
}

async function runCreate() {
  return new Promise((resolve) => {
    const env = {
      ...process.env,
      NOVA_CDP_PORT: String(PORT),
      NOVA_CREATE_BRAND: BRAND,
      NOVA_CREATE_PROMPT: PROMPT,
    };
    const child = spawn(
      process.execPath,
      [path.join(__dirname, 'live-create-to-live.mjs')],
      { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let out = '';
    child.stdout.on('data', (d) => {
      const s = d.toString();
      out += s;
      process.stdout.write(s);
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      out += s;
      process.stderr.write(s);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

console.log('\n=== LIVE PREMIUM FAIL LOOP · invent ===');
console.log('Brand:', BRAND);
console.log('CDP:', PORT);
console.log('Prompt:', PROMPT.slice(0, 180) + '…');

const create = await runCreate();
const disk = findLatestProject(BRAND);
const misses = disk ? scoreProject(disk, BRAND, PROMPT) : [{
  id: 'no-disk',
  severity: 1,
  why: 'Create finished without a project folder — routing/write path failed',
  research: 'create job store / diskRoot bind / CDP reply parse',
}];
// River Hide: Acc scored clean while createExit 4 (Live empty / no Live control) — never PASS that.
if (create.code && create.code !== 0) {
  misses.push({
    id: 'live-create-exit',
    severity: 1,
    why: `live-create-to-live exited ${create.code} — Live did not verify (paint/control/vite)`,
    research: 'inventFloorClearsLive fast-path / Live unlock / finishPlainReply before prove click',
  });
}
const report = {
  at: new Date().toISOString(),
  brand: BRAND,
  cdp: PORT,
  createExit: create.code,
  disk,
  prompt: PROMPT,
  misses: misses.sort((a, b) => a.severity - b.severity),
};

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(path.join(HISTORY, `${stamp}.json`), JSON.stringify(report, null, 2));
fs.writeFileSync(path.join(OUT, 'latest-report.json'), JSON.stringify(report, null, 2));

console.log('\n=== MISS LIST (why) ===');
if (!report.misses.length) {
  console.log('PASS — no scored misses');
  process.exit(0);
}
for (const m of report.misses) {
  console.log(`  [${m.severity}] ${m.id}: ${m.why}`);
  console.log(`         research → ${m.research}`);
}
const critical = report.misses.filter((m) => m.severity <= 4);
console.log(`\nReport: ${path.join(OUT, 'latest-report.json')}`);
console.log(`Critical misses: ${critical.length}`);
process.exit(critical.length ? 2 : (create.code && create.code !== 0 ? 1 : 0));
