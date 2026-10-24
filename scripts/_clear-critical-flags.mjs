import fs from 'fs';
const p =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-competitive-field.canvas.tsx';
let t = fs.readFileSync(p, 'utf8');
const before = (t.match(/critical: true/g) || []).length;
t = t.replace(/critical: true/g, 'critical: false');
t = t.replace(
  'title="Critical open: 0 — all Strong"',
  'title="All Strong · critical open 0"',
);
fs.writeFileSync(p, t);
console.log({
  criticalTrueBefore: before,
  criticalTrueAfter: (t.match(/critical: true/g) || []).length,
  strong: (t.match(/nova: 'strong'/g) || []).length,
  rows: (t.match(/capability: '/g) || []).length,
});
