/**
 * Honest grade: run evidence tests → write catalog grades.
 * Strong only when all testIds for a stem pass. Never flips from JSONL.
 *
 * Env:
 *   FAMILY=prompt-fidelity   grade only one family
 *   STEM_PREFIX=AntiStore    optional filter
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import {
  catalogStats,
  classifyStem,
  forEachCatalogLineSync,
  CATALOG_PATH,
  GRADE_REPORT_PATH,
  NEXT_FAIL_PATH,
} from './lib/honestCatalog.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const project = path.join(root, '..');
const FAMILY = process.env.FAMILY || '';
const STEM_PREFIX = process.env.STEM_PREFIX || '';

/** @type {Record<string, { script: string, kind: 'node-tsx'|'wire' }>} */
const TESTS = {
  'invent-genre-fidelity': {
    script: '_smoke-invent-genre-fidelity.mjs',
    kind: 'node-tsx',
  },
  'invent-ready-recompose': {
    script: '_smoke-invent-ready-recompose.mjs',
    kind: 'node-tsx',
  },
  'conversation-quality': {
    script: '_smoke-conversation-quality.mjs',
    kind: 'node-tsx',
  },
  'ask-fidelity-wire': {
    script: '_smoke-conversation-quality.mjs',
    kind: 'node-tsx',
  },
  'homes-banner-wire': {
    script: null,
    kind: 'wire',
    files: ['src/components/HomeControlsPanel.tsx'],
    mustInclude: ['Turn a switch on to use these helpers'],
  },
  'craft-pack-wire': {
    script: null,
    kind: 'wire',
    files: ['src/lib/inventCraftPack.ts', 'src/lib/createInventDemo.ts'],
  },
  'coding-agent-parity': {
    script: '_smoke-coding-agent-parity.mjs',
    kind: 'node-tsx',
  },
  'coding-build-uniqueness': {
    script: '_smoke-coding-build-uniqueness.mjs',
    kind: 'node-tsx',
    preferTsx: true, // imports createInventDemo (@/ paths)
  },
  'coding-quality-win': {
    script: '_smoke-coding-quality-win.mjs',
    kind: 'node-tsx',
    preferTsx: true,
  },
  'coding-unique-all': {
    script: '_smoke-coding-unique-all.mjs',
    kind: 'node-tsx',
    preferTsx: true,
  },
  'missing-items-wire': {
    script: '_smoke-missing-items-wire.mjs',
    kind: 'node-tsx',
  },
  'voice-session-wire': {
    script: null,
    kind: 'wire',
    files: ['src/lib/voiceSession.ts'],
    mustInclude: ['voiceSupported', 'speechRecognitionSupported'],
  },
};

const testCache = new Map();

function runWire(spec) {
  const missing = (spec.files || []).filter((f) => !fs.existsSync(path.join(project, f)));
  if (missing.length) {
    return { ok: false, detail: `missing files: ${missing.join(', ')}` };
  }
  for (const f of spec.files || []) {
    const text = fs.readFileSync(path.join(project, f), 'utf8');
    for (const needle of spec.mustInclude || []) {
      if (!text.includes(needle)) {
        return { ok: false, detail: `${f} missing ${needle}` };
      }
    }
  }
  return { ok: true, detail: 'wire ok' };
}

function runTsx(script, opts = {}) {
  const scriptPath = path.join(root, script);
  const runTsxOnly = () => {
    const tsx = spawnSync(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['--yes', 'tsx', '--tsconfig', 'tsconfig.app.json', scriptPath],
      { cwd: project, encoding: 'utf8', shell: true, windowsHide: true },
    );
    if (tsx.status === 0) return { ok: true, detail: 'pass (tsx)' };
    const err = (tsx.stderr || tsx.stdout || '').slice(-800);
    return { ok: false, detail: err || `exit tsx=${tsx.status}`, tsx };
  };
  if (opts.preferTsx) return runTsxOnly();
  // Prefer strip-types for speed/reliability on Windows; then tsx for @/ imports.
  const nodeTry = spawnSync(
    process.execPath,
    ['--experimental-strip-types', scriptPath],
    { cwd: project, encoding: 'utf8', windowsHide: true },
  );
  if (nodeTry.status === 0) return { ok: true, detail: 'pass (strip-types)' };
  const viaTsx = runTsxOnly();
  if (viaTsx.ok) return viaTsx;
  const err = (nodeTry.stderr || nodeTry.stdout || viaTsx.detail || '').slice(-800);
  return { ok: false, detail: err || `exit node=${nodeTry.status}` };
}

function evalTest(testId) {
  if (testCache.has(testId)) return testCache.get(testId);
  const spec = TESTS[testId];
  let result;
  if (!spec) {
    result = { ok: false, detail: `unknown testId ${testId}` };
  } else if (spec.kind === 'wire') {
    result = runWire(spec);
  } else {
    result = runTsx(spec.script, { preferTsx: !!spec.preferTsx });
  }
  testCache.set(testId, result);
  console.log(`test ${testId}: ${result.ok ? 'PASS' : 'FAIL'} ${result.detail.slice(0, 120)}`);
  return result;
}

