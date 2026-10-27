# Claude Code Master Specification: Local-First High-Performance Lecture & Note-Taking App (macOS)

## Role & Execution Directive for Claude Code
You are acting as a Principal Systems & Desktop Application Architect. Your objective is to build a blazing-fast, 100% offline, local-first macOS application for studying lecture materials (PDF, PPT, PPTX, DOC, DOCX) alongside deeply linked, rich Markdown notes.

You must prioritize **runtime performance, memory efficiency, strict type safety, modular architecture, observability, and automated behavioral testing** so the codebase remains effortless to debug, maintain, and extend (including a planned Phase 2 iPadOS companion app).

---

## 1. Why This Tech Stack (Performance & Maintainability Justification)

To achieve native speed, instant startup, low RAM usage, and effortless cross-device compatibility for Phase 2 (iPad), **do NOT use Electron**. Instead, build on **Tauri v2 (Rust) + React 19 + TypeScript (Vite)**:

1. **Backend / Systems Layer — Rust (Tauri v2 Workspace):**
   - **Blazing Fast I/O & Zero GC Pauses:** All filesystem operations, atomic writes, workspace indexing, file watching (`notify` crate), and background PPTX/DOCX-to-PDF conversion pipelines run in native compiled **Rust** using async `tokio`.
   - **Tiny Footprint:** Uses macOS native `WKWebView` instead of bundling Chromium, cutting baseline RAM usage from ~500 MB (Electron) down to ~35–50 MB and producing a ~10 MB native Apple Silicon (`arm64`) binary.
   - **Phase 2 iPad Code Reuse:** By isolating core business logic, file bundle parsing, and coordinate validation inside a pure Rust crate (`crates/lecture-core`), the exact same Rust engine can be compiled to iPadOS in Phase 2 via `UniFFI` / Swift bindings.
2. **Frontend / UI Layer — TypeScript (Strict Mode) + React + Vite:**
   - **PDF Engine:** `pdfjs-dist` (bundled locally with dedicated Web Workers and canvas virtualization so only visible pages + a 2-page buffer are rendered in DOM memory at any time).
   - **Editor Engine:** `CodeMirror 6` (virtualized viewport rendering capable of handling 100,000+ line documents at 120fps) paired with unified/remark/rehype plugins for live preview.
   - **Rich Academic Blocks (100% Bundled Offline):**
     - **Math/Equations:** `KaTeX` (significantly faster than MathJax, zero network calls).
     - **Graphs & Diagrams:** `Mermaid.js` (flowcharts, sequence diagrams, state machines, class diagrams).
     - **Data Charts:** `Chart.js` or `Recharts` driven by declarative JSON/YAML inside fenced ` ```chart ` blocks.
   - **State Management:** `Zustand` with `Immer` for deterministic, inspectable, unidirectional state transitions.
   - **End-to-End Type Safety Across IPC:** Use `tauri-specta` or `ts-rs` + `Zod` so Rust structs and TypeScript interfaces are guaranteed to match at compile time and runtime.

---

## 2. Core Functional Requirements

### 2.1 Zero-Cloud / 100% Local & Offline Guarantee
- **Strict Offline Policy:** The application must never make outbound network requests. Configure Tauri's Content Security Policy (`csp` in `tauri.conf.json`) to block all external `http://`, `https://`, and `ws://` connections (`connect-src 'self' ipc: http://ipc.localhost`).
- **Bundled Assets Only:** All fonts (including KaTeX math fonts), PDF.js worker scripts (`pdf.worker.min.mjs`), icons (`lucide-react`), and diagram libraries must be bundled locally inside the app binary.
- **User-Owned Local Storage:** Users choose a local folder on their Mac (e.g., `~/Documents/StudyVault`). Every update writes directly to plain, human-readable files on the local disk.

