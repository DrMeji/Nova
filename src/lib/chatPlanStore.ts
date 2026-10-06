/**
 * Active Plan outline per chat — one synced plan (not duplicated in every bubble).
 */

import type { PlanReport } from '@/lib/planReport';

function planKey(chatId: string) {
  return `NOVA:chat-plan:${chatId}`;
}

function planPillKey(chatId: string) {
  return `NOVA:chat-plan-pill:${chatId}`;
}

export function saveChatPlan(chatId: string, report: PlanReport): void {
  const id = String(chatId || '').trim();
  if (!id || !report?.steps?.length) return;
  try {
    localStorage.setItem(planKey(id), JSON.stringify({
      title: report.title,
      summary: report.summary,
      intro: report.intro,
      steps: report.steps,
      questions: report.questions || [],
      compare: report.compare || null,
      updatedAt: Date.now(),
    }));
    localStorage.setItem(planPillKey(id), '1');
    window.dispatchEvent(new CustomEvent('NOVA:plan-updated', { detail: { chatId: id } }));
  } catch { /* ignore */ }
}

export function loadChatPlan(chatId: string | null | undefined): PlanReport | null {
  const id = String(chatId || '').trim();
  if (!id) return null;
  try {
    const raw = localStorage.getItem(planKey(id));
    if (!raw) return null;
    const data = JSON.parse(raw) as PlanReport;
    if (!data?.title || !Array.isArray(data.steps)) return null;
    return {
      title: String(data.title || 'Build plan'),
      summary: String(data.summary || ''),
      intro: data.intro ? String(data.intro) : undefined,
      steps: data.steps,
      questions: Array.isArray(data.questions) ? data.questions.map(String) : [],
      compare: data.compare || undefined,
    };
  } catch {
    return null;
  }
}

export function clearChatPlan(chatId: string): void {
  const id = String(chatId || '').trim();
  if (!id) return;
  try {
    localStorage.removeItem(planKey(id));
    localStorage.removeItem(planPillKey(id));
    window.dispatchEvent(new CustomEvent('NOVA:plan-updated', { detail: { chatId: id } }));
  } catch { /* ignore */ }
}

export function setChatPlanPill(chatId: string, on = true): void {
  const id = String(chatId || '').trim();
  if (!id) return;
  try {
    if (on) localStorage.setItem(planPillKey(id), '1');
    else localStorage.removeItem(planPillKey(id));
  } catch { /* ignore */ }
}

export function hasChatPlanPill(chatId: string | null | undefined): boolean {
  const id = String(chatId || '').trim();
  if (!id) return false;
  try {
    if (localStorage.getItem(planPillKey(id)) === '1') return true;
    return Boolean(loadChatPlan(id)?.steps?.length);
  } catch {
    return false;
  }
}

export function subscribeChatPlan(chatId: string, onChange: () => void): () => void {
  const id = String(chatId || '').trim();
  const handler = (ev: Event) => {
    const detail = (ev as CustomEvent<{ chatId?: string }>).detail;
    if (!detail?.chatId || detail.chatId === id) onChange();
  };
  window.addEventListener('NOVA:plan-updated', handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener('NOVA:plan-updated', handler);
    window.removeEventListener('storage', handler);
  };
}
