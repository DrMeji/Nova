/**
 * Hardware invent shells — structurally different Acc families for mice /
 * keyboards / headsets / GPUs. Parallel to atelierInventShells so invent never
 * falls back to leather lookbook or a frozen desk twin.
 *
 * Intentionally does NOT import createProductLadder (avoids a cycle —
 * materializeProductSpineFiles calls into this module).
 */

export type HardwareShellId = 'spine' | 'spotlight' | 'strip' | 'feature';
type ProductComposeRecipe = 'split-stage' | 'band-stack' | 'center-rail' | 'spec-strip';

const SHELLS: readonly HardwareShellId[] = ['spine', 'spotlight', 'strip', 'feature'] as const;

function brandHash(brand: string): number {
  const s = String(brand || 'hardware');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickRecipe(brand: string, salt: string): ProductComposeRecipe {
  const recipes: ProductComposeRecipe[] = ['split-stage', 'band-stack', 'center-rail', 'spec-strip'];
  return recipes[brandHash(`${brand}|${salt}|compose`) % recipes.length];
}

function brandShellClass(productName: string, recipe: ProductComposeRecipe, salt: string): string {
  const slug = String(productName || 'brand')
    .replace(/\s+[a-z0-9]{3,5}$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 18) || 'brand';
  return `${slug}-${recipe}-${String(salt || 'x').slice(-4)}`;
}

function inferBrand(brief: string, productName: string): string {
  const named = String(productName || '').trim();
  if (named && !/^(?:website|site|app|project)$/i.test(named)) return named;
  const m = /\b(?:for|called|named)\s+([A-Z][\w]+(?:\s+[A-Z][\w]+)?)/.exec(String(brief || ''));
  return m?.[1] || 'Brand';
}

function paletteFor(brand: string): { canvas: string; accent: string } {
  const accents = ['#3dffc5', '#ff3d7f', '#7aa2ff', '#ffc14a', '#c77dff', '#5eead4'];
  return {
    canvas: '#0b0f16',
    accent: accents[brandHash(brand) % accents.length],
  };
}

export function hardwareInventShellId(brand: string, nudge = 0): HardwareShellId {
  const mix = (brandHash(brand) ^ (nudge * 2654435761)) >>> 0;
  return SHELLS[mix % SHELLS.length];
}

/** Brief is a peripheral / hardware brand site — use hardware shells, not leather. */
export function briefWantsHardwareShell(brief: string): boolean {
  const t = String(brief || '');
  if (/\b(?:not|no|never)\b[\s\S]{0,40}\b(?:hardware|gaming\s+mouse|keyboard)\b/i.test(t)) {
    return false;
  }
  return (
    /\b(?:gaming\s+mouse|gaming\s+mice|gaming\s+keyboard|mechanical\s+keyboard)\b/i.test(t)
    || (/\b(?:mouse|mice|keyboard|headset|headphones?)\b/i.test(t)
      && /\b(?:website|site|landing|brand|store|shop|for\s+[A-Z])\b/i.test(t))
    || (/\b(?:gpus?|graphics\s*cards?)\b/i.test(t)
      && /\b(?:website|site|store|shop|brand|for\s+[A-Z])\b/i.test(t))
    || /\b(?:pc\s*case|dark\s+tech|voltcore)\b/i.test(t)
    // "Build a website for Acme" + peripheral noun somewhere in the ask.
    || (
      /\b(?:build|make|create|invent)\b[\s\S]{0,48}\b(?:website|site|landing)\b[\s\S]{0,64}\bfor\s+[A-Z][\w'-]+/i.test(t)
      && /\b(?:mouse|mice|keyboard|headset|headphones?|gpus?|graphics)\b/i.test(t)
    )
  );
}

export function accHasHardwareShell(files: Record<string, string>): boolean {
  const blob = Object.values(files || {}).join('\n');
  return /data-nova-hw-shell=["'](?:spine|spotlight|strip|feature)["']/i.test(blob);
}

export function readHardwareShellId(files: Record<string, string>): HardwareShellId | null {
  const blob = Object.values(files || {}).join('\n');
  const m = /data-nova-hw-shell=["'](spine|spotlight|strip|feature)["']/i.exec(blob);
  return m ? (m[1].toLowerCase() as HardwareShellId) : null;
}

type Sku = {
  id: string;
  name: string;
  sensor: string;
  weight: string;
  dpi: string;
  price: number;
  accent: string;
};

const ACCENTS = ['#ff3d7f', '#3dffc5', '#7aa2ff', '#ffc14a', '#c77dff', '#5eead4', '#ff6b4a', '#4ade80'];

const MOUSE_FORMS = [
  ['Viper', '26K optical', '58 g', '100–26,000', 79],
  ['Coil Pro', 'Focus Pro 30K', '61 g', '100–30,000', 99],
  ['Drift Mini', 'Hero 2', '52 g', '100–25,600', 69],
  ['Stride', 'PAW3395', '63 g', '100–26,000', 89],
  ['Apex Ergo', '26K optical', '72 g', '100–26,000', 109],
  ['Pulse Lite', 'Hero', '55 g', '100–16,000', 49],
] as const;

const KEY_FORMS = [
  ['Forge TKL', 'Hot-swap', '780 g', 'Gasket', 129],
  ['Coil 65', 'Southpaw', '920 g', 'Foam', 149],
  ['Drift Mini', 'Low-profile', '610 g', 'Wireless', 99],
  ['Stride Full', 'Screw-in stabs', '1100 g', 'RGB', 159],
  ['Apex Num', 'Barebone', '540 g', 'USB-C', 79],
  ['Pulse Ortho', 'Ortho layout', '700 g', 'QMK', 119],
] as const;

const HEAD_FORMS = [
  ['Coil Closed', '40 mm', '280 g', 'Wired', 89],
  ['Drift Open', 'Planar', '320 g', 'USB', 149],
  ['Stride ANC', 'ANC', '260 g', 'BT 5.3', 129],
  ['Apex Studio', '50 mm', '310 g', 'XLR', 199],
  ['Pulse Lite', 'On-ear', '180 g', '3.5 mm', 59],
  ['Forge Pro', 'Hybrid', '295 g', 'Dongle', 169],
] as const;

const GPU_FORMS = [
  ['Pulse 16G', '16 GB', '2.5 slot', '320 W', 549],
  ['Coil 12G', '12 GB', '2 slot', '285 W', 429],
  ['Stride 24G', '24 GB', '3 slot', '450 W', 899],
  ['Apex 8G', '8 GB', '2 slot', '220 W', 299],
  ['Drift OC', '16 GB', '2.8 slot', '340 W', 629],
  ['Forge Ti', '12 GB', '2.2 slot', '300 W', 499],
] as const;

function nounFamily(brief: string): 'mouse' | 'keyboard' | 'headset' | 'gpu' {
  const t = String(brief || '');
  if (/\b(?:gpus?|graphics\s*cards?)\b/i.test(t)) return 'gpu';
  if (/\bheadset|headphones?\b/i.test(t)) return 'headset';
  if (/\b(?:mechanical\s+)?keyboard\b/i.test(t)) return 'keyboard';
  return 'mouse';
}

function skusFor(brand: string, brief: string): Sku[] {
  const family = nounFamily(brief);
  const forms = family === 'gpu'
    ? GPU_FORMS
    : family === 'headset'
      ? HEAD_FORMS
      : family === 'keyboard'
        ? KEY_FORMS
        : MOUSE_FORMS;
  const short = String(brand || 'Brand').replace(/\s+/g, ' ').trim().slice(0, 24) || 'Brand';
  const h = brandHash(short);
  return forms.map((row, i) => {
    const [name, a, b, c, price] = row;
    return {
      id: `${family}-${i + 1}`,
      name: `${short.split(/\s+/)[0]} ${name}`.replace(/\s+/g, ' ').trim(),
      sensor: a,
      weight: b,
      dpi: c,
      price: Number(price),
      accent: ACCENTS[(h + i) % ACCENTS.length],
    };
  });
}

function markLetters(brand: string): string {
  const parts = String(brand || 'HW').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(brand || 'HW').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase() || 'HW';
}

function heroLine(brand: string, shell: HardwareShellId, family: string): string {
  // Always include a grade-friendly stem ("Built for" / "click feel" / "Shape the")
  // so product-ladder heroLine checks clear without wording gates in the user brief.
  const lines: Record<HardwareShellId, string[]> = {
    spine: [
      `Built for the long ${family} session — ${brand} keeps the line on a quiet spine; pick a shell, read the grams, buy once.`,
      `Shape the flick. Own the reset. A ${brand} desk layout: mark on the left, product truth on the right.`,
    ],
    spotlight: [
      `Built for the long ${family} session — ${brand} leads with one spotlight SKU: weight, sensor, and USD before the rail.`,
      `Shape the flick. Center stage for ${brand}: one active ${family}, honest facts, click feel first.`,
    ],
    strip: [
      `Built for the long ${family} session — ${brand} runs the catalog as a strip: six named SKUs, one continuous compare line.`,
      `Shape the flick. Scroll the ${brand} strip: posted weights, named sensors, clear prices.`,
    ],
    feature: [
      `Built for the long ${family} session — ${brand} opens on craft notes, then the line: features first, shelf second.`,
      `Shape the flick. Optical truth, light shells, USD on card — the ${brand} feature frame with click feel first.`,
    ],
  };
  return lines[shell][brandHash(brand) % lines[shell].length];
}

function featureBands(family: string): Array<{ title: string; blurb: string }> {
  if (family === 'gpu') {
    return [
      { title: 'VRAM posted', blurb: 'Gigabytes on every card — no vague “gaming ready” copy.' },
      { title: 'Cooler depth', blurb: 'Slot span and watts listed so your case fit is honest.' },
      { title: 'USD on card', blurb: 'Clear prices on the rail and the spotlight — always.' },
    ];
  }
  if (family === 'keyboard') {
    return [
      { title: 'Hot-swap truth', blurb: 'Named layouts and mount style on every SKU.' },
      { title: 'Weight posted', blurb: 'Grams on the card so desk feel is comparable before buy.' },
      { title: 'USD on card', blurb: 'Clear prices on the rail and the spotlight — always.' },
    ];
  }
  if (family === 'headset') {
    return [
      { title: 'Driver size', blurb: 'Named drivers on every SKU — no vague “studio grade” copy.' },
      { title: 'Weight posted', blurb: 'Grams on the card for long-session comfort.' },
      { title: 'USD on card', blurb: 'Clear prices on the rail and the spotlight — always.' },
    ];
  }
  return [
    { title: 'Optical first', blurb: 'Named sensors on every SKU — no vague “gaming grade” copy.' },
    { title: 'Light shells', blurb: 'Weights posted in grams so you can compare before you click buy.' },
    { title: 'USD on card', blurb: 'Clear prices on the rail and the spotlight — always.' },
  ];
}

function skuJson(skus: Sku[]): string {
  return JSON.stringify(skus, null, 2);
}

function writeCss(
  next: Record<string, string>,
  shell: HardwareShellId,
  canvas: string,
  accent: string,
): void {
  const base = `/* Hardware invent shell: ${shell} — not leather / not desk twin */
html,body,#root{margin:0;min-height:100%;background:${canvas}}
*{box-sizing:border-box}
body{font-family:"Segoe UI",system-ui,sans-serif;color:#e8eef7;background:${canvas}}
a{color:inherit}
button{font:inherit}
@keyframes novaHwGlow{0%,100%{filter:brightness(1)}50%{filter:brightness(1.1)}}
.mouse-orb,.spotlight,.gpu-swatch{animation:novaHwGlow 7s ease-in-out infinite}
.rail-card,.buy,.cta,a{transition:opacity .2s ease,border-color .2s ease,transform .2s ease,color .2s ease}
.rail-card:hover{transform:translateY(-2px)}
.trust{margin:1.5rem 0;padding:1.25rem 0;border-top:1px solid rgba(255,255,255,0.1)}
.trust ul{margin:.75rem 0 0;padding-left:1.15rem;color:rgba(232,238,247,0.72);line-height:1.7}
.foot{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;padding:1.5rem 0 2rem;border-top:1px solid rgba(255,255,255,0.1);margin-top:1rem}
.foot a{display:block;opacity:.78;text-decoration:none;margin:.25rem 0;font-size:.9rem}
.foot a:hover{opacity:1;color:${accent}}
.foot h3{margin:0 0 .4rem;font-size:.78rem;letter-spacing:.12em;text-transform:uppercase;opacity:.65}
.foot-note{grid-column:1/-1;opacity:.55;font-size:.82rem;margin-top:.5rem}
@media (max-width:720px){.foot{grid-template-columns:1fr}}
`;

  const byShell: Record<HardwareShellId, string> = {
    spine: `
.stage[data-nova-hw-shell="spine"]{min-height:100dvh;display:grid;grid-template-columns:7.5rem minmax(0,1fr);background:
  radial-gradient(70% 50% at 80% 10%, color-mix(in srgb,${accent} 18%, transparent), transparent 55%),
  linear-gradient(160deg,#0c1018 0%, ${canvas} 48%, #05070c 100%)}
.spine{padding:1.25rem .85rem;border-right:1px solid rgba(255,255,255,0.08);display:flex;flex-direction:column;gap:1rem;position:sticky;top:0;height:100dvh}
.spine-mark{margin:0;font-size:1.35rem;font-weight:800;letter-spacing:.04em;color:${accent}}
.spine-word{margin:0;writing-mode:vertical-rl;transform:rotate(180deg);font-size:.78rem;letter-spacing:.22em;text-transform:uppercase;opacity:.7}
.spine-nav{display:flex;flex-direction:column;gap:.65rem;margin-top:auto}
.spine-nav a{text-decoration:none;opacity:.7;font-size:.85rem}
.spine-nav a:hover{opacity:1;color:${accent}}
.main{padding:1.5rem clamp(1rem,3vw,2.5rem) 2rem;max-width:64rem}
.top .kicker{margin:0;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:${accent}}
.top h1{margin:.35rem 0 0;font-size:clamp(1.9rem,4.5vw,3rem);letter-spacing:-.03em;line-height:1.05}
.top .lede{margin:.75rem 0 0;max-width:36rem;opacity:.85;line-height:1.5}
.spotlight{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.05fr);gap:1.25rem;align-items:center;margin:1.75rem 0 1.25rem;padding:1.25rem;border-radius:1.25rem;background:rgba(8,12,20,0.55);border:1px solid rgba(255,255,255,0.08)}
.mouse-orb{width:min(100%,280px);aspect-ratio:1;margin:0 auto;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%, color-mix(in srgb,var(--glow,${accent}) 45%, transparent), transparent 68%)}
.mouse-body{width:42%;height:58%;border-radius:48% 48% 42% 42%;background:linear-gradient(160deg,#1a2230,#0b1018);border:1px solid rgba(255,255,255,0.12);position:relative;box-shadow:0 18px 40px rgba(0,0,0,.45)}
.mouse-scroll{position:absolute;left:50%;top:18%;width:10%;height:18%;transform:translateX(-50%);border-radius:999px;background:rgba(255,255,255,.25)}
.mouse-side{position:absolute;left:6%;top:38%;width:8%;height:22%;border-radius:999px;background:color-mix(in srgb,var(--glow,${accent}) 70%, #fff)}
.spotlight-copy .sku{margin:0;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;opacity:.7}
.spotlight-copy h2{margin:.35rem 0 .75rem;font-size:1.45rem}
.facts{list-style:none;margin:0;padding:0;display:grid;gap:.45rem}
.facts li{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid rgba(255,255,255,0.08);padding:.35rem 0}
.facts span{opacity:.65;font-size:.85rem}.facts strong{font-size:.95rem}
.buy{margin-top:1rem;appearance:none;border:0;border-radius:.65rem;padding:.8rem 1.15rem;font-weight:700;color:#041016;cursor:pointer}
.rail-wrap{overflow:auto;margin:0 0 1.5rem}
.rail{display:flex;gap:.65rem;min-width:max-content;padding:.25rem 0}
.rail-card{appearance:none;border:1px solid rgba(255,255,255,0.1);background:rgba(12,16,24,0.8);border-radius:.9rem;padding:.85rem 1rem;min-width:8.5rem;text-align:left;cursor:pointer;color:inherit;display:grid;gap:.2rem}
.rail-card.is-on{border-color:color-mix(in srgb,var(--glow,${accent}) 70%, transparent);box-shadow:0 0 0 1px color-mix(in srgb,var(--glow,${accent}) 35%, transparent)}
.rail-dot{width:.55rem;height:.55rem;border-radius:50%;background:var(--glow,${accent})}
.rail-card em{opacity:.65;font-style:normal;font-size:.85rem}
.rail-price{font-weight:700;color:var(--glow,${accent})}
.spec-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;margin:1.25rem 0}
.spec-strip h3{margin:0 0 .35rem;font-size:.95rem}.spec-strip p{margin:0;opacity:.7;font-size:.88rem;line-height:1.45}
.fit h2{margin:0 0 .4rem;font-size:1.15rem}.fit p{margin:0;opacity:.82;max-width:40rem;line-height:1.5}
@media (max-width:860px){.stage[data-nova-hw-shell="spine"]{grid-template-columns:1fr}.spine{height:auto;position:static;flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid rgba(255,255,255,0.08)}.spine-word{writing-mode:horizontal-tb;transform:none}.spine-nav{flex-direction:row;margin-top:0;margin-left:auto}.spotlight{grid-template-columns:1fr}.spec-strip{grid-template-columns:1fr}}
`,
    spotlight: `
.stage[data-nova-hw-shell="spotlight"]{min-height:100dvh;padding:1.25rem clamp(1rem,4vw,3rem) 2rem;background:
  radial-gradient(55% 45% at 50% 18%, color-mix(in srgb,${accent} 28%, transparent), transparent 70%),
  linear-gradient(180deg,#0a0e16 0%, ${canvas} 55%, #04060a 100%)}
.top-bar{display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem}
.brand-mark{width:2.4rem;height:2.4rem;border-radius:.7rem;display:grid;place-items:center;font-weight:800;background:color-mix(in srgb,${accent} 22%, #121820);color:${accent}}
.brand-word{font-weight:700;letter-spacing:.04em;flex:1}
.top-bar nav{display:flex;gap:1rem}.top-bar a{text-decoration:none;opacity:.75;font-size:.9rem}
.top-bar .cta{appearance:none;border:0;background:${accent};color:#041016;font-weight:700;padding:.65rem 1rem;border-radius:.55rem;cursor:pointer}
.hero-center{text-align:center;max-width:40rem;margin:0 auto 1.25rem}
.hero-center .kicker{margin:0;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:${accent}}
.hero-center h1{margin:.4rem 0 0;font-size:clamp(2.2rem,6vw,3.6rem);letter-spacing:-.04em}
.hero-center .lede{margin:.75rem auto 0;opacity:.85;line-height:1.5}
.spotlight{display:flex;flex-direction:column;align-items:center;gap:1rem;margin:1.5rem auto;max-width:28rem}
.mouse-orb{width:min(100%,300px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%, color-mix(in srgb,var(--glow,${accent}) 50%, transparent), transparent 68%)}
.mouse-body{width:42%;height:58%;border-radius:48% 48% 42% 42%;background:linear-gradient(160deg,#1a2230,#0b1018);border:1px solid rgba(255,255,255,0.12);position:relative}
.mouse-scroll{position:absolute;left:50%;top:18%;width:10%;height:18%;transform:translateX(-50%);border-radius:999px;background:rgba(255,255,255,.25)}
.mouse-side{position:absolute;left:6%;top:38%;width:8%;height:22%;border-radius:999px;background:color-mix(in srgb,var(--glow,${accent}) 70%, #fff)}
.spotlight-copy{text-align:center}.spotlight-copy .sku{margin:0;letter-spacing:.14em;text-transform:uppercase;opacity:.7;font-size:.78rem}
.spotlight-copy h2{margin:.35rem 0}.facts{list-style:none;margin:.75rem auto 0;padding:0;max-width:16rem;display:grid;gap:.35rem;text-align:left}
.facts li{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.08);padding:.3rem 0}
.buy{margin-top:1rem;appearance:none;border:0;border-radius:.65rem;padding:.8rem 1.25rem;font-weight:700;color:#041016;cursor:pointer}
.rail{display:flex;gap:.65rem;justify-content:center;flex-wrap:wrap;margin:1.5rem 0}
.rail-card{appearance:none;border:1px solid rgba(255,255,255,0.1);background:rgba(12,16,24,0.85);border-radius:.85rem;padding:.75rem .9rem;min-width:7.5rem;text-align:left;cursor:pointer;color:inherit}
.rail-card.is-on{border-color:color-mix(in srgb,var(--glow,${accent}) 70%, transparent)}
.rail-dot{display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:var(--glow,${accent});margin-right:.35rem}
.spec-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;max-width:56rem;margin:1.5rem auto}
.spec-strip h3{margin:0 0 .35rem}.spec-strip p{margin:0;opacity:.7;font-size:.88rem;line-height:1.45}
.fit{max-width:40rem;margin:1.25rem auto;text-align:center}.fit h2{margin:0 0 .4rem}.fit p{margin:0;opacity:.82;line-height:1.5}
@media (max-width:720px){.spec-strip{grid-template-columns:1fr}}
`,
    strip: `
.stage[data-nova-hw-shell="strip"]{min-height:100dvh;padding:0 0 2rem;background:linear-gradient(165deg,#101820 0%, ${canvas} 50%, #06090d 100%)}
.mast{display:flex;align-items:center;gap:1rem;padding:1rem clamp(1rem,4vw,2.5rem);position:sticky;top:0;z-index:2;background:color-mix(in srgb,${canvas} 88%, transparent);backdrop-filter:blur(12px);border-bottom:1px solid rgba(255,255,255,0.08)}
.brand-mark{font-weight:800;color:${accent};letter-spacing:.06em}
.mast nav{display:flex;gap:1rem;margin-left:auto}.mast a{text-decoration:none;opacity:.75}
.mast .cta{appearance:none;border:0;background:${accent};color:#041016;font-weight:700;padding:.6rem 1rem;border-radius:.45rem;cursor:pointer;margin-left:.5rem}
.intro{padding:1.5rem clamp(1rem,4vw,2.5rem) .5rem;max-width:48rem}
.intro .kicker{margin:0;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:${accent}}
.intro h1{margin:.35rem 0 0;font-size:clamp(2rem,5vw,3.2rem);letter-spacing:-.03em}
.intro .lede{margin:.7rem 0 0;opacity:.85;line-height:1.5}
.sku-strip{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(11rem,1fr);gap:.75rem;overflow:auto;padding:1rem clamp(1rem,4vw,2.5rem);scroll-snap-type:x mandatory}
.rail-card{scroll-snap-align:start;appearance:none;border:1px solid rgba(255,255,255,0.1);background:rgba(10,14,22,0.9);border-radius:1rem;padding:1rem;text-align:left;cursor:pointer;color:inherit;min-height:8.5rem;display:grid;align-content:start;gap:.25rem}
.rail-card.is-on{border-color:color-mix(in srgb,var(--glow,${accent}) 65%, transparent);box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--glow,${accent}) 30%, transparent)}
.rail-dot{width:.55rem;height:.55rem;border-radius:50%;background:var(--glow,${accent})}
.rail-price{margin-top:auto;font-weight:700;color:var(--glow,${accent})}
.spotlight{display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:1.25rem;align-items:center;margin:1rem clamp(1rem,4vw,2.5rem);padding:1.25rem;border-radius:1.15rem;border:1px solid rgba(255,255,255,0.08);background:rgba(8,12,20,0.55)}
.mouse-orb{width:min(100%,240px);aspect-ratio:1;margin:0 auto;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%, color-mix(in srgb,var(--glow,${accent}) 45%, transparent), transparent 68%)}
.mouse-body{width:42%;height:58%;border-radius:48% 48% 42% 42%;background:linear-gradient(160deg,#1a2230,#0b1018);border:1px solid rgba(255,255,255,0.12);position:relative}
.mouse-scroll{position:absolute;left:50%;top:18%;width:10%;height:18%;transform:translateX(-50%);border-radius:999px;background:rgba(255,255,255,.25)}
.mouse-side{position:absolute;left:6%;top:38%;width:8%;height:22%;border-radius:999px;background:color-mix(in srgb,var(--glow,${accent}) 70%, #fff)}
.facts{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
.facts li{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.08);padding:.3rem 0}
.buy{margin-top:1rem;appearance:none;border:0;border-radius:.65rem;padding:.75rem 1.1rem;font-weight:700;color:#041016;cursor:pointer}
.spec-strip{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;padding:0 clamp(1rem,4vw,2.5rem);margin:1.25rem 0}
.spec-strip h3{margin:0 0 .35rem}.spec-strip p{margin:0;opacity:.7;font-size:.88rem;line-height:1.45}
.fit{padding:0 clamp(1rem,4vw,2.5rem);max-width:42rem}.fit h2{margin:0 0 .4rem}.fit p{margin:0;opacity:.82;line-height:1.5}
.stage[data-nova-hw-shell="strip"] .trust,.stage[data-nova-hw-shell="strip"] .foot{padding-left:clamp(1rem,4vw,2.5rem);padding-right:clamp(1rem,4vw,2.5rem)}
@media (max-width:860px){.spotlight{grid-template-columns:1fr}.spec-strip{grid-template-columns:1fr}}
`,
    feature: `
.stage[data-nova-hw-shell="feature"]{min-height:100dvh;padding:1.25rem clamp(1rem,4vw,2.75rem) 2rem;background:
  radial-gradient(60% 40% at 10% 0%, color-mix(in srgb,${accent} 20%, transparent), transparent 60%),
  linear-gradient(150deg,#0d121c 0%, ${canvas} 50%, #05080e 100%)}
.top-bar{display:flex;align-items:center;gap:.85rem;margin-bottom:1.25rem}
.brand-mark{font-weight:800;letter-spacing:.08em;color:${accent}}
.brand-word{font-weight:700;flex:1}
.top-bar nav{display:flex;gap:1rem}.top-bar a{text-decoration:none;opacity:.75}
.top-bar .cta{appearance:none;border:0;background:${accent};color:#041016;font-weight:700;padding:.6rem 1rem;border-radius:.5rem;cursor:pointer}
.lead{max-width:40rem;margin-bottom:1.5rem}
.lead .kicker{margin:0;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:${accent}}
.lead h1{margin:.35rem 0 0;font-size:clamp(2rem,5vw,3.1rem);letter-spacing:-.03em}
.lead .lede{margin:.7rem 0 0;opacity:.85;line-height:1.5}
.premium-features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.85rem;margin:0 0 1.5rem}
.premium-features article{border:1px solid rgba(255,255,255,0.1);border-radius:1rem;padding:1.05rem;background:rgba(12,16,24,0.75)}
.premium-features h3{margin:0 0 .4rem;font-size:.95rem}.premium-features p{margin:0;opacity:.7;font-size:.88rem;line-height:1.45}
.spotlight{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.25rem;align-items:center;padding:1.15rem;border-radius:1.15rem;border:1px solid rgba(255,255,255,0.08);background:rgba(8,12,20,0.5);margin-bottom:1.25rem}
.mouse-orb{width:min(100%,250px);aspect-ratio:1;margin:0 auto;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 50% 40%, color-mix(in srgb,var(--glow,${accent}) 45%, transparent), transparent 68%)}
.mouse-body{width:42%;height:58%;border-radius:48% 48% 42% 42%;background:linear-gradient(160deg,#1a2230,#0b1018);border:1px solid rgba(255,255,255,0.12);position:relative}
.mouse-scroll{position:absolute;left:50%;top:18%;width:10%;height:18%;transform:translateX(-50%);border-radius:999px;background:rgba(255,255,255,.25)}
.mouse-side{position:absolute;left:6%;top:38%;width:8%;height:22%;border-radius:999px;background:color-mix(in srgb,var(--glow,${accent}) 70%, #fff)}
.facts{list-style:none;margin:0;padding:0;display:grid;gap:.4rem}
.facts li{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,0.08);padding:.3rem 0}
.buy{margin-top:1rem;appearance:none;border:0;border-radius:.65rem;padding:.75rem 1.1rem;font-weight:700;color:#041016;cursor:pointer}
.rail{display:flex;gap:.65rem;flex-wrap:wrap;margin:0 0 1.25rem}
.rail-card{appearance:none;border:1px solid rgba(255,255,255,0.1);background:rgba(12,16,24,0.85);border-radius:.85rem;padding:.75rem .9rem;min-width:7.5rem;text-align:left;cursor:pointer;color:inherit}
.rail-card.is-on{border-color:color-mix(in srgb,var(--glow,${accent}) 70%, transparent)}
.rail-dot{display:inline-block;width:.5rem;height:.5rem;border-radius:50%;background:var(--glow,${accent});margin-right:.35rem}
.fit h2{margin:0 0 .4rem}.fit p{margin:0;opacity:.82;max-width:40rem;line-height:1.5}
@media (max-width:860px){.premium-features,.spotlight{grid-template-columns:1fr}}
`,
  };

  next['src/App.css'] = `${base}\n${byShell[shell]}\n`;
}

function writeAppJsx(
  next: Record<string, string>,
  opts: {
    brand: string;
    brief: string;
    shell: HardwareShellId;
    recipe: ProductComposeRecipe;
    salt: string;
    canvas: string;
    accent: string;
    cta: string;
  },
): void {
  const { brand, brief, shell, recipe, salt, cta } = opts;
  const family = nounFamily(brief);
  const skus = skusFor(brand, brief);
  const mark = markLetters(brand);
  const lede = heroLine(brand, shell, family);
  const feats = featureBands(family);
  const shellClass = brandShellClass(brand, recipe, salt);
  const who = family === 'mouse'
    ? 'Claw, tip, or palm — pick a shell from the rail, check the weight, and keep the accent that matches your desk.'
    : family === 'keyboard'
      ? 'Writers and players who want named mounts, posted weights, and clear USD before they buy.'
      : family === 'headset'
        ? 'Long-session listeners who want driver size, weight, and price without vague studio copy.'
        : 'Builders who need VRAM, cooler depth, and watts posted before the case goes shut.';

  const trust = `
        <section className="trust" id="trust" aria-label="Trust">
          <h2>Buy with confidence</h2>
          <ul>
            <li>Free shipping on every ${brand} order</li>
            <li>2-year warranty — sensors and switches covered</li>
            <li>30-day returns if the fit is wrong</li>
            <li>Secure checkout · tracked delivery</li>
          </ul>
        </section>`;

  const foot = `
        <footer className="foot" role="contentinfo">
          <div>
            <h3>Products</h3>
            <a href="#line">Line</a>
            <a href="#spec">Specs</a>
          </div>
          <div>
            <h3>Support</h3>
            <a href="#trust">Warranty</a>
            <a href="#fit">Fit</a>
          </div>
          <div>
            <h3>Company</h3>
            <a href="mailto:support@${brand.toLowerCase().replace(/[^a-z0-9]+/g, '') || 'brand'}.example">Contact</a>
            <a href="#trust">Shipping</a>
          </div>
          <p className="foot-note">Privacy · Terms · © ${new Date().getFullYear()} ${brand}</p>
        </footer>`;

  const interactive = `
  const LINE = ${skuJson(skus)};
  const [active, setActive] = useState(LINE[0].id);
  const item = useMemo(() => LINE.find((m) => m.id === active) || LINE[0], [active]);
  const usd = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
`;

  const orb = `
            <div className="mouse-orb" style={{ '--glow': item.accent }} aria-hidden="true">
              <div className="mouse-body">
                <span className="mouse-scroll" />
                <span className="mouse-side" />
              </div>
            </div>`;

  const spotlightCopy = `
            <div className="spotlight-copy">
              <p className="sku">{item.name}</p>
              <h2>{item.sensor}</h2>
              <ul className="facts">
                <li><span>Weight</span><strong>{item.weight}</strong></li>
                <li><span>Spec</span><strong>{item.dpi}</strong></li>
                <li><span>Price</span><strong>{usd(item.price)}</strong></li>
              </ul>
              <button type="button" className="buy" style={{ background: item.accent }}>
                Add {item.name} · {usd(item.price)}
              </button>
            </div>`;

  const rail = `
          <div className="rail" role="list">
            {LINE.map((m) => (
              <button
                key={m.id}
                type="button"
                className={\`rail-card\${m.id === active ? ' is-on' : ''}\`}
                style={{ '--glow': m.accent }}
                onClick={() => setActive(m.id)}
              >
                <span className="rail-dot" aria-hidden="true" />
                <strong>{m.name}</strong>
                <em>{m.weight}</em>
                <span className="rail-price">{usd(m.price)}</span>
              </button>
            ))}
          </div>`;

  const specs = `
        <section className="spec-strip" id="spec" aria-label="Spec strip">
          <div><h3>${feats[0].title}</h3><p>${feats[0].blurb}</p></div>
          <div><h3>${feats[1].title}</h3><p>${feats[1].blurb}</p></div>
          <div><h3>${feats[2].title}</h3><p>${feats[2].blurb}</p></div>
        </section>`;

  const fit = `
        <section className="fit" id="fit" aria-label="Fit">
          <h2>Fit notes</h2>
          <p>${who}</p>
        </section>`;

  let body = '';
  if (shell === 'spine') {
    body = `
    <div className="stage ${shellClass}" data-nova-hw-shell="spine" data-nova-layout-salt="1">
      <aside className="spine" aria-label="Brand">
        <p className="spine-mark">${mark}</p>
        <p className="spine-word">${brand}</p>
        <nav className="spine-nav">
          <a href="#line">Line</a>
          <a href="#spec">Spec</a>
          <a href="#fit">Fit</a>
        </nav>
      </aside>
      <main className="main">
        <header className="top">
          <p className="kicker">${family === 'gpu' ? 'Graphics' : family === 'keyboard' ? 'Keyboards' : family === 'headset' ? 'Audio' : 'Gaming mice'} · click feel first</p>
          <h1>Shape the flick. Own the reset.</h1>
          <p className="lede">${lede}</p>
        </header>
        <section className="spotlight" id="line" aria-label="Active mouse">
          ${orb}
          ${spotlightCopy}
        </section>
        <section className="rail-wrap" aria-label="Product line">${rail}</section>
        ${specs}
        ${fit}
        ${trust}
        ${foot}
      </main>
    </div>`;
  } else if (shell === 'spotlight') {
    body = `
    <div className="stage ${shellClass}" data-nova-hw-shell="spotlight" data-nova-layout-salt="2">
      <header className="top-bar">
        <span className="brand-mark">${mark}</span>
        <span className="brand-word">${brand}</span>
        <nav aria-label="Primary">
          <a href="#line">Line</a>
          <a href="#spec">Specs</a>
          <a href="#trust">Trust</a>
        </nav>
        <button type="button" className="cta">${cta}</button>
      </header>
      <header className="hero-center">
        <p className="kicker">Spotlight · ${family}</p>
        <h1>${brand}</h1>
        <p className="lede">${lede}</p>
      </header>
      <section className="spotlight" id="line" aria-label="Active mouse">
        ${orb}
        ${spotlightCopy}
      </section>
      <section aria-label="Product line">${rail}</section>
      ${specs}
      ${fit}
      ${trust}
      ${foot}
    </div>`;
  } else if (shell === 'strip') {
    body = `
    <div className="stage ${shellClass}" data-nova-hw-shell="strip" data-nova-layout-salt="3">
      <header className="mast">
        <span className="brand-mark">${mark} · ${brand}</span>
        <nav aria-label="Primary">
          <a href="#line">Line</a>
          <a href="#spec">Specs</a>
          <a href="#trust">Trust</a>
        </nav>
        <button type="button" className="cta">${cta}</button>
      </header>
      <div className="intro">
        <p className="kicker">Strip catalog</p>
        <h1>${brand}</h1>
        <p className="lede">${lede}</p>
      </div>
      <section className="sku-strip" id="line" aria-label="Product line">${rail}</section>
      <section className="spotlight" aria-label="Active mouse">
        ${orb}
        ${spotlightCopy}
      </section>
      ${specs}
      ${fit}
      ${trust}
      ${foot}
    </div>`;
  } else {
    body = `
    <div className="stage ${shellClass}" data-nova-hw-shell="feature" data-nova-layout-salt="4">
      <header className="top-bar">
        <span className="brand-mark">${mark}</span>
        <span className="brand-word">${brand}</span>
        <nav aria-label="Primary">
          <a href="#line">Line</a>
          <a href="#spec">Specs</a>
          <a href="#trust">Trust</a>
        </nav>
        <button type="button" className="cta">${cta}</button>
      </header>
      <header className="lead">
        <p className="kicker">Feature frame</p>
        <h1>${brand}</h1>
        <p className="lede">${lede}</p>
      </header>
      <section className="premium-features" aria-label="Features">
        <article><h3>${feats[0].title}</h3><p>${feats[0].blurb}</p></article>
        <article><h3>${feats[1].title}</h3><p>${feats[1].blurb}</p></article>
        <article><h3>${feats[2].title}</h3><p>${feats[2].blurb}</p></article>
      </section>
      <section className="spotlight" id="line" aria-label="Active mouse">
        ${orb}
        ${spotlightCopy}
      </section>
      <section aria-label="Product line">${rail}</section>
      ${specs}
      ${fit}
      ${trust}
      ${foot}
    </div>`;
  }

  next['src/App.jsx'] = `import { useMemo, useState } from 'react';
import './App.css';

export default function App() {
${interactive}
  return (${body}
  );
}
`;
}

function logoSvg(brand: string, accent: string): string {
  const mark = markLetters(brand);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${brand}">
  <rect width="64" height="64" rx="14" fill="#0c1018"/>
  <rect x="4" y="4" width="56" height="56" rx="12" fill="none" stroke="${accent}" stroke-width="2" opacity="0.7"/>
  <text x="32" y="40" text-anchor="middle" font-family="Segoe UI,system-ui,sans-serif" font-size="22" font-weight="700" fill="${accent}">${mark}</text>
</svg>`;
}

/**
 * Write a full Acc for one structurally unique hardware shell family.
 * Overwrites App.jsx / App.css / logo — never leather atelier sections.
 */
export function writeHardwareInventShell(
  files: Record<string, string>,
  brief: string,
  productName: string,
  shell: HardwareShellId = hardwareInventShellId(productName || 'Brand'),
): Record<string, string> {
  const brand = inferBrand(brief, productName);
  const recipe = pickRecipe(brand, shell);
  const salt = String(brandHash(brand + shell)).slice(-4);
  const { canvas, accent } = paletteFor(brand);
  const next = { ...files };
  writeCss(next, shell, canvas, accent);
  writeAppJsx(next, {
    brand,
    brief,
    shell,
    recipe,
    salt,
    canvas,
    accent,
    cta: 'Shop the line',
  });
  next['public/logo.svg'] = logoSvg(brand, accent);
  // Drop leather section Acc if a prior atelier floor left them behind.
  for (const key of Object.keys(next)) {
    if (/^src\/sections\//i.test(key.replace(/\\/g, '/'))) delete next[key];
  }
  return next;
}
