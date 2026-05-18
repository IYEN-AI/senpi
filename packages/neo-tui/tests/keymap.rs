//! Contract tests for the keymap system.
//!
//! `parse` must round-trip the bundled keymap and preserve every binding
//! verbatim, since neo-tui's compatibility contract with the legacy
//! `@earendil-works/pi-tui` + `@code-yeongyu/senpi` keybinding registry
//! is the bundled JSON itself. The strict `Action`-enum validation lives
//! in T8 and arrives as additional tests once the lookup logic lands.

use senpi_neo_tui::keymap;

const DEFAULT_JSON: &str = senpi_neo_tui::DEFAULT_KEYMAP_JSON;

#[test]
fn parses_default_keymap() {
    let spec = keymap::parse(DEFAULT_JSON).expect("default keymap must parse");
    assert!(
        spec.bindings.len() >= 60,
        "default keymap should mirror the full legacy registry, got {} bindings",
        spec.bindings.len()
    );
}

/// Pi-tui defaults from `packages/tui/src/keybindings.ts::TUI_KEYBINDINGS`
/// and senpi app defaults from
/// `packages/coding-agent/src/core/keybindings.ts::KEYBINDINGS`. If any of
/// these drift, users hot-switching between the legacy TUI and `senpi --neo`
/// will lose muscle memory.
#[test]
fn keeps_legacy_app_bindings_in_sync() {
    let spec = keymap::parse(DEFAULT_JSON).expect("default keymap must parse");
    let cases: &[(&str, &[&str])] = &[
        ("app.interrupt", &["escape"]),
        ("app.clear", &["ctrl+c"]),
        ("app.exit", &["ctrl+d"]),
        ("app.thinking.cycle", &["shift+tab"]),
        ("app.model.cycleForward", &["ctrl+p"]),
        ("app.model.cycleBackward", &["shift+ctrl+p"]),
        ("app.model.select", &["ctrl+l"]),
        ("app.tools.expand", &["ctrl+o"]),
        ("app.thinking.toggle", &["ctrl+t"]),
        ("app.editor.external", &["ctrl+g"]),
        ("app.message.followUp", &["alt+enter"]),
        ("app.message.dequeue", &["alt+up"]),
        ("app.clipboard.pasteImage", &["ctrl+v"]),
        ("tui.input.submit", &["enter"]),
        ("tui.input.newLine", &["shift+enter"]),
        ("tui.editor.cursorLineStart", &["home", "ctrl+a"]),
        ("tui.editor.deleteWordBackward", &["ctrl+w", "alt+backspace"]),
        ("tui.select.cancel", &["escape", "ctrl+c"]),
    ];
    for (id, expected) in cases {
        let actual = spec
            .bindings
            .get(*id)
            .unwrap_or_else(|| panic!("missing legacy binding {id}"));
        assert_eq!(
            actual.as_slice(),
            *expected,
            "binding {id} drifted from legacy default; legacy expected {expected:?}, got {actual:?}"
        );
    }
}

#[test]
fn accepts_arbitrary_keys_until_t8_strictens() {
    // Today the parser round-trips arbitrary string keys. T8 will reject
    // unknown actions at merge time; that test lives alongside T8.
    let bad = r#"{ "bindings": { "nonsense.action": ["alt+x"] } }"#;
    let spec = keymap::parse(bad).expect("parser accepts unknown action names today");
    assert!(spec.bindings.contains_key("nonsense.action"));
}
