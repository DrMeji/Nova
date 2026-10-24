/**
 * High-quality storefront recovery floor — rich catalog + filters + cart + checkout.
 * LAST RESORT only after invent/tool-loop miss — never the create happy path / Ready proof.
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

/** Tea / matcha / tisane — never spirits copy. */
export function teaCatalog(title: string): StorefrontProduct[] {
  const brand = title.replace(/\s+/g, ' ').trim() || 'House';
  return [
    { id: 'tin-40', name: `${brand} Tin 40g`, type: 'Tin', notes: 'Whole-leaf tin for daily steeping.', price: 28 },
    { id: 'tin-100', name: `${brand} Tin 100g`, type: 'Tin', notes: 'Larger tin — same lot, fresher longer.', price: 58 },
    { id: 'pouch-10', name: `${brand} Pouch 10g`, type: 'Pouch', notes: 'Travel pouch for one week of cups.', price: 12 },
    { id: 'sampler', name: `${brand} Sampler`, type: 'Gift', notes: 'Three small tins to taste the range.', price: 36 },
    { id: 'ceremony', name: `${brand} Ceremony Set`, type: 'Gift', notes: 'Tin + steep guide card + strainer.', price: 64 },
    { id: 'seasonal', name: `${brand} Seasonal Flush`, type: 'Limited', notes: 'Single-harvest limited flush.', price: 42 },
    { id: 'loose-refill', name: `${brand} Loose Refill`, type: 'Loose', notes: 'Refill bag for the house tin.', price: 22 },
    { id: 'gift-box', name: `${brand} Gift Box`, type: 'Gift', notes: 'Wrapped box with steep notes.', price: 48 },
  ];
}

/** Coffee / roast — bean bags, not bottles. */
export function coffeeCatalog(title: string): StorefrontProduct[] {
  const brand = title.replace(/\s+/g, ' ').trim() || 'House';
  return [
    { id: 'bag-12', name: `${brand} 12oz Bag`, type: 'Bag', notes: 'Whole bean, roasted weekly.', price: 18 },
    { id: 'bag-2lb', name: `${brand} 2lb Bag`, type: 'Bag', notes: 'Larger bag for daily brew.', price: 42 },
    { id: 'espresso', name: `${brand} Espresso`, type: 'Espresso', notes: 'Darker roast for milk drinks.', price: 20 },
    { id: 'filter', name: `${brand} Filter Roast`, type: 'Filter', notes: 'Bright cup for pour-over.', price: 19 },
    { id: 'sampler', name: `${brand} Sampler`, type: 'Gift', notes: 'Three 4oz bags to compare.', price: 28 },
    { id: 'decaf', name: `${brand} Decaf`, type: 'Decaf', notes: 'Swiss-water style evening cup.', price: 18 },
    { id: 'cold-brew', name: `${brand} Cold Brew Kit`, type: 'Kit', notes: 'Coarse grind + brew pouch.', price: 24 },
    { id: 'gift', name: `${brand} Gift Set`, type: 'Gift', notes: 'Bag + dripper notes card.', price: 46 },
  ];
}

/** Generic goods — no liquor metaphors (pours, proof, cask, bottle). */
export function genericCatalog(title: string): StorefrontProduct[] {
  const brand = title.replace(/\s+/g, ' ').trim() || 'House';
  return [
    { id: 'core', name: `${brand} Essentials`, type: 'Signature', notes: 'Everyday pick with a clean finish.', price: 48 },
    { id: 'plus', name: `${brand} Plus`, type: 'Premium', notes: 'Richer finish, limited run.', price: 64 },
    { id: 'reserve', name: `${brand} Reserve`, type: 'Reserve', notes: 'Small batch for special occasions.', price: 88 },
    { id: 'gift', name: `${brand} Gift Set`, type: 'Gift', notes: 'Ready to wrap — three sample sizes.', price: 96 },
    { id: 'travel', name: `${brand} Travel Pack`, type: 'Travel', notes: 'Compact pack for the road.', price: 32 },
    { id: 'studio', name: `${brand} Studio`, type: 'Premium', notes: 'Workshop-grade daily driver.', price: 72 },
    { id: 'seasonal', name: `${brand} Seasonal`, type: 'Limited', notes: 'Rotating batch — ask what’s open.', price: 52 },
    { id: 'collection', name: `${brand} Collection`, type: 'Collection', notes: 'Curated set from the latest drop.', price: 124 },
  ];
}

