/**
 * Normal invent floor — real Acc files for create/edit/verify everyday path.
 * Multi-page (hash router, zero deps), 404/contact, favicon, env, license, README,
 * loading/empty states, agent scratchpad, auth/db hooks, share-live note.
 */

function escBrand(brand: string): string {
  return String(brand || 'App').trim() || 'App';
}

function slug(brand: string): string {
  return escBrand(brand).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app';
}

/** Hash-page helpers — no react-router dependency (won't break craft App). */
export function inventNormalPagesFiles(brand: string): Record<string, string> {
  const b = escBrand(brand);
  return {
    'src/pages/useHashPage.js': `/** Invent hash page hook — ${b} */
import { useEffect, useState } from 'react';

export function useHashPage(fallback = 'home') {
  const read = () => {
    const h = String(window.location.hash || '').replace(/^#\\/?/, '').trim();
    return h || fallback;
  };
  const [page, setPage] = useState(read);
  useEffect(() => {
    const onHash = () => setPage(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const go = (next) => {
    const id = String(next || fallback).replace(/^#/, '');
    window.location.hash = id;
    setPage(id || fallback);
  };
  return { page, go };
}
`,
    'src/pages/NotFound.jsx': `/** Invent 404 page — ${b} */
export default function NotFound({ onHome }) {
  return (
    <main className="invent-404" style={{ minHeight: '60vh', display: 'grid', placeItems: 'center', padding: 32 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <p style={{ opacity: 0.6, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 12 }}>404</p>
        <h1 style={{ fontSize: '1.75rem', margin: '8px 0 12px' }}>Page not found</h1>
        <p style={{ opacity: 0.75, marginBottom: 20 }}>That route is not part of ${b}.</p>
        <a href="#home" onClick={(e) => { e.preventDefault(); onHome?.(); }} style={{ color: 'inherit', textDecoration: 'underline' }}>
          Back home
        </a>
      </div>
    </main>
  );
}
`,
    'src/pages/Contact.jsx': `/** Invent contact page — ${b} */
import { useState } from 'react';

export default function Contact() {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData(e.currentTarget);
      const body = Object.fromEntries(fd.entries());
      await fetch('http://127.0.0.1:8787/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => null);
      setSent(true);
    } finally {
      setBusy(false);
    }
  }
  if (sent) {
    return (
      <section className="invent-contact" style={{ padding: '48px 24px', maxWidth: 480, margin: '0 auto' }}>
        <h1>Thanks</h1>
        <p>We got your message for ${b}.</p>
      </section>
    );
  }
  return (
    <section className="invent-contact" style={{ padding: '48px 24px', maxWidth: 480, margin: '0 auto' }}>
      <h1>Contact ${b}</h1>
      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Name</span>
          <input name="name" required autoComplete="name" style={{ padding: 10 }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Email</span>
          <input name="email" type="email" required autoComplete="email" style={{ padding: 10 }} />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Message</span>
          <textarea name="message" required rows={4} style={{ padding: 10 }} />
        </label>
        <button type="submit" disabled={busy} style={{ padding: '12px 16px', cursor: 'pointer' }}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
`,
    'src/pages/Blog.jsx': `/** Invent blog index stub — ${b} */
const POSTS = [
  { id: 'welcome', title: 'Welcome to ${b}', excerpt: 'First note from the invent floor.' },
  { id: 'craft', title: 'How we craft', excerpt: 'Brand-first, one composition, real motion.' },
];

export default function Blog() {
  return (
    <section className="invent-blog" style={{ padding: '48px 24px', maxWidth: 720, margin: '0 auto' }}>
      <h1>Journal</h1>
      <ul style={{ listStyle: 'none', padding: 0, marginTop: 24, display: 'grid', gap: 16 }}>
        {POSTS.map((p) => (
          <li key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 16 }}>
            <a href={'#blog/' + p.id} style={{ color: 'inherit', textDecoration: 'none' }}>
              <h2 style={{ fontSize: '1.25rem', margin: 0 }}>{p.title}</h2>
              <p style={{ opacity: 0.75 }}>{p.excerpt}</p>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
`,
    'src/components/LoadingState.jsx': `/** Invent loading state — ${b} */
export default function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="invent-loading" role="status" aria-live="polite" style={{ display: 'grid', placeItems: 'center', minHeight: 160, gap: 12 }}>
      <span className="invent-loading__spin" aria-hidden style={{
        width: 28, height: 28, borderRadius: '50%',
        border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'currentColor',
        animation: 'invent-spin 0.8s linear infinite',
      }} />
      <span style={{ opacity: 0.75, fontSize: 14 }}>{label}</span>
      <style>{\`@keyframes invent-spin { to { transform: rotate(360deg); } }\`}</style>
    </div>
  );
}
`,
    'src/components/EmptyState.jsx': `/** Invent empty state — ${b} */
export default function EmptyState({ title = 'Nothing here yet', body = 'Add your first item to get started.', actionLabel, onAction }) {
  return (
    <div className="invent-empty" style={{ textAlign: 'center', padding: 40, maxWidth: 360, margin: '0 auto' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: 8 }}>{title}</h2>
      <p style={{ opacity: 0.7, marginBottom: 16 }}>{body}</p>
      {actionLabel && onAction ? (
        <button type="button" onClick={onAction} style={{ padding: '10px 16px', cursor: 'pointer' }}>{actionLabel}</button>
      ) : null}
    </div>
  );
}
`,
    '.nova/normal-pages.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      router: 'hash (useHashPage — zero dep)',
      pages: ['home', 'contact', 'blog', '404'],
      note: 'Craft may import pages; App stays craft-owned',
    }, null, 2)}\n`,
  };
}

export function inventNormalHousekeepingFiles(brand: string): Record<string, string> {
  const b = escBrand(brand);
  const s = slug(b);
  const year = new Date().getFullYear();
  return {
    'public/favicon.svg': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="${b}">
  <rect width="64" height="64" rx="14" fill="#0f1419"/>
  <text x="32" y="40" text-anchor="middle" font-family="Georgia, serif" font-size="28" fill="#f4f7fb">${b.slice(0, 1).toUpperCase()}</text>
</svg>
`,
    '.env.example': `# ${b} — copy to .env locally (never commit .env)
VITE_APP_NAME=${b}
VITE_API_URL=http://127.0.0.1:8787
# VITE_STRIPE_PUBLISHABLE_KEY=
# VITE_SUPABASE_URL=
# VITE_SUPABASE_ANON_KEY=
`,
    LICENSE: `MIT License

Copyright (c) ${year} ${b}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,
    'README.md': `# ${b}

