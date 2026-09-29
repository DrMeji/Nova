/**
 * Sequential multi-model create ensemble — free local GGUFs work as one team.
 * One model at a time: plan → spec → design → copy → craft → (tokens) → verify → critic.
 */

import { isCoderEngineId, rankedReadyCoderIds, rankedReadyEngineIds } from '@/lib/enginePick';
import { getActiveBrainId } from '@/lib/brainRoles';
import {
  buildProductSpec,
  cssTokensFromContract,
  defaultCopyPack,
  genreFloor,
  mergeCopyPack,
  mergeLayoutContract,
  parseJsonObject,
  type CopyPack,
  type LayoutContract,
  type ProductSpec,
} from '@/lib/createLayoutContract';
import { isUiDesignEngineId, rankedReadyDesignIds } from '@/lib/enginePick';

type EngineRow = { id?: string; status?: string; name?: string };

export type EnsembleRole =
  | 'plan'
  | 'spec'
  | 'design'
  | 'copy'
  | 'craft'
  | 'style'
  | 'media'
  | 'critic'
  | 'verify';

export type EnsembleMember = {
  role: EnsembleRole;
  id: string;
  name: string;
  source: 'local' | 'cloud' | 'auto';
};

export type CreateEnsembleTeam = {
  multiHop: boolean;
  members: EnsembleMember[];
  attribution: string;
};

function rowName(models: EngineRow[] | undefined, id: string): string {
  const hit = (models || []).find((m) => m.id === id);
  return String(hit?.name || id);
}

/**
 * Build a sequential team from ready engines + role prefs.
 * Default: single-coder only (multiHop false). Multi-hop only when opts.allowMultiHop.
 * Vision / mmproj never fills plan, copy, design, craft, or style.
 */
export function resolveCreateEnsembleTeam(
  models: EngineRow[] | undefined,
  opts?: {
    ramGb?: number;
    maxCoderParamsB?: number | null;
    craftId?: string | null;
    /** Explicit opt-in — default create is coder-only. */
    allowMultiHop?: boolean;
  },
): CreateEnsembleTeam {
  const ram = opts?.ramGb ?? 8;
  const maxB = opts?.maxCoderParamsB ?? null;
  const allowMultiHop = Boolean(opts?.allowMultiHop);
  const coders = rankedReadyCoderIds(models, ram, maxB);
  const chats = rankedReadyEngineIds(models, 'chat', ram, maxB)
    .filter((id) => !/\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl)\b/i.test(id));
  const designs = rankedReadyDesignIds(models, ram, maxB)
    .filter((id) => !/\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl)\b/i.test(id));

  const craftPref = String(opts?.craftId || getActiveBrainId('coder') || '').trim();
  const craftId = (craftPref && craftPref !== 'NOVA-auto' && coders.includes(craftPref))
    ? craftPref
    : (coders[0] || '');
  const chatPref = String(getActiveBrainId('chat') || '').trim();
  const planId = allowMultiHop
    ? ((chatPref && chatPref !== 'NOVA-auto' && chats.includes(chatPref))
      ? chatPref
      : (chats.find((id) => id !== craftId) || chats[0] || ''))
    : '';

  const designPref = String(getActiveBrainId('design') || '').trim();
  const designId = allowMultiHop
    ? ((designPref && designPref !== 'NOVA-auto' && (designs.includes(designPref) || chats.includes(designPref)))
      ? designPref
      : (designs.find((id) => id !== craftId) || planId || ''))
    : '';

  // Copy is instruct/chat only — never vision, never design-as-VL.
  const copyId = allowMultiHop
    ? (planId || (designId && !/\b(?:vl|vision|mmproj)\b/i.test(designId) ? designId : '') || '')
    : '';
  const styleId = allowMultiHop ? (designId || craftId) : craftId;
  // Verify reviews App/CSS like a craft pass — always the best coder, never chat Instruct.
  const verifyId = craftId || planId;
  // Critic/vision only when multi-hop AND only for optional screenshot critique — never Copy.
  const criticId = '';

  const members: EnsembleMember[] = [];
  const push = (role: EnsembleRole, id: string) => {
    if (!id) return;
    if (/\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl)\b/i.test(id)
      && role !== 'critic') {
      return;
    }
    members.push({ role, id, name: rowName(models, id), source: 'local' });
  };
  if (allowMultiHop) {
    push('plan', planId);
    push('spec', planId);
    push('design', designId);
    push('copy', copyId);
  }
  push('craft', craftId);
  if (allowMultiHop && styleId && styleId !== craftId) push('style', styleId);
  push('verify', verifyId);
  if (allowMultiHop && criticId) push('critic', criticId);

  const distinct = new Set(members.map((m) => m.id));
  const multiHop = allowMultiHop && distinct.size >= 2 && Boolean(craftId);

  const attribution = members.length
    ? (multiHop
      ? members.map((m) => `${m.role}: ${m.name}`).join(' → ')
      : `craft: ${rowName(models, craftId) || 'coder'}`)
    : 'single coder';

  return { multiHop, members, attribution };
}

