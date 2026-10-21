/**
 * Nova create/edit build loop — original orchestration on top of Level-B tools.
 * Free forever (local GGUF + optional free/user-keyed cloud). No paywall. No copied builders.
 *
 * Flow: pack context → agent tools → Preview Ready / assets check → fix rounds → heal.
 */

import { runNovaAgentLoop, type AgentLoopResult, type AgentLoopStep } from '@/lib/novaAgentLoop';
import { packNovaBuildContext, novaCreateWriteTargets } from '@/lib/novaBuildContext';
import { modeStatusLabel } from '@/lib/novaStudioModes';
import { getLocalPrefs } from '@/lib/localPrefs';

export type NovaBuildLoopHost = {
  pushStatus: (label: string, writingPath?: string | null) => void;
  shouldAbort?: () => boolean;
};

export type NovaBuildLoopOpts = {
  brief: string;
  productName: string;
  files: Record<string, string>;
  projectId: string;
  diskRoot?: string | null;
  mustHaves?: string[];
  coderId: string;
  coderName: string;
  coderSource?: string;
  stickyModelId?: string | null;
  stickyModelName?: string | null;
  host: NovaBuildLoopHost;
  /** Max Ready→fix rounds after the first tool loop. */
  maxFixRounds?: number;
  priorObservations?: string[];
};

export type NovaBuildLoopResult = {
  ok: boolean;
  files: Record<string, string>;
  reasons: string[];
  steps: AgentLoopStep[];
  usedAgentLoop: true;
  replySummary: string;
};

/**
 * Structure-first: scaffold UI before heavy design assets.
 * Product/hardware landings stay on the one-spine path (logo+palette are required beats).
 */
export function wantsStructureFirstCreate(brief?: string, _name?: string): boolean {
  const t = String(brief || '');
  if (
    /\b(?:gaming\s+desk|standing\s+desk|shop\s+the\s+desk|product\s+landing)\b/i.test(t)
    || (
      /\blanding\s+page\b/i.test(t)
      && /\b(?:not\s+SaaS|not\s+dashboard|gaming|desk|hardware|brand)\b/i.test(t)
    )
  ) {
    return false;
  }
  return true;
}

