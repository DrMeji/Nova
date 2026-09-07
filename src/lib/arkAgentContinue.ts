/**
 * Persist / resume Level-B agent loop after step-cap (Continue).
 */

export type AgentContinueState = {
  chatKey: string;
  brief: string;
  observations: string[];
  updated: string[];
  projectId: string;
  projectName: string;
  diskRoot?: string | null;
  at: number;
};

const PREFIX = 'NOVA:agent-continue:';

export function agentContinueKey(chatKey: string): string {
  return `${PREFIX}${chatKey || 'chat'}`;
}

export function saveAgentContinue(state: AgentContinueState): void {
  try {
    sessionStorage.setItem(agentContinueKey(state.chatKey), JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function loadAgentContinue(chatKey: string): AgentContinueState | null {
  try {
    const raw = sessionStorage.getItem(agentContinueKey(chatKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AgentContinueState;
    if (!parsed?.brief || !Array.isArray(parsed.observations)) return null;
    // Expire after 2 hours
    if (Date.now() - Number(parsed.at || 0) > 2 * 60 * 60_000) {
      clearAgentContinue(chatKey);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearAgentContinue(chatKey: string): void {
  try {
    sessionStorage.removeItem(agentContinueKey(chatKey));
  } catch {
    /* ignore */
  }
}

export function looksLikeAgentContinueAsk(text: string): boolean {
  return /^\s*continue\b/i.test(String(text || '').trim())
    || /\b(continue|resume)\s+(the\s+)?(agent|task|loop)\b/i.test(String(text || ''));
}
