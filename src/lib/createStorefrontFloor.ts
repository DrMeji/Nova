/**
 * High-quality storefront recovery floor — rich catalog + filters + cart + checkout.
 * Used when craft is thin; also the acceptance shape for storefront genre.
 */
import type { CreatePalette } from '@/lib/createIdentity';
import type { StorefrontProduct } from '@/lib/createLayoutContract';

export type StorefrontFloorFiles = {
  app: string;
  css: string;
  files: Record<string, string>;
};

export function liquorCatalog(): StorefrontProduct[] {
  return [
    { id: 'amber-reserve', name: 'Amber Reserve Bourbon', type: 'Bourbon', origin: 'Kentucky, USA', age: '8 Year', abv: '45%', notes: 'Charred oak, caramel, dried cherry, long finish.', price: 68 },
    { id: 'north-rye', name: 'North Rye', type: 'Rye', origin: 'Alberta, Canada', age: '6 Year', abv: '46%', notes: 'Baking spice, black pepper, clean rye snap.', price: 54 },
    { id: 'casa-humo', name: 'Casa Humo Mezcal', type: 'Mezcal', origin: 'Oaxaca, Mexico', age: 'Joven', abv: '47%', notes: 'Agave smoke, citrus peel, mineral finish.', price: 72 },
    { id: 'harbor-gin', name: 'Harbor Citrus Gin', type: 'Gin', origin: 'Cornwall, UK', age: 'NAS', abv: '43%', notes: 'Juniper, grapefruit, sea salt, soft florals.', price: 42 },
    { id: 'nightport-rum', name: 'Nightport Rum', type: 'Rum', origin: 'Barbados', age: '5 Year', abv: '40%', notes: 'Molasses depth, vanilla oak, brown sugar.', price: 48 },
    { id: 'crystal-vodka', name: 'Crystal Still Vodka', type: 'Vodka', origin: 'Poland', age: 'NAS', abv: '40%', notes: 'Clean cut, soft wheat, ice-cold finish.', price: 36 },
    { id: 'smoked-scotch', name: 'Glen Ember Single Malt', type: 'Scotch', origin: 'Islay, Scotland', age: '10 Year', abv: '46%', notes: 'Peat smoke, brine, lemon oil, iodine.', price: 86 },
    { id: 'agave-blanco', name: 'Sierra Blanco Tequila', type: 'Tequila', origin: 'Jalisco, Mexico', age: 'Blanco', abv: '40%', notes: 'Cooked agave, pepper, bright citrus.', price: 44 },
    { id: 'maple-bourbon', name: 'Sugarloaf Bourbon', type: 'Bourbon', origin: 'Vermont, USA', age: '4 Year', abv: '43%', notes: 'Maple, toasted oak, soft vanilla.', price: 58 },
    { id: 'tokyo-whisky', name: 'Kiso Grain Whisky', type: 'Whisky', origin: 'Nagano, Japan', age: 'NAS', abv: '43%', notes: 'Pear, sandalwood, gentle spice.', price: 79 },
  ];
}

export function genericCatalog(title: string): StorefrontProduct[] {
  return [
    { id: 'core', name: `${title} Core`, type: 'Signature', origin: 'House', notes: 'Everyday pick with a clean profile.', price: 48 },
    { id: 'plus', name: `${title} Plus`, type: 'Premium', origin: 'House', notes: 'Richer finish, limited run.', price: 64 },
    { id: 'reserve', name: `${title} Reserve`, type: 'Reserve', origin: 'Cellar', age: 'Aged', notes: 'Deep character for special nights.', price: 88 },
    { id: 'gift', name: `${title} Gift Set`, type: 'Gift', origin: 'House', notes: 'Ready to wrap — three tasting pours.', price: 96 },
    { id: 'travel', name: `${title} Travel`, type: 'Travel', origin: 'House', notes: 'Compact bottle for the road.', price: 32 },
    { id: 'cask', name: `${title} Cask Strength`, type: 'Reserve', origin: 'Cellar', age: 'Cask', notes: 'Bold proof, oak-forward.', price: 110 },
    { id: 'seasonal', name: `${title} Seasonal`, type: 'Limited', origin: 'House', notes: 'Rotating batch — ask what’s open.', price: 52 },
    { id: 'library', name: `${title} Library`, type: 'Collection', origin: 'Archive', notes: 'Small allocation from the library shelf.', price: 124 },
  ];
}

