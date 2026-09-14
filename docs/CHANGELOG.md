# NOVA changelog

Product release notes for Settings → Update and release packaging.

> **Canonical home:** this file. In-app Settings reads `src/lib/changelog.ts` (`ARK_CHANGELOG`).

## 0.1.219

- Wave 2 mid-ladder peel: AIChat ≤3400 lines; send = hydrate + dispatch(editHost+chatHost) + one runChatTurn
- `finalizeWebEdits` gone from views; writes via `applyAndVerify`
- PreviewSession attach (no second Vite); createJob sessionStorage; GGUF cancel by chatId/jobId; arkJobs serialize npm/vite
- Brain hub: Installed / Recommended / Cloud / This PC; sticky + router `assertCoderAllowed`
- Settings split General / Models / Privacy / Advanced; changelog in `src/lib/changelog.ts`
- Multi-agent via `applyAndVerify` + TurnOutcome; arkAgentLoop workspace pref default off

## 0.1.218

- Wave 1 chat turn dispatch (create / delete / open / cmd / edit hosts)
- Wave 2 supporting modules: turn session hydrate, job store persistence, inflight map, verifyAsk widen, Electron job queue + preview session helper

## Earlier

See `ARK_CHANGELOG` in `src/lib/changelog.ts` for 0.1.206 and prior entries.