### 2.2 Seamless Document Import & Local PPT/PPTX/DOC/DOCX Conversion
1. Users can import `.pdf`, `.ppt`, `.pptx`, `.doc`, and `.docx` files via drag-and-drop onto the window or native macOS file picker (`Cmd+O`).
2. When importing a `.pdf`, copy it directly into the lecture bundle's `source/document.pdf`.
3. When importing `.ppt`, `.pptx`, `.doc`, or `.docx`:
   - Copy the original file into `source/original.<ext>`.
   - Run an asynchronous Rust conversion pipeline (`ConverterService` trait) with a non-blocking progress indicator in the UI:
     - **Primary Strategy (LibreOffice Headless CLI):** Check `/Applications/LibreOffice.app/Contents/MacOS/soffice` or `soffice` in `$PATH`. Execute:
       `soffice --headless --convert-to pdf --outdir <source_dir> <original_file>`
       using an isolated temporary user profile (`-env:UserInstallation=file:///tmp/...`) so multiple conversions never lock or conflict.
     - **Secondary Fallback (macOS Native AppleScript/JXA):** If LibreOffice is not installed, invoke `/usr/bin/osascript` to silently convert `.ppt`/`.pptx` via Apple Keynote or `.doc`/`.docx` via Apple Pages in the background.
     - **Actionable Diagnostic:** If neither converter is available on the system, display a clean in-app setup modal with a one-click copy/run command: `brew install --cask libreoffice`.

### 2.3 Side-by-Side Comprehension Workspace & On-Document Annotations
1. **Collapsible Vault Sidebar (`Cmd+B`):**
   - Displays all lecture bundles in the local vault with instant fuzzy search (`Cmd+P`) across lecture titles, Markdown notes, and highlighted PDF quotes.
   - Displays PDF page thumbnails and document outline/bookmarks for the active lecture.
2. **Left Split Pane — High-Speed Virtualized PDF & Slide Viewer:**
   - Virtualized continuous scroll and single-page/slide presentation modes, zoom controls (`Cmd++`, `Cmd+-`, Fit Width, Fit Page), and optional Dark Mode filter for late-night reading.
   - **Text Selection Highlights:** Select sentences on any PDF/slide to highlight in customizable semantic colors (Yellow = Key Concept, Green = Definition, Red = Exam/Important, Blue = Question).
   - **Area / Region Highlights:** Hold `Alt/Option` and drag a bounding box around slide diagrams, equations, or scanned regions.
   - **Direct On-Slide / Margin Text Boxes:** Select the Text Tool (`T`), click anywhere on a slide or margin, and type annotations directly on top of the document. Text boxes must be draggable, resizable, and persisted in `annotations.json`.
