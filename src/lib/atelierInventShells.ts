/**
 * Atelier invent shells — structurally different Acc families.
 * Replaces the one sticky-nav + 4 equal product-card stamp that made every
 * Latch invent look identical (Garnet / Ivory / Noir class).
 */
import {
  atelierLeatherHeroDataUrl,
  atelierLeatherPlateDataUrl,
} from '@/lib/atelierLeatherPlate';

export type AtelierShellId =
  | 'lookbook'
  | 'rail'
  | 'feature'
  | 'strip'
  | 'commission';

const SHELLS: readonly AtelierShellId[] = [
  'lookbook',
  'rail',
  'feature',
  'strip',
  'commission',
] as const;

function brandHash(brand: string): number {
  const s = String(brand || 'atelier');
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function inventFloorShellId(brand: string, nudge = 0): AtelierShellId {
  const mix = (brandHash(brand) ^ (nudge * 2654435761)) >>> 0;
  return SHELLS[mix % SHELLS.length];
}

/** Acc already carries a modern shell family (lookbook/rail/feature/strip/commission). */
export function accHasModernAtelierShell(files: Record<string, string>): boolean {
  const blob = Object.values(files || {}).join('\n');
  return /data-nova-shell=["'](?:lookbook|rail|feature|strip|commission)["']/i.test(blob);
}

/** Read shell id from Acc, if present. */
export function readAtelierShellId(files: Record<string, string>): AtelierShellId | null {
  const blob = Object.values(files || {}).join('\n');
  const m = /data-nova-shell=["'](lookbook|rail|feature|strip|commission)["']/i.exec(blob);
  return m ? (m[1].toLowerCase() as AtelierShellId) : null;
}

/**
 * Companion polish (novaCompanionSweep + horizontal sticky header) was overwriting
 * invent-shell App.css — every Latch looked identical and rail layout broke (Prism).
 * Strip the stamp companion when a modern shell is present.
 */
export function healModernAtelierCompanionStomp(
  files: Record<string, string>,
  brand: string,
): Record<string, string> {
  if (!accHasModernAtelierShell(files)) return files;
  const css = String(files['src/App.css'] || '');
  const hero = String(files['src/sections/HeroSection.jsx'] || files['src/sections/Hero.jsx'] || '');
  const nav = String(files['src/sections/NavHeaderSection.jsx'] || '');
  const stomped = /novaCompanionSweep|NOVA create polish — brief companion/i.test(css)
    || (/header,\s*header|\.header,\s*header/i.test(css)
      && /\.nav,\s*nav/i.test(css)
      && /display:\s*flex;\s*flex-direction:\s*column/i.test(css))
    || /NOVA designed hero stage/i.test(css)
    // Rail/commission are typography-first — injected HERO_VISUAL bag is a copy-stamp.
    || (/data-nova-shell=["'](?:rail|commission)["']/i.test(hero) && /\bHERO_VISUAL\b/.test(hero))
    // Logo jammed as first child of nav-rail-links.
    || (/nav-rail-links[\s\S]{0,80}nav-logo/i.test(nav));
  if (!stomped) return files;
  const shell = readAtelierShellId(files) || inventFloorShellId(brand);
  // Re-write shell Acc (nav/hero/catalog/story/footer + shell App.css) — do not keep companion.
  return writeAtelierInventShell(files, brand, shell);
}

/** Classic Latch stamp: sticky top nav + Shop|Story|Contact + four equal product cards. */
export function looksLikeClassicFourBoxAtelierShell(files: Record<string, string>): boolean {
  const blob = Object.values(files || {}).join('\n');
  if (!blob.trim()) return false;
  const stickyShopNav =
    /sticky-nav/i.test(blob)
    && /nav-right/i.test(blob)
    && /href=["']#shop["']>\s*Shop/i.test(blob)
    && /href=["']#story["']>\s*Story/i.test(blob)
    && /href=["']#contact["']>\s*Contact/i.test(blob);
  const fourEqualCards =
    (blob.match(/className=["'][^"']*product-card[^"']*["']/g) || []).length >= 4
    && /catalog-grid-row|repeat\(4,\s*minmax/i.test(blob);
  const classicShopHead = /catalog-heading["'][^>]*>\s*Shop\s*</i.test(blob)
    || />\s*Shop\s*<\/h2>/i.test(blob);
  // Explicit modern shell markers — never treat as classic stamp.
  if (/data-nova-shell=["'](?:lookbook|rail|feature|strip|commission)["']/i.test(blob)) {
    return false;
  }
  return stickyShopNav && fourEqualCards && classicShopHead;
}

type Sku = { id: string; name: string; material: string; art: string };

function shortBrand(brand: string): string {
  return brand.replace(/\s+(Atelier|Studio|Co|Lab|House)\s*$/i, '').trim() || brand;
}

const FORMS = [
  ['Cabin Hold', 'Drum-dyed hide, welded zipper'],
  ['Ledger Folio', 'Pressed board, linen lining'],
  ['Trail Sling', 'Pull-up leather, brass ring'],
  ['Ink Sleeve', 'Nubuck face, edge paint'],
  ['Harbor Tote', 'Oil-tanned straps, open top'],
  ['Studio Satchel', 'Vegetable-tanned flap, solid latch'],
  ['Noon Crossbody', 'Bridle strap, forged buckle'],
  ['Dusk Clutch', 'Glove leather, magnetic catch'],
  ['Forge Brief', 'Boarded hide, hand-stitched handle'],
  ['River Pack', 'Waxed flesh side, cotton drill'],
  ['Lantern Pouch', 'Soft calf, saddle-stitch seam'],
  ['Atlas Week', 'Thick hide, brass zipper pull'],
  ['Cinder Kit', 'Harness leather, pull tab'],
  ['Moss Envelope', 'Thin calf, single pocket'],
  ['Quartz Daypack', 'Saddle leather, cotton lining'],
  ['Ember Belt', 'Softened hide, single buckle'],
  ['North Holdall', 'Waxed canvas sides, hide base'],
  ['Velvet Slip', 'Glove leather, fold closure'],
] as const;

function skusFor(brand: string, count: number, salt: number): Sku[] {
  const short = shortBrand(brand);
  const h = brandHash(brand) + salt * 17;
  const out: Sku[] = [];
  const used = new Set<number>();
  for (let i = 0; i < count; i += 1) {
    let idx = (h + i * 19 + short.length * 3) % FORMS.length;
    let guard = 0;
    while (used.has(idx) && guard < FORMS.length) {
      idx = (idx + 7) % FORMS.length;
      guard += 1;
    }
    used.add(idx);
    const [form, material] = FORMS[idx];
    const name = `${short} ${form}`;
    out.push({
      id: String(i + 1),
      name,
      material,
      art: atelierLeatherPlateDataUrl(name, material, i + h),
    });
  }
  return out;
}

function heroLede(brand: string, shell: AtelierShellId): string {
  const short = shortBrand(brand);
  const lines: Record<AtelierShellId, string[]> = {
    lookbook: [
      `${short} shows the hide before the hardware — a paced lookbook, not a shelf of twins.`,
      `Pages from the ${short} bench: grain, stitch, and brass in sequence.`,
    ],
    rail: [
      `${short} keeps the atelier on a quiet rail — read the bench, then the pieces.`,
      `A ${short} house layout: manifesto first, named leather second.`,
    ],
    feature: [
      `One lead piece from ${short}, then two companions — never four identical boxes.`,
      `${brand} leads with a single cut, then the pair that travels with it.`,
    ],
    strip: [
      `${short} runs the shelf as a strip — five forms, one continuous bench line.`,
      `Scroll the ${short} line: hides in a row, no catalog stamp grid.`,
    ],
    commission: [
      `${short} works by note and fitting — materials on the card, pieces when ready.`,
      `Commission the ${short} bench: skins, brass, and a date — not a four-box shop.`,
    ],
  };
  const pool = lines[shell];
  return pool[brandHash(brand) % pool.length];
}

function writeAppCss(next: Record<string, string>, shell: AtelierShellId): void {
  const fonts =
    shell === 'rail' || shell === 'commission'
      ? 'body{font-family:"Iowan Old Style",Palatino,Georgia,serif;background:var(--paper);color:var(--ink);}'
      : 'body{font-family:Georgia,"Times New Roman",serif;background:var(--paper);color:var(--ink);}';
  next['src/App.css'] = [
    `/* Invent shell: ${shell} — not classic four-box Latch stamp */`,
    ':root{--paper:#f4efe6;--ink:#142033;--muted:#3a4558;--brass:#b08d57;--line:#d9cfc0;}',
    '*{box-sizing:border-box;}',
    'html,body,#root{margin:0;min-height:100%;}',
    fonts,
    shell === 'rail'
      ? [
        /* Flat App mounts nav + sections as siblings — fixed left rail + padded main. */
        '.app{min-height:100vh;margin:0;width:100%;display:block;padding-left:14rem;',
        'box-sizing:border-box;background:var(--paper);color:var(--ink);}',
        '@media (max-width:860px){.app{padding-left:0;}}',
      ].join('')
      : '.app{min-height:100vh;margin:0;width:100%;display:flex;flex-direction:column;background:var(--paper);color:var(--ink);}',
    'a{color:var(--brass);}',
    'img{max-width:100%;height:auto;display:block;}',
    'section.catalog-section{display:block!important;max-width:none!important;margin:0!important;}',
    '',
  ].join('\n');
}

function writeLookbook(
  next: Record<string, string>,
  brand: string,
  shell: AtelierShellId,
): void {
  const short = shortBrand(brand);
  const items = skusFor(brand, 3, 1);
  const heroVisual = atelierLeatherHeroDataUrl({ name: brand, variant: brandHash(brand) % 8 });
  next['src/sections/NavHeaderSection.jsx'] = [
    "import './NavHeaderSection.css';",
    '',
    'export default function NavHeaderSection() {',
    '  return (',
    `    <header className="nav-header nav-centered" role="banner" data-nova-shell="${shell}">`,
    `      <a className="nav-wordmark" href="#hero">${brand}</a>`,
    '      <p className="nav-sub">Lookbook · Bench notes</p>',
    '    </header>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/NavHeaderSection.css'] = [
    '.nav-header.nav-centered{display:flex;flex-direction:column;align-items:center;gap:0.25rem;',
    'padding:1.4rem 8vw 1rem;border-bottom:1px solid #d9cfc0;background:#faf6ef;position:sticky;top:0;z-index:20;}',
    '.nav-wordmark{font-size:1.05rem;letter-spacing:0.28em;text-transform:uppercase;text-decoration:none;color:#142033;font-weight:600;}',
    '.nav-sub{margin:0;font-size:0.72rem;letter-spacing:0.16em;text-transform:uppercase;color:#6a5a3e;}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.jsx'] = [
    "import './HeroSection.css';",
    `const HERO_VISUAL = ${JSON.stringify(heroVisual)};`,
    'export default function HeroSection() {',
    '  return (',
    `    <section className="hero hero-section hero-lookbook" id="hero" aria-label="Hero" data-nova-shell="${shell}" data-nova-layout-salt="1">`,
    '      <div className="hero-copy">',
    `        <p className="hero-kicker">Lookbook</p>`,
    `        <h1 className="hero-title">${short}</h1>`,
    `        <p className="hero-lede">${heroLede(brand, shell)}</p>`,
    '      </div>',
    '      <div className="hero-stage" aria-hidden="true"><img className="hero-art" src={HERO_VISUAL} alt="" /></div>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.css'] = [
    '.hero-lookbook{display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr);min-height:78vh;background:#142033;color:#f4efe6;}',
    '@media (max-width:900px){.hero-lookbook{grid-template-columns:1fr;}}',
    '.hero-lookbook .hero-copy{padding:4.5rem 6vw;display:flex;flex-direction:column;justify-content:center;}',
    '.hero-lookbook .hero-kicker{letter-spacing:0.24em;text-transform:uppercase;font-size:0.7rem;color:#c4a574;margin:0 0 0.75rem;}',
    '.hero-lookbook .hero-title{font-size:clamp(2.8rem,6vw,4.6rem);margin:0 0 1rem;letter-spacing:-0.03em;}',
    '.hero-lookbook .hero-lede{max-width:28rem;line-height:1.65;color:#c8cdd6;margin:0;}',
    '.hero-lookbook .hero-stage{min-height:22rem;background:#efe6d6;}',
    '.hero-lookbook .hero-art{width:100%;height:100%;object-fit:cover;}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.jsx'] = [
    "import './CatalogSection.css';",
    'const PIECES = [',
    ...items.map((p) =>
      `  { id: '${p.id}', name: ${JSON.stringify(p.name)}, material: ${JSON.stringify(p.material)}, art: ${JSON.stringify(p.art)} },`,
    ),
    '];',
    'export default function CatalogSection() {',
    '  return (',
    `    <section className="catalog-section catalog-lookbook" id="shop" aria-label="Lookbook" data-nova-shell="${shell}" data-nova-layout-salt="1">`,
    '      <h2 className="catalog-heading">In the book</h2>',
    '      <div className="lookbook-stack">',
    '        {PIECES.map((p, i) => (',
    '          <article key={p.id} className={`lookbook-row ${i % 2 ? \'lookbook-row-flip\' : \'\'}`}>',
    '            <img className="product-art" src={p.art} alt="" />',
    '            <div className="lookbook-copy">',
    '              <p className="lookbook-idx">{String(i + 1).padStart(2, \'0\')}</p>',
    '              <h3>{p.name}</h3>',
    '              <p>{p.material}</p>',
    '            </div>',
    '          </article>',
    '        ))}',
    '      </div>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.css'] = [
    '.catalog-lookbook{padding:3.5rem 8vw 4rem;background:#faf6ef;}',
    '.catalog-lookbook .catalog-heading{margin:0 0 2rem;font-size:clamp(1.5rem,3vw,2rem);}',
    '.lookbook-stack{display:flex;flex-direction:column;gap:2.5rem;}',
    '.lookbook-row{display:grid;grid-template-columns:1.1fr 0.9fr;gap:2rem;align-items:center;}',
    '.lookbook-row-flip{grid-template-columns:0.9fr 1.1fr;}',
    '.lookbook-row-flip .product-art{order:2;}',
    '@media (max-width:800px){.lookbook-row,.lookbook-row-flip{grid-template-columns:1fr;}.lookbook-row-flip .product-art{order:0;}}',
    '.lookbook-row .product-art{width:100%;aspect-ratio:5/4;object-fit:cover;border-radius:4px;}',
    '.lookbook-idx{margin:0 0 0.5rem;letter-spacing:0.2em;font-size:0.72rem;color:#6a5a3e;}',
    '.lookbook-copy h3{margin:0 0 0.5rem;font-size:1.35rem;}',
    '.lookbook-copy p{margin:0;color:#5a6475;line-height:1.5;}',
    '',
  ].join('\n');
  writeStoryFooter(next, brand, shell, 'Pages from the bench', 1);
}

function writeRail(
  next: Record<string, string>,
  brand: string,
  shell: AtelierShellId,
): void {
  const short = shortBrand(brand);
  const items = skusFor(brand, 5, 2);
  next['src/sections/NavHeaderSection.jsx'] = [
    "import './NavHeaderSection.css';",
    'export default function NavHeaderSection() {',
    '  return (',
    `    <header className="nav-header nav-rail" role="banner" data-nova-shell="${shell}">`,
    `      <span className="nav-brand">${short}</span>`,
    '      <nav className="nav-rail-links" aria-label="Primary">',
    '        <a href="#hero">Intro</a>',
    '        <a href="#shop">Pieces</a>',
    '        <a href="#story">Bench</a>',
    '        <a href="#contact">Note</a>',
    '      </nav>',
    '    </header>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/NavHeaderSection.css'] = [
    '.nav-header.nav-rail{display:flex;flex-direction:column;align-items:flex-start;gap:1.5rem;',
    'padding:2rem 1.25rem;border-right:1px solid #d9cfc0;background:#efe8dc;',
    'position:fixed;left:0;top:0;width:14rem;height:100vh;z-index:30;box-sizing:border-box;}',
    '@media (max-width:860px){.nav-header.nav-rail{position:relative;width:100%;height:auto;',
    'flex-direction:row;flex-wrap:wrap;border-right:0;border-bottom:1px solid #d9cfc0;}}',
    '.nav-rail .nav-brand{font-weight:600;letter-spacing:0.08em;}',
    '.nav-rail .nav-logo{display:block;margin-bottom:0.35rem;}',
    '.nav-rail-links{display:flex;flex-direction:column;gap:0.85rem;}',
    '@media (max-width:860px){.nav-rail-links{flex-direction:row;flex-wrap:wrap;}}',
    '.nav-rail-links a{color:#142033;text-decoration:none;font-size:0.92rem;}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.jsx'] = [
    "import './HeroSection.css';",
    'export default function HeroSection() {',
    '  return (',
    `    <section className="hero hero-section hero-rail-intro" id="hero" aria-label="Hero" data-nova-shell="${shell}" data-nova-layout-salt="2">`,
    `      <p className="hero-kicker">Atelier rail</p>`,
    `      <h1 className="hero-title">${brand}</h1>`,
    `      <p className="hero-lede">${heroLede(brand, shell)}</p>`,
    '      <a className="hero-cta" href="#shop">Read the pieces</a>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.css'] = [
    '.hero-rail-intro{padding:4rem 6vw 2rem;max-width:40rem;background:#f7f1e6;}',
    '.hero-rail-intro .hero-kicker{margin:0 0 0.6rem;letter-spacing:0.2em;text-transform:uppercase;font-size:0.7rem;color:#6a5a3e;}',
    '.hero-rail-intro .hero-title{font-size:clamp(2.2rem,4vw,3.4rem);margin:0 0 1rem;letter-spacing:-0.03em;}',
    '.hero-rail-intro .hero-lede{margin:0 0 1.5rem;line-height:1.65;color:#3a4558;}',
    '.hero-rail-intro .hero-cta{display:inline-flex;padding:0.75rem 1.2rem;background:#142033;color:#f4efe6;text-decoration:none;border-radius:4px;}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.jsx'] = [
    "import './CatalogSection.css';",
    'const PIECES = [',
    ...items.map((p) =>
      `  { id: '${p.id}', name: ${JSON.stringify(p.name)}, material: ${JSON.stringify(p.material)}, art: ${JSON.stringify(p.art)} },`,
    ),
    '];',
    'export default function CatalogSection() {',
    '  return (',
    `    <section className="catalog-section catalog-rail-list" id="shop" aria-label="Pieces" data-nova-shell="${shell}" data-nova-layout-salt="2">`,
    '      <h2 className="catalog-heading">Named pieces</h2>',
    '      <ol className="rail-list">',
    '        {PIECES.map((p) => (',
    '          <li key={p.id} className="rail-item">',
    '            <img className="product-art" src={p.art} alt="" width="96" height="72" />',
    '            <div><h3>{p.name}</h3><p>{p.material}</p></div>',
    '          </li>',
    '        ))}',
    '      </ol>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.css'] = [
    '.catalog-rail-list{padding:1rem 6vw 3rem;}',
    '.catalog-rail-list .catalog-heading{margin:0 0 1.25rem;font-size:1.35rem;}',
    '.rail-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0.75rem;}',
    '.rail-item{display:grid;grid-template-columns:6rem 1fr;gap:1rem;align-items:center;padding:0.65rem 0;border-bottom:1px solid #d9cfc0;}',
    '.rail-item .product-art{width:6rem;height:4.5rem;object-fit:cover;border-radius:6px;}',
    '.rail-item h3{margin:0 0 0.2rem;font-size:1.05rem;}',
    '.rail-item p{margin:0;color:#5a6475;font-size:0.92rem;}',
    '',
  ].join('\n');
  writeStoryFooter(next, brand, shell, 'Bench notes', 2);
}

function writeFeature(
  next: Record<string, string>,
  brand: string,
  shell: AtelierShellId,
): void {
  const short = shortBrand(brand);
  const items = skusFor(brand, 3, 3);
  const [lead, ...rest] = items;
  next['src/sections/NavHeaderSection.jsx'] = [
    "import './NavHeaderSection.css';",
    'export default function NavHeaderSection() {',
    '  return (',
    `    <header className="nav-header nav-under" role="banner" data-nova-shell="${shell}">`,
    `      <span className="nav-brand">${brand}</span>`,
    '      <nav className="nav-under-links" aria-label="Primary">',
    '        <a href="#shop">Featured</a>',
    '        <a href="#story">About</a>',
    '        <a href="#contact">Visit</a>',
    '      </nav>',
    '    </header>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/NavHeaderSection.css'] = [
    '.nav-header.nav-under{display:flex;flex-direction:column;align-items:center;gap:0.65rem;',
    'padding:1.25rem 8vw;background:#faf6ef;border-bottom:1px solid #d9cfc0;}',
    '.nav-under .nav-brand{font-size:1.15rem;letter-spacing:0.04em;font-weight:600;}',
    '.nav-under-links{display:flex;gap:1.5rem;}',
    '.nav-under-links a{color:#142033;text-decoration:none;font-size:0.88rem;letter-spacing:0.08em;text-transform:uppercase;}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.jsx'] = [
    "import './HeroSection.css';",
    'export default function HeroSection() {',
    '  return (',
    `    <section className="hero hero-section hero-feature-type" id="hero" aria-label="Hero" data-nova-shell="${shell}" data-nova-layout-salt="3">`,
    `      <p className="hero-kicker">Lead cut</p>`,
    `      <h1 className="hero-title">${short}</h1>`,
    `      <p className="hero-lede">${heroLede(brand, shell)}</p>`,
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.css'] = [
    '.hero-feature-type{padding:3.5rem 8vw 1.5rem;text-align:center;background:#f7f1e6;}',
    '.hero-feature-type .hero-kicker{margin:0 0 0.5rem;letter-spacing:0.22em;text-transform:uppercase;font-size:0.7rem;color:#6a5a3e;}',
    '.hero-feature-type .hero-title{margin:0 auto 0.85rem;font-size:clamp(2.4rem,5vw,3.8rem);max-width:16ch;}',
    '.hero-feature-type .hero-lede{margin:0 auto;max-width:36rem;color:#3a4558;line-height:1.6;}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.jsx'] = [
    "import './CatalogSection.css';",
    `const LEAD = { id: '${lead.id}', name: ${JSON.stringify(lead.name)}, material: ${JSON.stringify(lead.material)}, art: ${JSON.stringify(lead.art)} };`,
    'const SIDE = [',
    ...rest.map((p) =>
      `  { id: '${p.id}', name: ${JSON.stringify(p.name)}, material: ${JSON.stringify(p.material)}, art: ${JSON.stringify(p.art)} },`,
    ),
    '];',
    'export default function CatalogSection() {',
    '  return (',
    `    <section className="catalog-section catalog-feature-asym" id="shop" aria-label="Featured" data-nova-shell="${shell}" data-nova-layout-salt="3">`,
    '      <article className="feature-lead">',
    '        <img className="product-art" src={LEAD.art} alt="" />',
    '        <div><p className="feature-tag">Featured</p><h2>{LEAD.name}</h2><p>{LEAD.material}</p></div>',
    '      </article>',
    '      <div className="feature-side">',
    '        {SIDE.map((p) => (',
    '          <article key={p.id} className="feature-side-card">',
    '            <img className="product-art" src={p.art} alt="" />',
    '            <h3>{p.name}</h3><p>{p.material}</p>',
    '          </article>',
    '        ))}',
    '      </div>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.css'] = [
    '.catalog-feature-asym{display:grid;grid-template-columns:1.4fr 1fr;gap:1.25rem;padding:2rem 8vw 3.5rem;}',
    '@media (max-width:900px){.catalog-feature-asym{grid-template-columns:1fr;}}',
    '.feature-lead{display:grid;gap:1rem;background:#fffdf8;border:1px solid #d4c6b0;border-radius:18px;overflow:hidden;padding:0 0 1.25rem;}',
    '.feature-lead .product-art{width:100%;aspect-ratio:4/5;object-fit:cover;}',
    '.feature-lead h2{margin:0 1.25rem 0.35rem;font-size:1.45rem;}',
    '.feature-lead p{margin:0 1.25rem;color:#5a6475;}',
    '.feature-tag{margin:0 1.25rem 0.35rem;letter-spacing:0.16em;text-transform:uppercase;font-size:0.7rem;color:#6a5a3e;}',
    '.feature-side{display:flex;flex-direction:column;gap:1rem;}',
    '.feature-side-card{background:#fffdf8;border:1px solid #d4c6b0;border-radius:14px;overflow:hidden;padding-bottom:0.85rem;}',
    '.feature-side-card .product-art{width:100%;aspect-ratio:16/10;object-fit:cover;}',
    '.feature-side-card h3{margin:0.75rem 1rem 0.25rem;font-size:1.05rem;}',
    '.feature-side-card p{margin:0 1rem;color:#5a6475;font-size:0.92rem;}',
    '',
  ].join('\n');
  writeStoryFooter(next, brand, shell, 'Why this cut', 3);
}

function writeStrip(
  next: Record<string, string>,
  brand: string,
  shell: AtelierShellId,
): void {
  const short = shortBrand(brand);
  const items = skusFor(brand, 5, 4);
  const heroVisual = atelierLeatherHeroDataUrl({
    name: brand,
    variant: (brandHash(brand) + 3) % 8,
  });
  next['src/sections/NavHeaderSection.jsx'] = [
    "import './NavHeaderSection.css';",
    'export default function NavHeaderSection() {',
    '  return (',
    `    <header className="nav-header nav-dock" role="banner" data-nova-shell="${shell}">`,
    `      <span className="nav-brand">${short}</span>`,
    '      <nav className="nav-dock-links" aria-label="Primary">',
    '        <a href="#hero">Top</a>',
    '        <a href="#shop">Line</a>',
    '        <a href="#contact">Write</a>',
    '      </nav>',
    '    </header>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/NavHeaderSection.css'] = [
    '.nav-header.nav-dock{display:flex;align-items:center;justify-content:space-between;gap:1rem;',
    'padding:0.75rem 6vw;background:#142033;color:#f4efe6;position:sticky;top:0;z-index:20;}',
    '.nav-dock .nav-brand{font-weight:600;letter-spacing:0.06em;}',
    '.nav-dock-links{display:flex;gap:1.25rem;}',
    '.nav-dock-links a{color:#f4efe6;text-decoration:none;font-size:0.9rem;opacity:0.9;}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.jsx'] = [
    "import './HeroSection.css';",
    `const HERO_VISUAL = ${JSON.stringify(heroVisual)};`,
    'export default function HeroSection() {',
    '  return (',
    `    <section className="hero hero-section hero-strip" id="hero" aria-label="Hero" data-nova-shell="${shell}" data-nova-layout-salt="1">`,
    '      <div className="hero-stage" aria-hidden="true"><img className="hero-art" src={HERO_VISUAL} alt="" /></div>',
    '      <div className="hero-copy">',
    `        <h1 className="hero-title">${brand}</h1>`,
    `        <p className="hero-lede">${heroLede(brand, shell)}</p>`,
    '      </div>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.css'] = [
    '.hero-strip{position:relative;min-height:62vh;display:grid;align-items:end;background:#efe6d6;}',
    '.hero-strip .hero-stage{position:absolute;inset:0;}',
    '.hero-strip .hero-art{width:100%;height:100%;object-fit:cover;opacity:0.88;}',
    '.hero-strip .hero-copy{position:relative;z-index:1;padding:3rem 6vw;background:linear-gradient(180deg,transparent,rgba(20,32,51,0.72));color:#f4efe6;}',
    '.hero-strip .hero-title{margin:0 0 0.5rem;font-size:clamp(2rem,4vw,3.2rem);}',
    '.hero-strip .hero-lede{margin:0;max-width:34rem;line-height:1.55;opacity:0.92;}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.jsx'] = [
    "import './CatalogSection.css';",
    'const PIECES = [',
    ...items.map((p) =>
      `  { id: '${p.id}', name: ${JSON.stringify(p.name)}, material: ${JSON.stringify(p.material)}, art: ${JSON.stringify(p.art)} },`,
    ),
    '];',
    'export default function CatalogSection() {',
    '  return (',
    `    <section className="catalog-section catalog-strip" id="shop" aria-label="Line" data-nova-shell="${shell}" data-nova-layout-salt="1">`,
    '      <div className="strip-head"><h2>The line</h2><p>Five forms · scroll sideways</p></div>',
    '      <div className="strip-track">',
    '        {PIECES.map((p) => (',
    '          <article key={p.id} className="strip-card">',
    '            <img className="product-art" src={p.art} alt="" />',
    '            <h3>{p.name}</h3><p>{p.material}</p>',
    '          </article>',
    '        ))}',
    '      </div>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.css'] = [
    '.catalog-strip{padding:2.5rem 0 3rem;background:#f3eee4;}',
    '.strip-head{display:flex;justify-content:space-between;align-items:end;padding:0 6vw 1rem;}',
    '.strip-head h2{margin:0;font-size:1.5rem;}',
    '.strip-head p{margin:0;color:#5a6475;font-size:0.9rem;}',
    '.strip-track{display:flex;gap:1rem;overflow-x:auto;padding:0 6vw 0.5rem;scroll-snap-type:x mandatory;}',
    '.strip-card{flex:0 0 16rem;scroll-snap-align:start;background:#fffdf8;border:1px solid #d4c6b0;border-radius:14px;overflow:hidden;padding-bottom:0.85rem;}',
    '.strip-card .product-art{width:100%;aspect-ratio:4/3;object-fit:cover;}',
    '.strip-card h3{margin:0.75rem 0.9rem 0.25rem;font-size:1rem;}',
    '.strip-card p{margin:0 0.9rem;color:#5a6475;font-size:0.88rem;}',
    '',
  ].join('\n');
  writeStoryFooter(next, brand, shell, 'Along the line', 1);
}

function writeCommission(
  next: Record<string, string>,
  brand: string,
  shell: AtelierShellId,
): void {
  const short = shortBrand(brand);
  const mats = skusFor(brand, 3, 5).map((p) => ({
    name: p.name.replace(short, '').trim() || p.name,
    material: p.material,
  }));
  next['src/sections/NavHeaderSection.jsx'] = [
    "import './NavHeaderSection.css';",
    'export default function NavHeaderSection() {',
    '  return (',
    `    <header className="nav-header nav-minimal" role="banner" data-nova-shell="${shell}">`,
    `      <span className="nav-brand">${brand}</span>`,
    '      <a className="nav-note" href="#contact">Request a fitting</a>',
    '    </header>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/NavHeaderSection.css'] = [
    '.nav-header.nav-minimal{display:flex;align-items:center;justify-content:space-between;padding:1.1rem 8vw;',
    'background:transparent;border-bottom:1px solid #d9cfc0;}',
    '.nav-minimal .nav-brand{font-weight:600;letter-spacing:0.04em;}',
    '.nav-note{color:#142033;text-decoration:none;font-size:0.88rem;border-bottom:1px solid #b08d57;padding-bottom:0.15rem;}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.jsx'] = [
    "import './HeroSection.css';",
    'export default function HeroSection() {',
    '  return (',
    `    <section className="hero hero-section hero-commission" id="hero" aria-label="Hero" data-nova-shell="${shell}" data-nova-layout-salt="2">`,
    '      <div className="hero-rail" aria-hidden="true" />',
    '      <div className="hero-copy">',
    `        <p className="hero-kicker">By appointment</p>`,
    `        <h1 className="hero-title">${short}</h1>`,
    `        <p className="hero-lede">${heroLede(brand, shell)}</p>`,
    '        <a className="hero-cta" href="#contact">Write the bench</a>',
    '      </div>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/HeroSection.css'] = [
    '.hero-commission{min-height:80vh;display:grid;grid-template-columns:8px minmax(0,1fr);background:#faf6ef;}',
    '.hero-commission .hero-rail{background:linear-gradient(180deg,#b08d57,#8b6914);}',
    '.hero-commission .hero-copy{padding:5rem clamp(1.5rem,8vw,5rem);max-width:38rem;}',
    '.hero-commission .hero-kicker{margin:0 0 0.65rem;letter-spacing:0.22em;text-transform:uppercase;font-size:0.72rem;color:#6a5a3e;}',
    '.hero-commission .hero-title{margin:0 0 1rem;font-size:clamp(2.6rem,5.5vw,4.2rem);letter-spacing:-0.035em;}',
    '.hero-commission .hero-lede{margin:0 0 1.75rem;line-height:1.65;color:#3a4558;}',
    '.hero-commission .hero-cta{display:inline-flex;padding:0.85rem 1.35rem;background:#142033;color:#faf6ef;text-decoration:none;border-radius:4px;}',
    '',
  ].join('\n');
  // Materials board — NOT four product-card boxes.
  next['src/sections/CatalogSection.jsx'] = [
    "import './CatalogSection.css';",
    'const MATERIALS = [',
    ...mats.map((m, i) =>
      `  { id: '${i + 1}', name: ${JSON.stringify(m.name)}, material: ${JSON.stringify(m.material)} },`,
    ),
    '];',
    'export default function CatalogSection() {',
    '  return (',
    `    <section className="catalog-section catalog-materials" id="shop" aria-label="Materials" data-nova-shell="${shell}" data-nova-layout-salt="2">`,
    '      <h2 className="catalog-heading">On the table</h2>',
    '      <p className="catalog-lede">Materials we work with — commissions choose from these, not a stamped four-box shelf.</p>',
    '      <ul className="materials-board">',
    '        {MATERIALS.map((m) => (',
    '          <li key={m.id}><strong>{m.name}</strong><span>{m.material}</span></li>',
    '        ))}',
    '      </ul>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/CatalogSection.css'] = [
    '.catalog-materials{padding:3rem 8vw;background:#efe8dc;}',
    '.catalog-materials .catalog-heading{margin:0 0 0.5rem;font-size:clamp(1.5rem,3vw,2rem);}',
    '.catalog-materials .catalog-lede{margin:0 0 1.75rem;max-width:32rem;color:#5a6475;line-height:1.5;}',
    '.materials-board{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:0;}',
    '.materials-board li{display:flex;flex-wrap:wrap;justify-content:space-between;gap:0.75rem 1.5rem;',
    'padding:1rem 0;border-top:1px solid #d4c6b0;}',
    '.materials-board li:last-child{border-bottom:1px solid #d4c6b0;}',
    '.materials-board strong{font-size:1.05rem;}',
    '.materials-board span{color:#5a6475;}',
    '',
  ].join('\n');
  writeStoryFooter(next, brand, shell, 'How a commission runs', 2);
}

function writeStoryFooter(
  next: Record<string, string>,
  brand: string,
  shell: AtelierShellId,
  title: string,
  salt: number,
): void {
  const short = shortBrand(brand);
  const bodies = [
    `${brand} works one hide at a time — edges finished soft, stitches checked, hardware chosen to age with the bag.`,
    `${short} picks skins for character, not uniformity — a scar in the hide becomes part of the piece.`,
    `At ${brand}, brass and thread leave last so the leather can lead.`,
  ];
  const p1 = bodies[brandHash(brand) % bodies.length];
  next['src/sections/StorySection.jsx'] = [
    "import './StorySection.css';",
    'export default function StorySection() {',
    '  return (',
    `    <section className="story-section" id="story" aria-label="Story" data-nova-shell="${shell}" data-nova-layout-salt="${salt}">`,
    '      <div className="story-rail">',
    `        <p className="story-kicker">${short}</p>`,
    `        <h2>${title}</h2>`,
    `        <p>${p1}</p>`,
    '        <p>Hardware is seated by hand. Linings stay quiet under daily wear.</p>',
    '      </div>',
    '    </section>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/StorySection.css'] = [
    '.story-section{padding:3.5rem 8vw;background:#f7f2ea;border-top:1px solid #d9cfc0;color:#1a2433;}',
    '.story-rail{max-width:38rem;}',
    '.story-kicker{margin:0 0 0.55rem;font-size:0.72rem;letter-spacing:0.2em;text-transform:uppercase;color:#6a5a3e;}',
    '.story-section h2{margin:0 0 1rem;font-size:clamp(1.45rem,3vw,1.9rem);}',
    '.story-section p{margin:0 0 0.85rem;line-height:1.7;color:#3a4558;}',
    '',
  ].join('\n');
  const footers = [
    'Commissions by note · Bench visits on request · Ships when ready',
    'Private fittings · Hide samples on request · Ships cured',
    'Write for a commission · Bench open by note · Slow dispatch',
  ];
  const line = footers[(brandHash(brand) + salt) % footers.length];
  next['src/sections/FooterSection.jsx'] = [
    "import './FooterSection.css';",
    'export default function FooterSection() {',
    '  return (',
    `    <footer className="footer-section" id="contact" role="contentinfo" data-nova-shell="${shell}" data-nova-layout-salt="${salt}">`,
    `      <p className="footer-brand">${brand}</p>`,
    `      <p>${line}</p>`,
    '    </footer>',
    '  );',
    '}',
    '',
  ].join('\n');
  next['src/sections/FooterSection.css'] = [
    '.footer-section{padding:2.25rem 8vw;background:#142033;color:#f4efe6;}',
    '.footer-brand{margin:0 0 0.35rem;font-weight:600;}',
    '.footer-section p{margin:0;opacity:0.9;}',
    '',
  ].join('\n');
}

/**
 * Write a full Acc for one structurally unique atelier shell family.
 * Always overwrites nav/hero/catalog/story/footer for that shell.
 */
export function writeAtelierInventShell(
  files: Record<string, string>,
  brand: string,
  shell: AtelierShellId = inventFloorShellId(brand),
): Record<string, string> {
  const next = { ...files };
  writeAppCss(next, shell);
  if (shell === 'lookbook') writeLookbook(next, brand, shell);
  else if (shell === 'rail') writeRail(next, brand, shell);
  else if (shell === 'feature') writeFeature(next, brand, shell);
  else if (shell === 'strip') writeStrip(next, brand, shell);
  else writeCommission(next, brand, shell);
  return next;
}
