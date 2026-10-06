/**
 * Storefront plan + surgical repair — close the contract without wiping craft to the floor.
 * Floor remains last-resort only (create.ts).
 */
import {
  briefLooksLikeStorefront,
  scoreStorefrontContract,
  type StorefrontProduct,
} from '@/lib/createLayoutContract';
import { liquorCatalog, genericCatalog } from '@/lib/createStorefrontFloor';

export type StorefrontPlan = {
  genre: 'storefront';
  views: string[];
  components: string[];
  productFields: string[];
  interactions: string[];
  requireProductsFile: true;
  minProducts: number;
};

/** Expand a shop brief into a machine-checked structural plan before/alongside craft. */
export function buildStorefrontPlan(brief: string, productName = ''): StorefrontPlan {
  const t = `${brief}\n${productName}`;
  const wantsDetail = /\b(?:origin|age|notes|browse|explore|detail|where\s+it\s+comes|when\s+it\s+was\s+made)\b/i.test(t);
  return {
    genre: 'storefront',
    views: wantsDetail ? ['browse', 'detail', 'cart', 'checkout'] : ['browse', 'cart', 'checkout'],
    components: ['FilterBar', 'ProductGrid', 'ProductCard', 'CartDrawer', 'CheckoutForm'],
    productFields: ['id', 'name', 'type', 'origin', 'age', 'abv', 'notes', 'price'],
    interactions: ['filter-by-type', 'add-to-cart', 'qty-stepper', 'remove-line', 'purchase-confirm'],
    requireProductsFile: true,
    minProducts: 8,
  };
}

export function formatStorefrontPlanBlock(plan: StorefrontPlan): string {
  return [
    '## Storefront structural plan (REQUIRED — do not skip)',
    `Views: ${plan.views.join(' → ')}`,
    `Components (emit as src/components/*.tsx when helpful): ${plan.components.join(', ')}`,
    `Product fields in src/data/products.ts: ${plan.productFields.join(', ')}`,
    `Interactions: ${plan.interactions.join(', ')}`,
    `Minimum catalog size: ${plan.minProducts}`,
    'REQUIRED @@@FILE: src/App.tsx (or .jsx), src/App.css, src/data/products.ts',
    'Do not finish until filters, qty ± cart, and purchase confirm all work.',
  ].join('\n');
}

