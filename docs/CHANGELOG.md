# ARK changelog

## 0.1.138 — 2026-08-22

Chat coding, new-product routing, and delete targeting.

### Chat can edit code (default)

Default Chat is Agent, not Ask. Asks like **add a search button** or **change the header** write files in the open workspace via `@@@FILE` apply. Composer prefixes (`[Plan]`, Agent mode, Debug) are stripped before intent routing.

### New product ideas (Ring System)

“I want to work on a project called Ring System…” is a **new app**, not “which existing folder? DeBloat.” Greenfield plan → Create project. `Let’s work on DeBloat` still binds an existing folder.

### Delete / catalog safety

- Delete only the **named** folder. Never wipe the bound workspace by mistake.
- Listing a catalog no longer unbinds the open project.
- Add-file intent requires a real file name (not “Agent edit files”).

### Also in this line (0.1.118–0.1.137)

- Chat-first PC agent: explore, folder catalog, Desktop / Documents / Full PC grants
- Create / delete project from Chat (TDZ delete bug fixed)
- File vs folder disk intents, Pictures / Desktop path resolve
- Greenfield product planning (0.1.137)

Download: [Releases](https://github.com/DrMeji/Ark/releases)
