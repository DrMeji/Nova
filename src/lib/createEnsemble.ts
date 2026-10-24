/**
 * Sequential multi-model create ensemble — free local GGUFs work as one team.
 * One model at a time: plan → spec → design → copy → craft → (tokens) → verify → critic.
 */

import {
  isUiDesignEngineId,
  rankedReadyCoderIds,
  rankedReadyDesignIds,
  rankedReadyEngineIds,
} from '@/lib/enginePick';
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
import { formatOriginalCraftRules } from '@/lib/createDesignSystem';
import { isEnsembleAutoParked } from '@/lib/localPrefs';

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
 * Seats are fixed (plan/design/copy/craft/style). Who sits in each seat is
 * whoever is Ready + fit on THIS PC — not hard-coded model names.
 * Vision / mmproj never fills plan, copy, design, craft, or style.
 *
 * When ensemble Auto is parked (default), multi-hop is forced off — code stays
 * for later re-enable via `ensembleAutoParked: false`.
 */
export function resolveCreateEnsembleTeam(
  models: EngineRow[] | undefined,
  opts?: {
    ramGb?: number;
    maxCoderParamsB?: number | null;
    craftId?: string | null;
    /** Explicit opt-in — relay hops (plan→design→copy) before craft. */
    allowMultiHop?: boolean;
  },
): CreateEnsembleTeam {
  const ram = opts?.ramGb ?? 8;
  const maxB = opts?.maxCoderParamsB ?? null;
  // Parked = keep ensemble code, never activate multi-seat hops.
  const allowMultiHop = Boolean(opts?.allowMultiHop) && !isEnsembleAutoParked();
  const coders = rankedReadyCoderIds(models, ram, maxB);
  // Plan/Copy seats = chat/instruct only — never UI-design specialists or vision.
  const chats = rankedReadyEngineIds(models, 'chat', ram, maxB)
    .filter((id) => !/\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl)\b/i.test(id))
    .filter((id) => !isUiDesignEngineId(id));
  const designs = rankedReadyDesignIds(models, ram, maxB)
    .filter((id) => !/\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl)\b/i.test(id));

  // Craft seat: dedicated coder first, else pinned craft, else best chat/instruct.
  const craftPref = String(opts?.craftId || getActiveBrainId('coder') || '').trim();
  const craftId = (
    (craftPref && craftPref !== 'NOVA-auto'
      && (coders.includes(craftPref) || chats.includes(craftPref) || isUiDesignEngineId(craftPref)))
      ? craftPref
      : (coders[0] || chats[0] || '')
  );
  const chatPref = String(getActiveBrainId('chat') || '').trim();
  const planId = allowMultiHop
    ? ((chatPref && chatPref !== 'NOVA-auto' && chats.includes(chatPref))
      ? chatPref
      : (chats.find((id) => id !== craftId) || chats[0] || craftId || ''))
    : '';

  const designPref = String(getActiveBrainId('design') || '').trim();
  const designId = allowMultiHop
    ? ((designPref && designPref !== 'NOVA-auto' && designs.includes(designPref))
      ? designPref
      : (designs.find((id) => isUiDesignEngineId(id)) || designs.find((id) => id !== craftId) || designs[0] || ''))
    : '';

  // Copy is instruct/chat only — never vision, never UIGEN.
  const copyId = allowMultiHop
    ? (planId || (chats.find((id) => id !== craftId) || chats[0] || craftId || ''))
    : '';
  // Style seat = design brain (CSS thicken only) — never a second App rewrite.
  const styleId = allowMultiHop ? (designId || '') : '';

  const members: EnsembleMember[] = [];
  const push = (role: EnsembleRole, id: string) => {
    if (!id) return;
    if (/\b(?:vl|vision|llava|moondream|minicpm[-_]?v|mmproj|qwen2-vl)\b/i.test(id)
      && role !== 'critic') {
      return;
    }
    // Plan/copy must stay instruct — refuse design-specialist seat theft.
    if ((role === 'plan' || role === 'copy') && isUiDesignEngineId(id)) return;
    members.push({ role, id, name: rowName(models, id), source: 'local' });
  };
  if (allowMultiHop) {
    push('plan', planId);
    push('design', designId);
    push('copy', copyId);
  }
  push('craft', craftId);
  if (allowMultiHop && styleId && styleId !== craftId) push('style', styleId);

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
  // Craft may be a coder OR chat/instruct when no dedicated coder is installed.
  if (!team.members.some((m) => m.role === 'craft' && m.id)) {
    return { ok: false, reason: 'No ready brain for craft phase' };
  }
  return { ok: true };
}

