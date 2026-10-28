//! Generates the Tauri context from `tauri.conf.json` at build time.

fn main() {
    tauri_build::build();
}
