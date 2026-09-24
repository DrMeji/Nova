/**
 * Multi-turn live conversation with turn-by-turn quality gates.
 * Stops immediately on Local scan / empty / timeout so we fix before continuing.
 * No harness junk in the visible prompts.
 */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const PORT = process.env.NOVA_CDP_PORT || '9340';

const turns = [
  {
    newChat: true,
    ask: 'hey. i help organize weekend farmers market stalls and keep losing track of who is selling what. thinking of a tiny phone page for that.',
    label: 'TURN 1 — problem / plan',
    mustNot: [/I scanned\s+\*\*0 source files\*\*/i, /Local scan/i, /dead controls/i],
    mustHave: [/stall|vendor|market|phone/i],
  },
  {
    newChat: false,
    ask: 'okay that helps. what else could we add to make this actually useful on market day? give me more ideas we could put in the app.',
    label: 'TURN 2 — more ideas',
    mustNot: [/I scanned\s+\*\*0 source files\*\*/i, /Local scan/i, /dead controls/i],
    mustHave: [/notif|check-?in|map|feedback|payment|inventor|layout|rating/i],
  },
  {
    newChat: false,
    ask: 'love those. i also want three extras: a save-a-bag button for shoppers, an undo if i tap the wrong stall, and soft sage / cream / terracotta colors. fold those into the plan.',
    label: 'TURN 3 — fold extras into plan',
    mustNot: [/I scanned\s+\*\*0 source files\*\*/i, /Local scan/i, /dead controls/i, /Edit in Code/i],
    mustHave: [/bag|undo|sage|terracotta|cream/i],
  },
  {
    newChat: false,
    ask: 'be honest with me — is this actually possible to build? will a tiny phone page like that really work for a weekend market, and roughly how long would a first useful version take?',
    label: 'TURN 4 — feasibility',
    mustNot: [/I scanned\s+\*\*0 source files\*\*/i, /Local scan/i, /dead controls/i],
    mustHave: [/possible|yes|week|day|hour|version|work/i],
  },
  {
    newChat: false,
    ask: 'ok build MossMarket now. phone-friendly stall browser with save-a-bag + undo, soft sage cream terracotta. create the project on disk in NOVA Projects. use the coder. no paywalls. take your time and make Preview Ready.',
    label: 'TURN 5 — build MossMarket',
    timeoutMs: '900000',
    mustNot: [/I scanned\s+\*\*0 source files\*\*/i, /Local scan/i],
    mustHave: [/MossMarket|ready|Preview|project folder|Live/i],
  },
];

function runTurn(t) {
  console.log(`\n======== ${t.label} ========\n`);
  console.log(`ASK: ${t.ask}\n`);
  const env = {
    ...process.env,
    NOVA_CDP_PORT: PORT,
    NOVA_NEW_CHAT: t.newChat ? '1' : '0',
    NOVA_ASK: t.ask,
    NOVA_TIMEOUT_MS: t.timeoutMs || '180000',
  };
  const r = spawnSync(process.execPath, [path.join(root, 'scripts', 'live-one-turn.mjs')], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  const code = r.status ?? 1;

  let parsed = null;
  try {
    const start = r.stdout.indexOf('{');
    const end = r.stdout.lastIndexOf('}');
    if (start >= 0 && end > start) parsed = JSON.parse(r.stdout.slice(start, end + 1));
  } catch {
    /* ignore */
  }
  const text = String(parsed?.text || '');
  const meta = String(parsed?.meta || '');
  const flags = Array.isArray(parsed?.flags) ? parsed.flags : [];

  if (code === 3 || code === 4 || /timeout/i.test(meta)) {
    console.error(`\nGATE FAIL: no usable reply (exit ${code}, meta=${meta})`);
    return 3;
  }
  if (/Local scan/i.test(meta) || flags.includes('plan-too-thin') && /scanned/i.test(text)) {
    console.error('\nGATE FAIL: Local scan / thin plan misroute');
    return 5;
  }
  for (const re of t.mustNot || []) {
    if (re.test(text) || re.test(meta)) {
      console.error(`\nGATE FAIL: forbidden pattern ${re}`);
      return 5;
    }
  }
  for (const re of t.mustHave || []) {
    if (!re.test(text)) {
      console.error(`\nGATE FAIL: missing expected content ${re}`);
      return 5;
    }
  }
  console.log(`\nGATE OK (exit ${code})\n`);
  return code === 0 || code === 2 ? 0 : code;
}

let failed = 0;
for (let i = 0; i < turns.length; i++) {
  const code = runTurn(turns[i]);
  if (code !== 0) {
    failed = 1;
    console.error(`Stopped after turn ${i + 1}. Fix the reply path, then re-run.`);
    break;
  }
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 4000)'], { stdio: 'ignore' });
}

console.log(`\n======== conversation ${failed ? 'STOPPED' : 'done'} ========`);
process.exit(failed ? 1 : 0);
