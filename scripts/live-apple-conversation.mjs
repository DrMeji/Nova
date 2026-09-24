/**
 * Live: build an exact apple.com–style marketing site (clean prompts, no harness junk).
 * Env: NOVA_CDP_PORT (default 9340)
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
    ask: 'i want a website that looks exactly like apple.com — same clean layout, big product hero, nav, sections, typography feel. can we plan that first?',
    label: 'TURN 1 — plan apple.com style',
    timeoutMs: '180000',
    mustNot: [/I scanned\s+\*\*0 source files\*\*/i, /Local scan/i, /dead controls/i],
    mustHave: [/apple|hero|nav|product|section/i],
  },
  {
    newChat: false,
    ask: 'yes. exact apple.com feel — white space, SF-style type, sticky nav, huge hero with product, grid of products, footer. is that actually possible to build as a first version?',
    label: 'TURN 2 — feasibility',
    timeoutMs: '180000',
    mustNot: [/I scanned\s+\*\*0 source files\*\*/i, /Local scan/i, /@@@FILE/i],
    mustHave: [/possible|yes|version|week|day|hour|work|build/i],
  },
  {
    newChat: false,
    ask: 'ok build AppleDotCom now. recreate apple.com as close as you can — sticky top nav with Apple logo and product links, giant hero, product feature strips, shop grid, dark/light sections, minimal footer. phone and desktop. create the project on disk in NOVA Projects. use the coder. no paywalls. take your time and make Preview Ready.',
    label: 'TURN 3 — build AppleDotCom',
    timeoutMs: '1200000',
    mustNot: [/I scanned\s+\*\*0 source files\*\*/i, /Local scan/i],
    mustHave: [/Apple|ready|Preview|project folder|Live|NOVA Projects/i],
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
  } catch { /* ignore */ }
  const text = String(parsed?.text || '');
  const meta = String(parsed?.meta || '');

  if (code === 3 || code === 4 || /timeout/i.test(meta)) {
    console.error(`\nGATE FAIL: no usable reply (exit ${code}, meta=${meta})`);
    return 3;
  }
  if (/Local scan/i.test(meta)) {
    console.error('\nGATE FAIL: Local scan misroute');
    return 5;
  }
  for (const re of t.mustNot || []) {
    if (re.test(text) || re.test(meta)) {
      console.error(`\nGATE FAIL: forbidden ${re}`);
      return 5;
    }
  }
  for (const re of t.mustHave || []) {
    if (!re.test(text)) {
      console.error(`\nGATE FAIL: missing ${re}`);
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
    console.error(`Stopped after turn ${i + 1}.`);
    break;
  }
  spawnSync(process.execPath, ['-e', 'setTimeout(()=>{}, 4000)'], { stdio: 'ignore' });
}

console.log(`\n======== apple.com live ${failed ? 'STOPPED' : 'done'} ========`);
process.exit(failed ? 1 : 0);
