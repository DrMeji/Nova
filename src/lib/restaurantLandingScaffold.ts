/**
 * @deprecated LOOKBOOK — never call from create. Dead leftover restaurant pack.
 */
export function briefLooksLikeRestaurantLanding(brief: string): boolean {
  const t = String(brief || '');
  if (!t.trim()) return false;
  if (/\b(?:apple\.com|product\s+marketing|premium\s+product|marketing\s+homepage|chronograph|product\s+homepage|iphone|macbook|watch\s+brand|alpine)\b/i.test(t)) {
    return false;
  }
  return /\b(?:restaurant|bistro|dining|seafood|steakhouse|brasserie|eatery|plated\s+dishes|tonight'?s\s+(?:menu|table)|food\s+landing|kitchen\s+landing)\b/i.test(t)
    || (/\bmenu\b/i.test(t) && /\b(?:dish|dishes|entree|entrée|prix\s*fixe)\b/i.test(t));
}

/**
 * Terminal-class restaurant landing fallback when free models keep shipping coffee stubs.
 * Used only after Ready retries fail for restaurant briefs — never for product marketing.
 */
export function buildRestaurantLandingScaffold(projectName: string): { app: string; css: string; indexCss: string } {
  const title = String(projectName || 'Studio').replace(/[`$\\]/g, '').trim() || 'Studio';
  const mark = title.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'TL';

  const app = `import './App.css';

const dishes = [
  {
    name: 'Ember-Grilled Halibut',
    description: 'Charred spring onion, smoked mussel broth, and a bright curl of lemon leaf.',
    price: '$34',
  },
  {
    name: 'Kelp Butter Gnocchi',
    description: 'Pillowy potato dumplings, roasted brassicas, toasted hazelnut, sea herbs.',
    price: '$26',
  },
  {
    name: 'Salted Honey Panna Cotta',
    description: 'Wildflower honey, olive oil cake crumbs, and a dark tide of blackberry.',
    price: '$13',
  },
];

export default function App() {
  const year = new Date().getFullYear();

  return (
    <main className="app">
      <section className="hero" aria-labelledby="brand-name">
        <div className="hero__grain" aria-hidden="true" />
        <nav className="nav" aria-label="Main navigation">
          <a className="nav__mark" href="#top" aria-label="${title} home">
            <span className="mark-dot" /> ${mark}
          </a>
          <a className="nav__link" href="#menu">Tonight&apos;s table</a>
        </nav>

        <div className="hero__content" id="top">
          <p className="eyebrow">Coastal kitchen · after dark</p>
          <h1 id="brand-name">${title}</h1>
          <p className="hero__tagline">A little fire on the edge of the water.</p>
          <a className="button" href="#menu">Find your seat</a>
        </div>

        <p className="hero__place">Crescent Bay<br />California</p>
      </section>

      <section className="menu" id="menu" aria-labelledby="menu-title">
        <div className="menu__intro">
          <p className="eyebrow eyebrow--dark">A small evening menu</p>
          <h2 id="menu-title">Made for the turning tide.</h2>
          <p className="menu__lede">
            Our menu drifts with the boats, the weather, and the market.
            These are three things we&apos;re holding close tonight.
          </p>
        </div>
        <div className="menu__list">
          {dishes.map((dish, index) => (
            <article className="dish" key={dish.name}>
              <span className="dish__number">0{index + 1}</span>
              <div>
                <h3>{dish.name}</h3>
                <p>{dish.description}</p>
              </div>
              <strong>{dish.price}</strong>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer">
        <span>${title}</span>
        <span>Gather near the glow</span>
        <span>&copy; {year}</span>
      </footer>
    </main>
  );
}
`;

  const css = `:root {
  --bg: #0e1317;
  --ink: #f2eee6;
  --muted: #9aa7ad;
  --accent: #e0ae55;
  --line: rgba(242, 238, 230, 0.12);
  --panel: #141b21;
  --display: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --body: "Segoe UI", "Helvetica Neue", sans-serif;
}

* { box-sizing: border-box; }

.app {
  min-height: 100vh;
  background: var(--bg);
  color: var(--ink);
  font-family: var(--body);
}

.hero {
  position: relative;
  min-height: 88vh;
  padding: 1.35rem 1.6rem 3.2rem;
  overflow: hidden;
  background:
    radial-gradient(920px 440px at 16% -12%, #3b5160 0%, transparent 56%),
    radial-gradient(720px 390px at 90% 18%, #5b3a1a 0%, transparent 52%),
    linear-gradient(180deg, #11181e, var(--bg));
}

.hero__grain {
  pointer-events: none;
  position: absolute;
  inset: 0;
  opacity: 0.16;
  background-image: repeating-linear-gradient(
    0deg,
    rgba(255, 255, 255, 0.035) 0,
    rgba(255, 255, 255, 0.035) 1px,
    transparent 1px,
    transparent 3px
  );
}

.nav,
.hero__content,
.hero__place {
  position: relative;
  z-index: 1;
}

.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.nav__mark {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  color: var(--ink);
  text-decoration: none;
  letter-spacing: 0.14em;
  font-weight: 700;
  font-size: 0.85rem;
}

.mark-dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--accent);
  box-shadow: 0 0 12px rgba(224, 174, 85, 0.65);
}

.nav__link {
  color: var(--muted);
  text-decoration: none;
  font-size: 0.92rem;
}

.hero__content {
  max-width: 40rem;
  margin-top: 18vh;
}

.eyebrow {
  margin: 0 0 0.75rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--muted);
  font-size: 0.72rem;
}

.eyebrow--dark { color: #6d7a80; }

.hero h1 {
  margin: 0 0 0.85rem;
  font-family: var(--display);
  font-size: clamp(2.9rem, 8vw, 5.4rem);
  line-height: 0.94;
  font-weight: 600;
}

.hero__tagline {
  margin: 0 0 1.45rem;
  max-width: 28rem;
  color: var(--muted);
  font-size: 1.15rem;
}

.button {
  display: inline-flex;
  align-items: center;
  background: var(--accent);
  color: #1a1208;
  text-decoration: none;
  font-weight: 700;
  padding: 0.85rem 1.2rem;
  border-radius: 999px;
  transition: transform 160ms ease, filter 160ms ease;
}

.button:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.hero__place {
  position: absolute;
  right: 1.6rem;
  bottom: 1.6rem;
  margin: 0;
  text-align: right;
  color: var(--muted);
  font-size: 0.85rem;
  line-height: 1.35;
}

.menu {
  display: grid;
  grid-template-columns: minmax(14rem, 0.9fr) minmax(18rem, 1.2fr);
  gap: 2rem;
  padding: 3.4rem 1.6rem 2.2rem;
  background: var(--panel);
  border-top: 1px solid var(--line);
}

.menu h2 {
  margin: 0.35rem 0 0.9rem;
  font-family: var(--display);
  font-size: clamp(1.8rem, 4vw, 2.7rem);
  max-width: 14ch;
}

.menu__lede {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
  max-width: 28rem;
}

.menu__list {
  display: grid;
  gap: 0.35rem;
}

.dish {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 1rem;
  align-items: start;
  padding: 1.05rem 0;
  border-bottom: 1px solid var(--line);
}

.dish__number {
  color: var(--muted);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
}

.dish h3 {
  margin: 0 0 0.35rem;
  font-size: 1.08rem;
}

.dish p {
  margin: 0;
  color: var(--muted);
  line-height: 1.45;
}

.dish strong {
  color: var(--accent);
  font-size: 1rem;
}

.footer {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
  padding: 1.35rem 1.6rem 2rem;
  color: var(--muted);
  border-top: 1px solid var(--line);
  font-size: 0.92rem;
}

@media (max-width: 820px) {
  .menu { grid-template-columns: 1fr; }
  .hero__content { margin-top: 12vh; }
  .dish { grid-template-columns: 1fr; }
}
`;

  const indexCss = `* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; }
body {
  font-family: "Segoe UI", "Helvetica Neue", sans-serif;
  background: #0e1317;
  color: #f2eee6;
}
`;

  return { app, css, indexCss };
}
