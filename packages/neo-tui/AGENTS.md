# packages/neo-tui

Native Rust + ratatui TUI for senpi. Launched via `senpi --neo`. Standalone binary, not a NAPI addon. Talks to senpi over the existing `--mode rpc` JSONL protocol.

## STRUCTURE

```
packages/neo-tui/
├── Cargo.toml                # crate manifest
├── README.md
├── changes.md                # fork tracker (this is net-new vs upstream pi-mono)
├── docs/
│   ├── theme-spec.md
│   └── keymap-spec.md
├── assets/
│   ├── themes/*.json         # bundled themes
│   └── keymaps/default.json  # default keybindings
├── scripts/
│   ├── build-binary.mjs      # builds Rust + copies into coding-agent/dist
│   ├── qa.sh                 # tmux QA harness
│   └── qa-scenarios.json
├── src/
│   ├── main.rs               # binary entry
│   ├── lib.rs
│   ├── app/                  # run loop, state, action channel
│   ├── rpc/                  # RPC client (subprocess + JSONL codec)
│   ├── theme/                # JSON loader, tokens, ColorSupport
│   ├── keymap/               # configurable bindings + leader sequences
│   ├── layout/               # pure layout compute
│   ├── compositor/           # layered Component dispatch
│   ├── components/           # chat, input, header, footer, dialogs
│   ├── anim/                 # spinners, scanners, pulses
│   ├── term/                 # capability detection + OSC 52 clipboard
│   └── bin/
│       └── senpi-neo-faux.rs # faux RPC backend for offline QA
└── tests/
    ├── theme.rs
    ├── keymap.rs
    ├── rpc_envelope.rs
    ├── rpc_client.rs
    ├── layout.rs
    ├── compositor.rs
    ├── chat_snapshot.rs
    ├── input_snapshot.rs
    ├── fixtures/
    │   ├── themes/*.json
    │   ├── keymaps/*.json
    │   └── rpc/*.jsonl
    └── snapshots/
```

## RULES

- Stable Rust, edition 2024, MSRV pinned in workspace Cargo.toml.
- All `cargo` commands run from the worktree root.
- Strict lints: workspace `[lints.clippy]` is `pedantic + nursery + cargo` plus hard denies on `dbg_macro`, `print_stdout`, `todo`, `unimplemented`, `unreachable`, `undocumented_unsafe_blocks`.
- No `unwrap()` or `expect()` outside `tests/`, `#[cfg(test)]`, examples, `build.rs`, or after a `// SAFE-UNWRAP:` comment.
- No `unsafe` without a wrapping safe newtype, a `// SAFETY:` comment, and a miri-clean test (or documented alternative proof).
- Errors: `thiserror` for library boundaries, `anyhow` for binary main, `?` everywhere.
- Async: `tokio` multi-thread runtime. Never block in async. Never `block_on` in an async context.
- All keybindings come from `Keymap`. Never inline `if key.code == ...`. Default bindings live in `assets/keymaps/default.json` and are loaded via `include_str!`.
- All theme colors come from a `Token` enum + JSON spec. Never hardcode colors in render code.

## TESTING

```bash
# Fast unit + snapshot tests
cargo nextest run --package senpi-neo-tui

# Update snapshots after intentional changes:
INSTA_UPDATE=always cargo nextest run --package senpi-neo-tui

# Lint gate
cargo clippy --package senpi-neo-tui --all-targets -- -D warnings

# Format gate
cargo fmt --package senpi-neo-tui -- --check
```

## ANTI-PATTERNS

- Embedding via NAPI / neon / WASM.
- Hardcoded keybindings in source code.
- Hardcoded colors in render code.
- Blocking I/O in the event loop.
- Calling `terminal.draw` outside the render task or skipping it when state changes.
- Failing to restore terminal state on panic.
- Killing the tmux server in QA scripts.

## INTEGRATION POINTS

- `packages/coding-agent/src/cli/args.ts` parses `--neo`.
- `packages/coding-agent/src/main.ts` dispatches to `runNeoMode`.
- `packages/coding-agent/src/modes/neo-mode.ts` spawns `senpi-neo-tui`.
- `packages/coding-agent/dist/neo-tui-bin/senpi-neo-tui-<platform>-<arch>` is the installed binary.
- `packages/coding-agent/dist/neo-tui-themes/*.json` are bundled themes.
- `packages/coding-agent/dist/neo-tui-keymap/default.json` is the default keymap.
- The Rust binary spawns `senpi --mode rpc` as a child to drive the agent.
