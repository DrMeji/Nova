import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Fun = dark + moving orbs. Dark/Light/Gray = static (no orbs). */
export type Theme = 'fun' | 'dark' | 'light' | 'gray';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_ORDER: Theme[] = ['fun', 'dark', 'light', 'gray'];

function parseTheme(raw: string | null): Theme {
  if (raw === 'fun' || raw === 'dark' || raw === 'light' || raw === 'gray') return raw;
  return 'fun';
}

/**
 * One-time: people who had "dark" (with orbs) keep that look as Fun.
 * After migration, Dark is the static black theme.
 */
function migrateStoredTheme(): Theme {
  const key = 'nova-theme';
  const migratedKey = 'nova-theme-fun-split-v1';
  try {
    if (!localStorage.getItem(migratedKey)) {
      const raw = localStorage.getItem(key);
      if (raw === 'dark') {
        localStorage.setItem(key, 'fun');
      }
      localStorage.setItem(migratedKey, '1');
    }
  } catch { /* ignore */ }
  return parseTheme(localStorage.getItem(key));
}

function applyThemeToDom(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark', 'gray', 'fun');
  root.dataset.novaTheme = theme;

  let prefsReduce = false;
  try {
    const prefs = JSON.parse(localStorage.getItem('NOVA:local-prefs') || '{}') as { reduceMotion?: boolean };
    prefsReduce = Boolean(prefs.reduceMotion);
  } catch { /* ignore */ }

  if (theme === 'light') {
    root.classList.add('light');
    // Light is static — no colorful motion layer in the shell.
    root.classList.add('reduce-motion');
    root.dataset.reduceMotion = '1';
  } else if (theme === 'gray') {
    root.classList.add('gray', 'dark', 'reduce-motion');
    root.dataset.reduceMotion = '1';
  } else if (theme === 'fun') {
    root.classList.add('dark', 'fun');
    if (!prefsReduce) {
      root.classList.remove('reduce-motion');
      root.dataset.reduceMotion = '0';
    } else {
      root.classList.add('reduce-motion');
      root.dataset.reduceMotion = '1';
    }
  } else {
    // Dark — same black palette as Fun, but calm (no orbs).
    root.classList.add('dark');
    root.classList.add('reduce-motion');
    root.dataset.reduceMotion = '1';
  }

  localStorage.setItem('nova-theme', theme);
  window.dispatchEvent(new Event('nova:theme-changed'));
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => migrateStoredTheme());

  useEffect(() => {
    applyThemeToDom(theme);
  }, [theme]);

  const toggleTheme = () =>
    setThemeState((prev) => {
      const i = THEME_ORDER.indexOf(prev);
      return THEME_ORDER[(i + 1) % THEME_ORDER.length]!;
    });
  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
