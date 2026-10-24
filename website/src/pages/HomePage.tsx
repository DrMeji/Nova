import { SiteHeader } from '../components/SiteHeader';
import { SiteFooter } from '../components/SiteFooter';
import { SiteBackdrop } from '../components/SiteBackdrop';
import { NovaMark } from '../components/NovaMark';
import { HeroChips } from '../components/HeroChips';
import { useAuth } from '../lib/auth';
import { RELEASES_URL } from '../lib/constants';
import '../lib/brand';

const FEATURES = [
  {
    title: 'Local brain',
    body: 'Install a fitting model on this PC for zero-key chat. Keep working when the network drops.',
  },
  {
    title: 'Free cloud keys',
    body: 'Connect Groq, Google, or OpenRouter once. NOVA routes and fails over so replies keep coming.',
  },
  {
    title: 'Projects on disk',
    body: 'Scaffold and edit real folders on your machine, not a locked sandbox in someone else’s cloud.',
  },
  {
    title: 'Friends by NOVA ID',
    body: 'Add people with a 7-digit ID (or DEV). Message when you’re mutual friends; block when you need to.',
  },
  {
    title: 'Plugins & models',
    body: 'Wire GitHub, Slack, Notion, and more. Browse models and install local weights from one place.',
  },
  {
    title: 'Updates that stick',
    body: 'Check for update in Settings whenever a new build is ready, then keep creating.',
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Download for Windows',
    body: 'Install NOVA on your PC. Open the app when setup finishes and you are ready to create.',
  },
  {
    n: '02',
    title: 'Sign in',
    body: 'Sign in with email and password (or create an account). Your NOVA ID is how friends find you.',
  },
  {
    n: '03',
    title: 'Add a brain or free keys',
    body: 'Install a local model for offline chat, or connect free cloud keys. NOVA can route between them for you.',
  },
  {
    n: '04',
    title: 'Create on your machine',
    body: 'Chat, scaffold projects, add plugins, and keep files on your disk. What you make stays yours.',
  },
];

const FAQS = [
  {
    q: 'Is NOVA free?',
    a: 'Yes for the desktop app. Use free cloud keys and/or a local brain. NOVA does not charge you for chat.',
  },
  {
    q: 'Where do I download?',
    a: 'Use Download for Windows on this site. That installs the desktop app so you can start creating.',
  },
  {
    q: 'Who owns what I create?',
    a: 'You do. NOVA does not take ownership of your projects or creations, and does not claim a share of your work.',
  },
  {
    q: 'Windows blocked the installer',
    a: 'SmartScreen and firewall prompts are common on first run. Minimize them and keep using NOVA. They are not a failed install.',
  },
];

export function HomePage() {
  const { openSignIn } = useAuth();

  return (
    <div className="site">
      <SiteBackdrop />
      <SiteHeader />
      <main className="site-main">
        <section className="relative px-5 sm:px-8 pt-14 sm:pt-20 pb-16 sm:pb-24 overflow-hidden">
          <div className="relative mx-auto max-w-6xl grid lg:grid-cols-[1.05fr_0.95fr] gap-12 lg:gap-10 items-center">
            <div className="fade-up">
              <p className="text-sm font-medium text-[var(--accent)] mb-4">Desktop AI studio for Windows</p>
              <h1 className="display text-[clamp(2.4rem,5.5vw,3.75rem)] font-semibold leading-[1.08] tracking-tight text-[var(--fg)]">
                Create with AI that lives on your PC
              </h1>
              <p className="mt-5 max-w-lg text-base sm:text-lg text-[var(--fg-muted)] leading-relaxed">
                NOVA is your studio for chat, projects, and models. Local first, free cloud when you need it, private by
                default.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a href={RELEASES_URL} className="btn btn-primary" target="_blank" rel="noreferrer">
                  Download for Windows
                </a>
                <button type="button" className="btn btn-ghost" onClick={openSignIn}>
                  Sign in
                </button>
              </div>
            </div>

            <div className="fade-up-delay relative flex justify-center lg:justify-end">
              <div className="hero-visual">
                <NovaMark size={220} className="hero-mark" animated />
                <HeroChips />
              </div>
            </div>
          </div>
        </section>

        <section className="px-5 sm:px-8 pb-16">
          <div className="mx-auto max-w-6xl border-y border-[var(--line)] py-8">
            <p className="text-center text-xs uppercase tracking-[0.16em] text-[var(--fg-muted)] mb-5">
              Built for makers who ship on their own machine
            </p>
            <div className="flex flex-wrap justify-center gap-x-10 gap-y-3 text-sm font-medium text-[var(--fg-muted)]">
              <span>Chat</span>
              <span>Projects</span>
              <span>Models</span>
              <span>Plugins</span>
              <span>Friends</span>
              <span>Updates</span>
            </div>
          </div>
        </section>

        <section id="features" className="px-5 sm:px-8 pb-20 scroll-mt-24">
          <div className="mx-auto max-w-6xl">
            <div className="max-w-2xl mb-10">
              <p className="text-sm font-medium text-[var(--accent)] mb-2">Features</p>
              <h2 className="display text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--fg)]">
                Everything in one studio
              </h2>
              <p className="mt-3 text-[var(--fg-muted)] leading-relaxed">
                From first install to shipping a project, NOVA keeps the tools together without locking your files away.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map(f => (
                <article key={f.title} className="feature-tile">
                  <h3 className="display text-lg font-semibold text-[var(--fg)] mb-2">{f.title}</h3>
                  <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{f.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how" className="px-5 sm:px-8 pb-20 scroll-mt-24">
          <div className="mx-auto max-w-6xl rounded-[1.75rem] border border-[var(--line)] bg-[var(--surface)] px-6 sm:px-10 py-12 sm:py-14">
            <div className="max-w-2xl mb-10">
              <p className="text-sm font-medium text-[var(--accent)] mb-2">How it works</p>
              <h2 className="display text-3xl font-semibold tracking-tight text-[var(--fg)]">
                Up and creating in minutes
              </h2>
              <p className="mt-3 text-[var(--fg-muted)] leading-relaxed">
                Four simple steps from install to shipping work on your own machine.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-6">
              {STEPS.map(s => (
                <div key={s.n}>
                  <p className="display text-sm font-semibold text-[var(--accent)] mb-3">{s.n}</p>
                  <h3 className="text-lg font-semibold text-[var(--fg)] mb-2">{s.title}</h3>
                  <p className="text-sm text-[var(--fg-muted)] leading-relaxed">{s.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className="px-5 sm:px-8 pb-20 scroll-mt-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="display text-3xl font-semibold tracking-tight text-[var(--fg)] text-center mb-8">
              Questions
            </h2>
            <div className="space-y-3">
              {FAQS.map(item => (
                <details key={item.q} className="faq-item group">
                  <summary className="faq-summary">
                    {item.q}
                    <span className="faq-plus" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="faq-body">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 sm:px-8 pb-24">
          <div className="mx-auto max-w-6xl cta-band text-center px-6 py-14 sm:py-16">
            <h2 className="display text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--fg)] mb-3">
              Ready to open NOVA?
            </h2>
            <p className="text-[var(--fg-muted)] max-w-md mx-auto mb-8 leading-relaxed">
              Install on Windows, sign in, and start with a free key or a local brain.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a href={RELEASES_URL} className="btn btn-primary" target="_blank" rel="noreferrer">
                Download for Windows
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
