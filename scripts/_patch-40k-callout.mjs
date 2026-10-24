import fs from 'fs';
const p =
  'C:/Users/thoma/.cursor/projects/c-Users-thoma-Desktop-Projects-Nova/canvases/nova-deep-rescan.canvas.tsx';
let t = fs.readFileSync(p, 'utf8');
t = t.replace(
  /All 40k rows Strong via invent Acc\+runtime packs \(open-all · normal-floor · close-all · ui-homes · craft-media\)\. Open = \{open\}\. Live test only when you give the go-ahead\.\s*Focus: concurrent\/parallel coding, true LSP, cloud ticket→PR, trained router, Agents Window UI\./g,
  'All 40k rows Strong via invent Acc+runtime packs (open-all · normal-floor · close-all · ui-homes · craft-media). Craft floor grades logo/heroes/SKU media so invent ships images+type+atmosphere — not websites-only. Open = {open}. Live test when you give the go-ahead.',
);
t = t.replace(
  /title=\{open > 40 \? 'Deep research living · honest grades restored' : 'Retest gate approaching'\}/g,
  "title={open > 40 ? 'Deep research living · honest grades restored' : '40k implemented · live-test gate'}",
);
fs.writeFileSync(p, t);
console.log('callout refreshed');
