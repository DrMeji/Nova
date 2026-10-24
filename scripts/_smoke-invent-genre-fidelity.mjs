/**
 * Smoke: knife brief must not detect speakers; anti-twin wording must not select speakers.
 */
import {
  detectInventGenre,
  inventBriefLayoutFidelity,
  isDistinctRetailProductBrief,
  stripAntiTwinNoise,
} from '../src/lib/inventBriefFidelity.ts';

const cases = [
  {
    name: 'simple knife',
    brief: 'Create a website for Obsidian Cutlery — a premium Japanese knife shop for chefs with a knives grid and contact form.',
    expect: 'cutlery',
  },
  {
    name: 'anti-twin wording (old harness bug)',
    brief: 'Obsidian Cutlery knife atelier. Anti-twin: do NOT reuse speaker/luggage demo structure.',
    expect: 'cutlery',
  },
  {
    name: 'real textile atelier',
    brief: 'Create a textile atelier landing with loom, fabric swatches, and contact form.',
    expect: 'atelier',
  },
  {
    name: 'real speakers ask',
    brief: 'Build a speakers showroom shop with bookshelf speakers, soundbar, and subwoofer SKUs.',
    expect: 'speakers',
  },
  {
    name: 'luggage travel',
    brief: 'Create a luggage store for travel bags and carry-on suitcases.',
    expect: 'luggage',
  },
  {
    name: 'bottle shop stays non-speakers',
    brief: 'Create a bottle shop for Vale Bottle — wine and flasks, not speakers.',
    expect: 'generic',
  },
];

let fail = 0;
for (const c of cases) {
  const g = detectInventGenre(c.brief);
  const ok = g === c.expect;
  console.log(ok ? 'PASS' : 'FAIL', c.name, '→', g, `(expect ${c.expect})`, 'cleaned:', stripAntiTwinNoise(c.brief).slice(0, 80));
  if (!ok) fail += 1;
}

const twinApp = `<div data-nova-invent-demo="1" data-nova-layout="speakers" class="spk-bay">Audio showroom Woofer Soundbar</div>`;
const fid = inventBriefLayoutFidelity({
  brief: 'Obsidian Cutlery Japanese knife atelier',
  app: twinApp,
});
console.log(fid.ok ? 'FAIL fidelity should reject speakers twin' : 'PASS fidelity rejects twin', fid.reasons);
if (fid.ok) fail += 1;

const textileTwin = `<div data-nova-invent-demo="1" data-nova-layout="atelier" class="layout-atelier">Textile atelier Quiet textiles How we weave Undyed linen Book a swatch visit handloom atelier</div>`;
const textileFid = inventBriefLayoutFidelity({
  brief: 'Create a website for Obsidian Edge Knives — a premium Japanese knife shop for chefs.',
  app: textileTwin,
});
console.log(
  textileFid.ok ? 'FAIL knife brief should reject textile twin' : 'PASS fidelity rejects textile twin',
  textileFid.reasons,
);
if (textileFid.ok) fail += 1;

const knifeOkApp = `<div data-nova-invent-demo="1" data-nova-layout="cutlery">Knife atelier Gyuto 210mm Santoku blade steel forge Book a blade consult</div>`;
const knifeOk = inventBriefLayoutFidelity({
  brief: 'Create a website for Obsidian Edge Knives — Japanese knife shop.',
  app: knifeOkApp,
});
console.log(knifeOk.ok ? 'PASS cutlery app matches knife brief' : 'FAIL cutlery app should pass', knifeOk.reasons);
if (!knifeOk.ok) fail += 1;

const bottleFid = inventBriefLayoutFidelity({
  brief: 'Create a bottle shop for Vale Bottle with wine and flasks.',
  app: twinApp,
});
console.log(
  bottleFid.ok ? 'FAIL bottle brief should reject speakers twin' : 'PASS bottle rejects speakers twin',
  bottleFid.reasons,
);
if (bottleFid.ok) fail += 1;
if (!isDistinctRetailProductBrief('gaming desk shop with oak desks')) {
  console.log('FAIL distinct retail desk');
  fail += 1;
} else {
  console.log('PASS distinct retail desk');
}

if (fail) {
  console.error('smoke failed', fail);
  process.exit(1);
}
console.log('ALL PASS');
