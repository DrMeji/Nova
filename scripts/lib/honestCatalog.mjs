/**
 * Stable capability catalog helpers for honest scan → implement → verify.
 * Grades come from tests, never from template grow or JSONL flips.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
/** Set NOVA_CATALOG_PATH / related envs to run an isolated coding-deep catalog (full reset). */
function envPath(name, fallback) {
  const v = String(process.env[name] || '').trim();
  return v ? (path.isAbsolute(v) ? v : path.join(root, '..', v)) : fallback;
}
export const CATALOG_PATH = envPath(
  'NOVA_CATALOG_PATH',
  path.join(root, 'data', 'nova-capability-catalog.jsonl'),
);
export const CATALOG_META_PATH = envPath(
  'NOVA_CATALOG_META_PATH',
  path.join(root, 'data', 'nova-capability-catalog-meta.json'),
);
export const NEXT_FAIL_PATH = envPath(
  'NOVA_NEXT_FAIL_PATH',
  path.join(root, 'data', 'honest-next-fail.json'),
);
export const GRADE_REPORT_PATH = envPath(
  'NOVA_GRADE_REPORT_PATH',
  path.join(root, 'data', 'honest-grade-report.json'),
);
/** Last discover wave payload — canvas living list reads this so the table tracks NEW stems. */
export const LAST_DISCOVER_PATH = envPath(
  'NOVA_LAST_DISCOVER_PATH',
  path.join(root, 'data', 'honest-last-discover.json'),
);
export const CODING_MISSING_PATH = path.join(root, 'data', 'coding-missing-discovered.json');

/** @typedef {'prompt-fidelity'|'conversation'|'protocol-ui'|'craft-media'|'coding-agent'|'coverage-matrix'} Family */
/** @typedef {'strong'|'worst'|'weak'|'partial'|'ungraded'} Grade */

/**
 * Collapse wave/cycle tags the same way rebuild-open-all does.
 * @param {string} cap
 */
export function stemOf(cap) {
  let s = String(cap || '').trim();
  s = s.replace(/^C\d+\s+/i, '');
  s = s.replace(/^W\d+\s+/i, '');
  s = s.replace(/^Invent(?:80|100)?\s+/i, 'Invent ');
  s = s.replace(/^Seat(?:80|100)?\s+/i, 'Seat ');
  s = s.replace(/^Model(?:80|100)?\s+/i, 'Model ');
  s = s.replace(/^Kind(?:80|100)?\s+/i, 'Kind ');
  s = s.replace(/^Domain(?:80|100)?\s+/i, 'Domain ');
  s = s.replace(/^ImagePipe(?:80|100)?\s+/i, 'ImagePipe ');
  s = s.replace(/^Fidelity(?:80|100)?\s+/i, 'Fidelity ');
  s = s.replace(/^MaxModel(?:80|100)?\s+/i, 'MaxModel ');
  s = s.replace(/^Protocol(?:80|100)?\s+/i, 'Protocol ');
  s = s.replace(/^CoverageFid\s+W\d+\s+\d+\s+(\w+)\s+(\S+)\s+\S+/i, 'CoverageFid $1 $2');
  s = s.replace(/^CoveragePeer\s+W\d+\s+\d+\s+(\S+)\s+(.+?)\s+[a-f0-9]{6,}\s*$/i, 'CoveragePeer $1 $2');
  s = s.replace(
    /^Peer\s+(\S+)\s+(.+?)\s+\((?:Nova weaker|Nova missing|Nova partial|peer stronger UX|peer clearer plan)\)\s*$/i,
    'Peer $1 $2',
  );
  s = s.replace(/^Coverage\d+k\s+C\d+\s+\d+\s+(\w+)\s+(\S+)/i, 'Coverage $1 $2');
  s = s.replace(/^Coverage\d+k\s+\d+\s+(\w+)\s+(\S+)/i, 'Coverage $1 $2');
  return s.slice(0, 160);
}

/**
 * @param {string} stem
 * @returns {{ family: Family, lane: string, testIds: string[] }}
 */
