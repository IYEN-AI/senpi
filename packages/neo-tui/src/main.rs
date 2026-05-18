//! `senpi-neo-tui` binary entry.

use std::{path::PathBuf, process::ExitCode};

use clap::Parser;
use color_eyre::eyre::{Context, Result};

use senpi_neo_tui::{
    DEFAULT_DARK_THEME_JSON,
    app::{self, AppConfig},
    components::{
        chat,
        footer::{FooterState, Status},
        header::HeaderState,
    },
    theme,
};

#[derive(Debug, Parser)]
#[command(
    name = "senpi-neo-tui",
    version,
    about = "Native Rust + ratatui TUI for senpi (launched via `senpi --neo`)."
)]
struct Cli {
    /// Path to senpi backend binary for `--mode rpc`. Currently unused;
    /// the demo render does not spawn a backend.
    #[arg(long, env = "SENPI_NEO_BACKEND_BIN")]
    backend_bin: Option<PathBuf>,

    /// JSON array of args to forward to the backend. Currently unused.
    #[arg(long, env = "SENPI_NEO_BACKEND_ARGS", default_value = "[]")]
    backend_args: String,

    /// Render the canned demo state and exit after `--demo-seconds`.
    #[arg(long, env = "SENPI_NEO_DEMO", default_value_t = false)]
    demo: bool,

    /// Demo deadline in seconds (only with --demo). 0 = render until ctrl-c.
    #[arg(long, default_value_t = 0)]
    demo_seconds: u64,

    /// Override the theme JSON file.
    #[arg(long, env = "SENPI_NEO_THEME")]
    theme: Option<PathBuf>,
}

fn main() -> ExitCode {
    color_eyre::install().ok();
    if let Err(err) = real_main() {
        eprintln!("senpi-neo-tui: {err:?}");
        return ExitCode::FAILURE;
    }
    ExitCode::SUCCESS
}

fn real_main() -> Result<()> {
    let cli = Cli::parse();
    let theme_json = match cli.theme.as_deref() {
        Some(path) => std::fs::read_to_string(path)
            .with_context(|| format!("reading theme json {}", path.display()))?,
        None => DEFAULT_DARK_THEME_JSON.to_string(),
    };
    let theme = theme::resolve(&theme::parse(&theme_json)?)?;

    let config = AppConfig {
        theme,
        initial_chat: chat::sample(),
        header: HeaderState {
            cwd: std::env::current_dir().map_or_else(
                |_| "?".into(),
                |p| {
                    p.file_name()
                        .map_or_else(|| "/".into(), |s| s.to_string_lossy().into_owned())
                },
            ),
            session: "session: feat/neo-tui".into(),
            branch: Some("feat/neo-tui".into()),
        },
        footer: FooterState {
            status: Status::Streaming,
            status_label: "streaming response".into(),
            model: "claude-opus-4-7".into(),
            thinking: Some("max".into()),
            tps: Some(84),
            ctx_used_pct: 42,
            tokens_in: 12_400,
            tokens_out: 3_120,
            elapsed_secs: 0,
            spinner_glyph: '⠂',
        },
        input_placeholder: "type your prompt here ".into(),
        demo_mode: cli.demo,
        // demo_seconds is a demo-mode option; outside demo mode we ignore
        // it so a stray `--demo-seconds 5` does not auto-exit a real
        // session.
        demo_seconds: (cli.demo && cli.demo_seconds > 0).then_some(cli.demo_seconds),
    };

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    runtime.block_on(app::run(config))?;
    let _ = cli.backend_bin;
    let _ = cli.backend_args;
    Ok(())
}