/** Insulated water bottles — 9 SKUs, distinct colors/prices (not spirits). */
export function insulatedBottleCatalog(title: string): StorefrontProduct[] {
  const brand = title.replace(/\s+/g, ' ').trim() || 'Peak';
  return [
    { id: 'trail-26', name: `${brand} Trail 26 oz`, type: '26 oz', color: '#6b2d3c', notes: 'Double-wall vacuum with color-matched flip chug cap.', price: 40 },
    { id: 'summit-36', name: `${brand} Summit 36 oz`, type: '36 oz', color: '#f4f1ea', notes: 'Wide-mouth day bottle for long hikes and desk refills.', price: 50 },
    { id: 'ridge-18', name: `${brand} Ridge 18 oz`, type: '18 oz', color: '#e11d8f', notes: 'Compact carry with durable UV ink banding.', price: 32 },
    { id: 'alpine-26', name: `${brand} Alpine 26 oz`, type: '26 oz', color: '#0f766e', notes: 'Ice-holding trail bottle with leak-proof straw lid.', price: 42 },
    { id: 'dusk-30', name: `${brand} Dusk 30 oz`, type: '30 oz', color: '#4c1d95', notes: 'Matte finish, soft-grip sleeve, all-day cold.', price: 46 },
    { id: 'canyon-22', name: `${brand} Canyon 22 oz`, type: '22 oz', color: '#c2410c', notes: 'Slim pack-fit bottle with magnetic lid park.', price: 36 },
    { id: 'frost-18', name: `${brand} Frost 18 oz`, type: '18 oz', color: '#0369a1', notes: 'Kids-friendly size with bite-valve straw.', price: 28 },
    { id: 'ember-26', name: `${brand} Ember 26 oz`, type: '26 oz', color: '#b45309', notes: 'Hot-or-cold vacuum flask with pour spout.', price: 44 },
    { id: 'mist-40', name: `${brand} Mist 40 oz`, type: '40 oz', color: '#64748b', notes: 'Big-day jug with carry handle and wide mouth.', price: 54 },
  ];
}

export function briefLooksLikeInsulatedBottleShop(title: string, brief: string): boolean {
  // Scrub negations first — "not liquor / not wine" must not demote a water-bottle shop.
  const t = `${brief}\n${title}`
    .replace(/\b(?:not|never|no|without|avoid)\s+(?:a\s+|an\s+)?(?:liquor|spirits?|whiskey|whisky|vodka|gin|tequila|bourbon|rum|scotch|wine)\b/gi, ' ')
    .replace(/\b(?:liquor|spirits?|whiskey|whisky|vodka|gin|tequila|bourbon|rum|scotch|wine)\s*-?\s*free\b/gi, ' ');
  if (/\b(?:liquor|spirits?|whiskey|whisky|vodka|gin|tequila|bourbon|rum|scotch|wine)\b/i.test(t)) {
    return false;
  }
  return /\b(?:insulated|water\s+bottle|tumbler|hydration|flask|rambler|oz\s+bottle|bottle\s+brand|bottle\s+shop)\b/i.test(t)
    || (/\bbottles?\b/i.test(t) && /\b(?:cart|checkout|e-?commerce|storefront|add\s+to\s+cart)\b/i.test(t));
}

export function briefLooksLikeLiquorShop(title: string, brief: string): boolean {
  const t = `${brief}\n${title}`;
  if (briefLooksLikeInsulatedBottleShop(title, brief)) return false;
  return /\b(?:liquor|spirits?|whiskey|whisky|vodka|gin|tequila|bourbon|rum|scotch|wine)\b/i.test(t)
    || (/\bbottle\s+shop\b/i.test(t) && /\b(?:liquor|spirits?|whiskey|wine|bourbon)\b/i.test(t));
}

/** Pick catalog by brief category — tea never gets whiskey fields. */
export function catalogForStorefrontBrief(title: string, brief: string): StorefrontProduct[] {
  const t = `${brief}\n${title}`;
  if (briefLooksLikeInsulatedBottleShop(title, brief)) {
    return insulatedBottleCatalog(title);
  }
  if (briefLooksLikeLiquorShop(title, brief)) {
    return liquorCatalog();
  }
  if (/\b(?:matcha|tea|jasmine|oolong|sencha|tisane|steep)\b/i.test(t)) {
    return teaCatalog(title);
  }
  if (/\b(?:coffee|espresso|roast|pour[- ]?over|cold\s+brew|barista)\b/i.test(t)) {
    return coffeeCatalog(title);
  }
  return genericCatalog(title);
}

