/**
 * Undo the "everything Strong" flip for research honesty.
 * Grades from novaNow text — Acc stubs / Missing stay open.
 */
import fs from 'fs';

const path =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
let t = fs.readFileSync(path, 'utf8');

const before = {
  worst: [...t.matchAll(/nova: 'worst'/g)].length,
  weak: [...t.matchAll(/nova: 'weak'/g)].length,
  partial: [...t.matchAll(/nova: 'partial'/g)].length,
  strong: [...t.matchAll(/nova: 'strong'/g)].length,
};

function gradeFromNow(now) {
  const s = String(now || '');
  const low = s.toLowerCase();
  if (
    /\bmissing\b/.test(low) ||
    /\bout of scope\b/.test(low) ||
    /\bdesktop only\b/.test(low) ||
    /\bno live\b/.test(low) ||
    /\bno .*ui\b/.test(low) ||
    /\bneed .*ui\b/.test(low) ||
    /\bcloud only\b/.test(low) ||
    /\bnot wired\b/.test(low)
  ) {
    return 'worst';
  }
  if (
    /\bpartial\b/.test(low) ||
    /\bstub\b/.test(low) ||
    /\bacc only\b/.test(low) ||
    /\bacc\b/.test(low) ||
    /\blite\b/.test(low) ||
    /\bsoft\b/.test(low) ||
    /\bnot a real\b/.test(low) ||
    /\bjs primary\b/.test(low) ||
    /\bui-heavy\b/.test(low) ||
    /invent acc\+runtime packs/.test(low) ||
    /\bnormal-floor\b/.test(low) ||
    /\bclose-all\b/.test(low) ||
    /\bopen-all\b/.test(low)
  ) {
    // Acc / pack claims without proven Live wiring = weak research debt
    if (/invent acc\+runtime packs|normal-floor|close-all|open-all/.test(low)) return 'weak';
    if (/\bpartial\b/.test(low) || /\bsoft\b/.test(low) || /\blite\b/.test(low)) return 'partial';
    return 'weak';
  }
  if (
    /\bwired\b/.test(low) ||
    /\bstrong\b/.test(low) ||
    /\bsmoke-/.test(low) ||
    /\bcreateReady\b/.test(s) ||
    /\bfreshSpa\b/.test(s) ||
    /\bclassifyTurn\b/.test(s)
  ) {
    return 'strong';
  }
  return 'partial';
}

const rowRe =
  /(\{\s*\n\s*capability: '[^']*',\s*\n\s*lane: '[^']*',\s*\n\s*)nova: '(?:worst|weak|partial|strong)',(\s*\n\s*leader: '[^']*',\s*\n\s*howTheyDoIt: '[^']*',\s*\n\s*novaNow: ')([^']*)(',\s*\n\s*\})/g;

let flipped = 0;
t = t.replace(rowRe, (full, pre, mid, now, end) => {
  const g = gradeFromNow(now);
  flipped += 1;
  return `${pre}nova: '${g}',${mid}${now}${end}`;
});

const after = {
  worst: [...t.matchAll(/nova: 'worst'/g)].length,
  weak: [...t.matchAll(/nova: 'weak'/g)].length,
  partial: [...t.matchAll(/nova: 'partial'/g)].length,
  strong: [...t.matchAll(/nova: 'strong'/g)].length,
};

t = t.replace(
  /ALL open → Strong via packs · WAIT for go-ahead before live test/g,
  'HONEST regrade · research open again · coding-first · UI gaps → Missing homes',
);
t = t.replace(
  /Implementing all open → Strong \(Worst\+Weak\+Partial\)/g,
  'Deep research living · honest grades restored',
);
t = t.replace(
  /All open rows targeted Strong via invent packs \(normal-floor \+ open-all \+ close-all\)\. Open = \{open\}\. Live test only when you give the go-ahead\./g,
  'Grades restored from novaNow (Acc≠Strong). Open = {open}. Grow + place UI next.',
);

fs.writeFileSync(path, t);
console.log({
  rowsTouched: flipped,
  before,
  after,
  open: after.worst + after.weak + after.partial,
});