/** Deterministic high-quality storefront floor (last-resort + acceptance shape). */
export function buildStorefrontCommerceFloor(
  title: string,
  brief: string,
  p: CreatePalette,
): StorefrontFloorFiles {
  const liquor = /\b(?:liquor|spirits?|whiskey|whisky|vodka|gin|tequila|bourbon|rum|bottle\s+shop|scotch)\b/i.test(brief);
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
  const hero = `/heroes/${slug}-hero.jpg`;
  const products = liquor ? liquorCatalog() : genericCatalog(title);
  const productsTs = `export type Product = {
  id: string;
  name: string;
  type: string;
  origin?: string;
  age?: string;
  abv?: string;
  notes: string;
  price: number;
  image?: string;
};

export const PRODUCTS: Product[] = ${JSON.stringify(products, null, 2)};

export const PRODUCT_TYPES = ['All', ...Array.from(new Set(PRODUCTS.map((p) => p.type)))];
`;

  const app = `import { useMemo, useState } from 'react';
import './App.css';
import { PRODUCTS, PRODUCT_TYPES } from './data/products';

const HERO = '${hero}';

export default function App() {
  const [filter, setFilter] = useState('All');
  const [detailId, setDetailId] = useState(null);
  const [cart, setCart] = useState([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [placed, setPlaced] = useState('');

  const visible = useMemo(
    () => (filter === 'All' ? PRODUCTS : PRODUCTS.filter((p) => p.type === filter)),
    [filter],
  );
  const detail = detailId ? PRODUCTS.find((p) => p.id === detailId) : null;
  const count = cart.reduce((n, line) => n + line.qty, 0);
  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.price * line.qty, 0),
    [cart],
  );

  const add = (product, qty = 1) => {
    setCart((prev) => {
      const hit = prev.find((line) => line.id === product.id);
      if (hit) {
        return prev.map((line) => (line.id === product.id ? { ...line, qty: line.qty + qty } : line));
      }
      return [...prev, { ...product, qty }];
    });
    setOpen(true);
  };

  const setQty = (id, qty) => {
    setCart((prev) => prev
      .map((line) => (line.id === id ? { ...line, qty } : line))
      .filter((line) => line.qty > 0));
  };

  const remove = (id) => setCart((prev) => prev.filter((line) => line.id !== id));

  return (
    <div className="site">
      <header className="topnav" role="banner">
        <nav className="topnav-inner" aria-label="Primary">
          <a className="mark" href="#top" onClick={() => setDetailId(null)}>${title}</a>
          <a href="#shop" onClick={() => setDetailId(null)}>Shop</a>
          <a href="#story">Story</a>
          <button type="button" className="cart-btn" onClick={() => setOpen(true)} aria-label="Open cart">
            Cart ({count})
          </button>
        </nav>
      </header>

      {!detail ? (
        <>
          <section className="hero full-bleed" id="top">
            <img className="hero-photo" src={HERO} alt="${title} hero" />
            <div className="hero-copy">
              <p className="eyebrow">${liquor ? 'Specialty bottle shop' : 'Online store'}</p>
              <h1>${liquor ? 'Spirits with a story.' : `${title}.`}</h1>
              <p className="sub">${liquor
                ? 'Browse by type, read origin and tasting notes, add quantities to cart, and check out in one flow.'
                : 'Browse the catalog, filter by type, add quantities, and complete a demo purchase.'}</p>
              <div className="cta-row">
                <a className="pill pill-primary" href="#shop">Browse bottles</a>
                <button type="button" className="pill pill-ghost" onClick={() => setOpen(true)}>View cart</button>
              </div>
            </div>
          </section>

          <section className="band shop" id="shop">
            <div className="band-copy">
              <h2>Shop</h2>
              <p>Filter the catalog, open a bottle for details, then add what you want.</p>
            </div>
            <div className="filter-bar" role="toolbar" aria-label="Filter by type">
              {PRODUCT_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={filter === type ? 'chip chip-on' : 'chip'}
                  onClick={() => setFilter(type)}
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="product-grid">
              {visible.map((product) => (
                <article className="product-card" key={product.id}>
                  <button type="button" className="product-media" onClick={() => setDetailId(product.id)} aria-label={\`Open \${product.name}\`} />
                  <p className="meta">{product.type}{product.origin ? \` · \${product.origin}\` : ''}</p>
                  <h3>
                    <button type="button" className="linkish" onClick={() => setDetailId(product.id)}>{product.name}</button>
                  </h3>
                  <p className="notes">{product.notes}</p>
                  <p className="attrs">
                    {product.age ? <span>{product.age}</span> : null}
                    {product.abv ? <span>{product.abv} ABV</span> : null}
                  </p>
                  <p className="price">\${product.price}</p>
                  <button type="button" className="add-to-cart" onClick={() => add(product)}>Add to cart</button>
                </article>
              ))}
            </div>
          </section>

          <section className="band story" id="story">
            <div className="band-copy">
              <h2>Origin & craft</h2>
              <p>${liquor
                ? 'Every bottle lists where it was made, how long it rested, and how it tastes — so you can explore before you buy.'
                : `A specialty storefront for ${title}: clear product data, filters, cart, and checkout.`}</p>
            </div>
          </section>
        </>
      ) : (
        <section className="detail" id="detail">
          <button type="button" className="ghost back" onClick={() => setDetailId(null)}>← Back to shop</button>
          <div className="detail-card">
            <div className="detail-media" aria-hidden="true" />
            <div className="detail-copy">
              <p className="meta">{detail.type}{detail.origin ? \` · \${detail.origin}\` : ''}</p>
              <h1>{detail.name}</h1>
              <p className="notes">{detail.notes}</p>
              <p className="attrs">
                {detail.age ? <span>Age · {detail.age}</span> : null}
                {detail.abv ? <span>ABV · {detail.abv}</span> : null}
                <span>\${detail.price}</span>
              </p>
              <button type="button" className="add-to-cart" onClick={() => add(detail)}>Add to cart</button>
            </div>
          </div>
        </section>
      )}

      {open ? (
        <div className="cart-drawer" role="dialog" aria-label="Cart">
          <div className="cart-panel">
            <div className="cart-head">
              <h2>Your cart</h2>
              <button type="button" className="ghost" onClick={() => setOpen(false)}>Close</button>
            </div>
            {cart.length === 0 ? (
              <p className="dim">Cart is empty — add something from Shop.</p>
            ) : (
              <ul className="cart-lines">
                {cart.map((line) => (
                  <li key={line.id}>
                    <div>
                      <strong>{line.name}</strong>
                      <span>\${line.price} · {line.type}</span>
                    </div>
                    <div className="qty">
                      <button type="button" onClick={() => setQty(line.id, line.qty - 1)} aria-label="Decrease">-</button>
                      <span>{line.qty}</span>
                      <button type="button" onClick={() => setQty(line.id, line.qty + 1)} aria-label="Increase">+</button>
                      <button type="button" className="ghost" onClick={() => remove(line.id)}>Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="total">Total · \${total.toFixed(2)}</p>
            <form
              className="checkout"
              onSubmit={(e) => {
                e.preventDefault();
                if (!cart.length) return;
                setPlaced(\`Order placed for \${name.trim() || 'guest'} · \${count} item\${count === 1 ? '' : 's'} · \$\${total.toFixed(2)}. Confirmation sent to \${email.trim() || 'you'}.\`);
                setCart([]);
              }}
            >
              <label>
                Name
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
              </label>
              <label>
                Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email" />
              </label>
              <button type="submit" className="purchase" disabled={!cart.length}>Purchase</button>
            </form>
            {placed ? <p className="confirm" role="status">{placed}</p> : null}
            <p className="fine">Demo checkout — no real payment processed.</p>
          </div>
        </div>
      ) : null}

      <footer className="foot">
        <a href="#top">${title}</a>
        <a href="#shop">Shop</a>
        <span>${liquor ? '21+ only · ' : ''}Demo store</span>
      </footer>
    </div>
  );
}
`;

  const css = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;700&family=Source+Sans+3:wght@400;600;700&display=swap');
:root {
  --bg: ${liquor ? '#120c0a' : p.bg};
  --ink: ${liquor ? '#f4ebe2' : p.text};
  --mute: ${liquor ? '#b7a597' : p.muted};
  --accent: ${liquor ? '#c9853a' : p.accent};
  --panel: ${liquor ? '#1d1410' : p.panel};
  --line: rgba(244, 235, 226, 0.14);
  --display: Fraunces, Georgia, serif;
  --body: "Source Sans 3", system-ui, sans-serif;
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; min-height: 100%; background: var(--bg); color: var(--ink); }
body { font-family: var(--body); }
h1, h2, h3, .mark { font-family: var(--display); letter-spacing: -0.02em; }
.site { width: 100%; min-height: 100vh; }
@keyframes rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
.hero, .band, .detail, .product-card { animation: rise 0.65s ease both; }
.topnav { position: sticky; top: 0; z-index: 40; background: color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter: blur(16px); border-bottom: 1px solid var(--line); }
.topnav-inner { max-width: 1120px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; padding: 0.95rem 1.1rem; }
.topnav a { color: var(--ink); text-decoration: none; font-size: 0.95rem; }
.mark { font-weight: 700; margin-right: auto; font-size: 1.15rem; }
.cart-btn, .pill, .add-to-cart, .purchase, .qty button, .ghost, .chip, .linkish, .product-media, .back {
  appearance: none; border: 0; cursor: pointer; font: inherit; background: none; color: inherit;
}
.cart-btn { margin-left: auto; background: var(--accent); color: #1a100c; font-weight: 700; border-radius: 999px; padding: 0.5rem 1rem; }
.hero { min-height: 72vh; display: grid; place-items: center; text-align: center; padding: 4.5rem 1.25rem 3rem; position: relative; overflow: hidden; }
.hero-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.38; }
.hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--bg) 20%, transparent), var(--bg)); }
.hero-copy { position: relative; z-index: 1; max-width: 42rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent); font-size: 0.76rem; margin: 0; }
.hero h1 { margin: 0.45rem 0 0; font-size: clamp(2.4rem, 6.2vw, 4rem); }
.sub { margin: 0.9rem auto 0; max-width: 36rem; color: var(--mute); font-size: 1.12rem; line-height: 1.55; }
.cta-row { display: flex; gap: 0.8rem; justify-content: center; flex-wrap: wrap; margin-top: 1.4rem; }
.pill { display: inline-flex; align-items: center; justify-content: center; padding: 0.65rem 1.2rem; border-radius: 999px; text-decoration: none; }
.pill-primary { background: var(--accent); color: #1a100c; font-weight: 700; }
.pill-ghost { border: 1px solid var(--accent); color: var(--accent); }
.band { padding: 3.75rem 1.25rem; }
.band-copy { text-align: center; max-width: 40rem; margin: 0 auto 1.75rem; }
.band h2 { margin: 0; font-size: clamp(1.85rem, 4vw, 2.7rem); }
.band-copy p { color: var(--mute); }
.filter-bar { max-width: 1120px; margin: 0 auto 1.5rem; display: flex; flex-wrap: wrap; gap: 0.55rem; justify-content: center; }
.chip { border: 1px solid var(--line); color: var(--mute); border-radius: 999px; padding: 0.4rem 0.85rem; font-size: 0.88rem; }
.chip-on { background: var(--accent); color: #1a100c; border-color: var(--accent); font-weight: 700; }
.product-grid { max-width: 1120px; margin: 0 auto; display: grid; gap: 1.1rem; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.product-card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 1rem; display: flex; flex-direction: column; gap: 0.4rem; text-align: left; transition: transform 0.2s ease, border-color 0.2s ease; }
.product-card:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.product-media { height: 150px; border-radius: 14px; background:
  radial-gradient(130px 90px at 30% 28%, color-mix(in srgb, var(--accent) 50%, transparent), transparent),
  linear-gradient(155deg, #2c1b14, #100b09); }
.linkish { text-align: left; font-weight: 700; font-size: 1.08rem; color: var(--ink); }
.meta, .notes, .attrs, .dim, .fine, .total { color: var(--mute); font-size: 0.9rem; }
.notes { line-height: 1.45; min-height: 2.6em; }
.attrs { display: flex; flex-wrap: wrap; gap: 0.55rem; }
.attrs span { border: 1px solid var(--line); border-radius: 999px; padding: 0.15rem 0.55rem; font-size: 0.78rem; }
.price { color: var(--ink) !important; font-weight: 700; font-size: 1.05rem; margin: 0.15rem 0 0; }
.add-to-cart, .purchase { background: var(--accent); color: #1a100c; font-weight: 700; border-radius: 11px; padding: 0.72rem 1rem; margin-top: auto; }
.story { background: color-mix(in srgb, var(--panel) 78%, #000); }
.detail { max-width: 960px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
.back { color: var(--mute); margin-bottom: 1rem; }
.detail-card { display: grid; gap: 1.5rem; grid-template-columns: 1.1fr 1fr; background: var(--panel); border: 1px solid var(--line); border-radius: 22px; padding: 1.25rem; }
.detail-media { min-height: 280px; border-radius: 16px; background:
  radial-gradient(180px 120px at 35% 30%, color-mix(in srgb, var(--accent) 55%, transparent), transparent),
  linear-gradient(160deg, #322018, #120c0a); }
.detail-copy h1 { margin: 0.25rem 0 0.75rem; font-size: clamp(1.8rem, 4vw, 2.6rem); }
.cart-drawer { position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 50; display: grid; justify-items: end; }
.cart-panel { width: min(440px, 100%); height: 100%; background: var(--panel); border-left: 1px solid var(--line); padding: 1.25rem; overflow: auto; display: flex; flex-direction: column; gap: 0.85rem; }
.cart-head { display: flex; justify-content: space-between; align-items: center; }
.cart-head h2 { margin: 0; }
.ghost { color: var(--mute); }
.cart-lines { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.85rem; }
.cart-lines li { display: flex; justify-content: space-between; gap: 0.75rem; border-bottom: 1px solid var(--line); padding-bottom: 0.85rem; }
.cart-lines strong { display: block; }
.qty { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; }
.qty button { min-width: 28px; height: 28px; border-radius: 8px; background: #2a1b15; color: var(--ink); padding: 0 0.45rem; }
.checkout { display: flex; flex-direction: column; gap: 0.7rem; }
.checkout label { display: flex; flex-direction: column; gap: 0.3rem; color: var(--mute); font-size: 0.9rem; }
.checkout input { background: #18100d; border: 1px solid var(--line); color: var(--ink); border-radius: 10px; padding: 0.65rem 0.8rem; }
.confirm { color: var(--accent); font-weight: 600; }
.foot { display: flex; flex-wrap: wrap; gap: 1.2rem; justify-content: center; padding: 2.5rem 1rem 3rem; color: var(--mute); font-size: 0.85rem; }
.foot a { color: var(--mute); text-decoration: none; }
@media (max-width: 800px) {
  .detail-card { grid-template-columns: 1fr; }
  .mark { margin-right: 0; }
  .cart-btn { margin-left: 0; }
}
`;

  return {
    app,
    css,
    files: {
      'src/App.tsx': app,
      'src/App.css': css,
      'src/data/products.ts': productsTs,
    },
  };
}