3. **Right Split Pane — Rich Academic Markdown Editor:**
   - Resizable split divider (`Cmd+\` to toggle focus/split modes: 50/50, 70/30, PDF-only, Notes-only).
   - Live preview / hybrid Markdown editing supporting:
     - Standard Markdown (headings, tables, task lists, code blocks with syntax highlighting).
     - **LaTeX Equations:** Inline `$f(x) = \int_{-\infty}^{\infty} \hat{f}(\xi) e^{2\pi i \xi x} d\xi$` and block `$$...$$` rendered instantaneously via KaTeX.
     - **Graphs & Architecture Diagrams:** Fenced ` ```mermaid ` blocks rendered into interactive SVG diagrams with an error boundary (invalid syntax shows a helpful inline syntax hint while typing, never crashing the view).
     - **Data Charts:** Fenced ` ```chart ` blocks accepting JSON config (`type: 'line' | 'bar' | 'scatter' | 'pie'`, `data`, `options`) rendered locally on HTML5 Canvas/SVG.
     - **Images & Screenshots:** Paste (`Cmd+V`) or drag-and-drop images directly into the editor; Rust backend automatically writes the image to `./assets/<timestamp>-<hash>.png` and inserts `![](assets/<filename>.png)`.

### 2.4 Bi-Directional Sentence & Region Deep-Linking
1. **PDF -> Notes Linking (`Cmd+L`):**
   - Selecting text or drawing an area box on a slide reveals a floating quick-action bar:
     `[ Color Swatches ] | [ + On-Slide Note ] | [ 🔗 Link to Notes (Cmd+L) ]`
   - Clicking **Link to Notes** saves the highlight in `annotations.json` and inserts a structured citation reference at the active cursor position in `notes.md`:
     ```markdown
     > 📌 **[Slide/Page 4](cite://hl-9f8a7b6c)**: *"Exact sentence or caption highlighted from the lecture..."*
     ```
2. **Notes -> PDF Instant Jump:**
   - Clicking any `cite://<id>` badge in the Markdown editor smoothly scrolls the PDF viewer to the target `pageNumber`, centers the normalized `boundingRect`, and triggers a 1.5-second high-contrast CSS pulse ring around the exact sentence or diagram on the slide.
3. **PDF -> Notes Reverse Lookup:**
   - Clicking the link indicator icon on any highlight inside the PDF scrolls the Markdown editor to the line referencing `cite://<id>` and highlights the note block.

---

## 3. Portable On-Disk Data Schema (Phase 2 iPad Ready)

Every lecture is stored as a self-contained directory bundle so it can be synced later to an iPad via local folders/Syncthing/iCloud Drive without database lock-in:

```text
StudyVault/
└── 2026-10-distributed-consensus/
    ├── manifest.json                  # Bundle metadata, taxonomy facets, sequence, source hashes
    ├── source/
    │   ├── original.pptx              # Original imported file (if converted)
    │   └── document.pdf               # Canonical PDF rendered by the viewer
    ├── notes.md                       # Standard Markdown with cite://<id> links, LaTeX, Mermaid, Charts
    ├── annotations.json               # Viewport-independent normalized coordinates
    └── assets/                        # Local images and pasted figures
```

> **Amended 2026-10-27 (agreed with the user).** `manifest.json` originally also held
> "last opened page/scroll state". It does not, because scroll position changes
> constantly and the manifest is a *synced* file: storing it there would rewrite a synced
> file on every scroll, pushing churn to every device and manufacturing exactly the
> conflicts the "no central index" decision exists to avoid.
>
> Per-device view state — last page, scroll offset, zoom, last-opened lecture — does not
> live in `manifest.json`. This also makes it *correct* for two devices to sit at
> different pages of the same lecture, which is what someone reading on an iPad and a
> laptop actually wants.
>
> **Corrected 2026-10-28 (agreed with the user).** The sentence above originally sent
> view state to "the rebuildable `.nexus/` cache ... which is never synced". Both halves
> were wrong.
>
> `.nexus/` sits *inside* the vault, so it syncs exactly when the vault syncs — calling it
> "never synced" was simply a mistake. And view state cannot be derived from a vault scan,
> so putting it in `.nexus/` would have quietly broken §3's rule that deleting `.nexus/`
> fully reconstructs: deleting it would have cost someone their place in every lecture.
>
> Per-device view state therefore lives **outside the vault**, in
> `~/Library/Application Support/Nexus/`, keyed to the vault it belongs to. It never
> syncs, under any sync client, because it is not in the synced tree at all. `.nexus/`
> keeps exactly one job: derived data that a scan can rebuild.
>
> Each device keeps its own place; "resume where you left off" does not follow you between
> Mac and iPad. Decided deliberately rather than by omission — the alternative needs a
> second, synced file and a reconciliation rule, and it buys a convenience neither device
> is worse off without.
>
> Rationale recorded in `PROGRESS.md`; the containing bundle format is otherwise
> unchanged.

### Viewport-Independent Coordinate Rule (CRITICAL)
Never store raw screen pixel coordinates (`px`). All coordinates in `annotations.json` MUST be normalized to `[0.0, 1.0]` relative to the unscaled PDF page width and height:
- `x_norm = x_px / page_width_px`
- `y_norm = y_px / page_height_px`
- `w_norm = width_px / page_width_px`
- `h_norm = height_px / page_height_px`

This guarantees that highlights, area boxes, and on-slide text annotations render at the exact same position across a 14" MacBook Pro, an external 4K monitor, and a future 11"/13" iPad Pro.

```json
{
  "schemaVersion": 1,
  "annotations": [
    {
      "kind": "textHighlight",
      "id": "hl-9f8a7b6c",
      "page": 4,
      "semantic": "key",
      "quote": "Raft achieves consensus via an elected leader.",
      "rects": [
        { "x": 0.142, "y": 0.285, "width": 0.612, "height": 0.032 }
      ],
      "createdAt": "2026-10-27T16:00:00Z",
      "updatedAt": "2026-10-27T16:00:00Z"
    }
  ]
}
```

> **Amended 2026-10-27 (five changes, each raised with the user).** The original example
> is kept below for comparison. The reasoning is in `PROGRESS.md`.
>
> 1. **`semantic` replaces `color`.** The original stored `"color": "#FACC15"`, which
>    contradicts §2.2 of this spec — where the four highlights are defined *semantically*
>    as "Yellow = Key Concept, Green = Definition, Red = Exam/Important, Blue = Question"
>    — and contradicts the locked palette in `CLAUDE.md` §3, which `#FACC15` is not part
>    of. Storing the hex loses the meaning (so "show me everything exam-relevant" becomes
>    a reverse colour lookup), freezes the palette into every file already saved, and
>    makes the required K/D/E/Q glyph underivable. One of `key` | `definition` | `exam` |
>    `question` is stored; colour is a UI token, which also lets the iPad app use its own.
> 2. **`kind` is a tag over per-kind fields, not a label on one wide record.** The
>    original gives every annotation every field, with `"freeText": null` on a highlight.
>    Nothing in that shape stops a file claiming `textHighlight` while carrying
>    `freeText` and no `rects`. Each kind now carries exactly its own fields, so the
>    contradictory record cannot be written down. `kind` values are camelCase, matching
>    every other key in the file.
> 3. **`boundingRect` is derived, not stored.** It is the union of `rects`, so keeping
>    both is two sources of one truth that will eventually disagree. Computed on read.
> 4. **`documentId` removed.** Nothing else in the format holds a document id, so there
>    was nothing to check it against. The real need behind it — noticing that a document
>    was reconverted and every rectangle now points somewhere slightly wrong — needs a
>    *hash*, not a random id, and that is the deferred `source` hash in `manifest.json`.
>    Pairing them is Milestone 2's job.
> 5. **`inkStrokes` removed.** Declared as `[]` and then never mentioned again in this
>    spec — no feature, no shortcut, no test. An always-empty array reads as working
>    while nothing fills it. Deferred until Apple Pencil is an actual requirement, which
>    is a Phase 2 iPad question.
>
> Also pinned, because the spec never said it outright: **pages are numbered from 1**,
> matching `[Slide/Page 4]` beside `"pageNumber": 4` and the "Page 2" of §7. The key is
> now `page`, and 0 is refused rather than guessed at.
>
> <details><summary>Original wording</summary>
>
> ```json
> {
>   "schemaVersion": 1,
>   "documentId": "doc-uuid-1234",
>   "annotations": [
>     {
>       "id": "hl-9f8a7b6c",
>       "kind": "text_highlight",
>       "pageNumber": 4,
>       "color": "#FACC15",
>       "quotedText": "Raft achieves consensus via an elected leader.",
>       "boundingRect": { "x": 0.142, "y": 0.285, "width": 0.612, "height": 0.032 },
>       "rects": [
>         { "x": 0.142, "y": 0.285, "width": 0.612, "height": 0.032 }
>       ],
>       "freeText": null,
>       "createdAt": "2026-10-27T16:00:00Z",
>       "updatedAt": "2026-10-27T16:00:00Z"
>     }
>   ],
>   "inkStrokes": []
> }
> ```
>
> </details>

---

## 4. Software Engineering & Code Quality Standards (For Easy Bug Fixing)

You MUST enforce these architectural and code-quality rules from the first commit:

### 4.1 Clean Modular Architecture & Separation of Concerns
Organize the repository into strict, decoupled layers so bugs can be isolated to a single file/layer:
```text
├── crates/
│   ├── lecture-core/          # Pure Rust domain logic (ZERO Tauri/UI dependencies)
│   │   ├── src/
│   │   │   ├── domain/        # Entities: LectureBundle, Annotation, NormalizedRect, Citation
│   │   │   ├── ports/         # Traits: StoragePort, DocumentConverterPort
│   │   │   ├── services/      # VaultService, ConversionService, CitationIndexService
│   │   │   ├── storage/       # AtomicFsStorage (temp-file + rename), path sanitization
│   │   │   └── error.rs       # Typed CoreError enum via `thiserror`
│   └── src-tauri/             # Thin Tauri IPC adapter layer + macOS native menus/shortcuts
├── src/                       # TypeScript + React Frontend
│   ├── core/                  # Pure TS domain math (coordinate transforms, citation parser, Zod schemas)
│   ├── services/              # Typed IPC client wrapper (with mock adapter for browser/Vitest testing)
│   ├── state/                 # Zustand stores (vaultStore, workspaceStore, annotationStore, undoStore)
│   ├── features/
│   │   ├── pdf-viewer/        # Virtualized PDF canvas, SVG overlay, text-box tool, selection popover
│   │   ├── markdown-editor/   # CodeMirror 6 + KaTeX + Mermaid + Chart.js + Citation badge widgets
│   │   └── vault-sidebar/     # Lecture switcher, import dropzone, conversion status toast
│   └── components/ui/         # Reusable, accessible UI primitives
└── tests/                     # E2E Playwright behavioral test suites & sample fixture files
```

### 4.2 Defensive Coding, Error Handling & Observability
1. **No Panics or Silent Failures in Rust:**
   - Enable `#![forbid(unsafe_code)]` and `#![warn(clippy::all, clippy::pedantic)]`.
   - **BANNED in production code:** `.unwrap()`, `.expect()` (outside tests), and `panic!()`.
   - Every fallible function must return `Result<T, CoreError>` using `thiserror` with machine-readable error codes (`ERR_CONVERTER_NOT_FOUND`, `ERR_INVALID_COORDINATE`, `ERR_ATOMIC_WRITE_FAILED`, `ERR_CORRUPT_ANNOTATION_SCHEMA`) and clear user-facing remediation messages.
2. **Atomic File Writes (Zero Data Corruption):**
   - Never write directly over `notes.md` or `annotations.json` in place. Always write to `<filename>.tmp.<uuid>`, call `sync_all()` to flush to disk, and atomically `fs::rename` over the target file.
3. **Strict TypeScript Configuration:**
   - `tsconfig.json` MUST enable: `"strict": true`, `"noUncheckedIndexedAccess": true`, `"exactOptionalPropertyTypes": true`, `"noImplicitReturns": true`, `"noFallthroughCasesInSwitch": true`.
   - **BANNED:** `any` types and non-null assertions (`!`).
   - Validate all disk JSON payloads at runtime with `Zod` schemas so corrupted or manually edited files never crash the UI.
4. **Structured Local Logging & Diagnostics:**
   - Use `tracing` and `tracing-appender` in Rust to write structured JSON/text logs to a rotating local log file (`~/Library/Logs/LectureVault/app.log`).
   - Add a built-in **"View Diagnostic Logs"** button in the UI (`Cmd+Shift+D`) that shows recent errors, conversion CLI stdout/stderr, and performance timings so any future bug can be diagnosed in seconds.
5. **File Size & Complexity Cap:**
   - Keep individual source files under **300 lines of code**. If a component or service exceeds 300 lines, refactor it into focused sub-modules.

---

## 5. Comprehensive Automated Testing Requirements

Every feature and bug-prone boundary MUST have automated tests. Do not advance between milestones until all tests pass.

### 5.1 Rust Unit & Integration Tests (`cargo test`)
Write deterministic tests inside `crates/lecture-core` using `tempfile::TempDir`:
1. **Coordinate Validation Tests:** Verify `NormalizedRect` rejects out-of-bounds (`< 0.0` or `> 1.0`), `NaN`, or negative width/height values.
2. **Atomic Persistence & Crash Safety Tests:** Verify concurrent/rapid saves of `notes.md` and `annotations.json` never leave partial/corrupted JSON on disk and automatically create a `.bak` backup if schema parsing fails.
3. **Document Converter Pipeline Tests:**
   - Use a mock `DocumentConverterPort` to test conversion state transitions (`Queued -> Converting -> Ready` and `Failed` error propagation).
   - Include an integration test that converts a real minimal fixture `.pptx` and `.docx` to `.pdf` when LibreOffice is available.
4. **Security & Path Traversal Tests:** Verify lecture slugs and pasted asset filenames sanitize `../`, null bytes, and macOS reserved characters.

### 5.2 Frontend Unit & Component Tests (`Vitest` + `@testing-library/react`)
1. **Coordinate Math & Zoom Invariance (`src/core/__tests__/coordinates.test.ts`):**
   - Property-based / parameterized tests proving `screenToNormalized(normalizedToScreen(rect, viewport), viewport) === rect` across zoom levels (`0.5x`, `1.0x`, `1.75x`, `3.0x`) and page dimensions.
2. **Citation Parser & Markdown Linker (`src/core/__tests__/citations.test.ts`):**
   - Test inserting `cite://<id>` into Markdown text at arbitrary cursor offsets, extracting all linked annotation IDs from a Markdown document, and gracefully handling orphaned links when an annotation is deleted.
3. **Rich Block Error Boundary Tests (`src/features/markdown-editor/__tests__/`):**
   - Verify valid LaTeX (`$E=mc^2$`), Mermaid (`graph TD; A-->B;`), and Chart JSON blocks render properly.
   - Verify *malformed* LaTeX, incomplete Mermaid syntax, or invalid Chart JSON displays a clean inline warning banner without unmounting the editor or losing cursor focus.

### 5.3 End-to-End Behavioral Tests (`Playwright`)
Configure Playwright to run against the app UI (using a clean temporary vault fixture) to verify full user workflows:
1. **Journey 1 — Import & View:** Import a multi-page sample PDF -> verify pages render -> verify `manifest.json`, `notes.md`, and `annotations.json` are created on disk.
2. **Journey 2 — Highlight & Deep Link:** Select text on Page 2 -> click "Link to Notes" -> verify highlight renders in SVG overlay -> verify `cite://<id>` badge appears in the Markdown editor -> scroll PDF back to Page 1 -> click `cite://<id>` badge in Markdown -> verify PDF scrolls back to Page 2 and pulses the highlight.
3. **Journey 3 — On-Slide Text Box Annotation:** Activate Text Box tool -> click on slide at `(x, y)` -> type `"Important exam formula"` -> reload workspace -> verify text box persists at exact normalized position.
4. **Journey 4 — Rich Notes & Local Image Paste:** Type Markdown with `$$\nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}$$`, a `mermaid` block, and a `chart` block -> paste a mock PNG image -> verify asset is saved to `./assets/` and all rich blocks render offline.

---

## 6. Step-by-Step Implementation Plan for Claude Code

Execute the build in the following 5 sequential milestones. After completing each milestone, run all linters, typechecks, and automated tests before moving to the next:

- **Milestone 1: Rust Workspace, Core Domain & Atomic Storage Engine**
  - Scaffold Tauri v2 + React + TypeScript + Vite project with a Cargo workspace (`crates/lecture-core` + `crates/src-tauri`).
  - Implement `LectureBundle`, `Annotation`, `NormalizedRect`, atomic file read/write, structured `tracing` logs, and all Rust unit tests (`cargo test && cargo clippy`).
- **Milestone 2: Local Document Importer & PPTX/DOCX-to-PDF Converter**
  - Implement `ConverterService` (LibreOffice headless CLI + macOS AppleScript fallback + setup diagnostic UI).
  - Build the Vault Sidebar, drag-and-drop import flow, and Rust integration tests.
- **Milestone 3: High-Performance Virtualized PDF Viewer & Annotation Overlay**
  - Integrate bundled offline `pdfjs-dist` with virtualized page rendering.
  - Implement normalized coordinate math (`[0.0, 1.0]`), text highlights, area highlights, and draggable on-slide text boxes with Undo/Redo support (`Cmd+Z` / `Cmd+Shift+Z`).
  - Run `vitest` on coordinate transformation and overlay state stores.
- **Milestone 4: Rich Academic Markdown Editor & Bi-Directional Citation Engine**
  - Implement the split-pane CodeMirror 6 + Live Preview editor with offline KaTeX, Mermaid.js, declarative Chart.js blocks, and local clipboard image saving.
  - Connect the bi-directional `cite://<id>` controller (PDF <-> Markdown scroll & pulse animation).
  - Run `vitest` component and citation parser tests.
- **Milestone 5: macOS Polish, Diagnostics Drawer & Playwright E2E Suite**
  - Add native-feeling macOS keyboard shortcuts (`Cmd+O`, `Cmd+L`, `Cmd+B`, `Cmd+P`, `Cmd+\`, `Cmd+Shift+D`), dark mode, and the Diagnostic Log viewer.
  - Run the full Playwright E2E test suite, `cargo test`, `cargo clippy`, `npm run typecheck`, and `npm run test` to confirm zero warnings and 100% green tests.

---

## First Action
Inspect the current workspace, initialize the project structure defined in Section 4.1, and begin **Milestone 1**. Show me the Cargo workspace setup and the `lecture-core` domain + test results when Milestone 1 is complete.

