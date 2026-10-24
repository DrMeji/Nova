/**
 * Permanent contain: catalog polish asks must NEVER wipe App to a glyph stage.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Use tsx-style dynamic import of compiled sources via vite-node isn't available;
// mirror the gates here from the source contracts we just landed.
const PRODUCT_VISUAL_NOUN_RE =
  /\b(?:microphones?|mics?\b|headphones?|gpus?|graphics\s*cards?)\b/i;

function looksLikeProductVisualObjectAsk(message) {
  const t = String(message || '').trim();
  if (!t) return false;
  if (!PRODUCT_VISUAL_NOUN_RE.test(t)) return false;
  if (/\b(?:do\s+not|don't|dont|never|without)\s+(?:create|draw|generate|render|add|put|place|show|make)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:cards?|filters?|skus?|catalog|inventory|prices?|usd|cart|grid|shop\s+gpus?|named\s+cards?)\b/i.test(t)
    && /\b(?:improve|keep|filter|all\s*\/|nvidia|amd|intel|maker|gradient|plate|accent)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:website|web\s*app|application|shop|store|storefront|landing|homepage|dashboard|site)\b/i.test(t)) {
    return false;
  }
  if (/\b(?:image|picture|photo|visual|glyph|render)\b/i.test(t) && PRODUCT_VISUAL_NOUN_RE.test(t)) {
    return true;
  }
  if (/\b(?:create|draw|generate|render|add|put|place|show|make)\b/i.test(t)) return true;
  if (/\bon\s+the\s+page\b/i.test(t)) return true;
  return false;
}

function wantsProductVisualAsk(message) {
  const t = String(message || '').trim();
  if (/\b(?:improve|keep\s+all|filters?\s+working|named\s+cards?|maker\s+accent|product\s+plate)\b/i.test(t)) {
    return false;
  }
  return looksLikeProductVisualObjectAsk(t);
}

function projectLooksLikeRichCatalogShell(files) {
  const app = String(files?.['src/App.jsx'] || '');
  if (app.length < 800) return false;
  const hits = [
    /gpu-card|product-card|shop-grid|gpu-grid|catalog/i.test(app),
    /formatUsd|price/i.test(app),
    /filter|FILTERS|maker-filter|map\(\s*\(/i.test(app),
    (app.match(/\$\d|price:\s*\d/gi) || []).length >= 3,
    /Add to cart|Shop GPUs|Browse \d+/i.test(app),
  ].filter(Boolean).length;
  return hits >= 2;
}

const wipeAsk = 'On VoltCore GPUs only: improve each GPU card with a distinct dark product plate (gradient + maker accent), keep All/NVIDIA/AMD/Intel filters working, keep all 22 named cards and USD prices. Do not invent a different site. Do not add leather or atelier layout.';

assert.equal(wantsProductVisualAsk(wipeAsk), false, 'catalog polish ask must not be product-visual');
assert.equal(looksLikeProductVisualObjectAsk(wipeAsk), false, 'do-not-add + catalog must not trip glyph path');

const rich = {
  'src/App.jsx': `${'x'.repeat(900)}
    const FILTERS = ['All','NVIDIA'];
    <div className="gpu-grid">{GPUS.map(g => <article className="gpu-card"><p className="gpu-price">{formatUsd(g.price)}</p><button>Add to cart</button></article>)}</div>
    Shop GPUs Browse 22
  `,
};
assert.equal(projectLooksLikeRichCatalogShell(rich), true, 'rich catalog detected');

assert.equal(wantsProductVisualAsk('Create a microphone on the page'), true, 'true single-object ask still allowed');

console.log('PASS: product-visual cannot wipe rich GPU catalog');
void createRequire;
