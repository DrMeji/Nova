import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { SiteBackdrop } from '../components/SiteBackdrop';
import { RELEASES_URL } from '../lib/constants';

export function DownloadPage() {
  return (
    <div className="site">
      <SiteBackdrop />
      <SiteHeader />
      <main className="site-main">
        <section className="download-hero px-5 sm:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="display text-[clamp(2.2rem,6vw,3.6rem)] font-semibold tracking-tight text-[var(--fg)] leading-[1.08]">
              Download ARK wherever you create
            </h1>
            <p className="mt-5 text-base sm:text-lg text-[var(--fg-muted)] leading-relaxed max-w-xl mx-auto">
              The desktop AI studio for Windows. Install once, then chat, build projects, and run models on your PC.
            </p>
            <div className="mt-9 flex justify-center">
              <a href={RELEASES_URL} className="btn btn-download" target="_blank" rel="noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                  <path d="M12 3v12" strokeLinecap="round" />
                  <path d="M7 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M5 21h14" strokeLinecap="round" />
                </svg>
                Download for Windows
              </a>
            </div>
            <p className="mt-6 text-sm text-[var(--fg-muted)]">Windows 10 and later</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
