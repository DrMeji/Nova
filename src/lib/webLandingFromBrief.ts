/**
 * Deterministic landing-page HTML/CSS/JS from a chat brief
 * (hero URL, CTAs, product cards). never leave an empty #app.
 */

export type LandingFile = { path: string; content: string };

function escapeHtml(s: string) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pickUrls(text: string): string[] {
  const urls = String(text || '').match(/https?:\/\/[^\s)\]"'<>]+/gi) || [];
  return [...new Set(urls.map(u => u.replace(/[.,;]+$/, '')))];
}

function pickHeadline(text: string, fallback: string): string {
  if (prefersReactAppScaffold(text)) return fallback;
  const m = String(text || '').match(
    /(?:headline|title)\s*[:：]\s*[“"']?([^"'\n—–-]{2,80})/i,
  );
  if (m?.[1]) return m[1].trim().replace(/[.“"']+$/g, '');
  const quoted = String(text || '').match(/[“"]([^"”]{2,60})[”"]/);
  if (quoted?.[1] && !/^http/i.test(quoted[1])) return quoted[1].trim();
  return fallback;
}

function pickSubtitle(text: string): string {
  const m = String(text || '').match(
    /(?:subtitle|subtext|tagline)\s*[:：]\s*[“"']?([^"'\n]{4,120})/i,
  );
  if (m?.[1]) return m[1].trim().replace(/[.“"']+$/g, '');
  const quiet = String(text || '').match(/[“"]([^"”]{8,100})[”"]/g);
  if (quiet && quiet.length >= 2) {
    return quiet[1].replace(/^[“"]|[”"]$/g, '').trim();
  }
  return '';
}

function pickButtons(text: string): string[] {
  const t = String(text || '');
  const out: string[] = [];
  const patterns = [
    /(?:CTA|button)s?\s*[:(]\s*[“"']([^"']+)[“"']/gi,
    /buttons?\s+(?:for\s+)?[“"']([^"']+)[“"']\s+and\s+[“"']([^"']+)[“"']/i,
    /[“"']([^"']{3,40})[“"']\s+and\s+[“"']([^"']{3,40})[“"']/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (!m) continue;
    if (m[1]) out.push(m[1].trim());
    if (m[2]) out.push(m[2].trim());
  }
  const named = [
    ...t.matchAll(/[“"']([A-Z][^"']{2,36})[“"']\s*\((?:non-functional|fake|doesn't need)/gi),
  ];
  for (const m of named) {
    if (m[1] && !out.includes(m[1])) out.push(m[1].trim());
  }
  // Common CTAs mentioned without quotes (word-ish; avoid matching Book inside booking)
  for (const label of [
    'Check availability',
    'See cabins',
    'Join a class',
    'Shop packs',
    'Reserve',
    'View menu',
    'Order now',
  ]) {
    if (new RegExp(`\\b${label.replace(/\s+/g, '\\s+')}\\b`, 'i').test(t) && !out.some(o => o.toLowerCase() === label.toLowerCase())) {
      out.push(label);
    }
  }
  if (/\bbook(?:ing)?\b/i.test(t) && !/\bbook\s*club\b/i.test(t) && !/\b(reading|bookshelf|shelf)\b/i.test(t)
    && !out.some(o => /^book$/i.test(o) || /^reserve$/i.test(o))) {
    out.push(/\b(restaurant|dining|cafe|menu)\b/i.test(t) || /\breserve\b/i.test(t) ? 'Reserve' : 'Book');
  }
  if (/\bmenu\b/i.test(t) && !/\bbook\s*club\b/i.test(t) && !out.some(o => /menu/i.test(o))) {
    out.push('View menu');
  }
  return out.slice(0, 4);
}

type Card = { title: string; meta: string; image: string };

function pickCards(text: string, images: string[]): Card[] {
  const t = String(text || '');
  const cards: Card[] = [];
  // "Name. $189/night" or "Name - $189"
  const priceLines = [...t.matchAll(
    /([A-Z][A-Za-z0-9][A-Za-z0-9 '’-]{1,40})\s*[—–-]\s*(\$?\d[\d,]*(?:\/\w+)?(?:\s*[-—–]\s*[A-Za-z0-9 :]+)?)/g,
  )];
  const imgPool = images.slice(1); // first often hero
  let i = 0;
  for (const m of priceLines) {
    const title = m[1].trim();
    if (/^(https?|hero|headline|cta|dark|warm)/i.test(title)) continue;
    cards.push({
      title,
      meta: m[2].trim(),
      image: imgPool[i] || images[i + 1] || images[0] || '',
    });
    i += 1;
    if (cards.length >= 6) break;
  }
  if (!cards.length && imgPool.length) {
    const foodish = /\b(restaurant|menu|dish|food|cafe|dining|plate)\b/i.test(t);
    const foodTitles = [
      'Seasonal bowl',
      'Wood-fired pizza',
      'Weekend brunch',
      'Chef special',
      'House salad',
      'Dessert plate',
    ];
    const generic = ['Featured work', 'Highlight', 'Showcase', 'Studio pick', 'Latest', 'Favorite'];
    const titles = foodish ? foodTitles : generic;
    return imgPool.slice(0, 3).map((image, idx) => ({
      title: titles[idx] || `Feature ${idx + 1}`,
      meta: foodish ? 'From the menu' : 'Details coming soon',
      image,
    }));
  }
  return cards;
}

/** True when the brief is a team-chat / Discord-style app (not a marketing site). */
export function wantsChatAppScaffold(text: string): boolean {
  const t = String(text || '').toLowerCase();
  const chatNoun = /\b(chat\s+app|messaging\s+app|desktop[- ]style\s+chat|team\s+messaging|discord)\b/.test(t)
    || (/\b(channel|direct\s+messages?|\bdms?\b|voice\s+channel|screen\s+share|mute|deafen)\b/.test(t)
      && /\b(ui|app|react|sidebar|rail|layout|server)\b/.test(t));
  // "left rail" alone is used by finance/notes/desktop apps. only counts with chat nouns.
  const railChat = /\bleft\s+rail\b/.test(t) && /\b(channel|dm|voice|message|thread|server|discord|chat)\b/.test(t);
  return (
    chatNoun
    || railChat
    || /\b(threads?\s+panel|command\s+palette|no\s+static\s+html)\b/.test(t)
    || (/\b(server\s+sidebar|member\s+list|friends?\s+list|emoji\s+picker)\b/.test(t))
  );
}

/** Interactive SPA shells that must never become static marketing landings. */
export function wantsInteractiveSpaScaffold(text: string): boolean {
  const t = String(text || '');
  if (wantsChatAppScaffold(t)) return true;
  if (/\b(kanban|drag[\s-]?and[\s-]?drop|draggable|localStorage)\b/i.test(t)
    && /\b(column|board|card|modal|task|backlog)\b/i.test(t)) {
    return true;
  }
  if (/\b(budget|transaction|finance|ledger|wallet|expense)\b/i.test(t)
    && /\b(react|vite|app|dashboard)\b/i.test(t)) {
    return true;
  }
  if (/\b(notes?\s+app|todo\s+app|task\s+(?:list|board)|sticky\s*notes?)\b/i.test(t)
    && /\b(react|vite|localStorage)\b/i.test(t)) {
    return true;
  }
  // Dense tool UI / trading cockpit. tabs + live controls, not a marketing landing.
  if (/\b(watchlist|orders?\s+tab|trading\s+cockpit|trade\s*rail|desktop[- ]style)\b/i.test(t)
    && /\b(tab|settings|panel|button|cockpit|software)\b/i.test(t)) {
    return true;
  }
  // Calculators ship as static HTML/CSS/JS. not a Vite React SPA.
  return false;
}

/** Marketing / restaurant / portfolio landing signals (hero, menu, Unsplash, etc.). */
function looksLikeMarketingLanding(text: string): boolean {
  const t = String(text || '');
  if (t.length < 60) return false;
  if (wantsInteractiveSpaScaffold(t)) return false;
  // Festival / concert / event landings. even short briefs must not become empty Vite shells.
  if (/\b(festival|lineup|ticket\s+cta|jazz|concert|velvet|landing\s+page)\b/i.test(t)) return true;
  const hasMedia = /unsplash|https?:\/\/\S+\.(?:jpg|jpeg|png|webp)|images\.unsplash/i.test(t);
  // Do not treat lone "card" as marketing. kanban "Add Card" would false-positive.
  const hasLayout = /\b(hero|cta|headline|subtitle|gallery|masonry|portfolio|menu|cabin|class(?:es)?|booking|restaurant|dish(?:es)?)\b/i.test(t)
    || (/\bcards?\b/i.test(t) && /\b(hero|unsplash|menu|gallery|portfolio|restaurant)\b/i.test(t));
  return hasMedia || (hasLayout && t.length > 100);
}

/**
 * True when the user asked for a React/Vite app shell (not a static marketing landing).
 * Chat/messaging apps always count. Plain “React + Vite” on a restaurant/hero brief does not —
 * those stay landing pages so Unsplash heroes are not replaced by a Discord scaffold.
 */
export function prefersReactAppScaffold(text: string): boolean {
  const t = String(text || '').toLowerCase();
  if (/\b(static\s+html|plain\s+html|landing\s+page\s+only)\b/.test(t)) return false;
  if (wantsInteractiveSpaScaffold(text)) return true;
  if (looksLikeMarketingLanding(text)) return false;
  return (
    /\b(react|vite|next\.?js|npm\s+install|lucide|jsx|tsx|usestate|dev\s+server|localhost)\b/.test(t)
  );
}

/** True when the brief describes a real landing page (not a one-line create). */
export function looksLikeLandingBrief(text: string): boolean {
  return looksLikeMarketingLanding(text);
}

function buildPortfolioFiles(title: string, brief: string, urls: string[]): LandingFile[] {
  const images = urls.length
    ? urls
    : [
      'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=900&q=80',
      'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=900&q=80',
      'https://images.unsplash.com/photo-1447752875215-b2761acb3c5d?w=900&q=80',
    ];
  const about = /about[^.!\n]{0,40}(.{20,180})/i.exec(brief)?.[1]?.trim()
    || `${title} is a photography portfolio. real frames, quiet composition, and work you can feel.`;
  const gallery = images.map((src, i) => (
    `      <figure class="tile tile-${(i % 3) + 1}"><img src="${escapeHtml(src)}" alt="Frame ${i + 1}" loading="lazy" /></figure>`
  )).join('\n');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <header class="top">
    <a class="logo" href="#">${escapeHtml(title)}</a>
    <nav>
      <a href="#work">Work</a>
      <a href="#about">About</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>
  <main>
    <section id="work" class="gallery" aria-label="Gallery">
${gallery}
    </section>
    <section id="about" class="about">
      <h2>About</h2>
      <p>${escapeHtml(about)}</p>
    </section>
    <section id="contact" class="contact">
      <h2>Contact</h2>
      <p>hello@${escapeHtml(title.toLowerCase().replace(/\s+/g, ''))}.studio</p>
    </section>
  </main>
  <script src="js/app.js"></script>
</body>
</html>
`;

  const css = `* { box-sizing: border-box; margin: 0; }
body {
  background: #000;
  color: #fff;
  font-family: "Segoe UI", system-ui, sans-serif;
  min-height: 100vh;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.logo {
  color: #fff;
  text-decoration: none;
  font-size: clamp(1.6rem, 4vw, 2.4rem);
  font-weight: 600;
  letter-spacing: 0.04em;
}
nav { display: flex; gap: 1.1rem; }
nav a {
  color: rgba(255,255,255,0.72);
  text-decoration: none;
  font-size: 0.9rem;
}
nav a:hover { color: #fff; }
.gallery {
  columns: 3 220px;
  column-gap: 0.75rem;
  padding: 1rem 1.25rem 2rem;
}
.tile {
  break-inside: avoid;
  margin: 0 0 0.75rem;
  overflow: hidden;
  background: #111;
}
.tile img {
  width: 100%;
  display: block;
  vertical-align: middle;
}
.tile-1 img { min-height: 180px; object-fit: cover; }
.tile-2 img { min-height: 240px; object-fit: cover; }
.tile-3 img { min-height: 200px; object-fit: cover; }
.about, .contact {
  max-width: 40rem;
  padding: 0 1.5rem 2.5rem;
}
.about h2, .contact h2 {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  opacity: 0.55;
  margin-bottom: 0.75rem;
}
.about p, .contact p {
  font-size: 1.05rem;
  line-height: 1.6;
  color: rgba(255,255,255,0.88);
}
@media (max-width: 700px) {
  .gallery { columns: 2 140px; }
  .top { flex-direction: column; align-items: flex-start; }
}
`;

  const js = `document.querySelectorAll('nav a').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!id || id.charAt(0) !== '#') return;
    const el = document.querySelector(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
`;

  return [
    { path: 'index.html', content: html },
    { path: 'css/styles.css', content: css },
    { path: 'js/app.js', content: js },
    { path: '.gitignore', content: '.DS_Store\nThumbs.db\n*.log\n.env\n.env.*\n' },
  ];
}

function buildFestivalLandingFiles(title: string, brief: string): LandingFile[] {
  const safe = escapeHtml(title);
  const year = new Date().getFullYear();
  const headline = pickHeadline(brief, `${title} Jazz Festival`);
  const tagline = pickSubtitle(brief) || 'Dark velvet nights. Live brass. Tickets that sell out.';
  const hero = pickUrls(brief)[0]
    || 'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=1600&q=80';
  const headliners = [
    { name: 'Miles Davis', role: 'Headliner' },
    { name: 'Chet Baker', role: 'Headliner' },
    { name: 'Weather Report', role: 'Headliner' },
  ];
  const featured = [
    { name: 'Diana Krall', role: 'Featured' },
    { name: 'Norah Jones', role: 'Featured' },
    { name: 'Charles Lloyd', role: 'Featured' },
  ];
  const emerging = [
    { name: 'Sunny Jain', role: 'Emerging' },
    { name: 'Lena Wilson', role: 'Emerging' },
  ];
  const card = (a: { name: string; role: string }) => `
        <article class="act">
          <p class="act-role">${escapeHtml(a.role)}</p>
          <h3>${escapeHtml(a.name)}</h3>
        </article>`;
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safe}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <header class="top">
    <a class="logo" href="#">${safe}</a>
    <nav>
      <a href="#lineup">Lineup</a>
      <a href="#tickets">Tickets</a>
      <a href="#about">About</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>
  <section class="hero" style="--hero:url('${escapeHtml(hero)}')">
    <div class="hero-inner">
      <p class="eyebrow">${safe}</p>
      <h1>${escapeHtml(headline)}</h1>
      <p class="sub">${escapeHtml(tagline)}</p>
      <div class="actions">
        <a class="btn" href="#tickets">Get Your Tickets</a>
        <a class="btn ghost" href="#lineup">See the Lineup</a>
      </div>
    </div>
  </section>
  <main>
    <section id="lineup" class="lineup">
      <h2>Lineup</h2>
      <p class="section-sub">Three stages. One velvet night.</p>
      <div class="acts-grid">
        ${[...headliners, ...featured, ...emerging].map(card).join('\n')}
      </div>
    </section>
    <section id="tickets" class="tickets">
      <h2>Get Your Tickets Now</h2>
      <div class="ticket-row">
        <article class="ticket">
          <h3>Early Bird</h3>
          <p class="price">$150</p>
          <p>Weekend pass · limited</p>
          <a class="btn" href="#tickets">Buy Tickets</a>
        </article>
        <article class="ticket featured">
          <h3>Regular</h3>
          <p class="price">$200</p>
          <p>Full festival access</p>
          <a class="btn" href="#tickets">Buy Tickets</a>
        </article>
      </div>
    </section>
    <section id="about" class="about">
      <h2>About</h2>
      <p>${safe} brings late-night brass, intimate sets, and a dark velvet room you feel before you hear.</p>
    </section>
  </main>
  <footer id="contact">
    <p>hello@${escapeHtml(title.toLowerCase().replace(/\s+/g, ''))}.example · City Stage</p>
    <p>&copy; ${year} ${safe}</p>
  </footer>
  <script src="js/app.js"></script>
</body>
</html>
`;
  const css = `* { box-sizing: border-box; margin: 0; }
body {
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  color: #f3ebe3;
  background: #0b0a0e;
  line-height: 1.5;
}
.top {
  position: sticky; top: 0; z-index: 10;
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.9rem 1.4rem;
  background: rgba(8,7,12,0.92);
  border-bottom: 1px solid rgba(212,175,120,0.18);
  backdrop-filter: blur(10px);
}
.logo {
  color: #e8c98a; text-decoration: none; letter-spacing: 0.14em;
  text-transform: uppercase; font-size: 0.78rem; font-family: system-ui, sans-serif;
}
nav { display: flex; gap: 1rem; flex-wrap: wrap; }
nav a {
  color: rgba(243,235,227,0.78); text-decoration: none;
  font-family: system-ui, sans-serif; font-size: 0.85rem;
}
.hero {
  min-height: 78vh;
  background:
    linear-gradient(180deg, rgba(8,6,12,0.72), rgba(8,6,12,0.92)),
    var(--hero) center/cover no-repeat;
  display: grid; place-items: center; text-align: center;
  padding: 4rem 1.25rem;
}
.eyebrow {
  letter-spacing: 0.22em; text-transform: uppercase; font-size: 0.72rem;
  color: #d4af78; margin-bottom: 0.85rem; font-family: system-ui, sans-serif;
}
.hero h1 {
  font-size: clamp(2.6rem, 7vw, 4.4rem); font-weight: 500; margin-bottom: 0.7rem;
}
.sub { max-width: 28rem; margin: 0 auto 1.5rem; color: rgba(243,235,227,0.86); }
.actions { display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap; }
.btn {
  display: inline-block; padding: 0.75rem 1.2rem; border-radius: 999px;
  background: #e8c98a; color: #1a1208; text-decoration: none;
  font-family: system-ui, sans-serif; font-weight: 600;
}
.btn.ghost {
  background: transparent; color: #e8c98a; border: 1px solid rgba(232,201,138,0.55);
}
.lineup, .tickets, .about { padding: 3.5rem 1.4rem; max-width: 1080px; margin: 0 auto; }
.lineup h2, .tickets h2, .about h2 {
  font-size: clamp(1.8rem, 4vw, 2.4rem); margin-bottom: 0.5rem;
}
.section-sub { color: rgba(243,235,227,0.65); margin-bottom: 1.5rem; }
.acts-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.9rem;
}
.act {
  background: linear-gradient(160deg, #17141f, #100e16);
  border: 1px solid rgba(212,175,120,0.16);
  border-radius: 14px; padding: 1rem 1rem 1.15rem;
}
.act-role {
  font-family: system-ui, sans-serif; font-size: 0.68rem; letter-spacing: 0.12em;
  text-transform: uppercase; color: #d4af78; margin-bottom: 0.45rem;
}
.tickets { text-align: center; }
.ticket-row {
  display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem; margin-top: 1.5rem;
}
.ticket {
  background: #14111a; border: 1px solid rgba(212,175,120,0.2);
  border-radius: 16px; padding: 1.4rem 1.2rem;
}
.ticket.featured { border-color: rgba(232,201,138,0.55); box-shadow: 0 0 28px rgba(232,201,138,0.12); }
.price { font-size: 2.2rem; margin: 0.4rem 0 0.35rem; color: #e8c98a; }
.about p { max-width: 36rem; color: rgba(243,235,227,0.85); }
footer {
  padding: 2rem 1.4rem 2.5rem; text-align: center;
  border-top: 1px solid rgba(212,175,120,0.14);
  color: rgba(243,235,227,0.55); font-family: system-ui, sans-serif; font-size: 0.85rem;
}
footer p + p { margin-top: 0.35rem; }
@media (max-width: 700px) {
  .top { flex-direction: column; align-items: flex-start; gap: 0.6rem; }
}
`;
  const js = `document.querySelectorAll('nav a, .actions a').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!id || id.charAt(0) !== '#') return;
    const el = document.querySelector(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
`;
  return [
    { path: 'index.html', content: html },
    { path: 'css/styles.css', content: css },
    { path: 'js/app.js', content: js },
    { path: '.gitignore', content: '.DS_Store\nThumbs.db\n*.log\n.env\n.env.*\n' },
  ];
}

/** Dense desktop-style trading cockpit (tabs + working controls). */
function buildTradeCockpitFiles(title: string, _brief: string): LandingFile[] {
  const safe = escapeHtml(title);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safe}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <strong class="brand">${safe}</strong>
      <nav class="tabs" role="tablist">
        <button type="button" class="tab active" data-tab="watchlist">Watchlist</button>
        <button type="button" class="tab" data-tab="orders">Orders</button>
        <button type="button" class="tab" data-tab="settings">Settings</button>
      </nav>
    </header>
    <main>
      <section id="panel-watchlist" class="panel active" role="tabpanel">
        <h1>Watchlist</h1>
        <form id="watch-form" class="row">
          <input id="symbol-input" type="text" placeholder="Symbol (e.g. AAPL)" autocomplete="off" />
          <button type="submit">Add symbol</button>
        </form>
        <ul id="watch-list" class="list"></ul>
      </section>
      <section id="panel-orders" class="panel" role="tabpanel" hidden>
        <h1>Orders</h1>
        <div class="row">
          <button type="button" id="btn-buy">Buy</button>
          <button type="button" id="btn-sell">Sell</button>
        </div>
        <ul id="order-list" class="list"></ul>
      </section>
      <section id="panel-settings" class="panel" role="tabpanel" hidden>
        <h1>Settings</h1>
        <label class="field">Risk limit
          <input id="risk-limit" type="number" min="0" step="1" value="1000" />
        </label>
        <button type="button" id="btn-save-settings">Save</button>
        <p id="settings-status" class="status" hidden>Saved</p>
      </section>
    </main>
  </div>
  <script src="js/app.js"></script>
</body>
</html>
`;
  const css = `:root {
  color-scheme: dark;
  --bg: #0b0f14;
  --panel: #121821;
  --line: #243041;
  --text: #e8eef8;
  --muted: #8fa0b8;
  --accent: #3d8bfd;
  --sell: #ef5f5f;
  --buy: #3ecf8e;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  font-family: "Segoe UI", system-ui, sans-serif;
  background: radial-gradient(1200px 600px at 10% -10%, #1a2740, var(--bg));
  color: var(--text);
}
.shell { max-width: 960px; margin: 0 auto; padding: 1.25rem; }
.topbar {
  display: flex; flex-wrap: wrap; gap: 1rem; align-items: center;
  justify-content: space-between; margin-bottom: 1.25rem;
}
.brand { letter-spacing: 0.04em; font-size: 1.1rem; }
.tabs { display: flex; gap: 0.35rem; }
.tab {
  border: 1px solid var(--line); background: transparent; color: var(--muted);
  padding: 0.45rem 0.9rem; border-radius: 8px; cursor: pointer;
}
.tab.active { background: var(--panel); color: var(--text); border-color: var(--accent); }
.panel {
  background: var(--panel); border: 1px solid var(--line); border-radius: 14px;
  padding: 1.25rem 1.4rem; min-height: 320px;
}
.panel[hidden] { display: none !important; }
h1 { margin: 0 0 1rem; font-size: 1.35rem; }
.row { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem; }
input {
  background: #0a1018; border: 1px solid var(--line); color: var(--text);
  border-radius: 8px; padding: 0.55rem 0.75rem; min-width: 12rem;
}
button {
  border: 0; border-radius: 8px; padding: 0.55rem 0.95rem; cursor: pointer;
  background: var(--accent); color: #fff; font-weight: 600;
}
#btn-sell { background: var(--sell); }
#btn-buy { background: var(--buy); color: #04140c; }
.list { list-style: none; margin: 0; padding: 0; }
.list li {
  padding: 0.65rem 0.75rem; border-bottom: 1px solid var(--line);
  display: flex; justify-content: space-between; gap: 1rem;
}
.field { display: grid; gap: 0.35rem; margin-bottom: 1rem; color: var(--muted); }
.status { color: var(--buy); margin-top: 0.75rem; }
`;
  const js = `const tabs = [...document.querySelectorAll('.tab')];
const panels = {
  watchlist: document.getElementById('panel-watchlist'),
  orders: document.getElementById('panel-orders'),
  settings: document.getElementById('panel-settings'),
  help: document.getElementById('panel-help'),
};
function showTab(name) {
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  Object.entries(panels).forEach(([key, el]) => {
    if (!el) return;
    el.hidden = key !== name;
  });
}
tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

const watchList = document.getElementById('watch-list');
const watchForm = document.getElementById('watch-form');
const symbolInput = document.getElementById('symbol-input');
watchForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const sym = String(symbolInput?.value || '').trim().toUpperCase();
  if (!sym) return;
  const li = document.createElement('li');
  li.innerHTML = '<span>' + sym + '</span><span class="muted">watching</span>';
  watchList?.appendChild(li);
  if (symbolInput) symbolInput.value = '';
});

const orderList = document.getElementById('order-list');
function addOrder(side) {
  const li = document.createElement('li');
  const stamp = new Date().toLocaleTimeString();
  li.innerHTML = '<span>' + side + ' · DEMO</span><span>' + stamp + '</span>';
  orderList?.appendChild(li);
}
document.getElementById('btn-buy')?.addEventListener('click', () => addOrder('BUY'));
document.getElementById('btn-sell')?.addEventListener('click', () => addOrder('SELL'));

document.getElementById('btn-save-settings')?.addEventListener('click', () => {
  const status = document.getElementById('settings-status');
  if (status) status.hidden = false;
});
`;
  return [
    { path: 'index.html', content: html },
    { path: 'css/styles.css', content: css },
    { path: 'js/app.js', content: js },
    { path: '.gitignore', content: '.DS_Store\nThumbs.db\n*.log\n.env\n.env.*\n' },
  ];
}

/** Professional / scientific calculator. history tape, memory, trig, deg/rad. */
function buildProCalculatorFiles(title: string, _brief: string): LandingFile[] {
  const safe = escapeHtml(title);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safe}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <div class="desk">
    <aside class="tape" aria-label="History">
      <header>
        <h2>Tape</h2>
        <button type="button" id="clear-tape" class="ghost">Clear</button>
      </header>
      <ul id="history"></ul>
    </aside>
    <main class="calc" role="application" aria-label="${safe}">
      <div class="brand-row">
        <strong>${safe}</strong>
        <span class="badge">PRO SCI</span>
      </div>
      <div class="screen">
        <div id="expr" class="expr" aria-live="polite"></div>
        <div id="display" class="display">0</div>
      </div>
      <div class="meta">
        <button type="button" id="mode-toggle" class="chip" title="Angle mode">DEG</button>
        <span id="mem-flag" class="chip dim" hidden>M</span>
      </div>
      <div class="pad">
        <button data-fn="mc" class="fn">MC</button>
        <button data-fn="mr" class="fn">MR</button>
        <button data-fn="mplus" class="fn">M+</button>
        <button data-fn="mminus" class="fn">M−</button>
        <button data-fn="clear" class="warn">C</button>

        <button data-fn="sin" class="fn">sin</button>
        <button data-fn="cos" class="fn">cos</button>
        <button data-fn="tan" class="fn">tan</button>
        <button data-fn="ln" class="fn">ln</button>
        <button data-fn="log" class="fn">log</button>

        <button data-fn="pow" class="fn">xʸ</button>
        <button data-fn="sqrt" class="fn">√</button>
        <button data-fn="square" class="fn">x²</button>
        <button data-fn="inv" class="fn">1/x</button>
        <button data-fn="fact" class="fn">n!</button>

        <button data-fn="pi" class="fn">π</button>
        <button data-fn="e" class="fn">e</button>
        <button data-fn="percent" class="fn">%</button>
        <button data-fn="sign" class="fn">±</button>
        <button data-op="/" class="op">÷</button>

        <button data-digit="7">7</button>
        <button data-digit="8">8</button>
        <button data-digit="9">9</button>
        <button data-op="*" class="op">×</button>
        <button data-fn="back" class="fn">⌫</button>

        <button data-digit="4">4</button>
        <button data-digit="5">5</button>
        <button data-digit="6">6</button>
        <button data-op="-" class="op">−</button>
        <button data-fn="paren" class="fn">( )</button>

        <button data-digit="1">1</button>
        <button data-digit="2">2</button>
        <button data-digit="3">3</button>
        <button data-op="+" class="op">+</button>
        <button data-fn="equals" class="eq">=</button>

        <button data-digit="0" class="span2">0</button>
        <button data-fn="dot">.</button>
        <button data-fn="ans" class="fn">Ans</button>
      </div>
    </main>
  </div>
  <script src="js/app.js"></script>
</body>
</html>
`;
  const css = `:root {
  color-scheme: dark;
  --bg: #0a0c10;
  --panel: #12151c;
  --ink: #e8edf7;
  --muted: #8b95a8;
  --line: #242a36;
  --accent: #d4a017;
  --op: #2a3344;
  --fn: #1a2030;
  --warn: #5a2430;
  --eq: #c9a227;
  --eq-ink: #1a1400;
  --ok: #3ecf8e;
  font-family: "Segoe UI", "IBM Plex Sans", system-ui, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0; min-height: 100vh; color: var(--ink);
  background:
    radial-gradient(900px 500px at 80% -10%, #1a2233 0%, transparent 55%),
    radial-gradient(700px 400px at 0% 100%, #161018 0%, transparent 50%),
    var(--bg);
}
.desk {
  max-width: 980px; margin: 0 auto; padding: 1.5rem;
  display: grid; gap: 1rem; grid-template-columns: minmax(200px, 260px) 1fr;
}
@media (max-width: 820px) {
  .desk { grid-template-columns: 1fr; }
  .tape { order: 2; max-height: 220px; }
}
.tape, .calc {
  background: linear-gradient(165deg, #161a22, var(--panel));
  border: 1px solid var(--line); border-radius: 18px;
  box-shadow: 0 24px 60px rgba(0,0,0,.45);
}
.tape { display: flex; flex-direction: column; min-height: 420px; overflow: hidden; }
.tape header {
  display: flex; align-items: center; justify-content: space-between;
  padding: .9rem 1rem; border-bottom: 1px solid var(--line);
}
.tape h2 { margin: 0; font-size: .85rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
.tape ul { list-style: none; margin: 0; padding: .75rem; overflow: auto; flex: 1; }
.tape li {
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  font-size: .78rem; padding: .55rem .45rem; border-bottom: 1px solid rgba(255,255,255,.04);
  color: var(--muted);
}
.tape li strong { display: block; color: var(--ink); font-weight: 600; margin-top: .15rem; }
.ghost {
  border: 0; background: transparent; color: var(--muted); cursor: pointer; font-size: .75rem;
}
.calc { padding: 1.1rem 1.15rem 1.25rem; }
.brand-row {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: .75rem;
  font-size: .95rem; letter-spacing: .04em;
}
.badge {
  font-size: .65rem; letter-spacing: .14em; padding: .25rem .5rem; border-radius: 999px;
  border: 1px solid rgba(212,160,23,.45); color: var(--accent);
}
.screen {
  background: #07090d; border: 1px solid #1c2230; border-radius: 12px;
  padding: .85rem 1rem 1rem; margin-bottom: .65rem; min-height: 5.2rem;
}
.expr {
  min-height: 1.2rem; color: var(--muted); font-size: .85rem;
  font-family: ui-monospace, Consolas, monospace; text-align: right; word-break: break-all;
}
.display {
  margin-top: .35rem; font-size: clamp(1.8rem, 4vw, 2.45rem); font-weight: 600;
  text-align: right; font-variant-numeric: tabular-nums; letter-spacing: .02em;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
}
.meta { display: flex; gap: .4rem; margin-bottom: .75rem; }
.chip {
  border: 1px solid var(--line); background: #0e121a; color: var(--muted);
  border-radius: 999px; padding: .25rem .65rem; font-size: .72rem; cursor: pointer;
}
.chip.dim { color: var(--ok); border-color: rgba(62,207,142,.35); cursor: default; }
.pad {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: .45rem;
}
.pad button {
  border: 1px solid #2a3140; background: #1a1f2a; color: var(--ink);
  border-radius: 10px; min-height: 3rem; font-size: 1rem; font-weight: 600;
  cursor: pointer; transition: transform .08s ease, background .12s ease;
}
.pad button:hover { background: #222836; }
.pad button:active { transform: translateY(1px); }
.pad .fn { background: var(--fn); color: #c5d0e6; font-size: .88rem; }
.pad .op { background: var(--op); color: #f0f4ff; font-size: 1.15rem; }
.pad .warn { background: var(--warn); color: #ffd0d8; }
.pad .eq {
  background: linear-gradient(180deg, #e0b63a, var(--eq)); color: var(--eq-ink);
  grid-row: span 2; font-size: 1.35rem;
}
.pad .span2 { grid-column: span 2; }
`;
  const js = `(() => {
  const displayEl = document.getElementById('display');
  const exprEl = document.getElementById('expr');
  const historyEl = document.getElementById('history');
  const modeBtn = document.getElementById('mode-toggle');
  const memFlag = document.getElementById('mem-flag');
  let display = '0';
  let expr = '';
  let memory = 0;
  let lastAns = 0;
  let deg = true;
  let justEval = false;

  const setDisplay = (v) => { display = String(v); displayEl.textContent = display; };
  const setExpr = (v) => { expr = String(v); exprEl.textContent = expr; };
  const syncMem = () => { memFlag.hidden = memory === 0; };

  const toRad = (n) => deg ? (n * Math.PI) / 180 : n;
  const format = (n) => {
    if (!Number.isFinite(n)) return 'Error';
    const s = Number(n.toPrecision(12)).toString();
    return s.length > 16 ? n.toExponential(8) : s;
  };

  const pushHistory = (left, right) => {
    const li = document.createElement('li');
    li.innerHTML = '<span>' + left.replace(/</g, '&lt;') + '</span><strong>' + right.replace(/</g, '&lt;') + '</strong>';
    historyEl.prepend(li);
  };

  const tokenize = (input) => {
    const src = String(input).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/\\s+/g, '');
    const tokens = [];
    let i = 0;
    while (i < src.length) {
      const ch = src[i];
      if (/[0-9.]/.test(ch)) {
        let num = ch; i++;
        while (i < src.length && /[0-9.]/.test(src[i])) num += src[i++];
        tokens.push({ type: 'num', value: parseFloat(num) });
        continue;
      }
      if ('+-*/^()'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue; }
      const rest = src.slice(i).toLowerCase();
      const fns = ['sin','cos','tan','ln','log','sqrt'];
      const hit = fns.find((f) => rest.startsWith(f));
      if (hit) { tokens.push({ type: 'fn', value: hit }); i += hit.length; continue; }
      if (rest.startsWith('pi')) { tokens.push({ type: 'num', value: Math.PI }); i += 2; continue; }
      if (rest.startsWith('e') && !/[0-9]/.test(rest[1] || '')) { tokens.push({ type: 'num', value: Math.E }); i += 1; continue; }
      throw new Error('bad token');
    }
    return tokens;
  };

  const precedence = { '+': 1, '-': 1, '*': 2, '/': 2, '^': 3 };
  const toRpn = (tokens) => {
    const out = []; const stack = [];
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === 'num') out.push(t);
      else if (t.type === 'fn') stack.push(t);
      else if (t.type === 'op' && t.value === '(') stack.push(t);
      else if (t.type === 'op' && t.value === ')') {
        while (stack.length && stack[stack.length - 1].value !== '(') out.push(stack.pop());
        stack.pop();
        if (stack.length && stack[stack.length - 1].type === 'fn') out.push(stack.pop());
      } else if (t.type === 'op') {
        // unary minus
        if (t.value === '-' && (i === 0 || (tokens[i - 1].type === 'op' && tokens[i - 1].value !== ')'))) {
          out.push({ type: 'num', value: 0 });
        }
        while (stack.length) {
          const top = stack[stack.length - 1];
          if (top.type !== 'op' || top.value === '(') break;
          const pTop = precedence[top.value] || 0;
          const pCur = precedence[t.value] || 0;
          if (pTop > pCur || (pTop === pCur && t.value !== '^')) out.push(stack.pop());
          else break;
        }
        stack.push(t);
      }
    }
    while (stack.length) out.push(stack.pop());
    return out;
  };

  const evalRpn = (rpn) => {
    const st = [];
    for (const t of rpn) {
      if (t.type === 'num') st.push(t.value);
      else if (t.type === 'fn') {
        const a = st.pop();
        let r = a;
        if (t.value === 'sin') r = Math.sin(toRad(a));
        if (t.value === 'cos') r = Math.cos(toRad(a));
        if (t.value === 'tan') r = Math.tan(toRad(a));
        if (t.value === 'ln') r = Math.log(a);
        if (t.value === 'log') r = Math.log10(a);
        if (t.value === 'sqrt') r = Math.sqrt(a);
        st.push(r);
      } else if (t.type === 'op') {
        const b = st.pop(); const a = st.pop();
        let r = 0;
        if (t.value === '+') r = a + b;
        if (t.value === '-') r = a - b;
        if (t.value === '*') r = a * b;
        if (t.value === '/') r = a / b;
        if (t.value === '^') r = Math.pow(a, b);
        st.push(r);
      }
    }
    return st.pop();
  };

  const evaluate = (raw) => {
    const tokens = tokenize(raw);
    return evalRpn(toRpn(tokens));
  };

  const applyUnary = (fn) => {
    const n = parseFloat(display);
    let r = n;
    if (fn === 'sqrt') r = Math.sqrt(n);
    if (fn === 'square') r = n * n;
    if (fn === 'inv') r = 1 / n;
    if (fn === 'percent') r = n / 100;
    if (fn === 'sign') r = -n;
    if (fn === 'sin') r = Math.sin(toRad(n));
    if (fn === 'cos') r = Math.cos(toRad(n));
    if (fn === 'tan') r = Math.tan(toRad(n));
    if (fn === 'ln') r = Math.log(n);
    if (fn === 'log') r = Math.log10(n);
    if (fn === 'fact') {
      if (n < 0 || !Number.isInteger(n) || n > 170) r = NaN;
      else { r = 1; for (let i = 2; i <= n; i++) r *= i; }
    }
    const label = fn + '(' + display + ')';
    const out = format(r);
    setExpr(label);
    setDisplay(out);
    lastAns = r;
    justEval = true;
    if (Number.isFinite(r)) pushHistory(label, out);
  };

  const equals = () => {
    try {
      const source = (expr && !justEval ? expr : '') + (justEval ? '' : display);
      const raw = (expr.match(/[\\d.eEπpi]+\\s*$/) && justEval) ? expr : (expr ? expr.replace(/\\s+$/, '') + display : display);
      const cleaned = raw.replace(/π/g, 'pi');
      const result = evaluate(cleaned);
      const out = format(result);
      pushHistory(cleaned, out);
      setExpr(cleaned + ' =');
      setDisplay(out);
      lastAns = result;
      justEval = true;
    } catch {
      setDisplay('Error');
      justEval = true;
    }
  };

  document.querySelector('.pad').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.digit != null) {
      const d = btn.dataset.digit;
      if (justEval) { setExpr(''); setDisplay(d === '0' ? '0' : d); justEval = false; return; }
      if (display === '0' && d !== '0') setDisplay(d);
      else if (display === '0' && d === '0') setDisplay('0');
      else setDisplay(display + d);
      return;
    }
    if (btn.dataset.op) {
      const op = btn.dataset.op;
      const sym = op === '*' ? '×' : op === '/' ? '÷' : op === '-' ? '−' : '+';
      if (justEval) { setExpr(display + ' ' + sym + ' '); justEval = false; setDisplay('0'); return; }
      setExpr((expr || display) + ' ' + sym + ' ');
      setDisplay('0');
      return;
    }
    const fn = btn.dataset.fn;
    if (!fn) return;
    if (fn === 'clear') { setDisplay('0'); setExpr(''); justEval = false; return; }
    if (fn === 'back') {
      if (justEval) return;
      setDisplay(display.length <= 1 ? '0' : display.slice(0, -1));
      return;
    }
    if (fn === 'dot') {
      if (justEval) { setDisplay('0.'); justEval = false; return; }
      if (!display.includes('.')) setDisplay(display + '.');
      return;
    }
    if (fn === 'pi') { setDisplay(format(Math.PI)); justEval = true; return; }
    if (fn === 'e') { setDisplay(format(Math.E)); justEval = true; return; }
    if (fn === 'ans') { setDisplay(format(lastAns)); justEval = true; return; }
    if (fn === 'mc') { memory = 0; syncMem(); return; }
    if (fn === 'mr') { setDisplay(format(memory)); justEval = true; return; }
    if (fn === 'mplus') { memory += parseFloat(display) || 0; syncMem(); return; }
    if (fn === 'mminus') { memory -= parseFloat(display) || 0; syncMem(); return; }
    if (fn === 'pow') {
      setExpr((expr || display) + ' ^ ');
      setDisplay('0');
      justEval = false;
      return;
    }
    if (fn === 'paren') {
      setExpr((expr || '') + (expr.includes('(') && !expr.includes(')') ? display + ')' : '(' + display));
      return;
    }
    if (fn === 'equals') { equals(); return; }
    applyUnary(fn);
  });

  modeBtn.addEventListener('click', () => {
    deg = !deg;
    modeBtn.textContent = deg ? 'DEG' : 'RAD';
  });
  document.getElementById('clear-tape').addEventListener('click', () => { historyEl.innerHTML = ''; });

  window.addEventListener('keydown', (e) => {
    if (/^[0-9]$/.test(e.key)) {
      document.querySelector('[data-digit="' + e.key + '"]')?.click();
      e.preventDefault();
    } else if (e.key === '.') document.querySelector('[data-fn="dot"]')?.click();
    else if (e.key === 'Enter' || e.key === '=') { document.querySelector('[data-fn="equals"]')?.click(); e.preventDefault(); }
    else if (e.key === 'Backspace') document.querySelector('[data-fn="back"]')?.click();
    else if (e.key === 'Escape') document.querySelector('[data-fn="clear"]')?.click();
    else if ('+-*/'.includes(e.key)) document.querySelector('[data-op="' + e.key + '"]')?.click();
  });
})();
`;
  return [
    { path: 'index.html', content: html },
    { path: 'css/styles.css', content: css },
    { path: 'js/app.js', content: js },
    { path: '.gitignore', content: '.DS_Store\nThumbs.db\n*.log\n.env\n.env.*\n' },
  ];
}

/** Apple / Cursor-grade product marketing page — hero, features, specs, legal pages. */
export function wantsPremiumProductLanding(brief: string): boolean {
  const t = String(brief || '');
  return /\b(?:apple\.com|premium|professional|atelier|product\s+(?:story|marketing)|full[- ]?bleed|feature\s+grid|terms\s+of\s+service|privacy\s+(?:policy|footer)|design[- ]conscious)\b/i.test(t)
    || (/\b(?:unsplash|hero\s+photograph)\b/i.test(t) && /\b(?:buy\s+now|cta|newsletter|specs?)\b/i.test(t));
}

function buildPremiumProductLandingFiles(name: string, brief: string): LandingFile[] {
  const title = String(name || 'Product').trim() || 'Product';
  let urls = pickUrls(brief);
  if (urls.length < 3) {
    urls = [
      'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=2000&q=80',
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1200&q=80',
      'https://images.unsplash.com/photo-1614850523459-c2f4e1463bc0?w=1200&q=80',
      'https://images.unsplash.com/photo-1633356122544-f134324a6cee?w=1200&q=80',
      ...urls,
    ];
  }
  const hero = urls[0];
  const headline = pickHeadline(brief, title);
  const subtitle = pickSubtitle(brief)
    || 'Designed with quiet precision. Photography, typography, and motion in one considered surface.';
  const primaryCta = pickButtons(brief)[0] || 'Buy Now';
  const secondaryCta = pickButtons(brief)[1] || 'Explore';
  const year = new Date().getFullYear();

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/styles.css" />
  <link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%230a0a0a'/%3E%3Ccircle cx='16' cy='16' r='7' fill='%23f5f5f7'/%3E%3C/svg%3E" />
</head>
<body>
  <nav class="topnav" aria-label="Primary">
    <a class="logo" href="#top" aria-label="${escapeHtml(title)} home">
      <span class="logo-mark" aria-hidden="true"></span>
      <span>${escapeHtml(title)}</span>
    </a>
    <div class="topnav-links">
      <a href="#story">Story</a>
      <a href="#features">Features</a>
      <a href="#specs">Specs</a>
      <a href="#about">About</a>
      <a class="nav-cta" href="#buy">${escapeHtml(primaryCta)}</a>
    </div>
  </nav>

  <header id="top" class="hero" style="--hero:url('${escapeHtml(hero)}')">
    <div class="hero-veil"></div>
    <div class="hero-inner">
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h1>${escapeHtml(headline)}</h1>
      <p class="sub">${escapeHtml(subtitle)}</p>
      <div class="actions">
        <a class="btn btn-primary" href="#buy">${escapeHtml(primaryCta)}</a>
        <a class="btn btn-ghost" href="#story">${escapeHtml(secondaryCta)}</a>
      </div>
    </div>
  </header>

  <main>
    <section id="story" class="story">
      <div class="story-copy">
        <p class="section-label">Product story</p>
        <h2>Crafted for people who notice the details.</h2>
        <p>Every surface is intentional — from the full-bleed photography to the quiet type hierarchy. ${escapeHtml(title)} is a complete first page you can ship, polish, and extend.</p>
      </div>
      <figure class="story-media">
        <img src="${escapeHtml(urls[1])}" alt="Product atmosphere" loading="lazy" />
      </figure>
    </section>

    <section id="features" class="features" aria-label="Features">
      <p class="section-label">Capabilities</p>
      <h2>Everything in its place.</h2>
      <div class="feature-grid">
        <article class="feature">
          <div class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 7h16M4 12h10M4 17h14"/></svg>
          </div>
          <h3>Quiet typography</h3>
          <p>Serif display with system-clean body copy. Hierarchy you feel before you measure it.</p>
        </article>
        <article class="feature">
          <div class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="12" r="1.5"/><path d="M21 15l-4.5-4.5L9 18"/></svg>
          </div>
          <h3>Real photography</h3>
          <p>Full-bleed Unsplash hero and gallery frames — not gradients pretending to be product shots.</p>
        </article>
        <article class="feature">
          <div class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v18M3 12h18"/><circle cx="12" cy="12" r="9"/></svg>
          </div>
          <h3>Subtle motion</h3>
          <p>Soft fades on scroll. Presence without noise — the way a flagship site should feel.</p>
        </article>
        <article class="feature">
          <div class="feature-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <h3>Legal-ready footer</h3>
          <p>Terms, Privacy, and Contact — real pages linked from a polished site footer.</p>
        </article>
      </div>
    </section>

    <section class="gallery" aria-label="Gallery">
      <img src="${escapeHtml(urls[2])}" alt="Detail one" loading="lazy" />
      <img src="${escapeHtml(urls[3] || urls[1])}" alt="Detail two" loading="lazy" />
    </section>

    <section id="specs" class="specs">
      <p class="section-label">Specifications</p>
      <h2>Built to feel finished.</h2>
      <dl class="spec-strip">
        <div><dt>Display</dt><dd>Edge-to-edge hero · 16:9 photography</dd></div>
        <div><dt>Type</dt><dd>Instrument Serif + Inter</dd></div>
        <div><dt>Theme</dt><dd>Near-black · aluminum accents</dd></div>
        <div><dt>Motion</dt><dd>Intersection fade · 400ms ease</dd></div>
        <div><dt>Pages</dt><dd>Home · Terms · Privacy · Contact</dd></div>
        <div><dt>CTA</dt><dd>${escapeHtml(primaryCta)} · ${escapeHtml(secondaryCta)}</dd></div>
      </dl>
    </section>

    <section id="about" class="about">
      <p class="section-label">About</p>
      <h2>A studio mindset, not a template.</h2>
      <p>${escapeHtml(title)} ships as a professional marketing surface — navigable sections, iconography, newsletter capture, and legal pages — so the first impression matches the product ambition.</p>
    </section>

    <section id="buy" class="newsletter">
      <div class="newsletter-inner">
        <h2>Stay in the loop.</h2>
        <p>Product notes, launch windows, and design drops. No spam.</p>
        <form id="newsletter-form" class="newsletter-form" novalidate>
          <label class="sr-only" for="email">Email</label>
          <input id="email" name="email" type="email" placeholder="you@studio.com" required autocomplete="email" />
          <button type="submit">${escapeHtml(primaryCta)}</button>
        </form>
        <p class="form-note" id="form-note" hidden>Thanks — you’re on the list.</p>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="footer-brand">
      <span class="logo-mark" aria-hidden="true"></span>
      <strong>${escapeHtml(title)}</strong>
      <p>&copy; ${year} ${escapeHtml(title)}. All rights reserved.</p>
    </div>
    <div class="footer-links">
      <a href="terms.html">Terms of Service</a>
      <a href="privacy.html">Privacy Policy</a>
      <a href="contact.html">Contact</a>
    </div>
  </footer>
  <script src="js/app.js"></script>
</body>
</html>
`;

  const css = `:root {
  --bg: #050505;
  --fg: #f5f5f7;
  --muted: rgba(245,245,247,0.64);
  --line: rgba(255,255,255,0.08);
  --accent: #f5f5f7;
  --accent-ink: #0a0a0a;
  --serif: "Instrument Serif", Georgia, serif;
  --sans: Inter, system-ui, sans-serif;
}
* { box-sizing: border-box; margin: 0; }
html { scroll-behavior: smooth; }
body {
  font-family: var(--sans);
  color: var(--fg);
  background: var(--bg);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
.logo-mark {
  width: 1.1rem; height: 1.1rem; border-radius: 999px;
  background: radial-gradient(circle at 30% 30%, #fff, #a1a1a6 55%, #3a3a3c);
  display: inline-block;
}
.topnav {
  position: sticky; top: 0; z-index: 20;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.85rem 1.5rem;
  background: rgba(5,5,5,0.72);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--line);
}
.logo { display: inline-flex; align-items: center; gap: 0.55rem; color: var(--fg); text-decoration: none; font-weight: 600; letter-spacing: -0.02em; }
.topnav-links { display: flex; align-items: center; gap: 1.1rem; font-size: 0.86rem; }
.topnav-links a { color: var(--muted); text-decoration: none; }
.topnav-links a:hover { color: var(--fg); }
.nav-cta {
  padding: 0.4rem 0.85rem !important;
  border-radius: 999px;
  background: var(--accent) !important;
  color: var(--accent-ink) !important;
  font-weight: 600;
}
.hero {
  position: relative;
  min-height: 92vh;
  display: grid;
  place-items: end start;
  padding: 5rem 1.5rem 4rem;
  background: var(--hero) center/cover no-repeat;
}
.hero-veil {
  position: absolute; inset: 0;
  background:
    linear-gradient(180deg, rgba(5,5,5,0.25), rgba(5,5,5,0.82) 70%, var(--bg)),
    linear-gradient(90deg, rgba(5,5,5,0.55), transparent 55%);
}
.hero-inner { position: relative; max-width: 40rem; }
.eyebrow {
  font-size: 0.72rem; letter-spacing: 0.22em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 1rem;
}
.hero h1 {
  font-family: var(--serif);
  font-size: clamp(2.8rem, 7vw, 5.2rem);
  font-weight: 400;
  letter-spacing: -0.03em;
  line-height: 1.02;
  margin-bottom: 1rem;
}
.sub { color: var(--muted); max-width: 28rem; margin-bottom: 1.75rem; font-size: 1.05rem; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; }
.btn {
  display: inline-flex; align-items: center; justify-content: center;
  padding: 0.85rem 1.35rem; border-radius: 999px; text-decoration: none;
  font-size: 0.92rem; font-weight: 600; border: 1px solid transparent;
  transition: transform 0.2s ease, background 0.2s ease, color 0.2s ease;
}
.btn:hover { transform: translateY(-1px); }
.btn-primary { background: var(--accent); color: var(--accent-ink); }
.btn-ghost { border-color: rgba(255,255,255,0.28); color: var(--fg); background: rgba(255,255,255,0.04); }
.section-label {
  font-size: 0.72rem; letter-spacing: 0.18em; text-transform: uppercase;
  color: var(--muted); margin-bottom: 0.75rem;
}
.story, .features, .specs, .about, .newsletter {
  padding: 5rem 1.5rem;
  max-width: 1120px;
  margin: 0 auto;
}
.story {
  display: grid; gap: 2.5rem; align-items: center;
  grid-template-columns: 1.05fr 0.95fr;
}
.story h2, .features h2, .specs h2, .about h2, .newsletter h2 {
  font-family: var(--serif);
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 400;
  letter-spacing: -0.02em;
  margin-bottom: 1rem;
}
.story-copy p, .about p, .newsletter p { color: var(--muted); max-width: 34rem; }
.story-media img, .gallery img {
  width: 100%; display: block; border-radius: 1.25rem;
  border: 1px solid var(--line); object-fit: cover;
}
.story-media img { min-height: 22rem; }
.feature-grid {
  display: grid; gap: 1rem;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: 2rem;
}
.feature {
  padding: 1.25rem;
  border: 1px solid var(--line);
  border-radius: 1.1rem;
  background: linear-gradient(180deg, rgba(255,255,255,0.03), transparent);
}
.feature-icon {
  width: 2.4rem; height: 2.4rem; margin-bottom: 1rem;
  color: var(--fg); opacity: 0.9;
}
.feature-icon svg { width: 100%; height: 100%; }
.feature h3 { font-size: 1rem; margin-bottom: 0.4rem; letter-spacing: -0.01em; }
.feature p { color: var(--muted); font-size: 0.9rem; }
.gallery {
  display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 1rem;
  max-width: 1120px; margin: 0 auto; padding: 0 1.5rem 2rem;
}
.gallery img { min-height: 18rem; }
.spec-strip {
  display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px; margin-top: 2rem;
  background: var(--line);
  border: 1px solid var(--line);
  border-radius: 1.1rem;
  overflow: hidden;
}
.spec-strip > div { background: #0b0b0b; padding: 1.15rem 1.2rem; }
.spec-strip dt { font-size: 0.72rem; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); margin-bottom: 0.35rem; }
.spec-strip dd { font-size: 0.95rem; }
.newsletter {
  margin: 2rem auto 4rem;
  border: 1px solid var(--line);
  border-radius: 1.5rem;
  background:
    radial-gradient(circle at 20% 0%, rgba(255,255,255,0.08), transparent 45%),
    #0a0a0a;
}
.newsletter-inner { max-width: 36rem; }
.newsletter-form { display: flex; gap: 0.6rem; margin-top: 1.4rem; flex-wrap: wrap; }
.newsletter-form input {
  flex: 1; min-width: 14rem;
  padding: 0.85rem 1rem; border-radius: 999px;
  border: 1px solid var(--line); background: rgba(255,255,255,0.03); color: var(--fg);
  outline: none;
}
.newsletter-form button {
  padding: 0.85rem 1.25rem; border-radius: 999px; border: 0;
  background: var(--accent); color: var(--accent-ink); font-weight: 600; cursor: pointer;
}
.form-note { margin-top: 0.85rem; color: #9ae6b4; font-size: 0.9rem; }
.site-footer {
  display: flex; justify-content: space-between; gap: 1.5rem; flex-wrap: wrap;
  padding: 2.5rem 1.5rem 3rem; border-top: 1px solid var(--line);
  max-width: 1120px; margin: 0 auto; color: var(--muted); font-size: 0.88rem;
}
.footer-brand { display: grid; gap: 0.55rem; }
.footer-brand strong { color: var(--fg); }
.footer-links { display: flex; gap: 1.25rem; align-items: flex-start; }
.footer-links a { color: var(--muted); text-decoration: none; }
.footer-links a:hover { color: var(--fg); }
.reveal { opacity: 0; transform: translateY(14px); transition: opacity 0.55s ease, transform 0.55s ease; }
.reveal.is-in { opacity: 1; transform: none; }
@media (max-width: 900px) {
  .topnav-links a:not(.nav-cta) { display: none; }
  .story, .feature-grid, .gallery, .spec-strip { grid-template-columns: 1fr; }
  .gallery img, .story-media img { min-height: 14rem; }
}
`;

  const js = `(() => {
  const reveal = () => {
    document.querySelectorAll('.story, .features, .specs, .about, .newsletter, .gallery').forEach((el) => {
      el.classList.add('reveal');
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('is-in'); });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el));
  };
  reveal();
  document.querySelectorAll('a[href^="#"]').forEach((a) => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const el = document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  const form = document.getElementById('newsletter-form');
  const note = document.getElementById('form-note');
  form?.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.querySelector('input[type="email"]');
    if (email && !email.value.includes('@')) {
      email.focus();
      return;
    }
    if (note) note.hidden = false;
    form.reset();
  });
})();
`;

  const legalShell = (pageTitle: string, bodyHtml: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(pageTitle)} · ${escapeHtml(title)}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <nav class="topnav"><a class="logo" href="index.html"><span class="logo-mark"></span><span>${escapeHtml(title)}</span></a></nav>
  <main class="about" style="max-width:42rem">
    <p class="section-label">Legal</p>
    <h2>${escapeHtml(pageTitle)}</h2>
    ${bodyHtml}
    <p style="margin-top:2rem"><a class="btn btn-ghost" href="index.html">Back home</a></p>
  </main>
  <footer class="site-footer">
    <p>&copy; ${year} ${escapeHtml(title)}</p>
    <div class="footer-links">
      <a href="terms.html">Terms</a>
      <a href="privacy.html">Privacy</a>
      <a href="contact.html">Contact</a>
    </div>
  </footer>
</body>
</html>`;

  return [
    { path: 'index.html', content: html },
    { path: 'css/styles.css', content: css },
    { path: 'js/app.js', content: js },
    {
      path: 'terms.html',
      content: legalShell('Terms of Service', `<p style="color:var(--muted);margin-top:1rem">By using ${escapeHtml(title)} you agree to these demonstration terms. This site is a product marketing preview. No purchase is processed here. Content is provided as-is for evaluation.</p><p style="color:var(--muted);margin-top:1rem">You may not scrape, resell, or misrepresent ${escapeHtml(title)} branding. We may update these terms; continued use means acceptance.</p>`),
    },
    {
      path: 'privacy.html',
      content: legalShell('Privacy Policy', `<p style="color:var(--muted);margin-top:1rem">Newsletter emails entered on this demo stay in your browser session only — nothing is sent to a server. We do not sell personal data. Analytics are not embedded in this scaffold.</p><p style="color:var(--muted);margin-top:1rem">Photography is sourced from Unsplash under their license. Replace assets before production launch.</p>`),
    },
    {
      path: 'contact.html',
      content: legalShell('Contact', `<p style="color:var(--muted);margin-top:1rem">Press and partnerships: hello@${escapeHtml(title).toLowerCase().replace(/\s+/g, '')}.studio</p><p style="color:var(--muted);margin-top:1rem">For product support, reply through your ARK project chat or the in-page newsletter capture on the home page.</p>`),
    },
    { path: '.gitignore', content: '.DS_Store\nThumbs.db\n*.log\n.env\n.env.*\n' },
  ];
}

/** Cozy book-club tracker (current book, finished list, notes). */
function buildBookClubLandingFiles(name: string, brief: string): LandingFile[] {
  const title = String(name || 'ShelfCircle').trim() || 'ShelfCircle';
  const darkGreen = /dark\s+green|forest|emerald/i.test(brief);
  const cream = /cream|cozy|library/i.test(brief);
  const bg = darkGreen || cream ? '#12241a' : '#12241a';
  const ink = '#f3ead7';
  const accent = '#c4a574';
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <header class="top">
    <p class="brand">${escapeHtml(title)}</p>
    <h1>This month's circle</h1>
    <p class="sub">Current book, who finished, and shared notes.</p>
  </header>
  <main class="layout">
    <section class="card" aria-labelledby="current-book">
      <h2 id="current-book">Current book</h2>
      <p class="book-title" id="bookTitle">The Midnight Library</p>
      <p class="meta">Pick by Maya · 4 weeks left</p>
    </section>
    <section class="card" aria-labelledby="finished">
      <h2 id="finished">Who finished</h2>
      <ul class="people" id="finishedList">
        <li>Jordan</li>
        <li>Sam</li>
      </ul>
      <form id="addFinished" class="row">
        <input name="name" placeholder="Add a name" required />
        <button type="submit">Add</button>
      </form>
    </section>
    <section class="card wide" aria-labelledby="notes">
      <h2 id="notes">Notes</h2>
      <textarea id="notesBox" rows="6" placeholder="Quotes, questions, spoilers with a warning…"></textarea>
      <button type="button" id="saveNotes">Save notes</button>
    </section>
  </main>
  <script src="js/app.js"></script>
</body>
</html>
`;
  const css = `* { box-sizing: border-box; margin: 0; }
body {
  font-family: Georgia, "Times New Roman", serif;
  background: ${bg};
  color: ${ink};
  min-height: 100vh;
  line-height: 1.5;
}
.top { padding: 2.5rem 1.5rem 1rem; max-width: 920px; margin: 0 auto; }
.brand { letter-spacing: 0.16em; text-transform: uppercase; font-size: 0.75rem; opacity: 0.8; margin-bottom: 0.75rem; font-family: system-ui, sans-serif; }
h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); font-weight: 500; margin-bottom: 0.4rem; }
.sub { opacity: 0.75; max-width: 36rem; }
.layout { max-width: 920px; margin: 0 auto; padding: 1rem 1.5rem 3rem; display: grid; gap: 1rem; grid-template-columns: 1fr 1fr; }
.card { background: rgba(243,234,215,0.06); border: 1px solid rgba(243,234,215,0.14); border-radius: 16px; padding: 1.25rem; }
.card.wide { grid-column: 1 / -1; }
h2 { font-size: 1rem; letter-spacing: 0.04em; text-transform: uppercase; font-family: system-ui, sans-serif; margin-bottom: 0.75rem; color: ${accent}; }
.book-title { font-size: 1.45rem; margin-bottom: 0.35rem; }
.meta { opacity: 0.7; font-size: 0.95rem; }
.people { list-style: none; padding: 0; margin: 0 0 1rem; }
.people li { padding: 0.35rem 0; border-bottom: 1px solid rgba(243,234,215,0.1); }
.row { display: flex; gap: 0.5rem; }
input, textarea, button {
  font: inherit; border-radius: 10px; border: 1px solid rgba(243,234,215,0.2);
  background: rgba(0,0,0,0.25); color: ${ink}; padding: 0.55rem 0.75rem;
}
input, textarea { width: 100%; }
button { background: ${accent}; color: #1a140c; border: 0; cursor: pointer; font-family: system-ui, sans-serif; font-weight: 600; }
button:hover { filter: brightness(1.05); }
textarea { margin-bottom: 0.75rem; resize: vertical; }
@media (max-width: 720px) { .layout { grid-template-columns: 1fr; } }
`;
  const js = `const finishedKey = 'ark:${title.replace(/'/g, '')}:finished';
const notesKey = 'ark:${title.replace(/'/g, '')}:notes';
const list = document.getElementById('finishedList');
const form = document.getElementById('addFinished');
const notes = document.getElementById('notesBox');
const saveNotes = document.getElementById('saveNotes');

function loadFinished() {
  try { return JSON.parse(localStorage.getItem(finishedKey) || '["Jordan","Sam"]'); } catch { return ['Jordan', 'Sam']; }
}
function renderFinished(names) {
  list.innerHTML = names.map((n) => '<li>' + String(n).replace(/[<>&]/g, '') + '</li>').join('');
}
let people = loadFinished();
renderFinished(people);
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = new FormData(form).get('name');
  if (!name) return;
  people = [...people, String(name).trim()];
  localStorage.setItem(finishedKey, JSON.stringify(people));
  renderFinished(people);
  form.reset();
});
notes.value = localStorage.getItem(notesKey) || '';
saveNotes.addEventListener('click', () => {
  localStorage.setItem(notesKey, notes.value);
  saveNotes.textContent = 'Saved';
  setTimeout(() => { saveNotes.textContent = 'Save notes'; }, 1200);
});
`;
  return [
    { path: 'index.html', content: html },
    { path: 'css/styles.css', content: css },
    { path: 'js/app.js', content: js },
    { path: '.gitignore', content: '.DS_Store\nThumbs.db\n*.log\n.env\n.env.*\n' },
  ];
}

export function buildLandingPageFiles(name: string, brief: string): LandingFile[] {
  const title = String(name || 'Site').trim() || 'Site';
  let urls = pickUrls(brief);

  // Book club / reading circle — not a restaurant "Book a table" landing.
  if (/\bbook\s*club\b/i.test(brief) || /\b(reading\s+circle|bookshelf|who\s+finished|current\s+book)\b/i.test(brief)) {
    return buildBookClubLandingFiles(title, brief);
  }

  if (wantsPremiumProductLanding(brief)) {
    return buildPremiumProductLandingFiles(title, brief);
  }

  if (/\b(gallery|masonry|portfolio|photographer|photo\s+grid|framelab)\b/i.test(brief)
    || (urls.length >= 4 && /\b(black|nav|work|about)\b/i.test(brief))) {
    return buildPortfolioFiles(title, brief, urls);
  }

  if (/\b(festival|lineup|ticket\s+cta|jazz|concert|velvet)\b/i.test(brief)
    && !/\b(watchlist|trading|orders?\s+tab|trade\s*rail)\b/i.test(brief)) {
    return buildFestivalLandingFiles(title, brief);
  }

  if (/\b(watchlist|trading\s+cockpit|trade\s*rail|orders?\s+tab)\b/i.test(brief)
    || (/\b(watchlist|orders|settings)\b/i.test(brief) && /\b(tab|cockpit|desktop)\b/i.test(brief))) {
    return buildTradeCockpitFiles(title, brief);
  }

  if (/\bcalculator\b/i.test(brief)
    || (/\bcalc\b/i.test(brief) && /\b(scientific|professional|pro|engineer)\b/i.test(brief))) {
    return buildProCalculatorFiles(title, brief);
  }

  // "Use Unsplash" with no concrete URLs. still ship a real hero + menu photos.
  if (!urls.length && /\b(restaurant|menu|dining|cafe|food|platehouse|unsplash)\b/i.test(brief)) {
    urls = [
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1600&q=80',
      'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=900&q=80',
      'https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=900&q=80',
      'https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=900&q=80',
    ];
  }

  const hero = urls[0] || 'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1600&q=80';
  const headline = pickHeadline(brief, title);
  const subtitle = pickSubtitle(brief)
    || (/\b(restaurant|dining|cafe)\b/i.test(brief) ? 'Seasonal plates, warm light, a table waiting for you.' : 'Built with ARK');
  const buttons = pickButtons(brief);
  const cards = pickCards(brief, urls);
  const btnList = buttons.length ? buttons : (/\b(restaurant|menu|booking|reserve)\b/i.test(brief) ? ['Reserve', 'View menu'] : ['Get started']);
  const btnHtml = btnList.map((b) => {
    const lower = b.toLowerCase();
    const href = /menu|dish|view/i.test(lower) ? '#menu'
      : /reserve|book|table|order/i.test(lower) ? '#reserve'
      : '#menu';
    return `<a class="btn" href="${href}">${escapeHtml(b)}</a>`;
  }).join('\n        ');
  const cardsHtml = cards.map(c => `
      <article class="card">
        ${c.image ? `<img src="${escapeHtml(c.image)}" alt="${escapeHtml(c.title)}" loading="lazy" />` : ''}
        <div class="card-body">
          <h3>${escapeHtml(c.title)}</h3>
          <p>${escapeHtml(c.meta)}</p>
          <a class="btn btn-sm" href="#reserve">Book</a>
        </div>
      </article>`).join('\n');

  const footerInner = /\b(restaurant|menu|dining|cafe|harbor|plate)\b/i.test(brief)
    ? `<p id="reserve">Tue–Sun · 5pm–10pm · Walk-ins welcome</p>
    <p>&copy; ${new Date().getFullYear()} ${escapeHtml(title)}</p>`
    : `<p>&copy; ${new Date().getFullYear()} ${escapeHtml(title)}</p>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="css/styles.css" />
</head>
<body>
  <header class="hero" style="--hero:url('${escapeHtml(hero)}')">
    <div class="hero-inner">
      <p class="brand">${escapeHtml(title)}</p>
      <h1>${escapeHtml(headline)}</h1>
      <p class="sub">${escapeHtml(subtitle)}</p>
      <div class="actions">
        ${btnHtml}
      </div>
    </div>
  </header>
  <main>
    <section id="menu" class="grid" aria-label="Menu">
${cardsHtml || '      <p class="empty">Add sections in chat. this page is ready to edit.</p>'}
    </section>
  </main>
  <footer>
    ${footerInner}
  </footer>
  <script src="js/app.js"></script>
</body>
</html>
`;

  const css = `* { box-sizing: border-box; margin: 0; }
body {
  font-family: Georgia, "Times New Roman", serif;
  color: #f4f1ea;
  background: #141210;
  line-height: 1.45;
}
.hero {
  min-height: 72vh;
  background:
    linear-gradient(180deg, rgba(12,10,8,0.55), rgba(12,10,8,0.82)),
    var(--hero) center/cover no-repeat;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 3rem 1.25rem;
}
.brand {
  letter-spacing: 0.18em;
  text-transform: uppercase;
  font-size: 0.75rem;
  opacity: 0.85;
  margin-bottom: 0.75rem;
  font-family: system-ui, sans-serif;
}
.hero h1 {
  font-size: clamp(2.4rem, 6vw, 4rem);
  font-weight: 500;
  margin-bottom: 0.6rem;
}
.sub { opacity: 0.9; max-width: 28rem; margin: 0 auto 1.5rem; }
.actions { display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; }
.btn {
  display: inline-block;
  padding: 0.7rem 1.15rem;
  border-radius: 999px;
  background: #e8dcc8;
  color: #1a1510;
  text-decoration: none;
  font-family: system-ui, sans-serif;
  font-weight: 600;
  font-size: 0.9rem;
  border: 0;
  cursor: pointer;
}
.btn-sm { padding: 0.4rem 0.85rem; font-size: 0.8rem; margin-top: 0.5rem; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1.25rem;
  padding: 2.5rem 1.25rem 3rem;
  max-width: 1100px;
  margin: 0 auto;
}
.card {
  background: #1e1a16;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  overflow: hidden;
}
.card img { width: 100%; height: 180px; object-fit: cover; display: block; }
.card-body { padding: 1rem 1rem 1.15rem; }
.card h3 { font-size: 1.15rem; margin-bottom: 0.35rem; }
.card p { opacity: 0.8; font-size: 0.92rem; font-family: system-ui, sans-serif; }
footer {
  padding: 1.5rem;
  text-align: center;
  opacity: 0.55;
  font-size: 0.85rem;
  font-family: system-ui, sans-serif;
}
.empty { opacity: 0.6; grid-column: 1 / -1; text-align: center; }
`;

  const js = `document.querySelectorAll('a.btn').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (!id || id.charAt(0) !== '#') return;
    const el = document.querySelector(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});
`;

  return [
    { path: 'index.html', content: html },
    { path: 'css/styles.css', content: css },
    { path: 'js/app.js', content: js },
    { path: '.gitignore', content: '.DS_Store\nThumbs.db\n*.log\n.env\n.env.*\n' },
  ];
}
