//! Generates the Tauri context from `tauri.conf.json` at build time.

fn main() {
    // The icons are compiled into the binary, and a development run shows the embedded one
    // in the Dock. Cargo did not know they were inputs, so after the icon changed on
    // 2026-11-07, `tauri dev` kept running a binary with the old one (reported the same day).
    println!("cargo:rerun-if-changed=icons");

    tauri_build::build();
}
