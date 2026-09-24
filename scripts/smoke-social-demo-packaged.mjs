/**
 * Packaged / Node (no novaDesktop) must not ship Maya Chen demo social data.
 * npm run smoke:social-demo
 */
const storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
globalThis.localStorage = storage;
globalThis.window = {
  localStorage: storage,
  addEventListener: () => {},
  removeEventListener: () => {},
  // Retail-shaped: packaged install
  novaDesktop: { isPackaged: true },
};

const {
  socialDemoEnabledNow,
  buildDemoNetworkPosts,
  buildDemoContacts,
  buildDemoThread,
  buildDemoGroups,
  buildDemoNotifications,
  DEMO_UNREAD_NOVA_IDS,
} = await import('../src/lib/socialDemo.ts');

let failed = 0;
function check(name, ok) {
  if (!ok) {
    console.error(`FAIL ${name}`);
    failed += 1;
  }
}

check('socialDemoEnabledNow false when packaged', socialDemoEnabledNow() === false);
check('network posts empty', buildDemoNetworkPosts('1110000').length === 0);
check('contacts empty', buildDemoContacts().length === 0);
check('thread empty', buildDemoThread('1110000', '2220000').length === 0);
check('groups empty', buildDemoGroups('1110000').length === 0);
check('notifications empty', buildDemoNotifications().length === 0);
check('unread ids empty', DEMO_UNREAD_NOVA_IDS.length === 0);

if (failed) {
  console.error(`\n${failed} social-demo packaged check(s) failed`);
  process.exit(1);
}
console.log('OK: packaged social demo data is empty');
