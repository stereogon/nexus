# Nexus — Progress

Working log. Updated in the same change that completes the work, never retroactively.
Governing values and binding constraints: [`CLAUDE.md`](./CLAUDE.md).
Requirements: [`claude-spec.md`](./claude-spec.md).

**Status:** Milestone 1 in progress. Workspace builds, `cargo test` and
`cargo clippy -D warnings` green, core crate verified compiling for iPadOS.
**Last updated:** 2026-10-27

---

## 1. Milestones

Legend: `[ ]` not started · `[~]` in progress · `[x]` done and verified · `[!]` blocked

### [x] Milestone 0 — Repository foundation
- [x] `CLAUDE.md` — shared values, ask-first protocol, locked decisions
- [x] `PROGRESS.md` — this file
- [x] `git init` + `.gitignore` (branch `main`, no remote, no commits yet)
- [x] Dependency versions resolved from crates.io / npm registries, not from memory

### [~] Milestone 1 — Rust workspace, core domain, atomic storage
- [x] Cargo workspace with inherited dependency versions and workspace lints:
      `unsafe_code` forbidden; `unwrap` / `expect` / `panic` / `todo` /
      `unimplemented` / `indexing_slicing` **denied**, so §4 of `CLAUDE.md` is
      enforced by the compiler rather than by review
- [x] `NormalizedRect` — validated on construction **and** on deserialize, so a
      hand-edited `annotations.json` cannot yield a misplaced highlight (16 tests)
- [x] `lecture-core` verified compiling for `aarch64-apple-ios` locally
- [~] `CoreError` (`thiserror`) — `code()` + `remediation()` established; variants are
      added as the code that raises them lands, so the enum never over-promises
- [x] `OrderKey` (fractional index) — integer part keeps appends compact, fraction
      handles inserts between neighbours; validated on construction and on deserialize
      (16 tests, including 1000 appends, 1000 prepends and 300 inserts into one gap)
- [ ] Domain: `LectureBundle`, `Annotation`, `Citation`, `Taxonomy`, `Facets`, `BundleRef`
- [ ] `AtomicFsStorage` — temp → `sync_all` → `rename`; `.bak` on parse failure
- [x] `Slug` — one safe path segment. Rejects separators, control and invisible
      characters, Windows device names, leading dots/hyphens, trailing dots and spaces;
      normalises to NFC (never NFKC — see decision log); 200-byte cap so atomic staging
      paths stay legal. `from_title` derives a tidy slug from a human title. 17 tests.
- [ ] Multi-segment path containment: depth cap 5, `..` refused outright, symlink
      refusal, canonicalised under the vault root — **next substep**
- [ ] Vault walk — prunes at first `manifest.json`; rejects nested lectures
- [ ] `schemaVersion` 1 → 2 migration
- [ ] `tracing` + `tracing-appender` to `~/Library/Logs/LectureVault/app.log`
- [ ] `aarch64-apple-ios` target check wired into CI
- [ ] Tests: coordinate validation, atomic/crash safety, order-key invariants, path
      traversal, index rebuild-from-scan, bundle-move link integrity
- [ ] `cargo fmt --check` + `cargo test` + `cargo clippy -D warnings` green

### [ ] Milestone 2 — Importer and PPTX/DOCX→PDF converter
- [ ] `DocumentConverterPort` trait + state machine (`Queued → Converting → Ready |
      Failed | Unavailable`)
- [ ] macOS adapter: Keynote/Pages via `osascript`, LibreOffice CLI preferred when present
- [ ] `source.conversion` provenance written to `manifest.json`
- [ ] Setup diagnostic UI (no hard dependency on any converter)
- [ ] Vault sidebar, drag-and-drop import, facet grouping
- [ ] Import path templates + "Reorganize Vault" with dry-run preview
- [ ] Tests: mock converter transitions, real `.pptx`/`.docx` fixtures (`#[ignore]`-gated —
      LibreOffice is absent on this machine; see §3)

### [ ] Milestone 3 — Virtualised PDF viewer and annotation overlay
- [ ] Bundled offline `pdfjs-dist`, virtualised pages (visible + 2-page buffer)
- [ ] Normalised coordinate math against `getViewport({scale: 1})`, rotation-aware
- [ ] Text highlights, area highlights, draggable/resizable on-slide text boxes
- [ ] Undo/redo
- [ ] Vitest: round-trip invariance across 0.5× / 1.0× / 1.75× / 3.0×

### [ ] Milestone 4 — Markdown editor and bi-directional citations
- [ ] CodeMirror 6 split pane, hybrid live preview
- [ ] Offline KaTeX, Mermaid, declarative `chart` blocks, each with an error boundary that
      keeps the editor mounted
