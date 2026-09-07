import { Link } from 'react-router-dom';
import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { SiteBackdrop } from '../components/SiteBackdrop';

export function PrivacyPage() {
  return (
    <div className="site">
      <SiteBackdrop />
      <SiteHeader />
      <main className="site-main px-5 sm:px-8 py-12 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <h1 className="display text-4xl font-semibold tracking-tight text-[var(--fg)] mb-4">Privacy</h1>
          <p className="text-[var(--fg-muted)] leading-relaxed mb-6">
            What you build with NOVA belongs to you. NOVA does not claim ownership of your projects, files, or creations.
            We do not take a cut of your work, and we do not treat your output as ours.
          </p>
          <ul className="space-y-3 text-sm text-[var(--fg-muted)] leading-relaxed list-disc pl-5 mb-8">
            <li>
              Your projects and files stay on your computer. NOVA does not upload them to take ownership or sell them.
            </li>
            <li>
              API keys you add for cloud models are stored on your device. We do not keep copies of those keys for our
              own use.
            </li>
            <li>
              Account details (like email) exist only so you can sign in and use optional features such as friends. We
              do not harvest your creative work from those features.
            </li>
            <li>We do not steal your information. Your work remains yours.</li>
            <li>Diagnostics stay off unless you turn them on in Settings.</li>
          </ul>
          <p className="text-sm text-[var(--fg-muted)] leading-relaxed mb-8">
            In short: NOVA helps you create. You own what you make.
          </p>
          <p className="text-sm text-[var(--fg-muted)]">
            <Link to="/" className="text-[var(--accent)] hover:underline">
              Back home
            </Link>
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