export function classifyStem(stem) {
  const s = String(stem || '');
  if (/^(AntiStore|NegGenre|Understand|Fidelity)\b/i.test(s)) {
    return {
      family: 'prompt-fidelity',
      lane: 'coding',
      testIds: ['invent-genre-fidelity', 'invent-ready-recompose'],
    };
  }
  if (/^Convo\b/i.test(s)) {
    return {
      family: 'conversation',
      lane: 'product',
      testIds: ['conversation-quality'],
    };
  }
  if (/^HomeUX\b/i.test(s)) {
    return {
      family: 'protocol-ui',
      lane: 'product',
      testIds: ['homes-banner-wire'],
    };
  }
  if (/^Craft\b/i.test(s)) {
    return {
      family: 'craft-media',
      lane: 'coding',
      testIds: ['craft-pack-wire'],
    };
  }

  // App surfaces (top of Nova) → families.
  if (/^Surface\s+(Chat|Plan mode|Voice|Debug Clinic)\b/i.test(s)) {
    return {
      family: 'conversation',
      lane: 'product',
      testIds: ['conversation-quality'],
    };
  }
  if (/^Surface\s+(Create\/build|Edit|Live preview)\b/i.test(s)) {
    return {
      family: 'prompt-fidelity',
      lane: 'coding',
      testIds: ['invent-genre-fidelity', 'invent-ready-recompose'],
    };
  }
  if (/^Surface\s+(Agents home|Automations home|Integrations home|Settings|Models hub|Local AI|Projects binder|Code overlay)\b/i.test(s)) {
    return {
      family: 'protocol-ui',
      lane: 'product',
      testIds: ['homes-banner-wire'],
    };
  }

  // Peer / CoveragePeer dimensions → testable families (premium + OSS research).
  const peerBlob = s.replace(/^CoveragePeer\s+/i, 'Peer ').replace(/^Peer\s+\S+\s+/i, '');
  if (
    /brief fidelity|anti template twin|no silent genre swap|simple prompt/i.test(peerBlob)
    || /anti template twin|brief fidelity|no silent genre swap/i.test(s)
  ) {
    return {
      family: 'prompt-fidelity',
      lane: 'protocol',
      testIds: ['invent-genre-fidelity', 'invent-ready-recompose'],
    };
  }
  if (
    /chat stays on topic|clarify before build|plan visibility|ask before destructive|stop when done|refuse silent invent pivot|multi-turn memory|debug from error log/i.test(s)
  ) {
    return {
      family: 'conversation',
      lane: 'product',
      testIds: ['conversation-quality'],
    };
  }
  if (/image\/craft|logo|media when asked/i.test(s)) {
    return {
      family: 'craft-media',
      lane: 'coding',
      testIds: ['craft-pack-wire'],
    };
  }
  if (/diff review UX|rules\/skills|model seat swap|Live evidence gate|settings\/homes|composer UX|project binder/i.test(s)) {
    return {
      family: 'protocol-ui',
      lane: 'protocol',
      testIds: ['homes-banner-wire'],
    };
  }
  if (
    /multi-file agent loop|terminal\/tool use|repo-wide refactor|test then fix|apply patch confidence|context from whole project|coding non-website|edit keeps intent/i.test(s)
  ) {
    return {
      family: 'coding-agent',
      lane: 'coding',
      testIds: ['coding-agent-parity'],
    };
  }
  if (/^Kind\b/i.test(s) && /CLI|API|MCP|Electron|Discord|library|game|RAG|agent harness|mobile/i.test(s)) {
    return {
      family: 'coding-agent',
      lane: 'coding',
      testIds: ['coding-agent-parity'],
    };
  }
  if (/^Kind\b/i.test(s) && /knife|dashboard|docs site|Chrome extension|atelier|website/i.test(s)) {
    return {
      family: 'prompt-fidelity',
      lane: 'coding',
      testIds: ['invent-genre-fidelity', 'invent-ready-recompose'],
    };
  }
  if (/voice input quality/i.test(s) || /^Surface\s+Voice\b/i.test(s)) {
    return {
      family: 'conversation',
      lane: 'product',
      testIds: ['voice-session-wire'],
    };
  }
  if (
    /^Spine\s+(Chat|Plan|Onboarding|Edit surgical)/i.test(s)
    || /plan todos|plan mode exit|composer send|drag drop file|mention @file/i.test(s)
  ) {
    return {
      family: 'conversation',
      lane: 'product',
      testIds: ['conversation-quality'],
    };
  }
  if (
    /^Spine\s+(Create|Debug|Ready|Live|heal)/i.test(s)
    || /Ready means Live|heal blank preview|bound project never hijacked|guest local create|Create job never silent/i.test(s)
  ) {
    return {
      family: 'prompt-fidelity',
      lane: 'coding',
      testIds: ['invent-genre-fidelity', 'invent-ready-recompose'],
    };
  }
  if (
    /^Spine\s+(Agents|Missing items|Models|Local AI)/i.test(s)
    || /token budget visible|secrets never echoed|destructive rm/i.test(s)
  ) {
    return {
      family: 'protocol-ui',
      lane: 'product',
      testIds: ['homes-banner-wire'],
    };
  }
  if (
    /partial apply|checkpoint restore|parallel agent|merge conflict|commit message|PR description|mcp tool|multi-model ensemble|cheap model for classify|skills\/rules|browser CDP|screenshot to edit|repo-wide|inline error explain|breakpoint-style debug|long context project map/i.test(s)
  ) {
    return {
      family: 'coding-agent',
      lane: 'coding',
      testIds: ['coding-agent-parity'],
    };
  }
  if (/create progress with cancel/i.test(s)) {
    return {
      family: 'prompt-fidelity',
      lane: 'coding',
      testIds: ['invent-genre-fidelity', 'invent-ready-recompose'],
    };
  }

  // Coding-deep loop stems (pipeline + craft + verify + premium + prior).
  if (/^Code(?:Build|Nav|Model|UX|Kind|Unique|MissingUI|Pipe|Craft|Verify|Premium|Understand|Quality)\b/i.test(s)) {
    if (
      /Unique|Premium|Understand|palette|logo|font|layout|anti[- ]?twin|per[- ]?brand|product[- ]?kind|premium|twin|brief/i.test(
        s,
      )
    ) {
      return {
        family: 'prompt-fidelity',
        lane: 'coding',
        testIds: [
          'invent-genre-fidelity',
          'invent-ready-recompose',
          'coding-build-uniqueness',
          'coding-quality-win',
        ],
      };
    }
    if (/MissingUI|missing\s+tab|composer chrome|mode switcher|trace panel|pipeline step checklist/i.test(s)) {
      return {
        family: 'protocol-ui',
        lane: 'product',
        testIds: ['homes-banner-wire', 'missing-items-wire', 'coding-quality-win'],
      };
    }
    // CodePipe / CodeCraft / CodeVerify / CodeBuild → coding-agent + hard quality win.
    return {
      family: 'coding-agent',
      lane: 'coding',
      testIds: ['coding-agent-parity', 'coding-build-uniqueness', 'coding-quality-win', 'coding-unique-all'],
    };
  }

  // Expanding research waves PeerR*/CoverageR* — map by family token in stem.
  // Formats:
  //   PeerR245 peer-gap Cursor brief: negation-aware genre (Nova missing)
  //   CoverageR245 peer-gap #0 Cursor brief negation-aware genre abcd1234
  const waveFam = /^(?:PeerR|CoverageR)\d+\b[\s\S]*?\b(brief|plan|build|edit|debug|agent|chat|craft)\b/i.exec(s);
  if (waveFam) {
    const fam = waveFam[1].toLowerCase();
    if (fam === 'brief') {
      return {
        family: 'prompt-fidelity',
        lane: 'coding',
        testIds: ['invent-genre-fidelity', 'invent-ready-recompose'],
      };
    }
    if (fam === 'plan' || fam === 'chat') {
      return {
        family: 'conversation',
        lane: 'product',
        testIds: ['conversation-quality'],
      };
    }
    if (fam === 'craft') {
      return {
        family: 'craft-media',
        lane: 'coding',
        testIds: ['craft-pack-wire'],
      };
    }
    // build | edit | debug | agent
    return {
      family: 'coding-agent',
      lane: 'coding',
      testIds: ['coding-agent-parity'],
    };
  }

  // Legacy PeerR*/CoverageR* wording (pre-theme) — keep mapped.
  if (
    /\bbrief:|no twin skeleton|negation-aware genre|must-have extraction|brand lock|do-not list honored/i.test(s)
    || /\bbrief\b.*\b(negation|must-have|do-not|brand lock)/i.test(s)
  ) {
    return {
      family: 'prompt-fidelity',
      lane: 'coding',
      testIds: ['invent-genre-fidelity', 'invent-ready-recompose'],
    };
  }
  if (
    /\b(plan|chat):|short answer|no random create|remember locked|cite project|visible step|user confirm|estimate file touch|risk callouts/i.test(s)
    || /\b(plan|chat)\b.*\b(visible step|confirm|short answer|create pivot|locked brand|cite project)/i.test(s)
  ) {
    return {
      family: 'conversation',
      lane: 'product',
      testIds: ['conversation-quality'],
    };
  }
  if (
    /\b(build|edit|debug|agent):|streaming file|mid-build cancel|Live unlock|surgical rename|console error|tool call|sandbox shell|multi-file patch|blank Live|show diff before apply|keep layout salt|reject unrelated rewrite|Network fail|repro steps|stop on test fail/i.test(s)
    || /\b(build|edit|debug|agent)\b.*\b(streaming|cancel|Live|surgical|diff|layout salt|console|heal|tool|sandbox|patch|test fail)/i.test(s)
  ) {
    return {
      family: 'coding-agent',
      lane: 'coding',
      testIds: ['coding-agent-parity'],
    };
  }
  if (
    /\bcraft:|logo when asked|hero image|SKU art|premium typography/i.test(s)
    || /\bcraft\b.*\b(logo|hero|SKU|typography)/i.test(s)
  ) {
    return {
      family: 'craft-media',
      lane: 'coding',
      testIds: ['craft-pack-wire'],
    };
  }

  // Remaining Peer / Coverage — research-only until mapped to a test.
  return {
    family: 'coverage-matrix',
    lane: /Peer|Coverage|Surface|Spine/i.test(s) ? 'protocol' : 'coding',
    testIds: [],
  };
}

