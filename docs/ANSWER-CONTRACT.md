# Answer Contract (chat reply spine)

Frozen rules for how NOVA answers chat turns. Implementation: `src/lib/answerContract.ts`.

## Do

- Resolve one **Answer Contract** per chat turn (Job + Topic + Grounding + Stance).
- Gather evidence only for that Grounding.
- Compose from the user question + evidence.
- Verify on-topic; on fail → one retry or honest gap.

## Do not

- Add new chat-path `looksLike*` winners that bypass the contract.
- Use web search or plugins for bound-folder project asks.
- Invent link directories, book titles, or Debug Clinic dumps when the user did not ask.
- Heal a thin reply by pasting unrelated web results.
- Treat bare “more info” as a new web topic — deepen the thread instead.
- Inject product-plan “Overall: keep the first version tiny…” into normal chat.
- Let runaway `%2Cfff…` / hex token dumps paint for a minute — abort and keep prose.
- Emit markdown `#` / `####` hashtags in chat — scrub to **Bold** titles.
- Attach a shop URL whose product page does not match the link label (rewrite to a search URL for that label).
- Auto-enter Plan mode for tooling / IDE asks (“Python or VS Code?”, “what program do I use?”).

## Grounding priority

1. Project-referential + bound folder → **disk**
2. Thread follow-up → stay on prior topic
   - Bare “more info / more information / give me more info” expands the prior topic in-thread
   - Never web-search the literal phrase “more information” (that yields Open Library / etiquette pages)
3. How-to / DIY “exactly how to build X” → **web + deep guide** (options, parts, prices, links) — never software plan_talk
4. Build tooling (Python / VS Code / what program) → **normal chat explain** — never sticky Plan / plan_talk
5. Clear open-world fact ask → **web**
6. Casual / creative → **companion** (model + thread)
7. Ambiguous + bound → **disk**
