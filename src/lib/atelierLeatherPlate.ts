/**
 * Permanent leather-atelier product art — replaces flat toy bag SVGs.
 * Grain + soft light + form-aware silhouettes so invent floor / Live look like
 * catalog plates, not icon stamps.
 */

export type LeatherForm =
  | 'satchel'
  | 'tote'
  | 'sling'
  | 'belt'
  | 'pack'
  | 'folio'
  | 'clutch'
  | 'duffle';

type LeatherTone = {
  face: string;
  flap: string;
  shade: string;
  deep: string;
  brass: string;
  stitch: string;
  ground: string;
  panel: string;
  highlight: string;
};

const TONES: readonly LeatherTone[] = [
  {
    face: '#c4a574',
    flap: '#8b6914',
    shade: '#6e4f24',
    deep: '#2a1c10',
    brass: '#b08d57',
    stitch: '#5a4630',
    ground: '#f3ebe0',
    panel: '#ebe0d0',
    highlight: '#e8d5b5',
  },
  {
    face: '#a8895c',
    flap: '#6e4f24',
    shade: '#4a3420',
    deep: '#1a120c',
    brass: '#9a7340',
    stitch: '#3a2a18',
    ground: '#efe6d6',
    panel: '#e4d8c4',
    highlight: '#dcc9a8',
  },
  {
    face: '#d2b48c',
    flap: '#a07840',
    shade: '#7a5a2e',
    deep: '#24180e',
    brass: '#c4a574',
    stitch: '#5c4830',
    ground: '#f7f1e6',
    panel: '#efe6d6',
    highlight: '#f0e2c8',
  },
  {
    face: '#b8956a',
    flap: '#7a5a2e',
    shade: '#5a4020',
    deep: '#1e140c',
    brass: '#a8895c',
    stitch: '#4a3420',
    ground: '#f0e8da',
    panel: '#e8dcc8',
    highlight: '#e2d0b0',
  },
  {
    face: '#8b6914',
    flap: '#5a4020',
    shade: '#3a2a18',
    deep: '#140e08',
    brass: '#b08d57',
    stitch: '#2a1c10',
    ground: '#ebe4d6',
    panel: '#ddd2c0',
    highlight: '#c4a574',
  },
  {
    face: '#6e4f24',
    flap: '#3a2a18',
    shade: '#24180e',
    deep: '#0e0a06',
    brass: '#9a7340',
    stitch: '#1a120c',
    ground: '#e8e0d2',
    panel: '#d8cebc',
    highlight: '#a8895c',
  },
] as const;

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function leatherToneFor(seed: string, idx = 0): LeatherTone {
  const h = hashSeed(`${seed}|${idx}`);
  return TONES[h % TONES.length];
}

export function leatherFormFromName(name: string, idx = 0): LeatherForm {
  const t = String(name || '').toLowerCase();
  if (/\b(?:belt|hip|waist)\b/.test(t)) return 'belt';
  if (/\b(?:sling|crossbody|messenger)\b/.test(t)) return 'sling';
  if (/\b(?:tote|shopper|market|harbor)\b/.test(t)) return 'tote';
  if (/\b(?:pack|daypack|rucksack|backpack)\b/.test(t)) return 'pack';
  if (/\b(?:folio|brief|ledger|portfolio|envelope)\b/.test(t)) return 'folio';
  if (/\b(?:clutch|pouch|kit|sleeve|case|coin)\b/.test(t)) return 'clutch';
  if (/\b(?:duffle|hold|week|overnight|cabin|drum)\b/.test(t)) return 'duffle';
  if (/\b(?:satchel|courier|studio)\b/.test(t)) return 'satchel';
  const forms: LeatherForm[] = [
    'satchel', 'tote', 'sling', 'belt', 'pack', 'folio', 'clutch', 'duffle',
  ];
  return forms[(hashSeed(t) + idx) % forms.length];
}

