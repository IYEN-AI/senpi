//! Input editor frame. Real `tui-textarea` integration lands later;
//! today this draws a bordered Paragraph with the typed buffer + a
//! breathing accent border.

use ratatui::{
    Frame,
    layout::Rect,
    style::{Modifier, Style},
    text::{Line, Span},
    widgets::{Block, BorderType, Borders, Padding, Paragraph},
};

use crate::theme::{ResolvedTheme, Token};

/// Inputs to the input component.
#[derive(Clone, Debug, Default)]
pub struct InputState {
    pub buffer: String,
    pub placeholder: String,
    pub mode_label: String,
    /// 0..=255 - drives the breathing border accent (T15).
    pub focus_pulse: u8,
}

/// Render the input frame into the given rect.
pub fn render(frame: &mut Frame<'_>, area: Rect, theme: &ResolvedTheme, state: &InputState) {
    if area.height < 3 || area.width < 4 {
        return;
    }
    let border = theme.token(Token::BorderActive);
    let muted = theme.token(Token::TextMuted);
    let text = theme.token(Token::Text);
    let element_bg = theme.token(Token::BackgroundElement);
    let bg = theme.token(Token::Background);

    let title = Line::from(vec![
        Span::styled(
            format!(" {} ", state.mode_label),
            Style::default().fg(text).add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            "│ ↵ submit · ⇧↵ newline · @ files · / commands · ^P palette",
            Style::default().fg(muted),
        ),
    ]);
    let block = Block::default()
        .borders(Borders::ALL)
        .border_type(BorderType::Plain)
        .border_style(Style::default().fg(border))
        .style(Style::default().bg(bg))
        .padding(Padding::horizontal(1))
        .title(title);

    let inner = block.inner(area);
    frame.render_widget(block, area);

    let body_style = Style::default().bg(element_bg);
    let cursor = Span::styled("█", Style::default().fg(border).add_modifier(Modifier::BOLD));
    let content: Vec<Line<'_>> = if state.buffer.is_empty() {
        vec![Line::from(vec![
            Span::styled(state.placeholder.clone(), Style::default().fg(muted)),
            cursor,
        ])]
    } else {
        let mut lines: Vec<Line<'_>> = state
            .buffer
            .lines()
            .map(|l| Line::from(Span::styled(l.to_string(), Style::default().fg(text))))
            .collect();
        if let Some(last) = lines.last_mut() {
            last.spans.push(cursor);
        }
        lines
    };

    frame.render_widget(Paragraph::new(content).style(body_style), inner);
}
