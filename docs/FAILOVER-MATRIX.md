# Failover honesty matrix (#18)

Run: `npm run smoke:failover-matrix`

| Config | Expectation | How we verify |
|--------|-------------|----------------|
| **A** No key, no local brain | Honest CTA (Local AI install or free key) — never empty/`(no response)` | `honestNoLiveChatReply()` + Create chat capacity gate |
| **B** Free keyed Groq/Google | Cloud ids resolve to those providers; chat can answer | `resolvePreferredCloudProvider` smoke + live smoke with a key |
| **C** Local Engine GGUF ready | Model pins into prefs; Chat attribution clears so next turn uses it | Engine ready → `setLocalPrefs` + `clearAllThreadBrains` in ModelsView |

Live manual pass (once per release): A → B → C on one machine, three sends each.
