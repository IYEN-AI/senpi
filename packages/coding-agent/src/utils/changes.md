# changes

## Senpi-branded outbound identity (2026-05-11)

### What changed

- `core/sdk.ts`: `getProviderHeaders()` no longer hardcodes `"pi"` / `"pi-coding-agent"`. The OpenRouter `X-OpenRouter-Title` and the Cloudflare `User-Agent` now interpolate the runtime `APP_NAME` from `config.ts` (`"senpi"` in this fork).
- `core/extensions/builtin/background-task/spawner.ts`: When the parent process is launched through a generic Node/Bun runtime, the fallback sub-agent invocation now spawns `APP_NAME` (`senpi`) instead of the hardcoded `pi` binary.

### Why

- Every outbound request and every sub-agent invocation should identify as senpi, not pi. Hardcoded `"pi"` strings broke that contract.

### Why extension system couldn't handle this

- These are core SDK and spawner internals; an extension cannot rewrite headers built by `core/sdk.ts` or change the spawner's fallback executable.

### Expected merge conflict zones on next upstream sync

- LOW: provider-header builder and sub-agent spawn fallback strings.

## Senpi version metadata lookup (2026-05-02)

### What changed

- `version-check.ts`: Latest-version checks now query the configured senpi package metadata from npm instead of pi.dev.
- `pi-user-agent.ts`: The update-check user agent now uses the runtime app name from package metadata.

### Why

- `senpi update` and startup update checks must compare against senpi releases, not upstream pi-mono releases.

### Why extension system couldn't handle this

- Startup version checks run from core utilities before extensions can intercept the fetch target.

### Expected merge conflict zones on next upstream sync

- LOW: version-check URL and user-agent formatting utilities.