function defsBlock(uid: string, tone: LeatherTone): string {
  return `<defs>
<linearGradient id="${uid}-skin" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0%" stop-color="${tone.highlight}"/>
  <stop offset="38%" stop-color="${tone.face}"/>
  <stop offset="100%" stop-color="${tone.shade}"/>
</linearGradient>
<linearGradient id="${uid}-flap" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0%" stop-color="${tone.flap}"/>
  <stop offset="100%" stop-color="${tone.shade}"/>
</linearGradient>
<radialGradient id="${uid}-glow" cx="42%" cy="32%" r="55%">
  <stop offset="0%" stop-color="#fff8ec" stop-opacity="0.55"/>
  <stop offset="55%" stop-color="${tone.face}" stop-opacity="0.08"/>
  <stop offset="100%" stop-color="${tone.deep}" stop-opacity="0"/>
</radialGradient>
<filter id="${uid}-grain" x="-20%" y="-20%" width="140%" height="140%">
  <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch" result="n"/>
  <feColorMatrix type="matrix" values="0 0 0 0 0.35  0 0 0 0 0.22  0 0 0 0 0.12  0 0 0 0.22 0" in="n" result="g"/>
  <feBlend in="SourceGraphic" in2="g" mode="multiply"/>
</filter>
<filter id="${uid}-soft" x="-15%" y="-15%" width="130%" height="130%">
  <feGaussianBlur stdDeviation="1.1" result="b"/>
  <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter>
</defs>`;
}

