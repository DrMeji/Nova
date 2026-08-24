# ARK

Private **source** repository for the ARK desktop app.

| Repo | Visibility | What is there |
|------|------------|---------------|
| **[DrMeji/Ark](https://github.com/DrMeji/Ark)** | **Public** | README + Windows installers / Releases only |
| **DrMeji/Ark-Source** (this repo) | **Private** | Full application source |

Current source: **v0.1.147** · Private changelog: [docs/CHANGELOG.md](docs/CHANGELOG.md) · Public downloads: [Ark Releases](https://github.com/DrMeji/Ark/releases)

## Releasing (do not leak source)

1. Develop and commit **only** to `DrMeji/Ark-Source` (private).
2. Build the installer locally or via CI on **Ark-Source**.
3. Publish **only** these files to public **DrMeji/Ark** Releases:
   - `ARK-Setup.exe`
   - `ARK-Setup.exe.blockmap` (optional)
   - `latest.yml` (optional, for differential updates)
4. **Never** `git push` source trees, `src/`, `electron/`, or docs internals to `DrMeji/Ark`.

Helper: `pwsh scripts/publish-public-release.ps1 -Tag v0.1.xxx`

See [docs/RELEASING.md](docs/RELEASING.md).
