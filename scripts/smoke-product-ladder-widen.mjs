/**
 * Item 4: natural brand-site asks enter the product ladder — no “premium” wording.
 */
import assert from 'node:assert/strict';
import { briefWantsProductLadder } from '@/lib/createProductLadder';
import { briefWantsHardwareShell } from '@/lib/hardwareInventShells';

const yes = [
  'Build a website for La Strado — a gaming mouse brand.',
  'Build a website for Acme',
  'Create a brand website for Northline',
  'Make a company site for Harbor Goods',
  'Invent a product landing for Coil',
  'Build an online store for Drift Audio with shipping and warranty',
  'website for RidgeDesk shop the desk',
  'Build a landing page for Pulse — GPU store',
];

const no = [
  'Build a SaaS app shell with auth screen and billing',
  'Make a todo app for my tasks',
  'Create a dashboard app for metrics',
  'Build a CRM tool',
  'cocktail lounge listening room reserve a seat',
];

for (const b of yes) {
  assert.equal(briefWantsProductLadder(b), true, `should enter ladder: ${b}`);
  assert.equal(/premium/i.test(b), false, `no premium wording: ${b}`);
}
for (const b of no) {
  assert.equal(briefWantsProductLadder(b), false, `should stay off ladder: ${b}`);
}

assert.equal(
  briefWantsHardwareShell('Build a website for La Strado - a gaming mouse brand.'),
  true,
);
assert.equal(
  briefWantsHardwareShell('Build a website for Acme'),
  false,
  'generic brand site is product ladder, not mouse shell',
);

console.log('PASS: product ladder widened for natural brand-site asks');
