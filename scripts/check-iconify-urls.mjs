import assert from 'node:assert/strict';

// Mirror the Iconify URL builder (slash form — colon encoding 403s).
function iconifySvgUrl(id, height = 64) {
  const raw = String(id || '').trim();
  const m = raw.match(/^([a-z0-9-]+):([a-z0-9-]+)$/i);
  const path = m ? `${m[1]}/${m[2]}` : raw.replace(':', '/');
  return `https://api.iconify.design/${path}.svg?height=${Number(height) || 64}`;
}

assert.equal(
  iconifySvgUrl('simple-icons:apple', 64),
  'https://api.iconify.design/simple-icons/apple.svg?height=64',
);
assert.equal(
  iconifySvgUrl('lucide:heart', 24),
  'https://api.iconify.design/lucide/heart.svg?height=24',
);
assert.doesNotMatch(iconifySvgUrl('simple-icons:apple'), /%3A/);

const apple = await fetch(iconifySvgUrl('simple-icons:apple', 64));
assert.equal(apple.ok, true, `Iconify apple ${apple.status}`);
const appleSvg = await apple.text();
assert.match(appleSvg, /<svg[\s\S]*<path/i);
assert.doesNotMatch(appleSvg, /font-size="8"/);

const heart = await fetch(iconifySvgUrl('lucide:heart', 24));
assert.equal(heart.ok, true, `Iconify heart ${heart.status}`);
const heartSvg = await heart.text();
assert.match(heartSvg, /<svg[\s\S]*path/i);

const cdn = await fetch('https://cdn.jsdelivr.net/npm/simple-icons@v13/icons/github.svg');
assert.equal(cdn.ok, true, `jsDelivr github ${cdn.status}`);

console.log('PASS iconify slash URLs + live SVG fetch');
