/**
 * Non-web craft rules must not force App.jsx React.
 *   npx tsx --tsconfig tsconfig.app.json scripts/smoke-coding-craft-rules.mjs
 */
import assert from 'node:assert/strict';
import { formatThinCreateCraftRules } from '../src/lib/createThinPath.ts';

const cli = formatThinCreateCraftRules({
  brief: 'Build a node CLI tool for a coffee shop inventory',
  productName: 'ShopInv',
}).join('\n');
assert.match(cli, /CODING CREATE|node-cli|bin\/cli/i);
assert.doesNotMatch(cli, /ALWAYS write src\/App\.jsx/i);
assert.doesNotMatch(cli, /mountable React/i);

const site = formatThinCreateCraftRules({
  brief: 'Build a website for a coffee brand with shop',
  productName: 'Roast',
}).join('\n');
assert.match(site, /THIN CREATE|App\.jsx/i);

console.log('smoke-coding-craft-rules: ok');