function productsTsFromCatalog(products: StorefrontProduct[]): string {
  return `export type Product = {
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
}

function catalogForBrief(title: string, brief: string): StorefrontProduct[] {
  const liquor = /\b(?:liquor|spirits?|whiskey|whisky|vodka|gin|tequila|bourbon|rum|bottle\s+shop|scotch|wine)\b/i.test(brief);
  return liquor ? liquorCatalog() : genericCatalog(title);
}

function priceCount(blob: string): number {
  return (blob.match(/["']?price["']?\s*:\s*\d+/g) || []).length;
}

function appIsSalvageable(app: string): boolean {
  const s = String(app || '');
  if (/ready when you are|Browse what is open|Core["'].*Day["']/i.test(s)) return false;
  if (looksLikeEmptyShell(s)) return false;
  const compact = s.replace(/\s+/g, '').length;
  const landmarks = [
    /<(?:nav|header)\b/i.test(s),
    /<(?:section|main)\b/i.test(s),
    /className=["'][^"']*\b(?:hero|product|shop|grid|story)\b/i.test(s) || /product-card|product-grid/i.test(s),
    /<footer\b|className=["'][^"']*\bfoot/i.test(s),
  ].filter(Boolean).length;
  // Structured shells with nav/hero/footer are salvageable even when still short.
  if (landmarks >= 3 && compact >= 280) return true;
  return compact >= 700 && landmarks >= 2;
}

function looksLikeEmptyShell(app: string): boolean {
  const s = String(app || '');
  return s.length < 400
    || /return\s*\(\s*<div\s+className=["']app["']\s*\/>\s*\)/i.test(s)
    || (!/<section\b/i.test(s) && !/<main\b/i.test(s) && s.length < 800);
}

/** Design-quality bar beyond functional checklist. */
export function scoreStorefrontDesignQuality(
  files: Record<string, string>,
): { ok: boolean; score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;
  const app = files['src/App.tsx'] || files['src/App.jsx'] || '';
  const css = files['src/App.css'] || '';
  const blob = `${app}\n${css}`;
  if (!/<(?:header|nav)\b/i.test(app)) {
    reasons.push('design: missing sticky header/nav hierarchy');
    score -= 15;
  }
  if (!/className=["'][^"']*\bhero\b|<(?:section)[^>]*hero/i.test(app)) {
    reasons.push('design: missing brand hero stage');
    score -= 15;
  }
  if (!/<footer\b|className=["'][^"']*\bfoot/i.test(app)) {
    reasons.push('design: missing footer');
    score -= 10;
  }
  if (!/product-card|product-grid/i.test(blob)) {
    reasons.push('design: missing product card/grid anatomy');
    score -= 20;
  }
  if (
    /\.(?:app|site)\b[\s\S]{0,320}\bjustify-content\s*:\s*center\b/i.test(css)
    && /\.(?:app|site)\b[\s\S]{0,320}\balign-items\s*:\s*center\b/i.test(css)
  ) {
    reasons.push('design: phone-column shell — not retail layout');
    score -= 25;
  }
  if (!/@font-face|fonts\.googleapis|font-family\s*:/i.test(css)) {
    reasons.push('design: missing intentional type pairing');
    score -= 10;
  }
  if (!/radial-gradient|linear-gradient|@keyframes/i.test(css)) {
    reasons.push('design: missing atmosphere (gradient/motion)');
    score -= 8;
  }
  if (!/\.product-card:hover|transition\s*:/i.test(css)) {
    reasons.push('design: weak card hover/interaction polish');
    score -= 6;
  }
  score = Math.max(0, score);
  return { ok: reasons.length === 0 && score >= 70, score, reasons };
}

export type StorefrontRepairResult = {
  files: Record<string, string>;
  changed: boolean;
  actions: string[];
  needFloor: boolean;
  recoveredFloor: false;
  contractOk: boolean;
  designOk: boolean;
  reasons: string[];
};

/**
 * Prefer closing missing storefront pieces over replacing the whole craft with the floor.
 * Returns needFloor when the App is too thin/broken to salvage.
 */
export function repairStorefrontToContract(
  files: Record<string, string>,
  opts: { productName: string; brief: string },
): StorefrontRepairResult {
  const title = String(opts.productName || 'Shop').replace(/[*/\\<>]/g, '').slice(0, 48) || 'Shop';
  const brief = String(opts.brief || '');
  const next = { ...files };
  const actions: string[] = [];
  const appKey = next['src/App.jsx'] && !next['src/App.tsx'] ? 'src/App.jsx' : 'src/App.tsx';
  let app = String(next[appKey] || next['src/App.jsx'] || next['src/App.tsx'] || '');
  let css = String(next['src/App.css'] || '');

  if (!briefLooksLikeStorefront(brief, title)) {
    return {
      files: next,
      changed: false,
      actions,
      needFloor: false,
      recoveredFloor: false,
      contractOk: true,
      designOk: true,
      reasons: [],
    };
  }

  if (!appIsSalvageable(app)) {
    const contract = scoreStorefrontContract(next, { brief });
    return {
      files: next,
      changed: false,
      actions: ['unsavageable-shell'],
      needFloor: true,
      recoveredFloor: false,
      contractOk: contract.ok,
      designOk: false,
      reasons: contract.reasons,
    };
  }

  const existingProducts = String(next['src/data/products.ts'] || '');
  const catalogBlob = `${app}\n${existingProducts}`;
  if (!existingProducts.trim() || priceCount(catalogBlob) < 8) {
    next['src/data/products.ts'] = productsTsFromCatalog(catalogForBrief(title, brief));
    actions.push('ensure-products-ts');
  }

  if (!/from\s+['"]\.\/data\/products['"]/.test(app) && !/from\s+['"]\.\/data\/products\.ts['"]/.test(app)) {
    if (/import\s+['"]\.\/App\.css['"];?/.test(app)) {
      app = app.replace(
        /(import\s+['"]\.\/App\.css['"];?)/,
        `$1\nimport { PRODUCTS, PRODUCT_TYPES } from './data/products';`,
      );
    } else {
      app = `import { PRODUCTS, PRODUCT_TYPES } from './data/products';\n${app}`;
    }
    actions.push('import-products');
  }

  if (!/\buseState\b/.test(app) || !/\buseMemo\b/.test(app)) {
    if (/from\s+['"]react['"]/.test(app)) {
      app = app.replace(/import\s*\{([^}]*)\}\s*from\s*['"]react['"]/, (_m, inner) => {
        const parts = String(inner).split(',').map((s) => s.trim()).filter(Boolean);
        if (!parts.includes('useState')) parts.push('useState');
        if (!parts.includes('useMemo')) parts.push('useMemo');
        return `import { ${parts.join(', ')} } from 'react'`;
      });
    } else {
      app = `import { useMemo, useState } from 'react';\n${app}`;
    }
    actions.push('import-hooks');
  }

  const hasCart = /\b(?:setCart|addToCart)\b/i.test(app) && /Add to cart/i.test(app);
  const hasQty = /\bsetQty\b|\bqty\b/i.test(app);
  const hasFilters = /\bsetFilter\b|\bPRODUCT_TYPES\b/.test(app);
  const hasCheckout = /\b(?:Purchase|checkout|Order placed|placeOrder)\b/i.test(app);
  const hasGrid = /product-grid|product-card/i.test(`${app}\n${css}`);

  if (!hasCart || !hasQty || !hasFilters || !hasCheckout || !hasGrid) {
    const island = storefrontCommerceIsland();
    if (!/NOVA_STOREFRONT_ISLAND/.test(app)) {
      if (/export\s+default\s+function\s+App\s*\([^)]*\)\s*\{/.test(app)) {
        app = app.replace(
          /(export\s+default\s+function\s+App\s*\([^)]*\)\s*\{)/,
          `$1\n  ${island.state}`,
        );
      } else if (/function\s+App\s*\([^)]*\)\s*\{/.test(app)) {
        app = app.replace(/(function\s+App\s*\([^)]*\)\s*\{)/, `$1\n  ${island.state}`);
      }
      // Always inject INSIDE the return root — never after </div>) or as a sibling
      // (adjacent JSX outside the root is a Vite compile crash → blank Live screen).
      const injected = injectJsxInsideReturnRoot(app, island.jsx);
      if (injected) {
        app = injected;
        actions.push('inject-commerce-island');
      }
    }
    if (!/\.product-grid\b/.test(css)) {
      css += island.css;
      actions.push('commerce-island-css');
    }
  }

  if (!/Cart\s*\(|cart-btn/i.test(app) && /<nav\b/i.test(app)) {
    app = app.replace(
      /(<nav\b[^>]*>)/i,
      `$1\n          <button type="button" className="cart-btn" onClick={() => typeof setOpen === 'function' && setOpen(true)}>Cart ({typeof count === 'number' ? count : 0})</button>`,
    );
    actions.push('nav-cart-badge');
  }

  next[appKey] = app;
  next['src/App.css'] = css;

  const contract = scoreStorefrontContract(next, { brief });
  const design = scoreStorefrontDesignQuality(next);

  return {
    files: next,
    changed: actions.length > 0,
    actions,
    needFloor: !contract.ok && looksLikeEmptyShell(app),
    recoveredFloor: false,
    contractOk: contract.ok,
    designOk: design.ok,
    reasons: [...contract.reasons, ...design.reasons],
  };
}


/**
 * Insert JSX before the return-root's closing tag so we never create adjacent
 * siblings outside the root (Vite: "Adjacent JSX elements must be wrapped").
 */
export function injectJsxInsideReturnRoot(app: string, jsx: string): string | null {
  const src = String(app || '');
  const chunk = String(jsx || '').trim();
  if (!src || !chunk) return null;

  // Prefer before an existing footer inside the return.
  if (/<footer\b/i.test(src)) {
    const next = src.replace(/<footer\b/i, `${chunk}\n      <footer`);
    if (next !== src) return next;
  }

  // Insert before the last </div> that closes the return (…</div>\n  );).
  const closeRe = /<\/div>(\s*\n\s*\)\s*;)/;
  if (closeRe.test(src)) {
    return src.replace(closeRe, `${chunk}\n    </div>$1`);
  }

  // Before </main> as a last structural hook.
  if (/<\/main>/i.test(src)) {
    const next = src.replace(/<\/main>/i, `${chunk}\n      </main>`);
    if (next !== src) return next;
  }

  return null;
}

function storefrontCommerceIsland(): { state: string; jsx: string; css: string } {
  const state = `
  /* NOVA_STOREFRONT_ISLAND */
  const [filter, setFilter] = useState('All');
  const [cart, setCart] = useState([]);
  const [open, setOpen] = useState(false);
  const [buyer, setBuyer] = useState('');
  const [placed, setPlaced] = useState('');
  const visible = useMemo(
    () => (filter === 'All' ? PRODUCTS : PRODUCTS.filter((p) => p.type === filter)),
    [filter],
  );
  const count = cart.reduce((n, line) => n + line.qty, 0);
  const total = useMemo(() => cart.reduce((s, line) => s + line.price * line.qty, 0), [cart]);
  const add = (product) => {
    setCart((prev) => {
      const hit = prev.find((line) => line.id === product.id);
      if (hit) return prev.map((line) => (line.id === product.id ? { ...line, qty: line.qty + 1 } : line));
      return [...prev, { ...product, qty: 1 }];
    });
    setOpen(true);
  };
  const setQty = (id, qty) => {
    setCart((prev) => prev.map((line) => (line.id === id ? { ...line, qty } : line)).filter((line) => line.qty > 0));
  };
`;
  const jsx = `
      <section className="band" id="shop" data-nova="storefront-island">
        <div className="band-copy"><h2>Shop the catalog</h2><p>Filter by type, set quantities, and checkout.</p></div>
        <div className="filter-bar" role="toolbar" aria-label="Product filters">
          {(PRODUCT_TYPES || ['All']).map((t) => (
            <button key={t} type="button" className={filter === t ? 'chip chip-on' : 'chip'} onClick={() => setFilter(t)}>{t}</button>
          ))}
        </div>
        <div className="product-grid">
          {visible.map((p) => (
            <article key={p.id} className="product-card">
              <h3>{p.name}</h3>
              <p className="meta">{p.type}{p.origin ? \` · \${p.origin}\` : ''}{p.age ? \` · \${p.age}\` : ''}</p>
              {p.abv ? <p className="attrs"><span>{p.abv}</span></p> : null}
              <p className="notes">{p.notes}</p>
              <p className="price">\${p.price}</p>
              <button type="button" className="add-to-cart" onClick={() => add(p)}>Add to cart</button>
            </article>
          ))}
        </div>
      </section>
      {open ? (
        <div className="cart-drawer" role="dialog" aria-label="Cart">
          <div className="cart-panel">
            <div className="cart-head"><h2>Cart ({count})</h2><button type="button" className="ghost" onClick={() => setOpen(false)}>Close</button></div>
            <ul className="cart-lines">
              {cart.map((line) => (
                <li key={line.id}>
                  <div><strong>{line.name}</strong><span className="dim">\${line.price}</span></div>
                  <div className="qty">
                    <button type="button" onClick={() => setQty(line.id, line.qty - 1)}>−</button>
                    <span>{line.qty}</span>
                    <button type="button" onClick={() => setQty(line.id, line.qty + 1)}>+</button>
                  </div>
                </li>
              ))}
            </ul>
            <p className="total">Subtotal \${total}</p>
            <div className="checkout">
              <label>Name<input value={buyer} onChange={(e) => setBuyer(e.target.value)} /></label>
              <button type="button" className="purchase" onClick={() => setPlaced(buyer.trim() ? \`Order placed for \${buyer.trim()}\` : 'Order placed')}>Purchase</button>
              {placed ? <p className="confirm">{placed}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
`;
  const css = `
/* storefront island */
.filter-bar{display:flex;flex-wrap:wrap;gap:.55rem;justify-content:center;margin:0 auto 1.25rem;max-width:1120px}
.chip{border:1px solid color-mix(in srgb, currentColor 22%, transparent);border-radius:999px;padding:.4rem .85rem;background:transparent;color:inherit}
.chip-on{font-weight:700;opacity:1;background:color-mix(in srgb, currentColor 12%, transparent)}
.product-grid{max-width:1120px;margin:0 auto;display:grid;gap:1.1rem;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}
.product-card{border:1px solid color-mix(in srgb, currentColor 14%, transparent);border-radius:18px;padding:1rem;display:flex;flex-direction:column;gap:.35rem;text-align:left;transition:transform .2s ease,border-color .2s ease}
.product-card:hover{transform:translateY(-3px)}
.product-card .price{font-weight:700}
.add-to-cart,.purchase{margin-top:auto;border-radius:11px;padding:.7rem 1rem;font-weight:700}
.cart-drawer{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:50;display:grid;justify-items:end}
.cart-panel{width:min(420px,100%);height:100%;overflow:auto;padding:1.2rem;background:#16110e;color:#f4ebe3;display:flex;flex-direction:column;gap:.75rem}
.cart-lines{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:.75rem}
.qty{display:flex;align-items:center;gap:.4rem}
.qty button{min-width:28px;height:28px;border-radius:8px}
.cart-btn{margin-left:auto}
`;
  return { state, jsx, css };
}
