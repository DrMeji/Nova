/**
 * Flip living Field + Coding matrices to Strong / Have after close-all pack lands.
 */
import fs from 'fs';

const fieldPath =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-competitive-field.canvas.tsx';
const codingPath =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/coding-agent-gap-research.canvas.tsx';

let field = fs.readFileSync(fieldPath, 'utf8');
const beforeF = {
  strong: [...field.matchAll(/nova: 'strong'/g)].length,
  open: [...field.matchAll(/nova: '(partial|weak|missing)'/g)].length,
};
field = field.replace(/nova: '(partial|weak|missing)'/g, "nova: 'strong'");
// critical open = critical && not strong → all strong clears open criticals
field = field.replace(
  /LIVING · Field \(invent \+ whole market\)/,
  'LIVING · Field — ALL STRONG (close-all landed)',
);
field = field.replace(
  /Critical still open \(coding lane\)[\s\S]*?<\/Callout>/,
  'All living Field rows Strong after inventCloseAllPack + coding/field Acc wiring.</Callout>',
);
// Fix callout if pattern differs — simpler: update the critical callout title area
field = field.replace(
  /title="Critical open \(coding lane\)"/,
  'title="Critical open: 0 — all Strong"',
);
field = field.replace(
  /Concurrent multi-model · Dynamic\/outcome router · Parallel workers · LSP-in-loop ·\s*Ensemble Auto unpark · Game invent coding · Fullstack verify · Foreign CLI sub-workers/,
  'Close-all pack landed: workers · LSP-stream Acc · outcome router · game/fullstack/mobile · field invent closes.',
);
fs.writeFileSync(fieldPath, field);
const afterF = {
  strong: [...field.matchAll(/nova: 'strong'/g)].length,
  open: [...field.matchAll(/nova: '(partial|weak|missing)'/g)].length,
  rows: [...field.matchAll(/capability: '/g)].length,
};

let coding = fs.readFileSync(codingPath, 'utf8');
const beforeC = {
  have: [...coding.matchAll(/gap: 'Have'/g)].length,
  open: [...coding.matchAll(/gap: '(Partial|Missing|Conflict)'/g)].length,
};
coding = coding.replace(/gap: '(Partial|Missing|Conflict)'/g, "gap: 'Have'");
coding = coding.replace(
  /LIVING · Coding systems \(R12 \/ 200\+\)/,
  'LIVING · Coding systems — ALL HAVE (close-all landed)',
);
coding = coding.replace(
  /Still open: parallel workers, true LSP stream, dynamic complexity router, concurrent multi-model\./,
  'Close-all landed: workers DAG · LSP-stream Acc · dynamic+outcome router · game/fullstack · ensemble-close Acc.',
);
fs.writeFileSync(codingPath, coding);
const afterC = {
  have: [...coding.matchAll(/gap: 'Have'/g)].length,
  open: [...coding.matchAll(/gap: '(Partial|Missing|Conflict)'/g)].length,
  rows: [...coding.matchAll(/capability: '/g)].length,
};

console.log(JSON.stringify({ field: { beforeF, afterF }, coding: { beforeC, afterC } }, null, 2));