/** Deterministic high-quality storefront floor (last-resort + acceptance shape). */
export function buildStorefrontCommerceFloor(
  title: string,
  brief: string,
  p: CreatePalette,
): StorefrontFloorFiles {
  const bottles = briefLooksLikeInsulatedBottleShop(title, brief);
  const liquor = !bottles && briefLooksLikeLiquorShop(title, brief);
  const tea = !liquor && !bottles && /\b(?:matcha|tea|jasmine|oolong|sencha|tisane|steep)\b/i.test(`${brief}\n${title}`);
  const coffee = !liquor && !bottles && !tea && /\b(?:coffee|espresso|roast|pour[- ]?over|cold\s+brew|barista)\b/i.test(`${brief}\n${title}`);
  const supportEmail = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 18) || 'hello'}@support.example`;
  const shopCta = bottles ? 'Shop bottles' : liquor ? 'Browse bottles' : tea ? 'Browse tins' : coffee ? 'Browse bags' : 'Browse catalog';
  const shopDetail = bottles
    ? 'Nine insulated bottles — each with its own color, size, and price. Add any to cart.'
    : liquor
      ? 'Filter the catalog, open a bottle for details, then add what you want.'
      : tea
        ? 'Filter by type, open a tin for details, then add what you want.'
        : coffee
          ? 'Filter by roast, open a bag for details, then add what you want.'
          : 'Filter the catalog, open an item for details, then add what you want.';
  const eyebrow = bottles ? 'Insulated bottle shop' : liquor ? 'Specialty bottle shop' : tea ? 'Small-batch tea' : coffee ? 'Fresh roast' : 'Online store';
  const heroLine = bottles ? `${title} bottles.` : liquor ? 'Spirits with a story.' : `${title}.`;
  const heroSub = bottles
    ? 'Welcoming cream storefront: browse nine bottles, add to cart, and check out — plus About, Careers, and Help.'
    : liquor
      ? 'Browse by type, read origin and tasting notes, add quantities to cart, and check out in one flow.'
      : tea
        ? 'Browse tins and pouches, read steep notes, add quantities, and complete a demo purchase.'
        : coffee
          ? 'Browse bags and kits, read roast notes, add quantities, and complete a demo purchase.'
          : 'Browse the catalog, filter by type, add quantities, and complete a demo purchase.';
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'shop';
  // Compose owns an SVG hero so Live never depends on photo fetch for Accept.
  const hero = `/heroes/${slug}-hero.svg`;
  const products = catalogForStorefrontBrief(title, brief);
  const productsTs = `export type Product = {
  id: string;
  name: string;
  type: string;
  origin?: string;
  age?: string;
  abv?: string;
  color?: string;
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
          <a href="#shop" onClick={() => setDetailId(null)}>Products</a>
          <a href="#applications">Applications</a>
          <a href="#partners">Partners</a>
          <a href="#help">Support</a>
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
              <p className="eyebrow">${eyebrow}</p>
              <h1>${heroLine}</h1>
              <p className="sub">${heroSub}</p>
              <div className="cta-row">
                <a className="pill pill-primary" href="#shop">${shopCta}</a>
                <button type="button" className="pill pill-ghost" onClick={() => setOpen(true)}>View cart</button>
              </div>
            </div>
          </section>

          <section className="band shop" id="shop">
            <div className="band-copy">
              <h2>Shop</h2>
              <p>${shopDetail}</p>
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
                  <button
                    type="button"
                    className="product-media"
                    style={product.color ? { background: \`linear-gradient(160deg, \${product.color}, color-mix(in srgb, \${product.color} 55%, #111))\` } : undefined}
                    onClick={() => setDetailId(product.id)}
                    aria-label={\`Open \${product.name}\`}
                  />
                  {product.color ? <span className="swatch" style={{ background: product.color }} aria-label="Color" /> : null}
                  <p className="meta">{product.type}{product.origin ? \` · \${product.origin}\` : ''}</p>
                  <h3>
                    <button type="button" className="linkish" onClick={() => setDetailId(product.id)}>{product.name}</button>
                  </h3>
                  <p className="notes">{product.notes}</p>
                  <p className="attrs">
                    {product.age ? <span>{product.age}</span> : null}
                    {product.abv ? <span>{product.abv} ABV</span> : null}
                  </p>
                  <p className="price">\${product.price.toFixed(2)}</p>
                  <button type="button" className="add-to-cart" onClick={() => add(product)}>Add to cart</button>
                </article>
              ))}
            </div>
          </section>

          <section className="band story" id="about">
            <div className="band-copy">
              <h2>About ${title}</h2>
              <p>${bottles
                ? `${title} builds insulated bottles for trails, desks, and everyday carry — vacuum walls, bold colors, and lids that match the bottle.`
                : liquor
                  ? 'Every bottle lists where it was made, how long it rested, and how it tastes — so you can explore before you buy.'
                  : `A specialty storefront for ${title}: clear product data, filters, cart, and checkout.`}</p>
            </div>
          </section>

          <section className="band story" id="applications">
            <div className="band-copy">
              <h2>Applications</h2>
              <p>Use ${title} products across creative, work, and everyday builds — clear specs so you pick with confidence.</p>
            </div>
          </section>

          <section className="band story" id="partners">
            <div className="band-copy">
              <h2>Partners</h2>
              <p>Retail, studio, and channel partners who stock ${title}. Want to carry the line? Email partners@${slug}.example.</p>
            </div>
          </section>

          <section className="band story" id="help">
            <div className="band-copy">
              <h2>Support</h2>
              <p>Shipping, returns, and product help — write <a href="mailto:${supportEmail}">${supportEmail}</a> and we will get back within one business day.</p>
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
                setPlaced(\`Order placed for \${name.trim() || 'guest'} · \${count} item\${count === 1 ? '' : 's'} · $\${total.toFixed(2)}. Confirmation sent to \${email.trim() || 'you'}.\`);
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

      <footer className="foot marketplace-foot" role="contentinfo">
        <div className="foot-cols">
          <div>
            <h3>Products</h3>
            <a href="#shop">Shop</a>
            <a href="#shop">Catalog</a>
            <a href="#about">About</a>
          </div>
          <div>
            <h3>Applications</h3>
            <a href="#applications">Use cases</a>
            <a href="#applications">Tools</a>
          </div>
          <div>
            <h3>Partners</h3>
            <a href="#partners">Partner network</a>
            <a href="#partners">Retail</a>
          </div>
          <div>
            <h3>Support</h3>
            <a href="#help">Help center</a>
            <a href="mailto:${supportEmail}">Contact</a>
          </div>
        </div>
        <div className="foot-engage">
          <div className="foot-news">
            <span>Sign up for ${title} news</span>
            <button type="button" className="subscribe">Subscribe</button>
          </div>
          <div className="foot-social" aria-label="Social">
            <span>Follow ${title}</span>
            <a href="https://facebook.com" rel="noreferrer" target="_blank">Facebook</a>
            <a href="https://instagram.com" rel="noreferrer" target="_blank">Instagram</a>
            <a href="https://linkedin.com" rel="noreferrer" target="_blank">LinkedIn</a>
            <a href="https://x.com" rel="noreferrer" target="_blank">X</a>
            <a href="https://youtube.com" rel="noreferrer" target="_blank">YouTube</a>
          </div>
        </div>
        <div className="foot-legal">
          <a href="#top">${title}</a>
          <a href="#privacy">Privacy Policy</a>
          <a href="#privacy">Your Privacy Choices</a>
          <a href="#terms">Terms of Service</a>
          <a href="#accessibility">Accessibility</a>
          <a href="#policies">Corporate Policies</a>
          <a href="#security">Product Security</a>
          <a href="mailto:${supportEmail}">Contact</a>
          <span>Copyright © {new Date().getFullYear()} ${title}</span>
        </div>
      </footer>
    </div>
  );
}
`;

  // Surface tokens — bottles = welcoming ivory; liquor keeps whiskey browns; tea/coffee/goods use palette.
  const mediaA = bottles ? '#e7e0d4' : liquor ? '#2c1b14' : (tea ? '#1a2e24' : coffee ? '#2a2118' : p.panel);
  const mediaB = bottles ? '#d6cec0' : liquor ? '#100b09' : (tea ? '#0c1612' : coffee ? '#14100c' : p.bg);
  const detailA = bottles ? '#efe8dc' : liquor ? '#322018' : (tea ? '#243d32' : coffee ? '#3a2e22' : p.panel);
  const detailB = bottles ? '#ddd4c4' : liquor ? '#120c0a' : (tea ? '#0e1a15' : coffee ? '#16110c' : p.bg);
  const qtyBg = bottles ? '#efe8dc' : liquor ? '#2a1b15' : (tea ? '#1e332a' : coffee ? '#2c241c' : p.panel);
  const inputBg = bottles ? '#fffef9' : liquor ? '#18100d' : (tea ? '#121f1a' : coffee ? '#1a1510' : p.bg);
  const btnInk = bottles ? '#fffef9' : liquor ? '#1a100c' : (p.btnInk || '#0a0a0a');
  const rootBg = bottles ? '#f7f3eb' : liquor ? '#120c0a' : tea ? '#0f1a15' : coffee ? '#14110e' : p.bg;
  const rootInk = bottles ? '#1c1917' : liquor ? '#f4ebe2' : tea ? '#e8f2ec' : coffee ? '#f3ebe3' : p.text;
  const rootMute = bottles ? '#57534e' : liquor ? '#b7a597' : tea ? '#9bb5a8' : coffee ? '#b5a898' : p.muted;
  const rootAccent = bottles ? '#0f766e' : liquor ? '#c9853a' : tea ? '#7dba8c' : coffee ? '#c4a574' : p.accent;
  const rootPanel = bottles ? '#fffef9' : liquor ? '#1d1410' : tea ? '#15241d' : coffee ? '#1c1712' : p.panel;
  const rootLine = bottles ? 'rgba(28, 25, 23, 0.12)' : 'rgba(244, 235, 226, 0.14)';

  const css = `@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;700&family=Source+Sans+3:wght@400;600;700&display=swap');
:root {
  --bg: ${rootBg};
  --ink: ${rootInk};
  --mute: ${rootMute};
  --accent: ${rootAccent};
  --panel: ${rootPanel};
  --line: ${rootLine};
  --btn-ink: ${btnInk};
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
.cart-btn { margin-left: auto; background: var(--accent); color: var(--btn-ink); font-weight: 700; border-radius: 999px; padding: 0.5rem 1rem; }
.hero { min-height: 72vh; display: grid; place-items: center; text-align: center; padding: 4.5rem 1.25rem 3rem; position: relative; overflow: hidden; }
.hero-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.38; }
.hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, color-mix(in srgb, var(--bg) 20%, transparent), var(--bg)); }
.hero-copy { position: relative; z-index: 1; max-width: 42rem; }
.eyebrow { text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent); font-size: 0.76rem; margin: 0; }
.hero h1 { margin: 0.45rem 0 0; font-size: clamp(2.4rem, 6.2vw, 4rem); }
.sub { margin: 0.9rem auto 0; max-width: 36rem; color: var(--mute); font-size: 1.12rem; line-height: 1.55; }
.cta-row { display: flex; gap: 0.8rem; justify-content: center; flex-wrap: wrap; margin-top: 1.4rem; }
.pill { display: inline-flex; align-items: center; justify-content: center; padding: 0.65rem 1.2rem; border-radius: 999px; text-decoration: none; }
.pill-primary { background: var(--accent); color: var(--btn-ink); font-weight: 700; }
.pill-ghost { border: 1px solid var(--accent); color: var(--accent); }
.band { padding: 3.75rem 1.25rem; }
.band-copy { text-align: center; max-width: 40rem; margin: 0 auto 1.75rem; }
.band h2 { margin: 0; font-size: clamp(1.85rem, 4vw, 2.7rem); }
.band-copy p { color: var(--mute); }
.filter-bar { max-width: 1120px; margin: 0 auto 1.5rem; display: flex; flex-wrap: wrap; gap: 0.55rem; justify-content: center; }
.chip { border: 1px solid var(--line); color: var(--mute); border-radius: 999px; padding: 0.4rem 0.85rem; font-size: 0.88rem; }
.chip-on { background: var(--accent); color: var(--btn-ink); border-color: var(--accent); font-weight: 700; }
.product-grid { max-width: 1120px; margin: 0 auto; display: grid; gap: 1.1rem; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }
.product-card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 1rem; display: flex; flex-direction: column; gap: 0.4rem; text-align: left; transition: transform 0.2s ease, border-color 0.2s ease; }
.product-card:hover { transform: translateY(-3px); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.product-media { height: 150px; border-radius: 14px; background:
  radial-gradient(130px 90px at 30% 28%, color-mix(in srgb, var(--accent) 50%, transparent), transparent),
  linear-gradient(155deg, ${mediaA}, ${mediaB}); }
.swatch { width: 0.85rem; height: 0.85rem; border-radius: 999px; border: 1px solid var(--line); display: inline-block; margin: 0.15rem 0; }
.linkish { text-align: left; font-weight: 700; font-size: 1.08rem; color: var(--ink); }
.meta, .notes, .attrs, .dim, .fine, .total { color: var(--mute); font-size: 0.9rem; }
.notes { line-height: 1.45; min-height: 2.6em; }
.attrs { display: flex; flex-wrap: wrap; gap: 0.55rem; }
.attrs span { border: 1px solid var(--line); border-radius: 999px; padding: 0.15rem 0.55rem; font-size: 0.78rem; }
.price { color: var(--ink) !important; font-weight: 700; font-size: 1.05rem; margin: 0.15rem 0 0; }
.add-to-cart, .purchase { background: var(--accent); color: var(--btn-ink); font-weight: 700; border-radius: 11px; padding: 0.72rem 1rem; margin-top: auto; }
.story { background: color-mix(in srgb, var(--panel) 78%, #000); }
.detail { max-width: 960px; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
.back { color: var(--mute); margin-bottom: 1rem; }
.detail-card { display: grid; gap: 1.5rem; grid-template-columns: 1.1fr 1fr; background: var(--panel); border: 1px solid var(--line); border-radius: 22px; padding: 1.25rem; }
.detail-media { min-height: 280px; border-radius: 16px; background:
  radial-gradient(180px 120px at 35% 30%, color-mix(in srgb, var(--accent) 55%, transparent), transparent),
  linear-gradient(160deg, ${detailA}, ${detailB}); }
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
.qty button { min-width: 28px; height: 28px; border-radius: 8px; background: ${qtyBg}; color: var(--ink); padding: 0 0.45rem; }
.checkout { display: flex; flex-direction: column; gap: 0.7rem; }
.checkout label { display: flex; flex-direction: column; gap: 0.3rem; color: var(--mute); font-size: 0.9rem; }
.checkout input { background: ${inputBg}; border: 1px solid var(--line); color: var(--ink); border-radius: 10px; padding: 0.65rem 0.8rem; }
.confirm { color: var(--accent); font-weight: 600; }
.foot { padding: 2.5rem 1.25rem 1.5rem; color: var(--mute); font-size: 0.85rem; border-top: 1px solid var(--line); background: color-mix(in srgb, var(--bg) 88%, #000); }
.foot a { color: var(--mute); text-decoration: none; }
.foot a:hover { color: var(--ink); }
.foot-cols { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1.25rem; max-width: 1100px; margin: 0 auto 1.75rem; }
.foot-cols h3 { margin: 0 0 0.55rem; color: var(--ink); font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; }
.foot-cols a { display: block; margin: 0.28rem 0; }
.foot-engage { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; max-width: 1100px; margin: 0 auto 1.5rem; align-items: center; }
.foot-news { display: flex; flex-wrap: wrap; gap: 0.65rem; align-items: center; }
.subscribe { appearance: none; border: 0; border-radius: 6px; padding: 0.45rem 0.9rem; background: var(--accent); color: var(--btn-ink); font-weight: 700; cursor: pointer; }
.foot-social { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; }
.foot-legal { display: flex; flex-wrap: wrap; gap: 0.65rem 1rem; justify-content: center; max-width: 1100px; margin: 0 auto; padding-top: 1rem; border-top: 1px solid var(--line); font-size: 0.78rem; }
@media (max-width: 800px) {
  .foot-cols { grid-template-columns: 1fr 1fr; }
}
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
      'src/App.jsx': app,
      'src/App.tsx': app,
      'src/App.css': css,
      'src/index.css': `html, body, #root { margin: 0; min-height: 100%; background: ${rootBg}; color: ${rootInk}; }\n`,
      'src/data/products.ts': productsTs,
    },
  };
}
