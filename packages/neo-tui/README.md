# `senpi-neo-tui`

Native Rust + [ratatui](https://ratatui.rs) TUI for [senpi](https://github.com/code-yeongyu/senpi).

Launched via:

```bash
senpi --neo
```

The Node-side senpi CLI spawns the Rust binary, which owns the terminal directly and talks to the senpi runtime over the existing `senpi --mode rpc` JSONL protocol.

## Why a separate binary

A TUI needs exclusive ownership of the terminal: raw mode, alternate screen, Kitty keyboard protocol, mouse capture, panic-safe cleanup. Embedding a ratatui app inside the Node process through NAPI produces three classes of bug (ThreadsafeFunction event-loop leaks, libuv/tokio TTY races, panic-poisoned addon state). A standalone binary sidesteps all three. The pipe IPC cost is 50-200 µs per JSONL line: negligible against frame budgets.

## Run

The crate ships two bins (`senpi-neo-tui`, the TUI itself; `senpi-neo-faux`,
the offline RPC backend used by the QA harness), so `cargo run` needs `--bin`
to disambiguate.

```bash
# Dev: render the bundled demo scene
cargo run --release --package senpi-neo-tui --bin senpi-neo-tui -- \
    --demo --demo-seconds 5

# Or through the Node CLI (resolves the binary out of target/release):
SENPI_NEO_TUI_DEV=1 node packages/coding-agent/dist/cli.js --neo
```

The full faux RPC backend (`bin/senpi-neo-faux`) is planned for T6; the offline
scenario harness lands with it.

## Architecture

Process tree at runtime:

```
shell
└── node senpi --neo                  # transient parent
    └── senpi-neo-tui                 # Rust binary (owns TTY)
        └── node senpi --mode rpc     # backend (T6)
```

Module layout matches the `Layout` section below; per-module roles and the
testing matrix live in [`AGENTS.md`](./AGENTS.md).

Process tree at runtime:

```
shell
└── node senpi --neo                  # transient parent
    └── senpi-neo-tui                 # Rust binary (owns TTY)
        └── node senpi --mode rpc     # backend
```

## Layout (modules)

- `app/`     - main loop, state, action channel
- `rpc/`     - subprocess RPC client speaking senpi `--mode rpc`
- `theme/`   - JSON theme loader, semantic tokens, ColorSupport detection
- `keymap/`  - configurable bindings + leader-key sequences
- `layout/`  - pure layout computation
- `compositor/` - layer + component dispatch
- `components/` - chat, input, header, footer, dialogs
- `anim/`    - spinners, scanners, pulses
- `term/`    - terminal capability + OSC 52 clipboard

## Tests

```bash
cargo nextest run --package senpi-neo-tui
cargo clippy --package senpi-neo-tui --all-targets -- -D warnings
cargo fmt --package senpi-neo-tui -- --check
```

## License

MIT.
