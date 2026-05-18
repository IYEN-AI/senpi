//! Application loop and state container.
//!
//! Owns the terminal, drives a single `tokio::select!` loop multiplexing
//! crossterm events + render ticks, and routes through the keymap to
//! mutate state. Full RPC integration lands alongside T6/T16.

use std::{io::Stdout, time::Duration};

use color_eyre::eyre::Result;
use crossterm::{
    event::{
        DisableMouseCapture, EnableMouseCapture, Event, EventStream, KeyCode, KeyEvent,
        KeyEventKind, KeyModifiers,
    },
    execute,
    terminal::{EnterAlternateScreen, LeaveAlternateScreen, disable_raw_mode, enable_raw_mode},
};
use futures::StreamExt;
use ratatui::{Frame, Terminal, backend::CrosstermBackend};
use tokio::time::{Instant, MissedTickBehavior, interval};

use crate::{
    components::{chat, footer, header, input},
    layout::{self, LayoutState},
    theme::ResolvedTheme,
};

const SPINNER_FRAMES: [char; 8] = ['⠂', '⠆', '⠒', '⠢', '⠖', '⠲', '⠴', '⠤'];
const SPINNER_FRAME_MS: u64 = 80;
const RENDER_INTERVAL_MS: u64 = 33;

/// Inputs accepted by the app loop.
#[derive(Clone, Debug)]
pub struct AppConfig {
    pub theme: ResolvedTheme,
    pub initial_chat: chat::ChatState,
    pub header: header::HeaderState,
    pub footer: footer::FooterState,
    pub input_placeholder: String,
    pub demo_mode: bool,
    pub demo_seconds: Option<u64>,
}

/// Run the TUI to completion. Restores the terminal on exit.
pub async fn run(config: AppConfig) -> Result<()> {
    let mut terminal = init_terminal()?;
    let result = drive(&mut terminal, config).await;
    restore_terminal(&mut terminal)?;
    result
}

fn init_terminal() -> Result<Terminal<CrosstermBackend<Stdout>>> {
    enable_raw_mode()?;
    // From this point on every fallible call must roll back EVERY piece
    // of terminal state we've already enabled, otherwise a botched init
    // leaves the user's shell in some half-on combination of raw mode,
    // alt screen, or mouse capture.
    let mut stdout = std::io::stdout();
    // Sequence the alt-screen and mouse capture separately so we know
    // exactly which step failed and can roll back only the parts we did
    // turn on.
    if let Err(err) = execute!(stdout, EnterAlternateScreen) {
        let _ = disable_raw_mode();
        return Err(err.into());
    }
    if let Err(err) = execute!(stdout, EnableMouseCapture) {
        let _ = execute!(std::io::stdout(), LeaveAlternateScreen);
        let _ = disable_raw_mode();
        return Err(err.into());
    }
    let backend = CrosstermBackend::new(stdout);
    match Terminal::new(backend) {
        Ok(term) => Ok(term),
        Err(err) => {
            // Best-effort rollback for all three states we just enabled.
            let _ = execute!(
                std::io::stdout(),
                LeaveAlternateScreen,
                DisableMouseCapture
            );
            let _ = disable_raw_mode();
            Err(err.into())
        }
    }
}

fn restore_terminal(terminal: &mut Terminal<CrosstermBackend<Stdout>>) -> Result<()> {
    disable_raw_mode()?;
    execute!(std::io::stdout(), LeaveAlternateScreen, DisableMouseCapture)?;
    terminal.show_cursor()?;
    Ok(())
}

async fn drive(
    terminal: &mut Terminal<CrosstermBackend<Stdout>>,
    config: AppConfig,
) -> Result<()> {
    let AppConfig {
        theme,
        initial_chat,
        header,
        mut footer,
        input_placeholder,
        demo_mode,
        demo_seconds,
    } = config;

    let mut chat = initial_chat;
    let mut input_state = input::InputState {
        buffer: String::new(),
        placeholder: input_placeholder,
        mode_label: "INPUT".to_string(),
        focus_pulse: 0,
    };

    let mut events = EventStream::new();
    let mut render_tick = interval(Duration::from_millis(RENDER_INTERVAL_MS));
    render_tick.set_missed_tick_behavior(MissedTickBehavior::Skip);
    let mut spinner_tick = interval(Duration::from_millis(SPINNER_FRAME_MS));
    spinner_tick.set_missed_tick_behavior(MissedTickBehavior::Skip);

    let start = Instant::now();
    let mut spinner_idx: usize = 0;
    let demo_deadline = demo_seconds.map(|s| start + Duration::from_secs(s));

    loop {
        if let Some(deadline) = demo_deadline {
            if Instant::now() >= deadline {
                break;
            }
        }

        tokio::select! {
            biased;
            _ = render_tick.tick() => {
                footer.spinner_glyph = SPINNER_FRAMES[spinner_idx];
                footer.elapsed_secs = start.elapsed().as_secs();
                terminal.draw(|frame| {
                    draw(frame, &theme, &header, &chat, &input_state, &footer);
                })?;
            }
            _ = spinner_tick.tick() => {
                spinner_idx = (spinner_idx + 1) % SPINNER_FRAMES.len();
                input_state.focus_pulse = input_state.focus_pulse.wrapping_add(8);
            }
            ev = events.next() => {
                if let Some(Ok(event)) = ev {
                    if handle_event(
                        &event,
                        &mut chat,
                        &mut input_state,
                        &mut footer,
                        demo_mode,
                    ) {
                        break;
                    }
                }
            }
        }
    }

    Ok(())
}

fn draw(
    frame: &mut Frame<'_>,
    theme: &ResolvedTheme,
    header_state: &header::HeaderState,
    chat_state: &chat::ChatState,
    input_state: &input::InputState,
    footer_state: &footer::FooterState,
) {
    let area = frame.area();
    let line_count = input_state.buffer.lines().count().max(1);
    let computed = layout::compute(
        area,
        LayoutState {
            input_lines: u16::try_from(line_count).unwrap_or(1),
            // Auto-show the sidebar on wide terminals; the layout module
            // additionally clamps it off below 120 cols (its responsibility).
            sidebar_visible: area.width >= layout::SIDEBAR_MIN_TERMINAL_WIDTH,
        },
    );

    header::render(frame, computed.header, theme, header_state);
    chat::render(frame, computed.chat, theme, chat_state);
    input::render(frame, computed.input, theme, input_state);
    footer::render(frame, computed.footer, theme, footer_state);
}

fn handle_event(
    event: &Event,
    _chat: &mut chat::ChatState,
    input_state: &mut input::InputState,
    _footer: &mut footer::FooterState,
    demo_mode: bool,
) -> bool {
    let Event::Key(KeyEvent { code, modifiers, kind, .. }) = event else {
        return false;
    };
    if *kind != KeyEventKind::Press {
        return false;
    }
    if demo_mode {
        if matches!(code, KeyCode::Char('c')) && modifiers.contains(KeyModifiers::CONTROL) {
            return true;
        }
        return false;
    }
    match code {
        KeyCode::Char('c' | 'd') if modifiers.contains(KeyModifiers::CONTROL) => true,
        KeyCode::Backspace => {
            input_state.buffer.pop();
            false
        }
        KeyCode::Char(ch) => {
            input_state.buffer.push(*ch);
            false
        }
        _ => false,
    }
}
