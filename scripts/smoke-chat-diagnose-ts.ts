/**
 * Load real chatDiagnose against NovaClinicGym via tsx.
 * Run: npx tsx scripts/smoke-chat-diagnose-ts.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  diagnoseProjectAsk,
  wantsApplyFix,
  looksLikeFeatureMutateAsk,
} from '../src/lib/chatDiagnose.ts';
import { looksLikeProjectDebugAsk } from '../src/lib/chatProjectDebug.ts';
import { chatTurnAllowsFileEdits } from '../src/lib/chatAgentTurn.ts';
import { classifyTurn } from '../src/lib/classifyTurn.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const gym = path.resolve(__dirname, '..', '..', 'NovaClinicGym');

function walk(dir: string, out: string[] = [], base = dir): string[] {
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

const files: Record<string, string> = {};
for (const rel of walk(gym)) {
  files[rel] = fs.readFileSync(path.join(gym, rel), 'utf8');
}

const ask = "I'm having a problem switching between Settings and Profile — can you help?";
const fixAsk = 'Can you fix the settings and profile switch?';
const addAsk = 'Add a logout button to the header';

const diagnosed = diagnoseProjectAsk(files, ask, 'NovaClinicGym');
const looks = looksLikeProjectDebugAsk(ask);
const applyDiagnose = wantsApplyFix(ask);
const applyFix = wantsApplyFix(fixAsk);
const mutate = looksLikeFeatureMutateAsk(addAsk);
const allowsDiagnose = chatTurnAllowsFileEdits(ask, 'agent');
const allowsFix = chatTurnAllowsFileEdits(fixAsk, 'agent');
const bound = { diskRoot: gym, files, projectId: 'nova-clinic-gym' };
const kindDiagnose = classifyTurn(ask, bound);
const kindFix = classifyTurn(fixAsk, bound);
const kindAdd = classifyTurn(addAsk, bound);

const settingsHit = diagnosed.findings.some(
  (f) => /settings|profile/i.test(f.path) || /settings|profile/i.test(f.detail),
);
const shapeOk = /Okay — I see the problem/i.test(diagnosed.text)
  && /\*\*Cause:\*\*/i.test(diagnosed.text)
  && /\*\*How to fix it:\*\*/i.test(diagnosed.text);

const ok = looks
  && !applyDiagnose
  && applyFix
  && mutate
  && !allowsDiagnose
  && allowsFix
  && kindDiagnose.kind === 'chat'
  && kindFix.kind === 'edit'
  && kindAdd.kind === 'edit'
  && settingsHit
  && shapeOk
  && Object.keys(files).length >= 100;

console.log(JSON.stringify({
  ok,
  fileCount: Object.keys(files).length,
  looks,
  applyDiagnose,
  applyFix,
  mutate,
  allowsDiagnose,
  allowsFix,
  kindDiagnose,
  kindFix,
  kindAdd,
  settingsHit,
  shapeOk,
  topFinding: diagnosed.findings[0] || null,
  replyPreview: diagnosed.text.slice(0, 360),
}, null, 2));

if (!ok) process.exit(1);
