import { buildDesignPlan, renderDesignShell, STOCK_SPINE_CLONE_RE } from '../src/lib/createDesignSystem.ts';

const plan = buildDesignPlan({
  brief: 'Build a homepage for a skincare brand called Luna',
  productName: 'Luna',
});
const app = renderDesignShell(plan)['src/App.tsx'];
console.log('match', app.match(STOCK_SPINE_CLONE_RE)?.[0]);
console.log('bands', plan.copy.bands.map((b) => b.title));
console.log('support', plan.copy.support);
console.log('headline', plan.copy.headline);
console.log('cta', plan.copy.ctas);