- [ ] Clipboard image → `assets/<timestamp>-<hash>.png`
- [ ] `cite://<id>` controller both directions, with pulse ring
- [ ] Vitest: citation parser, orphaned-link handling, malformed-block banners

### [ ] Milestone 5 — macOS polish, diagnostics, E2E
- [ ] Shortcuts: `⌘O` `⌘L` `⌘B` `⌘P` `⌘\` `⌘⇧D` `⌘+` `⌘-` `⌘Z` `⌘⇧Z` `T`
- [ ] Diagnostics drawer (errors, converter stdout/stderr, timings)
- [ ] Bundled woff2 fonts, CSP locked to `connect-src 'self' ipc: http://ipc.localhost`
- [ ] Playwright journeys 1–4
- [ ] Full suite green, zero warnings

---

## 2. Decision log

Chronological. Each entry records what was decided and why, so it is not silently undone.

**2026-10-27 · Vault organisation is facet-based, not folder-only**
A single folder hierarchy can express only one taxonomy; module-primary and week-primary
users both exist, and the same person wants both at different times. Folders stay physical
and human-readable; taxonomy facets in `manifest.json` drive runtime grouping.

**2026-10-27 · Arbitrary nesting (≤5), `01-` prefixes maintained**
Chosen over a fixed 3-level shape and over a flat metadata-only vault. A lecture is any
directory containing `manifest.json`.

**2026-10-27 · `sequence` authoritative, folder prefix derived**
Prefixes and order keys are two representations of one fact, so one must win. Order keys
survive Syncthing arrivals and interrupted renumbers; the prefix is cosmetic-but-maintained.
Fractional keys mean inserting between siblings rewrites one manifest, not N.

**2026-10-27 · No central index as source of truth**
A top-level `vault.json` would be rewritten by every device that reorders, producing sync
conflicts. Per-bundle manifests confine edits. `.nexus/` is a cache with a
rebuild-equivalence test.

**2026-10-27 · LibreOffice demoted from requirement to optional adapter**
Conversion is an import-step, not a view-step, so the iPad only ever receives the resulting
PDF and needs no converter. Neither LibreOffice nor `osascript` is portable to iPadOS, so
neither could ever have been core. Pure-Rust OOXML rendering was considered and rejected:
parsing is tractable, faithful layout is not, and a subtly wrong render of study material is
worse than an honest "convert this on your Mac".

**2026-10-27 · PDF stays canonical**
It is the one format both macOS (`pdfjs`) and iPadOS (`PDFKit`) render natively and for
free. It is the enabler of the iPad plan, not an obstacle to it.

**2026-10-27 · Portability rule + CI enforcement**
No desktop-only capability may be a dependency of `lecture-core`; it compiles for
`aarch64-apple-ios` from day one, checked in CI so a violation breaks the build rather than
being discovered in Phase 2.

**2026-10-27 · No dark-mode PDF inversion**
Inverting a document corrupts content whose colour carries meaning — photographs, red-means-
failure diagrams, scans. The page stays light on a dark bed. Side effect: one set of
highlight alphas instead of two, and annotations look identical in both themes and on iPad.

**2026-10-27 · Brand accent is raspberry magenta `#BE1A72` / `#FF72C6`**
Yellow, green, red and blue are claimed internally by highlight semantics. Violet is
Obsidian's (and OneNote's), and Obsidian is the closest adjacent tool. Magenta is the one
hue both unclaimed in this product space and outside the semantic set. The light value is
deep because magenta is intrinsically high-luminance; brighter variants failed 4.5:1.

**2026-10-27 · `cargo fmt --check` added to the definition of done**
The tree was not rustfmt-clean, and the first run of the check turned up a misindented
doc comment in `order_key/mod.rs` that four green test runs had not. Formatting is the
cheapest class of thing to enforce mechanically, so it is now in `CLAUDE.md` §5 rather
than left to whoever is reading the diff.

**2026-10-27 · Names are normalised NFC, never NFKC**
NFKC folds compatibility characters, and some fold *into* ASCII punctuation: U+FF0F
FULLWIDTH SOLIDUS becomes a plain `/`. Normalising with NFKC would therefore manufacture
a path separator out of a name that contained none — a directory-traversal vector created
by the very step meant to make the name safe. NFC does not do this. Validation also runs
strictly *after* normalisation, so nothing normalisation produces can bypass a check.
There is a test named for this specifically, because it would be a vulnerability if it
regressed and the ordinary tests would still pass.