export function assertSequentialEnsembleOk(team: CreateEnsembleTeam): { ok: boolean; reason?: string } {
  if (!team.members.some((m) => m.role === 'craft' && isCoderEngineId(m.id))) {
    return { ok: false, reason: 'No ready coder for craft phase' };
  }
  return { ok: true };
}

export function ensembleMember(
  team: CreateEnsembleTeam,
  role: EnsembleRole,
): EnsembleMember | null {
  return team.members.find((m) => m.role === role) || null;
}

async function routeWithTimeout(
  opts: {
    message: string;
    kind: 'chat' | 'coding';
    modelId: string;
    modelName: string;
    timeoutMs: number;
  },
): Promise<{ reply: string; modelName: string }> {
  const { arkRoute } = await import('@/lib/novaRouter');
  const routed = await Promise.race([
    arkRoute({
      message: opts.message,
      kind: opts.kind,
      preferCloudCoding: false,
      preferredModelId: opts.modelId,
      preferredModelName: opts.modelName,
      preferredSource: 'local',
      stickyModelId: undefined,
      stickyModelName: undefined,
    }),
    new Promise<{ reply: string; modelName?: string }>((resolve) => {
      window.setTimeout(() => resolve({ reply: '', modelName: opts.modelName }), opts.timeoutMs);
    }),
  ]);
  return {
    reply: String(routed.reply || ''),
    modelName: opts.modelName || routed.modelName || '',
  };
}

export async function runCreatePlanHop(opts: {
  brief: string;
  productName: string;
  modelId: string;
  modelName: string;
  shouldAbort?: () => boolean;
}): Promise<{ text: string; modelName: string }> {
  if (opts.shouldAbort?.()) return { text: '', modelName: opts.modelName };
  const prompt = [
    `You are the PLANNING brain for a Nova create build of **${opts.productName}**.`,
    'Output a tight build checklist ONLY — no code, no markdown fences.',
    'List 8–14 concrete must-haves for a PREMIUM product (layout, hero, motion, CTAs, footer).',
    'Each line starts with "- ". Keep under 400 words.',
    '',
    'Brief:',
    String(opts.brief || '').slice(0, 4000),
  ].join('\n');
  const routed = await routeWithTimeout({
    message: prompt,
    kind: 'chat',
    modelId: opts.modelId,
    modelName: opts.modelName,
    timeoutMs: 90_000,
  });
  const text = routed.reply
    .replace(/```[\s\S]*?```/g, '')
    .replace(/@@@FILE[\s\S]*$/gi, '')
    .trim()
    .slice(0, 3500);
  return { text, modelName: routed.modelName };
}