/** Product silhouette centered in a 320×240 card. */
function formBody(form: LeatherForm, uid: string, tone: LeatherTone): string {
  const shadow = `<ellipse cx="160" cy="208" rx="78" ry="11" fill="${tone.deep}" opacity="0.28"/>`;
  const stitch = (d: string) =>
    `<path d="${d}" fill="none" stroke="${tone.stitch}" stroke-width="1.1" stroke-dasharray="2.2 2.8" opacity="0.55"/>`;
  const brass = (x: number, y: number, r = 5) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${tone.brass}"/><circle cx="${x - 1}" cy="${y - 1}" r="${Math.max(1.5, r * 0.35)}" fill="#f0e2c4" opacity="0.55"/>`;

  switch (form) {
    case 'tote':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M78 78 L100 48 L220 48 L242 78 L228 198 Q160 218 92 198 Z" fill="url(#${uid}-skin)"/>
  <path d="M100 48 L112 28 L208 28 L220 48" fill="url(#${uid}-flap)"/>
  <path d="M118 48 Q160 72 202 48" fill="none" stroke="${tone.shade}" stroke-width="7" stroke-linecap="round"/>
  ${stitch('M108 90 L212 90')}
  ${brass(160, 118, 6)}
</g>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-glow)" style="mix-blend-mode:soft-light" pointer-events="none"/>`;
    case 'sling':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M96 70 Q160 28 224 70 L214 188 Q160 212 106 188 Z" fill="url(#${uid}-skin)"/>
  <path d="M108 68 Q160 48 212 68" fill="none" stroke="${tone.flap}" stroke-width="14" stroke-linecap="round"/>
  <path d="M150 78 L170 78 L176 168 L144 168 Z" fill="${tone.shade}" opacity="0.35"/>
  ${stitch('M120 110 Q160 122 200 110')}
  ${brass(160, 128, 5)}
</g>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-glow)" style="mix-blend-mode:soft-light" pointer-events="none"/>`;
    case 'belt':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M70 108 L250 108 L242 168 L78 168 Z" fill="url(#${uid}-skin)" rx="10"/>
  <rect x="70" y="108" width="180" height="60" rx="12" fill="url(#${uid}-skin)"/>
  <rect x="88" y="98" width="52" height="18" rx="4" fill="url(#${uid}-flap)"/>
  ${stitch('M100 128 L230 128')}
  <rect x="214" y="118" width="28" height="40" rx="4" fill="${tone.brass}"/>
  <rect x="220" y="124" width="16" height="28" rx="2" fill="${tone.deep}" opacity="0.35"/>
</g>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-glow)" style="mix-blend-mode:soft-light" pointer-events="none"/>`;
    case 'pack':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M92 86 L160 42 L228 86 L218 198 Q160 220 102 198 Z" fill="url(#${uid}-skin)"/>
  <path d="M112 86 L160 58 L208 86" fill="url(#${uid}-flap)"/>
  <path d="M118 120 L202 120 L198 178 L122 178 Z" fill="${tone.shade}" opacity="0.25"/>
  ${stitch('M124 100 L196 100')}
  ${brass(160, 140, 6)}
  <path d="M102 100 Q88 140 104 178" fill="none" stroke="${tone.flap}" stroke-width="8" stroke-linecap="round" opacity="0.7"/>
  <path d="M218 100 Q232 140 216 178" fill="none" stroke="${tone.flap}" stroke-width="8" stroke-linecap="round" opacity="0.7"/>
</g>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-glow)" style="mix-blend-mode:soft-light" pointer-events="none"/>`;
    case 'folio':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <rect x="78" y="62" width="164" height="132" rx="10" fill="url(#${uid}-skin)"/>
  <path d="M78 62 L160 92 L242 62" fill="url(#${uid}-flap)"/>
  <line x1="160" y1="62" x2="160" y2="194" stroke="${tone.shade}" stroke-width="2" opacity="0.35"/>
  ${stitch('M96 120 L224 120')}
  <rect x="148" y="128" width="24" height="10" rx="2" fill="${tone.brass}"/>
</g>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-glow)" style="mix-blend-mode:soft-light" pointer-events="none"/>`;
    case 'clutch':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M88 100 Q160 70 232 100 L220 168 Q160 188 100 168 Z" fill="url(#${uid}-skin)"/>
  <path d="M100 100 Q160 84 220 100" fill="url(#${uid}-flap)"/>
  ${stitch('M112 128 L208 128')}
  ${brass(160, 136, 4)}
</g>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-glow)" style="mix-blend-mode:soft-light" pointer-events="none"/>`;
    case 'duffle':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <ellipse cx="160" cy="150" rx="108" ry="52" fill="url(#${uid}-skin)"/>
  <path d="M70 140 Q160 88 250 140 Q250 160 160 168 Q70 160 70 140" fill="url(#${uid}-flap)"/>
  <path d="M120 92 Q160 70 200 92" fill="none" stroke="${tone.shade}" stroke-width="10" stroke-linecap="round"/>
  ${stitch('M90 150 Q160 166 230 150')}
  ${brass(160, 132, 5)}
</g>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-glow)" style="mix-blend-mode:soft-light" pointer-events="none"/>`;
    case 'satchel':
    default:
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M72 92 L98 58 L222 58 L248 92 L232 198 Q160 222 88 198 Z" fill="url(#${uid}-skin)"/>
  <path d="M98 58 L110 36 L210 36 L222 58" fill="url(#${uid}-flap)"/>
  <rect x="128" y="108" width="64" height="16" rx="5" fill="${tone.brass}"/>
  <circle cx="160" cy="116" r="3.5" fill="${tone.deep}"/>
  ${stitch('M110 96 L210 96')}
</g>
<rect x="0" y="0" width="320" height="240" fill="url(#${uid}-glow)" style="mix-blend-mode:soft-light" pointer-events="none"/>`;
  }
}

/** Hero-scale body in 1600×900 viewBox. */
function heroFormBody(form: LeatherForm, uid: string, tone: LeatherTone): string {
  const shadow = `<ellipse cx="800" cy="700" rx="260" ry="36" fill="${tone.deep}" opacity="0.36"/>`;
  const stitch = (d: string) =>
    `<path d="${d}" fill="none" stroke="${tone.stitch}" stroke-width="2.2" stroke-dasharray="4 5" opacity="0.5"/>`;
  const brass = (x: number, y: number, r = 10) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${tone.brass}"/><circle cx="${x - 2}" cy="${y - 2}" r="${r * 0.35}" fill="#f0e2c4" opacity="0.55"/>`;

  switch (form) {
    case 'tote':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M480 340 L560 220 L1040 220 L1120 340 L1060 640 Q800 720 520 640 Z" fill="url(#${uid}-skin)"/>
  <path d="M560 220 L600 160 L1000 160 L1040 220" fill="url(#${uid}-flap)"/>
  <path d="M640 220 Q800 300 960 220" fill="none" stroke="${tone.shade}" stroke-width="22" stroke-linecap="round"/>
  ${stitch('M600 380 L1000 380')}
  ${brass(800, 460, 12)}
</g>`;
    case 'sling':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M560 280 Q800 160 1040 280 L1000 620 Q800 700 600 620 Z" fill="url(#${uid}-skin)"/>
  <path d="M600 270 Q800 200 1000 270" fill="none" stroke="${tone.flap}" stroke-width="36" stroke-linecap="round"/>
  ${stitch('M640 400 Q800 430 960 400')}
  ${brass(800, 460, 11)}
</g>`;
    case 'pack':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M540 300 L800 180 L1060 300 L1020 640 Q800 720 560 640 Z" fill="url(#${uid}-skin)"/>
  <path d="M620 300 L800 210 L980 300" fill="url(#${uid}-flap)"/>
  ${stitch('M640 360 L960 360')}
  ${brass(800, 480, 12)}
  <path d="M560 340 Q500 460 560 600" fill="none" stroke="${tone.flap}" stroke-width="20" stroke-linecap="round" opacity="0.75"/>
  <path d="M1040 340 Q1100 460 1040 600" fill="none" stroke="${tone.flap}" stroke-width="20" stroke-linecap="round" opacity="0.75"/>
</g>`;
    case 'duffle':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <ellipse cx="800" cy="480" rx="320" ry="160" fill="url(#${uid}-skin)"/>
  <path d="M500 450 Q800 300 1100 450 Q1100 510 800 540 Q500 510 500 450" fill="url(#${uid}-flap)"/>
  <path d="M660 300 Q800 240 940 300" fill="none" stroke="${tone.shade}" stroke-width="28" stroke-linecap="round"/>
  ${stitch('M540 480 Q800 530 1060 480')}
  ${brass(800, 430, 11)}
</g>`;
    case 'folio':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <rect x="520" y="240" width="560" height="420" rx="28" fill="url(#${uid}-skin)"/>
  <path d="M520 240 L800 340 L1080 240" fill="url(#${uid}-flap)"/>
  <line x1="800" y1="240" x2="800" y2="660" stroke="${tone.shade}" stroke-width="3" opacity="0.35"/>
  ${stitch('M580 420 L1020 420')}
  <rect x="770" y="460" width="60" height="22" rx="4" fill="${tone.brass}"/>
</g>`;
    case 'belt':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <rect x="420" y="380" width="760" height="160" rx="28" fill="url(#${uid}-skin)"/>
  <rect x="480" y="350" width="160" height="48" rx="10" fill="url(#${uid}-flap)"/>
  ${stitch('M500 460 L1080 460')}
  <rect x="1080" y="400" width="72" height="120" rx="10" fill="${tone.brass}"/>
</g>`;
    case 'clutch':
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M520 360 Q800 260 1080 360 L1020 580 Q800 640 580 580 Z" fill="url(#${uid}-skin)"/>
  <path d="M560 360 Q800 300 1040 360" fill="url(#${uid}-flap)"/>
  ${stitch('M600 440 L1000 440')}
  ${brass(800, 470, 9)}
</g>`;
    case 'satchel':
    default:
      return `${shadow}
<g filter="url(#${uid}-grain)">
  <path d="M520 340 L600 240 L1000 240 L1080 340 L1020 640 Q800 720 580 640 Z" fill="url(#${uid}-skin)"/>
  <path d="M600 240 L640 180 L960 180 L1000 240" fill="url(#${uid}-flap)"/>
  <rect x="720" y="380" width="160" height="28" rx="8" fill="${tone.brass}"/>
  <circle cx="800" cy="394" r="7" fill="${tone.deep}"/>
  ${stitch('M640 320 L960 320')}
</g>`;
  }
}

export function atelierLeatherPlateDataUrl(
  name: string,
  material = '',
  idx = 0,
): string {
  const tone = leatherToneFor(`${name}|${material}`, idx);
  const form = leatherFormFromName(name, idx);
  const uid = `p${(hashSeed(`${name}|${idx}`) % 1e6).toString(36)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240" viewBox="0 0 320 240" data-nova-atelier-plate="v2" data-form="${form}">
${defsBlock(uid, tone)}
<rect width="320" height="240" fill="${tone.ground}"/>
<rect x="10" y="10" width="300" height="220" rx="16" fill="${tone.panel}" stroke="#d4c6b0" stroke-width="1"/>
${formBody(form, uid, tone)}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function atelierLeatherHeroDataUrl(opts: {
  name: string;
  brief?: string;
  variant?: number;
}): string {
  const name = String(opts.name || 'Atelier');
  const brief = String(opts.brief || '');
  const forced = /\bbag-variant-([0-3])\b/i.exec(brief);
  const variant = forced
    ? Number(forced[1]) % 4
    : (typeof opts.variant === 'number' ? opts.variant : hashSeed(name) % 8);
  const forms: LeatherForm[] = [
    'satchel', 'tote', 'sling', 'pack', 'duffle', 'folio', 'clutch', 'belt',
  ];
  const form = forms[Math.abs(variant) % forms.length];
  const tone = leatherToneFor(`${name}|hero|${form}`, variant);
  const uid = `h${(hashSeed(`${name}|${form}`) % 1e6).toString(36)}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900" data-nova-atelier-plate="v2" data-form="${form}">
${defsBlock(uid, tone)}
<rect width="1600" height="900" fill="${tone.ground}"/>
<rect width="1600" height="900" fill="url(#${uid}-glow)"/>
${heroFormBody(form, uid, tone)}
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** True when Acc art is the permanent v2 leather plate (not flat toy paths). */
export function hasAtelierLeatherPlateArt(blob: string): boolean {
  const s = String(blob || '');
  // Raw SVG or percent-encoded data-URL (encodeURIComponent turns = and " into %3D / %22).
  return /data-nova-atelier-plate[=:]["']?v2|data-nova-atelier-plate%3D(?:%22)?v2/i.test(s)
    || (/feTurbulence/i.test(s) && /data-form(?:=|%3D)/i.test(s));
}
