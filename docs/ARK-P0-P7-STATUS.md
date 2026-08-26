# ARK P0–P7 Implementation Status

Last updated: 2026-08-26 (live-tested on ARK-Dev source build)

## Implemented & live-tested

### P0 — Hands-free builder
| Item | Status | Notes |
|------|--------|-------|
| Debug path + problem → open project | **Done** | Fixed Step 1b catalog hijack; `shouldFullImportFolderAsk` + routing guards |
| Capability asks (no em-dash checklist) | **Done** | `formatArkCapabilitiesHelp` |
| File read by absolute path | **Done** | Fixed greedy path parse in `chatPcTasks.ts` |
| Workspace bind + Preview badge | **Done** | 502 files, Preview chip after debug open |
| Local scan fallback when model fails | **Done** | Router + studio engine fallbacks |
| Model routing for coding turns | **Done** | `kind: coding`, `isStrongLocal` includes `ark-engine`, incomplete-code prose kept |

### P3 — File ops (partial)
| Item | Status |
|------|--------|
| Read file by path | **Done** |
| Rename/create/delete | **Existing** (not re-tested this session) |

### P7 — Ship polish (partial)
| Item | Status |
|------|--------|
| Update splash solid dark panel | **In code** (`electron/arkUpdater.cjs`) |
| CDP test harness | **Done** (`tmp-cdp.cjs`, `tmp-p0-test.cjs`, `Open-ARK-Build.bat` port 9229) |

---

## Blocked / not yet done (needs follow-up)

### P0 remaining
| Item | Blocker |
|------|---------|
| Auto-patch (`@@@FILE`) on 7B local for large repos | 7B model rarely emits valid file blocks on 500+ file trees; needs cloud key or smaller scoped patch |
| Stop-button-specific diagnosis first | Static scan runs but generic security findings can rank above UI runtime hints on huge trees |
| One-shot fix without follow-up | Depends on stronger model or deterministic patch rules |

### P1 — Image recreate/upscale
| Item | Blocker |
|------|---------|
| High-fidelity img2img recreate | Local SD 1.5 / SDXL / FLUX models **not installed** (~4–13 GB each) |
| True 4K upscale | Pollinations cap ~1280px; local upscale pipeline not wired |

### P2 — Hybrid routing
| Item | Blocker |
|------|---------|
| Free-then-paid quota merge | Not implemented |
| Auto cloud hop for hard coding tasks | Needs API keys in Settings (Groq/OpenRouter/etc.) |

### P4 — Build/preview
| Item | Blocker |
|------|---------|
| Auto localhost on every folder open | Vite warm-start added for debug; not verified end-to-end in Preview window this session |

### P5 — Voice / Video
| Item | Blocker |
|------|---------|
| Live voice/video generation | **Parked** per product (`featurePark.ts`) |

### P6 — Social
| Item | Blocker |
|------|---------|
| Friend requests | **Shipped v0.1.160** — needs Supabase migration applied on server |
| Presence / payments | Not in scope this session |

### P7 remaining
| Item | Blocker |
|------|---------|
| CI public release token | `ARK_PUBLIC_RELEASE_TOKEN` missing in GitHub Actions |
| Full source dead-code sweep | Not started this session |

---

## Root causes fixed this session

1. **Folder catalog stole debug asks** — pasted `C:\...\Projects\...` triggered Step 1b listing instead of open+fix.
2. **`isStrongLocal` rejected `ark-engine`** — valid GGUF replies discarded → "no live model" message.
3. **`codingOutputIncomplete` discarded prose** — diagnosis text thrown away when no `@@@FILE` blocks.
4. **`ark-engine` + no media always nulled** — killed all local text responses.
5. **File read path greed** — `"read C:\path\file.ts and tell me..."` included trailing words in path.

---

## How to re-run live tests

```bat
Open-ARK-Build.bat
node tmp-p0-test.cjs
```

Tests use **New Chat** per case and `delete-tests` cleans `TEST:` threads.
