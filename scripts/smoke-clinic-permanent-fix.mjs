/**
 * Smoke: fixed findings must stay gone on rescan (scanner ↔ surgical patch alignment).
 */
import { scanProjectFindings } from '../src/lib/projectInspect.ts';
import { runDebugClinic } from '../src/lib/debugClinic.ts';

let failed = 0;
function check(name, cond, detail = '') {
  if (cond) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const FIXED_BUTTON = `
export function Ok() {
  return (
    <button
      type="button"
      className="x"
      onClick={() => {}}
    >
      Go
    </button>
  );
}
`;

const FIXED_EXEC = `
const { exec, execFile } = require('child_process') /* nova-secure: fixed-argv */;
execFile('echo', ['hi'], (err) => {});
`;

const FIXED_ANY = `
const api = (window as unknown as { electronAPI?: Record<string, unknown> }).electronAPI;
function f(x: unknown) { return x; }
`;

const RISKY_EXEC = `
const { exec } = require('child_process');
exec('echo hi', (err) => {});
`;

const RISKY_BUTTON = `
export function Bad() {
  return <button className="x" onClick={() => {}}>Go</button>;
}
`;

const SCANNER_SELF_HIT = `
function rulePatternStillPresent(body) {
  if (/\\beval\\s*\\(|new Function\\s*\\(/.test(body)) return true;
  if (/shell\\s*:\\s*true/i.test(body)) return true;
  if (/\\b(secret|eval|exec|innerHTML|dangerouslySetInnerHTML|shell:true)\\b/i.test(detail)) return true;
  return false;
}
`;

const REAL_TEMPLATE_EVAL = `
export function calc() {
  return \`
  <script>
    try { cur = String(eval(cur.replace(/÷/g,'/'))); }
    catch { cur = 'Error'; }
  </script>
  \`;
}
`;

// Static scanner must ignore its own regex rule text
const staticSelf = scanProjectFindings(
  { 'src/lib/debugClinic.ts': SCANNER_SELF_HIT },
  'full clinic audit find problems security wider scan',
);
check(
  'static: scanner regex self-hit stays clean',
  !staticSelf.some((f) => /eval\/exec|shell:true|innerHTML|HTML injection/i.test(f.detail)),
  JSON.stringify(staticSelf),
);

const staticEval = scanProjectFindings(
  { 'src/lib/mobileTemplates.ts': REAL_TEMPLATE_EVAL },
  'full clinic audit find problems security wider scan',
);
check(
  'static: real eval( in template still flagged',
  staticEval.some((f) => /eval\/exec/i.test(f.detail)),
  JSON.stringify(staticEval),
);
// Static scanner: hardened file must not re-flag spawn/exec
const staticFixed = scanProjectFindings(
  { 'electron/main.js': FIXED_EXEC },
  'full clinic audit find problems security wider scan',
);
check(
  'static: hardened execFile+nova-secure stays clean',
  !staticFixed.some((f) => /eval\/exec|shell\/process|child_process/i.test(f.detail)),
  JSON.stringify(staticFixed),
);

const staticRisky = scanProjectFindings(
  { 'electron/main.js': RISKY_EXEC },
  'full clinic audit find problems security wider scan',
);
check(
  'static: raw exec( still flagged',
  staticRisky.some((f) => /eval\/exec|shell\/process/i.test(f.detail)),
  JSON.stringify(staticRisky),
);

// Full clinic (local deep, no model needed for these fixtures)
const clinicFixed = await runDebugClinic({
  files: {
    'src/Ok.tsx': FIXED_BUTTON,
    'electron/main.js': FIXED_EXEC,
    'src/api.ts': FIXED_ANY,
    'README.md': '# Demo\n\nLocal project.\n\n## Run\n\n```bash\nnpm install\nnpm run dev\n```\n',
    'package.json': '{"name":"demo","scripts":{"dev":"vite"}}',
  },
  projectName: 'demo-fixed',
  userMessage: 'Rescan after fixes',
  shouldAbort: () => false,
});

const problems = clinicFixed.findings.map((f) => `${f.path}: ${f.problem}`).join('\n');
check(
  'clinic: multiline button with type= does NOT reappear',
  !clinicFixed.findings.some((f) => /Button missing type/i.test(f.problem)),
  problems,
);
check(
  'clinic: hardened exec does NOT reappear as eval/exec or spawn',
  !clinicFixed.findings.some((f) => /eval\/exec|Dynamic code execution|shell\/process|shell:true/i.test(f.problem)),
  problems,
);
check(
  'clinic: unknown casts do NOT reappear as any',
  !clinicFixed.findings.some((f) => /Uses `any`/i.test(f.problem)),
  problems,
);

const clinicRisky = await runDebugClinic({
  files: {
    'src/Bad.tsx': RISKY_BUTTON,
    'electron/main.js': RISKY_EXEC,
    'src/loose.ts': 'const x: any = 1;\nconst y = 0 as any;\n',
    'package.json': '{"name":"demo"}',
  },
  projectName: 'demo-risky',
  userMessage: 'find problems',
  shouldAbort: () => false,
});
check(
  'clinic: untyped button still flagged',
  clinicRisky.findings.some((f) => /Button missing type/i.test(f.problem)),
);
check(
  'clinic: raw exec still flagged',
  clinicRisky.findings.some((f) => /eval\/exec|Dynamic code|shell\/process/i.test(f.problem)),
);
check(
  'clinic: any still flagged (once per file max)',
  clinicRisky.findings.filter((f) => /Uses `any`/i.test(f.problem)).length >= 1
    && clinicRisky.findings.filter((f) => /Uses `any`/i.test(f.problem) && f.path.includes('loose')).length <= 1,
);

// Simulate: fix then rescan — count must drop for that rule family
const before = clinicRisky.findings.length;
const afterFix = await runDebugClinic({
  files: {
    'src/Bad.tsx': FIXED_BUTTON,
    'electron/main.js': FIXED_EXEC,
    'src/loose.ts': 'const x: unknown = 1;\nconst y = 0 as unknown;\n',
    'package.json': '{"name":"demo"}',
    'README.md': '# Demo\n\nLocal project.\n\n## Run\n\n```bash\nnpm install\nnpm start\n```\n',
  },
  projectName: 'demo-risky',
  userMessage: 'Rescan after fixes',
  shouldAbort: () => false,
});
const after = afterFix.findings.length;
check(
  'clinic: after surgical-style fixes, count drops',
  after < before,
  `before=${before} after=${after}`,
);
check(
  'clinic: fixed button/exec/any rules stay gone after rescan',
  !afterFix.findings.some((f) => /Button missing type|eval\/exec|Dynamic code|Uses `any`|shell\/process/i.test(f.problem)),
  afterFix.findings.map((f) => f.problem).join(' | '),
);

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll permanent-fix / rescan checks passed.');