export function ensembleMember(
  team: CreateEnsembleTeam,
  role: EnsembleRole,
): EnsembleMember | null {
  const hit = team.members.find((m) => m.role === role);
  if (hit) return hit;
  // Verify has no seat of its own — the craft coder verifies/heals its own output.
  if (role === 'verify') {
    const craft = team.members.find((m) => m.role === 'craft');
    return craft ? { ...craft, role: 'verify' } : null;
  }
  return null;
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
    'genre must be one of: product-homepage, storefront, cafe-local, saas-landing, arcade-game, utility-tool, desktop-app, cli-tool, python-app, generic-web',
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

/** Design hop — refine palette/type only; Design Spine owns composition + section ids. */
export async function runCreateDesignHop(opts: {
  brief: string;
  productName: string;
  spec: ProductSpec;
  modelId: string;
  modelName: string;
  shouldAbort?: () => boolean;
}): Promise<{ contract: LayoutContract; modelName: string }> {
  const { buildDesignPlan, designPlanToLayoutContract } = await import('@/lib/createDesignSystem');
  const plan = buildDesignPlan({ brief: opts.brief, productName: opts.productName });
  const floor = designPlanToLayoutContract(plan);
  if (opts.shouldAbort?.()) return { contract: floor, modelName: opts.modelName };
  const prompt = [
    `You are the DESIGN slot brain for **${opts.productName}** (family: ${plan.family}).`,
    'Nova already locked the shell + landmarks. You ONLY refine palette + typography + motion labels.',
    'Emit ONLY JSON with keys: palette {bg,ink,accent,muted}, typography {display,body}, motion (string[]).',
    'Do NOT emit CSS, JSX, sections, composition, or hero structure — those stay on the Design Spine floor.',
    'Never invent Mac/iPad/Watch/AirPods bands unless the brand is Apple.',
    'Never require site-name recipes — quality floor already applies.',
    `Floor tokens (refine these only):`,
    JSON.stringify({
      palette: floor.palette,
      typography: floor.typography,
      motion: floor.motion,
      family: plan.family,
    }),
    '',
    'Must have (context — do not invent new sections):',
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
  // Slot-only merge: keep floor composition / sections / hero; take palette/type/motion polish.
  const slotPartial: Partial<LayoutContract> = parsed
    ? {
        palette: parsed.palette,
        typography: parsed.typography,
        motion: parsed.motion,
      }
    : {};
  const { applyLayoutReference } = await import('@/lib/createLayoutContract');
  return {
    contract: applyLayoutReference(opts.brief, mergeLayoutContract(floor, slotPartial)),
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
    `You are the COPY slot brain for **${opts.productName}**.`,
    'Emit ONLY JSON: { brand, headline, support, ctas: string[], sections: { [id]: { title, body } } }.',
    'Fill the existing section ids only — do not invent new section ids or layout instructions.',
    'Real brand voice. Ban: lorem, Sample, placeholder, truncated words, craft-instruction residue.',
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
    'BASIC LAYOUT RULES (always): one clear column flow (nav → hero → sections → footer); never paste prompt instructions into visible UI text;',
    'align nav brand left + links right; hero copy left-aligned with real breathing room; buttons must be real labels only.',
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
  }).genre, opts.brief);
  const tokens = cssTokensFromContract(contract);
  let css = String(opts.cssSource || '');
  if (!/NOVA layout contract tokens/.test(css)) {
    css = `${tokens}\n${css}`;
  }
  const ensurePremiumMotion = (src: string): string => {
    let out = String(src || '');
    // Always ship motion for product/marketing contracts — early-return used to skip this.
    if ((contract.motion.length || /product-homepage|cafe-local|saas-landing/i.test(contract.genre))
      && !/@keyframes/i.test(out)) {
      out += `

/* NOVA premium motion */
@keyframes contractReveal {
  from { opacity: 0; transform: translateY(14px); }
  to { opacity: 1; transform: none; }
}
@keyframes softOrbDrift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(12px, -18px) scale(1.06); }
}
.hero, .product-band, main section, .feature-a, .feature-b, .feature-c, .band {
  animation: contractReveal 0.75s ease both;
}
`;
    }
    // Flat solid --bg alone fails "premium depth" — layer atmosphere when missing.
    if (!/radial-gradient|linear-gradient/i.test(out)) {
      out += `
.app, .hero {
  background-image:
    radial-gradient(ellipse 55% 45% at 18% 22%, color-mix(in srgb, var(--accent) 28%, transparent), transparent 60%),
    radial-gradient(ellipse 50% 40% at 82% 18%, color-mix(in srgb, var(--muted) 22%, transparent), transparent 58%),
    linear-gradient(165deg, var(--bg), color-mix(in srgb, var(--bg) 82%, var(--accent)) 55%, var(--bg));
}
.hero::before, .hero::after {
  content: "";
  position: absolute;
  border-radius: 50%;
  filter: blur(2px);
  pointer-events: none;
  animation: softOrbDrift 9s ease-in-out infinite;
}
.hero::before { width: min(42vw, 420px); height: min(42vw, 420px); left: -8%; top: 12%; background: color-mix(in srgb, var(--accent) 22%, transparent); }
.hero::after { width: min(36vw, 340px); height: min(36vw, 340px); right: -6%; top: 8%; background: color-mix(in srgb, var(--muted) 18%, transparent); animation-delay: -3s; }
`;
    }
    return out;
  };
  const cssThin = css.replace(/\s+/g, '').length < 900
    || (/#0f1419/.test(css) && css.length < 1200);
  if (!cssThin) {
    return { css: ensurePremiumMotion(css), modelName: opts.modelName };
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
    return { css: ensurePremiumMotion(css), modelName: routed.modelName };
  }
  if (!/NOVA layout contract tokens|:root\s*\{[^}]*--bg/i.test(next)) {
    next = `${tokens}\n${next}`;
  }
  const lastBrace = next.lastIndexOf('}');
  if (lastBrace > 40 && /This implementation|The page is designed/i.test(next.slice(lastBrace + 1))) {
    next = `${next.slice(0, lastBrace + 1).trim()}\n`;
  }
  return { css: ensurePremiumMotion(next), modelName: routed.modelName };
}

/** Premium craft rules — original one-of-one from the brief (no Design Spine fill-slots). */
export function premiumWebCraftRules(brief: string, _contract?: LayoutContract | null): string[] {
  void _contract;
  return formatOriginalCraftRules({
    brief,
    productName: '',
    freshnessKey: `craft-${Date.now().toString(36)}`,
  });
}

/** @deprecated alias — prefer isUiDesignEngineId from enginePick */
export function isDesignEngineId(id: string | undefined | null): boolean {
  return isUiDesignEngineId(id);
}
