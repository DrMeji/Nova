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

/** Max soft blur while Reduce motion is on (user's orbBlurPx is preserved for restore). */
export const REDUCE_MOTION_ORB_BLUR_PX = 24;

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

  // User's slider value is always stored in prefs.orbBlurPx.
  // Reduce motion forces max soft/dim blur on screen without overwriting that choice.
  const stored = Math.max(0, Math.min(24, Math.round(Number(prefs.orbBlurPx) || 0)));
  const blur = prefs.reduceMotion ? REDUCE_MOTION_ORB_BLUR_PX : stored;
  const soft = blur / 24;
  const authOpacity = (0.78 - soft * 0.5).toFixed(3);
  const appOpacity = (0.62 - soft * 0.42).toFixed(3);
  root.style.setProperty('--auth-orb-blur', `${blur}px`);
  root.style.setProperty('--auth-orb-opacity', authOpacity);
  root.style.setProperty('--auth-orb-app-opacity', appOpacity);
}
