const fs = require('fs');
const path = require('path');
const dir = 'electron';
for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.cjs')) continue;
  const p = path.join(dir, name);
  let c = fs.readFileSync(p, 'utf8');
  const before = c;
  c = c.replace(/const ark([A-Z]\w*) = require\('\.\/nova/g, "const nova$1 = require('./nova");
  c = c.replace(/require\('\.\/nova([A-Z]\w*)\.cjs'\)/g, (m) => m);
  // Replace identifier arkFoo with novaFoo when Foo starts with uppercase (module handles)
  c = c.replace(/\bark([A-Z][A-Za-z0-9]*)\b/g, 'nova$1');
  // Avoid breaking words like landmark — already constrained to ark+Capital
  if (c !== before) {
    fs.writeFileSync(p, c);
    console.log('fixed', name);
  }
}
