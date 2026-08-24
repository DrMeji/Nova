/**
 * Deterministic landing-page HTML/CSS/JS from a chat brief
 * (hero URL, CTAs, product cards) — never leave an empty #app.
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
  if (/\bbook(?:ing)?\b/i.test(t) && !out.some(o => /^book$/i.test(o) || /^reserve$/i.test(o))) {
    out.push(/\b(restaurant|dining|cafe|menu)\b/i.test(t) || /\breserve\b/i.test(t) ? 'Reserve' : 'Book');
  }
  if (/\bmenu\b/i.test(t) && !out.some(o => /menu/i.test(o))) {
    out.push('View menu');
  }
  return out.slice(0, 4);
}

type Card = { title: string; meta: string; image: string };

function pickCards(text: string, images: string[]): Card[] {
  const t = String(text || '');
  const cards: Card[] = [];
  // "Name — $189/night" or "Name - $189"
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
  // "left rail" alone is used by finance/notes/desktop apps — only counts with chat nouns.
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
  // Dense tool UI / trading cockpit — tabs + live controls, not a marketing landing.
  if (/\b(watchlist|orders?\s+tab|trading\s+cockpit|trade\s*rail|desktop[- ]style)\b/i.test(t)
    && /\b(tab|settings|panel|button|cockpit|software)\b/i.test(t)) {
    return true;
  }
  // Calculators ship as static HTML/CSS/JS — not a Vite React SPA.
  return false;
}

/** Marketing / restaurant / portfolio landing signals (hero, menu, Unsplash, etc.). */
function looksLikeMarketingLanding(text: string): boolean {
  const t = String(text || '');
  if (t.length < 60) return false;
  if (wantsInteractiveSpaScaffold(t)) return false;
  // Festival / concert / event landings — even short briefs must not become empty Vite shells.
  if (/\b(festival|lineup|ticket\s+cta|jazz|concert|velvet|landing\s+page)\b/i.test(t)) return true;
  const hasMedia = /unsplash|https?:\/\/\S+\.(?:jpg|jpeg|png|webp)|images\.unsplash/i.test(t);
  // Do not treat lone "card" as marketing — kanban "Add Card" would false-positive.
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
    || `${title} is a photography portfolio — real frames, quiet composition, and work you can feel.`;
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

/** Professional / scientific calculator — history tape, memory, trig, deg/rad. */
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

export function buildLandingPageFiles(name: string, brief: string): LandingFile[] {
  const title = String(name || 'Site').trim() || 'Site';
  let urls = pickUrls(brief);

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

  // "Use Unsplash" with no concrete URLs — still ship a real hero + menu photos.
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
${cardsHtml || '      <p class="empty">Add sections in chat — this page is ready to edit.</p>'}
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