/** Spec hop — locked ProductSpec JSON. */
export async function runCreateSpecHop(opts: {
  brief: string;
  productName: string;
  modelId: string;
  modelName: string;
  shouldAbort?: () => boolean;
}): Promise<{ spec: ProductSpec; modelName: string }> {
  const fallback = buildProductSpec({ brief: opts.brief, productName: opts.productName });
  if (opts.shouldAbort?.()) return { spec: fallback, modelName: opts.modelName };
  const prompt = [
    `You are the SPEC brain for **${opts.productName}**.`,
    'Emit ONLY a JSON object (no prose) with keys:',
    'productName, genre, audience, pageMap (string[]), mustHave (string[]), mustNot (string[]), referenceBar, kind.',
    'genre must be one of: product-homepage, cafe-local, saas-landing, arcade-game, utility-tool, desktop-app, cli-tool, python-app, generic-web',
    'kind must be one of: web, desktop, cli, game, python',
    'Lock the product — no drifting brand names.',
    '',
    'Brief:',
    String(opts.brief || '').slice(0, 3500),
  ].join('\n');
  const routed = await routeWithTimeout({
    message: prompt,
    kind: 'chat',
    modelId: opts.modelId,
    modelName: opts.modelName,
    timeoutMs: 75_000,
  });
  const parsed = parseJsonObject(routed.reply);
  const spec = buildProductSpec({
    brief: opts.brief,
    productName: opts.productName,
    partial: parsed as Partial<ProductSpec> | null,
  });
  return { spec, modelName: routed.modelName };
}

/** Design hop — LayoutContract JSON on top of genre floor. */
export async function runCreateDesignHop(opts: {
  brief: string;
  productName: string;
  spec: ProductSpec;
  modelId: string;
  modelName: string;
  shouldAbort?: () => boolean;
}): Promise<{ contract: LayoutContract; modelName: string }> {
  const floor = genreFloor(opts.spec.genre);
  if (opts.shouldAbort?.()) return { contract: floor, modelName: opts.modelName };
  const prompt = [
    `You are the DESIGN brain for **${opts.productName}** (${opts.spec.genre}).`,
    'Emit ONLY a JSON LayoutContract. Do NOT emit CSS or JSX.',
    'Keys: composition, hero { fullBleed, media, overlaysForbidden }, sections[], typography, palette { bg, ink, accent, muted }, motion[], forbid[].',
    `Start from this genre floor and refine palette/type/sections only:`,
    JSON.stringify(floor),
    '',
    'Reference bar:',
    opts.spec.referenceBar,
    '',
    'Must have:',
    opts.spec.mustHave.map((m) => `- ${m}`).join('\n'),
    '',
    'Must NOT:',
    opts.spec.mustNot.map((m) => `- ${m}`).join('\n'),
    '',
    'Brief:',
    String(opts.brief || '').slice(0, 2500),
  ].join('\n');
  const routed = await routeWithTimeout({
    message: prompt,
    kind: 'chat',
    modelId: opts.modelId,
    modelName: opts.modelName,
    timeoutMs: 90_000,
  });
  const parsed = parseJsonObject(routed.reply) as Partial<LayoutContract> | null;
  const { applyLayoutReference } = await import('@/lib/createLayoutContract');
  return {
    contract: applyLayoutReference(opts.brief, mergeLayoutContract(floor, parsed)),
    modelName: routed.modelName,
  };
}

/** Copy hop — CopyPack JSON. */
export async function runCreateCopyHop(opts: {
  brief: string;
  productName: string;
  spec: ProductSpec;
  contract: LayoutContract;
  modelId: string;
  modelName: string;
  shouldAbort?: () => boolean;
}): Promise<{ copy: CopyPack; modelName: string }> {
  const base = defaultCopyPack(opts.spec, opts.contract);
  if (opts.shouldAbort?.()) return { copy: base, modelName: opts.modelName };
  const prompt = [
    `You are the COPY brain for **${opts.productName}**.`,
    'Emit ONLY JSON: { brand, headline, support, ctas: string[], sections: { [id]: { title, body } } }.',
    'Real brand voice. Ban: lorem, Sample, placeholder, truncated words.',
    'Section ids to fill:',
    opts.contract.sections.map((s) => s.id).join(', '),
    '',
    'Audience:',
    opts.spec.audience,
    '',
    'Brief:',
    String(opts.brief || '').slice(0, 2000),
  ].join('\n');
  const routed = await routeWithTimeout({
    message: prompt,
    kind: 'chat',
    modelId: opts.modelId,
    modelName: opts.modelName,
    timeoutMs: 75_000,
  });
  const parsed = parseJsonObject(routed.reply) as Partial<CopyPack> | null;
  return { copy: mergeCopyPack(base, parsed), modelName: routed.modelName };
}