export function stemId(stem) {
  return crypto.createHash('sha1').update(String(stem).toLowerCase()).digest('hex').slice(0, 12);
}

/** Sync line iterator — never readFileSync the whole catalog (can exceed V8 string limit). */
export function forEachCatalogLineSync(onLine) {
  if (!fs.existsSync(CATALOG_PATH)) return;
  const fd = fs.openSync(CATALOG_PATH, 'r');
  const bufSize = 1024 * 1024;
  const buf = Buffer.alloc(bufSize);
  let leftover = '';
  try {
    for (;;) {
      const n = fs.readSync(fd, buf, 0, bufSize, null);
      if (n <= 0) break;
      leftover += buf.toString('utf8', 0, n);
      let idx;
      while ((idx = leftover.indexOf('\n')) >= 0) {
        const line = leftover.slice(0, idx);
        leftover = leftover.slice(idx + 1);
        if (line.trim()) onLine(line);
      }
    }
    if (leftover.trim()) onLine(leftover);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * @returns {Map<string, object>}
 */
export function loadCatalogMap() {
  const map = new Map();
  forEachCatalogLineSync((line) => {
    let r;
    try { r = JSON.parse(line); } catch { return; }
    const key = String(r.stem || '').toLowerCase();
    if (!key) return;
    map.set(key, r);
  });
  return map;
}

/** Keys-only scan — cheap existence check for append. */
export function loadCatalogKeySet() {
  const set = new Set();
  forEachCatalogLineSync((line) => {
    try {
      const r = JSON.parse(line);
      const key = String(r.stem || '').toLowerCase();
      if (key) set.add(key);
    } catch { /* */ }
  });
  return set;
}

/**
 * @param {Iterable<object>} rows
 */
export function writeCatalog(rows) {
  fs.mkdirSync(path.dirname(CATALOG_PATH), { recursive: true });
  const tmp = `${CATALOG_PATH}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    for (const r of rows) {
      fs.writeSync(fd, `${JSON.stringify(r)}\n`);
    }
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, CATALOG_PATH);
}

/**
 * Append-only: add stems that are not already in the catalog.
 * Never overwrites grade of existing Strong rows.
 * Does NOT rewrite the whole file (PC-safe for 500MB+ catalogs).
 * @param {Array<{ stem: string, peerNote?: string, leader?: string, howTheyDoIt?: string }>} candidates
 */
export function appendStems(candidates, opts = {}) {
  const keys = loadCatalogKeySet();
  let added = 0;
  let skipped = 0;
  const now = new Date().toISOString();
  /** @type {object[]} */
  const addedRows = [];
  let tick = 0;
  for (const c of candidates) {
    const stem = stemOf(c.stem || c.capability || '');
    if (!stem) continue;
    const key = stem.toLowerCase();
    if (keys.has(key)) {
      skipped += 1;
      continue;
    }
    const cls = classifyStem(stem);
    const discoveredAt = new Date(Date.parse(now) + tick).toISOString();
    tick += 1;
    const row = {
      id: stemId(stem),
      stem,
      family: cls.family,
      lane: cls.lane,
      peerNote: c.peerNote || c.leader || '',
      howTheyDoIt: c.howTheyDoIt || '',
      testIds: cls.testIds,
      grade: 'ungraded',
      evidenceAt: null,
      lastFail: null,
      discoveredAt,
      researchWave: opts.wave != null ? Number(opts.wave) : undefined,
    };
    keys.add(key);
    addedRows.push(row);
    added += 1;
  }
  if (addedRows.length) {
    fs.appendFileSync(
      CATALOG_PATH,
      `${addedRows.map((r) => JSON.stringify(r)).join('\n')}\n`,
      'utf8',
    );
  }
  const meta = {
    updatedAt: now,
    total: keys.size,
    added,
    skippedExisting: skipped,
    wave: opts.wave != null ? Number(opts.wave) : null,
    note: 'Append-only catalog. Passing Strong is never cleared by discover.',
  };
  fs.writeFileSync(CATALOG_META_PATH, `${JSON.stringify(meta, null, 2)}\n`);
  const lastDiscover = {
    wave: meta.wave,
    at: now,
    added,
    total: keys.size,
    sample: addedRows.slice(0, Number(process.env.CANVAS_SAMPLE_N || 500) || 500).map((r) => ({
      stem: r.stem,
      family: r.family,
      lane: r.lane,
      peerNote: r.peerNote,
      howTheyDoIt: r.howTheyDoIt,
      grade: r.grade,
      discoveredAt: r.discoveredAt,
    })),
  };
  fs.writeFileSync(LAST_DISCOVER_PATH, `${JSON.stringify(lastDiscover, null, 2)}\n`);
  return { ...meta, addedStems: addedRows.map((r) => r.stem) };
}

export function catalogStats(rows = null) {
  if (!rows) {
    // Stream counts — never materialize 1M+ rows just for stats.
    const by = { strong: 0, worst: 0, weak: 0, partial: 0, ungraded: 0 };
    const byFamily = {};
    let total = 0;
    let open = 0;
    forEachCatalogLineSync((line) => {
      let r;
      try { r = JSON.parse(line); } catch { return; }
      total += 1;
      const g = r.grade || 'ungraded';
      by[g] = (by[g] || 0) + 1;
      if (g !== 'strong') open += 1;
      const fam = r.family || 'coverage-matrix';
      byFamily[fam] = byFamily[fam] || { total: 0, strong: 0, open: 0 };
      byFamily[fam].total += 1;
      if (g === 'strong') byFamily[fam].strong += 1;
      else byFamily[fam].open += 1;
    });
    return { total, by, open, byFamily };
  }
  const list = [...rows];
  const by = { strong: 0, worst: 0, weak: 0, partial: 0, ungraded: 0 };
  const byFamily = {};
  for (const r of list) {
    by[r.grade] = (by[r.grade] || 0) + 1;
    byFamily[r.family] = byFamily[r.family] || { total: 0, strong: 0, open: 0 };
    byFamily[r.family].total += 1;
    if (r.grade === 'strong') byFamily[r.family].strong += 1;
    else byFamily[r.family].open += 1;
  }
  const open = list.filter((r) => r.grade !== 'strong').length;
  return { total: list.length, by, open, byFamily };
}

/**
 * Priority for next implement: prompt-fidelity fails first, then others with tests, then ungraded-with-tests.
 * coverage-matrix without tests is research-only (skipped unless FORCE_RESEARCH_IMPL=1).
 */
export function pickNextFail(map = null) {
  const list = [...(map || loadCatalogMap()).values()];
  const FAMILY_RANK = {
    'prompt-fidelity': 0,
    conversation: 1,
    'protocol-ui': 2,
    'craft-media': 3,
    'coding-agent': 4,
    'coverage-matrix': 9,
  };
  const open = list.filter((r) => {
    if (r.grade === 'strong') return false;
    if (!r.testIds || r.testIds.length === 0) {
      return process.env.FORCE_RESEARCH_IMPL === '1';
    }
    return true;
  });
  open.sort((a, b) => {
    const fa = FAMILY_RANK[a.family] ?? 5;
    const fb = FAMILY_RANK[b.family] ?? 5;
    if (fa !== fb) return fa - fb;
    if (a.grade === 'worst' && b.grade !== 'worst') return -1;
    if (b.grade === 'worst' && a.grade !== 'worst') return 1;
    return String(a.stem).localeCompare(String(b.stem));
  });
  return open[0] || null;
}
