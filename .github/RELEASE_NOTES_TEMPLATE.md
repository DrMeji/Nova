## What's new

<!-- Describe user-visible changes -->

## Install notes

- Windows builds may be **unsigned**. SmartScreen may show "Windows protected your PC" — choose **More info → Run anyway**, or install a signed build when available.
- First launch: open **Local AI** to install a free on-device brain, or add free cloud keys in **Models**.
- Uninstalling ARK removes models and saved API keys from this PC (`deleteAppDataOnUninstall`).

## Verification

- [ ] Chat returns real answers or honest errors (no fake success)
- [ ] Brain API URL in Settings matches `/v1/contract`
- [ ] `npm run typecheck` clean
