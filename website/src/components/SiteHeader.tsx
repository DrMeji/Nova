import { Link, NavLink } from 'react-router-dom';
import { useTheme } from '../lib/theme';
import { useAuth } from '../lib/auth';
import { ArkMark } from './ArkMark';
import { ProfileMenu } from './ProfileMenu';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `text-sm font-medium transition-colors ${
    isActive ? 'text-[var(--fg)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
  }`;

export function SiteHeader() {
  const { theme, toggleTheme } = useTheme();
  const { user, openSignIn } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--header-bg)] backdrop-blur-xl">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2.5 min-w-0 text-[var(--fg)]">
          <ArkMark size={30} className="shrink-0" />
          <span className="display text-lg font-semibold tracking-tight">ARK</span>
        </Link>

        <nav className="hidden sm:flex items-center gap-7">
          <a href="/#features" className="text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors">
            Features
          </a>
          <a href="/#how" className="text-sm font-medium text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors">
            How it works
          </a>
          <NavLink to="/download" className={linkClass}>
            Download
          </NavLink>
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={toggleTheme}
            className="h-9 w-9 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:border-[var(--line-strong)] flex items-center justify-center transition-colors"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          >
            {theme === 'dark' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path d="M21 14.5A8.5 8.5 0 1 1 12.5 3a7 7 0 0 0 8.5 11.5z" />
              </svg>
            )}
          </button>
          {user ? (
            <ProfileMenu />
          ) : (
            <button type="button" className="btn btn-primary btn-compact" onClick={openSignIn}>
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
