/**
 * Exhaustive inventory of Nova app chrome / settings / panels that research
 * says we need. Items start here; each home (Settings, Agents, Chat, Live…)
 * mounts a panel and marks them Placed.
 *
 * Coding-deep loop appends more via missingItemsDiscovered.generated.ts.
 *
 * DEEP-SCAN RULE: whenever peer/Live/rescan finds logic Have but UI/settings/
 * button/tab missing, append a static MissingItem here (or sync into discovered)
 * in the same change — never leave “works in smoke / invisible in app”.
 */
import {
  DISCOVERED_MISSING_ITEMS,
  DISCOVERED_MISSING_TOTAL,
} from '@/lib/missingItemsDiscovered.generated';

export { DISCOVERED_MISSING_TOTAL };

export type MissingHome =
  | 'settings-ai'
  | 'settings-privacy'
  | 'settings-projects'
  | 'settings-providers'
  | 'settings-advanced'
  | 'chat-composer'
  | 'chat-side'
  | 'code-header'
  | 'live-chrome'
  | 'workspace'
  | 'nav-tools'
  | 'agents-window'
  | 'new-surface';

export type MissingItem = {
  id: string;
  title: string;
  why: string;
  eventualHome: MissingHome;
  homeLabel: string;
  critical: boolean;
  /** Invent pack already wrote files on disk; the screen control was what was missing. */
  diskFilesOnly?: boolean;
};

export const MISSING_HOME_LABEL: Record<MissingHome, string> = {
  'settings-ai': 'Settings → AI',
  'settings-privacy': 'Settings → Privacy',
  'settings-projects': 'Settings → Projects',
  'settings-providers': 'Settings → Providers',
  'settings-advanced': 'Settings → Advanced / Storage',
  'chat-composer': 'Chat composer chrome',
  'chat-side': 'Chat side panel',
  'code-header': 'Code / project header',
  'live-chrome': 'Live preview chrome',
  workspace: 'Project workspace',
  'nav-tools': 'Sidebar Tools',
  'agents-window': 'Agents Window (new)',
  'new-surface': 'New dedicated surface',
};