/** Tiny step-ladder ask: blank / plain white page only — no nav/logo/sections yet. */
export function isTinyBlankPageAsk(brief: string): boolean {
  const b = String(brief || '');
  if (/\b(?:not|n't|never|no|avoid|without|instead of)\b[\s\S]{0,24}\bblank\b/i.test(b)) {
    return false;
  }
  if (/\b(?:e-?commerce|storefront|add[\s-]?to[\s-]?(?:cart|bag)|product\s+(?:grid|catalog)|exactly\s+\d+\s+(?:bottles?|products?))\b/i.test(b)) {
    return false;
  }
  if (!/\b(?:blank|plain\s+white|white\s+(?:blank\s+)?page|empty\s+page|just\s+a\s+(?:plain\s+)?(?:white\s+)?(?:page|background))\b/i.test(b)
    && !/\bnothing\s+else\s+yet\b/i.test(b)) {
    return false;
  }
  // Extra features named → not a blank-only step.
  if (/\b(?:menu|nav|logo|hero|footer|button|sign\s*in|rewards|checkout|shop|image|photo)\b/i.test(b)
    && !/\bnothing\s+else\b/i.test(b)) {
    return false;
  }
  return true;
}

/** Deterministic white blank App — step 1 of the piece-by-piece ladder. */
export function blankWhitePageFiles(): Record<string, string> {
  return {
    'src/App.jsx': [
      "import './App.css';",
      '',
      'export default function App() {',
      '  return (',
      '    <div className="app" aria-label="Blank page">',
      '    </div>',
      '  );',
      '}',
      '',
    ].join('\n'),
    'src/App.css': [
      '.app {',
      '  min-height: 100vh;',
      '  margin: 0;',
      '  width: 100%;',
      '  background: #ffffff;',
      '  color: #111111;',
      '}',
      '',
    ].join('\n'),
    'src/index.css': [
      'html, body, #root { height: 100%; margin: 0; background: #ffffff; }',
      '',
    ].join('\n'),
  };
}

/** Exported for smokes — create tool-loop system brief. */
export function buildCreateBrief(opts: NovaBuildLoopOpts): string {
  const targets = novaCreateWriteTargets(opts.files).join(', ');
  const must = (opts.mustHaves || []).slice(0, 10).map((m, i) => `${i + 1}. ${m}`).join('\n');
  const briefLower = String(opts.brief || '').toLowerCase();
  const isGame = /\b(?:game|playable|arcade|fps|shooter|canvas\s+game|pong|snake|pac-?man|dino|runner)\b/.test(briefLower);
  const is3d = /\b(?:3d|three\.?js|webgl|modeler|viewport|mesh\s+editor|babylon)\b/.test(briefLower);
  const structureFirst = wantsStructureFirstCreate(opts.brief, opts.productName);
  const tinyStep = /\b(?:blank|plain\s+white|white\s+page|empty\s+page|just\s+a\s+(?:page|background)|nothing\s+else\s+yet|for\s+now)\b/i.test(opts.brief);
  const craftRules = isGame
    ? [
        '## Kind: PLAYABLE GAME (not a marketing site)',
        '- Ship a real <canvas> (or WebGL) with requestAnimationFrame, keyboard/pointer controls, score/HUD, and a game loop.',
        '- Implement movement, collision, and win/lose — not a centered brand splash or feature-card landing.',
      ]
    : is3d
      ? [
          '## Kind: 3D / VIEWPORT APP',
          '- Import three (or WebGL). Show a real interactive scene with orbit/pan controls.',
          '- At least one editable mesh or tool. Add three to package.json if missing.',
        ]
      : tinyStep
        ? [
            '## Kind: TINY STEP (do only what was asked)',
            '- The user is building piece by piece. Do ONLY this step — nothing extra.',
            '- If they asked for a blank/white page: one App with a white background div. No nav, logo, sections, hero, or footer.',
            '- Valid JSX only. Then TOOL: ready and TOOL: done.',
          ]
        : structureFirst
          ? [
              '## Kind: STRUCTURE FIRST (not design polish)',
              '- Do only what THIS message asks. Do not invent extra marketing sections, logos, or heroes.',
              '- Working layout + real labels/copy. Plain readable CSS is enough.',
              '- Do NOT fetch logos, stock photos, or animation systems in this pass.',
              '- Tip/todo/calculator: inputs + totals. Coffee/site asks: only the bands/controls they named.',
            ]
          : [
              '## Kind: PRODUCT / WEB APP',
              '- Invent a unique visual language for THIS brand. Premium depth: layered background, strong type, real flows.',
              '- Implement the REAL flows from the brief (browse, cart, chat, dashboard, etc.).',
            ];
  return [
    `Build **${opts.productName}** on this Vite + React project.`,
    structureFirst
      ? 'STRUCTURE FIRST: ship the working skeleton (all features placed). Design quality / graphics come later.'
      : 'Nova is free — ship a real usable first screen. No paywalls, no “upgrade to Pro”.',
    '',
    '## Product brief',
    opts.brief.slice(0, 3500),
    '',
    must ? `## Must-haves\n${must}` : '',
    '',
    ...craftRules,
    ...(!structureFirst
      && (
        /\b(?:gaming\s+desk|standing\s+desk|shop\s+the\s+desk|product\s+landing)\b/i.test(opts.brief)
        || (/\blanding\s+page\b/i.test(opts.brief) && /\b(?:not\s+SaaS|gaming|desk|hardware)\b/i.test(opts.brief))
      )
      ? [
          '',
          '## PRODUCT INVENT — OWN THE LOOK',
          '- A disposable seed may already be in App — REPLACE it with a unique composition and original copy.',
          '- Do NOT keep className app desk-*, you@desk.mail, or blurbs with hex salts in parentheses.',
          '- Different silhouette than hero+3 equal cards+email twin. Keep brand hero, shop CTA, three features, footer.',
          '- Keep /logo.svg. No todo, Apple bands, or SaaS Dashboard/Billing.',
        ]
      : []),
    '',
    '## Rules',
    `- Prefer TOOL: write or TOOL: patch on: ${targets}`,
    '- Put the product in App + App.css (no ./components imports unless those files already exist).',
    '- Finish every JSX tag. Real copy for THIS product — never lorem / “Sample” / via.placeholder.com.',
    structureFirst
      ? '- After the functional UI is written, call TOOL: ready then TOOL: done. Skip TOOL: assets in this pass.'
      : '- After substantial UI is written, call TOOL: ready then TOOL: assets. Fix failures before TOOL: done.',
    '- Prefer patch for small fixes; full write only when rewriting App.',
    '',
    'Start by TOOL: list or TOOL: read on src/App.tsx (or App.jsx), then write the product.',
  ].filter(Boolean).join('\n');
}

async function runReadyAndAssetsCheck(
  files: Record<string, string>,
  productName: string,
  brief: string,
  _mustHaves: string[],
): Promise<{ ok: boolean; reasons: string[] }> {
  const {
    previewReadyForBrief,
    looksLikeFillerStubAppSource,
  } = await import('@/lib/createBuildQuality');
  const { briefCreateMisses, createBriefSpecFromAsk } = await import('@/lib/createIdentity');
  const appBody = files['src/App.tsx'] || files['src/App.jsx'] || '';
  const compact = appBody.replace(/\s+/g, '');
  // Structure-first: functional skeleton clears Ready — not marketing polish / logo floors.
  if (wantsStructureFirstCreate(brief, productName)) {
    const reasons: string[] = [];
    if (!/export\s+default/i.test(appBody)) reasons.push('App missing default export');
    if (compact.length < 400 || (/Bare Vite mount|id="root-app"/i.test(appBody) && compact.length < 600)) {
      reasons.push('App still bare scaffold — write the real UI structure');
    }
    if (/tip|bill|percent|calculator/i.test(brief) && !/<input\b/i.test(appBody)) {
      reasons.push('tip/calculator missing <input> controls');
    }
    if (/\btodo|task list|add(?:\s+and)?\s+delete/i.test(brief) && !/<input\b/i.test(appBody)) {
      reasons.push('todo tool missing <input>');
    }
    if (looksLikeFillerStubAppSource(appBody)) reasons.push('App is still a filler stub');
    return { ok: reasons.length === 0, reasons };
  }
  const spec = createBriefSpecFromAsk(productName, brief);
  const ready = previewReadyForBrief(files, {
    productName,
    brief,
  });
  const misses = briefCreateMisses(spec, files);
  const filler = looksLikeFillerStubAppSource(appBody);
  const reasons = [
    ...(ready.ok ? [] : (ready.reasons || [])),
    ...misses,
    ...(filler ? ['App is still a filler stub'] : []),
  ];
  return { ok: reasons.length === 0, reasons };
}

async function healCreateFiles(
  files: Record<string, string>,
  opts: {
    productName: string;
    brief: string;
    projectId: string;
    diskRoot?: string | null;
    pushStatus: NovaBuildLoopHost['pushStatus'];
  },
): Promise<Record<string, string>> {
  const { applyChatReplyEdits } = await import('@/lib/chatAgentApply');
  const { ensureStylesLinked, createBriefSpecFromAsk } = await import('@/lib/createIdentity');
  const { ensureReactImportForNamespace, ensureJsxHasNoTypeScript } = await import('@/lib/createBuildQuality');
  let next = { ...files };
  const linked = ensureStylesLinked(next);
  if (linked.changed.length) {
    opts.pushStatus(modeStatusLabel('fix', 'Linking App.css'));
    next = linked.files;
    const blocks = linked.changed.map((p) => `@@@FILE ${p}\n${next[p]}`).join('\n');
    // Memory-only during heal — diskRoot sync IPC can freeze the renderer so timers
    // never fire (create stuck on "Fix: Linking App.css" for tens of minutes).
    // create.ts persists accepted files after the tool loop returns.
    const applied = await applyChatReplyEdits({
      reply: blocks,
      projectId: opts.projectId,
      projectName: opts.productName,
      files: next,
      userMessage: opts.brief,
      diskRoot: null,
      dryRun: true,
    });
    if (applied.ok) next = applied.files;
  }
  const appKey = next['src/App.tsx'] && !next['src/App.jsx']
    ? 'src/App.tsx'
    : (next['src/App.jsx'] ? 'src/App.jsx' : 'src/App.tsx');
  const briefSpec = createBriefSpecFromAsk(opts.productName, opts.brief);
  let body = next[appKey] || '';
  if (body && /\/heroes\/hero\.jpg/i.test(body) && briefSpec.heroHref) {
    body = body.replace(/\/heroes\/hero\.jpg/gi, briefSpec.heroHref);
    next = { ...next, [appKey]: body };
  }
  let healed = next[appKey] || '';
  {
    const { stripEntrypointBleedFromApp, stripModelProseFromSource } = await import('@/lib/createBuildQuality');
    healed = stripEntrypointBleedFromApp(healed);
    healed = stripModelProseFromSource(appKey, healed);
  }
  if (/\.jsx$/i.test(appKey)) {
    const stripped = ensureJsxHasNoTypeScript(healed);
    if (stripped !== healed) {
      opts.pushStatus(modeStatusLabel('fix', 'Stripping TS from App.jsx'));
      healed = stripped;
    }
  }
  healed = ensureReactImportForNamespace(healed);
  if (healed !== (next[appKey] || '')) {
    opts.pushStatus(modeStatusLabel('fix', 'React import for Live'));
    next = { ...next, [appKey]: healed };
  }
  // Structure-first: skip logo/hero wire + companion atmosphere (design pass later).
  if (!wantsStructureFirstCreate(opts.brief, opts.productName)) {
    const { wireCreatePublicAssets, cssBlobIsThin, buildMarketingCompanionCss } = await import('@/lib/createBuildQuality');
    const { createIdentityFromBrief } = await import('@/lib/createIdentity');
    const wired = wireCreatePublicAssets(next, opts.productName, opts.brief);
    if (wired.changed.length) {
      opts.pushStatus(modeStatusLabel('fix', 'Wiring assets + atmosphere'));
      next = wired.files;
    }
    if (cssBlobIsThin(next, 1600) && !next['src/App.css']?.includes('novaCompanionSweep') && !next['src/App.css']?.includes('novaAtmosSweep')) {
      const appBody = String(next[appKey] || '');
      const isStubSplash = appBody.replace(/\s+/g, '').length < 1800
        && !/<(?:section|main|footer|form)\b/i.test(appBody);
      if (!isStubSplash) {
        const identity = createIdentityFromBrief(opts.productName, opts.brief);
        const companion = buildMarketingCompanionCss(opts.productName, opts.brief, identity);
        const prev = String(next['src/App.css'] || '');
        next = { ...next, 'src/App.css': `${prev}\n${companion}`.trim() };
        opts.pushStatus(modeStatusLabel('fix', 'Injecting brief companion CSS'));
      }
    }
  }
  if (next[appKey] !== files[appKey] || next['src/App.css'] !== files['src/App.css']) {
    const blocks = [
      next[appKey] !== files[appKey] ? `@@@FILE ${appKey}\n${next[appKey]}` : '',
      next['src/App.css'] !== files['src/App.css'] ? `@@@FILE src/App.css\n${next['src/App.css']}` : '',
    ].filter(Boolean).join('\n');
    const applied = await applyChatReplyEdits({
      reply: blocks,
      projectId: opts.projectId,
      projectName: opts.productName,
      files: next,
      userMessage: opts.brief,
      diskRoot: null,
      dryRun: true,
    }).catch(() => ({ ok: false as const }));
    if (applied.ok) next = applied.files;
  }
  return next;
}

/**
 * Run Nova’s create polish via the tool loop + Ready/assets verify→fix.
 */
export async function runNovaCreateBuildLoop(opts: NovaBuildLoopOpts): Promise<NovaBuildLoopResult> {
  const prefs = getLocalPrefs();
  const maxFix = Math.max(0, Math.min(5, opts.maxFixRounds ?? 2));
  const packed = packNovaBuildContext(opts.files);
  const allSteps: AgentLoopStep[] = [];
  let files = { ...opts.files, ...packed };
  let observations = [...(opts.priorObservations || [])];
  let lastLoop: AgentLoopResult | null = null;
  let reasons: string[] = [];

  const { briefNeedsCreateUiPolish, briefLooksLikeMarketingLanding } = await import('@/lib/createBuildQuality');
  const { looksLikePlayableCanvasGame, looksLikeSpatialApp } = await import('@/lib/freshSpaFromBrief');
  const richBrief = briefNeedsCreateUiPolish(opts.brief)
    || briefLooksLikeMarketingLanding(opts.brief)
    || looksLikePlayableCanvasGame(opts.brief)
    || looksLikeSpatialApp(opts.brief)
    || (opts.mustHaves || []).length >= 3;

  const { arkRoute, routerProviderLabel } = await import('@/lib/novaRouter');

  const callModel = async (modelOpts: {
    prompt: string;
    onChunk?: (chunk: string) => void;
  }) => {
    // Direct coding route — never answerStudio packing (that buries TOOL: lines and stalls on Thinking).
    let streamed = '';
    const routed = await arkRoute({
      message: modelOpts.prompt,
      kind: 'coding',
      preferCloudCoding: false,
      preferredModelId: opts.coderId,
      preferredModelName: opts.coderName,
      preferredSource: (opts.coderSource as 'local' | 'cloud' | 'auto' | undefined) || 'local',
      stickyModelId: undefined,
      stickyModelName: undefined,
      stickyPinnedSource: undefined,
      onChunk: (piece) => {
        if (opts.host.shouldAbort?.()) return;
        const delta = String(piece || '');
        if (!delta) return;
        if (streamed.length === 0 && delta.length >= 40) streamed = delta;
        else if (delta.length > streamed.length + 20 && delta.length >= 40) streamed = delta;
        else streamed += delta;
        modelOpts.onChunk?.(streamed);
      },
    });
    return {
      reply: String(routed.reply || streamed || ''),
      modelName: opts.coderName || routed.modelName,
      providerLabel: routerProviderLabel(routed, 'NOVA'),
    };
  };

  opts.host.pushStatus(modeStatusLabel('build', 'Tool loop — reading project'));

  for (let round = 0; round <= maxFix; round++) {
    if (opts.host.shouldAbort?.()) {
      return {
        ok: false,
        files,
        reasons: ['Stopped'],
        steps: allSteps,
        usedAgentLoop: true,
        replySummary: 'Stopped during build loop.',
      };
    }

    const structureFirst = wantsStructureFirstCreate(opts.brief, opts.productName);
    const brief = round === 0
      ? buildCreateBrief({ ...opts, files })
      : [
          buildCreateBrief({ ...opts, files }),
          '',
          structureFirst
            ? '## Fix round — structure still incomplete'
            : '## Fix round — Preview Ready / assets failed',
          ...reasons.map((r) => `- ${r}`),
          structureFirst
            ? 'Patch the missing structure only. Then TOOL: ready and TOOL: done. Skip TOOL: assets.'
            : 'Patch the failing issues. Then TOOL: ready and TOOL: assets again. Finish with TOOL: done.',
        ].join('\n');

    if (round > 0) {
      opts.host.pushStatus(modeStatusLabel('fix', reasons[0]?.slice(0, 72) || 'Ready issues'));
    }

    lastLoop = await runNovaAgentLoop({
      brief,
      files: packNovaBuildContext(files),
      projectId: opts.projectId,
      projectName: opts.productName,
      diskRoot: opts.diskRoot,
      maxSteps: structureFirst
        ? Math.min(14, Math.max(8, Number(prefs.agentLoopMaxSteps) || 12))
        : Math.min(
          richBrief ? 22 : 12,
          Math.max(richBrief ? 12 : 6, Number(prefs.agentLoopMaxSteps) || (richBrief ? 16 : 8)),
        ),
      shouldAbort: () => Boolean(opts.host.shouldAbort?.()),
      priorObservations: observations,
      autoRunAllowlisted: true,
      createCraftMode: true,
      maxIdleListRead: 2,
      thinAppBytes: 2000,
      callModel,
      onStep: (step) => {
        allSteps.push(step);
        const pathMatch = String(step.detail || step.label || '').match(
          /\b((?:src\/)?[\w./-]+\.(?:tsx?|jsx?|css))\b/i,
        );
        const label = step.tool === 'thought' || step.tool === 'status'
          ? modeStatusLabel(round > 0 ? 'fix' : 'build', step.label)
          : step.ok === false
            ? String(step.label || '').replace(/^⚠\s*/, '')
            : step.label;
        // Hide internal parser noise from the user-facing timeline.
        if (/unparsed|nudging model/i.test(label)) {
          opts.host.pushStatus(
            modeStatusLabel(round > 0 ? 'fix' : 'build', 'Refining the next edit step…'),
            pathMatch?.[1] || null,
          );
          return;
        }
        opts.host.pushStatus(label, pathMatch?.[1] || null);
      },
    });

    files = { ...files, ...lastLoop.files };
    observations = [
      ...observations,
      ...lastLoop.observations.slice(-6),
      lastLoop.ok ? 'Agent loop finished a pass.' : 'Agent loop stopped before done.',
    ].slice(-20);

    if (lastLoop.hitStepCap || lastLoop.stopped) {
      try {
        const { saveAgentContinue } = await import('@/lib/novaAgentContinue');
        saveAgentContinue({
          chatKey: opts.projectId,
          brief: opts.brief,
          observations,
          updated: lastLoop.updated || [],
          projectId: opts.projectId,
          projectName: opts.productName,
          diskRoot: opts.diskRoot,
          at: Date.now(),
        });
      } catch { /* ignore */ }
    } else {
      try {
        const { clearAgentContinue } = await import('@/lib/novaAgentContinue');
        clearAgentContinue(opts.projectId);
      } catch { /* ignore */ }
    }

    files = await healCreateFiles(files, {
      productName: opts.productName,
      brief: opts.brief,
      projectId: opts.projectId,
      diskRoot: opts.diskRoot,
      pushStatus: opts.host.pushStatus,
    });

    const check = await runReadyAndAssetsCheck(
      files,
      opts.productName,
      opts.brief,
      opts.mustHaves || [],
    );
    reasons = check.reasons;
    if (check.ok) {
      // Structure-first / create craft: static Ready is enough here. create.ts owns Live
      // evidence — getOrAttachPreview + collectLiveEvidence can hang for tens of minutes
      // while status still shows the prior "Linking App.css" beat.
      if (structureFirst) {
        opts.host.pushStatus(modeStatusLabel('build', 'Preview Ready (Live deferred to create)'));
        return {
          ok: true,
          files,
          reasons: [],
          steps: allSteps,
          usedAgentLoop: true,
          replySummary: lastLoop.reply || `Built **${opts.productName}**. Open Live when ready.`,
        };
      }
      // Static Ready is preflight. When disk exists, require Live evidence before ok.
      if (opts.diskRoot) {
        try {
          opts.host.pushStatus(modeStatusLabel('build', 'Starting Live…'));
          const attach = await window.novaDesktop?.getOrAttachPreview?.(opts.diskRoot);
          const liveUrl = String(attach?.url || '').trim();
          if (attach?.ok && liveUrl) {
            const {
              collectLiveEvidence,
              emptyCreateEvidence,
              finalizeCreateEvidence,
            } = await import('@/lib/createEvidence');
            opts.host.pushStatus(modeStatusLabel('build', 'Live evidence'));
            const live = await collectLiveEvidence({
              liveUrl,
              productName: opts.productName,
              files,
              brief: opts.brief,
              requireSmoke: true,
            });
            const ev = finalizeCreateEvidence(emptyCreateEvidence({
              staticReady: true,
              npmInstalled: true,
              ...live,
            }));
            if (!ev.pass) {
              reasons = [
                ...reasons,
                !ev.mounted ? 'Live UI did not mount' : '',
                !ev.consoleClean ? 'Live console errors' : '',
                ev.smokeOk === false ? ev.smokeDetail : '',
              ].filter(Boolean);
              // Fall through — do not return ok on static Ready alone.
            } else {
              opts.host.pushStatus(modeStatusLabel('build', 'Live verified'));
              return {
                ok: true,
                files,
                reasons: [],
                steps: allSteps,
                usedAgentLoop: true,
                replySummary: lastLoop.reply || `Built **${opts.productName}**. Live verified.`,
              };
            }
          } else {
            reasons = [...reasons, attach?.error || 'Live did not start'];
          }
        } catch (err) {
          reasons = [...reasons, err instanceof Error ? err.message : 'Live evidence failed'];
        }
        // Static Ready alone is not success when diskRoot is set.
      } else {
        opts.host.pushStatus(modeStatusLabel('build', 'Preview Ready'));
        return {
          ok: true,
          files,
          reasons: [],
          steps: allSteps,
          usedAgentLoop: true,
          replySummary: lastLoop.reply || `Built **${opts.productName}**. Open Live when ready.`,
        };
      }
    }
  }

  return {
    ok: false,
    files,
    reasons,
    steps: allSteps,
    usedAgentLoop: true,
    replySummary: lastLoop?.reply
      || `Could not reach Preview Ready yet:\n${reasons.slice(0, 5).map((r) => `- ${r}`).join('\n')}`,
  };
}

/** Whether create should use the Nova tool loop after scaffold. Default on (coding foundation). */
export function shouldUseNovaCreateBuildLoop(): boolean {
  const prefs = getLocalPrefs();
  return prefs.agentLoopOnCreate !== false && prefs.agentLoopEnabled !== false;
}

/** Whether edit should use the Nova tool loop after surgical miss. Default on. */
export function shouldUseNovaEditBuildLoop(): boolean {
  const prefs = getLocalPrefs();
  return prefs.agentLoopOnEdit !== false && prefs.agentLoopEnabled !== false;
}
