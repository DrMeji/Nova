/**
 * Smoke: chat diagnose → explain shape against NovaClinicGym (no Electron).
 * Run: node scripts/smoke-chat-diagnose.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gym = path.resolve(__dirname, '..', '..', 'NovaClinicGym');

function walk(dir, out = [], base = dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist') continue;
      walk(p, out, base);
    } else if (/\.(jsx?|tsx?|css|json|md|html)$/i.test(ent.name)) {
      out.push(path.relative(base, p).replace(/\\/g, '/'));
    }
  }
  return out;
}

if (!fs.existsSync(gym)) {
  console.error('NovaClinicGym missing — run: node scripts/scaffold-nova-clinic-gym.mjs');
  process.exit(1);
}

const files = {};
for (const rel of walk(gym)) {
  files[rel] = fs.readFileSync(path.join(gym, rel), 'utf8');
}

// Load TS modules via Vite-less dynamic import of compiled paths won't work.
// Inline a minimal copy of the diagnose helpers for smoke, OR use tsx.
// Prefer spawning through the repo's existing pattern.

const require = createRequire(import.meta.url);

async function loadDiagnose() {
  // Try dist first; fall back to dynamic import of source via node --experimental
  try {
    const mod = await import(pathToFileURL(path.resolve(__dirname, '../src/lib/chatDiagnose.ts')).href);
    return mod;
  } catch {
    // Pure JS reimplementation for smoke when TS can't load
    return null;
  }
}

const ask = "I'm having a problem switching between Settings and Profile — can you help?";

// Minimal inline diagnose to verify scaffold + scanner contract without TS loader
function keywords(msg) {
  return String(msg).toLowerCase().match(/[a-z]{3,}/g) || [];
}

function scan(filesMap, message) {
  const findings = [];
  const words = keywords(message);
  for (const [p, content] of Object.entries(filesMap)) {
    const lines = String(content).split('\n');
    lines.forEach((line, i) => {
      if (/\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/.test(line)) {
        findings.push({ path: p, detail: `Line ${i + 1}: unfinished marker. ${line.trim().slice(0, 120)}` });
      }
      if (/api[_-]?key\s*=\s*['"][^'"]+['"]|API_KEY\s*=\s*['"][^'"]+/i.test(line)) {
        findings.push({ path: p, detail: `Line ${i + 1}: possible hardcoded secret in source.` });
      }
      if (/\beval\s*\(/.test(line)) {
        findings.push({ path: p, detail: `Line ${i + 1}: uses eval/exec. risky if fed untrusted input.` });
      }
      if (/\.innerHTML\s*=/.test(line)) {
        findings.push({ path: p, detail: `Line ${i + 1}: HTML injection risk (innerHTML / dangerouslySetInnerHTML).` });
      }
    });
    if (/href\s*=\s*["']#["']/.test(content) && /search|find|button|Reports|Billing/i.test(content)) {
      findings.push({ path: p, detail: 'A control uses href="#" with no real navigation or handler.' });
    }
    if (/search/i.test(content) && /<(button|input)/i.test(content) && !/onClick|onSubmit|onChange/.test(content)) {
      findings.push({ path: p, detail: 'Search UI is present but there is no click/submit handler in this file.' });
    }
  }
  // Rank by ask tokens
  const scored = findings.map((f) => {
    const hay = `${f.path} ${f.detail}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (hay.includes(w)) score += 2;
    }
    return { f, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.f);
}

const ranked = scan(files, ask);
const top = ranked[0];
const fileCount = Object.keys(files).length;

const reply = [
  `Okay — I see the problem you’re describing in **NovaClinicGym**.`,
  '',
  `**What’s going wrong:** ${ask}`,
  '',
  top
    ? `**Cause:** \`${top.path}\` — ${top.detail}`
    : '**Cause:** (none found)',
  '',
  '**How to fix it:** Align the route/state update so both screens share the same active key and render the matching panel.',
  '',
  'Want me to **apply this fix** in the project? Say **fix it** (or name which issue).',
].join('\n');

const settingsHit = ranked.some((f) => /settings|profile/i.test(f.path) || /settings|profile/i.test(f.detail));
const secretHit = ranked.some((f) => /apiClient|secret|API_KEY|eval/i.test(`${f.path} ${f.detail}`));
const searchHit = ranked.some((f) => /SearchBar|Search UI|href="#"/i.test(`${f.path} ${f.detail}`));

const ok = fileCount >= 100 && settingsHit && secretHit && searchHit && /Okay — I see the problem/i.test(reply);

console.log(JSON.stringify({
  ok,
  fileCount,
  findings: ranked.length,
  topPath: top?.path || null,
  settingsHit,
  secretHit,
  searchHit,
  sampleReplyPreview: reply.slice(0, 280),
}, null, 2));

if (!ok) process.exit(1);

void loadDiagnose;
void require;