if (!fs.existsSync(CATALOG_PATH)) {
  console.error('Catalog empty — run node scripts/_seed-honest-catalog.mjs first');
  process.exit(1);
}

const now = new Date().toISOString();
let graded = 0;
let becameStrong = 0;
let becameOpen = 0;
let lineCount = 0;
let next = null;

// Stream rewrite — never load 500MB+ catalog as one string / giant Map.
const tmp = `${CATALOG_PATH}.${process.pid}.grade.tmp`;
const outFd = fs.openSync(tmp, 'w');
try {
  forEachCatalogLineSync((line) => {
    lineCount += 1;
    let row;
    try { row = JSON.parse(line); } catch {
      fs.writeSync(outFd, `${line}\n`);
      return;
    }
    const cls = classifyStem(row.stem);
    row.family = cls.family;
    row.lane = cls.lane;
    row.testIds = cls.testIds;

    const skipFamily = FAMILY && row.family !== FAMILY;
    const skipPrefix = STEM_PREFIX && !String(row.stem).startsWith(STEM_PREFIX);
    if (!skipFamily && !skipPrefix) {
      const ids = row.testIds || [];
      if (ids.length === 0) {
        if (row.grade === 'strong') {
          row.grade = 'ungraded';
          row.lastFail = 'no evidence tests mapped';
          row.evidenceAt = now;
          becameOpen += 1;
        } else if (row.grade !== 'ungraded' && row.grade !== 'partial') {
          row.grade = 'ungraded';
          row.evidenceAt = now;
        }
      } else {
        const results = ids.map((id) => ({ id, ...evalTest(id) }));
        const allOk = results.every((r) => r.ok);
        const prev = row.grade;
        if (allOk) {
          row.grade = 'strong';
          row.lastFail = null;
          if (prev !== 'strong') becameStrong += 1;
        } else {
          const fails = results.filter((r) => !r.ok);
          row.grade = fails.some((f) => /fidelity|Ready|twin|genre|quality/i.test(f.id)) ? 'worst' : 'weak';
          row.lastFail = fails.map((f) => `${f.id}: ${String(f.detail).slice(0, 160)}`).join(' | ');
          if (prev === 'strong') becameOpen += 1;
        }
        row.evidenceAt = now;
        graded += 1;
      }
    }

    if (
      !next
      && row.grade !== 'strong'
      && row.testIds?.length
      && (!FAMILY || row.family === FAMILY)
    ) {
      next = {
        id: row.id,
        stem: row.stem,
        family: row.family,
        grade: row.grade,
        lastFail: row.lastFail,
      };
    }
    fs.writeSync(outFd, `${JSON.stringify(row)}\n`);
  });
} finally {
  fs.closeSync(outFd);
}
if (lineCount === 0) {
  try { fs.unlinkSync(tmp); } catch { /* */ }
  console.error('Catalog empty — run node scripts/_seed-honest-catalog.mjs first');
  process.exit(1);
}
fs.renameSync(tmp, CATALOG_PATH);

const stats = catalogStats();
const familyOpen = FAMILY ? (stats.byFamily?.[FAMILY]?.open ?? 0) : stats.open;

const report = {
  gradedAt: now,
  familyFilter: FAMILY || null,
  stemPrefix: STEM_PREFIX || null,
  catalogPath: CATALOG_PATH,
  graded,
  becameStrong,
  becameOpen,
  testResults: Object.fromEntries([...testCache.entries()]),
  stats,
  nextFail: next
    ? { id: next.id, stem: next.stem, family: next.family, grade: next.grade, lastFail: next.lastFail }
    : null,
  verdict:
    FAMILY
      ? (familyOpen === 0
        ? `PASS — family ${FAMILY} all Strong (tests) · catalog open elsewhere ${stats.open}`
        : `OPEN — family ${FAMILY} has ${familyOpen} open · next: ${next?.stem || 'none'}`)
      : (stats.open === 0
        ? `PASS — ${stats.by.strong} Strong (tests)`
        : `OPEN — ${stats.open} not Strong · next: ${next?.stem || 'none'}`),
};

fs.writeFileSync(GRADE_REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`);
if (next) {
  fs.writeFileSync(
    NEXT_FAIL_PATH,
    `${JSON.stringify({
      ...next,
      targetFiles: [
        'src/lib/codingQualityWinPack.ts',
        'src/lib/inventBriefFidelity.ts',
        'src/lib/createInventDemo.ts',
        'src/lib/chatTurnHandlers/create.ts',
        'src/lib/novaAgentLoop.ts',
      ],
      instruction:
        'Implement real src/ fix for this stem (coding quality pipeline / invent anti-twin), run _implement-coding-quality.mjs if wire FAIL, then re-grade',
    }, null, 2)}\n`,
  );
} else if (fs.existsSync(NEXT_FAIL_PATH)) {
  fs.unlinkSync(NEXT_FAIL_PATH);
}

console.log(JSON.stringify(report, null, 2));
