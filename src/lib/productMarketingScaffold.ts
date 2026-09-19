/**
 * @deprecated LOOKBOOK — never call from create. Dead leftover shell (Veopx-style).
 * Kept only so old imports/smokes do not crash; create must invent from the brief.
 */
export function buildProductMarketingScaffold(projectName: string): {
  app: string;
  css: string;
  indexCss: string;
} {
  const title = String(projectName || 'Studio').replace(/[`$\\]/g, '').trim() || 'Studio';
  const brand = title.replace(/[^A-Za-z0-9]+/g, '') || 'Studio';

  const app = `import './App.css';

const features = [
  {
    n: '01',
    title: 'Quiet by design',
    body: 'Every surface earns its place. Nothing decorative for its own sake.',
  },
  {
    n: '02',
    title: 'Light that listens',
    body: 'Ambient sensing adapts to the changing rhythm of your day.',
  },
  {
    n: '03',
    title: 'Built to last',
    body: 'Machined aluminum, hand-finished edges, materials meant for years of use.',
  },
];

export default function App() {
  const year = new Date().getFullYear();

  return (
    <main className="app">
      <section className="hero" aria-labelledby="brand-name">
        <div className="hero__atmos" aria-hidden="true">
          <div className="orb orb--a" />
          <div className="orb orb--b" />
          <div className="lens" />
          <div className="flare" />
        </div>

        <nav className="nav" aria-label="Main navigation">
          <a className="wordmark" href="#top" id="brand-name">${title}<span>.</span></a>
          <a className="nav__link" href="#story">Discover</a>
        </nav>

        <div className="hero__copy" id="top">
          <p className="eyebrow">Introducing ${title} One</p>
          <h1>Light,<br /><em>distilled.</em></h1>
          <p className="lede">A singular object for your most considered spaces.</p>
          <a className="button" href="#story">Meet ${title} One</a>
        </div>

        <p className="scroll-note"><span /> Scroll to reveal</p>
      </section>

      <section className="story" id="story" aria-labelledby="story-title">
        <div className="story__visual" aria-hidden="true">
          <div className="story__glow" />
          <div className="story__object"><span /></div>
          <p>01 / The object</p>
        </div>
        <div className="story__copy">
          <p className="eyebrow eyebrow--dark">Made for the in-between</p>
          <h2 id="story-title">Presence without<br /><em>the noise.</em></h2>
          <p>
            ${title} turns a room into a place you want to remain. Its silhouette
            captures and softens light with quiet precision.
          </p>
          <a className="text-link" href="#details">Explore the design</a>
        </div>
      </section>

      <section className="features" id="details" aria-label="${title} details">
        {features.map((f) => (
          <article key={f.n}>
            <span className="features__n">{f.n}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </article>
        ))}
      </section>

      <footer className="footer">
        <a className="wordmark" href="#top">${title}<span>.</span></a>
        <p>&copy; {year} ${brand}</p>
        <a href="#top">Back to top</a>
      </footer>
    </main>
  );
}
`;

  const css = `:root {
  --bg: #050505;
  --ink: #f4f1eb;
  --muted: #afb2a9;
  --accent: #d5ff4e;
  --accent-soft: #e8f6cf;
  --panel: #101310;
  --story: #e9e8e1;
  --story-ink: #141613;
  --display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --body: "Segoe UI", "Helvetica Neue", sans-serif;
  --mono: ui-monospace, "Cascadia Mono", Consolas, monospace;
}

* { box-sizing: border-box; }

.app {
  min-height: 100vh;
  overflow-x: hidden;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--body);
}

.hero {
  position: relative;
  isolation: isolate;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
  padding: 1.6rem 4vw 2.1rem;
  background:
    radial-gradient(ellipse 70% 55% at 53% 58%, #29312c 0%, #111612 32%, #070807 64%, #050505 100%);
}

.hero__atmos {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
}

.lens {
  position: absolute;
  width: min(67vw, 940px);
  aspect-ratio: 1;
  right: -8%;
  top: 7%;
  border-radius: 50%;
  background: radial-gradient(
    circle at 37% 29%,
    rgba(235, 255, 191, 0.87) 0 1%,
    rgba(202, 243, 144, 0.4) 8%,
    rgba(114, 139, 90, 0.2) 27%,
    rgba(16, 22, 16, 0.03) 58%,
    transparent 67%
  );
  box-shadow:
    inset 55px 32px 90px rgba(244, 255, 202, 0.25),
    inset -80px -70px 110px rgba(0, 0, 0, 0.85),
    0 0 100px rgba(178, 223, 109, 0.14);
  animation: breathe 9s ease-in-out infinite;
}

.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(1px);
  mix-blend-mode: screen;
}

.orb--a {
  width: 27vw;
  height: 27vw;
  min-width: 250px;
  min-height: 250px;
  right: 35%;
  top: 21%;
  background: radial-gradient(circle at 32% 29%, #fff9cc, #d2e784 3%, rgba(123, 151, 87, 0.35) 23%, transparent 69%);
  opacity: 0.52;
  animation: drift 12s ease-in-out infinite;
}

.orb--b {
  width: 15vw;
  height: 15vw;
  min-width: 160px;
  min-height: 160px;
  right: 4%;
  bottom: 7%;
  background: radial-gradient(circle at 35% 30%, #e9ffc0, #9fc56b 5%, transparent 65%);
  opacity: 0.5;
}

.flare {
  position: absolute;
  width: 130%;
  height: 2px;
  top: 48%;
  left: -20%;
  transform: rotate(-22deg);
  background: linear-gradient(
    90deg,
    transparent,
    rgba(237, 255, 180, 0.04),
    rgba(250, 255, 231, 0.65),
    rgba(237, 255, 180, 0.04),
    transparent
  );
  filter: blur(1px);
}

.nav,
.hero__copy,
.scroll-note {
  position: relative;
  z-index: 2;
}

.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.wordmark {
  color: inherit;
  text-decoration: none;
  font-size: 1.35rem;
  font-weight: 600;
  letter-spacing: -0.06em;
}

.wordmark span { color: var(--accent); }

.nav__link {
  color: rgba(255, 255, 255, 0.88);
  text-decoration: none;
  font-size: 0.9rem;
  transition: opacity 0.25s;
}

.nav__link:hover { opacity: 0.55; }

.hero__copy {
  margin: auto 0 10vh;
  animation: arrive 1.1s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.eyebrow {
  margin: 0 0 1.1rem;
  font-family: var(--mono);
  font-size: 0.68rem;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: #c9df9d;
}

.eyebrow--dark { color: #63704d; }

.hero h1,
.story__copy h2 {
  margin: 0;
  font-family: var(--display);
  font-weight: 400;
  letter-spacing: -0.05em;
  line-height: 0.86;
}

.hero h1 {
  font-size: clamp(3.6rem, 14vw, 9.5rem);
  max-width: 14ch;
}

.hero h1 em,
.story__copy h2 em {
  font-style: italic;
  font-weight: 400;
}

.lede {
  max-width: 22rem;
  margin: 1.6rem 0 1.35rem;
  font-size: 0.98rem;
  line-height: 1.6;
  color: #deded8;
}

.button {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.8rem 1.1rem;
  background: var(--accent-soft);
  color: #0a0d09;
  border-radius: 999px;
  text-decoration: none;
  font-size: 0.85rem;
  font-weight: 600;
  transition: transform 0.25s, background 0.25s;
}

.button:hover {
  transform: translateY(-2px);
  background: #fff;
}

.scroll-note {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0;
  font-family: var(--mono);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
}

.scroll-note span {
  width: 1.75rem;
  height: 1px;
  background: #c9df9d;
}

.story {
  min-height: 34rem;
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  background: var(--story);
  color: var(--story-ink);
}

.story__visual {
  position: relative;
  min-height: 28rem;
  overflow: hidden;
  background: linear-gradient(145deg, #20221f 0%, #555a4a 40%, #9a9a81 65%, #e8ddc2 100%);
}

.story__glow {
  position: absolute;
  width: 90%;
  height: 45%;
  right: -8%;
  bottom: -15%;
  background: rgba(255, 245, 203, 0.9);
  filter: blur(45px);
  transform: rotate(-15deg);
}

.story__object {
  position: absolute;
  left: 40%;
  bottom: 9%;
  width: min(24vw, 300px);
  aspect-ratio: 0.57;
  border-radius: 46% 46% 13% 13%;
  background: linear-gradient(105deg, #101713 0%, #65715c 22%, #eef0d9 47%, #4c554a 72%, #101611);
  box-shadow: 20px 19px 45px rgba(0, 0, 0, 0.35), inset 10px 0 25px rgba(255, 255, 232, 0.42);
  transform: rotate(7deg);
}

.story__object span {
  position: absolute;
  top: 12%;
  left: 29%;
  width: 42%;
  height: 9%;
  border-radius: 50%;
  background: #131a15;
  box-shadow: inset 0 2px 5px #a6b097;
}

.story__visual > p {
  position: absolute;
  left: 5vw;
  bottom: 1.5rem;
  margin: 0;
  font-family: var(--mono);
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  color: #faf7e8;
}

.story__copy {
  align-self: center;
  padding: 12% 9% 10% 12%;
}

.story__copy h2 {
  font-size: clamp(2.4rem, 6vw, 5rem);
}

.story__copy > p:not(.eyebrow) {
  max-width: 22rem;
  margin: 1.6rem 0;
  font-size: 0.95rem;
  line-height: 1.75;
  color: #52564d;
}

.text-link {
  display: inline-flex;
  align-items: center;
  font-size: 0.85rem;
  font-weight: 600;
  color: inherit;
  text-decoration: none;
  border-bottom: 1px solid #232622;
  padding-bottom: 0.4rem;
}

.features {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5vw;
  padding: 5.5rem 5vw 5rem;
  background: var(--panel);
}

.features article {
  border-top: 1px solid rgba(221, 242, 182, 0.28);
  padding-top: 1.1rem;
}

.features__n {
  font-family: var(--mono);
  font-size: 0.65rem;
  color: #b9db77;
}

.features h3 {
  margin: 2.4rem 0 0.85rem;
  font-family: var(--display);
  font-weight: 400;
  font-size: clamp(1.5rem, 2.8vw, 2.4rem);
  letter-spacing: -0.03em;
  line-height: 1;
}

.features p {
  margin: 0;
  max-width: 16rem;
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--muted);
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 1.35rem 4vw;
  background: var(--panel);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 0.72rem;
  color: #b4b7ac;
}

.footer a {
  color: inherit;
  text-decoration: none;
}

.footer .wordmark { color: #f4f1eb; }
.footer p { margin: 0; }

@keyframes arrive {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: none; }
}

@keyframes breathe {
  50% { transform: scale(1.045) translate(-1%, 1%); }
}

@keyframes drift {
  50% { transform: translate(-4%, 5%); opacity: 0.65; }
}

@media (max-width: 720px) {
  .hero { padding: 1.2rem 1.4rem 1.5rem; }
  .hero__copy { margin-bottom: 12vh; }
  .lens { width: 125vw; right: -35%; top: 15%; }
  .orb--a { right: 22%; top: 16%; }
  .story { display: block; min-height: 0; }
  .story__visual { min-height: 22rem; }
  .story__object { width: 42vw; left: 36%; }
  .story__copy { padding: 4rem 1.4rem 4.5rem; }
  .features {
    grid-template-columns: 1fr;
    padding: 3.5rem 1.4rem;
    gap: 2.4rem;
  }
  .features h3 { margin: 1.2rem 0 0.65rem; }
  .footer { padding: 1.1rem 1.4rem; }
  .footer p { display: none; }
}
`;

  const indexCss = `:root {
  font-family: var(--body, "Segoe UI", "Helvetica Neue", sans-serif);
  color: #f4f1eb;
  background: #050505;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; }

html {
  scroll-behavior: smooth;
  background: #050505;
}

body {
  margin: 0;
  min-width: 320px;
  background: #050505;
}

a {
  color: inherit;
  text-decoration: none;
}

button,
a {
  -webkit-tap-highlight-color: transparent;
}
`;

  return { app, css, indexCss };
}

/** Apple.com / premium product marketing briefs (not restaurant/cafe). */
export function briefLooksLikeProductMarketing(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  if (/\b(?:restaurant|bistro|dining|seafood|steakhouse|brasserie|eatery|cafe|coffee\s*shop|menu\s+highlights|dishes?)\b/i.test(t)
    && !/\b(?:apple\.com|product\s+marketing|iphone|macbook)\b/i.test(t)) {
    return false;
  }
  return /\b(?:apple\.com|product\s+marketing|premium\s+product|marketing\s+homepage|product\s+homepage|full-bleed\s+hero|cinematic\s+atmosphere|product\s+story|chronograph|watch\s+brand)\b/i.test(t)
    || (/\b(?:iphone|macbook|airpods|vision\s*pro)\b/i.test(t) && /\b(?:landing|homepage|marketing|hero)\b/i.test(t))
    || (/\b(?:vite|react)\b/i.test(t)
      && /\b(?:premium|apple\.com|product\s+marketing|product\s+homepage)\b/i.test(t)
      && /\b(?:hero|homepage|landing|marketing)\b/i.test(t));
}
