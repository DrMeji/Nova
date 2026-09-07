import { Link } from 'react-router-dom';
import { ArkMark } from './ArkMark';

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--line)] bg-[var(--footer-bg)]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 py-12">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2.5 mb-3 text-[var(--fg)]">
              <ArkMark size={26} />
              <span className="display text-lg font-semibold">NOVA</span>
            </div>
            <p className="text-sm text-[var(--fg-muted)] leading-relaxed max-w-xs">
              AI creation studio for your PC. Local brains, free cloud keys, and projects that stay on your disk.
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--fg-muted)] mb-3">Product</p>
            <ul className="space-y-2 text-sm text-[var(--fg-muted)]">
              <li>
                <Link to="/download" className="hover:text-[var(--fg)] transition-colors">
                  Download
                </Link>
              </li>
              <li>
                <a href="/#features" className="hover:text-[var(--fg)] transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="/#how" className="hover:text-[var(--fg)] transition-colors">
                  How it works
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--fg-muted)] mb-3">Legal</p>
            <ul className="space-y-2 text-sm text-[var(--fg-muted)]">
              <li>
                <Link to="/privacy" className="hover:text-[var(--fg)] transition-colors">
                  Privacy
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <p className="mt-10 pt-6 border-t border-[var(--line)] text-xs text-[var(--fg-muted)] text-center">
          © {new Date().getFullYear()} NOVA. Desktop app on Windows.
        </p>
      </div>
    </footer>
  );
}