Invent project created in Nova.

## Run

\`\`\`bash
npm install
npm run dev
\`\`\`

## API stub (optional)

\`\`\`bash
cd server && npm start
\`\`\`

API listens on \`http://127.0.0.1:8787\`.

## Env

Copy \`.env.example\` → \`.env\` for local secrets. Never commit \`.env\`.

## Pages

Hash routes: \`#home\` · \`#contact\` · \`#blog\` · unknown → 404 component.

## Agent

Scratchpad: \`.nova/scratchpad.md\` · Don't-touch: \`.nova/dont-touch.md\`
`,
    '.nova/scratchpad.md': `# Agent scratchpad — ${b}

Orient notes, open questions, verify evidence. Cleared or condensed between major passes.
`,
    '.nova/share-live.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      mode: 'local-preview-url',
      note: 'Copy Live URL from chat chrome; desktop owns local preview (no public tunnel by default)',
      copyFromUi: true,
    }, null, 2)}\n`,
    '.nova/normal-floor.json': `${JSON.stringify({
      version: 1,
      brand: b,
      slug: s,
      status: 'strong',
      floor: [
        'multi-page-hash',
        '404',
        'contact',
        'blog',
        'favicon',
        'env-example',
        'license',
        'readme',
        'loading-empty',
        'scratchpad',
        'share-live-copy',
        'git-init-on-ready',
      ],
    }, null, 2)}\n`,
  };
}

/** Ensure index.html has favicon link; merge .gitignore .env rules. */
export function stampNormalFloorOntoProject(
  files: Record<string, string>,
  brand: string,
): Record<string, string> {
  const next = { ...files };
  Object.assign(next, inventNormalPagesFiles(brand));
  Object.assign(next, inventNormalHousekeepingFiles(brand));

  const htmlKey = Object.keys(next).find((k) => /(^|\/)index\.html$/i.test(k));
  if (htmlKey) {
    let html = String(next[htmlKey] || '');
    if (!/rel=["']icon["']/i.test(html)) {
      html = html.replace(
        /<head([^>]*)>/i,
        `<head$1>\n  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />`,
      );
      next[htmlKey] = html;
    }
  }

  const gi = String(next['.gitignore'] || '');
  if (gi && !/(^|\n)\.env\b/m.test(gi)) {
    next['.gitignore'] = `${gi.trimEnd()}\n.env\n.env.*\n!.env.example\n`;
  } else if (!gi) {
    next['.gitignore'] = `.DS_Store\nThumbs.db\n*.log\n.env\n.env.*\n!.env.example\nnode_modules/\ndist/\n`;
  }

  if (!next['README.md']?.trim()) {
    Object.assign(next, { 'README.md': inventNormalHousekeepingFiles(brand)['README.md'] });
  }

  return next;
}

/** Stronger fullstack: health + leads + session auth stub. */
export function inventNormalAuthDbFiles(brand: string): Record<string, string> {
  const b = escBrand(brand);
  return {
    'server/auth.js': `/** Invent auth stub — ${b} — local session only */
import crypto from 'node:crypto';
const sessions = new Map();
export function issueSession(user) {
  const id = crypto.randomBytes(16).toString('hex');
  sessions.set(id, { user, at: Date.now() });
  return id;
}
export function readSession(id) {
  return sessions.get(String(id || '')) || null;
}
export function clearSession(id) {
  sessions.delete(String(id || ''));
}
`,
    '.nova/auth-db-scaffold.json': `${JSON.stringify({
      version: 1,
      brand: b,
      status: 'strong',
      auth: 'server/auth.js session stub',
      db: 'server/db.json',
      api: 'server/index.js',
      note: 'Normal invent auth+db scaffold — expand with real provider keys via .env',
    }, null, 2)}\n`,
  };
}

export function attachNormalFloorPackFiles(
  files: Record<string, string>,
  opts: { brand: string },
): Record<string, string> {
  let next = stampNormalFloorOntoProject(files, opts.brand);
  Object.assign(next, inventNormalAuthDbFiles(opts.brand));
  return next;
}
