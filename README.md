# Nexus

**A local-first macOS app for studying lecture documents beside linked Markdown notes.**

Nexus opens a lecture's slides or handout on the left and your notes on the right, and ties
the two together: highlight a sentence on a slide, press **Link to notes**, and a citation
lands in your notes that jumps back to that exact spot. Everything is plain files in a folder
you choose. Nothing leaves your Mac.

> **Status:** in active development (version 0.1.0). It is built for one person's own study
> and is not a released product. See [What works today](#what-works-today) and
> [Not built yet](#not-built-yet) for an honest picture.

---

## Principles

- **Offline, always.** No accounts, no telemetry, no network requests. Fonts, the PDF
  engine, KaTeX, Mermaid and Chart.js are all bundled. The Content Security Policy blocks
  outside connections.
- **Your files, readable without Nexus.** A vault is an ordinary folder. Notes are Markdown,
  highlights are JSON, and every document is kept as a PDF next to its original.
- **Never lose work.** Every write is atomic (temp file → `fsync` → rename). A file that
  fails to parse is backed up, not discarded. Notes edited elsewhere while open are flagged
  as a conflict, not overwritten.
- **Private by construction.** Logs hold error codes and timings only. Nothing you typed or
  named, not even a file path, is ever written to them.

## What works today

**Vault**
- Open any folder as a vault. A lecture is any folder containing a `manifest.json`, nested
  up to five levels deep.
- Sidebar grouped by folder, week, module or tag, with search across titles and facets (`⌘P`).
- Import with the file picker (`⌘O`) or by dropping files on the window. PDFs are used as
  they are; PPT, PPTX, DOC and DOCX are converted to PDF once, at import, by LibreOffice when
  it is installed. The original is always kept.
- Edit a lecture's title, course, module, week and tags in a side panel.

**Reading**
- PDF rendering with pdf.js, in continuous-scroll or one-page mode, with zoom, fit-width and
  a page field.
- Text highlights in four meanings: **K**ey concept (amber), **D**efinition (green),
  **E**xam (red), **Q**uestion (blue). Each carries its letter as well as its colour.
- Area highlights around diagrams and equations: hold **Option** and drag, or use the box tool.
- Sticky notes on a slide, which can be dragged, resized, reworded and cited.
- Undo and redo for all of the above (`⌘Z` / `⌘⇧Z`).

**Notes**
- A Markdown editor (CodeMirror 6) with live preview in the same view: headings, lists,
  tables, task lists, quotes, and code blocks with syntax colouring for JavaScript,
  TypeScript, CSS, HTML and JSON.
- LaTeX through KaTeX, `mermaid` diagrams, and declarative `chart` blocks. A broken block
  shows a hint inline and never takes the editor down.
- Paste or drop images. They are saved into the lecture's `assets/` folder.
- A Notion-style format bar and shortcuts, plus highlighting in the notes in the same four
  meanings.
- Saves as you type. The divider between document and notes can be dragged, and its width
  is remembered on this Mac.

**Linking**
- **Link to notes** saves the highlight and inserts a citation at your cursor:
  `> 📌 **[Page 4](cite://<id>)**: *"…the sentence you highlighted…"*`
- Clicking a citation scrolls the document to the highlight and pulses it.
- A highlight that is cited shows a ¶ marker; clicking it scrolls the notes to the citation.

**Diagnostics**
- An error panel (`⌘0`) lists every error shown since launch, each with a code and a
  plain sentence saying what to do.

## Not built yet

Recorded in [`PROGRESS.md`](./PROGRESS.md) with the reasoning for each:

- Search inside notes and highlighted quotes (search covers titles and facets only).
- Reopening a lecture at the page you left.
- Page thumbnails, the document outline, Fit page, `⌘+` / `⌘−` zoom.
- `⌘L`, `⌘B`, and `⌘\` split presets (today `⌘\` shows or hides the notes).
- The "Reorganize vault" screen (the engine exists; the window does not call it yet).
- The rest of the diagnostics drawer: past logs, converter output, timings.
- Telling you when LibreOffice is missing (imports wait safely until it is installed).
- Restyling parts of the UI from the approved design canvas.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘O` | Import a document |
| `⌘P` | Search lectures |
| `⌘\` | Show or hide the notes |
| `⌘Z` / `⌘⇧Z` | Undo / redo highlights and sticky notes (in the notes: your typing) |
| `⌘0` | Error panel |
| **Option**-drag | Area highlight |
| `⌘B` `⌘I` `⌘⇧S` `⌘E` `⌘K` | Bold, italic, strikethrough, code, link (in the notes) |
| `⌘⌥1`–`3` / `⌘⌥4`–`6` | Headings / bulleted, numbered, to-do list (in the notes) |
| `⌘⇧H` | Highlight in the notes |

## How a vault is stored

```text
StudyVault/
├── .nexus/                    # Derived cache only — safe to delete, rebuilt by a scan
└── week-03/
    └── 02-raft-consensus/
        ├── manifest.json      # Title, facets (course, module, week, tags), order, provenance
        ├── source/
        │   ├── original.pptx  # The file you imported, kept for reconversion
        │   └── document.pdf   # What the viewer renders
        ├── notes.md           # Markdown with cite://<id> links
        ├── annotations.json   # Highlights and sticky notes, in page-relative coordinates
        └── assets/            # Images pasted or dropped into the notes
```

- **Highlight positions are fractions of the page** (`0.0`–`1.0` of the unscaled page), so
  they land in the same place at any zoom, on any screen, and on a future iPad app.
- **Everything inside a bundle is relative**, so a lecture folder can be moved or synced
  without rewriting anything.
- **Per-device state stays off the vault.** Theme and notes width live in
  `~/Library/Application Support/Nexus/`. A sync client therefore never sees them.

## Architecture

```text
crates/
├── lecture-core     Pure Rust domain logic: no Tauri, no UI, no platform code.
│                    Compiles for aarch64-apple-ios, checked on every gate run.
├── lecture-fs       Filesystem adapters: atomic storage, stores, vault scan, logging.
├── lecture-convert  Optional LibreOffice converter behind DocumentConverterPort.
└── src-tauri        Thin IPC adapter (the `nexus-app` crate). No business logic.
src/
├── ipc/             Typed wrappers for every command; every payload validated with Zod.
├── pdf/             Page geometry, selection and coordinate maths.
├── notes/           Markdown rules: citations, formatting, live-preview widgets.
└── ui/              React components and hooks; stylesheets in ui/styles/.
e2e/                 Playwright journeys in WebKit, against a mocked backend.
fixtures/            Contract fixtures written by Rust, read by TypeScript tests.
```

The stack is Tauri 2, Rust 1.97, React 19, TypeScript 6 (strict), Vite, CodeMirror 6 and
pdf.js. Desktop-only capabilities are ports (traits) in `lecture-core` with adapters
elsewhere. That keeps the domain portable to the planned iPadOS companion app.

## Getting started

### Prerequisites

- macOS (Apple silicon or Intel)
- [Rust](https://rustup.rs). The toolchain (1.97.0, with the iOS target) is pinned in
  `rust-toolchain.toml`, and rustup installs it on first use.
- Node.js 22
- Optional: [LibreOffice](https://www.libreoffice.org) to import PPT/PPTX/DOC/DOCX
  (`brew install --cask libreoffice`).
- Optional, for the end-to-end suite: `npx playwright install webkit`.

### Run it

```sh
npm ci
npm run app          # tauri dev: builds the Rust side and opens the window
```

To build a release `.app`, run `npm run app:build`.

### Check it

```sh
./scripts/gate.sh
```

The gate is the project's definition of done, and CI runs the same script. It runs:
- `cargo fmt --check`, `cargo test`, `cargo clippy -D warnings`
- the iOS compile check of `lecture-core`
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- the LibreOffice end-to-end tests (when LibreOffice is installed)
- the Playwright suite (when WebKit is installed)
- the 300-line file limit

Every step runs even if one fails, so you see everything that is broken at once.

## Documentation

| File | What it holds |
|---|---|
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | How to work on Nexus: setup, standards, the definition of done |
| [`claude-spec.md`](./claude-spec.md) | The product specification, with dated amendments where it changed |
| [`PROGRESS.md`](./PROGRESS.md) | Milestones, the decision log, known gaps, and every dependency's licence |
| [`CLAUDE.md`](./CLAUDE.md) | The binding rules for AI assistants working in this repository |

## Licence

No licence has been chosen for Nexus yet, so all rights are reserved by default. Every bundled
font, crate and package has its licence recorded in [`PROGRESS.md`](./PROGRESS.md#5-licences).
All fonts are under the SIL Open Font License.