/** Static staging list (hand-authored). */
const MISSING_ITEMS_STATIC: MissingItem[] = [
  // —— Agents / orchestra ——
  {
    id: 'agents-window',
    title: 'Agents Window (multi-agent Kanban)',
    why: 'Watch / steer / stop parallel invent & coding workers. AgentsView now mounts Kanban (Writing/Running/Ready/Failed) + Cancel/Retry + CodingWorkerDagPanel + DiffReview latest patch; helper suites remain optional.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents Window',
    critical: true,
  },
  {
    id: 'worker-dag-ui',
    title: 'Coding worker DAG viewer',
    why: 'See explore/implement/review path ownership and reports. CodingWorkerDagPanel is mounted on AgentsView (understand→…→done strip).',
    eventualHome: 'agents-window',
    homeLabel: 'Agents Window',
    critical: true,
  },
  {
    id: 'orb-registry-ui',
    title: 'Orb / cloud machine registry UI',
    why: 'Amp-style orbs no manager UI.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents Window',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'nested-agents-ui',
    title: 'Nested / subagent tree',
    why: 'Spawn + inspect librarian/oracle/tester seats.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents Window',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'peer-messaging-ui',
    title: 'Inter-agent mailbox UI',
    why: 'coding-mailbox agents can’t message in UI.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents Window',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'background-agents-ui',
    title: 'Background / async agents panel',
    why: 'Cursor/Devin-class cloud or desktop background jobs.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents Window',
    critical: true,
  },
  {
    id: 'foreign-cli-ui',
    title: 'Foreign CLI / ACP guest manager',
    why: 'Host Claude Code / Codex / Aider as guests — Claimed in invent packs only — no screen yet.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → ACP guests',
    critical: true,
    diskFilesOnly: true,
  },

  // —— Plan / modes / composer ——
  {
    id: 'mode-switcher',
    title: 'Explicit Ask / Plan / Act / Agent mode switcher',
    why: 'Modes exist in code; need always-visible control like Cursor.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'yolo-autorun',
    title: 'Auto-run tools toggle (ask vs YOLO)',
    why: 'Terminal/edit permission without hunting prefs.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'max-mode',
    title: 'Max / large-context mode toggle',
    why: 'Bigger context + more tool calls for hard invent.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'steer-box',
    title: 'Mid-turn STEER input box',
    why: 'Nudge invent mid-craft without aborting.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'slash-palette',
    title: 'Slash command palette UI',
    why: 'Commands exist; need discoverable palette.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'mention-picker',
    title: '@file / @folder / @git / @web picker',
    why: 'Mentions partial; need picker UI.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'multitask-queue-ui',
    title: 'Multitask / queued prompts UI',
    why: 'Queue exists soft; need visible queue + reorder.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side panel',
    critical: true,
  },

  // —— Diff / apply / checkpoints ——
  {
    id: 'diff-review',
    title: 'Diff review: accept / reject hunk + file',
    why: 'Apply path needs clear review before disk write. DiffReviewPanel is mounted on Agents (latest patch from chatAgentApply stash); still needs pre-write gate in Code overlay.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
  },
  {
    id: 'secret-redaction-banner',
    title: 'Privacy secrets-never-echoed banner',
    why: 'Settings → Privacy now shows an on-page banner that secrets/API keys/.env are never echoed into chat. Deeper redaction toggles remain in HomeControls.',
    eventualHome: 'settings-privacy',
    homeLabel: 'Settings · Privacy',
    critical: true,
  },
  {
    id: 'checkpoints-browser',
    title: 'Checkpoints browser (list / restore / compare)',
    why: 'Rollback works via chat; no visual stack.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat / Code',
    critical: true,
  },
  {
    id: 'running-diff-watch',
    title: 'Running diff watcher',
    why: 'Capstone-style watch while agent edits.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
  },
  {
    id: 'undo-redo-stack',
    title: 'Turn undo / redo stack UI',
    why: 'Undo invent turn + redo.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },

  // —— Memory / rules / scratch ——
  {
    id: 'memory-browser',
    title: 'Memory browser (view / edit / delete / export)',
    why: 'Memory storage paths — no UI.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side / Settings AI',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'scratchpad-panel',
    title: 'Agent scratchpad panel',
    why: '.nova/scratchpad.md has no surface.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side panel',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'dont-touch-editor',
    title: 'Don’t-touch zones editor (Always / Ask / Never)',
    why: 'dont-touch.md need Settings UI.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'rules-editor',
    title: 'Project rules editor (AGENTS.md / always / glob)',
    why: 'Rules need editor + scopes.',
    eventualHome: 'settings-projects',
    homeLabel: 'Settings → Projects',
    critical: true,
  },
  {
    id: 'skills-manager',
    title: 'Skills manager (install / enable / browse)',
    why: 'Partial skills toggles — need full manager.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },
  {
    id: 'hooks-editor',
    title: 'Agent hooks editor (pre/post tool)',
    why: 'Lifecycle hooks no UI.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },

  // —— Settings: safety / shell / net ——
  {
    id: 'terminal-policy',
    title: 'Terminal policy (allow / ask / deny)',
    why: 'Shell safety must be user-visible.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },
  {
    id: 'network-allowlist',
    title: 'Network allowlist (verify + agent egress)',
    why: 'Harness network policy needs UI.',
    eventualHome: 'settings-privacy',
    homeLabel: 'Settings → Privacy',
    critical: true,
  },
  {
    id: 'sandbox-profile',
    title: 'Sandbox profile picker (workspace-write / full)',
    why: 'Sandbox need Settings control.',
    eventualHome: 'settings-privacy',
    homeLabel: 'Settings → Privacy',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'secret-redaction',
    title: 'Secret redaction / scan toggles',
    why: 'Preflight need enable + report UI.',
    eventualHome: 'settings-privacy',
    homeLabel: 'Settings → Privacy',
    critical: true,
  },
  {
    id: 'privacy-mode-cloud',
    title: 'Privacy mode vs cloud agents switch',
    why: 'Local-first vs cloud background mutual exclusion.',
    eventualHome: 'settings-privacy',
    homeLabel: 'Settings → Privacy',
    critical: true,
  },
  {
    id: 'airgap-mode',
    title: 'Air-gapped / offline coding mode',
    why: 'Force local GGUF, block network tools.',
    eventualHome: 'settings-privacy',
    homeLabel: 'Settings → Privacy',
    critical: true,
  },

  // —— Seats / models / budget ——
  {
    id: 'seat-routing-ui',
    title: 'Seat routing map (cheap read / strong edit / vision)',
    why: 'engineSeatSwap mostly invisible.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI / Models',
    critical: true,
  },
  {
    id: 'ensemble-controls',
    title: 'Ensemble / multi-model vote controls',
    why: 'Ensemble parked — need on/off + reviewer family UI.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },
  {
    id: 'budget-caps',
    title: 'Budget / token / $ caps per invent',
    why: 'budget.json no Settings.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'spend-dashboard',
    title: 'Spend / token dashboard',
    why: 'Ring exists; need history + per-project spend.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },
  {
    id: 'model-latency-sla',
    title: 'Model latency SLA / failover rules UI',
    why: 'Failover partial — need editable rules.',
    eventualHome: 'settings-providers',
    homeLabel: 'Settings → Providers',
    critical: true,
  },

  // —— Git / PR / CI ——
  {
    id: 'git-status-chrome',
    title: 'Git status / init / commit chrome (always visible)',
    why: 'Git works in Code; invent Ready needs status chip.',
    eventualHome: 'code-header',
    homeLabel: 'Code header',
    critical: true,
  },
  {
    id: 'worktree-picker',
    title: 'Worktree create / switch / isolate UI',
    why: 'Worktree need picker + isolation.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'pr-draft-ui',
    title: 'Draft PR composer + review UI',
    why: 'draft-pr.md need PR body / push / review.',
    eventualHome: 'code-header',
    homeLabel: 'Code / GitHub',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'ci-autofix-ui',
    title: 'CI log → autofix panel',
    why: 'ci-autofix need paste log + run fix.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'code-review-ui',
    title: 'In-app PR / invent code review UI',
    why: 'PR review pack score — need review pane.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat / Code',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'conflict-resolve-ui',
    title: 'Merge conflict AI resolve UI',
    why: 'No 3-way merge surface.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
  },

  // —— Live / verify / quality ——
  {
    id: 'live-copy-share',
    title: 'Live URL copy + share / tunnel controls',
    why: 'Copy URL added; still need share/tunnel options.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },
  {
    id: 'live-console-panel',
    title: 'Live console / network / perf panels',
    why: 'CDP capture partial — need DevTools-lite in Live.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },
  {
    id: 'live-grade-dashboard',
    title: 'Live grade + evidence dashboard',
    why: 'Grades in status; need persistent evidence UI.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live / invent',
    critical: true,
  },
  {
    id: 'verify-gates-ui',
    title: 'Verify gates board (syntax / a11y / SEO / CWV / tests)',
    why: 'Gates need pass/fail board.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'smoke-runner-ui',
    title: 'Smoke / harness runner UI',
    why: 'Smokes are scripts — need in-app run + report.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → Verify',
    critical: true,
  },
  {
    id: 'visual-regression-ui',
    title: 'Visual / screenshot compare UI',
    why: 'Live screenshot only — need before/after.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },
  {
    id: 'a11y-panel',
    title: 'A11y audit panel (axe walk)',
    why: 'a11y-gate need results UI.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'seo-panel',
    title: 'SEO audit panel (0–100 + fixes)',
    why: 'seo-audit need panel.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
    diskFilesOnly: true,
  },

  // —— Index / search / LSP ——
  {
    id: 'semantic-index-ui',
    title: 'Semantic index status + rebuild UI',
    why: 'Semantic index claim — need status / rebuild.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → Index',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'symbols-outline-ui',
    title: 'Symbols / outline / go-to / find refs UI',
    why: 'Symbols lite need IDE-like outline.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'lsp-diagnostics-ui',
    title: 'LSP / diagnostics stream panel',
    why: 'coding-lsp need live diags list.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'repo-map-ui',
    title: 'Repo map explorer UI',
    why: 'Repo map lite — need visual map.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side',
    critical: true,
  },
  {
    id: 'ckg-ui',
    title: 'Callers / callees / code graph UI',
    why: 'CKG research gap — need graph panel.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },

  // —— Invent / product ——
  {
    id: 'invent-brief-clarify',
    title: 'Invent brief clarify wizard',
    why: 'Clarify before scaffold — UI missing.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat / invent',
    critical: true,
  },
  {
    id: 'invent-redesign-controls',
    title: 'Redesign / re-craft / unbind studio controls',
    why: 'Partial paths — need buttons.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat / invent',
    critical: true,
  },
  {
    id: 'brand-kit-editor',
    title: 'Brand kit editor (colors / type / logo lock)',
    why: 'brand-kit need visual editor.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'design-system-editor',
    title: 'design-system.json editor',
    why: 'Wave4 need editor.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'multi-page-nav-ui',
    title: 'Invent multi-page navigator (#home/#contact/…)',
    why: 'Pages already ship — need Live page switcher.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'image-to-invent-ui',
    title: 'Image → invent drop zone UI',
    why: 'Partial media path — need clear invent entry.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'dual-live-ui',
    title: 'Dual-Live compare (A/B preview)',
    why: 'dual-live need split Live.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'click-to-source-toggle',
    title: 'Click-to-source toggle in Live',
    why: 'inventClickToSource wired — need visible toggle.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },

  // —— Deploy / fullstack / integrations ——
  {
    id: 'deploy-panel',
    title: 'Deploy panel (local / Vercel / Netlify / static)',
    why: 'deploy-descriptor need one-click UI.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'env-editor',
    title: '.env / .env.example editor (masked secrets)',
    why: '.env.example need safe env UI.',
    eventualHome: 'settings-projects',
    homeLabel: 'Settings → Projects',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'api-server-panel',
    title: 'Invent API server start/stop + health',
    why: 'server/ on :8787 — need start button + logs.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'auth-db-panel',
    title: 'Auth + DB scaffold panel',
    why: 'auth.js / db.json — need status + seed UI.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'payments-panel',
    title: 'Payments / Stripe stub panel',
    why: 'payments need keys + test mode UI.',
    eventualHome: 'settings-providers',
    homeLabel: 'Settings → Providers',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'analytics-panel',
    title: 'Analytics opt-in panel',
    why: 'analytics-stub need toggle.',
    eventualHome: 'settings-privacy',
    homeLabel: 'Settings → Privacy',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'i18n-panel',
    title: 'i18n locales manager',
    why: 'i18n need locale list UI.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'pwa-panel',
    title: 'PWA manifest / SW controls',
    why: 'manifest need enable UI.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },

  // —— Automations / schedule ——
  {
    id: 'automations-ui',
    title: 'Automations / scheduled agents UI',
    why: 'automations.json need cron UI.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → Automations',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'quest-mode-ui',
    title: 'Quest / mission mode UI',
    why: 'quest-mode need quest board.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents Window',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'kiro-spec-ui',
    title: 'Spec-driven (Kiro-style) editor',
    why: 'kiro-spec need spec UI.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'trae-builder-ui',
    title: 'Builder / SOLO mode UI',
    why: 'trae-builder need mode UI.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
    diskFilesOnly: true,
  },

  // —— Integrations ——
  {
    id: 'integrations-hub',
    title: 'Integrations hub (GitHub / Linear / Slack / Notion / Discord / Figma / Drive)',
    why: 'Clients exist in lib — no unified hub UI.',
    eventualHome: 'settings-providers',
    homeLabel: 'Tools → Integrations',
    critical: true,
  },
  {
    id: 'figma-import-ui',
    title: 'Figma → invent import UI',
    why: 'figma.ts partial — need import flow.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat / invent',
    critical: true,
  },
  {
    id: 'github-issues-ui',
    title: 'GitHub issues → agent fix UI',
    why: 'Issue→fix research gap — need issue picker.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },

  // —— Debug / observability ——
  {
    id: 'agent-trace-dock',
    title: 'AgentTrace always-docked panel',
    why: 'Panel exists soft — need persistent dock toggle.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side',
    critical: true,
  },
  {
    id: 'work-trace-timeline',
    title: 'WorkTrace timeline full UI',
    why: 'Need expandable timeline of invent steps.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side',
    critical: true,
  },
  {
    id: 'audit-log-viewer',
    title: 'Coding audit log viewer (jsonl)',
    why: 'coding-audit need viewer.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → Audit',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'diagnostics-clinic-ui',
    title: 'Debug clinic / project health UI',
    why: 'debugClinic exists — need dedicated surface.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },
  {
    id: 'stall-watch-ui',
    title: 'Stall watch / craft progress UI',
    why: 'Stall watch soft — need visible timer + abort reasons.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },

  // —— NES / editor ——
  {
    id: 'nes-controls',
    title: 'Next-edit suggest accept / reject / cycle',
    why: 'NES overlay — need clear keybinding UI + tips.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
  },
  {
    id: 'refactor-palette',
    title: 'Refactor palette (extract / rename / inline)',
    why: 'IDE refactors missing as UI actions.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
  },
  {
    id: 'test-gen-button',
    title: 'Generate tests for selection button',
    why: 'Test gen research gap — need action.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
  },

  // —— Mobile / game / stacks ——
  {
    id: 'mobile-promote-ui',
    title: 'Mobile / Expo promote UI',
    why: 'mobile stub need promote flow.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'game-scaffold-ui',
    title: 'Game invent scaffold controls',
    why: 'game need canvas/debug toggles.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'stack-picker',
    title: 'Stack picker (Vite / Next / Python / API+UI)',
    why: 'JS Vite primary — need invent stack choice UI.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat / invent',
    critical: true,
  },

  // —— Team / collab ——
  {
    id: 'collab-presence',
    title: 'Multiplayer / collab presence UI',
    why: 'Multiplayer stub — need presence + share session.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'chat-fork-ui',
    title: 'Chat fork from message UI',
    why: 'Fork need “Fork chat” on messages.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat',
    critical: true,
    diskFilesOnly: true,
  },
  {
    id: 'teammate-seats-ui',
    title: 'Teammate seats manager (full)',
    why: 'TeammateBar partial — need full seat assign UI.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },

  // —— MCP / protocols ——
  {
    id: 'mcp-invent-scopes',
    title: 'MCP per-project / invent scopes',
    why: 'MCP view exists — need invent-scoped grants.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → MCP',
    critical: true,
  },
  {
    id: 'mcp-resources-ui',
    title: 'MCP resources / prompts browser',
    why: 'tools/call partial — need resources+prompts UI.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → MCP',
    critical: true,
  },
  {
    id: 'acp-session-ui',
    title: 'ACP session inspector',
    why: 'ACP need session/new + permission UI.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → ACP',
    critical: true,
    diskFilesOnly: true,
  },

  // —— Onboarding / help ——
  {
    id: 'whats-new-changelog',
    title: 'What’s new / changelog surface in-app',
    why: 'changelog.ts — need dedicated What’s new.',
    eventualHome: 'nav-tools',
    homeLabel: 'Nav / Settings',
    critical: true,
  },
  {
    id: 'keyboard-cheatsheet',
    title: 'Keyboard shortcuts cheatsheet',
    why: 'Power users need discoverable bindings.',
    eventualHome: 'new-surface',
    homeLabel: 'Help overlay',
    critical: true,
  },
  {
    id: 'command-palette',
    title: 'Global command palette (Ctrl+K)',
    why: 'Jump to chat/settings/missing/git/deploy.',
    eventualHome: 'new-surface',
    homeLabel: 'Global palette',
    critical: true,
  },
  {
    id: 'missing-items-nav',
    title: 'Missing items staging tab (this screen)',
    why: 'Parking lot for every control before final placement.',
    eventualHome: 'nav-tools',
    homeLabel: 'Sidebar → Missing items',
    critical: true,
  },

  // —— Wave 3 deep research (Oct 2026) — new UI homes ——
  {
    id: 'task-subagent-launch',
    title: 'Task subagent launch button',
    why: 'Claude Code Task — spawn a focused subagent from chat. No Task UI today.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents',
    critical: true,
  },
  {
    id: 'explore-readonly-mode',
    title: 'Explore subagent (read-only tools)',
    why: 'Field agents get Explore = read-only. Need a clear mode so invent can’t write while exploring.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'per-tool-permissions-ui',
    title: 'Per-tool allow / deny / ask lists',
    why: 'Claude Code–style permissions per tool. Today approval is coarse (YOLO / ask / never).',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },
  {
    id: 'custom-modes-ui',
    title: 'Custom modes (tool restrict)',
    why: 'Cursor Custom Modes — named modes that limit which tools the agent may use.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },
  {
    id: 'custom-agent-md-ui',
    title: 'Custom agent markdown defs browser',
    why: 'Copilot/Claude custom agents as markdown+YAML. Need browse/import UI.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents',
    critical: true,
  },
  {
    id: 'browser-element-pick',
    title: 'Browser control element pick',
    why: 'Cursor-style pick a Live DOM node for the agent. CDP partial — no pick UI.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },
  {
    id: 'parallel-tools-trace',
    title: 'Parallel tool calls visible in trace',
    why: 'Show when the agent runs tools in parallel — Trace soft today.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side / Trace',
    critical: true,
  },
  {
    id: 'agent-todo-checklist',
    title: 'Agent TodoWrite checklist UI',
    why: 'Claude Code TodoWrite — structured checklist the agent updates mid-turn.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side',
    critical: true,
  },
  {
    id: 'clarify-question-gate',
    title: 'Ask clarifying question gate chrome',
    why: 'Agent should pause and ask before risky invent/edit. Needs visible ask UI.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'network-allowlist-editor',
    title: 'Network domain allowlist editor',
    why: 'Pref flag exists — need a real editor for allowed domains.',
    eventualHome: 'settings-privacy',
    homeLabel: 'Settings → Privacy',
    critical: true,
  },
  {
    id: 'dep-install-approval',
    title: 'Dependency install approval gate',
    why: 'npm/pnpm install should ask before running in agent turns.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },
  {
    id: 'bugbot-review-ui',
    title: 'Bugbot-style review panel',
    why: 'Cursor Bugbot / Copilot review — dedicated review surface for invent diffs.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side',
    critical: true,
  },
  {
    id: 'harness-runner-hub',
    title: 'Harness / smoke runner hub (one-click)',
    why: 'Dozens of smoke scripts exist — need one Tools UI to run/green-check them.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → Automations',
    critical: true,
  },
  {
    id: 'image-gen-in-agent',
    title: 'Image generation mid-agent turn',
    why: 'Cursor can gen images in-loop. Invent media path partial — no agent tool UI.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: false,
  },
  {
    id: 'notebook-edit-ui',
    title: 'Notebook / .ipynb cell edit',
    why: 'Claude Code NotebookEdit — out of invent core but coding gap if users drop notebooks.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: false,
  },
  {
    id: 'semantic-search-tool-chrome',
    title: 'Semantic search tool chrome in agent',
    why: 'Index Acc exists — agent needs a visible semantic-search tool + status.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side',
    critical: true,
  },
  {
    id: 'git-ops-agent-chrome',
    title: 'Git ops chrome (branch / commit / PR) in agent',
    why: 'Partial git today — need clear commit/branch/PR actions from chat.',
    eventualHome: 'code-header',
    homeLabel: 'Code / git chrome',
    critical: true,
  },
  {
    id: 'acceptance-stop-ui',
    title: 'Stop when acceptance met indicator',
    why: 'Agent should stop visibly when done criteria hit — doom-loop soft only.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'diff-uncertainty-summary',
    title: 'Diff summary + uncertainty callout',
    why: 'Reviewability: short summary, checks run, what it’s unsure about.',
    eventualHome: 'code-header',
    homeLabel: 'Code / diff review',
    critical: true,
  },
  {
    id: 'mcp-oauth-connect',
    title: 'MCP OAuth connect flow UI',
    why: 'MCP servers that need OAuth — no first-class connect UI.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → MCP',
    critical: true,
  },

  // —— Wave 4–7 research — more UI homes ——
  {
    id: 'agent-queue-reorder',
    title: 'Agent job queue reorder / priority',
    why: 'Drag reorder + priority for multitask queue. Missing UI.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side',
    critical: true,
  },
  {
    id: 'agent-dry-run-mode',
    title: 'Agent dry-run (no writes) mode',
    why: 'Preview patches without writing disk — Missing UI.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer',
    critical: true,
  },
  {
    id: 'settings-search',
    title: 'Settings search filter',
    why: 'Jump to any setting by name — Missing UI.',
    eventualHome: 'settings-advanced',
    homeLabel: 'Settings',
    critical: true,
  },
  {
    id: 'high-contrast-mode',
    title: 'High contrast appearance mode',
    why: 'A11y high-contrast shell — Missing.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → Appearance',
    critical: false,
  },
  {
    id: 'email-template-preview',
    title: 'Email template preview + test send',
    why: 'Invent emails need preview/test-send UI.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },
  {
    id: 'sql-query-console',
    title: 'SQL / DB query console',
    why: 'Postgres/SQLite console for invent apps — Missing.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },
  {
    id: 'live-network-throttle',
    title: 'Live network throttle / offline',
    why: 'DevTools-style 3G/offline for Live preview — Missing.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },
  {
    id: 'live-qr-preview',
    title: 'Live preview QR for phone',
    why: 'Scan to open invent preview on phone — Missing.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: false,
  },
  {
    id: 'code-split-editor',
    title: 'Split editor (H/V) in Code',
    why: 'IDE split panes — Missing in Code overlay.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: false,
  },
  {
    id: 'problems-panel',
    title: 'Problems panel (diagnostics list)',
    why: 'IDE Problems list for invent/project errors.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
  },
  {
    id: 'test-explorer',
    title: 'Test explorer tree + run at cursor',
    why: 'Run/debug tests from a tree — Partial/Missing.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
  },
  {
    id: 'git-stash-ui',
    title: 'Git stash push / pop / list UI',
    why: 'Stash chrome for invent projects.',
    eventualHome: 'code-header',
    homeLabel: 'Code / git chrome',
    critical: true,
  },
  {
    id: 'auth-settings-panel',
    title: 'Auth methods settings panel',
    why: 'Email/OAuth/passkey invent auth — need settings UI (stubs only).',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },
  {
    id: 'stripe-test-mode-banner',
    title: 'Stripe test-mode banner + webhook log',
    why: 'Payments Acc — need visible test mode + webhook log UI.',
    eventualHome: 'settings-providers',
    homeLabel: 'Settings → Providers',
    critical: true,
  },
  {
    id: 'orchestra-merge-arbiter',
    title: 'Orchestra merge arbiter UI',
    why: 'Multi-agent path merge decisions — Missing.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents',
    critical: true,
  },
  {
    id: 'prompt-injection-warn',
    title: 'Prompt injection / untrusted file warn',
    why: 'Warn when agent reads untrusted content — Partial/Missing UI.',
    eventualHome: 'settings-privacy',
    homeLabel: 'Settings → Privacy',
    critical: true,
  },
  {
    id: 'a11y-live-badges',
    title: 'A11y Live issue badges (WCAG checks)',
    why: 'Wave 6 — many a11y checks need Live badges, not just Acc files.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },
  {
    id: 'obs-error-tracking-link',
    title: 'Error tracking / session replay link UI',
    why: 'Sentry/Datadog-style obs hooks — Missing UI for invent apps.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: false,
  },

  // —— Wave 10–14 research ——
  {
    id: 'wcag-live-fail-badges',
    title: 'WCAG criterion Live fail badges',
    why: 'Wave 10 — per-criterion fail badges on Live, not only Acc checks.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },
  {
    id: 'http-status-simulate',
    title: 'HTTP status simulate in Live',
    why: 'Simulate 404/500/etc in preview — Missing UI.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },
  {
    id: 'npm-scripts-runner-ui',
    title: 'npm scripts runner UI',
    why: 'Run package.json scripts from Tools/Code — Missing UI.',
    eventualHome: 'code-header',
    homeLabel: 'Code overlay',
    critical: true,
  },
  {
    id: 'env-vars-editor-ui',
    title: 'Env vars editor (.env) UI',
    why: 'Edit/redact invent env keys — Missing UI.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },
  {
    id: 'release-semver-ui',
    title: 'Release / semver / changelog UI',
    why: 'Bump version + changelog — Missing UI.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → Automations',
    critical: false,
  },
  {
    id: 'security-headers-audit-ui',
    title: 'Security headers audit panel',
    why: 'CSP/HSTS/etc invent audit — Missing UI.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },
  {
    id: 'owasp-report-ui',
    title: 'OWASP Top 10 report UI',
    why: 'Security pass report surface — Missing UI.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },
  {
    id: 'cookie-consent-builder',
    title: 'Cookie consent banner builder',
    why: 'Invent consent/preferences center — Missing UI.',
    eventualHome: 'workspace',
    homeLabel: 'Workspace',
    critical: true,
  },
  {
    id: 'supply-chain-scan-ui',
    title: 'Supply-chain / audit scan UI',
    why: 'npm audit / OSV / license allowlist — Missing UI.',
    eventualHome: 'nav-tools',
    homeLabel: 'Tools → Automations',
    critical: true,
  },
  {
    id: 'chart-invent-picker',
    title: 'Chart type picker for invent',
    why: 'Pick line/bar/pie etc when inventing dashboards.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat / invent',
    critical: false,
  },
  // —— Deep-rescan craft / free-model potential (homes already mounted) ——
  {
    id: 'craft-media-floor-toggle',
    title: 'Craft media floor (logo / heroes / SKU)',
    why: 'Block Ready when invent skips logo, heroes, or product images — matches craft-media Acc floor.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live chrome',
    critical: true,
  },
  {
    id: 'model-potential-meter',
    title: 'Free-model potential % meter',
    why: 'Show how hard free seats are being used (vision/media/polish) vs 1–2% underuse.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },
  {
    id: 'vision-seat-indicator',
    title: 'Vision / media seat indicator',
    why: 'Surface when invent called (or skipped) vision and media seats for product photography.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side panel',
    critical: true,
  },
  {
    id: 'logo-lock-badge',
    title: 'Logo lock badge',
    why: 'Show invent logo lock active so Lucide/family marks cannot overwrite brandAssets.',
    eventualHome: 'code-header',
    homeLabel: 'Code / project header',
    critical: false,
  },
  {
    id: 'underuse-warn-toast',
    title: 'Model underuse warn toast',
    why: 'Warn when invent stops at scaffold or ships gradient-only / emoji-as-photo.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'deep-rescan-loop-status',
    title: 'Deep-rescan research loop status',
    why: 'See matrix size / open gaps / cycle progress from the 10× research loop.',
    eventualHome: 'settings-advanced',
    homeLabel: 'Settings → Advanced / Storage',
    critical: false,
  },

  // —— Peer-rescan A–L (2026-10-23): logic Have, chrome still missing ——
  {
    id: 'coding-pipeline-checklist-mount',
    title: 'Coding pipeline checklist mounted in Chat/Code during create',
    why: 'CodingPipelineChecklist exists (understand→done) but was not mounted in any view — create progress invisible vs Cursor/Claude.',
    eventualHome: 'code-header',
    homeLabel: 'Code / project header',
    critical: true,
  },
  {
    id: 'thin-create-stage-strip',
    title: 'Thin create stage strip (hard-go→ready)',
    why: 'THIN_CREATE_STAGES peer-clean in code; no visible hard-go→scaffold→craft→syntax→npm→live→ready strip in Live/Code chrome.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'edit-pipeline-stage-strip',
    title: 'Edit pipeline stage strip (read→done)',
    why: 'EDIT_PIPELINE_STAGES peer-clean; surgical/edit turns need visible read→propose→apply→anti-bleed→syntax→done progress.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'agent-loop-stage-strip',
    title: 'Agent loop stage strip (map→done)',
    why: 'AGENT_LOOP_STAGES + read-before-edit/doom-loop Have in loop; no Agents/Chat chrome showing map→read→write→verify→evidence→done.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents Window',
    critical: true,
  },
  {
    id: 'pass-spine-ready-strip',
    title: 'Pass spine Ready strip (plan→critic)',
    why: 'CREATE_PASS_ORDER + briefVerify wired; operators cannot see which pass failed Ready without reading logs.',
    eventualHome: 'code-header',
    homeLabel: 'Code / project header',
    critical: true,
  },
  {
    id: 'runtime-stages-strip',
    title: 'Create runtime stages strip (plan→verified)',
    why: 'CREATE_RUNTIME_STAGES aligned with thin/quality; Live chrome still lacks plan→scaffold→craft→preflight→install→live→fix→verified.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'ready-block-reasons-panel',
    title: 'Ready blocked reasons panel',
    why: 'Harness/quality/floor gates reject Ready in code; UI must show why (floor, brief miss, harness, syntax) so Live invent is debuggable.',
    eventualHome: 'code-header',
    homeLabel: 'Code / project header',
    critical: true,
  },
  {
    id: 'progress-md-viewer',
    title: 'PROGRESS.md harness viewer',
    why: 'HARNESS_PACK.progressMd writes PROGRESS.md on create; no in-app viewer like OpenHands progress.',
    eventualHome: 'workspace',
    homeLabel: 'Project workspace',
    critical: false,
  },
  {
    id: 'design-md-tokens-settings',
    title: 'DESIGN.md / design tokens settings',
    why: 'Peer gap from coding inventory — soft DESIGN.md tokens + premium verify still behind Cursor/v0; needs Settings + craft surface.',
    eventualHome: 'settings-ai',
    homeLabel: 'Settings → AI',
    critical: true,
  },
  {
    id: 'invent-demo-block-badge',
    title: 'Invent-demo twin blocked badge',
    why: 'Invent-demo removed and Ready blocked on leftover markers; Live/Code should badge “host twin blocked — invent from brief”.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'agent-read-before-edit-chip',
    title: 'Read-before-edit gate chip',
    why: 'readBeforeEditAllowed blocks patch/write; agent UI should show Read first when a write was refused.',
    eventualHome: 'agents-window',
    homeLabel: 'Agents Window',
    critical: false,
  },
  {
    id: 'doom-loop-breaker-toast',
    title: 'Doom-loop breaker toast',
    why: 'doomLoopGuard trips in agent loop; no toast/status when thin rewrite x3 breaks the loop.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: false,
  },
  {
    id: 'live-invent-prove-status',
    title: 'Live invent prove status (create→Live→Ready)',
    why: 'Peer smokes pass without Live; need a visible Live invent prove run status so product quality is not theater.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'brief-fidelity-live-chip',
    title: 'Brief fidelity fail chip on Live',
    why: 'Cedar Quill Live invent shipped generic cards without brand/books — need Live chrome chip when verifyCreateBriefAgainstFiles / invent fidelity fails.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'undeclared-collection-gate-toast',
    title: 'Undeclared collection gate toast',
    why: 'Live invent App used cards.map without const cards (blank Live). Syntax gate now rejects; toast should surface the fail reason in Chat.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'invent-vs-card-ladder-guard',
    title: 'Invent vs Card-one ladder guard indicator',
    why: 'Create briefs with “book cards/grid” were classified as UI-shell micro and stamped Card one over invent. Guard fixed in webProjectCanon; show when invent path won vs ladder.',
    eventualHome: 'chat-side',
    homeLabel: 'Chat side panel',
    critical: true,
  },
  {
    id: 'compositional-hero-mount-chip',
    title: 'Compositional HeroSection mount chip',
    why: 'Amber Quill invent wrote HeroSection.jsx with brand but App.jsx never imported it — Live chrome should flag unused section modules.',
    eventualHome: 'code-header',
    homeLabel: 'Code / project header',
    critical: true,
  },
  {
    id: 'placeholder-book-titles-ready-block',
    title: 'Placeholder book titles Ready block',
    why: 'Book grid shipped “Book One / Author A” placeholders — Ready should fail until invent titles match brief shelf.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'auth-hmr-shell-recovery',
    title: 'Auth HMR shell recovery indicator',
    why: 'Vite HMR briefly threw useAuth outside AuthProvider and ErrorBoundary white-screened Chat during Live invent. Soft guest fallback + invalidate added; optional status chip in Settings.',
    eventualHome: 'settings-advanced',
    homeLabel: 'Settings → Advanced / Storage',
    critical: false,
  },
  {
    id: 'live-wait-vite-npm-chip',
    title: 'Live waits for npm/vite chip',
    why: 'Premium Live invent proved App on disk before node_modules/vite existed — Live click raced npm. Prove script now waits; Chat should show Installing… until vite is on disk.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'thin-hero-mount-floor',
    title: 'Thin Hero mount floor chip',
    why: 'Sable Forge Hero.jsx (~164 compact) failed the 180 substantial special-case so App never imported it. Mountable floor is now 100; depth still tops up. Live should flag when Hero file exists but is under premium depth.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'thin-hero-premium-topup',
    title: 'Thin Hero premium top-up chip',
    why: 'Pine Latch invent overwrote invent-floor hero with title+lede stub (~240 compact). Old 180 substantial + landed≥2 early-exit skipped salvage; Live thin-hero miss. Floor now always tops hero to 280 and depth uses the same premium bar.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'cdp-composer-after-reload',
    title: 'CDP composer wait after reload',
    why: 'Ash Latch fail-loop: hard reload + create hop threw no textarea before invent ran, then scorer blamed a stale meridian folder. Prove/harness now waits 45s for composer and only scores brand-matched disk.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'cdp-brand-needle-disk',
    title: 'CDP brand needle + disk match',
    why: 'Ash Latch iter-10 matched a stale Pine Latch create reply (shared "Create a new website project called " needle) and diskCandidates atelier|pine catch-all attached the wrong Live. Needle now includes brand; disk match is slug-only.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'create-spine-12-chrome',
    title: 'Create spine 12-stage chrome strip',
    why: 'Create spine (Go→Brief→…→Ready) used to sit above the composer as a full 12-chip strip. Now progressive chips (last ≤3) live inside the Working activity dropdown; composer strip removed.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'pagebody-import-rewrite-toast',
    title: 'PageBody import rewrite toast',
    why: 'Fat App carved to src/sections/PageBodySection.jsx kept ./sections/Hero imports → Vite failed resolve → kids:0 Live. Rewrite + drop-when-dupes fixed; Chat should toast when carve rewrote paths.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'atelier-parchment-palette-heal',
    title: 'Parchment atelier palette heal chip',
    why: 'healNearReady / wirePublic stamped dark #0c0f14 SaaS atmosphere and cream→#0f1419 onto parchment/leather atelier briefs (Fern Latch). Permanent briefWantsLightPaperGround + healAtelierPaletteCss; Chat should chip when atelier-palette-heal runs.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'footer-always-remount',
    title: 'Footer/Contact remount chip',
    why: 'ensureLanded skipped lone Footer (Hero-or-≥2 only) and short footers failed the 300-char landed gate — Live without contact. Always remount any omitted section + THIN_FOOTER_MOUNTABLE_MIN_CHARS; chip when Footer mounts late.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'app-shell-context-import-heal',
    title: 'App.jsx ../context import heal',
    why: 'PageBody rewrite (./context/session → ../context/session) leaked onto App.jsx so Vite resolved outside src → kids:0. healAppShellRelativeImports + healSectionRelativeImports on assemble/syntax gate; block Live when App still has ../context.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'unresolved-relative-import-gate',
    title: 'Unresolved relative import Ready gate',
    why: 'ProductGrid imported ../data/products that never landed — blank Live overlay. Syntax gate now heals/seeds or blocks Ready; show the fail reason in Live chrome.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'bare-scaffold-invent-floor',
    title: 'Bare scaffold invent-floor chip',
    why: 'Copper Loom invent left Bare Vite / sticky-nav-only App with zero sections; Live opened empty. Invent-floor salvage + bare-scaffold Live block added; Chat should chip when salvage runs.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'live-empty-paint-gate',
    title: 'Live empty-paint gate',
    why: 'Prove passed mounted:true with textLen 0 and broken overlay. Live chrome / prove must require visible text, not just a root kid.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'scaffold-invent-floor-early',
    title: 'Scaffold invent-floor early chip',
    why: 'Amber Bridle create timed out on bare Vite with no brand in App — late salvage never ran. Invent floor now seeds on scaffold; Chat should chip when early floor lands before invent finishes.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'early-npm-while-invent',
    title: 'Early npm-while-invent chip',
    why: 'Moss Thread invent hung ~12m so late npm never ran — package.json on disk, zero node_modules. Early npm kick now runs after scaffold; Chat should show Installing… in parallel with invent.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'invent-enrich-wall-after-floor',
    title: 'Invent enrich wall after floor',
    why: 'Invent kept thrashing after invent-floor Acc was already on disk (~12m, no final reply). 3m enrich wall now finishes create; show Enrich wall… status in Chat.',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
  {
    id: 'section-css-visual-ledger',
    title: 'Section CSS in visual ledger chip',
    why: 'Premium bar blocked invent-floor Acc because cssCompact ignored src/sections/*.css (117 vs 1600). Ledger now counts section CSS; Live chrome can show visual-floor breakdown.',
    eventualHome: 'live-chrome',
    homeLabel: 'Live preview chrome',
    critical: true,
  },
  {
    id: 'invent-floor-fast-path-live',
    title: 'Invent-floor fast-path Live chip',
    why: 'River Hide: vite+floor Acc on disk but invent hung 12m so Live control never appeared. Fast-path skips long invent when floor clears visual bar; Chat should chip Fast-path…',
    eventualHome: 'chat-composer',
    homeLabel: 'Chat composer chrome',
    critical: true,
  },
];

/** Full list = static + coding-deep discoveries (dedupe by id). */
export const MISSING_ITEMS: MissingItem[] = (() => {
  const map = new Map<string, MissingItem>();
  for (const item of MISSING_ITEMS_STATIC) map.set(item.id, item);
  for (const item of DISCOVERED_MISSING_ITEMS) {
    if (!map.has(item.id)) map.set(item.id, item);
  }
  return [...map.values()];
})();

const PLACED_KEY = 'nova-missing-items-placed-v1';

export function loadMissingPlaced(): Set<string> {
  try {
    const raw = localStorage.getItem(PLACED_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

export function saveMissingPlaced(ids: Set<string>): void {
  try {
    localStorage.setItem(PLACED_KEY, JSON.stringify([...ids]));
    window.dispatchEvent(new Event('NOVA:missing-items-changed'));
  } catch { /* ignore */ }
}

export function countMissingOpen(): number {
  const placed = loadMissingPlaced();
  return MISSING_ITEMS.filter((i) => !placed.has(i.id)).length;
}

export function missingByHome(): Record<MissingHome, MissingItem[]> {
  const out = {} as Record<MissingHome, MissingItem[]>;
  for (const item of MISSING_ITEMS) {
    (out[item.eventualHome] ||= []).push(item);
  }
  return out;
}

const HOMES_PLACED_BOOT_KEY = 'nova-missing-homes-boot-placed-v2';

/**
 * One-shot: every catalog control now has a mounted home in the shell.
 * Marks all Placed so Missing items staging can empty / show placed.
 */
export function placeAllMissingHomesOnce(): { placed: number; already: boolean } {
  try {
    if (localStorage.getItem(HOMES_PLACED_BOOT_KEY) === '1') {
      // Still pick up NEW coding-deep discoveries routed to homes.
      return { ...placeRoutedMissingDiscoveries(), already: true };
    }
    const next = new Set(loadMissingPlaced());
    for (const item of MISSING_ITEMS) next.add(item.id);
    saveMissingPlaced(next);
    localStorage.setItem(HOMES_PLACED_BOOT_KEY, '1');
    return { placed: next.size, already: false };
  } catch {
    return { placed: 0, already: false };
  }
}

/**
 * Milestone / coding-deep: any item with an eventualHome is considered routed
 * into that Settings / Agents / Live / composer panel (HomeControlsPanel).
 * Marks new ids Placed without wiping open manual work.
 */
export function placeRoutedMissingDiscoveries(): { placed: number; added: number } {
  try {
    const next = new Set(loadMissingPlaced());
    const before = next.size;
    for (const item of MISSING_ITEMS) {
      if (item.eventualHome) next.add(item.id);
    }
    const added = next.size - before;
    if (added > 0) saveMissingPlaced(next);
    return { placed: next.size, added };
  } catch {
    return { placed: 0, added: 0 };
  }
}
