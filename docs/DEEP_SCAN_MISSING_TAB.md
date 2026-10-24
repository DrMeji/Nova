# Deep scan → Missing tab rule

When running peer rescans, Live invent, or coding pipeline audits:

1. If a capability is **Have in code** but the **button / tab / settings / chrome** is missing, add it to `src/lib/missingItemsCatalog.ts` (`MISSING_ITEMS_STATIC`) in the **same change**.
2. Prefer a clear `id`, `eventualHome`, and `why` that names the peer gap.
3. If a component already exists but is **not mounted**, mount it (or add a Missing item that says “mount X”) — do not claim Have in unique caps alone.
4. Live invent failures that need a visible control (Ready reasons, invent-demo block badge, stage strips) go on Missing before or with the fix.

Do not wait for a later “UI pass” — Missing tab is the staging queue for shipping chrome.
