/**
 * Apply appearance / motion prefs that Settings saves but the shell must enact.
 */
import { getLocalPrefs, type AccentPref } from '@/lib/localPrefs';

const ACCENT_RGB: Record<AccentPref, string> = {
  sky: '56 189 248',
  emerald: '52 211 153',
  amber: '251 191 36',
  rose: '251 113 133',
};

export function applyLocalAppearancePrefs(): void {
  if (typeof document === 'undefined') return;
  const prefs = getLocalPrefs();
  const root = document.documentElement;
  const rgb = ACCENT_RGB[prefs.accent] || ACCENT_RGB.sky;
  root.style.setProperty('--color-accent', rgb);
  root.dataset.accent = prefs.accent;
  root.dataset.reduceMotion = prefs.reduceMotion ? '1' : '0';
  root.classList.toggle('reduce-motion', Boolean(prefs.reduceMotion));
  root.dataset.chatFirst = prefs.chatFirst ? '1' : '0';
  const blur = Math.max(0, Math.min(24, Math.round(Number(prefs.orbBlurPx) || 0)));
  root.style.setProperty('--auth-orb-blur', `${blur}px`);
}