**2026-10-27 · Added `unicode-normalization` (and `tinyvec` transitively)**
HFS+ normalises filenames to NFD, APFS preserves what it is handed, and iCloud and
Syncthing have both been inconsistent about it. Without normalisation a lecture folder
named `Café` created on one device becomes a *second*, distinct folder on another once
the vault syncs — silent duplication, in the one place this app must not be careless.
`std` has no normalisation, so this cannot be done without a dependency. Licences
verified from `cargo metadata`, not from memory: `unicode-normalization` is
`(MIT OR Apache-2.0) AND Unicode-3.0`, `tinyvec` is `Zlib OR Apache-2.0 OR MIT`. Both are
distribution-compatible; the `Unicode-3.0` term requires an attribution notice to be
shipped, which the existing `unicode-ident` already obliges us to do.

**2026-10-27 · Slug names are capped at 200 bytes, not 255**
APFS and HFS+ allow 255 bytes per name, but atomic saving stages work at
`<name>.tmp.<uuid>`, which adds 41 bytes, and recovery adds `.bak`. A 255-byte name would
pass validation and then fail at *save* time — the worst possible moment, with the
person's unsaved work in the balance. Capping the name instead means the staging path is
legal by construction. A test asserts the arithmetic rather than trusting the comment.

**2026-10-27 · Stricter than macOS requires, on purpose**
`Slug` refuses Windows reserved device names (`con`, `nul`, `com1`…), the Windows/exFAT
forbidden character set, and trailing dots and spaces — all of which are perfectly legal
on APFS. The vault is built to sync, and a name that is legal here but illegal on the
other device syncs successfully and then fails to materialise, which reads as data loss.
`Slug` also refuses invisible characters (RTL overrides, zero-width joiners, a BOM):
those are legal filenames but let one lecture impersonate another in the sidebar.

**2026-10-27 · Order keys carry an integer part, not a bare fraction**
A purely fractional key is far simpler, but every append halves the remaining gap, so
keys grow about one character per six appends — hundreds of characters over a long
course, written into every manifest. Appending is the commonest operation by a wide
margin (import lecture 1, then 2, then 3), so the simple version degrades precisely
where it is used most. The integer part makes an append an integer increment: a test
asserts 1000 sequential appends keep every key to 4 characters or fewer. Ported from
Greenspan's "Implementing Fractional Indexing" and kept structurally close to that
reference so the two can be diffed by eye.

**2026-10-27 · Generated order keys are re-validated before being returned**
`OrderKey::between` parses its own output. It costs one cheap pass and converts any
future defect in that module into a refused insert rather than a malformed key written
into a vault — and then synced to the user's other devices, where it would be much
harder to undo.

**2026-10-27 · TypeScript 6.0.3, not 7.0.2**
`typescript-eslint@8.72.1` declares `typescript: ">=4.8.4 <6.1.0"`, so it cannot read TS 7
(the native compiler rewrite). Typed ESLint rules are the mechanism that *enforces*
`CLAUDE.md`'s ban on `any`, `!` and `@ts-ignore`; without them those bans are
honour-system. Chose the enforceable standard over the newer compiler. **Revisit when
`typescript-eslint` supports TS 7.**

**2026-10-27 · `crates/src-tauri` deferred to Milestone 2**
Milestone 1's deliverable is pure domain logic. Declaring the Tauri crate now would pull
its whole dependency tree and an icon-asset build requirement into a milestone that needs
neither, so a domain-logic test failure could be masked by unrelated build friction. The
adapter lands with the first feature that actually needs IPC. Sequencing, not omission.

**2026-10-27 · Caret ranges in `Cargo.toml`, exact pins in `package.json`**
Cargo already guarantees reproducibility through the committed `Cargo.lock`, and
`=`-pinning a manifest breaks transitive version unification without adding anything.
npm has no equivalent unification concern, so exact pins there are free.

**2026-10-27 · Validation on deserialize, not only on construction**
`#[derive(Deserialize)]` on a validated type hands out unvalidated values from any JSON
file — the invariant would hold for code paths and not for files, which is the half that
matters for an app whose data lives in plain user-editable files. Validated types
deserialize through a private raw struct via `#[serde(try_from = ...)]`. There is a test
asserting a corrupt rectangle is rejected on read.

**2026-10-27 · Four typefaces split by function**
Bricolage Grotesque (brand), IBM Plex Sans (UI), Literata (notes prose), IBM Plex Mono
(code/paths). The serif in the editor distinguishes "your writing" from "app chrome" and
from the document pane. All OFL, so all bundleable offline.

---

## 3. Environment facts

Verified on 2026-10-27 on this machine.

