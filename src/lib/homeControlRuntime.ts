/**
 * Runtime for Missing-items / HomeControls toggles.
 * Agents & invent paths can ask isHomeControlOn(id) before enabling a surface.
 */
import { getLocalPrefs } from '@/lib/localPrefs';

const TOGGLE_KEY = 'NOVA:home-control-toggles-v1';

function readToggles(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(TOGGLE_KEY);
    const parsed = raw ? JSON.parse(raw) as Record<string, boolean> : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Pref-backed controls share truth with Settings. */
function boundValue(id: string): boolean | null {
  const p = getLocalPrefs();
  switch (id) {
    case 'yolo-autorun':
      return p.approvalPolicy === 'never' || p.approvalPolicy === 'auto';
    case 'terminal-policy':
      return p.approvalPolicy === 'on-request';
    case 'sandbox-profile':
      return p.sandboxMode === 'workspace-write' || p.sandboxMode === 'full-access';
    case 'network-allowlist':
    case 'network-allowlist-editor':
      return p.networkDenyByDefault;
    case 'privacy-mode-cloud':
      return p.aiMode === 'local_only';
    case 'airgap-mode':
      return p.aiMode === 'local_only' && p.networkDenyByDefault;
    case 'analytics-panel':
      return p.shareUsageStats;
    case 'secret-redaction':
      return Boolean(p.sandboxAgent);
    default:
      return null;
  }
}

/**
 * True when this helper is active on this PC.
 * Product helpers default On (plug-and-play). Opt-in safety modes stay Off until chosen.
 */
export function isHomeControlOn(id: string): boolean {
  const bound = boundValue(id);
  if (bound !== null) return bound;
  const toggles = readToggles();
  if (Object.prototype.hasOwnProperty.call(toggles, id)) return Boolean(toggles[id]);
  if (id === 'explore-readonly-mode' || id === 'agent-dry-run-mode') return false;
  return true;
}

/** Explore / dry-run: agent must not write disk. */
export function agentWritesBlocked(): boolean {
  return isHomeControlOn('explore-readonly-mode') || isHomeControlOn('agent-dry-run-mode');
}

/** YOLO / auto-run tools. */
export function agentAutoRunTools(): boolean {
  return isHomeControlOn('yolo-autorun');
}
