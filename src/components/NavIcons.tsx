/**
 * Sidebar / nav icons — Lucide stroke set (24×24, strokeWidth 2) plus a few
 * custom glyphs that already match that weight. Fill-based Iconify packs
 * (Clarity / Simple Icons / Octicon / Material / Stash) were optically too
 * thick or too skinny next to Lucide, so Plugins / Local AI / MCP /
 * Automations / Integrations use Lucide outlines instead.
 */
import type { SVGProps } from 'react';
import { BrainCircuit, Cable, GitFork, MonitorPlay, Puzzle, Workflow } from 'lucide-react';

export type NavIconProps = SVGProps<SVGSVGElement> & { className?: string };

const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
  focusable: false as const,
};

const lucideNav = { size: 24 as const, strokeWidth: 2 as const, 'aria-hidden': true as const };

/** ri:chat-ai-line — Chat */
export function IconChatAi({ className, ...rest }: NavIconProps) {
  return (
    <svg {...base} className={className} fill="currentColor" {...rest}>
      <path d="m20.713 8.128l-.246.566a.506.506 0 0 1-.934 0l-.246-.566a4.36 4.36 0 0 0-2.22-2.25l-.759-.339a.53.53 0 0 1 0-.963l.717-.319a4.37 4.37 0 0 0 2.251-2.326l.253-.611a.506.506 0 0 1 .942 0l.253.61a4.37 4.37 0 0 0 2.25 2.327l.718.32a.53.53 0 0 1 0 .962l-.76.338a4.36 4.36 0 0 0-2.219 2.251M10 3h4v2h-4a6 6 0 0 0-6 6c0 3.61 2.462 5.966 8 8.48V17h2a6 6 0 0 0 6-6h2a8 8 0 0 1-8 8v3.5c-5-2-12-5-12-11.5a8 8 0 0 1 8-8" />
    </svg>
  );
}

/** codicon:project — Projects (scaled from 16→24 viewBox) */
export function IconProject({ className, ...rest }: NavIconProps) {
  return (
    <svg {...base} className={className} fill="currentColor" viewBox="0 0 16 16" {...rest}>
      <path d="M4 1a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V4a3 3 0 0 0-3-3zM2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2zm0 1h12v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z" />
    </svg>
  );
}

/** lucide hat-glasses — Agents */
export function IconAgents({ className, ...rest }: NavIconProps) {
  return (
    <svg
      {...base}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M14 18a2 2 0 0 0-4 0" />
      <path d="m19 11-2.11-6.657a2 2 0 0 0-2.752-1.148l-1.276.61A2 2 0 0 1 12 4H8.5a2 2 0 0 0-1.925 1.456L5 11" />
      <path d="M2 11h20" />
      <circle cx="17" cy="18" r="3" />
      <circle cx="7" cy="18" r="3" />
    </svg>
  );
}

/** Lucide Puzzle — Plugins (outline weight matches rail) */
export function IconPlugins({ className }: NavIconProps) {
  return <Puzzle className={className} {...lucideNav} />;
}

/** Lucide BrainCircuit — Models (new glyph; cpu-ai moved to Local AI) */
export function IconModelsCpuAi({ className }: NavIconProps) {
  return <BrainCircuit className={className} {...lucideNav} />;
}

/** lucide cpu-ai — Local AI (was Models) */
export function IconLocalAi({ className, ...rest }: NavIconProps) {
  return (
    <svg
      {...base}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M12 20v2" />
      <path d="M12 2v2" />
      <path d="M16 9v6" />
      <path d="M17 20v2" />
      <path d="M17 2v2" />
      <path d="M2 12h2" />
      <path d="M2 17h2" />
      <path d="M2 7h2" />
      <path d="M20 12h2" />
      <path d="M20 17h2" />
      <path d="M20 7h2" />
      <path d="M7 20v2" />
      <path d="M7 2v2" />
      <path d="M8 13h4" />
      <path d="M8 15v-4a2 2 0 0 1 4 0v4" />
      <rect x="4" y="4" width="16" height="16" rx="2" />
    </svg>
  );
}

/** Lucide Cable — MCP */
export function IconMcp({ className }: NavIconProps) {
  return <Cable className={className} {...lucideNav} />;
}

/** Lucide Workflow — Automations */
export function IconAutomations({ className }: NavIconProps) {
  return <Workflow className={className} {...lucideNav} />;
}

/** Lucide GitFork — Integrations */
export function IconIntegrations({ className }: NavIconProps) {
  return <GitFork className={className} {...lucideNav} />;
}

/** Lucide MonitorPlay — Test device (VM) */
export function IconTestDevice({ className }: NavIconProps) {
  return <MonitorPlay className={className} {...lucideNav} />;
}

/** mynaui:notification — Notifications */
export function IconNotifications({ className, ...rest }: NavIconProps) {
  return (
    <svg
      {...base}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M21 5.75a2.75 2.75 0 1 1-5.5 0a2.75 2.75 0 0 1 5.5 0M11.5 3H9.4c-2.24 0-3.36 0-4.216.436a4 4 0 0 0-1.748 1.748C3 6.04 3 7.16 3 9.4v5.2c0 2.24 0 3.36.436 4.216a4 4 0 0 0 1.748 1.748C6.04 21 7.16 21 9.4 21h5.2c2.24 0 3.36 0 4.216-.436a4 4 0 0 0 1.748-1.748C21 17.96 21 16.84 21 14.6v-2.1" />
    </svg>
  );
}

/** mingcute:comment-2-line — Message */
export function IconMessage({ className, ...rest }: NavIconProps) {
  return (
    <svg
      {...base}
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M18.419 9A8.003 8.003 0 0 0 3 12c0 1.65.5 3.184 1.356 4.457l-.912 3.099l3.099-.912A7.95 7.95 0 0 0 10 19.938m2-3.438a4.5 4.5 0 0 0 7.007 3.737l1.743.513l-.513-1.743A4.5 4.5 0 1 0 12 16.5" />
    </svg>
  );
}