export async function runCreateVerifyHop(opts: {
  brief: string;
  productName: string;
  appSource: string;
  cssSource: string;
  modelId: string;
  modelName: string;
  contract?: LayoutContract | null;
  shouldAbort?: () => boolean;
}): Promise<{ issues: string[]; modelName: string }> {
  if (opts.shouldAbort?.()) return { issues: [], modelName: opts.modelName };
  const prompt = [
    `You are the VERIFY brain for **${opts.productName}**.`,
    'Compare App + CSS to the brief and LayoutContract. List ONLY real gaps as "- issue" lines.',
    'If premium and complete, reply exactly: OK',
    'Fail on: absolute icon-rail/brand-rail, card-grid-as-hero, low contrast, cream AI look, missing full-bleed when contracted, truncated copy.',
    'No code. No praise.',
    '',
    opts.contract ? `LayoutContract:\n${JSON.stringify(opts.contract).slice(0, 1500)}` : '',
    '',
    'Brief:',
    String(opts.brief || '').slice(0, 2000),
    '',
    'App.jsx (excerpt):',
    String(opts.appSource || '').slice(0, 4000),
    '',
    'App.css (excerpt):',
    String(opts.cssSource || '').slice(0, 2000),
  ].filter(Boolean).join('\n');
  const routed = await routeWithTimeout({
    message: prompt,
    kind: 'coding',
    modelId: opts.modelId,
    modelName: opts.modelName,
    timeoutMs: 75_000,
  });
  const raw = routed.reply.trim();
  if (/^ok\b/i.test(raw) || (/\blooks?\s+(?:good|premium|complete|ready)\b/i.test(raw) && !/^- /m.test(raw))) {
    return { issues: [], modelName: routed.modelName };
  }
  const issues = raw
    .split(/\n+/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
    .filter((l) => l.length > 8 && l.length < 200 && !/^ok\b/i.test(l) && !/^@@@/i.test(l) && !/^```/.test(l))
    .slice(0, 10);
  return { issues, modelName: routed.modelName };
}

/**
 * Critic hop — grades Live screenshot (or source) against contract.
 * When screenshotDataUrl is set, prefers vision; otherwise text critique.
 */
export async function runCreateCriticHop(opts: {
  brief: string;
  productName: string;
  contract: LayoutContract;
  appSource: string;
  cssSource: string;
  modelId: string;
  modelName: string;
  screenshotDataUrl?: string | null;
  shouldAbort?: () => boolean;
}): Promise<{ pass: boolean; issues: string[]; modelName: string }> {
  if (opts.shouldAbort?.()) return { pass: true, issues: [], modelName: opts.modelName };
  const { arkRoute } = await import('@/lib/novaRouter');
  const hasShot = Boolean(opts.screenshotDataUrl && opts.screenshotDataUrl.startsWith('data:'));
  const prompt = [
    `You are the CRITIC brain for **${opts.productName}**.`,
    hasShot
      ? 'Look at the attached Live screenshot. Grade against the LayoutContract.'
      : 'No screenshot — grade App/CSS source against the LayoutContract as if reviewing Live.',
    'Reply OK if it matches. Else list "- issue" lines (max 8).',
    'Fail: overlapping rails, cut-off brand, card-grid-as-hero, mute low-contrast cards, cream AI look, missing full-bleed bands.',
    '',
    `Contract: ${JSON.stringify(opts.contract).slice(0, 1200)}`,
    '',
    'Brief:',
    String(opts.brief || '').slice(0, 1200),
    !hasShot ? `\nApp excerpt:\n${String(opts.appSource || '').slice(0, 2500)}` : '',
    !hasShot ? `\nCSS excerpt:\n${String(opts.cssSource || '').slice(0, 1200)}` : '',
  ].filter(Boolean).join('\n');

  try {
    const routed = await Promise.race([
      arkRoute({
        message: prompt,
        kind: 'chat',
        preferCloudCoding: false,
        preferredModelId: opts.modelId,
        preferredModelName: opts.modelName,
        preferredSource: 'local',
        stickyModelId: undefined,
        stickyModelName: undefined,
        referenceImageDataUrl: hasShot ? opts.screenshotDataUrl! : undefined,
      }),
      new Promise<{ reply: string; modelName?: string }>((resolve) => {
        window.setTimeout(() => resolve({ reply: 'OK', modelName: opts.modelName }), 90_000);
      }),
    ]);
    const raw = String(routed.reply || '').trim();
    if (/^ok\b/i.test(raw) && !/^- /m.test(raw)) {
      return { pass: true, issues: [], modelName: opts.modelName || routed.modelName || '' };
    }
    const issues = raw
      .split(/\n+/)
      .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
      .filter((l) => l.length > 8 && l.length < 200 && !/^ok\b/i.test(l))
      .slice(0, 8);
    return {
      pass: issues.length === 0,
      issues,
      modelName: opts.modelName || routed.modelName || '',
    };
  } catch {
    return { pass: true, issues: [], modelName: opts.modelName };
  }
}

/**
 * Token style hop — inject contract CSS variables (no cream-bias rewrite).
 * Optionally asks design/craft to flesh CSS when still splash-thin, constrained by contract.
 */
export async function runCreateStyleHop(opts: {
  brief: string;
  productName: string;
  appSource: string;
  cssSource: string;
  modelId: string;
  modelName: string;
  contract?: LayoutContract | null;
  shouldAbort?: () => boolean;
}): Promise<{ css: string; modelName: string }> {
  if (opts.shouldAbort?.()) return { css: opts.cssSource, modelName: opts.modelName };
  const contract = opts.contract || genreFloor(buildProductSpec({
    brief: opts.brief,
    productName: opts.productName,
  }).genre);
  const tokens = cssTokensFromContract(contract);
  let css = String(opts.cssSource || '');
  if (!/NOVA layout contract tokens/.test(css)) {
    css = `${tokens}\n${css}`;
  }
  const cssThin = css.replace(/\s+/g, '').length < 900
    || (/#0f1419/.test(css) && css.length < 1200);
  if (!cssThin) {
    return { css, modelName: opts.modelName };
  }

  const prompt = [
    `You are the STYLE brain for **${opts.productName}**.`,
    'Emit ONLY @@@FILE src/App.css with a COMPLETE stylesheet that implements the LayoutContract tokens.',
    `Palette: bg=${contract.palette.bg} ink=${contract.palette.ink} accent=${contract.palette.accent}.`,
    `Composition: ${contract.composition}. Hero fullBleed=${contract.hero.fullBleed}.`,
    'FORBIDDEN: cream/soft off-white bias unless palette.bg is cream; absolute icon-rail; purple-on-white AI look.',
    'Match classNames already in App. Include @keyframes if contract.motion is non-empty.',
    'No App.jsx. No prose outside the @@@FILE block.',
    '',
    `Contract forbid: ${contract.forbid.join(', ')}`,
    '',
    'Current App (classNames):',
    String(opts.appSource || '').slice(0, 3000),
    '',
    'Seed tokens (keep these :root vars):',
    tokens,
  ].join('\n');

  const routed = await routeWithTimeout({
    message: prompt,
    kind: 'coding',
    modelId: opts.modelId,
    modelName: opts.modelName,
    timeoutMs: 420_000,
  });
  const reply = routed.reply;
  const m = reply.match(/@@@FILE\s+src\/App\.css\s*\n([\s\S]*?)(?=\n@@@FILE\b|$)/i);
  let next = m ? m[1].trim() : '';
  if (!next && /\{[\s\S]*\}/.test(reply)) {
    next = reply.replace(/```(?:css)?/gi, '').replace(/@@@FILE[^\n]*/gi, '').trim();
  }
  if (next.length < 600 || (/#0f1419/.test(next) && next.length < 900)) {
    return { css, modelName: routed.modelName };
  }
  if (!/NOVA layout contract tokens|:root\s*\{[^}]*--bg/i.test(next)) {
    next = `${tokens}\n${next}`;
  }
  const lastBrace = next.lastIndexOf('}');
  if (lastBrace > 40 && /This implementation|The page is designed/i.test(next.slice(lastBrace + 1))) {
    next = `${next.slice(0, lastBrace + 1).trim()}\n`;
  }
  if (contract.motion.length && !/@keyframes/i.test(next)) {
    next += `

@keyframes contractReveal {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
.hero, .product-band, main section {
  animation: contractReveal 0.7s ease both;
}
`;
  }
  return { css: next, modelName: routed.modelName };
}

/** Premium craft rules — contract-aware when provided. */
export function premiumWebCraftRules(brief: string, contract?: LayoutContract | null): string[] {
  const t = String(brief || '');
  if (contract) {
    return [
      `LAYOUT CONTRACT (${contract.genre} / ${contract.composition}):`,
      `- Hero fullBleed=${contract.hero.fullBleed}; media=${contract.hero.media}; overlaysForbidden=${contract.hero.overlaysForbidden}.`,
      `- Sections: ${contract.sections.map((s) => s.id).join(' → ')}.`,
      `- Palette: bg ${contract.palette.bg}, ink ${contract.palette.ink}, accent ${contract.palette.accent}.`,
      `- FORBIDDEN: ${contract.forbid.join(', ')}.`,
      '- Put the ENTIRE page in src/App.jsx + src/App.css. No absolute icon-rail / brand-rail.',
      '- Use CopyPack strings. Never lorem / Sample / placeholder.',
      '- Strong type hierarchy; high-contrast product titles; real CTAs with hover.',
      contract.hero.fullBleed
        ? '- First viewport: brand + one headline + one support + CTA + dominant full-bleed visual — not a card grid.'
        : '- Clear primary panel; avoid decorative absolute overlays.',
    ];
  }
  const cinematic = /\b(?:sign[- ]?in|login|auth|embark|cinematic|game|hero\s+art|platform\s+button)\b/i.test(t)
    || /\b(?:premium|marketing|landing|product)\b/i.test(t);
  if (!cinematic) {
    return [
      'Atmosphere: layered CSS gradients + at least one @keyframes motion — never a flat solid fill as the whole look.',
      'Include a real logo/wordmark, icon row or SVG marks, and a primary CTA button with hover.',
      'No absolute icon-rail / brand-rail overlays on marketing layouts.',
    ];
  }
  return [
    'PREMIUM WEB (reference bar: product marketing / Embark-class):',
    '- Split or full-bleed composition — not a tiny inset card hero.',
    '- Put the ENTIRE page in src/App.jsx + src/App.css. Do NOT split Header/Hero/Footer into other files.',
    '- Atmosphere via @keyframes. Match the brief palette — do NOT default to cream/terracotta AI look.',
    '- Brand wordmark in a normal nav flow — never absolute floating icon rails.',
    '- Strong type hierarchy + primary CTA row with hover.',
    '- Use /heroes/*.jpg or inline SVG — never via.placeholder.com or banned Unsplash cinema stocks.',
    '- Scrollable: nav + hero + secondary bands + footer.',
  ];
}

/** @deprecated alias — prefer isUiDesignEngineId from enginePick */
export function isDesignEngineId(id: string | undefined | null): boolean {
  return isUiDesignEngineId(id);
}
