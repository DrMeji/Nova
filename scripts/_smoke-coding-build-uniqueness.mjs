/**
 * Coding-deep gate: invent must produce DISTINCT builds per product kind —
 * not the same chrome with a swapped brand name.
 */
import {
  composeInventDemoSite,
  detectInventGenre,
} from '../src/lib/createInventDemo.ts';

const cases = [
  {
    brand: 'Blade House Knives',
    brief: 'Japanese knife shop for chefs with gyuto and santoku blades',
    expectGenre: 'cutlery',
    must: [/Gyuto|Santoku|blade|forge|cutlery/i],
    mustNot: [/Quiet textiles|Undyed linen|handloom|swatch visit/i],
  },
  {
    brand: 'North Cup Cafe',
    brief: 'neighborhood coffee café landing page with menu and contact',
    expectGenre: 'cafe',
    must: [/cafe|coffee|menu|espresso|roast/i],
    mustNot: [/Gyuto|Santoku|Quiet textiles|spk-bay/i],
  },
  {
    brand: 'Ridge Audio Labs',
    brief: 'speakers showroom with bookshelf speakers soundbar and subwoofer',
    expectGenre: 'speakers',
    must: [/speaker|soundbar|subwoofer|listening|audio/i],
    mustNot: [/Gyuto|Quiet textiles|handloom|carry-on/i],
  },
  {
    brand: 'Warp Loom Atelier',
    brief: 'textile atelier landing with loom fabric swatches and contact',
    expectGenre: 'atelier',
    must: [/textile|loom|linen|swatch|weave/i],
    mustNot: [/Gyuto|Santoku|soundbar|spk-bay/i],
  },
];

let fail = 0;
const fingerprints = [];

for (const c of cases) {
  const genre = detectInventGenre(c.brief);
  const site = composeInventDemoSite({ brand: c.brand, brief: c.brief });
  const app = site.files['src/App.jsx'] || site.files['src/App.tsx'] || '';
  const css = site.files['src/App.css'] || '';
  const layout = (app.match(/data-nova-layout=["']([^"']+)["']/) || [])[1] || '';
  const bg = (css.match(/--bg:\s*([^;]+);/) || [])[1]?.trim() || '';
  const okGenre = genre === c.expectGenre;
  const okMust = c.must.every((re) => re.test(app));
  const okNot = c.mustNot.every((re) => !re.test(app));
  const ok = okGenre && okMust && okNot && !!layout;
  console.log(
    ok ? 'PASS' : 'FAIL',
    c.brand,
    { genre, layout, bg: bg.slice(0, 12), okGenre, okMust, okNot },
  );
  if (!ok) fail += 1;
  fingerprints.push({ brand: c.brand, genre, layout, bg, appHead: app.slice(0, 220) });
}

// Cross-kind: layouts and background tokens must not all collapse to one twin.
const layouts = new Set(fingerprints.map((f) => f.layout));
const bgs = new Set(fingerprints.map((f) => f.bg));
if (layouts.size < 3) {
  console.log('FAIL layouts not distinct enough', [...layouts]);
  fail += 1;
} else {
  console.log('PASS distinct layouts', [...layouts]);
}
if (bgs.size < 3) {
  console.log('FAIL background tokens not distinct enough', [...bgs]);
  fail += 1;
} else {
  console.log('PASS distinct --bg tokens', bgs.size);
}

// Two knife brands must not share identical App body (salt / SKU rotation).
const k1 = composeInventDemoSite({
  brand: 'Obsidian Edge Knives',
  brief: 'Japanese knife shop gyuto santoku',
}).files['src/App.jsx'];
const k2 = composeInventDemoSite({
  brand: 'Steel Ridge Knives',
  brief: 'Japanese knife shop gyuto santoku',
}).files['src/App.jsx'];
if (k1 === k2) {
  console.log('FAIL two knife brands produced identical App');
  fail += 1;
} else {
  console.log('PASS knife brands differ (salted)');
}

// Product-kind scaffolds Nova still lacks — must FAIL until real invent paths exist.
const gameApp = composeInventDemoSite({
  brand: 'Pixel Raid',
  brief: 'browser arcade game with canvas score HUD lives counter and start button',
}).files['src/App.jsx'] || '';
const utilApp = composeInventDemoSite({
  brand: 'QuickList',
  brief: 'simple todo utility app with localStorage add complete delete — not a storefront',
}).files['src/App.jsx'] || '';
if (!/canvas|score|HUD|arcade|requestAnimationFrame|game loop/i.test(gameApp)) {
  console.log('FAIL gaming brief still not a game scaffold (landing/demo twin)');
  fail += 1;
} else {
  console.log('PASS gaming scaffold');
}
if (!/todo|localStorage|complete|checkbox/i.test(utilApp)
  || /Gyuto|Textile atelier|spk-bay|Book a swatch/i.test(utilApp)) {
  console.log('FAIL utility/todo brief still wrong product twin');
  fail += 1;
} else {
  console.log('PASS utility scaffold');
}

if (fail) {
  console.error('coding-build-uniqueness failed', fail);
  process.exit(1);
}
console.log('ALL PASS coding-build-uniqueness');