| | |
|---|---|
| Platform | macOS (Darwin 27.0.0), Apple Silicon `arm64` |
| Rust | `rustc` 1.97.0 · `cargo` 1.97.0 |
| Node | v26.5.0 · npm 11.17.0 |
| `cargo tauri` CLI | **not installed** |
| LibreOffice | **not installed** (`/Applications/LibreOffice.app` absent, not on `$PATH`) |
| Xcode | Command Line Tools only — no full Xcode |
| git repo | **no** — repository not yet initialised |

Consequences:
- The converter's LibreOffice path cannot be integration-tested here. Those tests are
  `#[ignore]`-gated with a comment, and the Keynote/Pages fallback plus the
  `ERR_CONVERTER_NOT_FOUND` diagnostic path are the ones exercised by default.
- Full Xcode is not needed for Milestones 1–4. It becomes relevant for signing/notarisation
  and for Phase 2 iPad work.

---

## 4. Open questions and blockers

### Resolved
All four Milestone 1 blockers were approved and actioned on 2026-10-27: `git init`,
dependency fetching, `rustup target add aarch64-apple-ios`, and registry read access.
Commits happen at each complete, verified substep (widened from milestone boundaries on
the user's instruction, 2026-10-27), local only, never pushed without being asked.

### Still to decide
- **Frontend dependency set.** The Rust side is underway; `npm install` has not been run
  yet. Intent is to install only what Milestones 1–2 need (React, Vite, TypeScript 6,
  Vitest, Zod, ESLint + typescript-eslint, Tauri API/CLI) and add `pdfjs-dist`,
  CodeMirror, KaTeX, Mermaid and Chart.js in the milestones that use them, rather than
  installing the whole stack up front.

- **Third-party notices file.** Two crates in the tree carry the `Unicode-3.0` term,
  which is attribution-only but does require a notice to ship with the binary. Nothing
  generates one yet. Belongs with the `cargo deny` work so it is produced from the real
  dependency tree rather than maintained by hand.

### Design questions still open
- **Page thumbnails.** §2.3 asks for them in the sidebar, but the sidebar already carries
  the vault tree and facet switcher. Proposal: a toggleable rail on the viewer's left edge
  instead. Not yet decided or drawn.

### Gaps in the spec, noted but deliberately out of scope for now
- No lecture deletion / archival / trash flow.
- No cross-lecture note search beyond `⌘P`; no backlinks between lectures.
- One PDF per bundle assumed — no slides + paper + problem set in one lecture.
- No export (PDF/HTML/annotated print).

---

## 5. Licences

Fonts, all SIL OFL 1.1 and therefore bundleable into a distributed binary:
Bricolage Grotesque, IBM Plex Sans, IBM Plex Mono, Literata.

Rust dependencies in use, with the version resolved on 2026-10-27:

| Crate | Version | Licence | Why |
|---|---|---|---|
| `thiserror` | 2.0.21 | MIT OR Apache-2.0 | typed error enums with codes |
| `serde` | 1.0.229 | MIT OR Apache-2.0 | bundle files are plain JSON |
| `serde_json` | 1.0.154 | MIT OR Apache-2.0 | dev-dependency only, so far |
| `unicode-normalization` | 0.1.26 | (MIT OR Apache-2.0) AND Unicode-3.0 | NFC for names written to disk, so one lecture is one folder across devices |

Full resolved tree, read from `cargo metadata` on 2026-10-27 (not from memory):

| Crate | Version | Licence |
|---|---|---|
| `itoa` | 1.0.18 | MIT OR Apache-2.0 |
| `memchr` | 2.8.3 | Unlicense OR MIT |
| `proc-macro2` | 1.0.107 | MIT OR Apache-2.0 |
| `quote` | 1.0.47 | MIT OR Apache-2.0 |
| `serde_core` | 1.0.229 | MIT OR Apache-2.0 |
| `serde_derive` | 1.0.229 | MIT OR Apache-2.0 |
| `syn` | 3.0.9 | MIT OR Apache-2.0 |
| `thiserror-impl` | 2.0.21 | MIT OR Apache-2.0 |
| `tinyvec` | 1.13.3 | Zlib OR Apache-2.0 OR MIT |
| `unicode-ident` | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 |
| `unicode-normalization` | 0.1.26 | (MIT OR Apache-2.0) AND Unicode-3.0 |
| `zmij` | 1.0.23 | MIT |

All permissive and compatible with distributing a binary. `unicode-ident` and
`unicode-normalization` carry an additional term (Unicode-3.0, attribution-only), so the
shipped app must include a notices file; that is an open task, listed in §4.
`lecture-core` itself is MIT.

To be re-checked with `cargo deny` once the dependency set settles — the point of that
tool being that this table should never again be written by hand.
