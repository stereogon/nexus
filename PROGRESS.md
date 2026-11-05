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
- [x] `Timestamp` — one canonical stored form (`YYYY-MM-DDTHH:MM:SSZ`, UTC, whole
      seconds), so byte order equals chronological order and sorting needs no date
      library. Hand-written Gregorian arithmetic (Hinnant's `civil_from_days`), verified
      against `date -u -r` over 20,000 instants spanning 1930–2129 with zero mismatches;
      boundary vectors pinned in the suite. 14 tests.
- [x] First port: `Clock` in `lecture-core::ports`, with `FixedClock` for deterministic
      tests and `SystemClock` in `lecture-fs`. Establishes the shape
      `DocumentConverterPort` follows in Milestone 2.
- [x] `Label` — validated, normalised display text (NFC, trimmed, inner whitespace
      collapsed) so two values that look identical group as one facet rather than two.
      18 tests shared with `Facets`.
- [x] `Facets` — `course`/`module`/`week`/`tags` plus an open `custom` map. Tags are a
      sorted set; `custom` is a `BTreeMap` so bytes are deterministic. Unknown fields
      denied.
- [x] `VaultRelativePath` renamed `RelativePath`, since the manifest holds
      *bundle*-relative paths (`source/document.pdf`) and the type never assumed the
      vault — `join_onto` always took the base. Error variants and codes renamed to
      match before anything ships.
- [x] `Manifest` + `Source`/`Conversion` — title, authoritative `sequence`, facets, and
      conversion provenance. Cross-field invariants enforced through a raw-struct
      `try_from`, so a hand-edited file cannot produce an incoherent manifest in memory.
      17 tests.
- [x] `ManifestStore` in `lecture-fs` — pretty-printed deterministic JSON through the
      atomic write path; holds the clock so a save cannot forget to stamp the change
      time. 12 tests.
- [x] `.bak` has its first real caller: a corrupt manifest is copied aside, a manifest
      from a newer schema version is left strictly untouched.
- [x] Source fingerprints in the manifest — done 2026-10-28 as the first substep of
      Milestone 2. `schemaVersion` is now 2, and version 1 is still read and upgraded.
      Named a *fingerprint*, not a hash; spec amended. 24 new tests.
- [x] `Annotation` + `AnnotationSet` — the three annotation kinds as a tagged enum,
      with `AnnotationId`, `PageNumber`, `Excerpt` and `HighlightSemantic`. Five
      departures from the spec's example, all amended there. 21 tests.
- [x] `Citation` + `CitationIndex` — scans `cite://<id>` out of Markdown, skipping
      fenced and inline code so an example is never mistaken for a link. Resolves
      against an `AnnotationSet` into orphans (reported, never repaired) and unlinked
      highlights. 21 tests.
- [x] `LectureBundle` + `BundleRef` — a lecture's location plus its manifest, and the
      small projection the sidebar groups and orders on. Derives every in-bundle path,
      and the locked "moving a bundle rewrites nothing" decision now has the test §3
      asks for by name. 11 tests.
- [x] **Depth-cap bug fixed** — `MAX_BUNDLE_DEPTH` (organisational nesting, 5) split
      from `MAX_DEPTH` (total path segments, 8). See the decision log.
- [x] Vault walk — `scan_vault` behind a new `VaultDirectory` port, so the rules live in
      the domain and the tests need no filesystem. Prunes at the first `manifest.json`,
      enforces `MAX_BUNDLE_DEPTH`, and **reports** rather than omits: an unusable folder
      name, a folder nested past the cap, an unreadable directory, and a lecture buried
      inside another lecture. 16 tests against an in-memory tree.
- [x] `FsVaultDirectory` + `VaultLoader` in `lecture-fs` — the walk against a real
      filesystem, composed with `ManifestStore` so a scan becomes loaded bundles. One
      corrupt manifest costs that lecture and nothing else. 10 tests on real
      directories, including real symlinks.
- [x] `.nexus/index.json` — the rebuildable cache, never trusted: it exists for a fast
      first paint and the scan always overrides it. `CLAUDE.md` §3's "deleting `.nexus/`
      must fully reconstruct" is now an executable test, and a byte-identical one.
- [x] `ViewState` domain types — `Zoom`, `PageOffset`, `LectureView`, and pruning against
      a scan so the file cannot grow forever. 15 tests.
- [x] `DeviceStateStore` in `lecture-fs` — `~/Library/Application Support/Nexus/vaults/
      <key>/view-state.json`, with the base directory injectable so no test touches the
      real `~/Library`. 10 tests, one asserting the vault is left completely untouched.
- [x] Renumber **planning** — `plan_renumber` projects `sequence` onto `NN-` prefixes,
      ordering renames so each target is free and breaking a cycle with one temporary
      name. 14 tests, including a simulator that proves no rename ever collides.
- [x] Renumber **application** — `VaultRenumber` plans from real manifests and applies
      the renames through a non-clobbering `AtomicFsStorage::rename`, reporting where each
      lecture went so a reading position can follow it. 12 tests on real directories.
- [x] The log's privacy contract — `CoreError::log_digest`, one shared `fingerprint`,
      and a test asserting no error variant can put what someone named into a log line.
- [x] `tracing` to `~/Library/Logs/Nexus/app.log` — daily rotation, typed events, and
      logging wired into the four places that previously discarded an error in silence.
- [ ] `schemaVersion` migration machinery (lands with the first real migration in M2)
- [ ] `.nexus/` rebuildable cache *(corrected 2026-10-28: this read "including per-device
      view state", which §3 forbids outright — per-device state cannot live in `.nexus/`,
      because deleting `.nexus/` has to lose nothing. The view state was never in scope for
      this item; it lives in `~/Library/Application Support/Nexus/`, and the part of it that
      names the last-opened vault now exists.)*
- [x] `AnnotationStore` — the atomic load/save path for `annotations.json`. A missing
      file loads as an empty set (the normal state of a freshly imported lecture) while
      an unreadable one is an error, so a corrupt file can never read back as "no
      highlights" and then be overwritten. 11 tests.
- [x] The corrupt-versus-newer asymmetry extracted into `lecture-fs::versioned`, so it
      exists once for both `manifest.json` and `annotations.json` rather than once per
      file type.
- [x] TypeScript toolchain: `tsconfig.json` with all five flags from §4, flat ESLint
      config enforcing the four bans mechanically (each one verified to fire), and the
      Zod schemas for `manifest.json` and `annotations.json`. 21 tests.
- [x] **Wire-format fixtures** — `fixtures/*.json` pin the on-disk shape, and both
      languages are held to them, so the Rust types and the Zod schemas cannot drift
      apart silently. 3 Rust tests + the TypeScript suite.
- [x] §5's full gate runs green in both languages for the first time: `cargo fmt
      --check`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `npm run
      typecheck`, `npm run lint`, `npm run test`.
- [x] `Slug` — one safe path segment. Rejects separators, control and invisible
      characters, Windows device names, leading dots/hyphens, trailing dots and spaces;
      normalises to NFC (never NFKC — see decision log); 200-byte cap so atomic staging
      paths stay legal. `from_title` derives a tidy slug from a human title. 17 tests.
- [x] `VaultRelativePath` — **lexical** containment: relative only, no empty segments,
      every segment a `Slug` (so `.`/`..`/separators cannot occur), depth capped at 5,
      non-emptiness structural. `join_onto` is pure, so a not-yet-created bundle can be
      located before it exists. 17 tests, including a containment property over hostile
      inputs with a guard against passing vacuously.
- [x] New crate `crates/lecture-fs` — the desktop filesystem adapter. Deliberately not
      required to compile for iOS; the iPadOS companion gets its own adapter because
      iCloud needs `NSFileCoordinator` rather than `rename`.
- [x] **Filesystem** containment: `VaultRoot::open` canonicalises the root (so a
      symlinked *root* is allowed — the user's own choice), `VaultRoot::resolve` walks
      the existing prefix refusing any symlinked component, then re-checks containment
      against the canonical filesystem. Hands back a `ResolvedPath` with no public
      constructor, so writes can demand proof rather than trust a caller. 13 tests
      against real temp directories, including escape-outward, alias-inward, mid-path
      and dangling links.
- [x] `AtomicFsStorage` — staging file → `write_all` → `sync_all` → `rename` → parent
      directory flush. Takes `VaultRelativePath`, so containment is re-checked inside
      every call and cannot be skipped. `read` uses `O_NOFOLLOW`. `back_up` preserves an
      unreadable file as `.bak`, itself written atomically. RAII guard removes the
      staging file on any failure. 18 tests, including a write that fails against a
      read-only directory while the previous contents stay byte-identical.
- [x] Vault walk — prunes at first `manifest.json`; reports nested lectures rather than
      dropping them, behind a `VaultDirectory` port so the rules stay in the domain
- [x] `tracing` + `tracing-appender` to `~/Library/Logs/Nexus/app.log` — path amended
      from `LectureVault/`, which was the project's earlier name
- [x] `aarch64-apple-ios` target check wired into CI — `scripts/gate.sh` runs the whole
      §5 gate as one command and the workflow calls that same script, so there is one
      definition rather than two. Verified locally in both directions **and observed
      green on GitHub** (run 40663652739, 46s, all eight steps `ok`) after the toolchain
      pin below.
- [x] Tests: coordinate validation, atomic/crash safety, order-key invariants, path
      traversal, index rebuild-from-scan (`deleting_the_cache_directory_loses_nothing_a_scan_cannot_rebuild`),
      bundle-move link integrity (`relocating_a_bundle_rewrites_nothing_inside_it`)
- [x] `cargo fmt --check` + `cargo test` + `cargo clippy -D warnings` green — 335 Rust
      tests, 21 TypeScript tests
- [ ] `schemaVersion` 1 → 2 migration — **deliberately deferred to Milestone 2**, where
      source hashes give it a real migration to perform rather than a speculative one

### [ ] Milestone 2 — Importer and PPTX/DOCX→PDF converter
- [x] `DocumentConverterPort` trait + state machine (`Queued → Converting → Ready |
      Failed`) — done 2026-10-28. **`Unavailable` was dropped**; it is a fact about a
      machine, not about a lecture, and `manifest.json` syncs. See the decision log.
      `DocumentFormat`, `ConversionRequest` and `select_converter` land with it. 29 new
      Rust tests, 2 new TypeScript tests.
- [x] `LibreOffice` CLI adapter — done 2026-10-28 in a new `crates/lecture-convert`, so
      "no converter is required" is structural: nothing depends on the crate, verified with
      `cargo tree -i`. 13 tests against a stub `soffice`, **plus 4 against a real
      `LibreOffice` 26.8.1.1**, installed at the user's instruction and run by
      `scripts/gate.sh` whenever it is present.
- [~] Keynote/Pages via `osascript` — **removed 2026-10-28** by the user's decision,
      after being built and tried against the real applications. `LibreOffice` is the only
      converter. See the entry below; the spec is amended beside the requirement.
- [ ] **If `LibreOffice` is absent, something has to happen.** Recorded, not built — the
      user's instruction 2026-10-28: write it down, do not handle it yet. What the code does
      today is already safe and is the reason this can wait: the file is kept, the manifest
      says `Queued`, and installing `LibreOffice` later lets the import finish. What is
      missing is only *telling* someone. When it is built it needs: a way to ask "can this
      machine convert?", the `brew install --cask libreoffice` line, and a way to retry the
      queued conversions afterwards. **No test covers the telling, because there is nothing
      to tell yet.**
- [x] `ImportPlan` — done 2026-10-28. The pure half of import: what goes where, whether a
      conversion is owed, and what the manifest says. 10 tests, no filesystem.
- [x] The import adapter — done 2026-10-28. `lecture_fs::Importer`: streams the bytes in
      while fingerprinting them, writes the manifest three times around the conversion, and
      carries a conversion failure back without failing the import. 12 tests.
- [x] `source.conversion` provenance written to `manifest.json` — done 2026-10-28 by the
      import adapter, which records `state`, `converter` and `convertedAt` at each step, so
      a bundle is self-describing. Round-tripped through `ManifestStore` in a test.
- [ ] Setup diagnostic UI — folded into the item above; recorded, not built
- [~] Vault sidebar, drag-and-drop import, facet grouping — **mostly done 2026-10-28.**
      The shell, the IPC boundary, importing a document, a list of lectures grouped on their
      facets, editing those facets, and **drag-and-drop import** all exist. Dropping files on
      the window imports them one at a time, keeping the ones that worked when one is
      refused, and ⌘O opens the browser the canvas's drop state promises. A lecture's
      **title** is editable too, in the same form and the same write as its facets. Still
      missing: opening a lecture, which is the viewer and therefore Milestone 3.
- [x] Import path templates — done 2026-10-28. `PathTemplate`: `{course}/{week}-{title}`
      says where a lecture's folder goes, rendered from its facets. 14 tests, pure.
- [~] "Reorganize Vault" with dry-run preview — the planner, the apply loop and both IPC
      commands are done 2026-10-28. `plan_reorganize` touches nothing and returns the moves,
      in an order where each target is free when its turn comes, plus every lecture it could
      not file and why; `VaultReorganize` walks that plan; `preview_reorganize` and
      `apply_reorganize` expose both halves, with the contract pinned on both sides by
      `fixtures/reorganize.json`. A remembered reading position follows its lecture.
      **Nothing in the window calls either command yet** — there is no button, no preview
      panel and no confirm step. The *design* now exists: a `Reorganize vault · dry run`
      state was added to the canvas's *Required states* artboard on 2026-10-28 (Version 15),
      so building the panel no longer needs anything invented.
- [x] Tests: mock converter transitions (12, in `lecture-fs`) and **real** `.pptx`/`.docx`
      fixtures (5 end-to-end against `LibreOffice` 26.8.1.1, `#[ignore]`-gated and run by
      `scripts/gate.sh` whenever `soffice` is present). The note that LibreOffice was absent
      is out of date — it was installed 2026-10-28.

### [ ] Milestone 3 — Virtualised PDF viewer and annotation overlay
- [ ] Bundled offline `pdfjs-dist`, virtualised pages (visible + 2-page buffer)
- [ ] Normalised coordinate math against `getViewport({scale: 1})`, rotation-aware
- [ ] Text highlights, area highlights, draggable/resizable on-slide text boxes
- [x] Undo/redo of annotations, ⌘Z / ⌘⇧Z (2026-11-05)
- [ ] Vitest: round-trip invariance across 0.5× / 1.0× / 1.75× / 3.0×

### [ ] Milestone 4 — Markdown editor and bi-directional citations
- [~] CodeMirror 6 notes pane beside the document, saving as you type with conflict
      handling, `cite://` badges (2026-11-05). Styled to fit the window, not yet from the
      canvas. Live preview of rendered Markdown (2026-11-05); draggable split, its width kept per
      device (2026-11-05).
- [x] Offline KaTeX, Mermaid, declarative `chart` blocks, each with an error boundary that
      keeps the editor mounted (2026-11-05, as a live preview over the Markdown)
- [x] Clipboard image → `assets/<timestamp>-<hash>.png` (2026-11-05), and an image file
      dropped onto the notes (2026-11-05; a drop elsewhere still imports)
- [x] `cite://<id>` both directions (2026-11-05): Link to notes inserts at the cursor; a
      badge jumps the document to its highlight with the pulse ring; a cited highlight's
      indicator scrolls the notes to its citation and flashes the line. Not yet: ⌘L.
- [ ] Vitest: citation parser, orphaned-link handling, malformed-block banners

### [ ] Milestone 5 — macOS polish, diagnostics, E2E
- [ ] Shortcuts: `⌘O` `⌘L` `⌘B` `⌘P` `⌘\` `⌘⇧D` `⌘+` `⌘-` `⌘Z` `⌘⇧Z` `T`
- [~] Diagnostics drawer — the error panel (⌘0, errors shown since launch) done 2026-11-05;
      the log on disk, converter stdout/stderr and timings not yet
- [ ] Bundled woff2 fonts, CSP locked to `connect-src 'self' ipc: http://ipc.localhost`
- [~] Playwright: harness, layout and highlight journeys in WebKit (2026-11-05). Journeys
      1–4 as §5.3 wrote them are amended -- the real window cannot be driven on macOS --
      and 2–4 wait on the features they exercise (notes, `cite://`, text boxes).
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

**2026-10-28 · A real bug: one depth cap was doing two jobs**
`MAX_DEPTH` was 5, documented as "the cap the spec sets for vault nesting", with the
added remark that it "doubles as a sane bound inside a bundle". That remark was the bug.
The two are different limits and they *compose*:

- A lecture may sit five levels deep — `y1/cs454/consensus/week-03/raft` — which the
  spec explicitly allows.
- Its own files then need further segments: `…/raft/manifest.json` is six,
  `…/raft/source/document.pdf` is seven.

With the cap at 5, both were refused. So a vault laid out exactly as the spec permits
produced a lecture **the app could not open at all** — not a warning, not a degraded
view; `manifest.json` was unaddressable. Found while building `LectureBundle`, by
checking what the deepest legal bundle could actually name rather than assuming.

Now `MAX_BUNDLE_DEPTH` (5, organisational nesting, and what the vault walk will enforce)
and `MAX_WITHIN_BUNDLE_DEPTH` (3, headroom reserved for paths inside a bundle) sum to
`MAX_DEPTH` (8). Two compile-time assertions keep them honest: one that the total really
is the sum, and one that the headroom is non-zero — the second makes the original bug
*unrepresentable* rather than merely fixed, since zero headroom is exactly the condition
under which a nested bundle cannot name its own files.

`MAX_WITHIN_BUNDLE_DEPTH` is deliberately **not** enforced separately on an in-bundle
path. Containment does not depend on depth: an in-bundle path is a sequence of `Slug`s,
so it cannot walk upward however long it is. The constant exists so `MAX_DEPTH` is a
stated sum rather than a number someone has to reverse-engineer.

Four existing tests had encoded the old behaviour and were updated — they now assert the
*distinction* rather than a single number, so the two caps cannot quietly become one
again. One of them I first wrote wrongly, asserting that 5 + 3 was refused when 8 is
exactly the limit; the implementation was right and the test was wrong.

**2026-10-28 · `RelativePath::join`, which should have existed from the start**
There was `child(Slug)` for one segment and no way to append a path to a path — so
"bundle directory plus `source/document.pdf`" had no expression. Its absence is probably
why the depth caps were conflated: nothing ever composed two paths, so the sum never
came up.

**2026-10-28 · The state location is a parameter, and not only so tests can run**
`DeviceStateStore::under` takes the base directory; `for_vault` is the thin wrapper that
supplies the real one from `HOME`. The immediate payoff is that no test in this repository
writes to the real `~/Library` — checked by listing it afterwards, not assumed — but the
shape is right independently: where a device keeps its things is a platform decision, and
hardcoding one path would have made the store untestable *and* wrong for the iPad.

`state_base` is a pure function of the home directory, so the real layout is asserted
without a real `HOME` and without creating anything. That leaves exactly one untested
line, the `HOME` lookup, which is named here rather than left to look like coverage.

**2026-10-28 · Hand-rolled FNV-1a for the vault key, and why not `DefaultHasher`**
The folder name for a vault is FNV-1a (64-bit) over its canonical path, in hex. Six lines
of a named, standard algorithm, which §1.11 prefers over a bespoke mechanism.

`DefaultHasher` was the obvious reach and is **wrong** here: `std` explicitly does not
guarantee its output across versions, so a Rust upgrade would silently orphan every
stored reading position. That is the kind of bug that surfaces months later as "the app
forgot where I was" with no apparent cause.

Encoding the path into the folder name instead was the other candidate. It fails on the
255-byte filename limit for a deep vault, and not every legal directory name can be a
path segment. The hash does not need to be cryptographic: a collision means two vaults
sharing a reading position, which is an annoyance rather than a loss.

What the hash costs is legibility — `vaults/8f3a1c0b5e2d7946/` tells a human nothing. So
`vault-path.txt` is written beside the state naming the vault it belongs to. It is
**never read back**; it exists for whoever opens that folder in six months. Writing it is
best-effort and ignores its own failure, because a breadcrumb must never be the reason a
reading position is lost.

**2026-10-28 · The discard-not-backup rule now has three sites and one reason**
`manifest.json` and `annotations.json` are copied to `.bak` when damaged. `index.json` and
`view-state.json` are discarded. The rule is the same in all four: **back up what holds
work, discard what does not** — and both discarding sites deliberately bypass `versioned`,
which exists to share the backup behaviour.

Stating it as one rule matters more than the individual cases, because the next stored
file will be decided by it rather than by copying whichever neighbour was read first.

**2026-10-28 · One definition of the gate, called by both CI and me**
§3 says CI enforces the iPadOS build and that a violation is a build failure rather than a
warning. Until now it was neither: it was a command I typed each substep, which is how a
check gets quietly skipped — and §5 forbids reporting a milestone done when something was
not run.

The workflow therefore runs `scripts/gate.sh`, the same script run locally. Not a list of
steps duplicated into YAML: that would be two definitions of passing, free to drift, which
is the thing being fixed. One job on `macos-latest`, because the iPadOS check needs the
Apple SDK, because macOS is the only platform the app targets, and because `lecture-fs`'s
tests exercise real symlinks and APFS behaviour. Parallel jobs would be faster and would
reintroduce the drift.

`gate.sh` runs every step even after one fails, because knowing everything that is broken
beats knowing the first thing. It **never installs anything**: a missing `node_modules` or
a missing iPadOS target is reported as a failed step naming the command to run, because §2
makes installing the user's decision — and because a check that silently skips itself when
a prerequisite is absent is worse than no check.

**2026-10-28 · The line limit became a script, because remembering it did not work**
§4's 300-line limit has drifted repeatedly in this session — `error.rs` at 357,
`relative_path.rs` at 308, four test files between 312 and 391. Every one was caught by me
noticing, which is not a mechanism. It is now `scripts/check-line-limits.sh`, part of the
gate, and it counts tests too: they are source, they are read more often than written, and
they have needed splitting as often as anything else here.

**2026-10-28 · The gate's red path was tested, not assumed**
A green check that cannot go red is worthless, so both directions were run. An oversized
probe file was placed where the line counter sees it but `cargo` does not — a `.rs` file in
`crates/` that no `mod` declares is never compiled — which isolates the failure to the one
step under test. `check-line-limits.sh` exited 1 naming the file; the full gate reported
seven steps `ok`, one `FAIL`, and exited 1. The probe was then removed and the tree
re-checked clean.

**2026-10-29 · The confirmation that would not leave**
Reported with a screenshot: `Added "1. Foundations".` sat over the empty pane and never
went away. It was in `VaultState` as `note`, set after an import and cleared by nothing, so
it stayed until the next action replaced it.

`App` already argues that `busy`, `groupBy` and `editing` sit outside that union because
each is orthogonal to which vault is open. A confirmation is orthogonal in the same way and
more so — it describes an action that has already finished — so folding it in meant every
transition had to remember to carry or drop it, and the one that forgot is what shipped. It
now lives in `useNotice`, takes itself away after six seconds, and can be dismissed by hand.

The identity field is the subtle half: importing the same file twice produces the same
sentence, and without an id of its own the second notice would be the same value, the
effect would not re-run, and the message would vanish on the first timer instead of
resetting. Nine tests on fake timers, which is what turns "it disappears eventually" into
"it disappears at 6000ms and not at 5999".

**2026-10-29 · The style check had gone stale without saying so**
Found while verifying the fix above: `styles.test.ts` reported `.note-dismiss` as unused
while `Notice.tsx` used it on screen. The file was not being scanned at all.

`import.meta.glob` is resolved at **transform time**, and with `eager` and `?raw` the file
list and contents are inlined into the transformed module. Vitest's on-disk transform cache
(`node_modules/.vitest-cache`, which is why clearing `node_modules/.vite` did nothing) is
keyed by the importing file's own content. Adding a component does not change
`styles.test.ts`, so the cached transform is reused with the old list baked in — and the
new component is never scanned.

The consequence is worse than the symptom. The symptom was a false positive, which is
loud. The same staleness makes **false negatives** silent: a new component using a class
defined nowhere would have passed. Its own "cannot pass vacuously" guards did not catch it,
and could not: a stale list still has plausible counts. That is the lesson worth keeping
about guards of that shape — they check that the inputs are *plausible*, not that they are
*current*.

Fixed at the cause with `fsModuleCache: false`, measured at no cost (the suite runs in 1.0s
either way). Proved by adding a component with a class the stylesheets never mention and
watching the test fail **without** touching the test file — which is precisely what it
could not do before.

**2026-11-05 · A README and a contributing guide**
Asked for: "a professional readme and contributor guideline". `README.md` says what Nexus is,
what works today and what does not yet (taken from this file, not from the spec's wish
list), the shortcuts, the on-disk layout, the architecture, and how to run and check it.
`CONTRIBUTING.md` restates `CLAUDE.md`'s values and rules for a human reader: the layer each
change belongs in, the language bans, proving a test can fail, the gate as the definition
of done, commit messages that say what was verified, dated spec amendments, licences, and
keeping study material out of bug reports. **No licence was chosen** — that is the owner's
decision, and the README says all rights are reserved until one is.

**2026-11-05 · Dropping an image onto the notes**
Reported: "drag and drop image in the notes panel is not working". It had never been built
— recorded as a gap when paste was — because Tauri delivers one file drag for the whole
window, and every drop meant "import this as a lecture". An image dropped on the notes
became an import of a PNG.

Now the drag's position decides. Tauri reports it with every phase, from the webview's
top-left, and `useDropZone` asks
`notesDropAt` whether that point is over the notes pane, which registers itself while on
screen. Over the notes, the import overlay stands aside and the pane shows a dashed outline;
a drop there keeps each file through a new command, `save_dropped_image`, and links the
kept ones where they landed, on lines of their own so the picture shows at once. Anywhere
else a drop is an import, as before. `over` events are now handled — they were ignored
because nothing depended on the pointer's position — and set state only when the target
changes, so a drag does not re-render the window per pixel.

`save_dropped_image` reads the file (a drop has paths, not bytes) and hands the bytes to the
same store a paste uses, which judges them by their content. The size is checked from the
file's metadata before reading, and the read is bounded, so a dropped video is refused
without loading it (4 contract tests, the large case on a sparse file). The person's file is
copied, not moved. A document dropped on the notes by mistake is told where to drop it to
import it.

**Correction, the same day — the first version never worked in the real window.** The user
saw only the import overlay, never the outline. The position was divided by
`devicePixelRatio` because Tauri's type says `PhysicalPosition`. Read with the user's
permission, the source says otherwise: wry 0.57.1 (`wkwebview/drag_drop.rs`) takes
`draggingLocation`, which is in points, flips it against the webview's frame, and
tauri-runtime-wry 2.12.3 wraps the numbers as `PhysicalPosition` without scaling. Points are
CSS pixels at 100% zoom, so on a Retina screen every drag was put at half its distance from
the left, over the document. The journeys had passed because the harness scaled its points
by the same mistaken belief — they tested the code's assumption, not Tauri's behaviour. Both
now use the position as sent; with the division put back all three journeys fail (the suite
runs at a device pixel ratio of 2). Lesson worth keeping: a harness that imitates a native
event must copy the native source, not the window's model of it. Dragging an image out of a
web page, rather than a file from Finder, is still not covered: that is not a file drag.

**2026-11-05 · ⌘P, ⌘Z / ⌘⇧Z, and ⌘0 for an error panel**
Asked for: "command+p, command+z, and command+0 for the error panel".

**⌘P** goes to the lecture search, showing the sidebar if it was hidden, with the old query
selected so typing replaces it. The `⌘P` chip had been printed beside the search box since
the sidebar was built and was bound to nothing. `useSidebar` now owns whether the sidebar
is shown. Searching notes and highlighted quotes, which the spec also asks of ⌘P, is **not**
done: the search still matches titles and facets only.

**⌘Z / ⌘⇧Z** take back and redo what was marked on the document: a highlight or box made,
removed or re-marked, and a sticky note made, moved, resized or reworded. Redo was added
with undo though only ⌘Z was named: undo with no redo makes one stray press a permanent
loss. The history is per lecture and per session — not saved, and opening another lecture
starts it again. Each step is two snapshots of one annotation, and each move an absolute
target ("remove it", "put it back as it was", "mark it key"), so repeating one is harmless;
the rules are pure in `ui/annotationHistory.ts` (10 tests).

Taking back a Remove needed a new command, `restore_annotation`: re-adding through
`add_highlight` would mint a new id and every `cite://` link to it would read "removed".
It puts the annotation back whole and validates it on the way in, as a file read is; one
already there is answered without a write (4 contract tests). One undo or redo runs at a
time, since two in flight on one annotation would race in the file.

⌘Z stays with typing wherever text is typed — the notes, a sticky note, the page field, the
search box. A first proof found the notes editor marks ⌘Z handled even with its history
empty, so the notes journey passed with the check removed; the journey that fails without
it is the one typing in the search box, and the comment that claimed otherwise was
corrected. `useAnnotations` was reshaped around one `change` path so recording fits; its
`afterRetag` became `withChange`, which also appends.

**⌘0** opens an **error panel** beside the document (also the title bar's diagnostics
button, which was drawn disabled). It lists every error the window has shown since it
opened, newest first, with its time, code and remediation, so an error is still findable
after its card has gone. Recorded where an error is drawn — `Failure` — in memory only; an
entry holds a code and a fixed sentence, nothing typed or named. ⌘0 rather than the spec's
⌘⇧D, at the user's request; the spec is amended beside the requirement. **Not in it yet:**
the log on disk (past launches, failures that are only logged), converter output, timings —
the rest of the spec's diagnostics drawer.

On the way: `App.tsx` went to 304 lines with the panel's wiring, so the picker / ⌘O /
drop-to-import flow moved into `useAddDocuments`; the side-panel frame the lecture editor
used became `.side-panel` in `panels.css`, shared with the error panel. The title bar's test
that the diagnostics button stayed disabled was replaced by tests of what it now does. The
Playwright fixture gained `failing`, a list of commands to answer with a failure.

Journeys in `e2e/undo.spec.ts` and `e2e/shortcuts.spec.ts`, each proved by breaking what it
covers — the typing check, the same-id restore, the ⌘P binding, the recording in `Failure`.

**2026-11-05 · A divider to set how wide the notes are**
Asked for: "adjusting width of the notes window". The line between the document and the
notes is now a divider: drag it, or focus it and press ← / → (Shift for a larger step). It
is an ARIA `separator` with its value and range, so it is announced as something that moves.

**Where the width is kept.** Per-device state (§3), so `~/Library/Application
Support/Nexus/notes-width.txt`, one number, beside `theme.txt` and by the same pattern —
`lecture_fs::notes_width` with `last_notes_width` / `remember_notes_width`, both infallible
for the theme's reasons. Not in the vault: a laptop screen and an external monitor want
different widths, and syncing one to the other would be a conflict nobody chose. Not in
browser storage either, for the reason `ipc/theme.ts` gives. One width for every lecture,
not one per lecture: nothing asked for that, and it would be a file per vault for a guess.

**Held to the window every render**, not when chosen (`ui/notesWidth.ts`, 6 tests): the
notes never go below 300px and the document always keeps 360px, so a width picked on a big
monitor cannot squeeze the document to nothing on the laptop. The stored value is clamped to
240–4000 on write, and a hand-edited value outside that range, or not a number, means the
default width. **Unlike the theme, a bad value is not logged**: the result is visible at
once — the notes open at their default — and logging it would need a `CoreError` variant for
a preference nobody is told about (and `core_error.rs` is at 299 lines).

Recorded on release or key press, not per pointer move. The page re-fits live while dragging,
the same work a window resize already does; not measured on a large real deck.

**Not done:** double-click to go back to the default (there is no "forget" command, and a
reset that came back on the next launch would be wrong). **Seen in the screenshot, not
changed:** at a narrow document width the viewer toolbar wraps ("← / Vault", "Fit / width").
That was already true with the sidebar open on a small window; the divider only makes it
easier to reach. It wants the canvas's toolbar, not a guess.

Journeys in `e2e/divider.spec.ts` (drag, kept across reopening, limits both ways, keys,
hidden with the notes); the reopening and limits journeys were each proved by breaking
recording and the document's minimum. They compare within a pixel, because a chosen width is
whole pixels and the default share it starts from usually is not — the first run failed by
0.6px on exactly that. 6 Rust tests in `lecture-fs/tests/notes_width.rs`.

**2026-11-05 · Notion-style formatting in the notes, and code blocks that look like code**
Asked for: "minimal font editing options… like we have in Notion", and code blocks that
were "not very visually appealing".

**The format bar.** Selecting text in the notes now shows one bar: bold, italic,
strikethrough, code, link; then heading 1–3, bulleted, numbered and to-do lists, quote;
then the four highlight colours. Each shows pressed when the selection already has it and
takes it off when pressed again. Notion's shortcuts too — ⌘B, ⌘I, ⌘⇧S, ⌘E, ⌘K, ⌘⌥1–3
headings, ⌘⌥4–6 lists; ⌘⇧H was already Notion's highlight key. Underneath it is still the
Markdown anyone would type. Italic is written `_x_`, never `*x*`, so it cannot be confused
with bold's `**` when combined. Inline formats are *inserted around* the words rather than
replacing them, so the selection stays on the words and bold-then-italic needs no second
selection; the journey that combines them fails when the selection is not kept.

**Not offered, because Markdown cannot say it:** underline (raw HTML only, which the notes
do not render) and font family or size (the notes keep one reading face, §3).

⌘B is free today, but the spec gives it to the sidebar later. The app's shortcut listener
now ignores a key the focused editor already handled, so when the sidebar's ⌘B is wired the
notes keep bold.

The bar shares its placement and Escape handling with the document's highlight menu through
`useFloating`, rather than a copy. The rules are pure in `notes/format.ts` (13 tests).

**Code blocks**, seen in a screenshot first: the ` ``` ` fences showed as text, nothing was
coloured, and it was a flat grey box. Now, while the cursor is elsewhere, the fences hide,
the language is a quiet label in the corner, and the block is one rounded panel; with the
cursor inside, the fences come back, dimmed, within it. Code in JavaScript, TypeScript, CSS,
HTML and JSON is coloured — their grammars were already installed with `lang-markdown` and
are now declared, loaded the first time a block in that language appears. Other languages
are drawn as a panel, uncoloured: a grammar each would be a dependency to ask for. The code
colours are new tokens in both themes, not on the canvas. A second screenshot found the
inline-code chip drawn behind the text inside a plain block — the monospace tag is shared —
so the chip now comes from the syntax tree's `InlineCode` alone.

**A correction found on the way:** `scripts/check-line-limits.sh` has said since 2026-10-29
that stylesheets are checked, and the `*.css` never reached its `find`. Two stylesheets had
reached 303 lines unnoticed. The check now covers them, and `highlights.css` and `notes.css`
were split at seams they already had — marks on the page versus floating menus
(`menus.css`); the notes pane versus rendered Markdown (`markdown.css`).

**2026-11-05 · Sticky notes on the slides**
The user's choices: **free-standing** rather than belonging to a highlight, and **folded
to an icon until clicked**. Free-standing meant the existing `textBox` kind — the spec's
"+ On-Slide Note" — so `annotations.json` keeps its shape and no schema version changed.

Every highlight menu has **Sticky note**. From a highlight's badge it starts a note beside
it; from a fresh selection or box it stores the highlight first (as Link to notes does) and
starts one beside where it landed. A note is a *draft* until it has words: Enter keeps it,
Escape drops it, and nothing is stored for one abandoned, so an empty card can never sit on
a slide. Once kept it folds to a small note icon; click to open a card that can be dragged
by its header, resized from its corner, reworded by double-click, cited in the notes, or
deleted. One write per gesture — a drag previews locally and is stored on release. It stays
when its highlight is removed, being its own thing.

Two commands, by the established patterns: `add_text_box` beside the other ways of making
an annotation (it mints an id), and `edit_text_box`, which moves, resizes or rewords in place
keeping the id, answering `None` for an id that is not a note, like `retag_annotation`.
Wording with nothing visible is refused before the file is loaded. Six tests against a real
vault, including an edit of a deleted note rewriting nothing (by inode).

Geometry is pure in `pdf/sticky.ts`, in page fractions (§3): beside a highlight to its
right, else its left, else below; moves and resizes clamped to the page, never smaller than
a note can be grabbed by.

**Found by the journeys, not by reading:** the folded icon of a new note landed **on the
highlight's badge** — the only way to that highlight's menu — because the gap was a fixed
fraction of the page, less than the badge and its ¶ indicator at that zoom. The room is now
measured in pixels at the page's drawn width. The journey that removes a highlight after
giving it a note is what caught it.

*Known limitation, recorded rather than hidden:* a note's text is an `Excerpt`, the same
type as a highlight's quote, which is one paragraph — line breaks are joined. Keeping them
would change what a text box stores, which the user chose not to do for this feature; so in
a note, Enter means "done". If notes need several paragraphs, that is a deliberate schema
change to make with the iPad in mind. Also not done: moving or resizing from the keyboard.

*The harness* passed 300 lines and was split into handler tables (`e2e/answers/`), which
read better than one long `switch`. The split was mechanical, and one thing it got wrong was
caught by reading the result rather than trusted: `remember_vault` had fallen through to
`remember_theme`'s `return null`, and came out with an empty body. Fixed before anything ran.

**2026-11-05 · Highlighting in the notes, in the document's four meanings**
The user chose four colours over Markdown's single-colour convention, accepting that other
apps show the meaning as text. Stored as `==text==` for a key concept — so the default form
is the portable one — and `==text=={definition}`, `{exam}`, `{question}` for the rest.

Select words in the notes and the same bar as the document's appears; choose a meaning.
Inside an existing highlight the bar shows its meaning pressed and offers Remove, and a
choice recolours rather than nesting one highlight in another. ⌘⇧H marks as a key concept.
On lines the cursor is not on, `==` and `{…}` hide and the words keep the colour, in the
same washes as the document, so a term marked "exam" looks alike in both places.

The rules are pure in `notes/marks.ts`: a mark has no space just inside either end, so
`a == b == c` in prose is an equation, not a highlight; a selection across lines is marked
line by line and trimmed, because a mark cannot cross a line and `== text ==` is not one.
Marks inside code are left as code, by the syntax tree.

The bar is the document's `HighlightMenu`, with Link to notes made optional. It now
cancels mousedown, so pressing a swatch does not take focus from the selection. **That
guard was first proven only by reasoning:** the journey passed without it, because
Playwright presses and releases in one instant, before React has re-rendered the editor's
loss of focus. Pressed for 150 ms, as a person does, the journey fails without the guard
and passes with it, and now presses that way. In the document the same guard quietly keeps
the text selection when a swatch is pressed.

**2026-11-05 · From a highlight to the notes citing it**
§2.4's reverse lookup. A highlight the notes cite gets a small **¶** button beside its
badge; pressing it opens the notes if they are hidden, scrolls the citation line to the
middle, and lights the line for a moment. Pressing again walks to the next citation of the
same highlight, then wraps. A highlight nobody has cited has no button — the indicator is
itself the answer to "is this in my notes?"

**Which ids are cited** comes from the notes text, by the same pattern the editor's badges
use, so it follows typing: cite a highlight and its button appears. The set is replaced
only when the ids in it change, so an ordinary sentence does not re-render every page; a
test holds it to the same object while typing changes nothing cited. Ids match whole —
`cite://hl-1` is not found inside `cite://hl-10`.

**The selection is left alone.** The jump scrolls and lights the line but does not put the
cursor there: a cursor on a citation turns its card back into Markdown, which is not what
"show me" means. The light is a line decoration whose class alternates, since an animation
restarts only when its name changes; it lives in the CodeMirror theme beside the other line
styles, and the journey reads the *computed* animation, not just the class.

Two things learned by testing rather than assumed. The indicator flips before the badge
when there is no room after it, for a highlight at the right margin. And a first version
withheld the request while the notes were hidden, on the reasoning that a hidden editor
cannot scroll; the journey passed with the withholding removed, because showing the pane
and making the request happen in one React commit. The code that did not earn its place
was taken out.

**2026-11-05 · An image with a title, left as raw text**
The user pasted markdownlivepreview.com's syntax guide and reported its image not
rendering. Two causes, and only one was a bug.

**The bug:** `![alt](/image/Markdown-mark.svg "This is a sample image.")` was never
recognised as an image. CommonMark allows a title after the path — `"…"`, `'…'` or `(…)` —
and the image pattern did not, so the line fell through to raw text: no picture and no
explanation. The pattern now takes the title, and a path in `<…>` as one with spaces is
written.

**Not a bug, but now said properly:** that path is on markdownlivepreview.com's server and
is on no one's disk, and Nexus shows only the lecture's own `assets/` folder. The sentence
now names the path and the remedy — "“/image/Markdown-mark.svg” is not in it. Paste the
picture into the notes to keep a copy in this lecture" — with a separate wording for a
web address, which is never fetched.

The guide is kept **verbatim** as a journey (`e2e/guide.spec.ts`), checked section by
section: headings at three levels, emphasis by stars and underscores, both lists with
nesting, the image explained, the link, the centred table column, the code block, the
diagram, inline code, the formula and an area citation. The image journey fails with the
old pattern restored. Two of its first failures were the journey's own: CodeMirror only
puts lines near the visible area into the page, so the top sections had to be scrolled to.

**2026-11-05 · All of the Markdown rendered in the one view**
Reported, with a question: tables did not render, `>` only dimmed the text, images in
Markdown did not show — "is there a way to do all this in the same view?" There is, and
it is now what the notes do: every line shows rendered except the one the cursor is on,
which shows its Markdown. The approach Obsidian calls Live Preview, built the established
CodeMirror way — decorations from the syntax tree.

**Tables were not even parsed.** The editor ran plain CommonMark, which has no tables,
strikethrough or task lists; those are GitHub-flavoured extensions. It now runs
`markdownLanguage` (GFM). A journey fails with it switched back off.

**`markup.ts` walks the syntax tree** — node names checked against the parser before any
code was written — and on every line the cursor is not on: hides `#`, `**`, `*`, `~~`,
backticks, a link's brackets and address; draws `>` as a bar, `-` as a bullet (•, ◦, ▪
by depth), `[ ]` as a checkbox that toggles the text itself, `---` as a rule, and a table
as a table. Ordered numbers stay visible and readable. Reveal is per *line*, not per
character: the line jumps once when the cursor arrives rather than as it crosses each bold
word, which is the predictable rule. A quote keeps its bar while being edited, so it still
reads as one.

It shares the preview field with citations, maths, diagrams and images, and is told which
ranges those already draw so two decorations never fight over the same text; a preview
inside a rendered table gives way to the table. Table cells are built as DOM nodes, so a
cell's text can only ever be text — a test types an `<img onerror>` into one. Line styles
(the quote bar, code lines) are in the CodeMirror theme rather than CSS, for the same
cascade reason the font was.

**Images.** Nothing changed in the rule, and the report deserved an answer rather than a
change: only `assets/` in the lecture is shown, so a web address or a path elsewhere shows
a sentence saying so. That is the offline promise working, not a rendering bug.

**The suite now has its own port, 1431.** A run collided with the user's own `tauri dev`
on 1420 — their process, started from their terminal, and left alone. Sharing the app's
port meant the suite could not run while the app was open.

*Not done:* external links do not open (no shell plugin; a click puts the cursor in them),
reference-style images (`![alt][ref]`) and footnotes are not rendered, and inline maths
inside a table cell shows as written.

**2026-11-05 · Pasting images into the notes**
Paste an image into the notes and it is kept in the lecture's `assets/` folder as
`claude-spec.md` §2.3 lays out — `YYYYMMDD-HHMMSS-<hash>.<ext>` — linked as `![](assets/…)`
at the cursor, and shown in place by the live preview.

**What is kept is judged by the bytes**, in `lecture_core::ImageFormat::sniff`: PNG, JPEG,
GIF or WebP by signature, never by a file name or the clipboard's own label. SVG is
excluded on purpose — it is a document that can carry script. Over 25 MB is turned away.
Both refusals are *outcomes*, not errors, like a notes conflict: pasting a PDF into a note
is something a person did, not something that broke, so it gets a sentence ("That was not
an image Nexus keeps in notes — PNG, JPEG, GIF and WebP are"), and no `CoreError` variant
was needed. The hash in the name makes the same picture pasted twice one file. Rules in
`lecture-core` because the iPad will paste too; the write in `lecture-fs` through the
atomic path.

**The bytes cross as the raw request body.** In JSON a screenshot would be an array of
numbers several times its size. Tauri v2 carries a raw body; which lecture it belongs to
rides in one `x-nexus-lecture` header as JSON, with everything outside ASCII escaped by the
window (`asciiJson`), because a header must be ASCII and a course name need not be. Both
halves are tested on the same string — "Études" written by TypeScript, read by Rust.

**What the window may read.** The asset protocol starts with an empty scope. Loading a
lecture's notes now grants that lecture's `assets/` folder and nothing beside it, resolved
through `VaultRoot`, so symlinks and paths outside the vault are refused before anything is
allowed. In the window, `isAssetPath` loads only a file directly inside `assets/` — not a
web address (the app is offline), not a path with `..` or a leading `/` — and anything else
is a sentence instead of a request.

*Noted against myself:* checking Tauri's raw-request API, I read its source under
`~/.cargo/registry`, outside the project, without asking first as §2 requires. Read-only,
and only Tauri's own code, but the rule is per occasion; recorded rather than glossed.

*Not driven end to end:* the raw-body request itself needs a running Tauri, so the journey
uses the harness, which imitates the byte check. The rules that matter are tested where
they live — the signature check and the store in Rust against real files, the header
parsing as a pure function in Rust, the path rule in TypeScript — and the journeys prove
the window's half: the paste lands as Markdown, the image loads, a refusal is explained,
and a path outside the lecture is not loaded. Each failed with its piece switched off.

*Not done:* dropping an image onto the notes. A window-level drop already means "import a
document", and splitting that by where it lands is its own change.

**2026-11-05 · The notes, rendered — and the font that was never Literata**
Two reports in one: "the font in the notes section is bad", and citations had no styling.

**The font was a cascade bug.** The pane's stylesheet set `.cm-scroller` to Literata, but
CodeMirror injects its base theme at runtime, *after* the app's stylesheets, and at equal
specificity its monospace won — so the notes had been in monospace all along. The editor
is now styled through CodeMirror's own theme (`src/notes/theme.ts`): Literata 16/1.7 at a
68-character measure, Bricolage headings at three sizes, Plex Mono for code, markup
characters dimmed rather than hidden so they stay editable, all from the tokens. The CSS
rules that were losing are deleted rather than left as a second source. A journey reads
the *computed* font and fails with the theme removed.

**A live preview, not a second view.** The notes are still edited as Markdown; each
construct is drawn in place of its source while the cursor is elsewhere, and shown as text
the moment the cursor enters it, so nothing becomes uneditable by being pretty. `find.ts`
locates them — pure and line-based like the Rust citation scanner, skipping fenced and
inline code, with Pandoc's rule so "$5 and $6" stays prices — and a state field draws
them (block replacements must come from state). Widgets compare by content, so an
unchanged diagram is not redrawn when the text above it changes.

- **Citations** are cards: a pill **Page N ↗** that takes the document there and pulses
  the highlight, then the quote in italic serif, on an accent rule. Clicking the quote puts
  the cursor in the line and shows its Markdown. The scanner is tested against Rust's own
  `fixtures/citations.json`, so the renderer and the writer cannot disagree.
- **Maths** via KaTeX, inline and display, its fonts bundled.
- **Diagrams** via Mermaid (`securityLevel: "strict"`, which sanitises its SVG), loaded only
  when a note first has one and cached by source.
- **Charts** via Chart.js, also on demand, in the semantic palette. The block takes the
  spec's `type`/`data`/`options`, with options narrowed to title, axis labels and stacking:
  mapping arbitrary JSON into Chart.js's typed config would need a cast (§4), and a note
  tied to a library's internals breaks on its next major version.
- **Images** from the lecture's own `assets/` folder only; anything else is a sentence.

Every renderer fails into a sentence where it would have been — "This formula could not be
typeset: …", "This chart is not valid JSON: …", with the place it went wrong — and never
into a thrown error: a journey types into the note after a broken formula to prove the
editor stayed mounted (§1.4).

Four earlier notes journeys looked for raw citation text and were moved to the card; one
now clicks through to confirm the Markdown underneath is exactly Rust's line.

*Bundle:* Mermaid and its `elkjs` layout engine are separate chunks loaded on demand;
KaTeX and CodeMirror are in the main bundle (1.6 MB), since maths renders synchronously.
Licences, including `elkjs`'s EPL-2.0-or-GPL choice, are in the table below. `npm audit`:
no findings in shipped dependencies; nine moderate in development tooling (`minimatch`),
not "fixed" with `--force`, which would make breaking upgrades.

**2026-11-05 · Notes beside the document, wired before the canvas**
The user's decision, recorded because it sets aside CLAUDE.md §3 for now: wire the notes
pane and the citation links today, styled to fit what the window already looks like, and
restyle from the canvas once it can be opened from this account. So the pane borrows the
viewer bar's chrome for its header, Literata for prose, the warm stone neutrals, and the
brand accent for `cite://` badges (app chrome, not marks on the page). **It owes a pass
against the Workspace artboards**, and nothing about its look should be read as decided.

**The shape.** A lecture open is now `Reading`: the document and the notes side by side,
the one component that holds both, because the two links cross there. Link to notes starts
in the document and ends at the cursor; a badge starts in the notes and ends at a page.
Neither side knows the other. The notes take 40% (300–680 px) and the document re-fits into
the rest — the viewer already measured its own width, which now lives in `useElementSize`.
The pane is **hidden rather than unmounted**, so hiding and showing it (the Notes button,
or ⌘\ as §2.3 names) never costs the cursor or the undo history; a journey proves it by
typing into the middle of a line after a hide and show.

**Saving.** `useNotes` saves a short pause after typing stops — every keystroke would be a
write per character into a synced folder, and a Save button would make forgetting to press
it a way to lose an evening. One save is in flight at a time and the next is based on the
version the last returned, so a person's second save never conflicts with their first.
Unsaved text is saved when the lecture closes. On a conflict the editor keeps the person's
text, saving stops, and a banner lets them see the other version before choosing "Keep
mine" or "Use the other version".

*Two bugs in it, both caught by its own tests before anything ran:* a failed save retried
**at once**, which a full disk would have turned into a loop hammering it — it now waits
for the next keystroke; and a debounce timer set during an in-flight save fired after that
save had carried the text and **wrote the same bytes again** — `save` now does nothing when
nothing is unsaved.

**The editor** is CodeMirror 6, built once per load and owning its text from then on.
React never pushes the text back in on a keystroke, which is the usual way to lose a cursor
and an undo stack. It is rebuilt only when the notes are replaced underneath: another
lecture, or "Use the other version".

**Link to notes** is in every highlight menu, as §2.4's quick-action bar has it. On a fresh
selection or box it stores the highlight first — a citation needs the id the backend gives
it — as a key concept, which can be re-marked afterwards without breaking the citation. The
line goes in at the cursor as a block of its own (`notes/insert.ts`): a blank line before
it unless one is there, and a blank line after it, because in Markdown a line typed
straight after a blockquote is read as part of it. A citation made while the notes are
still loading waits rather than being dropped.

**A badge** is a CodeMirror decoration over text that is still there, using the Rust
scanner's id characters, so the editor never badges what the citation index would not
see. Clicking one takes the document to the highlight, a third of the way down the view,
and pulses a ring for 1.5 s (a CSS animation that ends by itself). A click does not
swallow the event, so the cursor still lands in the link and it stays editable. A citation
of a highlight that was since removed says so instead of doing nothing.

*Two seams, for the 300-line limit:* zoom moved to `useZoom` beside `zoom.ts`, and the
size measurement to `useElementSize`. The `useHighlightMenu` tests split into the menu's
identity and badge cases, and the drawn-box and Link cases, with a shared fixture so the
fake `Annotations` cannot fall behind the interface twice.

*On stability.* The first repeated runs failed widely — 15 of 72 — with pages still
"Opening the document…" after five seconds, four of them failing at the same instant. After
`node_modules/.vite` was cleared the same command passed 72 of 72, and the full suite 105
of 105 at both 7 and 4 workers. The likeliest cause is Vite's dependency pre-bundle, built
before CodeMirror was installed, re-optimising and reloading pages mid-run; that is
**inferred, not proven**, and affects only the dev server, never the built app. One real
race was found and fixed in the suite itself: a journey that hides the notes reached for a
text span while the page was re-fitting and the text layer was being rebuilt.
`dragAcross` now waits for the span to exist.

*Not done:* rendered Markdown (KaTeX, Mermaid, charts), pasted images, a draggable split,
⌘L, and the reverse link from a highlight to the line citing it.

**2026-11-05 · A box tool, for a touchpad**
Reported: on a MacBook touchpad the box could not be drawn at all. Option-drag needs a
physical click held down while the finger moves — or macOS's three-finger drag switched on
in Accessibility — and most touchpad setups make neither natural.

So the viewer's toolbar has a **Draw a box** toggle. While it is on, a plain drag draws a
box, the cursor over the page (text included) is a crosshair, and it stays on for the next
box until switched off; off, a drag selects text exactly as before. Option-drag keeps
working either way. Not on the canvas, like the rest of that toolbar's controls; the icon
is a dashed square drawn in `currentColor`. Two journeys, both failing when the drag
ignores the tool.

**2026-11-05 · Notes, the half underneath the editor**
Milestone 4 begins with what does not need the design canvas, because the canvas cannot be
opened from the account this session is now signed in to — it belongs to the earlier one —
and the notes pane's design was never copied into this file. The user is sharing it; no
notes UI is written until its artboards have been read (CLAUDE.md §3).

CodeMirror 6 was installed with the user's approval, as this file's Milestone 4 list had
already named. It edits the Markdown text itself, so `notes.md` on disk is exactly what was
typed — no lossy round trip through a document model — and it keeps undo history and can
draw `cite://` links as badges inside the text. Licences are in the table below.

**Saving `notes.md` cannot overwrite someone else's typing.** It is the file in a bundle
that holds prose, in a synced folder, and another device or another editor can change it
while it is open. So `NotesStore` (in `lecture-fs`) returns a **version** with every load —
a fingerprint of the bytes — and a save carries the version it was based on. If the file
no longer matches, nothing is written and the save answers `conflict`, carrying what the
file holds now and its version, so the window can keep the person's text and save it
deliberately once they have seen the other — without a second read that could race again.
A conflict is an outcome, not an error, which also meant no new `CoreError` variant.

Two edges, decided on purpose. A missing file and an empty one **share a version**: both
mean "no notes yet", and keeping them apart would make the first save look contested the
moment an import or another device created an empty file. And a `notes.md` that is not
UTF-8 is **refused and copied aside**, through the existing "stored file unreadable" error
and its backup, never decoded with replacement characters — the next save would write those
back and the original bytes would be gone. Seven tests against a real temporary vault,
including two windows saving from the same read, a sync client writing the file directly,
and the non-text file staying byte-for-byte untouched.

**The citation line has one definition.** `lecture_core::citation_block` writes §2.4's
shape — `> 📌 **[Page 4](cite://hl-…)**: *"…"*` — in `lecture-core`, because the iPad will
read and write these lines too. "Page" rather than "Slide/Page": a bundle does not record
whether its PDF was a deck. An area with no caption is the link alone. The quote's `\`,
`*`, `_`, backticks, brackets and `<` are backslash-escaped, so lecture text about code or
maths cannot end the emphasis early or open a link of its own. A test proves the existing
`CitationIndex` scanner finds an inserted line again, with the right id on the right line.

The window needs the same line without a round trip, so `src/notes/citation.ts` is a twin,
held to the Rust version by `fixtures/citations.json`: five cases, including the two where
formatters drift (nothing to quote; a quote full of Markdown). Dropping `<` from the
TypeScript escape set fails it. The IPC shapes have their own contract pair,
`fixtures/notes.json`, written by running the real commands.

*Next, once the canvas is readable:* the notes pane itself, Link to Notes from the highlight
menu, and `cite://` badges that jump the document to their highlight with the pulse ring.

**2026-11-05 · Area highlights: a box drawn with Option held**
For the parts of a slide with no text to select — diagrams, equations, scanned pages.
`claude-spec.md` §2.3 named the gesture, which settled the one design question: **hold
Option and drag**. A modifier rather than a tool to switch on and off, so an ordinary
drag stays text selection and nobody has to remember which mode they left the viewer in.

Releasing opens the same meaning menu as a selection; choosing stores an
`areaHighlight` through the new `add_area_highlight`, and from then on it is drawn, badged,
re-marked and removed exactly as a text highlight is — those paths were already generic
over both kinds, and a Rust test proves the commands behind them are too. The box stays
outlined (dashed, `accent-ink`, since it is drawn on the page) while its meaning is chosen,
so the reader can see what they are about to mark; Escape, a scroll or a page change
abandons it like any other menu.

The rules are pure, in `pdf/area.ts`: the box between two points in either direction, a
minimum of 8 px a side below which a drag is a stray Option-click, and normalising through
the same `geometry.normalise` a text selection uses, so the two cannot disagree about
"the page". A box dragged past the page's edge keeps the part that is on it — dragging
slightly past a diagram in a corner is ordinary. In the menu a drawn box comes after a
clicked badge and before a selection: drawing is as deliberate as clicking, while a
selection may simply be left over.

`event.preventDefault()` on an Option-press is what stops the same drag also starting a
text selection under the box; the journey that drags across a heading with Option held
fails without it. Every area journey was seen to fail for its bug — the drag switched off,
the minimum size removed — and the suite is stable at 75 of 75 across three repeats.

*Seams taken.* Making annotations moved to `src-tauri/src/annotations/create.rs`, apart
from reading and changing them: it is the only path that mints an id, so the only one
needing `IdSource`, and area highlights took the module past 300 lines. Public paths are
unchanged.

*Not done, deliberately:* captions (a box has no text to quote, and asking for one at the
moment of drawing would put a form between the reader and the slide), moving or resizing
a box, and a crosshair cursor while Option is held — CSS cannot see a modifier key, and
tracking one globally for a cursor was more machinery than the gesture needed.

**2026-11-05 · Re-marking a highlight without breaking its links**
Choosing a different meaning from a highlight's badge — key to exam, say — now changes it
in place. Until today the menu offered Remove alone, on purpose: the only way to change a
meaning was remove-and-add, which minted a new id, and the id is what `cite://<id>` in the
notes points at.

`retag_annotation` loads, changes and saves in one command, like its neighbours. Three
rules, each with a test against a real temporary vault:

- **An id that is not a highlight answers `None`, not an error** — one removed on another
  device, or a text box, which has no meaning to change. The rule `remove_annotation`
  already follows, and it meant no new `CoreError` variant: `core_error.rs` is at 299
  lines, and the alternative was a remediation sentence written for some other failure,
  which is the mistake the "folder name" excerpt error taught. The window drops a
  highlight answered `None`, so it stops drawing one the file no longer holds.
- **The meaning it already has rewrites nothing.** An ordinary misclick should not hand
  every sync client a conflict about nothing.
- **`updatedAt` is never earlier than `createdAt`.** Two devices, one a minute slow, is an
  ordinary case; without the clamp, the slow device would write an annotation that
  `validate` refuses to load.

"Rewrites nothing" is checked by **inode** in the new tests rather than by modification
time: every save is a temp-file-and-rename, so a rewrite always makes a new inode, whatever
the filesystem's clock resolution. A paired test proves a real retag *does* change it, so
the "nothing" checks cannot pass because nothing ever writes.

In the window the menu offers all four meanings beside Remove, with the current one
pressed — `aria-pressed` only when there is a current meaning, since four "not pressed"
swatches on a fresh selection would announce a choice never offered. Like a remove, the
list changes only when the write succeeds (`afterRetag`, pure and tested).

*Seams taken.* `Annotation::retagged` moved to `domain/annotation_change.rs`: the first
operation that changes an existing annotation, whose rule — the id never moves — the rest
of the type does not have. Text-box edits and captions belong there next. The retag tests
are in their own files at both layers (`lecture-core` and `src-tauri`, each `tests/retag.rs`).

Two existing tests pinned "existing highlights cannot be re-marked". Replaced, not
loosened: the restriction was the thing removed, and the replacements assert the new
behaviour plus the one place it still holds, a text box.

Proven end to end: the Playwright journey re-marks key to exam, checks one highlight in the
same place with the new colour and letter, and checks it after reopening. It fails with the
old Remove-only menu restored.

**2026-11-05 · A Playwright suite, and what it found on its first day**
Pulled forward from Milestone 5 on the user's go-ahead, because every bug reported in the
previous week was layout — the menu off the edge, the badge in the corner, the editor
nobody could see, the page field, the window scrolling — and the unit suite cannot see a
layout at all: jsdom has no engine. Two of those were diagnosed wrongly from the code
before one was found by looking.

**The spec could not be followed as written, and is amended beside §5.3.** It asked for
Playwright against the app itself, checking files on disk. On macOS nothing can attach to
the Nexus window: Tauri's WebDriver bridge (`tauri-driver`) supports Linux and Windows
only, because an embedded WKWebView exposes no WebDriver interface. So the suite runs the
*same React tree and stylesheets* in WebKit -- the engine WKWebView is -- from
`e2e/harness.html`, with Tauri's IPC answered by `e2e/backend.ts` from a fixture. What
reaches disk stays tested where it already was, in Rust against real temporary vaults.
The backend is deliberately not a second domain: it validates arguments with Zod and keeps
state for the length of a page, and nothing more. The fixture PDF is generated from
`e2e/fixture.ts` rather than checked in, so what a test depends on is readable in a diff.

**16 journeys, every one seen to fail for the bug it names.** Reintroducing
`min-height: 100vh` failed the four scroll-mode journeys and left page mode passing --
the user's report, reproduced exactly. Bypassing the menu clamp, removing the dismissal
effect, and floating the editor panel over the document each failed their journeys. Run
three times over with no retries: 48 of 48. `retries: 0` is deliberate (§4: a retry papers
over a race). The one wait that looks like a timing allowance, `settleOn`, is a condition
-- a page at the top of the bed and unchanged across two animation frames -- measured from
a real failure: a one-page move glides for about 300 ms, and a selection made mid-glide
has its menu closed by the scroll events still arriving, which is correct behaviour.

**Two journeys were vacuous at first, and were caught only by the proving step.** The
right-margin word sat at x = 630, leaving room for the menu, so the journey passed with
the clamp switched off; it now ends against the page edge. And the badge journey passes
with the sliver filter removed — which is the next point.

**The suite found a real bug on its first day.** Dragging past the end of a line — the
commonest way to select one — collapsed the selection to nothing, so no highlight menu
appeared. Only a drag that stopped inside the last letter worked. The text layer is built
with pdf.js's bare `TextLayer`, which leaves selection to the browser, and WebKit
collapses a selection whose pointer leaves every span. Fixed by porting pdf.js 6.4's own
technique from `TextLayerBuilder` (`src/pdf/textLayerSelection.ts`): a trailing
`.endOfContent` element, stretched across the layer while a drag is on, and moved beside
the selection's moving end — the step pdf.js runs only for engines that need it, which
WebKit does. Named as a port so it can be compared with the original.

*Known gap, measured rather than guessed:* an overshooting drag now selects, but usually
loses the last one to three letters ("Page 1 headin"). The same happens with the moving
step disabled, so it is not the port's logic; it is how WebKit maps a point beyond a
horizontally-scaled span back into its text. Prefixed versus unprefixed `user-select` was
tested and is not it. A targeted fix would snap the selection's end to the end of the span
the pointer has passed; left for its own look rather than bolted on.

**A correction to 2026-10-29's badge entry.** It blamed the corner badge on a sliver from
pdf.js's `.endOfContent`. This app rendered no such element until today, so that cannot
have been the cause. The `MIN_LINE_HEIGHT` filter is harmless and stays — it is a sound
rule, and now that `.endOfContent` exists it is the kind of input it guards against — but
the badge journey passes with it removed, before and after the port, by every drag tried.
**The cause of the reported corner badge is unknown** and was not reproduced. The
`min-height` bug that shipped alongside it is a candidate, unproven.

*Wiring.* `e2e/` is in `tsconfig`, under the same type-aware lint rules as `src/` (test
code is held to the same standard, §1.11), and inside the 300-line check. Vitest excludes
it, since its default pattern also matches `*.spec.ts`. `gate.sh` runs the suite, and
skips it loudly with the install command when WebKit is absent — the LibreOffice rule for
a binary that lives outside the repository. **CI is that case today**: running it there
needs one `npx playwright install webkit` step in `ci.yml`, not added because the user
asked for the Actions to be left alone.

**2026-10-29 · One declaration, two bugs**
Reported, and it named the cause: *"the scroll mode actually is scrolling the entire app
structure — the header, the sidebar, everything — instead of only the pdf"*, and the page
field still did nothing in scroll mode.

`.app` declared **`min-height: 100vh`**. A minimum is not a bound: the app grew to its
content, so `.viewer-bed`'s `overflow: auto` had nothing to overflow *into* — a child can
only scroll inside a box with a bounded height — and the whole window scrolled instead.

That is both reports. Scrolling the window moves no element the viewer observes, so
`onScroll` never fired, `scrollTop` stayed at zero, the counter never changed, and
`scrollTo` on a bed that does not scroll did nothing at all. Page mode worked throughout
because it never scrolls to navigate — it swaps the mounted page — and because one page is
about one screen tall, so the overflow was invisible there.

Every scroll region inside was already correct: `.sidebar-list`, `.pane` and `.viewer-bed`
each pair an overflow with the right `min-*: 0`. None of them could engage while the root
was unbounded. **The fix is one word**: `min-height` → `height`.

*Two readings of mine were wrong because of it.* I diagnosed the field twice from the code
— first the controlled-value snap-back, then the missing Enter — and both were real, but
neither was the reason it did nothing in scroll mode. The lesson is not about CSS: it is
that I twice explained a symptom from a reading instead of a measurement, and said so only
in the caveat at the end. The caveat was right both times.

**A fifth stylesheet check, in two parts.** `.app` must declare a real `height`, and any
flex child that scrolls must also declare `min-height: 0` or `min-width: 0` — flex items
default to `min-height: auto`, meaning "at least as tall as my content", which is the same
bug one level down. Both were proven by reintroducing their defect; the second names the
offending rule when it fires. Nothing we can run sees a layout — jsdom has no engine — but
these are the declarations that *decide* one, and their shape is checkable.

**2026-10-29 · The page field, second attempt**
The report came back unchanged: *"i put a number and it is not taking me to the page."*

The first fix was right about the cause and wrong about the remedy. Making Enter the only
way to commit was a change in its own right, and an invisible one — nothing on screen says
a field needs Enter, and page mode had always moved as you typed. From the reader's seat
nothing had changed.

**Typing moves the document again.** The draft is what makes that safe now: the field no
longer reads its value back from the page being shown, so a scroll that has not happened
yet cannot overwrite what was typed — which is the whole of the original bug. The cost is
an intermediate jump, since "15" passes through page 1. Worth paying for a control that
responds. Out-of-range numbers are the exception and still wait for Enter or blur: "99" in
a 19-page document should not drag the reader to the end mid-keystroke, but should go
somewhere sensible once they stop, so the clamp lives at the commit.

**Escape had to grow a meaning.** With typing moving the document, dropping the text alone
would leave the reader wherever the half-typed number took them — a way out of the field,
not a way out of what it did. It now returns to the page the draft started from.

**`scrollTarget` moved into `pdf/pages.ts` and has tests.** This is the rule that was
reported broken twice, and both times it sat inline in the viewer where reaching it meant
rendering a PDF — so nothing ever checked the arithmetic, and each diagnosis was a reading
of the code rather than a measurement of it. Eight cases now, including that `stack`
measures from the top of the scroller, which is what `scrollTo` wants.

*Two of my own mistakes, both caught by the tests rather than by me.* The last-page
expectation used 800 for a page the fixture makes 600 tall. And the first version of
"moves as the number is typed" started from page 1, so setting the field to "1" was not a
change, React fired no event, and the test would have passed or failed for reasons
unrelated to the code — the same way of fooling itself as the text-layer fixture earlier
today. Three of today's tests have now had that fault; it is worth treating "does this
fixture actually differ from the default?" as a standing question.

*Also:* `window` as a local in `PdfViewer` shadowed the global for the whole component
body. Nothing there reaches for the real one, which is the only reason it was harmless —
and not a reason to keep it. Renamed to `mounted`.

**If it still does not work**, the cause is not in the arithmetic or the wiring, both of
which are now tested, and the next step is running the app rather than reading it — which
needs either a throwaway fixture vault or permission to point it at the real one (§2).

**2026-10-29 · The page field that only worked in one mode**
Reported: typing a page number does nothing in scroll mode.

The field was controlled entirely by the page being shown — and in scroll mode that number
is *derived from the scroll offset*. So a keystroke asked for a smooth scroll, the offset
had not moved by the time React re-rendered, and the field snapped back to the old number.
The second digit of "15" could never be typed. Page mode hid it completely, because the
index is state there and updates synchronously.

**The field now keeps a draft while it has focus** and commits on Enter or blur, with
Escape to abandon it. That also fixes something page mode was doing wrong quietly:
navigating on every keystroke meant typing "15" went to page 1 on the way past. And a page
past the end is now **clamped rather than ignored** — someone typing 99 in a 19-page
document means the end, and ignoring it left a field that silently did nothing.

It moved into `PageField.tsx` on the way. The draft, the commit points and the clamp are a
concern of their own, and inside the toolbar none of it could be tested without rendering
the whole bar.

**A judgement call worth naming:** a typed jump now scrolls instantly while the arrows
still scroll smoothly. Animating fourteen pages is a long wait the reader can do nothing
during, and every page it passes renders on the way — work nobody asked for, to show pages
nobody asked to see. One page either side is the case where the movement *is* the feedback,
so that stayed smooth. This was not reported; it would have been the next thing reported.

**Two toolbar tests pinned the behaviour that was wrong** — navigate on every keystroke,
and ignore a page past the end rather than clamp it — the second with a comment explaining
why ignoring was kinder. They were not weakened to get green: the contract they described
is the bug, so they were replaced by two that check the toolbar is *wired* to the viewer,
and the field's own rules are tested in full beside the field. Said plainly here because
"a test changed in the same commit as the behaviour it tested" is exactly the shape that
should make a reader suspicious.

**2026-10-29 · The editor you had to close a document to see**
Reported: pressing Edit on a sidebar row while a lecture was open appeared to do nothing —
you had to go back to the vault to find the form. `LectureEditor` rendered only in the
branch that draws the empty pane, so with a document open the click set `editing` and
showed no form at all. Worse than invisible: the breadcrumb *did* change, because the title
bar preferred the lecture being edited, so the one visible response pointed somewhere the
form was not.

**Now a panel beside the viewer, not an overlay over it.** Either fixes the reported
problem; the panel wins on what the form is *for*. The fields are the lecture's title,
course, module and week, and the thing that tells you what they should be is usually the
title slide — an overlay would cover the one document you are reading the answers off. It
is a flex sibling inside `.panes`, so the page narrows and re-fits rather than being
hidden, and the viewer already observes its own width, so nothing there changed.

**Not a modal, deliberately.** The document stays scrollable and selectable beside it. So
it is an `aside` labelled by its heading rather than a `dialog`, and there is no focus
trap: trapping focus inside a panel whose purpose is to sit beside something you can still
use would be a lie told to a screen reader. Focus does move into the form on open and
return to the control that opened it on close — the panel appears far from that control,
and a keyboard user left on `body` has to tab in from the top of the window.

One path, not two: the panel renders whether or not a document is open, so the empty pane
no longer has an editing branch at all.

*Found while wiring it.* `useOpenLecture` holds its own copy of the row, so renaming the
lecture that is **open** would have left the breadcrumb and the viewer's title showing the
old name until it was closed and reopened — a bug the panel newly made reachable, since
until now you could not edit while reading. `refiled` is the rule, pure and tested: it
takes the new row only when the edited lecture is the open one, and carries the loaded
document across untouched. The folder does not move on a rename (the editor's own hint
says so), so the directory is stable and annotations were never at risk.

*Also:* the title bar now prefers the **open** lecture over the one being edited. That
preference was right when the editor replaced the whole pane and is wrong now that the
panel names its own subject. And `.editor` lost its card chrome to `.editor-panel`, since
the panel is the surface and a card inside it would draw a border inside a border.

**A fourth stylesheet check.** The panel's first draft used `var(--surface-sunken)` and
`var(--text-primary)`; the tokens are `--track` and `--text`. Nothing anywhere reports
that: CSS drops a declaration whose custom property is undefined, so the button simply
renders without a hover state, which is indistinguishable from a design decision until
someone compares it with the canvas. `styles.tokens.test.ts` now asserts every
`var(--token)` resolves, and includes a guard that the scan matches anything at all — the
`lineRects` fixture that fooled itself earlier today is a fresh enough lesson.

The canvas still has no artboard for the editor in either form, so this is designed here on
purpose rather than by default, and the panel joins the list of things owing one.

**2026-10-29 · The badge that sat in the corner of the page**
Reported with a screenshot: a highlight on the first line of a slide drew in the right
place, but its glyph was in the bottom-right corner of the page — far from the highlight,
small, and easy to miss entirely, so the highlight read as unremovable.

The bottom-right corner is not an arbitrary wrong answer: it is what both of `badgeAt`'s
clamps produce *together*, which says the rectangle it was placing from had `x + width ≈ 1`
and `y ≈ 1`. The pdf.js text layer ends with an element pinned across the foot of the page,
and the browser reports it a hair above zero high rather than exactly zero — so it passed
`lineRects`' `height > 0` test, normalised to `x: 0, width: 1, y: ~1, height: ~0`, sorted
last by `top`, and became the rectangle the badge was placed from. Invisible as a fill,
which is why only the glyph looked wrong.

Fixed at both ends, because one of these is already on disk. `lineRects` now requires
`MIN_LINE_HEIGHT` (one CSS pixel) rather than any positive height, so nothing new carries
the sliver; and `badgeAt` places from the last rectangle *with a line's worth of height*,
so the highlight already stored stops showing the bug without a migration (§1.8 — a file
written by an older build is a contract).

**Two thresholds now, deliberately.** `SMALLEST_SIDE` (1e-5, page fractions, on the way
out) asks whether a rectangle can be *stored* and exists to keep floating-point noise out
of a file. `MIN_LINE_HEIGHT` (1px, on the way in) asks whether a rectangle is a *line of
text* and exists to keep the layout's furniture out of a highlight. The sliver cleared the
first at two parts in ten thousand of a page, which is exactly why the second is needed.
Both say so in a comment pointing at the other.

*The first version of the `lineRects` test passed with the fix reverted.* Its fixture put
the foot exactly on the page bottom, where both vertical edges clamp to 1, so it normalised
to zero height and `SMALLEST_SIDE` removed it before the new filter was ever reached — the
test proved nothing and would have gone on proving nothing. Caught only by reverting the
fix to watch it fail, which is why that step is worth the minute it costs. The fixture now
sits a hair above the bottom, where the sliver really is.

*Also:* `geometry.test.ts` passed 300 lines, and split along a seam the suite already had
— normalising *one* rectangle stayed, collapsing a *selection* into lines moved to
`geometry.lines.test.ts`. `expectRect` moved to `expectRect.ts` rather than being copied,
since it encodes a decision about tolerance and two copies is two places to change it. It
also turned out to do by hand what the new test had hand-rolled.

**Still inferred, not observed.** The sliver is a diagnosis from the symptom and the code,
not something read off disk; confirming it means opening the stored `annotations.json` in
`~/NexusVault`, which is outside the repo and needs asking first (§2).

**2026-10-29 · The menu that outlived the page under it**
Reported: switching from scroll mode to page mode left a Remove button floating over a
different page, and the arrows did the same.

Dismissal had been wired into `onScroll`, which is the one way of moving a page that
*isn't* involved here — changing page in page mode swaps the mounted page, and switching
mode or zooming re-lays it out, none of which scrolls. Each control looked right on its
own while none of them closed the menu.

So it is now driven by **what changed rather than by each control remembering to call
`dismiss`**: one effect on the three things that can move a page — which page is showing,
which mode lays it out, what scale it is drawn at. A control added later either moves one
of those or does not move the page, so it needs no line.

That made `dismiss` identity load-bearing rather than tidy. It had depended on the object
returned by `useSelection`, which is rebuilt every render, so an effect depending on it
would have fired every render and the menu could never have stayed open. It now depends on
`clear`, which is stable, and `useHighlightMenu.test.tsx` asserts the stability directly —
the property is invisible in the component and silently fatal.

Two things came out of the same change. `PdfViewer` hit exactly 300 lines, so the zoom
steps moved to `src/ui/zoom.ts`: a real seam, and they had been untestable inside the
component — ten tests now cover the tolerance that stops `+` from a fit-width of 0.9999
looking like a dead button. Both bugs so far in this feature have been geometry, and
geometry is what nothing in the suite can see without a browser.

**2026-10-29 · A highlight refused with a sentence about folder names**
Reported: highlighting a formula reading "R cap" failed with
`ERR_INVALID_NAME` — *"That name cannot be used for a folder on disk... Try a shorter
name, or one without punctuation such as slashes or colons."*

Two defects, and the message was the worse one. `Excerpt::parse` had been borrowing
`CoreError::InvalidName`, so a reader who highlighted a formula was told to rename a
folder. §1.4 asks what the reader should do next; the answer for a name is "pick another
one" and the answer here is "select some words", and no single sentence can be both. Hence
`CoreError::InvalidExcerpt` / `ERR_INVALID_EXCERPT`, carrying **no copy of the text** —
§1.2, and this error's whole subject is someone's study material. The rationale sits beside
the remediation in `guidance`, where someone changing the wording will see it.

The policy underneath it was also wrong. `Excerpt::parse` refused text containing invisible
or control characters, a rule inherited from `Slug` and `Label` — where it is right, because
a name is *chosen*, and a lecture title carrying a bidi override is a way to hide a file in
a sidebar. An excerpt is not chosen. It is copied out of a document someone else wrote, and
PDF extraction yields soft hyphens, zero-width joiners and stray controls as a matter of
course. Refusing lost a highlight for a reason the reader could not act on.

So excerpts **strip** where names refuse, via `text::strip_unprintable`. This is not a
weakened rule: an override that is removed cannot reorder anything, so the display risk is
gone either way and the difference is only that the highlight survives. A selection with no
words in it at all — a diagram, a scanned page — is still refused, now with a sentence that
says so. The length cap is measured after stripping, so a paragraph padded with zero-width
characters is not refused for a length it would not have once stored.

Six tests, including the reported string. None had asserted the old refusal, which is its
own small finding: the strictness was inherited rather than decided.

*Two things found while in there.* `error/mod.rs` crossed 300 lines, and a single `enum`
cannot be split across files — so the seam taken was the one its siblings had already
established: `mod.rs` is now the module root and `CoreError` lives in `core_error.rs`
beside `backup_outcome.rs` and `guidance.rs`. That buys room rather than solving it; when
it bites again the answer is layered errors (`CoreError::Highlight(HighlightError)`), which
is a refactor of every call site and match arm and does not belong inside a bug fix.
And reading the enum end to end turned up two **crossed doc comments**: `UnknownTheme`
opened with "A component of a path inside the vault was a symbolic link" while
`SymlinkRefused` had no summary line at all. Documentation only, no behaviour, but it would
have misled the next reader.

**2026-10-29 · The menu that ran off the right edge**
Reported after the first real use of highlights: a highlight near the right margin opened
its menu off the screen, so Remove could not be reached. The menu was positioned from the
selection's own left edge, which is correct right up until the selection is near the
margin — which is exactly where a menu needs to move.

**The menu measures itself**, because where it fits depends on how wide it is and how wide
it is depends on what it holds: four swatches, or a single Remove. In `useLayoutEffect`
rather than `useEffect`, so it is placed before paint — otherwise it appears off the edge
for a frame and snaps back, which reads as a flicker rather than as a menu opening. The
alternative, an estimated width in a constant, is wrong the first time the menu gains a
control.

**Vertically it flips rather than slides.** Sliding a menu up to fit would park it over the
very text it belongs to, which is the one place it must not be. So near the bottom of the
window it moves above the line instead. Two cases make that rule honest: a selection on the
first line has no room either way, and covering the text below beats being cut off by the
top of the window where there is nothing to drag it back; and the flip is **clamped
afterwards**, because an anchor already off the bottom flips to somewhere equally off the
bottom and the menu is just as unreachable. The first version of this missed that, and the
test caught it.

`placeMenu` takes the viewport as an argument rather than reading `window`, which is the
whole reason the ten cases could be written down at all: a menu wider than the screen, a
selection on the last line, a one-pixel overflow that should move by one pixel rather than
jump to the margin.

This is the first defect found by *using* the feature rather than by looking at it, and
it is a good argument for the same thing as the rest: it is a geometry bug, and geometry
is what nothing in the suite can see without a browser.

**2026-10-29 · Highlights, end to end**
Fourth substep, and the feature now works: select text, pick one of four semantics, and it
is drawn on the page and stored in `annotations.json`. Clicking its glyph removes it.

**The fill takes no clicks.** The layer sits above the pdf.js text layer, and that text
layer is what makes selection work — a highlight accepting pointer events would make the
words under it permanently unselectable, so highlighting a sentence would be the last thing
anyone could ever do to it. `pointer-events: none` on the fill, `auto` on the glyph badge
alone.

**The glyph is placed after the text, not before it.** In front means either hanging it in
the margin, which falls off the page for a highlight starting at the left edge, or covering
the first characters. Trailing whitespace at the end of the last line is almost always
free, and the badge clamps to the page edge when it is not — so the letter that §3 requires
is there exactly when the highlight is widest, rather than falling off at that moment.

**No re-tagging, deliberately.** The menu for an existing highlight offers Remove and
nothing else. Changing its semantic would mean remove-and-add, which mints a new id — and
the id is what `cite://` in the notes points at. Until there is a command that edits in
place, the menu does not pretend to offer it. A test names that reason, so the gap is not
mistaken for an oversight. *(Closed 2026-11-05: `retag_annotation` edits in place and
keeps the id. See that day's entry.)*

**Washes are explicit rgba, with no dark variant.** `color-mix` arrived in Safari 16.2 and
this build targets 15, which the file's existing `accent-wash` had already settled. No dark
variant because §3 keeps the document surface light in both themes, so a highlight always
sits on white. The alphas differ per hue rather than being one number: amber at the weight
that suits blue is barely there.

**`useHighlightMenu` exists because two states with a rule about their combination is the
shape that drifts.** A selection and a clicked badge are different questions — *mark this
as what?* and *what is this?* — and only one menu can be open. Kept apart in the viewer,
a selection made while a badge menu was open would have shown two. The rule is now one
expression, and the badge wins because clicking one is deliberate while a stale selection
often just happens to still exist.

Two things the window counts differently from the file: pages. `asNewHighlight` and
`onPage` are named functions rather than inline expressions for exactly that reason, with
tests on the zero/one boundary, because an off-by-one there is invisible until someone
reopens the lecture.

53 tests across the substep. **What is still unverified is where anything lands**: jsdom
gives every element a zero rectangle, so the arithmetic and the markup are checked and the
pixels are not. That is now true of four separate features, and it is the whole argument
for the browser suite.

Not done, and not pretended: area highlights and text boxes can be stored and the layer
draws an area highlight, but nothing creates either; and re-tagging needs the update
command described above *(done 2026-11-05)*.

**2026-10-29 · A selection becomes something storable**
Third substep of the highlight feature, and deliberately small: `geometry.ts` already did
the part that has to be right — collapsing the browser's client rects into one rectangle
per line and normalising them against the unscaled page. What was left is entirely about
the DOM: which page was selected, which rects belong to it, and what was said.

**The page comes from where the selection started**, read off a `data-page` attribute by
climbing from the node. An attribute rather than anything in React, because the selection
arrives as a text node inside the layer pdf.js builds, and climbing the DOM is the only
thing that works from there. A selection in the sidebar yields `null` rather than page 1.

**A selection dragged onto the next page keeps only the part on the page it began on.**
This is the case worth having: the browser reports rects for both pages, and `normalise`
*clamps* rather than rejects, so feeding it the next page's rectangles would place them
somewhere plausible and wrong. Membership is judged on each rectangle's vertical centre,
so a line overhanging the boundary by a pixel stays with the page it mostly sits on
instead of being dropped from both and lost.

**`Number("")` is `0`**, so a present-but-blank `data-page` would have read as a perfectly
good page 1 and stored a highlight against the wrong page. Checked before converting, with
a test naming the trap.

A candidate is refused when the quote is blank or no rectangle survives, which mirrors
Rust: a text highlight covering nothing is rejected there, so offering a menu for one would
mean offering something that fails the moment it is chosen.

23 tests, split by what they need — 13 pure in Node, 10 under jsdom for the DOM climb.
**Where a highlight actually lands is still unverified.** jsdom reports every rectangle as
zero, so nothing here can check a position; that needs the browser suite.

**2026-10-29 · The window's half of the annotation contract**
Second substep of the highlight feature. `src/ipc/annotations.ts` mirrors the Rust tagged
enum as a Zod discriminated union rather than one wide object with everything optional: a
flat shape would type-check against a file claiming `kind: "textHighlight"` with no
rectangles, which is the contradiction the Rust side was built to make undescribable.

Bounds are checked per component, with the same `1e-6` tolerance Rust uses — a selection of
the last word on a line arrives as `1.0000000000000002` after several float transforms, and
refusing it would drop a legitimate highlight. **Containment is deliberately not
re-checked**: that `x + width` fits the page is Rust's invariant, enforced on the way in and
off disk, and a second copy in a different floating-point implementation is a second thing
to disagree.

11 tests against `fixtures/annotations.json`, the bytes the Rust tests write, covering all
three kinds and what the schema must refuse: an empty `rects`, an unknown kind, an unknown
semantic, a page of zero, and a coordinate off the page.

**2026-10-29 · A shared pill that placed itself**
Reported by the user: on the pane you land on, `⌘O` sat on top of the title bar's
diagnostics button, nearly hiding it — and they reasonably read it as the diagnostics
shortcut, and as a zero rather than the letter O.

It is neither. `⌘O` is the standard macOS Open, and it opens the import picker. It was on
the title bar because `.kbd` carried **`position: absolute; right: 20px; top: 20px`** —
offsets written for the one place the pill existed, the sidebar's search field. Reusing the
class for an inline shortcut inside a sentence, added the same day, sent it out of its
paragraph to the top-right of the window. A regression I introduced in `931d1da`, found by
the user looking at it, as the last several have been.

**The fix is where the split had just put the seam.** A shared primitive says what a thing
looks like; where it sits belongs to the pane around it. The offsets now live beside the
search field in `sidebar.css`, and `.kbd` in `text.css` is a plain inline pill.

That seam is now a test: nothing in `tokens.css`, `text.css` or `controls.css` may set
`position: absolute`/`fixed` or a `top`/`right`/`bottom`/`left` offset. Those three are
imported before every pane, so a positioned rule in them follows the class into each pane
that reuses it — which is exactly how this happened. Proved by restoring the three
declarations and watching the test name all three. A second test asserts the three
filenames exist, so a rename cannot quietly make the check vacuous.

Worth being honest about the pattern: `styles.test.ts` now catches *used-but-undefined*,
*defined-but-unused*, and *shared-but-positioned* — three static classes of stylesheet bug,
all found by someone opening the window. Each new check has come from a defect that reached
the user first. That is the cost of having no renderer, and it is an argument for Playwright
over any further feature.

**2026-10-29 · One stylesheet became nine**
`theme.css` had reached **1204 lines**, and the user asked for it split. It was not only
long: the viewer's rules were in two separate places with four hundred lines of sidebar
between them, because every addition went to the bottom of the file.

**Why it got that big without anyone noticing.** `scripts/check-line-limits.sh` globbed
`*.rs`, `*.ts` and `*.tsx` — **not `*.css`**. The one file the 300-line limit existed to
prevent was the one file the limit did not look at. `*.css` is now in the glob, which is
the real fix; the split is the cleanup.

**The seams, which are concerns and not line counts:**

| File | Holds | Lines |
|---|---|---|
| `tokens.css` | the palette, type scale and spacing every other file reads | 128 |
| `text.css` | headings, prose, and the small recurring labels | 77 |
| `controls.css` | buttons, fields, the segmented switch — the *shared* primitives | 191 |
| `shell.css` | title bar, pane grid, the empty pane; the reset and `body` | 170 |
| `sidebar.css` | search, grouping, lecture rows | 215 |
| `viewer.css` | toolbar, page bed, the notice strip | 191 |
| `textlayer.css` | the pdf.js text-layer **contract** | 135 |
| `import.css` | drop overlay, facet chips, the editor's cards | 103 |

`textlayer.css` is split from the viewer for a reason worth keeping: those rules are
pdf.js's own, consuming `--font-height` and `--scale-x` that it writes onto each span.
Everything in `viewer.css` is a decision we made and may revisit; nothing in
`textlayer.css` is ours to redesign, and mixing the two invites someone to tidy the wrong
half.

**The order in `index.css` is load-bearing** — generic to specific, so a pane can tighten a
shared control (`.viewer-bar .segmented button`) without a specificity fight. Moving a pane
above `controls.css` would silently lose those overrides, which is the one way that file
can be got wrong, so it says so.

**The split was done by a script that proved it lossless** rather than by hand: parse the
133 rules, route each by selector, then assert the multiset of surviving `(selector, body)`
pairs is unchanged. It caught its own gap immediately — the universal `*` reset matched no
module, and the script refused to write anything rather than drop it. Verified again
afterwards against the built bundle: one 17KB CSS file, zero unresolved `@import`, every
pane's rules present.

**2026-10-29 · The stylesheet had ten rules nothing used**
Splitting the file meant reading all of it, which raised the obvious question. `.badge`,
`.facets`, `.field.inline`, `.lecture-title`, `button.link`, `.problem`, `.reset` and the
three `.badge[data-state]` variants were all leftovers of the lecture-card list deleted in
`7762ea0` — still styled, still shipped, three commits after the component went. `.path`
went too: the one place that shows a path, the sidebar footer, styles its own.

`styles.test.ts` now checks **both** directions, and the two need different strictness,
which is the part worth recording:

- **Used but undefined is a bug**, so that scan is precise — `className` positions only.
  A loose reading would demand a rule for every string in the codebase.
- **Defined but unused is a cleanup**, so that scan is deliberately loose — any string
  literal anywhere counts. Over-reading lets a dead rule survive a little longer;
  under-reading would delete a rule that is genuinely in use. The asymmetry is the point.

`markedContent` is named as applied-by-pdf.js rather than excused by a looser rule that
would also excuse a real mistake.

**Two bugs in the test itself, both found by it failing on something I knew was correct.**
The `className={…}` scan matched with a non-greedy `[^}]*`, which stops at the `}` inside
`` `dot ${risk.severity}` `` — so `.dot`, `.notable` and `.informational` had never been
checked at all. It now walks braces counting depth. Then the string scan read a pair of
backticks **in a doc comment** as a template literal and swallowed the `className` line
after it, which is how `.pixel-ghost` reported as unused while being used on the next line.
Comments are stripped first now. Both were the test being wrong about correct code, which
is the failure mode to watch for in a test that reads source as text.

**2026-10-29 · A ghost on the empty pane**
The user's words: the pane is "pretty empty", and could it do something like GitHub's or
Reddit's mascot. It was one grey sentence in the middle of the largest surface in the
window.

There is now a pixel-art ghost, drawn from a 12×12 character grid in `PixelGhost.tsx`.
A bitmap rather than an asset for three reasons that all hold here: it ships inside the
bundle, so there is no image request and nothing to go missing (§3 forbids the app reaching
the network); it takes `currentColor`, so one token themes it and it cannot drift from the
palette the way a baked-in PNG would; and moving an eye is a character in a string, legible
in a diff. Rows are merged into horizontal runs, so the sprite is about twenty rects rather
than 110. The eyes are *absent* pixels, so the pane's own background shows through and it
needs no halo on any surface.

The greeting rotates over five mild lines, one rolled per mount — the pane is seen every
time a lecture is closed, and a fixed joke stops being one by the third reading.
`lineFor(roll)` takes the roll as a parameter rather than calling `Math.random()` inside,
which is the whole reason it can be tested rather than sampled.

**The joke is never the instruction.** The line under it does not rotate and always names
the same three ways to open something, including ⌘O, because a shortcut nobody is told
about is a shortcut nobody has. An empty state that is only witty leaves a tired student no
better off than a blank pane (§1.4).

Also now using `.pane-empty-actions`, which was written in the same session that added
`.pane` and then never applied — the dead-rule check found it, which is a fair first catch.

**2026-10-29 · Grouping on two axes, because one was not enough**
Raised by the user, and they are right: the canvas's segmented control picks exactly one
grouping, so asking for lectures by module puts every lecture of that module in one flat
pile. On a real course that is thirty rows with no structure, and the grouping has bought
nothing. Teaching material is organised by module **and** week at once.

§3 makes the canvas authoritative and §1.7 says a design that is wrong is to be argued with
rather than implemented faithfully. This is the second kind: the control is not wrong about
what it offers, it is wrong about offering only one at a time.

**A second level, not arbitrarily many.** `Then by` sits under the primary control and
offers the facets not already in use. Two levels cover module-by-week and tag-by-week, and
a tree deep enough that finding a heading needs scrolling is its own problem. `Folder` takes
no second level, because it already nests as deeply as the directories do.

The builder is recursive even though the UI offers two levels, because the shape is
identical at every depth and writing it twice is how two copies drift apart. A second level
that repeats the first is ignored rather than drawing every heading twice. Ten tests,
including that a nested row's key is unique across the whole tree — two levels multiply the
chance of a collision, since one lecture can appear under two tags inside different weeks.

**Still not on the canvas**, and now a second thing the canvas should gain, alongside the
per-row edit control and the problem lists.

**2026-10-29 · Components under test, and what that does not buy**
`@testing-library/react` 16.3.3 and `jsdom` 30.1.3, both MIT, installed with permission.
Worth being exact about what they do and do not catch, because the user asked the right
question — how can anything be tested without seeing it?

**They cannot see a layout.** jsdom has no layout engine and applies no stylesheet:
`getBoundingClientRect` returns zeros. **Not one** of the six defects found by looking at
the window would have been caught by a component test — not the missing `flex`, not the
centring that failed for an over-wide page, not the four-digit prefix overlapping a title.
Those need a real browser, which is the Playwright suite in Milestone 5, and that milestone
now looks like it should come sooner rather than later.

**What they do catch is everything between the props and the DOM**: which rows appear and
in what order, what is disabled and why, what each control calls, and what assistive
technology is told. That class of bug was entirely unguarded, and the first run of the new
tests found one.

**The bug the tests found immediately.** A sidebar row renders
`<span>01</span><span>Raft</span>`, with the gap between them coming from a CSS `gap` —
which is not text. So the name the browser computes is **"01Raft"**, one word, and the
conversion state ran straight on after it: a disabled lecture announced as "01VectorClocks
Converting". The row now carries an explicit `aria-label` of the title, with the state
folded in as `Vector Clocks, Converting`, and the number is `aria-hidden` — it is the
folder's prefix, the rows are already in that order, and reading it aloud on every row is
noise. I had written the test expecting "Raft", found it failing, and the right fix was in
the component.

**`styles.test.ts` covers the cheap half of the layout problem without a browser.** It
asserts that every class name any `.tsx` asks for is defined in `theme.css`, which is
exactly the `.pane` / `.pane-empty` defect: names invented while writing a component and
never added to the stylesheet. Proved by adding a class the stylesheet never mentions and
watching it fail with `EmptyPane.tsx: .pane-nowhere`.

Two things make it honest rather than decorative: a second test asserts it actually finds
names on both sides, so a regex that matched nothing could not make it vacuously pass; and
the sources and the stylesheet are read through Vite's `?raw` and `import.meta.glob` rather
than `node:fs`, which avoids pulling in `@types/node` for a test that wants two strings.
That needed `test: { css: true }` in the Vite config — Vitest stubs CSS imports by default,
which made `theme.css?raw` an empty string and the whole test silently vacuous. It passed
in that state, which is a good reminder of why the second test is there.

**The first attempt at proving it was wrong**, and worth recording: deleting the
`.pane-empty` rule did not make it fail, because `.pane-empty p` further down still
mentions the name. The proof only means something when it reproduces the real shape of the
bug — a name used and defined *nowhere*.

**2026-10-29 · What the first real look at the workspace found**
Six defects and two requests, from seeing it running. Most of the defects were mine and
every one of them was invisible to the whole test suite, because nothing here renders.

**1. The viewer never claimed its share of the window, and that caused two symptoms.**
`.viewer` had no `flex`, so inside `.panes` it sized to its content and left the rest of
the window blank. The second symptom was worse and looked unrelated: because the bed then
measured zero width, `fitWidth` hit its `available <= 0` guard and returned 100%, so a page
wider than the pane overflowed. One missing declaration, two bugs that read as separate.

**2. Centring that failed exactly when it mattered.** `.pdf-page` centred with
`left: 50%; transform: translateX(-50%)`. For a page wider than the bed that pushes the
left half outside the scrollable area, where no scrolling reaches it — which is why every
line was missing its first few characters. Now `left: 0; right: 0; margin-inline: auto`,
because auto margins resolve to zero for an element wider than its container and it aligns
to the start instead, staying reachable.

**3. `.pane` and `.pane-empty` had no rules at all.** The shell referenced two class names
that were never written, so the empty state sat at the top left of an unstyled box. This is
the one that should embarrass: the classes were invented while writing the component and
never added to the stylesheet, and nothing anywhere could notice.

**4. A four-digit folder prefix drew on top of the title.** The canvas sizes the number
column at a fixed 16px and shows two-digit prefixes; real folders here are named
`0104-J-no-solutions`. Now a `min-width`, so the common case still aligns.

**5. `Failed` was drawn as bare monospace text** beside `Converting`'s pill, which read as
debugging output rather than a state. It is now a pill in the exam semantic — which differs
from the accent in lightness as well as hue, so the two are distinguishable without colour.

**6. `direction: rtl` mangled the vault path.** It was a trick to keep the end of a long
path visible, and it moved the leading slash: `/Users/me/NexusVault` was drawn as
`Users/me/NexusVault/`. The tail is now chosen in `shortPath`, where six tests cover it,
including one asserting the slash does not move.

Also: the sidebar toggle had `aria-pressed` but no visual state, which is a toggle that
does not look like one.

### Theme choice, which did not exist
Following macOS was the only behaviour; there was no way to pin light or dark. The
preference is per-device state (§3), so it lives in
`~/Library/Application Support/Nexus/theme.txt` beside `last-vault.txt`, with the same
shape: one word of text, an atomic write, and an infallible read that answers `system` for
anything it cannot parse — refusing to start over a preference file would be absurd. A
value that is present but unreadable is logged, because that differs from never having
chosen and would otherwise look like the setting not sticking. Eight tests.

**`system` is stored as a choice rather than as an empty file.** Someone who pins dark and
then goes back to following the system must get the system theme next launch, not dark
again; there is a test for exactly that.

**The dark palette is declared once.** `useTheme` resolves "follow the system" in
JavaScript and always writes a concrete `data-theme`, so the stylesheet needs no
`prefers-color-scheme` twin of the token block. The alternative — a media query for the
system case plus a rule for a pinned one — means two copies of forty tokens, and the first
one forgotten is a bug nobody sees until they switch themes. The system listener is
detached while a theme is pinned, so a pinned theme does not change under you at sunset.

### Page navigation, which the canvas does not have
The canvas's toolbar reads `4 / 18` and that counter only reports. Asked for and added,
marked in the code as additions: arrows to step a page, a number field to jump to one, and
a **Scroll / Page** switch, since reading one slide at a time is a different way to work.

The two modes keep **one source of truth each**: in scroll mode the page being read is
derived from the scroll offset, so `goTo` scrolls rather than setting an index — keeping a
separate index as well would drift the moment someone scrolled by hand. In page mode the
index is the truth and only that page is mounted. Switching modes carries the page across,
captured before the switch because `showing` is computed differently either side of it.

The number field ignores an out-of-range value while typing rather than clamping it:
clamping turns a half-typed `12` into `1` the moment the `1` lands, and the field fights
the person.

### Not done, and worth knowing
- **None of this has been seen running.** The reasoning for each fix is in the code; the
  flex fix in particular is argued, not observed.
- **The welcome screen has no theme control**, because it has no title bar. Someone who has
  never opened a vault cannot change the theme.
- **`theme.css` is past eleven hundred lines.** §4's line check covers `.rs`, `.ts` and
  `.tsx` only, so nothing flags it. It wants splitting.
- **Still no component test.** Every defect above would have been caught by one.

**2026-10-29 · The window finally looks like the canvas**
The app looked like a to-do list of PDFs — a column of cards — and the canvas specifies a
workspace. This replaces the shell with the one on the *Workspace Light* and *Workspace
Dark* artboards: a 40px title bar with the mark, a breadcrumb and two chrome controls, over
a 264px sidebar and the document pane.

**Read off the artboards, not chosen here.** 264px sidebar, 40px bar, 30px rows at 13px,
headings at 11px uppercase with 0.3px tracking, 13px indent per level, 7px row radius, the
search field at 32px with its glyph and a ⌘P badge, the segmented control in a 9px-radius
track. The dark values turned out to match the tokens already extracted into `theme.css`
exactly (`#16161A` chrome, `#2C2C34` border, `#ECEAE7` text), which is a good sign the
earlier extraction was faithful. Eight tokens were missing and are now in: `text-faint`,
`row-text`, `field`, `track`, `segment-on`, `kbd`, `kbd-border`, `accent-soft`.

**The groupings changed, because the canvas's are different.** The first pass offered
Nothing / Course / Module / Week; the canvas's segmented control reads **Folder / Week /
Module / Tag**. §3 makes the canvas authoritative, so those are the four, and "group by
nothing" is gone — the canvas has no such option and a flat list of three hundred lectures
was never the useful default.

**`sidebarRows.ts` decides what the scroller holds; the component only draws it.** 20 tests,
no DOM. The behaviour worth naming: Folder nests a heading per directory level and emits
headings only where a lecture's path diverges from the previous one's, so a run of lectures
in one folder sits under one heading and a later lecture returning to an earlier folder
re-opens it. Groups sort with `numeric: true`, because plain string order puts Week 10
before Week 9, which reads as broken to anyone with ten weeks of lectures. Tag grouping
lists a lecture under **every** tag it carries — hiding it from all but the first would make
a tag an unreliable way to find anything — and gives each of those rows a distinct key, or
React reuses one element for both. Within a group, order is `sequence`, which §3 makes
authoritative.

**Three files were dead and are now deleted** (398 lines), with the user's permission on
2026-10-29: `LectureList.tsx` (the card list), `GroupPicker.tsx` (the old `<select>`) and
`grouping.test.ts`. They referenced only each other; nothing live imported them.

Before they went, the two guarantees `grouping.test.ts` held that the new tests did not were
added to `sidebarRows.test.ts`: that no lecture is dropped or duplicated under a
single-valued facet, and that a group's order is `sequence` — the latter a deliberate change
from `grouped`, which kept the order the vault walk returned. The other three of its five
tests covered `grouped`'s own behaviour and went with it. The TS suite therefore reads 148
rather than 153, and that drop is those five and nothing else.

### Not on the canvas, and needing an artboard
Each is marked in the code where it appears:
- **The per-row edit control.** The canvas's row is a single button with number, title and
  metadata, and offers no way to change a title or its facets. That has to stay reachable,
  and the row is where it belongs. It is a 26px icon button revealed on hover **and on
  keyboard focus**, because a control that appears only on hover cannot be reached by Tab.
  The row had to become a container holding two buttons rather than one button, since a
  button inside a button is not valid HTML.
- **The two problem lists.** Folders the walk skipped and lectures that could not be read
  have no place on the canvas. They are at the foot of the sidebar's scroller under the
  canvas's own heading style, because a vault of three hundred lectures with one corrupt
  manifest must still say so (§1.1).
- **The empty pane.** Every Workspace artboard shows a lecture open. `EmptyPane` is
  deliberately plain and carries the two controls with nowhere else to go — "Add a lecture",
  since the canvas offers only drag-and-drop and ⌘O, and "Open another vault".
- **The diagnostics button** is drawn and disabled rather than omitted: it is on the canvas,
  it belongs to Milestone 5, and a control that appears later moves everything beside it.

### Also worth recording
- `theme.css` is past a thousand lines. The line limit in §4 covers `.rs`, `.ts` and `.tsx`
  only, so the tool does not flag it, but the file now holds tokens, both themes, and every
  component's styles. Splitting it into tokens and per-area sheets is a real improvement and
  is not done.
- `useOpenLecture` now carries the whole `LectureRow` rather than the title. The shell needs
  the directory to mark the right sidebar row and the facets for the breadcrumb, and looking
  those up by title would be wrong the moment two lectures share one — two courses each
  having a "Week 1" is ordinary, and nothing prevents it.

**2026-10-29 · Selection into coordinates that can be stored**
`src/pdf/geometry.ts`: what the cursor did, turned into §3's normalised `[0.0, 1.0]`
rectangles. Pure arithmetic, 19 tests, no DOM.

**Normalising against the rendered page box satisfies §3 for free.** The zoom divides out,
so a highlight made at 300% is the same stored numbers as the same highlight made at 50% —
there is a test asserting exactly that across the four zoom levels the milestone names, and
another for the round trip back through pixels. Rotation needs no special case either,
because `getViewport` has already applied the page's `/Rotate` to the box being divided by.
That is also what makes these coordinates portable to an iPad rendering at a third size.

**It clamps and drops rather than letting Rust refuse.** `NormalizedRect::new` rejects a
component outside the unit interval, a non-positive side, and a rectangle that starts on
the page but extends past its edge. A selection grazing a margin is ordinary cursor
behaviour, not an error worth showing anyone, so each edge is clamped independently — which
keeps the part of the rectangle that is on the page instead of discarding it whole — and
what is left degenerate is dropped. A test drives the awkward cases through and asserts
every surviving rectangle satisfies all four of Rust's rules.

A sliver is dropped at one part in a hundred thousand of a page rather than at zero,
because "positive" is not the same as "findable": a rectangle 1e-17 of a page wide passes
Rust's check, would be stored, and could never be seen or clicked again.

**`lineRects` is the part with real behaviour in it.** The browser reports one client rect
per text fragment, so a sentence crossing three spans arrives as three rects, and a nested
span reports one that overlaps its parent's. Drawn directly that gives a highlight with
seams and double-darkened patches. Rects are grouped into lines by **vertical overlap, not
matching tops**, because a line containing a superscript or an inline formula has rects of
different heights and tops that a reader sees as one line — grouping on tops would split it
and draw a notch. Sorted first, so a backwards drag stores the same rectangles as a forward
one, and the caller's array — the DOM's own list — is copied rather than sorted in place.

`toSorted` would have been the natural way to do that and is not used: it is ES2023, it
arrived in Safari 16, and this build targets Safari 15. The compiler caught it.

**2026-10-29 · Text you can actually select**
The viewer drew pages but a cursor had nothing to hold: a canvas is pixels, and pixels
contain no text. pdf.js's `TextLayer` lays the page's text out as transparent spans,
positioned glyph by glyph over the same pixels, and the browser's own selection works on
those. So selecting and copying now work, and `⌘C` takes the real characters.

**Its own component, for the same reason each page is.** A text layer is rebuilt on every
zoom change, so unmounting has to cancel it — and `cancel()` stops the work while leaving
whatever it already appended, so the cleanup clears the element too. Without that, a zoom
would stack a second set of spans over the first, which reads as doubled, unselectable text.

**The CSS is pdf.js's contract, not a design choice.** The layer writes per-span custom
properties (`--font-height`, `--scale-x`, `--rotate`) and expects the stylesheet to turn
them into position and size; get them wrong and selection lands on the wrong glyphs. Taken
from `pdfjs-dist/web/pdf_viewer.css` rather than invented, and **flattened out of its nested
form on purpose**: CSS nesting needs Safari 16.5 and this build targets Safari 15, so the
nested original would ship unparsed and every span would pile up at the page's top-left
corner. The selection colour is the one part that is ours, derived from `accentInk` because
the canvas has no artboard for a text selection — `accentInk` is the token §3 designates for
chrome drawn on the page, and the page is light in both themes, so one value serves both.

**The accessibility structure was wrong before this and is fixed by it.** The canvas carried
`role="img"` with a `Page 4` label, which is all a screen reader got: a page of text
announced as a picture called "Page 4". Now the canvas is `aria-hidden` — it is a picture of
text the layer below carries as real text — and the page's own element holds the label.

**One trade worth writing down: `disableFontFace: true` costs some text-layer precision.**
With it set, no foreign font program reaches the operating system's font engine, which is
the security property that matters most in this file and is why it is set. The cost is that
the text layer cannot measure with the document's real font; pdf.js falls back to standard
families and stretches each span with `--scale-x` to match the recorded width. Span-level
geometry stays right, which is what sentence highlighting needs, but character-level
positions inside a span are approximate. Keeping the security property and accepting
approximate intra-span geometry is the right way round for this app, and if highlight
geometry ever looks off by a character, this is the reason — not a coordinate bug.

**Not tested, and this is the honest limit of the substep.** `PdfTextLayer` has no test, for
the same reason as the other components: there is no React harness here, and
`@testing-library/react` is an install (§2). What *is* coming next is testable and is where
the real risk lives — turning a DOM selection into the normalised, rotation-aware
`[0.0, 1.0]` coordinates §3 requires, which is pure arithmetic and gets the same treatment
`src/pdf/pages.ts` got. Selection was the prerequisite; the coordinate math and the four
highlight semantics are the next substep.

**2026-10-29 · Three things the first real run of the viewer exposed**
The user opened a lecture successfully in the app, and in doing so found two bugs and one
missing feature. All three were in what surrounds the viewer rather than in it.

**1. `logging::vault_opened` had no caller, so a working session logged nothing.** The
function was written, documented and never invoked. Every failure path *was* wired, so the
log file was created and stayed zero bytes on every run that went right — which is
indistinguishable from logging being broken, and was reported as exactly that. Now
`open_vault` times the walk and records it.

The test is `crates/src-tauri/tests/vault_logging.rs`, and it was checked by removing the
call again: it fails with an empty log, which is the symptom that was reported, and passes
with the call. It asserts the counts and the timing reach disk **and** that neither the
lecture title nor the vault path does — a path carries folder names, which carry course
titles, so §4's rule is one the one new log line could most easily have broken.

Worth naming: the missing call was invisible to every existing test, because a test that
exercises a function cannot notice that production never calls it. The only thing that
catches a *missing* call is a test that drives the real entry point and looks at the
output, which is what this one does.

**2. A remediation sentence pointed at a file that is never written.** The fallback error
named `~/Library/Logs/Nexus/app.log`; `tracing_appender::rolling::daily` writes
`app.log.2026-10-29`. So the one message whose entire job is to tell a stuck reader where to
look sent them to a path that does not exist. §1.4 is specifically about this reader. The
message now names the folder, and CLAUDE.md §4 carries a dated clarification because the
wrong wording had been copied out of it.

**3. The dev server opened in a browser said "this is a bug in Nexus", which was false.**
`localhost:1420` in a real browser has no IPC to reach, so every call fails and the generic
fallback blamed Nexus for a bug that is not there. `asCommandError` now checks `isTauri()`
first and says what is actually true: this page is the development server, the window is
where Nexus can read files, run `npm run tauri dev`.

Three tests cover it, including one proving the check did not become a filter in front of
every rejection — a well-formed `CoreError` still passes through outside the window. The
generic branch needed `globalThis.isTauri` set in the test, because that flag is what
`isTauri()` reads and the Tauri runtime is what sets it; without that the old test would
have silently started checking the new branch instead of the one it was written for.

**4. Text selection does not exist yet, and it is this milestone's next item.** The viewer
renders pages to canvas only. A canvas has no text, so there is nothing to select — pdf.js
builds a separate transparent text layer, positioned glyph by glyph over the canvas, and
that layer is what a cursor interacts with. It is M3's third checklist item ("text
highlights"), and selection is its prerequisite rather than a separate feature: spec line
105 and Journey 2 both start from selected text. Not deferred, just not reached.

**2026-10-29 · The viewer draws pages, and one withheld file was not withheld enough**
Milestone 3's first working substep: a lecture opens, its pages render, virtualised, with
the toolbar the canvas specifies.

**Read the canvas first, per §3.** The *Workspace* artboard's viewer toolbar reads
`4 / 18 · − · 124% · + · Fit width`, so those are the controls, in that order. The page
surface is `--surface` in both themes and only the bed around it changes, which is §3's no
dark-mode-inversion decision rendered rather than restated.

**The arithmetic is a separate, tested module.** `src/pdf/pages.ts` is pure numbers —
stacking, the render window, which page is "showing", fit-width — because there is no React
component harness in this repository and anything inside a component is logic nothing
checks. Twenty-two tests, and they are mostly the cases that are wrong by one: the buffer
clamped at both ends, a page touching the fold counting as visible, a macOS rubber-band
overscroll reporting a negative `scrollTop`, a viewport with no height on first paint, and
scrolled-past-the-end falling back to the last pages instead of a blank window. One of my
own expectations in that file was wrong and the code was right, which is the test earning
its place.

**"Showing" is the page with the most of itself visible, earliest on a tie.** Reading the
page under the top edge instead is the flicker every PDF reader gets wrong at some point,
and a toolbar that alternates between two numbers at one scroll position looks broken.

**Each page is its own component so that unmounting cancels its render.** One canvas redrawn
for whichever page is visible needs that bookkeeping written by hand, and the bug is a stale
render finishing after a new one started and painting the wrong page over the right one.
Canvas pixels are sized by `devicePixelRatio` *and* capped at 16 megapixels, because WebKit
refuses a canvas past a platform limit and then hands back a blank surface — a page
magnified to 600% on a retina display has to render slightly soft rather than not at all.

**A withheld file was not withheld enough, and the build is what caught it.**
`WITHHELD_FILES` named `quickjs-eval.wasm`, which is the engine that would execute a PDF's
own JavaScript. Inspecting the built bundle showed **`quickjs-eval.js` still in it**: pdf.js
ships a plain-JavaScript fallback beside every wasm module for environments where wasm will
not load, so withholding only the `.wasm` left the script engine reachable by precisely the
path that opens when wasm is blocked — which, given the CSP, is a path that could open.

Now a prefix (`WITHHELD_PREFIXES`) swept by basename after the copy, so it covers both files
and anything else added under that name later. The image-codec fallbacks
(`jbig2_nowasm_fallback.js`, `openjpeg_nowasm_fallback.js`) are deliberately **kept**:
decoding a picture is not executing a document, and losing them would mean a scanned page
rendering blank if wasm ever fails.

Worth naming as a lesson rather than a fix: the list was written from what the directory
*appeared* to contain, and the error was only visible in the output. Verifying the artefact
rather than the intention is what found it.

**The assets are served from one path in dev and in the build.** `vite/pdfjs-assets.ts`
serves `/pdfjs/...` from `node_modules` in development and copies the four directories at
build, so the installed package stays the single source and the engine is configured against
one URL. Copying them into `public/` would have committed four megabytes of vendored binaries
and let them drift from the installed version. The dev middleware normalises the path and
checks containment before serving — dev-only, and done anyway, because the habit is what
makes the build-time copy obviously safe.

**Every engine option is annotated with the threat it closes.** `isEvalSupported: false` for
the CVE-2024-4367 class, `enableScripting: false`, `enableXfa: false`, `disableFontFace: true`
so no foreign font program reaches the operating system's font engine (which also keeps
`font-src 'self'` from needing `blob:`), `disableAutoFetch: true` so only the ranges a visible
page needs are read, `maxImageSize` as a decompression-bomb guard, and no `docBaseUrl` so a
reference to an outside file cannot be built from the document.

**`importEach` moved out of `App.tsx`** when the file crossed 300 lines. That is the limit
doing its job: the sequential import loop belongs with `dropped.ts`, which already owns what
to do with dropped files, and it arrived with five tests it could not have had inside a
component — including one asserting the second import has not begun before the first has
finished, which is the property the sequencing exists for.

### Open task, raised 2026-10-29
- **`DocumentNotice` has no artboard.** §3 makes the canvas authoritative and this state was
  asked for after it was drawn. Tokens are the canvas's own rather than invented, and the
  canvas wants the state added, as was done for the reorganize dry run.
- **`vite/` is not type-checked.** `tsconfig.json` includes `src` and `fixtures`, so the
  plugin is transpiled by esbuild without a type check and a mistake there would reach the
  build rather than the gate. Including it needs `@types/node`, which is an install and
  therefore §2. Named rather than quietly accepted.
- **No component is tested.** `PdfViewer`, `PdfPage`, `DocumentNotice`,
  `useRememberedVault` and `useOpenLecture` have no tests, because
  `@testing-library/react` is an install. The logic under them is tested; the wiring is not.
- **Nothing has been measured.** Not the scan on open, not the render of a large lecture,
  not `disableFontFace`'s cost against the system font engine. All three are recorded as
  trades made on reasoning, to be revisited with numbers rather than by feel.

**2026-10-28 · Screening a foreign PDF, and saying what was found without overstating it**
User instruction the same day: *"make sure you code safe against any possible security
thread while importing and reading foreign pdfs"*, then *"if possible we can even flag pdfs
that potentially are dangerous"*. Both are now built on the Rust side, ahead of any viewer
code, because a screening step added after a renderer works is a screening step that gets
skipped on one code path.

**The three viewer decisions the user approved**: the asset protocol with a scope narrowed to
the opened document, `'wasm-unsafe-eval'` on `script-src` only, and JavaScript embedded in a
PDF never executed (`isEvalSupported: false`, `quickjs-eval.wasm` not shipped). Recorded here
as settled.

**The scan matches PDF *names*, not substrings, and that is the whole design.** A PDF name may
write any character as a `#` hex escape, so `/J#61vaScript` is the same name as
`/JavaScript` to every reader and invisible to a byte search for `"/JavaScript"`. The obvious
implementation is one an attacker steps around by typing three characters. So `RiskScan` is a
state machine over name tokens that decodes `#xx` escapes, which also kills the opposite
error: `/JavaScriptSettings` is a real name in some producers' output and is no longer a
match.

**It is resumable, because a lecture PDF can be hundreds of megabytes.** The caller streams
64 KiB at a time and the scanner holds a partial name across the boundary. A test feeds one
document split at *every* offset and asserts the answer never changes, and another feeds a
document one byte at a time so every `#xx` escape is split across three calls. Name length is
capped, so a file that opens a name and never closes it cannot grow memory.

**What it refuses to claim.** A malformed escape (`/J#zz`) makes the name *unmatchable*
rather than being repaired into a guess — reporting a name we misread would be worse than
missing it. Matching is case-sensitive because PDF names are: `/js` is a different name and
means nothing.

**The limits are written into the module doc, not buried.** This is a surface scan, so it can
miss things — indicators inside a compressed object stream (`/ObjStm`) are deflated bytes no
byte scan can see — and it can over-report, since no structure is tracked. An empty result
therefore means *nothing found*, never *nothing there*, and there is a test named for that
distinction whose only job is to document it. A full PDF parser in `lecture-core` would be a
larger attack surface than the thing it guards.

**The scan reports, it does not gate**, and nothing refuses a document for having indicators.
A study app that would not open a lecture deck because it contains a hyperlink is useless, and
the actual defence is not the scan: it is that the viewer does not execute JavaScript, does
not launch programs and cannot reach the network. The scan exists so a person is *told*.

**Every explanation is two sentences, and the second one is the point.** "This document
carries JavaScript inside it. Nexus never runs a document's script, so it cannot do anything
here." A person given only the first sentence has been handed a worry with no way to put it
down (§1.4). There is a test asserting every variant names Nexus, and **it failed when
written** — `Encrypted` said only what the file was. That also surfaced a real gap, now
recorded: Nexus cannot prompt for a PDF password, so an encrypted document's pages will not
appear.

**`needs_attention` is computed in Rust and sent.** The severity rule has one home; a second
copy in TypeScript would drift, and the first time it did the UI would either nag about
hyperlinks or stay quiet about a launch action. It also gives `warrants_a_warning` a real
caller rather than leaving a function nothing uses.

**The PDF signature is checked.** A file named `.pdf` is not a PDF, and the viewer gets a
document or an error, never a surprise — a conversion that wrote something else is a
converter fault worth reporting. Read across buffer boundaries, so `%PDF` without the hyphen
and a zero-byte file are both refused, each with a test.

**`BufReader::fill_buf` rather than reading into our own buffer**, which is not a style
preference: it hands back a slice the reader owns, so there is no `buffer[..read]` anywhere
in the inspector and §4's ban on indexing that can panic is satisfied by construction rather
than by inspection.

**The webview will be given one file, not a directory.** `open_document` is written to grant
the asset scope for exactly the document being opened — not the vault, and not the
`$HOME/**` glob these configurations usually become. The webview renders foreign documents,
so its reach is the thing most worth keeping small.

### Open task, raised 2026-10-28 (document viewer)
- ~~The window cannot yet read the file `open_document` returns.~~ **Done the same day**,
  with permission: `protocol-asset` enabled, `http-range` 0.1.6 (MIT) fetched and recorded,
  and the grant made for one screened file at a time. The static scope stays `[]`.
- **The scan runs on every open.** Reading a 200 MB PDF to screen it is roughly a fifth of a
  second, which is probably fine and has not been measured. If it needs caching, the result
  belongs in `.nexus/` — it is derived from the vault and fully rebuildable by rescanning,
  which is exactly §3's test for what may live there.
- **Encrypted PDFs are not supported.** No password prompt exists, so an encrypted document
  reports the `encrypted` indicator and then fails to render. The indicator's wording says so.

**2026-10-28 · `pdfjs-dist` is in, and what it drags behind it**
Installed with permission (§2): `pdfjs-dist` **6.4.299**, Apache-2.0, pinned exactly, which
is this repository's convention — `package.json` carries no version ranges, so a fresh
`npm ci` six months from now resolves what was tested rather than what is newest.

Latest at the time of install, chosen over staying on 5.x because nothing in the viewer
exists yet to be held back by it: the cost of moving majors is lowest before the first line
is written.

**It is not one file, and this is the part that matters for an offline app.** `pdf.js` fetches
four categories of asset lazily, at the moment a document needs them:

| Directory | Size | Needed for |
|---|---|---|
| `cmaps/` | 1.6 MB | CJK character encodings |
| `standard_fonts/` | 816 KB | the 14 standard PDF fonts, when a document does not embed them |
| `iccs/` | 20 KB | ICC colour profiles |
| `wasm/` | 1.5 MB | `jbig2` and `openjpeg` image codecs, `qcms` colour, `quickjs-eval` |

Every one of those is a runtime fetch. Against our `default-src 'self'` CSP they would fail
closed — which is the right failure, but it would land as a lecture that renders without its
fonts, or a scanned page that renders blank. The spec says "Bundled Assets Only" (line 34)
and §1.2 says the material never leaves the machine; both point the same way, so all four
have to ship inside the bundle and be addressed by a same-origin path.

`wasm/jbig2.wasm` is the one worth noticing: JBIG2 is the codec scanned documents use, which
is exactly the lecture material this app is for.

**Three decisions this forces, raised before building rather than after.** They are
security-relevant and not reversible by accident, so they are going to the user:
how the PDF bytes reach the webview (asset protocol with a scope limited to the opened
vault, versus sending bytes over IPC); whether the CSP gains `'wasm-unsafe-eval'`, which
compiling those codecs requires; and whether JavaScript embedded in a lecture PDF is ever
executed — `quickjs-eval.wasm` is what would run it, and the recommendation is not to ship
it at all, with `isEvalSupported: false`.

Nothing imports the package yet, so this commit changes no behaviour. It is recorded
separately because a dependency is a permanent cost (§1.5) and the licence register is
part of the deliverable, not an afterthought.

**2026-10-28 · The app reopens the vault you had open, and the spec was wrong about dark mode**
Reported from use: every launch showed the picker, and the question that came with it was
"what happened to the `.nexus` directory which was supposed to hold all this?" — worth
answering in full, because the answer is a locked decision rather than a missing file.

**Remembering a vault was never `.nexus/`'s job.** §3's test for `.nexus/` is "can a vault
scan rebuild it?", and this fails it twice: a scan cannot know which vault someone last
chose, and more simply, this names *which* vault, so it cannot live inside one. It is
per-device state, so it goes in `~/Library/Application Support/Nexus/last-vault.txt` — where
no sync client can see it, so two devices cannot conflict over it and each keeps its own
place.

`.nexus/` itself is still unbuilt — the M1 cache item is unticked, which is why the folder
has never appeared. That item's own wording said "`.nexus/` rebuildable cache, **including
per-device view state**", which contradicts the locked decision it was meant to serve. The
line was corrected rather than the design.

**A line of text, not JSON.** `device_state` uses JSON because `ViewState` has fields that
will grow. One path has nowhere to grow to, and a versioned envelope around it would be
ceremony. The honest cost is recorded in the module: a vault directory whose name *ends* in
a newline does not round-trip, since the trailing newline is stripped. Only `\n` is
stripped, not all whitespace — a name ending in a space is legal and survives, and there is
a test for it.

**`recall` is infallible on purpose.** Nothing recorded, a file that will not read, a vault
since moved, renamed or deleted — every one has the same answer, which is to ask which vault
they want. A launch that refused to proceed because of a stale breadcrumb would be strictly
worse than one that shows the picker, so none of these is an error to return.

**But a vault that is *there* and will not open is different**, and is reported. It worked
last launch, so silently showing the picker would read as the app having lost it (§1.4).
`useRememberedVault` carries that one out as `lost` and the shell shows it as a note rather
than as a failed launch.

**Recording is a separate command from opening, and best-effort.** `open_vault` runs again
after every import and every edit; a person *choosing* a vault happens once, and that is the
event worth recording — so folding the write into `open_vault` would have made the read
command write on every refresh. `remember_vault` is also deliberately infallible, following
`device_state`'s breadcrumb: failing to record a convenience must never be the reason
opening a vault reports an error. The failure is logged as its code.

**The shell holds its render while looking.** One file read, so it is imperceptible, and
painting "Open a vault" first and replacing it reads as the app forgetting and then
remembering. The restore is folded into the existing state with a functional update, so
someone who clicks *Open a vault* before it lands keeps the vault they chose rather than
having it replaced.

**`GroupPicker` was extracted** because `App.tsx` hit the 300-line limit — the limit doing
its job rather than getting in the way, since the shell had started accumulating controls
that are not the shell's business.

**Not tested, and said plainly:** `useRememberedVault` has no test. There is no React
component harness in the repo — `@testing-library/react` is an install, and §2 makes that
the user's call — so the hook's decisions are covered only by the Rust tests underneath it
and the payload schema beside it. The store itself has eleven tests, including the moved,
deleted, replaced-by-a-file and hand-emptied cases.

**Dark mode: the spec was wrong, and the user confirmed which way.** `claude-spec.md` line
104 asked for an "optional Dark Mode filter for late-night reading" on the PDF, which
contradicts §3's locked "no dark-mode PDF inversion". Raised rather than implemented, per
§1.7; the user's answer (2026-10-28): *"i didn't want the pdf it self to become dark. only
the UI should become dark, becuase pdf becoming dark can cuase issues with images in the
pdf"* — which is §3's reasoning exactly. The spec is amended in place with a dated note
beside the original wording, so nobody has to guess later whether the difference was
intentional.

**2026-10-28 · Every real conversion was crashing, and the tests could not have caught it**
Reported from use: a dropped `.pptx` came in as "could not be converted to a PDF", with a
macOS "soffice quit unexpectedly" dialog behind it. The gate had converted a real `.pptx`
an hour earlier.

**Root cause: `-env:UserInstallation` takes a URL, and we were handing it a path.** The
profile base is `~/Library/Application Support/Nexus/profiles/...`, so the argument read
`file:///Users/.../Application Support/...` with a raw space in it. `soffice` parses that as
a URL, fails to open its own configuration, throws a
`com::sun::star::uno::RuntimeException` inside `desktop::Desktop::Init`, and -- having no
handler -- calls `abort()`. SIGABRT, which macOS reports as a crash.

**Why no test caught it, which is the more useful half.** `command_arguments` is asserted
exactly, and the end-to-end tests run the real binary; both passed throughout. The asserted
path was `/profiles/libreoffice-1` and the end-to-end profile base was a `TempDir` under
`/var/folders/...`. Neither contains a space. The tests were not weak about the argument
*list* -- they were blind to the argument's *encoding*, because every path they chose
happened to need none, and the one path the app actually uses needs it every time.

Confirmed before fixing, by running the real `soffice` twice on the repo's own fixture,
changing nothing but the profile directory: no space converted and produced a PDF; `with
space` printed `libc++abi: terminating due to uncaught exception` and produced nothing. The
crash report named the same frames.

**Fixed by percent-encoding the path into the URL**, with `/` left alone. Hand-written
rather than adding `percent-encoding`: §1.5 makes a dependency a permanent cost, and this is
fifteen lines over a byte range. It encodes bytes, not chars, so a non-UTF-8 or accented home
directory survives.

**And the fixture now has a space in it.** `tests/end_to_end.rs` builds its profile base
under a directory called `Application Support`, because the tests that run the real binary
are the only place this class of bug can be caught, and they were the ones missing it. The
new `tests/profile_url.rs` covers the encoding directly, including `#` and `?` -- those
truncate a URL rather than breaking it, so they would have pointed `soffice` at a *different*
directory silently.

**Separately, and found while looking for the log: nothing ever started logging.**
`logging::start_for_this_device` had no caller, so the shipped app wrote no log at all and
`~/Library/Logs/Nexus/` did not exist. A previous entry here recorded logging as "wired into
the four places that previously discarded an error in silence", which was true of the call
sites and false of the subscriber -- so this crash had to be diagnosed from a macOS crash
report. §1.1: the claim was reported as outcome without being observed.

`run()` now starts it, and a failure to start is not fatal -- no log is bad, refusing to open
a vault because a log file would not open is worse. Files are `app.log.<date>`, since the
appender rotates daily.

**Still missing, and worth saying plainly:** the converter records *that* `soffice` failed,
not *how*. We use `Command::status()`, so its stderr goes nowhere and neither the exit code
nor the signal is kept. Exit 134 would have said "crashed" rather than "refused" immediately.
The canvas's diagnostics drawer specifies converter stdout and stderr "verbatim", which
**conflicts with §4** -- `soffice` prints the path it is converting, and §4 forbids a path
reaching the log. Not resolved unilaterally: the safe subset is the exit code and signal,
which are numbers, and that is what should land first.

**2026-10-28 · A lecture can be renamed, and the blocked reason finally tells the truth**
Two fixes the real vault asked for, done together because they are both one-field edits to a
manifest and neither is worth its own gate run.

**Titles are editable.** A lecture is named after the file it was imported from, and the
user's own vault had one called `TMSCOMSSAD18~TMSCOMSSSE01~2026~1` with no way to fix it.
`Manifest::with_title` now exists beside `with_facets`, and the command that was
`set_lecture_facets` is `edit_lecture`, taking a `LectureEdit` that carries the title
alongside the four facets.

**One command and one write, not two.** A rename and a filing are the same shape of
operation — load the manifest, replace a field, write it back atomically — and splitting
them would mean two IPC calls from one form, with a state where the title saved and the
facets did not. `crates/src-tauri/src/facets.rs` became `edit.rs` and `FacetEditor` became
`LectureEditor`, because a module called *facets* that also renames things is a module whose
name has stopped being true.

**The title is not optional the way a facet is, and the asymmetry is deliberate.** A blank
facet clears it, because "no week" has to be expressible. A blank title is **refused**
(`ERR_LECTURE_NEEDS_A_NAME`): a lecture with no facets is normal, a lecture with no name is
not, and quietly keeping the old title would tell someone their rename had worked. §1.4.

**Renaming moves nothing on disk**, which is §3 doing its job: the folder layout is a
derived projection, so a title and a directory name are allowed to disagree until a
reorganize re-derives one from the other. Renaming the folder as a side effect of fixing a
typo would move someone's lecture while they thought they were editing text. There is a test
asserting the directory is unchanged, and the form says so under the buttons.

**A test I wrote for the rename found a bug that was already there.** `a_rename_leaves_the
_facets_alone` failed on its first run: renaming a lecture cleared its course, module, week
and tags. `applied` rebuilt the facets from empty and read each field with a helper that
mapped **both** a missing field and a blank one to "no value" — so an edit carrying only a
title looked exactly like an edit asking for every facet to be removed. The doc comment
claimed "an empty string clears it", which was the intent; the code could not tell the two
apart, and nothing had noticed because the form always sent all four fields.

Fixed by making the distinction real: absent keeps what the lecture had, present-and-empty
clears it. `tags` became `Option<Vec<String>>` for the same reason — `#[serde(default)]` on a
`Vec` made "leave the tags" and "remove every tag" the same message. This is the latent kind
of bug that only becomes reachable when a new caller appears, and the new caller was a
rename, where the cost would have been someone's whole taxonomy disappearing because they
fixed a typo.

**And the blocked-reason bug from this morning's entry is fixed.** `ReorganizeBlock::
NameUnusable` told a lecture with no course or week to fix its perfectly good title. The
cause was `VaultReorganize::plan` matching `Err(_)` and discarding the only thing that
distinguished the two failures.

`PathTemplate::render` is now `place`, returning `Result<RelativePath, Unnameable>` instead
of a `CoreError`. That is the real repair: the two causes were always distinguishable *at
the point they occur* — `Slug::from_title` refusing a level, versus `from_segments` being
handed nothing because every level named a missing facet — and only became
indistinguishable by being flattened into an error type that could not carry the difference.
Telling them apart by matching on an error variant downstream would have been guessing at
something the template already knew.

So `plan_reorganize` takes `&[(RelativePath, Unnameable)]`, `ReorganizeBlock` gained
`PatternNeedsFacets` with its own sentence, and `NameUnusable` keeps a reworded one that is
true of the case it now describes. The wire name, the Zod enum and
`fixtures/reorganize.json` followed; the fixture is the proof, since it is generated by
running the real command and it now reads `patternNeedsFacets` for the lecture with no
facets. The canvas was corrected to match (Version 16) — it had been drawn with the old code
on it.

**`render` was replaced rather than kept beside `place`.** Its only production caller was
the planner. Keeping both would have left two ways to ask the same question, one of which
loses information, and the next caller would have had a 50% chance of picking the lossy one.

**2026-10-28 · Reorganize: where it came from, and a sentence that points the wrong way**
The user asked what the reorganize feature is for, saying they were not sure why it was
being built. A fair question, and the answer is worth writing down because the provenance is
not obvious from the code.

**It is not in the spec.** `claude-spec.md` contains no mention of reorganize, renumber,
folder prefixes, path templates or dry runs — checked, zero hits. The capability traces to
two other places:

- `CLAUDE.md` §3's locked decisions, which say `01-` prefixes are a *derived projection* of
  `sequence` kept "for Finder and Files-app legibility", that `sequence` wins when they
  disagree, and that "the app offers a renumber". That mandates **renumber**.
- The user's question earlier the same day — *why does the vault look flat, and what
  happened to organising by weeks and modules*. The answer given was that facets are the
  taxonomy and folders are physical (correct, §3), and alongside it `PathTemplate` and
  `plan_reorganize` were built so the folder layout *could also* reflect the facets.

So **reorganize is a generalisation of §3's renumber rule, not a requirement anyone wrote
down**: filing by facets rather than by sequence prefix. That is recorded here so the next
session does not re-derive it as something the spec asked for. The capability is sound and
the vault is a good argument for it — three lectures deep, one of them named
`tmscomssad18~tmscomssse01~2026~1`, a flat vault is already hard to browse in Finder. Its
*priority* is the open question, not its correctness.

**What it actually does**, so the explanation exists in one place: `preview_reorganize`
renders each lecture's target from a `PathTemplate` and reports the moves, every lecture it
cannot file with a reason, and how many are already in place — touching nothing.
`apply_reorganize` re-plans rather than trusting that preview, orders the renames so each
target is free when its turn comes, breaks a cycle with one temporary name, and reports what
it did. `sequence` and the facets are untouched throughout; a remembered reading position
follows its lecture; an interrupted run is safe to repeat.

**The canvas now has the state it was missing.** Checked before building any of the UI, as
§3 requires: *Required states* covered seven states and reorganize was not one of them, and
neither workspace artboard had an entry point. Added to `States.dc.html` as `Reorganize vault
· dry run` — the pattern field, the three counts, the moves as from/to pairs, the blocked
list carrying its reason code, and a confirm row saying nothing has moved yet. The board grew
from 1700 to 2180 px, so `canvas.json` was sent with it. **Version 15.**

**A real defect, found by drawing it.** Writing the blocked rows meant writing the sentence a
person actually reads, and `ReorganizeBlock::NameUnusable`'s is wrong for the common case. It
says *"This lecture's title contains nothing usable as a folder name. Give it a title with at
least one letter or number"* — but the usual cause is a lecture with **no course or week**
under a template that needs one, whose title is perfectly fine. The vault has exactly that
case today: `week-3-make`, with `facets: {}`.

The cause is lost at `lecture_fs::VaultReorganize::plan`, which matches `Err(_) =>` and
discards the render error. There are two genuinely different failures behind it:

- `Slug::from_title` refuses a level — a title of only punctuation. The current sentence is
  right for this one.
- `RelativePath::from_segments` refuses an empty list — every level was dropped because the
  facets it names are missing. The current sentence is wrong for this one, and this is the
  common case.

One variant, two causes, one sentence that fits only the rarer of them. The canvas now draws
the **accurate** sentence, which makes the code the thing that has to change: split the
variant, give each cause its own remediation, and stop discarding the error that distinguishes
them. **Recorded as an open task and not fixed in this change** — it reaches across the domain
enum, the IPC wire name, the Zod enum and the fixture, and it is not what the user asked for
in the same breath.

**Two other things on the canvas are now out of date**, noted rather than changed, since the
canvas is the user's approved artefact: the *No converter found* card offers "Try Keynote
instead", and Keynote/Pages support was removed on the user's own decision the same day; and
the diagnostics drawer shows `~/Library/Logs/LectureVault/app.log`, which §4 amended to
`~/Library/Logs/Nexus/`. Both would otherwise be built as drawn.

**2026-10-28 · Drag-and-drop import, and the two things the canvas settled for me**
The last gap in §2.3's sidebar line that is not actually the viewer. Dropping files on the
window imports them; the canvas's *Import · drag over window* state is now a real overlay
rather than an artboard.

**It has to be a Tauri event, not an HTML5 `drop`.** A browser `DataTransfer` hands over a
sandboxed `File` and no filesystem path, which is useless to an importer whose job is to
copy bytes out of a file the person already has. `onDragDropEvent` re-emits the OS drag
with real paths, so it is the only version that can work at all. The payload is still put
through Zod (§4): that `@tauri-apps/api` declares a type for it is a statement about the
compiler, and the contents are whatever someone dragged onto a window.

**A payload the schema cannot read counts as the drag having left.** The failure that
mattered to get right. Any other answer leaves the overlay covering the vault with no drag
in progress to end it and no gesture that dismisses it — the person would restart the app
to get their lecture list back. There is a test over ten malformed payloads, and a separate
one asserting an *empty* drop is a no-op rather than a malformed one, since dragging a
folder can produce one.

**Per-file failure isolation, because §1.4 is about exactly this.** Drop four slide decks
and a screenshot: the screenshot is refused and the four decks are in. So the loop catches
per file, collects outcomes, and `noteForDrop` reports them together — "Added 4 lectures. 1
file could not be added. …". Throwing on the first refusal would have hidden four successful
imports behind one error and sent someone looking for lectures that were already there.
Identical remediation sentences are said once: six dropped screenshots are one mistake, not
six.

**Imports run one at a time on purpose.** An import allocates a folder name from the
document's title, so two files landing together could race for the same slug. Sequential is
slower by exactly the amount that makes it correct, and that is written at the call site so
nobody "optimises" it into a `Promise.all`.

**The canvas settled two things I would otherwise have decided badly.**
First, the five format chips. Writing `pdf pptx ppt docx doc` into the component would have
made the window a second opinion about what Nexus imports, free to drift from
`DocumentFormat` — the same class of bug `fixtures/` exists to prevent. So there is a small
`importable_formats` command, and a Rust test asserting it is exactly
`DocumentFormat::ALL`'s extensions. The window now has no opinion of its own.

Second, the drop state's small print says *"or press ⌘O to browse"*. Printing that without
binding the key would have been the app saying something untrue, so ⌘O is bound
(`useMetaShortcut`), gated on a vault being open so a disabled shortcut does not swallow the
keystroke.

**Two values are mine rather than the canvas's, and are marked as such.** The canvas draws
this state on the light artboard only, as a card. A real window needs the page behind the
overlay to recede, so there is a `--scrim`; and the dark theme's accent is light enough that
a 6% wash vanishes on `#16161A`, so `--accent-wash` is 10% there. Both are commented in
`theme.css` as derivations rather than extractions. The arrow is the canvas's own path data
with `currentColor` swapped for its hardcoded `#BE1A72`, so the dark accent reaches it.

**Two lint rules were right and my first draft was wrong.** `restrict-template-expressions`
refused `${count}` in a sentence — numbers need `String(…)`, and the rule exists because
`${someObject}` silently renders `[object Object]`. And `no-unnecessary-condition` called
the unmounted-while-subscribing check "always falsy": the type checker cannot follow a
cleanup closure assigning to a local `let`. Fixed with a small mutable object, which is
honest about being written from elsewhere, rather than by disabling the rule.

**What is not covered by a test, and why.** The overlay, the hook and the keybinding have no
component tests: `@testing-library/react` is an install, and §2 makes that the user's call.
That is the reason the logic worth testing was put *outside* the components —
`dispatchDrag`, `noteFor` and `noteForDrop` are pure and have 21 tests between them. What
remains unverified is specifically the wiring: that a real drag over a real window shows the
overlay and lands the files. **That needs a person to drag a file**, and the user is being
asked to do it.

**2026-10-28 · The reorganize commands cross the IPC boundary, and a comment that was not true**
`preview_reorganize` and `apply_reorganize` are Tauri commands now, so the apply loop added
earlier today has a caller outside its own tests. Two commands rather than one with a flag,
because §3 asks for a dry run and "what would this do" is a different question from "do it".

**`apply` plans again rather than taking the preview back.** A plan is a snapshot of a
vault, and accepting one from the frontend would mean moving real folders according to a
view that may be stale — which the frontend could not be the one to notice, because
staleness is a fact about the disk. So `apply` re-plans and reports what it actually did. If
a facet changed in between, re-planning is the more correct answer rather than a compromise.

**The gap the previous entry named is closed.** `ReorganizeOutcome.moved` had no production
consumer; `apply_under` now walks it and relocates each remembered `LectureView`, so the
page someone had open follows their lecture to its new folder.

**A comment claimed two things, and both were false.** `follow_the_moves` said that failing
to rewrite the device state is "deliberately not fatal to the reorganize" and that it "is
logged by the layer below". The caller propagated it with `?` — fatal — and
`DeviceStateStore::save` returns its error without logging it. Together those meant the
command could move someone's folders and then answer with an error saying the reorganize
failed, sending them to look for lectures where the UI still showed them. That is worse than
an unreported failure: it is a reported one that is untrue, and §1.1 is about exactly this.

Fixed in the direction the comment described rather than by correcting the comment to match
the code, because the comment was right about what should happen. `follow_the_moves` returns
`Option<CommandError>` now, so the signature has no `?` to reach for and the fatal version
cannot be written by accident. The failure is logged where it happens
(`logging::failure`) and reported as `ReorganizeResult::positions_lost` — deliberately
separate from `stopped_by`, which is about folders. The folders moved either way; what is
lost here is the page each lecture was open at, and §1.4 counts that as work even though it
is only a scroll offset.

Its test forces the failure with a plain file where the state directory belongs, which is a
real failing write rather than an injected one, and asserts all three things at once: the
moves are reported, the folders really did move, and the loss comes back with a sentence to
show for it. In that fixture `_held` became `held`, because the underscore said "never
read" and a test now reads it. Clippy caught that, which is the name doing its job.

**The TypeScript half of the contract pair did not exist.** `reorganize_contract.rs` names
`src/ipc/reorganize.test.ts` in its own doc comment as the side that holds the Zod schemas
to the fixture — and that file had never been written, so the pinned fixture was being
checked against nothing. It exists now: 11 tests, including the `stopped_by` / `stoppedBy`
drift the pair was written for, a block reason Rust might add without adding it here, and
the two shapes the fixture cannot carry because pinning them would mean making a real
operation fail. Each negative case was then run through a throwaway probe to confirm it is
rejected on the path it claims rather than vacuously; all four reported the expected Zod
path, and the probe was deleted.

**Still not wired to the window.** Nothing in the UI calls either command: no "Reorganize
Vault" item, no preview panel, no confirm step. Both sides of the contract are complete and
tested; the panel is the next substep, and this is named so that it is a gap rather than an
assumption.

**2026-10-28 · The reorganize apply loop, and a dead enum variant it brought to life**
`plan_reorganize` has existed since this morning with no code that walks it. Now
`lecture_fs::VaultReorganize` plans from a loaded vault and a `PathTemplate`, and applies
the moves. It is the sibling of `VaultRenumber` and deliberately shaped like it.

**Why a half-finished reorganize is safe, which is not the same argument as a renumber's.**
A renumber touches only the derived projection, so `sequence` is untouched and the app still
shows the right order. This moves lectures for real. It is still safe, but for the other two
reasons in §3: *"No central index is a source of truth"* and *"everything inside a bundle is
referenced relatively"*. A lecture that moved and one that did not are both still lectures —
each found by the next walk, neither recording where it used to be. Re-running recomputes
from where things actually are. There is a test that stops half-way, re-opens the vault, and
finishes the job.

**One thing does not follow by itself: the reading position.** `ViewState` is keyed by
lecture path, so a move orphans a remembered page and scroll offset. `RenumberOutcome.moved`
was built for this and **nothing in production ever consumed it** — only a test. So
`ReorganizeOutcome.moved` reports the net effect (never the temporary name a cycle needs),
and the caller owning device state is the one that will apply it. §1.4: losing someone's
place is not acceptable just because it is only a scroll position. **Not yet wired** — the
command that will do it is the next substep, and this is named so it is a gap rather than an
assumption.

**`ReorganizeBlock::NameUnusable` had no producer.** It was declared with a remediation
sentence and constructed nowhere: a variant that read as handled but could not occur. Its
producer is whatever renders the template — the code written today. I found it by getting a
test wrong: I assumed a lecture with no facets would land at `raft` under
`{course}/{week}-{title}`, since a level with no value is dropped. But the level holding
`{title}` names `{week}` too, so **both** levels drop and there is no target at all.

That made the design question concrete: report it, or quietly count it as unchanged? Report.
"Give this a week and I can file it" is actionable; "no change needed" is a mystery. So
`plan_reorganize` took a third argument, `unnameable`, and `BlockedLecture.wanted` became
`Option<String>` — an empty string would have been a worse answer than none. The field was
write-only (nothing read it), so the change cost almost nothing, which is luck rather than
design. An unnameable lecture is also added to the occupied set: it is staying, so its
folder is an obstacle like any other.

**Occupancy is tested precisely rather than approximated.** `existing` is "every path that
is not one of these lectures", and enumerating that would mean walking the whole tree. Only
*targets* can collide, so each rendered target is tested with `storage().exists`. The
preview is therefore complete for the thing it is for, at one stat per lecture.

**Two gate failures worth recording rather than just fixing.**
`tests/support/mod.rs` is compiled into each test binary, so helpers only the reorganize
tests need read as dead code while compiling the renumber ones. Resolved with the same
`#![allow(dead_code)]` and the same reasoning `lecture-core/tests/support/mod.rs` already
carries — with the cost stated in the comment: a helper unused by *all* binaries would not
be caught, which is why that module holds only primitives.

Both new test files passed 300 lines, and were split along the seam the repo already uses:
`reorganize_store.rs` / `reorganize_store_safety.rs` mirrors `renumber_store.rs` /
`renumber_store_safety.rs`, and `reorganize.rs` / `reorganize_blocked.rs` separates the moves
from what is refused. Test counts before and after the split are identical (15 core, 12 fs),
which is how the split was checked rather than by reading it.

**27 new tests.** The load-bearing one replays a cycle against a real filesystem: POSIX
`rename` replaces silently and a permutation with a cycle has no collision-free ordering, so
this proves the planner's sequence works against a disk and not only against a model of one.

**2026-10-28 · Facets are editable and the list groups on them**
The answer to "what happened to organising by weeks and modules", built rather than
explained. Both halves of §3's sentence — *"Taxonomy lives in each bundle's `manifest.json`
as facets … The sidebar groups on facets at runtime"* — are now reachable from the window.

The user confirmed the path fix against the real app first: a re-import of the same PDF
wrote `"document": "source/document.pdf"`. That is the first confirmation of a fix from the
real app rather than from a test, and it also showed `"facets": {}` again, which is what
this entry is about.

**`set_lecture_facets`, in `crates/src-tauri/src/facets.rs`.** Loads the manifest, replaces
its facets, saves through the atomic path, returns the updated row. The lecture does not
move, which is the whole argument for facets over folders: one lecture can be in a week
*and* a topic *and* an exam list, and a folder tree can hold only one of those.

Three decisions worth recording:

- **A blank field clears a facet.** A taxonomy you can only add to is one you cannot
  correct, so `Facets` is rebuilt from empty each time rather than mutated.
- **`custom` keys are carried across.** Rebuilding from empty would otherwise drop them,
  and `custom` is an open map precisely so a person can put something there by hand.
  Dropping keys an edit never mentioned is the silent loss §1.4 rules out.
- **It is `async`.** The same reason as the import, learnt from the picker deadlock: a sync
  command runs on the main thread, and this one reads and rewrites a file.

**Grouping is in TypeScript, not Rust.** §3 says the sidebar groups *at runtime*, and that
is this layer: the rows already carry their facets, grouping them is presentation rather
than domain, and doing it in Rust would put an IPC round trip behind changing a dropdown.
`grouped` is exported and tested as a pure function — the part that can be wrong in a way no
screenshot would show. `Unfiled` always sorts last, because it is the pile to work through
and "Unfiled" falls between "CS454" and "Week 1" alphabetically, which would bury it.

**Two §4 near-misses, both avoided rather than silenced.** `event.target.value as GroupBy`
would have been an unchecked claim — the DOM only promises a string — so the value is matched
against the list the options were drawn from. And `FormEvent` is deprecated in React's own
types, so the submit handler is inline and the event type inferred from the JSX prop instead
of imported.

**Not verified: the interactive path.** The commands and the grouping are tested; clicking
*Edit*, typing a week and seeing the list regroup is not, because there is still no
component test harness (`@testing-library/react` is an install, so §2 makes it the user's
call). This is exactly where the picker deadlock lived, and it is named rather than implied.
The bundle was built and launched to confirm it starts without crashing, which is a weaker
claim than "it works".

**Still ahead:** capturing facets *during* import rather than only after, opening a lecture
in the viewer, and the reorganize apply loop that would make the folder names follow the
facets as §3's derived projection.

**2026-10-28 · The importer wrote vault-relative paths into the manifest — a §3 violation**
The user asked why each lecture got its own folder and what happened to organising by week
and module, and offered the real vault to look at. The design answer is below; looking found
a bug that nothing else would have.

The imported manifest said:

```json
"document": "progdiet-2026-27-msc-software-systems-engineering/source/document.pdf"
```

It must say `source/document.pdf`. §3: *"Everything inside a bundle is referenced relatively,
so moving a bundle directory requires no link rewriting. This property has a test."*

**It was not cosmetic.** `LectureBundle::document_path` is `directory.join(recorded)`, so
that manifest resolved to `progdiet-…/progdiet-…/source/document.pdf` — a file that does not
exist. The lecture could not have been opened, and moving the bundle could not have fixed
it. Every lecture imported before this fix is affected.

**Why the existing test did not catch it.**
`relocating_a_bundle_rewrites_nothing_inside_it` asserts the property correctly — against a
manifest built **by hand** in the test, with bundle-relative paths. Nothing checked that the
*importer* produced a manifest obeying it. Worse, the `ImportPlan` tests asserted
`plan.document() == "cs454/raft/source/document.pdf"`, so **the tests encoded the bug** and
turned green over it.

The general shape is worth naming, because it is not specific to paths: *a domain property
with a test, and a producer that was never checked against that property*. The invariant was
written down, tested, and then violated by the one piece of code that creates the data it
governs.

**The fix: two path frames, named so they cannot be confused.** `ImportPlan` now holds the
bundle plus **bundle-relative** `document`/`original` — what the manifest records — and
composes **vault-relative** paths where I/O needs them: `destination()` for the copy,
`document_in_vault()` for the fingerprint, and the conversion request, since a converter
opens real files rather than reading a manifest. The module header says which is which and
what breaks if they are swapped.

**Four new tests, chosen so the same mistake cannot pass again:**
- `what_the_manifest_records_never_names_the_bundle` — the property, over all three formats.
- `the_recorded_path_resolves_to_where_the_bytes_actually_went` — the two frames must meet;
  stated as one equation rather than two string assertions that could drift apart.
- `the_document_the_manifest_points_at_is_really_there` — resolves exactly as the viewer
  will and asserts the file **exists on disk**. This is the one that would have caught it.
- `an_imported_bundle_can_be_moved_without_rewriting_anything_inside_it` — §3's property,
  end to end, against a bundle the importer actually produced and a real `fs::rename`.

**The user's own vault still holds the bad manifest.** Not repaired here: it is their data,
and §2 puts overwriting it behind asking. Re-importing after deleting that folder, or a
one-line edit of the path, both fix it.

**2026-10-28 · Why there is a folder per lecture, and where weeks and modules live**
Asked directly, and worth recording because it is the least obvious part of the design from
inside the app.

**One folder per lecture is the bundle, and it is locked.** A lecture is a directory holding
`manifest.json`, `document.pdf`, `notes.md`, `annotations.json` and `source/original.<ext>`.
That is what makes it self-contained, movable without rewriting anything, and syncable as a
unit — and §3 defines a lecture as exactly that: *"A lecture is any directory containing
`manifest.json`"*.

**Weeks and modules are facets, not folders.** §3: *"Taxonomy lives in each bundle's
`manifest.json` as facets (`course`, `module`, `week`, `tags`, plus an open `custom` map).
The sidebar groups on facets at runtime, so one physical layout serves many logical views."*
Folders cannot express that a lecture belongs to a week *and* a topic *and* an exam list;
facets can, and nothing has to move to regroup.

**So why does the vault look flat?** Because two halves are built and not wired:
- **Import captures no facets** — it writes `"facets": {}`. Nothing asks for course, module
  or week, so there is nothing to group on.
- **The sidebar does not group** — it renders a flat list and shows facets as chips.

The folder layout can *also* reflect the taxonomy, as a derived projection for Finder
legibility: `PathTemplate` renders `{course}/{week}-{title}` and `plan_reorganize` plans the
moves, both built and tested this morning, neither reachable from the UI. §3 is explicit
that this is a projection and `sequence`/facets remain authoritative.

Recorded as the next work rather than a surprise.

**2026-10-28 · Import is wired, which is what makes a `manifest.json` exist**
The user opened `~/NexusVault`, got "No lectures here yet", and asked why no `manifest.json`
had been created.

Nothing was wrong — but the question found a real gap, and the answer is worth writing down
because it is the part of the design that is least obvious from using the app.

**Opening a vault writes nothing, on purpose.** `VaultRoot::open` canonicalises the path and
stats it; that is all. A `manifest.json` is not a vault-level file — §3: *"A lecture is any
directory containing `manifest.json`"*, and *"No central index is a source of truth. A
top-level file listing every lecture is a sync-conflict magnet."* So there is nothing to
create at the root, and an empty folder genuinely is an empty vault. The app was right.

**The gap was that nothing could create one.** The shell exposed exactly two commands,
`open_vault` and `pick_vault_directory`; `Importer` had existed and been tested in
`lecture-fs` since this morning and **nothing called it**. The app could look at vaults and
not change them, which is a strange thing for it to be.

So `import_document` now exists, with a document picker beside the folder picker, and the
UI re-scans after an import rather than splicing the new row into its list — the vault on
disk is the truth, and a list maintained by appending drifts from it the first time anything
changes a lecture without going through that button.

**It runs on a worker thread, explicitly.** Import copies a whole file and may wait on
LibreOffice for seconds; a sync command would run on the main thread and freeze the window
exactly as the picker did an hour ago. `spawn_blocking` says where the work goes instead of
relying on the macro's threading, which is the assumption that caused that bug.

**Three decisions this command makes, and why they are small ones.** The title is the file's
own stem — a plain guess, because inventing something cleverer would mean two places
disagreeing about what the lecture is called, and the person can rename it. The bundle is
that title slugified at the vault root; a `PathTemplate` is the eventual answer but applying
one on first import would file lectures somewhere before the user has chosen a scheme. And
the sequence appends after the last existing lecture, since `sequence` is authoritative for
order.

**A name already taken is refused, never overwritten**, with a test. Importing over an
existing lecture would destroy its notes and annotations, which is the worst thing this
command could do.

A failed conversion is **not** a failed import: the original is kept, the row comes back
`failed`, and the UI says so plainly. A document Nexus cannot render is still a document
someone may want to keep notes beside.

8 tests, against a temporary vault — `CLAUDE.md` §2 makes pointing the app at a real
`StudyVault` something to ask about first, and a test is exactly where that would be easy to
do by accident. One of them asserts the manifest exists **on disk** after an import, not
merely that the command returned a row, because that is the thing the user went looking for
and did not find.

**2026-10-28 · The folder picker deadlocked the app, and the comment said it could not**
The user: *"as soon as i click on choose vault folder, it opens a finder dialog, but then it
stops responding and i see a rainbow circle loader, and i have to then force quit."*

A real bug, and a bad one: the app had to be force quit.

**The cause.** `pick_vault_directory` was a plain `fn` calling `blocking_pick_folder`. In
Tauri a **sync** command runs on the **main** thread; `#[tauri::command(async)]` is what
moves one to a worker. So it dispatched the native sheet to the main thread and then blocked
that same thread waiting for it. The sheet appeared — the dispatch got through — and then
the run loop stopped, which is exactly the beachball.

**The embarrassing part is the comment.** It read: *"Safe because a non-async Tauri command
already runs on a worker thread — called from the main thread it would deadlock, which is
why this must stay a plain `fn`."* The failure mode was described correctly and the
direction asserted backwards. A confident comment on an unverified claim is worse than no
comment, because it stops the next reader looking. Recorded because the lesson is not "check
the threading model" but **"do not write a justification for something that was never run"**.

**The fix does not depend on being right about it.** `pick_folder` is the non-blocking form:
it hands the request to the main thread and returns immediately, the callback fires later,
and the command `await`s a one-message channel instead of occupying a thread. Nothing blocks
on anything, so no arrangement of threads deadlocks. Choosing the version that cannot fail
beats choosing the version that is fine if an assumption holds — particularly when being
wrong about that assumption is what caused the bug.

**`#[expect]` paid for itself within the hour.** The signature now moves the `AppHandle`
into the request rather than only reading it, so `needless_pass_by_value` stopped firing —
and because the exception was an `#[expect]` and not an `#[allow]`, the build immediately
reported it as unfulfilled and made me delete it. An `allow` would have sat there silently
for years. Noted as evidence for the general rule written down this morning.

**This landed in exactly the gap that was flagged.** The earlier entry says plainly: *"NOT
verified: the React render and the `invoke` wiring ... no button was clicked."* That is the
one thing never exercised, and it is the one thing that was broken. The flag was honest and
it was not sufficient — writing a known gap down does not stop it costing someone an hour.
The real fix is a component test with `@testing-library/react` driving `invoke`, which is an
install and so the user's call; it stays open.

**Still not verified by me.** A native folder sheet cannot be clicked from here, so the fix
is reasoned and compiled but not observed working. Said rather than implied.

**2026-10-28 · The real typefaces, and the icon drawn in the real one**
The user: *"i added bricolate grotesque in my system, you can check, or if you want you can
install freshly and store whereever you want, and for the rest, check in machine, if not
there you can fetch."*

Checked first. Bricolage Grotesque was there — a variable TTF in `~/Library/Fonts` with
`opsz,wdth,wght` axes, and `system_profiler` confirmed it registered. The other three were
on neither the system nor the user path, so they were fetched.

**The icon now uses the genuine glyph.** The generator was Python, which meant drawing the
letter geometrically because no font library was available — a decent approximation of
Bricolage's ExtraBold, but not it. It is now `scripts/make-icon.swift`: CoreText is the only
thing on a stock machine that can rasterise a variable font at a chosen weight, and it needs
no installed dependency. The weight axis is pinned to 800 explicitly rather than trusting a
default instance. The difference is visible — the real N has an angled vertex where the
diagonal meets the right stem, which is the typeface's own and not something anyone would
draw by hand.

Two details worth keeping from that rewrite. The letter is sized by **measuring** it —
rendered at a reference size, its inked bounds read, then scaled so that height is exactly
the intended cap height — because a variable font's reported cap height and its actual inked
bounds are different numbers. And it is centred on those inked bounds rather than on
typographic metrics, so it sits optically centred rather than mathematically centred with a
visible lean.

**Fonts are bundled, not linked.** `scripts/fetch-fonts.py` is the one thing in the project
that touches the network, it is run by hand, and what it produces is committed. A `<link>`
to a font service would make the interface depend on a network the app is not allowed to
use, and would tell that service when someone opens their notes. The CSP would refuse it
anyway, which is the point of having one.

**It deduplicates, and that mattered.** Google Fonts now serves a single variable woff2 for
several weights: IBM Plex Sans 400, 500 and 600 came back byte-identical. Writing each out
would have tripled that family's weight for nothing. Files are grouped by content hash and
emitted once, with a `font-weight` range covering the weights that shared them — 14 faces
became 10 files, 442 KiB became 313 KiB. Found by noticing three downloads reporting
identical byte counts and checking the hashes rather than assuming coincidence.

Only `latin` and `latin-ext` are bundled; the second carries the accented characters a
course or lecture name can easily contain. `font-display: block` rather than `swap`, because
the files are local so the wait is imperceptible, and swapping would flash the system font
over the real one on every launch.

Licences recorded in the dependency table above: all four are SIL OFL 1.1, which permits
bundling and redistribution (§1.2).

**2026-10-28 · The approved design is a canvas, and it is now recorded as authoritative**
The user pointed at the design canvas and said: *"you have to reference this artboard when
creating the UI ... this is what i approved of. so add the artboard in the document or
somewhere so that you don't forget to reference it in the future."*

<https://claude.ai/artifact/5gEifzabFanVAW9R1Wp3i2> — "Nexus UI", four artboards:
*Workspace — Light*, *Workspace — Dark*, *Colour and type system*, *Required states*.

Recorded in three places, because one of them is not enough: `CLAUDE.md` §3 (read fully at
the start of every session), this file (with the values below, so the palette is usable
without opening the canvas), and a memory, so it survives a session that never opens this
repo. `CLAUDE.md` now says explicitly that **where it and the canvas disagree, the canvas
wins** — a convenience copy that silently outranks its source is worse than no copy.

**What this caught.** The first `theme.css` invented a cool pink-grey neutral ramp. The
canvas specifies a **warm stone** one, and the difference showed everywhere. Taken from the
"Colour and type system" artboard:

| Role | Light | Dark |
|---|---|---|
| App chrome | `#F4F2EE` | `#16161A` |
| Page / editor | `#FFFFFF` | `#1A1A1F` |
| Viewer bed | `#EAE7E1` | `#0F0F12` |
| Border | `#E2DFD8` | `#2C2C34` |
| Border, strong | `#D8D4CB` | `#3A3A44` |
| Meta text | `#6E6A62` | `#8F8B84` |
| Secondary text | `#5E5A53` | `#A8A49D` |
| Primary text | `#1B1A18` | `#ECEAE7` |
| Accent | `#BE1A72` | `#FF72C6` |
| On the accent | `#FFFFFF` | `#2B0918` |

`accentInk` `#9E477B` is unchanged in both, because the document surface stays light in both
themes. Highlight semantics confirmed: key `#F2B63C` (ink `#3A2A05`), definition `#2EA37A`,
exam `#E0523C`, question `#2E86DE`.

**Two details worth keeping** that only the canvas says. On the dark accent the label is
**dark** (`#2B0918`), not white — white on `#FF72C6` does not carry. And there are two
distinct border weights, which the first pass collapsed into one.

**Type, per the canvas:** Bricolage Grotesque 800 for the wordmark, 700 for note headings;
Literata 400 for notes prose; IBM Plex Sans 400/500 for sidebar rows, toolbars and section
labels; IBM Plex Mono for paths, cite links and error codes. ~~None of the four is
bundled.~~ **Resolved the same day** — all four are now bundled as local woff2; see the
entry on the real typefaces.

**The canvas holds no app icon or logo.** Its brand is the wordmark "Nexus" set in Bricolage
800 — 15 inline SVGs across the artboards, all interface icons, and no mark. Said plainly
because the user believed one had been added; there was nothing of theirs to use, and
inventing one silently would have been the worse answer.

**2026-10-28 · The app icon was wrong in three separate ways**
The user: *"the dock logo is very immature, no where close to being professional and
modern. all my apple dock logos are having the same size and have rounded corners, this one
for some reason is completely sqare or rectangle and very big than them. also i see the app
name in dock shown as nexus-app instead of just Nexus."*

All three were real, and they had different causes.

**1. Geometry — the actual bug.** A macOS app icon is not a full-bleed square. Apple's grid
insets the artwork inside a squircle and leaves the rest transparent, and the Dock sizes
every icon against that convention, so a 1024×1024 square of colour renders *larger* than
every neighbour and with hard corners. Now: canvas 1024, artwork 824 (a 100px transparent
margin each side), and corners drawn as a superellipse `|dx/a|^5 + |dy/a|^5 = 1` rather than
a circular-arc radius — the continuous curve is why real macOS icons look softer at the same
nominal radius.

**2. The mark.** Flat accent `#BE1A72` with a white letter, both from the canvas; no
gradient, because the system has none anywhere. The letter is the wordmark's initial, which
is the faithful thing to put in an icon when the brand is a wordmark. It is drawn
geometrically and is **not** Bricolage Grotesque — recorded as a known difference rather
than passed off as the real thing. The first render centred the diagonal on the stem
centres, which left a visible wedge in two corners; it is now aligned to the letter's outer
edges.

*(The geometric letter described above was replaced the same day with the real Bricolage
glyph once the user confirmed the font was installed — see the entry on the real typefaces.
The squircle geometry is unchanged and carried over into the Swift generator.)*

**3. The Dock name needed two fixes, not one.** `mainBinaryName` in `tauri.conf.json`
handles the bundled `.app`. But a dev run launches the bare executable, which has no
`Info.plist`, so macOS falls back to the file name — which is why it said `nexus-app`. The
binary target is now named `Nexus` in `crates/src-tauri/Cargo.toml`.

`scripts/make-icon.py` is committed rather than run once and discarded, because the geometry
is the whole point and is not guessable from the result. It writes PNG chunks directly (no
image library is available, and fetching one needs network), antialiasing by exact
horizontal span coverage with vertical supersampling. It needed
`from __future__ import annotations` to run on this machine's Python 3.9.

`npx tauri icon` also emits Android, iOS and Windows assets; those were deleted. This is a
macOS-only app and dozens of unused binaries in the tree are noise, not optionality.

**2026-10-28 · The UI is wired to the backend, and the app runs**
The user asked to start wiring the UI, and asked whether finishing Milestone 2 first would
be better. It was not, and the reason was worth stating: **nothing in this project had ever
run.** 453 tests and zero executions through the real boundary, with the Rust-to-Zod IPC
shape described twice — once by `serde`, once by the Zod schemas — and validated only
against fixtures each side wrote for itself. That is the project's largest untested
assumption, and it gets more expensive to find the longer it waits.

`crates/src-tauri` joined the workspace. It had been held out on purpose (recorded in
`Cargo.toml`), because declaring it pulls several hundred crates into a milestone whose
deliverable was pure domain logic. The user authorised the fetch.

**What now exists:** `open_vault` and `pick_vault_directory` as the only two commands; DTOs
that flatten `LoadedVault` into sidebar rows; a React entry point, the §3 design tokens, and
a window that opens a vault and lists what is in it, including what it could not read.

**The IPC contract is pinned on both sides, the same way the on-disk files are.**
`crates/src-tauri/tests/ipc_contract.rs` runs the **real** `open_vault` against a real vault
on disk — not a hand-built summary, which would pin the struct and prove nothing about the
command — and pins the result as `fixtures/vault-summary.json`. `src/ipc/ipc.test.ts`
asserts the Zod schemas accept exactly those bytes. Neither side can now move without the
other failing, with no code generator and no new dependency. The fixture deliberately holds
one fully-populated lecture and one with no taxonomy at all, because a fixture where every
optional field is filled proves nothing about whether the other language copes when they
are not.

What it pins is field names, types and nullability — **not** byte-for-byte what crosses the
wire, since `serde_json::to_value` sorts keys where serialising the struct keeps declaration
order. Harmless, because JSON objects are unordered, but stated so "matches the fixture" is
not read as a stronger claim than it is.

**Errors cross as a code and a remediation, never as `Display`.** §1.4 says every
`CoreError` carries a machine code and a plain sentence; that pair is exactly what a UI
needs, so it is exactly what crosses. `Display` interpolates paths, and a path a webview
holds can reach a console log or a crash report, which §4 rules out. There is a test
asserting a failed `open_vault` does not leak the path it was given. The cost is honest: a
developer debugging from the UI sees `ERR_IO` rather than which file, and the log is where
that detail belongs, keyed by the same code.

**The folder picker is an IPC command, not the `@tauri-apps/plugin-dialog` npm package.**
Avoids a second frontend dependency for one call, and keeps the platform capability on the
Rust side, which is where §3 puts desktop-only capabilities. `tauri info` now reports that
JS plugin as "not installed", which is correct and deliberate rather than a gap.

**The CSP enforces the offline promise structurally.** `default-src 'self'` in
`tauri.conf.json` means a stray `fetch` or a CDN font cannot work even if someone adds one
by accident. Cheaper and more reliable than remembering not to.

**2026-10-28 · Removing an `.expect()` I had excused instead of fixing**
`run()` ended with `.expect("Nexus could not create its window")` and a doc comment arguing
it was "the one permitted use", because a failure before any UI exists has nowhere to go.
Clippy's `expect_used = "deny"` caught it, and clippy was right: §4 bans `.expect()` in
production code with **no carve-out**, and a comment calling an exception permitted does not
create permission. Writing that justification was the actual mistake — the rule is not the
obstacle, it is the standard.

`run()` now returns `Result<(), tauri::Error>` and `main` returns an `ExitCode`, printing a
fixed sentence and failing loudly.

**The tradeoff, recorded because it is a real loss:** that sentence does not include the
underlying `tauri::Error`, so a startup failure is not diagnosable beyond "the shell would
not start". §4 forbids letting text that may interpolate a path reach a log or a console,
and `tauri::Error`'s `Display` may well contain one. If this ever needs diagnosing, the
answer is a redacting conversion in the shape of `CoreError::log_digest`, **not**
interpolating `Display`.

**2026-10-28 · `#[expect]` rather than `#[allow]` for a framework-dictated signature**
Clippy's `needless_pass_by_value` fired on both commands. For `open_vault` it was right, and
`path: &str` works — checked, not assumed. For `pick_vault_directory` it was wrong: Tauri
implements `CommandArg` for `AppHandle` and not for `&AppHandle`, so a reference fails with
`the trait bound &AppHandle: CommandArg is not satisfied`.

That exception uses `#[expect(..., reason = "...")]`, not `#[allow]`. If Tauri ever
implements `CommandArg` for a reference, the expectation stops being fulfilled and the build
says the signature can be tightened — instead of the exception quietly outliving its reason.
Worth naming as the general pattern: an `allow` is a silence, an `expect` is a silence with
an expiry.

**2026-10-28 · The gate now builds the frontend**
`npm run build` joined `scripts/gate.sh`. Not in §5's literal list, which was written before
there was anything to build; the gate is deliberately stricter rather than looser, and §5
already anticipates growing. Without it a Vite break is invisible — `tsc --noEmit`
type-checks but never bundles, so a bad import or missing asset passes every other step and
fails only when someone tries to launch the app. **Raised rather than silently assumed:** if
the user would rather §5 stay the literal list, say so and it comes back out.

**2026-10-28 · What was verified by running, and what was not**
Verified by observation, not inference:
- `cargo run -p nexus-app` opens a real window. `lsappinfo` showed it registered and in
  front, with WebKit's `Networking` and `Graphics and Media` helpers spawned, which means
  the webview loaded rather than merely being constructed.
- `npm run app` (`tauri dev`) works end to end despite the **non-standard crate location**:
  the CLI finds `crates/src-tauri/tauri.conf.json` and reports our own CSP and
  `frontendDist` back, vite comes up on 1420, `cargo run` follows, and all four crates are
  watched. Worth recording because `crates/src-tauri` is a §3 locked decision and Tauri's
  convention is a root-level `src-tauri/` — it was not obvious the CLI would cope.
- Both were stopped afterwards; `pgrep` confirmed no stray processes (§1.9).

**Not verified, and not claimable:** the React render and the `invoke` wiring. A native
window cannot be driven from here — no button was clicked, and no vault was listed in the
actual interface. The command is tested directly in Rust, the schemas against the bytes it
produces, and the build and launch are observed; the link between them is argued, not
observed. Closing it properly means a component test with `@testing-library/react`, which is
an install and therefore the user's call. Said plainly rather than letting "the app runs"
imply more than it does.

**2026-10-28 · Two placeholders, both deliberate and both recorded**
- **The app icon** is generated, not designed: a page on a brand-coloured bed, written as
  raw RGBA PNG bytes by a script because no image library was available and fetching one
  needs network. It is honest placeholder art, not a finished icon. Tauri rejected the
  first attempt outright — `icon ... is not RGBA` — which is why the colour type matters.
- **The fonts named in §3** (Bricolage Grotesque, IBM Plex Sans, Literata, IBM Plex Mono)
  are **not bundled**, so the UI falls back to the system stack. All four are OFL and the
  plan is unchanged; fetching them is network access and therefore the user's decision.
  `theme.css` says so at the top, next to the rule that there is no `@import url(...)`
  anywhere — a stylesheet being the easiest place for the offline promise to be broken by
  accident.

**2026-10-28 · The reorganize dry-run, and why its code is not shared with renumber**
`plan_reorganize` takes lectures and where the template says each belongs, and returns what
*would* happen. It touches nothing. That is not a convenience wrapped around the real
operation — it is the operation someone wants, because moving a hundred lecture folders on
a hunch is how a vault gets lost.

The ordering problem is **identical** to the renumber's, and gets the same answer for the
same reason: emit a move only when its target is actually free, and when nothing is free
because every target is held by another mover, break the cycle with one temporary name. Two
lectures that have been manually swapped are a cycle, and no ordering resolves a cycle.

**The code is not shared, and that was a judgement call.** Generalising `plan_renumber`
would mean parameterising it over the name type, the plan it writes into, the reason enum
and the temporary-name function: four knobs for sixty lines, which §1.11 calls a pattern
larger than the problem. The two also differ in ways that would leak through any shared
abstraction — a renumber permutes siblings in one directory, while a reorganize moves whole
bundles between directories, so a target's parents may not exist yet and occupancy is a
question about the whole vault rather than one folder's listing.

What *is* shared is the piece that genuinely is the same: `temporary_name`, which parks a
folder under an unused name in its own parent. Breaking a cycle is therefore a cheap
same-directory rename rather than a move across the vault. Recorded because "why is this
algorithm written twice?" is a fair question to ask later, and the answer should not have to
be reconstructed.

**Two lectures wanting one folder is settled separately, before any scheduling.** It is not
an ordering problem — no sequence helps — and letting whichever was planned first win would
file one lecture on top of another. Both are reported.

**2026-10-28 · The planner was right and my test was wrong**
A test asserted that when one lecture is already at the target and another wants it, the
mover is blocked as `TargetOccupied` while the one in place counts as unchanged. The planner
reports **both** as `SharedTarget`, and that is the better answer: the problem is not that a
folder happens to be busy, it is that two lectures render to one name and a person has to
rename one of them. `TargetOccupied` would have pointed at the folder and sent them hunting
for something that is not a lecture.

Third time today a test of mine encoded an assumption instead of a behaviour — but the first
time the *code* was right and the test wrong, which is the better version of that mistake.
The test now asserts what happens and records what it expected, so the next reader does not
read the difference as an oversight.

**One test earns its place more than the others.** `every_step_of_a_cycle_lands_somewhere_free`
replays the plan against a model of the vault and asserts no step ever lands on something
still present. `fs::rename` replaces silently on POSIX, so that single property is the
difference between a tidy-up and losing a folder — and it is the one thing a plan being
"correct" has to mean.

**Not written: the apply side.** `plan.moves()` is a sequence a loop can walk, and nothing
walks it yet. Deliberate — the preview is what makes this safe to have at all, and the loop
is small enough to add once the plan has been looked at in anger. Recorded in the checklist
rather than left implied.

**2026-10-28 · Why `LibreOffice` icons appeared in the Dock, and what fixed it**
The user noticed several `LibreOffice` icons appearing in the Dock while the gate ran, and
having to clear them by hand. Measured rather than guessed at.

**Cause, in two parts.** `soffice` on macOS registers as a GUI application whatever it is
told. `--headless`, `--invisible`, `--nodefault`, `--nologo`, `--norestore` and
`--nolockcheck` were each tried and compared with `lsappinfo`: every combination registers
identically, and every one still produces the PDF. The macOS build links AppKit, and no
flag opts out. So one conversion means one Dock icon for about a second, and that part
cannot be fixed from here.

The part that *could* be fixed is how many at once. `cargo test` runs the four converting
end-to-end tests in parallel threads, so four `soffice` processes started together — four
icons. Measured: **12 registration lines in parallel against 3 serialised**, three lines
being one application.

**Fix:** `scripts/gate.sh` passes `--test-threads=1` to that one step. Four icons become
one, for about a second each. It costs roughly three seconds. The comment in `gate.sh` says
explicitly not to remove it for speed, and records the measurement, because the reason is
invisible from the code and someone optimising later would otherwise undo it.

**Honest limits of the fix.** One icon still appears per conversion; that is `LibreOffice`,
not Nexus. And an icon that *persists* after a run is a ghost left by a process that did
not exit cleanly — likely from the interrupted runs earlier today — which clears on a Dock
restart. Not done here: restarting someone's Dock is their call, not a thing to do to their
session uninvited.

**Worth noting for later:** when the real app imports a deck, this will happen there too,
once per import. A fresh profile per conversion was chosen earlier for isolation; if the
Dock flicker becomes annoying in use, reusing one profile and serialising conversions is
the trade to revisit, and that is a deliberate decision rather than a bug.

**2026-10-28 · A path template, deliberately not a language**
`{course}/{week}-{title}` says where a lecture's folder goes. Literals and placeholders,
and that is all — no conditionals, no defaults, no formatting. §1.11 says not to reach for
a pattern larger than the problem, and the problem is one person filing their own lectures.

Two rules do the work a language would otherwise be wanted for:

- **A level with any missing placeholder is left out entirely.** So
  `{course}/{module}/{title}` files a lecture with no module at `{course}/{title}`. The
  alternatives were inventing an `unfiled` folder or rendering `{week}-{title}` as `-raft`,
  and both are worse than simply having one fewer folder.
- **The last level must contain `{title}`**, checked when the template is parsed. A
  `Manifest` always has a title, so the last level always renders — which is what stops a
  lecture with no facets at all from *becoming its course directory* and having the next
  one filed on top of it.

`{tags}` is refused outright: tags are a list and a folder name is one name, so taking the
first or joining them would both surprise someone. Refused at parse time, while they are
still looking at the template.

Everything is checked at parse time rather than at render: unbalanced braces, empty levels,
`{}`, and nesting past the five-folder cap. A bad template should fail while someone is
looking at it, not a hundred lectures later.

**2026-10-28 · `Slug::from_title` keeps punctuation, and that is better than what I assumed**
A test asserted `Raft & Paxos: a comparison (part 2)` would render as
`raft-paxos-a-comparison-part-2`. It renders as `raft-&-paxos-a-comparison-(part-2)`:
`from_title` lowercases, collapses whitespace and removes what is *forbidden in a path*,
but keeps punctuation that is legal on disk.

The assumption was mine, not the code's, and on reflection the existing behaviour is the
better one — the folder stays recognisable as the lecture it came from, which is what §3
wants from these names in Finder. The test now asserts what happens, and says in a comment
that it surprised me, so the next reader does not take it for an oversight.

**Recorded, not fixed:** two lectures in one course called `Raft` and `raft` render to the
same folder, because lowercasing is what avoids an APFS collision nobody asked for. That is
a genuine collision, and it belongs to the reorganize plan to *report* rather than to
rendering to paper over with a suffix nobody could predict. There is a test pinning the
behaviour so it is not mistaken for a bug later.

**2026-10-28 · Scope narrowed by the user: one machine, one person, no iPad**
Standing instruction, 2026-10-28: *"this is for my own use… if LibreOffice is not present
then we have to do something, but you don't need to worry about its handling… don't even
think about the ipad thing. i am going to use this on this machine for now."*

What this changes:

- The missing-converter path is **recorded and not built**. The checklist item above says
  what it would need. This is cheap to defer precisely because the existing behaviour is
  already safe rather than merely tolerable — nothing is lost, and all that remains is
  telling someone.
- **iPadOS stops being a reason for any new design decision.** Where an argument for a
  shape was "the iPad needs this", that argument is withdrawn; a shape now has to earn its
  place on this machine or not at all.

What it does **not** change, per §1.11: the quality bar. The audience clause already says a
single user removes *requirements*, not *standards*. Nothing here is licence for a weaker
test or a swallowed error.

**One thing deliberately left alone, and flagged rather than decided.** `CLAUDE.md` §3 locks
"`lecture-core` must compile for `aarch64-apple-ios`", and `scripts/gate.sh` enforces it.
That check is **kept** for now: it costs one `cargo check` of a few seconds, and it is what
keeps `lecture-core` free of platform dependencies — worth having on one machine too, since
it is the same property that makes the domain testable without a filesystem or a converter.
Removing it is easy; re-establishing it after months of drift is not. §3 is the user's own
document, so this is raised rather than amended.

**2026-10-28 · Three manifest saves per import, and why not one**
The order of operations is the whole design of `Importer`:

1. **`Queued`**, as soon as the file is in the vault.
2. **`Converting`**, immediately before the process starts.
3. **`Ready`** or **`Failed`**, once it has finished.

Save 1 is not optional. A lecture *is* a directory holding `manifest.json`, so until it
lands the vault walk cannot see the bundle at all — an import interrupted before it would
leave an orphaned file in a folder nothing lists, which is worse than no import.

Save 2 is what makes an interrupted conversion **detectable**. `Conversion` only allows
`succeeded` and `did_not_finish` out of `Converting`, so `Converting` found on disk can mean
exactly one thing: a process started and never came back. Collapsing the saves into one at
the end would be two fewer writes and would make a killed import indistinguishable from one
that never started. Each save is a few hundred bytes, written atomically. The tradeoff is
recorded because it is a real one: three writes bought one diagnosis.

That claim is now **tested from inside the conversion** — the converter double reads
`manifest.json` while it is running and the test asserts it said `Converting`. Asserting it
in a comment would have been cheaper and worth nothing.

**2026-10-28 · A failed conversion is not a failed import**
§1.4 says a conversion that fails keeps the original. So the file is in the vault, the
manifest describes it truthfully, and `import` returns **`Ok`** — with the failure in
`ImportOutcome::conversion_error` rather than discarded. Returning `Err` would have been
the lazy reading of "something went wrong": it would make a caller think the import needed
retrying when the file is already safely in place.

Swallowing the error instead would be the other failure, so it is carried. The outcome's
four states then answer "can this be opened?" completely: `NotRequired` (a PDF), `Ready`
(converted), `Queued` (**no converter available** — show the setup diagnostic), `Failed`
(one ran and could not, and here is why).

**2026-10-28 · The copy is streamed, and the fingerprint rides along**
`AtomicFsStorage::copy_in` moves an external file into the vault in 64 KiB chunks and
returns its `Fingerprint`. `read`-then-`write` would have held an entire lecture in memory
to copy it, and these run to hundreds of megabytes.

This is `Fingerprinter`'s first **production** caller — until now it existed only for
tests — and it vindicates the shape chosen earlier: being a chunk sink rather than a
function over a slice is exactly what lets the fingerprint fall out of a copy that was
happening anyway, at no extra read. The chunk-boundary property it was given a unit test for
is now also tested through real file I/O, with a 400 KB file spanning several chunks.

`copy_in` is also the one method on `AtomicFsStorage` that takes a real filesystem path,
because the file being imported is by definition **outside** the vault — it is on someone's
Desktop. It is only ever read.

`fingerprint_of` is its counterpart, for a file the vault already holds: after a successful
conversion the PDF exists but was written by the converter directly, so it never streamed
past a fingerprinter. One extra read at import time buys the ability to notice later that
`document.pdf` changed without its original changing.

**2026-10-28 · `storage.rs` split, and the seam was not the line count**
It reached 315 lines, and the split is `storage/mod.rs` plus `storage/streaming.rs`
because the two do genuinely different things. Everything in the parent reads or writes a
*small file whole* — a manifest, an annotation set — where holding the bytes costs nothing.
The two streaming methods move a **document**, a chunk at a time, precisely because holding
it would cost a great deal. Same struct, two impl blocks, one honest boundary.

**2026-10-28 · Another test that could not fail, caught and replaced**
`an_interrupted_conversion_is_recognisable_afterwards` imported successfully and then
asserted the result was *not* interrupted — true of anything that finished, and testing
nothing. It now writes the state a killed import would leave behind, which the domain's
transitions make reachable no other way, and checks a later launch recognises it.

Second time this has happened today, after the `ImportPlan` depth test that accepted either
branch. The pattern is worth naming: both slipped in while writing *around* the interesting
case rather than at it. A test asserting that nothing went wrong is the shape to distrust.

**2026-10-28 · `plan_bundle` was ceremony with a bug in it**
A helper derived the bundle path from the plan's document by taking `parent().parent()`, on
the reasoning that the plan and the directory could then never disagree. It did not compile,
and the fix was to delete it: the caller already holds `request.bundle`, which is the value
the plan was built *from*. Guarding against a disagreement that cannot arise, by computing
the same answer a second way, is not safety.

**2026-10-28 · A PDF is stored once, not twice**
`CLAUDE.md` §3 says the original is always kept so reconversion stays possible. Read
literally that would mean a PDF import writes `source/original.pdf` *and* a byte-for-byte
`source/document.pdf` — doubling the disk cost of every PDF lecture, and lecture PDFs run
to hundreds of megabytes.

For a PDF there is nothing to reconvert: it already *is* the render format. So the imported
file becomes `source/document.pdf` and there is no separate original. The rule's purpose is
served exactly, and its literal reading is not.

Pleasingly, the domain already required this rather than merely allowing it: `Source::new`
refuses a `NotRequired` conversion that has an original beside it, as an inconsistent
manifest. `ImportPlan` does not enforce the rule, it satisfies one that was already there —
which is the shape to want, because it means there is one place to change if the rule ever
does.

**2026-10-28 · One fingerprint at import, and the plan decides where it goes**
Exactly one file exists when an import finishes copying, and which manifest field its
fingerprint belongs in depends on the format. For a PDF it is the document. For anything
else it is the **original**, because the document has not been made yet — and
`with_fingerprints` refuses a fingerprint for a file that is not there, which is the one
shape that could silently mislead a later "has this changed?" check.

So `ImportPlan::source` takes a single fingerprint and decides for itself. A caller that
had to know the rule would eventually get it wrong in one of the two branches, and the
wrong branch is the quiet one.

**2026-10-28 · The stored name is canonical, not the name the file arrived with**
`original.pptx`, never `Lecture 7 - Raft (final) v2.pptx`. A bundle is then
self-describing whatever a person called the download, and the name is one fewer thing
that has to survive being a `Slug`. The name someone actually knows the lecture by belongs
in the manifest's title, where it can hold spaces and punctuation and be renamed without
touching a file.

**2026-10-28 · `ConversionRequest` moved from `ports` to `domain`**
It names two paths and a format and performs no I/O, so it was never a port's thing —
and `ImportPlan` builds one, which would have made `domain` depend on `ports`.
Dependencies point one way (§1.11), so the value moved to `domain` and the trait stayed
in `ports`. The crate-root re-export is unchanged, so nothing outside `lecture-core`
could tell.

The rule this suggests, now written in `ports/mod.rs`: only *traits* live in `ports`; a
value a port takes or returns lives in `domain`.

**2026-10-28 · `DocumentConverterPort` stays a port with one implementation**
With the fallback gone there is exactly one converter, which invites folding the trait
away. It stays, because the number of implementations was never the reason for it:
`lecture-core` must compile for `aarch64-apple-ios`, where **no** converter can run. A
port whose implementation count is one on this platform and zero on the other is doing its
job.

**2026-10-28 · A real `.pptx` fixture, and what it does not prove**
`tests/fixtures/minimal.pptx` is a genuine 14-part OOXML package, built by `LibreOffice`
from `minimal.fodp` — flat ODF, a presentation as a single reviewable XML file. That route
exists because a minimal *valid* `.pptx` needs a slide master, a layout and their
relationships, while flat ODF needs one `<draw:page>`.

It exercises the Impress import filter and the `pptx` → `pdf` path, which the `.docx`
fixture does not, and `.pptx` is the format this app is most likely to be handed. But it
was **written by `LibreOffice`**, so converting it shows `LibreOffice` reads its own output
— not that it reads what `PowerPoint` writes. A deck saved by `PowerPoint` or Keynote would
be strictly better evidence and needs either that software or a download. Said plainly in
`tests/fixtures/README.md` rather than left for someone to assume.

**2026-10-28 · A test that could not fail, replaced**
The first depth test for `ImportPlan` accepted *either* an `Ok` or an `Err`, which made it
pass whatever happened — and since `MAX_DEPTH` is 8 while a bundle at the cap needs 7, the
`Err` arm was unreachable. It now asserts the property that actually matters, derived from
the constants: a bundle at the deepest allowed level **can** still address its own
`source/document.pdf`. That is the exact bug `limits.rs` records having had once, so it is
worth a test that would catch it coming back.

**2026-10-28 · The `osascript` fallback is removed — `LibreOffice` is the only converter**
Built, tested against a stub, then tried against the real Keynote and Pages. **The user's
decision after seeing what that showed**, and the evidence is worth keeping because it is
the argument.

A **six-line script was wrong in two independent ways** that no amount of reading would
have found:

- `tell application "Pages"` does not start the app, and nor does an explicit `launch` —
  both fail with `AppleEvent` error `-600`, "Application isn't running". The app has to be
  started another way first.
- `set theDocument to open sourceFile` does not return a usable document reference. The
  export then fails with `-609`, "Connection is invalid". The working form opens the file
  and refers to `document 1` separately.

It succeeded on the third attempt, with Pages already running — a 22 KB PDF from the
`.docx` fixture, so the capability was real. The problem is what getting there revealed:
every one of those is an **undocumented per-app quirk**, and nothing pins any of them.
They can differ between Keynote and Pages, between iWork versions, and between macOS
releases, and neither the compiler nor a test can warn us. A path that would run rarely,
and therefore be exercised least, cannot rest on that.

The spec's "silently … in the background" was also not achievable: exporting through
Keynote launches Keynote, where it appears in the Dock and may take focus, and the first
run needs automation consent granted in System Settings.

**One converter, relied on properly, beats two where the second is a guess.** What that
costs is real and is named rather than waved away: a machine without `LibreOffice` can now
import nothing but PDFs. What makes it acceptable is that the failure is already safe by
design — the original is kept, the conversion stays `Queued`, and installing `LibreOffice`
later lets the import finish. The setup diagnostic is therefore promoted from courtesy to
**load-bearing**, and the spec now specifies it as reachable from the failed import rather
than only from a settings pane.

**What was removed:** `src/iwork.rs`, `tests/iwork.rs`,
`tests/support/osascript_stub.rs` (605 lines, 12 tests),
`CoreError::ConverterNotPermitted` and its remediation, and the `Fixture::rooted_at`
helper that existed only for the injection test. All created earlier the same day, so
nothing older was lost.

**What was kept, and why.** `select_converter` and `DocumentConverterPort` stay a port with
exactly **one** implementation, because the number of implementations was never the reason
for the port — `lecture-core` must compile for iPadOS, where no converter can run at all.
`output.rs` also stays separate: the seam between "how a converter is invoked" and "what
counts as having succeeded" is real, and folding it back would put `libreoffice.rs` over
the 300-line limit.

**Design worth recording even though the code is gone.** The adapter passed file paths to
`osascript` as **arguments**, against a constant script containing `on run argv`, rather
than interpolating them into AppleScript source. Interpolation would have been script
injection: `Slug` forbids a quote inside a vault, but the vault's *own root* is an
arbitrary path the person chose, and a quote there would have ended the string literal and
executed what followed. If anything in Nexus ever builds a script, a query or a command
line from a person's path again, that is the shape to copy: make the unsafe version
unspellable rather than remembering to escape.

**2026-10-28 · Four runs of a GUI app, and one thing left alone**
Verifying this launched Pages on the user's own machine, with their approval first, using
fixtures in the session scratchpad and never a real vault. Pages was quit cleanly
afterwards with zero documents open.

Keynote was found running with **one open document** and refused to quit, reporting `-128`,
"User cancelled". Nothing here had launched Keynote, so that document was not ours and it
was **left exactly as it was** rather than forced. Recorded because §1.9 says to clean up
what we start, and the other half of that rule is not touching what we did not.

**2026-10-28 · `BackupOutcome` moved out of `error/mod.rs`**
Adding `ConverterNotPermitted` pushed the file to 305 lines. The split is along a real
seam rather than at the line count: `BackupOutcome` is not a failure, it is a fact *about*
one, carried so a message can state where a damaged file's copy actually went instead of
promising a `.bak` that may not exist. Its own `Display` impl went with it.

**2026-10-28 · `LibreOffice` installed, and the gap closed — it corrected me**
`LibreOffice` 26.8.1.1 was installed at the user's instruction, which made the end-to-end
verification recorded as missing earlier actually possible. Four tests now run against the
real converter, and the first run **failed in a way that was worth more than passing**.

The test asserted that a file named `.docx` whose contents are not a document would be
refused. It is not. `LibreOffice` sniffs the bytes, falls back to its plain-text filter,
and produces a genuine PDF containing that text — the log says
`convert … as a Writer document … using filter : writer_pdf_Export`.

Recorded as behaviour rather than fought, because the outcome is tolerable: the original
is kept, the PDF is real, and someone opening a lecture full of mojibake can see at once
that the import went wrong and re-import. The test was rewritten to assert what actually
happens, and named for it.

**Option not taken:** validating that a file really is the format its extension claims,
before import. That is format sniffing, it is a genuine improvement, and it belongs to the
**importer** rather than the converter — the converter's job is to convert what it is
handed. Left undone deliberately rather than bolted on here.

This is the third time this session that running the thing corrected an assumption I had
written down confidently — after the renumber cycle counterexample and the
distinct-error-codes claim. The pattern is worth naming: the assumptions that survive
reading are not the same set that survives execution.

**2026-10-28 · The `.docx` fixture is built, not downloaded**
`crates/lecture-convert/tests/fixtures/minimal.docx` is a real Office Open XML package —
`[Content_Types].xml`, `_rels/.rels`, `word/document.xml` in a zip — generated by a short
script rather than fetched. Two reasons: the repository needs no network to reproduce it,
and the fixture is reviewable as text instead of being an opaque 975-byte blob nobody can
diff.

`.docx` rather than `.pptx` because a minimal *valid* presentation needs a slide master, a
layout and their relationships — a great deal of XML to carry for a test about conversion
rather than about `PowerPoint`. Verified by converting it by hand first: 13,233 bytes
beginning `%PDF-1.7`. That hand-run also confirmed the argument list in
`command_arguments` is the one a real `soffice` accepts, which until then was only asserted
against a stub.

**2026-10-28 · `gate.sh` grew a third outcome, so a gap cannot look like coverage**
The converter end-to-end tests are `#[ignore]`d, which §4 permits only for genuinely
environment-dependent tests. An ignore is also where work goes to be forgotten, so
`gate.sh` now runs them whenever `soffice` is present and reports **`skip`** with the
reason when it is not.

`skip` is deliberately distinct from both `ok` and `FAIL`. A skipped step that printed `ok`
would be the weakened test the anti-patchwork clause forbids; one that printed `FAIL` would
make CI permanently red for a tool it does not have. The summary names what was not
checked, and the final line says how many steps were skipped. A step is only ever skipped
for a reason written into the script, never because it failed.

CI will show this skip on every run, because the macOS runner has no `LibreOffice`.
Installing it there was considered and declined: it would add minutes and ~700 MB to a
50-second run to cover four tests that run locally on every gate. Recorded so the choice
can be revisited rather than rediscovered.

**2026-10-28 · Output validation is shared, because two adapters must not drift**
`output::inspect` and `output::commit` came out of the `LibreOffice` adapter before the
second one was written. What a converter *is* differs between them; what counts as having
succeeded does not, and two copies of "is this really a PDF?" would eventually disagree.

Both converters lie about success in their own way: `LibreOffice` exits 0 having written
nothing, and `osascript` exits 0 when the *script* ran, which is not the same as the export
having worked. One shared check, applied to both.

**2026-10-28 · Test support is included per binary with `#[path]`**
`tests/support/mod.rs` became `support/stub.rs` and `support/vault.rs`, each pulled in by
the test binaries that need it. A single shared module meant `end_to_end.rs` compiled the
stub it never uses and tripped `dead_code` — which an `#[allow]` would have silenced and
the split actually fixes. Each binary now compiles only what it uses.

**2026-10-28 · `LibreOffice`'s licence, and why it is not in the table**
`LibreOffice` is MPL-2.0. It is deliberately **absent** from the licence table above,
because that table records what is *bundled and distributed*. `LibreOffice` is neither: it
is an optional external tool the person installs themselves, invoked as a subprocess, and
`crates/lecture-convert` contains no part of it. Nothing about it constrains distribution
of this app. Noted here so its absence from the table is a recorded decision rather than an
oversight.

**2026-10-28 · A new crate, so "no converter is required" is structural**
`CLAUDE.md` §3 says converters are optional and that neither is required for the app to
function. `crates/lecture-convert` makes that true rather than aspirational: **nothing
depends on it**, verified with `cargo tree -i -p lecture-convert`, which lists only
itself. Remove it from the workspace and the app still builds, still opens a vault, still
imports PDFs; only `.pptx` and `.docx` import stops.

It is also the honest boundary. `lecture-fs` is the filesystem adapter, and spawning
`LibreOffice` is a different capability that happens to need the filesystem — not a kind
of file access. Putting it there would have been one fewer `Cargo.toml` and a module
boundary that did not match the domain.

**2026-10-28 · The adapter is tested against a stub binary, not a mock**
`LibreOffice` is not installed here, and an adapter verified only by reading it is not
verified. So the tests write an executable shell stub that mimics `soffice` — parsing
`--outdir` and the input path out of its own arguments exactly as the real binary must —
and drive the **production** `Command`-spawning, exit-status, output-checking and
move-into-place code through it. The double is at the process boundary; nothing under test
is mocked.

The three cases worth the most are the ones where the converter **reports success without
producing a usable PDF**: `LibreOffice` really does exit 0 having written nothing when it
has no filter for a document. Trusting the exit status would record a `Ready` conversion
pointing at a file that is not there — a lecture that imports cleanly and cannot be
opened. So the output is checked for existence, for being a regular file, for being
non-empty, and for beginning `%PDF-`.

**2026-10-28 · Honest gap: `LibreOffice` itself is unverified**
There is deliberately **no** end-to-end test with a real `LibreOffice`. One would need a
machine that has it *and* a genuine `.pptx` fixture, and neither exists here. An
`#[ignore]`d test asserting whatever placeholder bytes happen to produce was written and
then deleted: it read as coverage of the one thing a stub cannot vouch for while proving
nothing. The gap is recorded here instead.

What stands in for it is `command_arguments` being asserted **exactly**, because the
argument list is the part a real `soffice` would reject, and it is the part no stub can
check. Installing `LibreOffice` (~700 MB) would close this; not done without asking.

**2026-10-28 · The output name is `LibreOffice`'s to choose**
`soffice --convert-to pdf --outdir X original.pptx` writes `X/original.pdf` — the *input's*
stem, not what the manifest calls it. So the conversion produces `source/original.pdf` and
that file is moved onto `source/document.pdf`. Both paths are inside one vault, so the move
is a same-filesystem rename and therefore atomic: nothing ever sees a half-written
`document.pdf`, and nothing can annotate a fragment.

This is also what `AtomicFsStorage::replace` is for. `rename` refuses to overwrite because
a renumber must never write over a folder it did not create; a finished conversion must
replace the PDF it just rebuilt. Two names, so the destructive one cannot be reached by
reaching for the safe one — the same lesson as `requeued` against
`reconversion_requested`, applied one layer down.

**2026-10-28 · The converter profile does not go in `/tmp` — spec amended**
The spec said `-env:UserInstallation=file:///tmp/...`. The isolation requirement is right
and is implemented — a fresh profile per conversion, since `LibreOffice` locks one — but
`/tmp` is the wrong place. The system sweeps it on a schedule nothing here controls, so a
long conversion can have its profile deleted underneath it; it is world-readable, and a
profile carries recent-document history; and it scatters this app's state across two
places, which makes "what does Nexus leave on my disk?" unanswerable.

Per-device state already lives in `~/Library/Application Support/Nexus/`, and a converter
profile is per-device state. A fresh directory per conversion costs `LibreOffice`'s
first-run setup and removes the locking constraint entirely, which is the better trade
while nothing here can measure that cost. Cleanup is best-effort: a left-behind profile
costs disk in this app's own directory, whereas failing a conversion that *worked* because
the cleanup did not would be absurd.

**2026-10-28 · The converter's name lives in the adapter, not the domain**
`CONVERTER_LABEL` is in `lecture-convert`. `select_converter` takes converters in
preference order and the first match wins, so `CLAUDE.md` §3's "LibreOffice CLI preferred
when present" is an ordering decision made where the converters are assembled. The domain
knows no converter by name, which is what lets it compile for a device where none can run.

A consequence worth noting: `LibreOfficeConverter::at` returns `Result`, because the label
is validated by exactly the same rule as every other name written to a manifest. An
`expect` would have been shorter and is banned by §4 — and the ban is right here, since the
alternative is a panic in an optional adapter taking the whole app down.

**2026-10-28 · `Unavailable` cannot be a conversion state — plan corrected**
This file's Milestone 2 plan listed the state machine as
`Queued → Converting → Ready | Failed | Unavailable`. `Unavailable` is **wrong**, and the
reason is one already settled elsewhere in this project.

"No converter is installed" is a fact about **this machine**. `manifest.json` is a
**synced** file. A bundle marked `Unavailable` on an iPad — where `LibreOffice` can never
run — would carry that state back to the Mac that converts it perfectly well. It is
exactly the mistake the view-state amendment corrected, appearing in a new place, and it
would have been much harder to spot once written: a state that is *sometimes* true is not
obviously a bug.

So absence is answered at runtime: `select_converter` returns `Option`, and the persisted
state stays `Queued`. That is both true and useful — queued is precisely what should
happen when a converter is installed later. The spec never asked for `Unavailable`; it
came from this file's own plan, so the correction is here rather than in an amendment to
`claude-spec.md`.

**2026-10-28 · An interrupted conversion is detectable because the machine is strict**
`succeeded` and `did_not_finish` are reachable **only** from `Converting`. That looks like
pedantry and buys something concrete: there is no path from queued to done that leaves no
trace of having been attempted, so `Converting` found on disk at startup can only mean the
process died partway.

`was_interrupted` names that reading, and the recovery is `requeued`, not "carry on". The
PDF beside an interrupted conversion may be absent, truncated, or a plausible-looking
fragment — and the third is the worst of the three, because a fragment that opens is a
fragment that gets annotated. Same instinct as the renumber's resumability: make the
half-finished state recognisable rather than trying to make it impossible.

**2026-10-28 · The state machine is tested as a grid, not as a happy path**
`every_state_and_transition_pair_is_decided` walks all five states against all five
transitions and asserts every cell, including the twelve that must be refused. A machine
tested only on the moves that work is a list of examples, not a machine — and the grid has
a second effect: a new state cannot be added without this test forcing a decision about
what it may do.

The states are also built the way the app really reaches them, so `Converting` in the test
comes from `queued().started(...)`. A test that constructed states directly would be
testing a shape the app can never be in.

**2026-10-28 · `reconversion_requested` exists so a caller has to mean it**
`Ready → Queued` is spelled differently from `Failed → Queued` even though both land in
the same state, because the consequences are not comparable. Retrying a failure costs
nothing. Reconverting replaces a PDF that highlights were **already placed on**, and
annotation geometry is normalised against *that* document's pages — so the highlights may
all now point slightly wrong. Two names mean a caller cannot reach the destructive one by
reaching for the harmless one.

This is also what the document fingerprint is for, so the pair closes the loop the spec's
amendment 4 opened when it removed `documentId`.

**2026-10-28 · `source.document` is a promise, not a fact**
While a conversion is queued, running or failed, `source.document` names a PDF that *will*
be written. Nothing in the schema says so, and the rule would otherwise be re-derived by
every caller matching on the conversion state — with one of them eventually getting it
wrong and handing the viewer a file that is not there.

`Source::document_is_ready` names it once, and `documentIsReady` mirrors it in
`manifest.ts` because the UI is the caller most likely to get it wrong. Making
`document` optional instead would have been the stricter fix and a second schema
migration one commit after the first; this is the proportionate one, and it is recorded
as a tradeoff rather than a conclusion.

**2026-10-28 · A closed format list, refused at the door**
`DocumentFormat` accepts PDF, PPT, PPTX, DOC, DOCX and nothing else. An open "any
extension" import would take a `.zip` and only discover at conversion time that nothing
can read it — after a bundle had been created and a person had been told their lecture
imported. Refusing at the door costs one error message and keeps the vault free of
bundles that can never render.

Case is ignored, because a file from a lecturer's Windows machine is as likely to be
`.PPTX`, and refusing it would be absurd. `.key` and `.pages` are deliberately **not**
included: Keynote and Pages are *converters* here, not import formats, and adding them
would widen the spec's stated scope rather than implement it.

**2026-10-28 · FNV-1a for source fingerprints, not SHA-256 — and the trigger to change**
The spec asked for "source hashes". They are implemented as **fingerprints**, FNV-1a
64-bit, reusing the algorithm already in the crate for vault keys and log digests.

The question a fingerprint answers here is "have these bytes changed?", in two places that
both matter: *the original changed, offer to reconvert*, and *the PDF changed under a set
of highlights, so their geometry may now point at the wrong thing* — the second is the
need that killed `documentId` in the spec's amendment 4, so this closes that loop. Neither
is adversarial. These are one person's files, on their own disk, in an app with no network,
and a 64-bit miss is around 5e-20 — far below the rate at which the disk itself lies.

So the alternative was weighed and declined: `sha2` buys collision resistance against a
*crafted* file, and nobody is crafting one. §1.5 says a new dependency needs a reason.

What matters more than the choice is the **trigger that reverses it**, recorded so it is
not rediscovered: if a fingerprint is ever used to decide whether to *trust* bytes rather
than notice they moved, it must become cryptographic, and that is a schema migration
because every stored value would be wrong. The name is doing work here too — "hash"
invites a reader to assume strength this does not have, which is why the fields are
`documentFingerprint` and `originalFingerprint`, and why `fingerprint.rs` says so in its
own module documentation rather than only here.

**2026-10-28 · The fingerprinter streams, because the domain owns the algorithm**
`Fingerprinter` takes chunks rather than a whole `&[u8]`. Lecture PDFs run to hundreds of
megabytes, and reading one entirely into a `Vec` to hash it would make importing a large
deck a memory spike for nothing. It also keeps the split right: the domain owns the
algorithm, the adapter owns the reading, so this is a chunk sink and not something that
takes a path.

That chunk boundaries cannot change the result has its own test across five different
splits, because it is the whole reason the streaming API is allowed to exist.

**2026-10-28 · The algorithm is pinned to independently computed values**
`the_algorithm_is_pinned_to_known_values` asserts four fingerprints against constants
computed outside this code. A test comparing the code to its own output would only prove
it agrees with itself, and the stakes are concrete: a fingerprint is written into
`manifest.json` and a vault key *is* a directory name on disk, so arithmetic that quietly
changed would orphan every stored value and make every "has this changed?" answer yes.

The same check was applied to the fixture: both fingerprints in `fixtures/manifest.json`
were verified against an independent FNV-1a implementation rather than accepted because
`UPDATE_FIXTURES` produced them.

**2026-10-28 · `SchemaRange`, and why the migration is allowed to be empty**
`schemaVersion` reads as a *span* now rather than one number, via `SchemaRange`. A type
rather than two `u32` parameters because the two are trivially swappable and swapping them
silently inverts the check — a build would accept exactly the files it cannot read. It also
owns `reject`, so the one place that describes an unreadable version is the one place that
knows the range, and no call site can cross the fields.

The v1→v2 migration itself is **structurally empty**, and that is stated rather than
dressed up. Every field v2 added is optional, and absent is precisely what v1 meant by it,
so a v1 manifest parsed as v2 already *is* the upgrade. What is real is the span check, and
that **saving** performs the migration: `Into<RawManifest>` always writes the current
version, so reading never writes and the file is rewritten the first time something
legitimately changes it. Non-destructive by construction.

A future version that *retypes* a field cannot work this way and will need a raw struct per
version. Deliberately not built: there is nothing for it to do today, and a pipeline with
one empty stage is harder to get right later than an honest special case is to replace.

**2026-10-28 · The remediation for a bad schema version was a confident lie**
It read "This lecture was saved by a newer version of Nexus." With a span, a refused
version can also be *below* the oldest readable one — a hand-edited `"schemaVersion": 0` —
and telling that person to update Nexus is wrong. Now: "Nexus does not recognise the
version this file was saved with… If it was written by a newer version of Nexus, updating
will open it normally." True in both directions, and it still leads with the promise that
nothing was written.

**2026-10-28 · TypeScript pins one version where Rust accepts a span**
`MANIFEST_SCHEMA_VERSION` in `manifest.ts` is `z.literal(2)`, not a range, and the
asymmetry is deliberate. Rust owns the filesystem and upgrades a v1 manifest as it reads
it, so a manifest arriving over IPC has already been brought current. The UI never reads a
bundle off disk, so accepting an older one there would only hide a bug in the layer that
should have upgraded it.

The Zod schema mirrors the orphan-fingerprint rule too. Both descriptions of the shape are
duplicated rather than generated, on purpose: a rule that holds in only one of the two
languages is exactly the bug the fixture pair exists to catch.

**2026-10-28 · Two files split because the limit check caught them mid-change**
`source.rs` hit 306 lines and `schemas.test.ts` 340, both while this substep was in
progress — the line-limit check earning its place twice in one day, having been added that
morning.

Neither was cut at a line count. `domain/conversion.rs` came out of `domain/source.rs`
because `Source` says what a bundle renders and what it was built from while `Conversion`
says how far a conversion got and what did it; they change for different reasons.
`tests/source.rs` came out of `tests/manifest.rs` for the same split. And
`schemas.test.ts` became three files, one per subject, keeping only the cross-cutting
wire-format contract in the original.

**2026-10-28 · The first CI run failed, and the reason was better than the fix**
The workflow's first run went red, and not because the YAML was wrong — it ran exactly as
intended. The runner had Rust **1.99.0**; this machine has **1.97.0**; and
`clippy::assert_is_empty`, added somewhere between them, fired on
`crates/lecture-core/tests/renumber.rs:78` where it could not possibly fire locally.

That is a sharper lesson than the one the gate script was written for. One definition of
*the steps* is not enough if the *compiler running them* differs — an unpinned toolchain
makes a green local gate no evidence at all about CI. So `rust-toolchain.toml` pins the
channel and names the components and the iPadOS target, which also lets the separate
`rustup target add` step go: two mechanisms for one fact is how they come apart.

Pinned to 1.97.0, not 1.99.0, deliberately. 1.99.0 is not installed here, and pinning to
a toolchain that cannot be run locally would recreate the same blindness pointing the
other way. Upgrading is now a deliberate change with its own commit, made when the new
lints can be *seen* rather than guessed at.

**2026-10-28 · Known item: 33 assertions that show nothing on failure**
1.99.0's `assert_is_empty` is a true positive, and the lint is right about why:
`assert!(x.is_empty())` prints no value when it fails, so a broken test says only that
something was not empty. There are 33 of these across the suite. Not fixed in the pinning
commit, because the fix form cannot be verified against a lint this machine cannot run —
guessing at it would have been a second red CI run dressed up as diligence. It belongs to
the deliberate 1.99.0 bump.

**2026-10-28 · Also outstanding: the first-party actions target a deprecated Node**
GitHub annotates every run: `actions/checkout@v4`, `actions/setup-node@v4` and
`actions/cache@v4` target Node.js 20 and are being forced onto Node.js 24. Harmless
today and fixed by moving to `@v5`. Recorded rather than bundled into an unrelated
commit.

**2026-10-28 · Superseded: the workflow had never run**
*Resolved the same day — kept because the reasoning stands and the resolution is the
point.* The YAML was committed without ever having executed, and with no YAML parser on
this machine to check that it even parsed. Recorded as unverified rather than left to
look like coverage. It has since run twice: once red for the toolchain reason above, then
green. A local YAML parser was never installed and is not needed — GitHub validating the
real file is a strictly stronger check of the same property.

Only first-party actions are used — `checkout`, `setup-node`, `cache` — so there is no
third-party action trusted with a checkout of this repository. Pinned to major tags rather
than commit SHAs, which is accepted practice for first-party actions and is the weaker of
the two choices; worth revisiting if the repository ever becomes public.

**2026-10-28 · The logging API exposes typed events, not a macro**
The redaction rule is only worth as much as the hardest-to-misuse way of logging. So
`lecture_fs::logging` has no general macro: `failure(during, error)` takes the error and
records its code and digest, and `during` is `&'static str` so it cannot carry formatted
input either. A caller cannot express the unsafe version.

Same technique as `ResolvedPath` — the rule holds because the API will not say the other
thing, not because everyone remembers it.

`derived_file_discarded` is deliberately separate from `failure` and logs at info rather
than warning, because discarding a damaged cache is designed behaviour and warning about
it would train someone to ignore warnings. It is still worth a line: a cache discarded on
*every* launch is a real problem wearing a harmless face.

**2026-10-28 · Logging went into the four places that were silently discarding errors**
`VaultIndexStore::load` and `DeviceStateStore::load` are both infallible by design, which
is right — but it meant a genuinely unreadable file was indistinguishable from a missing
one, which is the swallowed error §1.1 warns about. Both now log when the failure is not
simply "no file yet", told apart with `versioned::is_missing`. `VaultLoader` logs each
unloadable manifest, and `VaultRenumber` logs what it renamed and whether it finished.

This is the part that makes the logging real rather than an unused API, and it closes a
softness that had been accumulating quietly across four substeps.

**2026-10-28 · Synchronous writes, and no worker thread**
`tracing_appender::non_blocking` is the usual choice and is wrong here. It costs a worker
thread, a flush guard that silently drops lines if dropped early, and one more thing to
reason about at shutdown — all to buy throughput for an app that logs codes and timings at
human pace. Daily rotation is kept, so a log held across years cannot quietly fill
someone's disk.

**2026-10-28 · `~/Library/Logs/LectureVault/` was the old project name**
§4 named a directory that no longer matches the app. "LectureVault" survives in the
`lecture-core` / `lecture-fs` crate names, which is fine — they are internal — but this
directory is one a person opens in Finder. Amended to `~/Library/Logs/Nexus/`, with the
reason beside it. Nothing had ever been written to the old path, so there was nothing to
migrate.

**2026-10-28 · One test per process, because a subscriber is global**
The first version of the end-to-end test put three `#[test]`s in one file. Tests in a
binary run in parallel threads of one process, and a `tracing` subscriber is global to a
process, so they raced for it and the one that mattered failed. `logging_file.rs` now
holds exactly one test that covers the successful start and the refused second one in
sequence, and says why in its own documentation so nobody helpfully splits it again.

**2026-10-28 · `remediation` outgrew a function, so the sentences got names**
It reached 104 lines and clippy's limit is 100. Rather than an `allow`, each message
became a named constant in a `wording` module.

The split is along a real seam: the match is reviewed for *completeness*, which the
compiler enforces, and the sentences are reviewed for *tone* — §1.4's tired student the
night before an exam. Those are different jobs. Naming them also makes a shared message
explicit, so `InvalidZoom | InvalidPageOffset => READING_PLACE_LOST` reads as a decision
rather than two arms that happen to hold identical prose.

**2026-10-28 · The log cannot carry an error's `Display` text, so it carries a digest**
§4 allows codes and timings into the log and nothing a person typed or named. The obvious
risk is not the one that bites: nobody is about to log `notes.md`. It is that an error's
`Display` interpolates a **path**, and a path contains folder names, which contain course
and lecture titles. `StoredFileUnreadable` is subtler still — its detail is a serde
message, and those quote the offending JSON back.

Dropping the detail entirely would leave a log that cannot tell "the same file failed
twice" from "two different files failed once", which is most of what a log is read for. So
`log_digest` replaces the detail with a fingerprint of it: enough to correlate, nothing to
read, not reversible. Two different failures about the same path still digest differently,
which a test pins, because "this folder is an alias" and "this folder escapes the vault"
need different answers.

The cost is that changing an error's wording changes its digest, so digests correlate
within a build rather than across versions. Accepted, because the alternative is a
redaction rule per variant that someone eventually forgets to add for a new one.

**2026-10-28 · The type system was already doing most of this work**
Writing the test surfaced something better than the test: `remediation` returns
`&'static str`, so it **cannot** interpolate a path however carelessly a variant is added,
and `code`'s match is exhaustive, so a new variant will not compile without both. The
promise is enforced by the compiler, not by vigilance.

Several variants also carry only numbers and `&'static str` — `InvalidCoordinate`,
`RectOutOfBounds`, `InvalidManifest`, `InvalidAnnotation`, `SchemaVersionUnsupported`,
`InvalidPageNumber` — and so cannot hold private text at all. The risk is concentrated in
the `String` fields, which are mostly paths. The test is split along that line and says so.

What the test honestly does **not** do is enumerate the variants: `CoreError` is
`#[non_exhaustive]`, so an integration test cannot match on it exhaustively. It checks the
two groups are sorted correctly and fails loudly if `remediation`'s signature is ever
widened to `String`. Recorded rather than implied, so nobody reads it as a completeness
guarantee.

**2026-10-28 · A second test caught a second wrong assumption of mine**
I asserted every variant has a distinct code. It failed: `InvalidCoordinate` and
`RectOutOfBounds` deliberately share `ERR_INVALID_COORDINATE`, because a person does not
care whether a rectangle's origin or its far edge was out of range — same meaning, same
action. The implementation was right and my test was wrong, for the second time in two
substeps.

Replaced with what is actually wanted: codes are `ERR_`-prefixed and greppable, the
geometry grouping is asserted explicitly so it cannot be undone by accident, and the two
still digest differently so a log can separate them when it needs to.

**2026-10-28 · One FNV, two callers**
The vault key in `device_state` and the log digest need the same thing — a stable, short,
non-reversible reference — so the algorithm moved to `domain/fingerprint.rs` and the
duplicate went away before it existed. The `device_state` tests passing unchanged is what
confirms the extracted version is byte-identical; a different hash there would silently
orphan stored reading positions.

**2026-10-28 · Blocked: `tracing` needs three dependencies, so it is asked for not added**
§4 names `tracing` for structured logging, and none of `tracing`, `tracing-subscriber` or
`tracing-appender` is in `Cargo.lock`. §2 makes fetching them a question, so the question
is asked rather than answered. Everything that does not need them — the redaction rule,
the digest, the fingerprint — is done and verified.

**2026-10-28 · `AtomicFsStorage::rename` refuses rather than replaces**
POSIX `rename` replaces an existing **file** silently, and an existing empty **directory**
too. So the obvious `fs::rename` call is a data-loss path: a renumber whose target had
been filled in the meantime would delete whatever was there. The storage method checks
first and returns `NameAlreadyTaken`.

The planner already refuses an occupied target, so this is the second line of defence
rather than the first — and it is the one that matters, because the plan is computed
before the renames happen. There is a test that writes a file into the destination
*between* planning and applying, and asserts the file survives and the lecture stays
where it was.

`renameat2`/`renamex_np` with a no-replace flag would close the remaining
time-of-check/time-of-use window properly, but both need `unsafe`, which is forbidden
here. Same window as `VaultRoot::resolve`, recorded the same way rather than papered over.

**2026-10-28 · Stopping at the first failed rename is correctness, not caution**
The plan's renames are ordered so that each frees a name a later one needs. Carrying on
past a failure would mean a later rename finding its target still occupied — refused if we
are lucky, overwriting something if we are not. So `apply` stops and reports.

Stopping is cheap precisely because of the locked decision: renumbering touches only the
derived projection, `sequence` is never written, so a half-finished run still shows the
right order in the app and only the Finder-facing names are briefly inconsistent. A test
applies one rename by hand, re-plans, and asserts the second run finishes the job — which
is what makes "stop" a complete answer rather than an abandoned operation.

A separate test reads a `manifest.json`'s bytes before and after and asserts they are
identical, pinning the claim that the order itself is never touched.

**2026-10-28 · A renumber must not cost someone their place in thirty lectures**
View state is keyed by path, so renaming a folder orphans its entry, and `prune_to` would
then delete it. A renumber touching thirty folders would quietly lose the reading position
in all thirty. Losing a scroll position is cheap; losing it as a side effect of a tidying
operation someone asked for is a bad surprise.

So `RenumberPlan::net_moves` reports net old→new names with temporary names skipped,
`apply` turns those into full vault paths, and `ViewState::relocate` follows one. The
alternative — giving lectures a stable id so nothing is keyed by path — is a bigger change
than the problem, and the `cite://` links that need stability are already scoped inside a
bundle. Recorded as the option not taken.

**2026-10-28 · "Tail-first so no rename collides" is not sufficient — but my first
counterexample for it was wrong**
The §3 rule said renumbering renames tail-first so no rename collides. That is true for a
pure shift and not in general, so the rule needed amending. I amended it with the wrong
reason, and a test caught me.

My claimed counterexample was dragging the third of `01-intro`, `02-raft`, `03-paxos` to
the front: `01→02`, `02→03`, `03→01`, which I called a 3-cycle. It is not. **The stem is
part of the folder name.** Renaming `01-intro` to `02-intro` does not touch `02-raft` at
all, so differing stems mostly cannot collide whatever order they are done in. The test
asserting "exactly one temporary name" failed with zero, because the planner correctly
found there was no cycle to break.

The real hard case is siblings that **share** a stem — `01-lecture`, `02-lecture`,
`03-lecture`, which is exactly what generic folder names produce. Those reorder as a pure
permutation of their prefixes, and a permutation containing a cycle cannot be made
collision-free by any ordering, because every target is held by another member. So the
conclusion stood and the reasoning did not. `CLAUDE.md`, the module documentation and the
test were all corrected; the wrong example is not left anywhere.

Worth recording for two reasons. The amendment I wrote under §1.7 was itself a drafting
error of the kind §1.7 exists to catch, which is a good argument for amendments carrying
their reasoning where a test can contradict it. And it is the clearest case so far of a
test earning its keep by disagreeing with the thing it was written to confirm.

**2026-10-28 · The plan is proved by simulation, not by asserting a sequence**
`no_plan_ever_renames_onto_an_occupied_name` applies each plan to an in-memory directory
and fails if any rename lands on a taken name. Asserting a specific list of renames would
have pinned one implementation while saying nothing about the property, and — as above —
it is the property I was wrong about, not the code.

It runs over twelve shapes: shifts, reversals, rotations, shared-stem cycles of length two
to four, a cycle beside an independent mover, and a vault with no prefixes at all. It also
asserts no folder is lost and no temporary name survives.

**2026-10-28 · A renumber is safe to interrupt, so it is not transactional**
It touches only the derived projection. `sequence` is never written, so a half-finished
renumber still shows the right order in the app — only the Finder-facing picture is
briefly wrong — and re-running completes it.

That is why the temporary name is `<current-name>~renumbering` rather than something
opaque: stripping the suffix recovers a name whose prefix parses normally, so an
interrupted renumber is resumable with no journal and no recovery mode. There is a test
that starts from a leftover temporary name and asserts re-running finishes the job rather
than baking the temporary name in permanently.

**2026-10-28 · The prefix width comes from the count, not a constant**
Prefixes are read by sorting them as text, so a fixed two digits breaks at a hundred:
`100-` sorts before `99-`, destroying the one thing prefixes exist for. The width is the
digit count of the largest position, minimum two.

The cost is that adding a hundredth lecture renumbers the other ninety-nine. Rare, and
the alternative is a vault that sorts wrongly for good.

**2026-10-28 · Never rename onto an occupied name, because POSIX `rename` is silent**
`fs::rename` replaces an existing *file* without complaint. So a target held by anything
that is not part of this renumber — a stray folder, a file someone left there — is
reported and skipped, never written over. This is a data-loss path, not a tidiness one,
and it is the reason `plan_renumber` takes the whole directory listing rather than just
the lectures.

**2026-10-28 · Per-device state lives outside the vault (decided with the user)**
Asked, because two readings produced materially different work and the consequence is
user-visible. Both questions answered: state goes outside the vault, and resume does not
follow you between devices.

What settled the location was noticing that **both** candidate designs need something
outside the vault — but they differ in what they put *inside* it. State-outside-the-vault
puts at most a vault identity in the vault, which is correct to sync because it identifies
the vault rather than the device. State-in-`.nexus/` needs a device id, and a device id in
a synced tree makes two devices believe they are the same device. One design syncs
something it should; the other syncs something it must not. That is not a tie.

Two supporting arguments. Obsidian keeps per-device workspace state in its in-vault
`.obsidian/` folder, and the sync conflicts that produces are a well-known complaint — the
closest comparable product gets this wrong in exactly the way being avoided. And the
derived caches still to come, thumbnails and a search index, are potentially hundreds of
megabytes of regenerable data, which has no business crossing a network and no reliable
cross-client way to be excluded from one.

Not having resume across devices removes real machinery: one file, no second synced
"last-read page", no reconciliation rule. Recorded as a deliberate choice rather than an
omission, so it is revisited on purpose if it ever itches.

**2026-10-28 · Correcting the spec amendment I wrote yesterday**
The 2026-10-27 amendment moved view state out of `manifest.json` — right — and sent it to
"the rebuildable `.nexus/` cache ... which is never synced". Both halves of that were
wrong.

`.nexus/` sits *inside* the vault, so it syncs exactly when the vault syncs. Calling it
never-synced was a plain mistake, and it was load-bearing: it was the whole reason view
state looked safe there. And view state cannot be derived from a scan, so putting it in
`.nexus/` would have silently converted §3's "deleting `.nexus/` fully reconstructs" into
"deleting it costs you your place in every lecture" — a guarantee with a caveat, which is
not a guarantee.

Corrected in `claude-spec.md` beside the original, and `CLAUDE.md` §3 now states the rule
as a test rather than a description: **if a thing cannot be rebuilt from the vault, it does
not go in `.nexus/`.** That phrasing is what makes the next case decidable without
relitigating this one, and it keeps "clear the cache" an operation that needs no warning.

**2026-10-28 · Zoom is a multiplier, so it is not normalised like the geometry**
`PageOffset` is a fraction of a page's height, normalised for exactly the reason
annotation geometry is: a pixel offset is meaningless at a different window size, and
restoring one would put someone in the wrong place on a different screen.

`Zoom` is not, because a scale factor has no natural maximum. It still gets bounds —
`0.1` to `16.0` — and those are a guard rather than a feature. The failure they prevent is
specific: a corrupt or hand-edited file restoring a zoom of zero, which renders a page as
nothing and looks exactly like a lost document. Both types validate on deserialize, so a
damaged file cannot restore a nonsense view; there is a test feeding in zero, `1e9`, a
negative offset and a traversal key as a map key, and asserting each is refused.

**2026-10-28 · Pruning is against the vault, and stops short of reading documents**
Without pruning the state file grows forever: every lecture ever deleted or renamed keeps
its entry, and a renamed one leaves a ghost that never loads. `prune_to` takes what a scan
found, because the vault is the only authority on what exists. It also clears
`last_opened` when that lecture is gone, or launch would try to reopen something deleted.

It deliberately does **not** prune a remembered page that is beyond the end of a shortened
document. This type cannot know how many pages a PDF has, and reading documents to tidy a
cache is the wrong trade; the viewer clamps on restore instead. Recorded because the
missing check looks like an oversight, and there is a test naming it as a choice.

**2026-10-28 · The cache is never trusted, which deletes the hard problem**
`.nexus/index.json` is not consulted to decide what is in the vault. It exists so the
sidebar can paint instantly at startup; the walk runs straight afterwards and replaces
whatever it showed. The scan is always the authority.

That removes the thing caches usually get wrong. There is no staleness scheme, no vault
fingerprint, no mtime comparison — nothing to be subtly wrong about. Someone who
reorganises their vault in Finder with the app closed cannot produce a wrong answer, only
a briefly out-of-date first paint. It is also what makes §3's requirement literally true:
every field is derived from a `manifest.json` that stays the source of truth, so deleting
the cache costs one slow startup and nothing else. There is a test that deletes it and
asserts the rebuild is byte-identical.

Because nothing is trusted, `load` is **infallible** rather than usually-succeeding. Every
failure — missing, corrupt, from a newer build, unreadable — has the same answer, which is
to scan. Returning `Result` would invite a future caller to treat a missing cache as a
problem and refuse to start.

**2026-10-28 · A corrupt cache is discarded, where a corrupt manifest is preserved**
Deliberately opposite to the rule everywhere else, including the *newer-version* rule: a
manifest from a newer build is left strictly alone because misreading it could corrupt
work, while a newer cache is ignored and rebuilt.

The distinction is **does this file contain work**, not what kind of file it is. A manifest
and an annotation set hold things that exist nowhere else, so damaged bytes are copied to
`.bak` first. The cache holds nothing the vault does not already hold, so a `.bak` would
be litter in a folder someone is trying to study in.

Concretely this meant *not* routing `VaultIndexStore::load` through `versioned`, which
exists to share the back-up-then-continue behaviour. Reusing it would have been the
obvious move and would have quietly produced `index.json.bak` files. Both rules now have
a test asserting the backup is there, and asserting it is not.

**2026-10-28 · `Slug` was conflating safety rules with presentation rules**
Found immediately: `RelativePath::parse(".nexus/index.json")` fails, so the cache path
could not be expressed at all. The leading-dot rule was blocking it.

Those rules are two kinds of rule wearing one coat. Most are about *safety* — no
separators, no `.` or `..`, no control or invisible characters, no Windows device name, no
trailing dot or surrounding whitespace — and they are what make a segment safe to join
onto a path. One, refusing a leading dot, is about *presentation*: a hidden folder is one
a person cannot find when something goes wrong. For a name Nexus chooses for itself, being
hidden is the point.

So `Slug::internal` lifts exactly that one rule and no other, with a test that walks the
whole unsafe list and asserts each is still refused — because the risk of a second
constructor is that it becomes the lax one people reach for. The leading-hyphen rule stays
in the safety set, since it is about a name reading as a command-line option when the
converter adapters shell out.

**2026-10-28 · Open question: `.nexus/` inside the vault, when a sync client arrives**
The cache sits in the vault, which keeps a vault self-describing and portable and matches
every other locked decision. That is right today, because nothing syncs the vault — cloud
drives are deferred to 2.0.

It becomes a question then. A synced `.nexus/` would produce `index (conflicted copy).json`
litter in someone's study folder. Harmless, since the file is never trusted, but ugly.
The alternative is `~/Library/Application Support/`, keyed by vault path, which never
syncs but stops the vault being self-contained. Not deciding it now, and not building for
it speculatively; it is the natural first question when 2.0 starts.

The related one is live: per-device view state (which page you were on) **cannot** be
derived from a scan, so it is not cache, and two devices at different pages is correct
rather than a conflict. That is the next substep, and it is where the location question
actually has to be answered.

**2026-10-28 · Recorded gap: `BundleRef` crosses IPC but has no fixture yet**
`BundleRef` became serialisable for the cache, and the sidebar will receive it over IPC in
M2. The fixtures under `fixtures/` exist so the Rust types and the Zod schemas cannot
drift, and this type now belongs in that set. Not done here: it needs a Zod schema and
both-language assertions, and half-doing it would be worse than recording it. `index.json`
itself needs no fixture — TypeScript never reads it, since first paint comes over IPC.

**2026-10-28 · A refused link and an unreadable folder need opposite advice**
The walk mapped every listing failure to `Unreadable`, whose remediation says the folder
may be mid-sync and to try again later. For a symlink that advice is simply wrong — the
folder will never become readable, because Nexus does not follow links inside a vault.

`SkipReason::SymlinkRefused` now carries the accurate sentence: the place it points at
will not exist on your other devices, so move the real folder in. The walk tells the two
apart by inspecting the error rather than by guessing, which works because
`VaultRoot::resolve` already distinguishes them.

**2026-10-28 · How a symlink is presented to the walk, and why it is not just skipped**
A link pointing at a *directory* is reported as a directory, so the walk tries to descend,
is refused, and reports it. Skipping it instead would make a symlinked lecture folder
disappear with no explanation — and someone who linked a folder into their vault has made
a mistake worth hearing about, since it will not survive a sync.

A link pointing at a file, or a broken one, is reported as a file and therefore ignored.
There is no lecture hidden behind it, so reporting it would be the kind of noise that
makes real warnings get skipped.

Asking what a link points at is not the same as reading through it: the answer only
decides what to *say*, and the refusal still happens either way.

Non-UTF-8 names are passed through lossily rather than dropped, for the same reason the
port hands back `String`: a name the domain will refuse still has to be *visible* to be
reported.

**2026-10-28 · Three lists, because one corrupt file must not cost a vault**
`LoadedVault` separates what loaded, what the walk could not use, and what was found but
would not load. Collapsing the failures into the successes would hide them; collapsing
them into an overall `Err` would lose the other two hundred and ninety-nine lectures. A
test writes a truncated manifest beside a good one and asserts the good one still loads,
the failure is reported with its own code, and the damaged bytes were copied aside on the
way past.

**2026-10-28 · A claim I had to walk back in the same session**
The new test file's documentation said its symlink case "closes a gap recorded earlier"
about symlink refusal being reasoned rather than demonstrated. That was wrong:
`vault_root.rs` and `storage.rs` already test refusal, and the recorded gap is
specifically about `O_NOFOLLOW`, which nothing here exercises — the flag only fires inside
the time-of-check/time-of-use window. Corrected before committing. What is actually new is
the *reporting* behaviour, which is worth a test on its own but is not the gap.

Recording it because the failure mode is the one §1.1 warns about most directly: writing
down what I meant to achieve rather than what I checked. The gap list above is unchanged.

**2026-10-28 · The vault walk is domain logic, so only directory *reading* is a port**
Which directories are lectures, how deep nesting may go, and what to do about a folder
whose name cannot be used are all rules, and none of them depend on how a directory is
read. So `scan_vault` lives in `lecture-core` behind a `VaultDirectory` port that does
nothing but list entries.

Two things fall out. The iPadOS app implements one trait and inherits the walk instead of
reimplementing it — which is the whole point of the §3 constraint. And the tests describe
a hostile tree in memory rather than creating thousands of real directories, which is
both faster and more thorough: a vault where one folder refuses to be read is three lines
to express.

The port hands back `String` names rather than `Slug`s on purpose. The walk has to be
able to *see* a name it cannot use in order to report it; validating at the boundary would
throw away the only thing worth telling someone about.

**2026-10-28 · Nothing is silently omitted, because a missing lecture looks like data loss**
If a lecture disappeared from the sidebar with no explanation, the reasonable conclusion
is that the app lost it. So the walk reports four cases with a remediation sentence each:
a folder name that cannot be used on a device the vault syncs to, a folder nested past
the cap, a directory that cannot be read, and a lecture buried inside another lecture.

The last one is the easiest mistake to make — dragging one lecture into another — and the
only one that costs anything to detect, since pruning means the walk never descends there.
It does one bounded sweep inside each bundle specifically to find it. Worth the cost:
pruning is *correct* (everything under a lecture is that lecture's content), but being
correct and silent would still look like the app eating a lecture.

Two deliberate quietnesses. Hidden directories — `.nexus`, `.git`, `.DS_Store` — are
skipped without comment, because reporting expected things is the noise that makes real
warnings get ignored. And a folder past the depth cap is only reported if something is
actually inside it; warning about an empty deep folder would be warning about nothing.

Failures are scoped: an unreadable directory is recorded and the walk carries on, so one
folder mid-sync cannot make a whole vault unopenable. Only an unreadable *root* is an
error, because then there is no vault to scan.

**2026-10-28 · `RelativePath` was ordering by field layout, not by path**
`Ord` was derived, so it compared `parents` and then `name` as separate fields — which
puts every root-level path ahead of every nested one. `quick-note` sorted before
`cs454/raft`. Found because a scan test asserted the order a person would expect and got
something else.

Not incorrect as a total order, but wrong for a path type, and latent anywhere this is
sorted for display or used as a `BTreeMap` key. Now implemented rather than derived,
comparing the whole segment sequence, which gives the order any other tool would produce.
There is a test pinning it next to a comment saying why it is not derived.

**2026-10-28 · Four more files split at the 300-line limit**
`relative_path.rs` (308) split into the type and `limits.rs` — the depth constants carry
more reasoning than the code they govern, and "how deep may things go" is a different
concern from "what is a path". The scan and path test files split along their own seams,
with the in-memory vault harness moved to `tests/support/` so both scan files share one
copy rather than duplicating it.

The harness uses `pub(crate)` rather than `pub`: inside a test binary that is the right
visibility, and it satisfies `unreachable_pub` honestly instead of with an `allow`.

**2026-10-28 · Four-space code blocks: dissolved by the editor, not parsed around**
I had this scheduled as a fix needing either ~200 lines of CommonMark block parsing or a
`pulldown-cmark` dependency. The user's question closed it instead:

> *"why are we doing this hacky thing that 4 spaces mean code blocks, why not an explicit
> code block option that would represent a code block... for the note taker, it should be
> like they select code block option, and paste in the block."*

Correct, and it removes the problem at the source. Four-space indentation is a **legacy**
Markdown form; the editor's code-block affordance inserts a *fence*, so notes written in
Nexus never contain an indented code block. I was about to write a parser for a form the
app will never produce — solving the symptom, which §1.5 says not to do.

The only residual path is pasting foreign Markdown containing both a four-space block
*and* a `cite://` inside it. Since `cite://` only occurs in Nexus's own notes, that means
pasting Nexus markdown as a code sample. The cost if it ever happens is a stray badge or
one spurious orphan entry — not a reason for a permanent dependency. **Accepted, not
deferred.**

The real deliverable is therefore a requirement on the editor rather than on the scanner,
recorded below so it is not rediscovered later.

**2026-10-27 · A citation carries a line number and deliberately nothing finer**
`cite://<id>` is the one value in a bundle that a person's *prose* depends on —
everything else can be rebuilt from a vault scan.

A byte or character offset within the line was considered and rejected. Rust counts
bytes, a `char` is a Unicode scalar value, and `CodeMirror` counts UTF-16 code units:
three different numbers for the same position. The spec's own citation template contains
an emoji (📌), so the disagreement would not be hypothetical — every citation after it
would be placed wrongly, and the bug would look like the editor misbehaving rather than
like a units mismatch. Line counting is the one measure both languages agree on, and it
is all the bidirectional link needs: clicking a highlight scrolls the editor to a line,
and clicking a citation badge needs only the identifier already under the cursor.

If in-line positioning is ever wanted, it should be decided with the encoding question
faced directly rather than inherited by accident.

**2026-10-27 · The scanner skips code, because a `cite://` in a fence is an example**
A regex over the whole file would treat `cite://hl-x` inside a code fence as live. Two
costs: the viewer scrolls to the wrong place, and — much worse — if citations are ever
rewritten to mark an orphan, the rewrite would edit someone's code sample. So fenced
blocks and inline code spans are skipped, with the fence rules CommonMark specifies
(matching character, closing run at least as long, no info string, up to three spaces of
indent).

Two subtleties have tests because getting either wrong corrupts reading silently: a
shorter backtick run does not close a longer fence, and an *unterminated* inline backtick
is literal text rather than swallowing the rest of the line — otherwise one stray
backtick would unlink everything after it.

**Known limitation:** indented (four-space) code blocks are not detected. Telling one
from a list continuation or a wrapped paragraph needs real Markdown block parsing, and a
Markdown parser dependency is out of proportion here. A `cite://` inside an indented
block reads as a live citation.

**2026-10-27 · The identifier ends at the first character it cannot contain**
In `[Slide/Page 4](cite://hl-9f8a7b6c)` the `)` must terminate the identifier. Taking the
maximal run of `AnnotationId`'s alphabet does that for free, and for every other
terminator — space, comma, quote, full stop — without a list of delimiters to keep in
sync. This is why `AnnotationId` is restricted to characters needing no URL escaping: the
same property that makes it safe in a link makes it unambiguous to scan back out.

A malformed occurrence (`cite://` with nothing after it, or an over-long identifier) is
skipped rather than collected. It cannot name any annotation, and a list of malformed
citations that nothing consumes would be the field-nothing-fills pattern already
criticised in the spec.

**2026-10-27 · An orphaned citation is reported, never repaired**
A citation whose annotation is missing stays exactly where it is. Usually the highlight
was deleted; but on a synced vault it can simply mean the notes arrived before the
annotations, in which case the link starts working on its own. Either way the text
belongs to the person who typed it, so the UI's job is to show it as broken, not to
remove it. There is a test asserting the orphan is still in the index after being
reported.

The reverse — an annotation nothing cites — is not a problem at all. Highlighting without
writing about it is the common case, so `unlinked` exists to offer "link this to your
notes", not to warn.

**2026-10-27 · Two §4 line-limit violations I had let drift**
`error.rs` had grown to 357 lines and two test files past 300, against the 300-line limit
in §4. Owned rather than quietly left: `error.rs` split into `error/mod.rs` (the variants
— what can go wrong) and `error/guidance.rs` (`code` and `remediation` — how it is said),
which is a real seam, since the two change for different reasons. `tests/annotation.rs`
split into the single-annotation and the set cases; `tests/citation.rs` into scanning and
resolution. All files are now within the limit, and a check for it is part of the gate
run rather than something to notice later.

**2026-10-28 · The UI will eventually need its own citation scanner — plan recorded now**
Live `cite://` decorations in the editor cannot round-trip through IPC on every keystroke,
so the TypeScript side will one day need a scanner of its own, and then the two could
disagree exactly as the wire format could have. Not written yet, because the editor does
not exist and a scanner nothing calls is dead code.

When it is written, it gets the same treatment as the wire format: a fixture holding a
notes file and its expected citations, asserted by both languages. Recording the
mechanism now means that is a decided plan rather than a hole discovered later.

**2026-10-27 · One shape, two languages, and a fixture to stop them drifting**
`manifest.json` and `annotations.json` are now described twice: by the Rust types that
write them, and by the Zod schemas the UI validates IPC and disk payloads with (§4).
Two descriptions of one shape are free to drift, and the drift would surface as a
corrupted-looking file in front of someone trying to study.

The options were a code generator (`ts-rs` or `schemars`), which means a dependency in
the crate that must stay iOS-clean and dependency-light, or hand-written schemas with
nothing holding them together. Took a third: the shape is written down once as committed
fixtures under `fixtures/`, and both sides are held to those bytes.

- `crates/lecture-core/tests/wire_format.rs` asserts the Rust types still serialise to
  exactly those bytes, serialising the same way `versioned::save` does so a fixture is
  byte-identical to a file the app would really write.
- `src/schemas/schemas.test.ts` asserts the Zod schemas still accept them.

Change either side and one of the two tests fails. No codegen, no new dependency, and
the contract is a file a person can read. Regeneration is
`UPDATE_FIXTURES=1 cargo test -p lecture-core --test wire_format`, the pattern `insta`
and `trybuild` use, named in the module docs so the next reader does not mistake the test
for self-certifying.

**2026-10-27 · The Zod schemas are deliberately weaker than the Rust types**
They check what would **misrender or mislink**: coordinate ranges, enum membership,
identifier syntax, page numbering, timestamp form, id uniqueness, unknown fields. They do
**not** re-check cosmetic normalisation. Rust collapses whitespace and normalises a label
to NFC; a hand-edit leaving two spaces in a course name produces a file Rust would tidy
but that renders perfectly, and refusing to open someone's lecture over it is the wrong
trade.

The asymmetry is sound in one direction only, which is the direction that matters:
anything Rust accepts, Zod accepts. The reverse does not hold, and need not — Rust stays
the authority on writes, so a value this layer tolerated on read is still refused if the
UI tries to save it.

Byte lengths are checked with `TextEncoder`, not `String.length`. Rust caps lengths in
bytes while `.length` counts UTF-16 units, so a 500-character CJK label is 1500 bytes and
would pass a naive check that Rust would reject. That is exactly the kind of quiet
divergence the fixtures exist to catch.

**2026-10-27 · Making the type carry the guarantee instead of asserting it**
A text highlight's `rects` is never empty, and `boundingRect` folds over it without a
seed value. In Zod, `z.array(x).min(1)` and `.nonempty()` both check at runtime but still
infer `Rect[]`, so the fold needed a non-null assertion — which §4 bans. A variadic tuple,
`z.tuple([rect], rect)`, infers `[Rect, ...Rect[]]`, so the compiler knows the first
element exists and the assertion is not merely forbidden but unnecessary. Verified both
the inferred types and the runtime behaviour before committing to it.

The same principle appears in the test helper that reads the fixture's first annotation:
`noUncheckedIndexedAccess` makes it `| undefined`, and it throws with a message rather
than being silenced — a fixture that lost its annotations should fail loudly.

**2026-10-27 · The lint bans were verified to fire, not just to pass**
A lint config that passes while catching nothing is worthless, so each ban was checked
against a file that violates it, and the file deleted afterwards. All four fire: `any`
(`no-explicit-any`), `!` (`no-non-null-assertion`), `@ts-ignore` (`ban-ts-comment`), and
`as unknown as` — which has no dedicated rule and is matched structurally via
`no-restricted-syntax` on `TSAsExpression > TSUnknownKeyword`. Banning `as unknown` on
its own is the right granularity: alone it is almost always the first half of a double
cast, and a genuinely unknown value needs no assertion to become `unknown`.

**2026-10-27 · A missing `annotations.json` is empty; an unreadable one is not**
`manifest.json` is required, so its absence means something is wrong. `annotations.json`
is absent in every freshly imported bundle, so its absence is normal and must load as an
empty set.

The dangerous way to implement that is to treat *any* load failure as empty. Then a
permissions problem, a half-synced file or a corrupt one reads back as "this lecture has
no highlights" — and the next save writes that emptiness straight over the person's work.
So only genuine absence counts: the decision is made by inspecting the error for
`NotFound` rather than by checking existence first, which would leave a window in which
the answer changed between the check and the read. There is a test asserting that an
unparseable file is an error while a missing one is empty.

`AnnotationStore` also deliberately holds **no clock**, unlike `ManifestStore`. A manifest
has one modification time that a save must not forget to stamp; an annotation set has
none, because each annotation carries its own times. A set-level timestamp would be a
second thing to disagree after a sync, so the type does not have one and the store does
not need the port.

**2026-10-27 · The load asymmetry now exists once, not once per file**
Writing `AnnotationStore` meant writing the corrupt-versus-newer logic a second time,
which is the wrong shape for the most destructive code in the storage layer: two copies
means two places to get it right and two places to test. Extracted into
`lecture-fs::versioned` as a generic read-probe-parse path that both stores call.

The extraction forced a naming correction. The previous commit reused
`ManifestVersionUnsupported` and `ManifestUnreadable` for `annotations.json`, so a
corrupt annotations file reported an error that said "manifest" — wrong, and exactly the
kind of thing a tired reader at 2am does not need. They are now
`SchemaVersionUnsupported` and `StoredFileUnreadable`, each carrying which file it is
about. `SchemaProbe` moved out of `manifest.rs` into `domain/schema.rs` for the same
reason: it serves both files, and the two keep independent version numbers because they
change for different reasons.

**2026-10-27 · Frontend toolchain installed; two versions I had guessed were wrong**
The user approved the package list and the install ran. Two corrections came out of it,
both found by the registry rather than by me:

- `@vitejs/plugin-react@5.1.1` does not support Vite 8 — its peer range stops at 7.
  `6.1.2` is the first that declares `vite@^8.0.0`. npm's own suggestion was `--force` or
  `--legacy-peer-deps`, which is precisely the patchwork `CLAUDE.md` §4 bans; the right
  fix was the version that actually resolves.
- `@types/react@19.3.1` and `@types/react-dom@19.3.1` do not exist. The `@types`
  packages version independently of the library they describe, and the current release is
  `19.3.0`.

Recorded because the general lesson is the one already learned about crate licences: a
version number recalled from memory is a guess. Every version in `package.json` was
checked against the registry before the install, and the licence table below comes from
reading the installed manifests, not from recollection.

**2026-10-27 · The spec is a draft — standing permission to argue with it**
The user's instruction, verbatim: *"you don't need to always follow what the claude md
spec says regarding the product specification. i mean if you feel that there is something
wrong written, you bring it up to me. don't worry. it is possible some requirements were
written wrongly."*

Recorded as `CLAUDE.md` §1.7. The shape of it matters: raise it, do not deviate silently,
and amend `claude-spec.md` with a dated note beside the original wording so nobody later
has to guess whether a difference was intentional or a bug. It is permission to question
requirements, not licence to redesign the product.

**2026-10-27 · `annotations.json` stores the meaning of a highlight, not its colour**
The spec's example annotation carries `"color": "#FACC15"`. Three things are wrong with
that, and one of them is that the spec disagrees with itself: §2.2 defines the four
highlights *semantically* ("Yellow = Key Concept, Green = Definition, Red =
Exam/Important, Blue = Question"), and `CLAUDE.md` §3 locks the actual palette — which
`#FACC15` is not part of. It appears to be a leftover from a generic colour ramp.

Storing the hex would have cost:

- **The meaning.** "Show me everything exam-relevant before Thursday" is the single most
  valuable query this app can answer, and against stored hexes it becomes a reverse
  colour lookup that breaks the moment two semantics are near-neighbours.
- **The ability to change the palette.** Retuning amber for contrast would leave every
  already-saved highlight on the old hex, so one vault would show two ambers with no way
  to tell which was meant.
- **The accessibility guarantee.** `CLAUDE.md` §3 requires a K/D/E/Q glyph precisely so
  the set does not rely on hue alone. A glyph cannot be derived from a colour.

So the enum stores `key` | `definition` | `exam` | `question`, and carries no hex at all.
Colour is a design token and belongs to whichever UI is rendering — which also means the
Phase 2 iPad app maps the same enum to its own tokens instead of inheriting a macOS
stylesheet through the domain crate.

**2026-10-27 · A tagged enum instead of one wide record**
The spec sketches every annotation carrying every field, with `"freeText": null` on a
highlight. In that shape nothing stops a file claiming `textHighlight` while holding a
text box's `freeText` and no rectangles — the invariants become checks somebody has to
remember to run, on a file format that is plain JSON in a folder people browse.

Each kind now carries exactly its own fields, so the contradictory record cannot be
described, let alone loaded. A test feeds seven hand-edited files in and asserts each is
refused on read, including a text highlight covering nothing, page zero, a rectangle
running off the page, and two annotations sharing an id — which would mean a `cite://`
link in the notes resolving to two different places with nothing to say which was meant.

**2026-10-27 · `boundingRect` is derived; `documentId` and `inkStrokes` are not stored**
`boundingRect` is the union of `rects`, so storing both is two sources of one truth that
will eventually disagree after a hand-edit or a partial write. Computed on read instead,
which costs nothing and cannot drift.

`documentId` is removed because nothing else in the format holds a document id, so there
was nothing to compare it against — and a value that cannot be checked is one that will
be wrong without anyone noticing. The need behind it is real and worth naming, though:
annotations are positioned against a *particular rendering*, so if the PDF is reconverted
and the layout shifts, every rectangle silently points somewhere slightly wrong. Catching
that needs a hash, not a random id. That is the deferred `source` hash, and pairing the
two is Milestone 2's job. Inventing an unverifiable id now would have made it look solved.

`inkStrokes` is removed because the spec declares it as `[]` and then never mentions ink
again — no feature, no shortcut, no test. An always-empty array reads as working while
nothing fills it, which `CLAUDE.md` §4 bans outright. Deferred until Apple Pencil is an
actual requirement, which is a Phase 2 question.

**2026-10-27 · Pages are numbered from 1, and the type says so**
The spec never states it, but its citation format writes `[Slide/Page 4]` beside
`"pageNumber": 4` and its test journeys talk about "Page 2", so the stored number is the
one a person reads off the screen. Worth pinning in a `NonZeroU32` newtype because an
off-by-one here is invisible: every highlight simply renders on the wrong page, and a
test that only round-trips data would never notice. `zero_based_index()` exists so the
conversion lives in exactly one place rather than being rewritten wherever it is needed.

**2026-10-27 · Exact float equality is wrong for a *computed* coordinate**
A test asserted the derived bounding box's bottom edge equalled `0.31`. It is
`0.31000000000000005`, because `0.28 + 0.03` is not exact in binary floating point. The
implementation was right and the assertion was wrong. Comparing stored-and-read-back
coordinates exactly is still correct and still done; only arithmetic results get a
tolerance, set at `1e-9` — far tighter than a pixel on any display, so it cannot hide a
real positioning error.

**2026-10-27 · Corrupt and from-the-future are opposite cases, not one case**
Two load failures look alike and must be handled in opposite ways, and getting this
backwards would be the most destructive bug in the storage layer.

A *corrupt* manifest — truncated, hand-edited into nonsense, internally inconsistent — is
copied to `.bak` before anything else happens, so the bytes someone had are preserved
even if a later repair overwrites the original. A manifest from a *newer build* is left
strictly alone: no backup, no rewrite, nothing. It is not damaged, merely newer than this
reader, and treating it as corrupt would destroy data an updated Nexus could read
perfectly — then propagate that damage back to the device that wrote it. There is a test
asserting that the newer file's bytes are unchanged *and* that no `.bak` appears.

Reading the version therefore happens in its own pass, through a `SchemaProbe` that
allows unknown fields. A file from a newer build need not deserialise as the current
shape at all, so asking the full parser first would report it as corrupt — the one
verdict that must not be reached.

**2026-10-27 · Error messages carry the parser's own detail and the real backup outcome**
A first draft discarded the `serde_json` error and relied on static remediation text that
promised a `.bak`. Both were wrong. "Could not be read" is not something anyone can act
on, whereas a line and column turns a broken hand-edit into a ten-second fix — so the
parser's message is carried through. And the static text would have *lied* on the
occasions when making the copy also failed, which is the one moment a person most needs
to be told accurately where their work is. `BackupOutcome` now records whether the copy
was made and where, and the message states whichever is true.

**2026-10-27 · Source hashes deferred to Milestone 2, accepting a migration**
The spec lists hashes in `manifest.json`. They are not there yet, because the importer
that would compute them lands in Milestone 2, and declaring a field now would mean
inventing its algorithm and shape before knowing the use — a field nothing computes is
worse than a planned migration.

The cost is explicit: because unknown fields are denied, adding the field will bump
`schemaVersion` to 2. That is accepted deliberately. It makes the first schema migration
a small, well-understood one rather than something first attempted under pressure on a
format already holding real data.

**2026-10-27 · `manifest.json` does not hold view state — spec amended**
The spec described `manifest.json` as holding "last opened page/scroll state". Raised
with the user and agreed: it does not. Scroll position changes constantly and the
manifest is a *synced* file, so storing it there rewrites a synced file on every scroll,
pushing churn to every device and manufacturing exactly the conflicts the "no central
index" decision exists to avoid. Per-device view state lives in the rebuildable
`.nexus/` cache, which is never synced and whose loss costs a scroll position.

A side benefit settles a question that would otherwise have come up later: it becomes
*correct* for two devices to sit at different pages of the same lecture, which is what
someone reading on an iPad and a laptop actually wants. `claude-spec.md` carries a dated
amendment note; the bundle format is otherwise untouched.

**2026-10-27 · `Label` normalises rather than merely validating**
Facet values are *grouped on* at runtime, so validation alone is not enough: `"CS 454"`
and `"CS  454"` would pass any check and still appear as two separate courses in the
sidebar. `Label` therefore applies NFC, trims, and collapses inner whitespace runs, so
values that look identical to a person are identical to the code. Case is left alone,
because it is meaningful on screen.

**2026-10-27 · `Slug` and `Label` treat control characters differently, on purpose**
`Slug` refuses every control character: a tab inside a *filename* is pathological however
it got there. `Label` refuses only control characters that are not whitespace, because a
tab or newline in a *title* almost always arrives from text pasted out of a PDF or a
spreadsheet, and refusing that would be hostile — they are collapsed as whitespace
instead. `NUL` and `ESC` have no such excuse and are still refused.

This surfaced as a test failure while writing `Label`, and the test was right to fail:
the first implementation reused `Slug`'s rule and would have rejected a pasted title. The
shared module `domain/text.rs` now holds the character *definitions* so a set like the
invisible-character list cannot fork, while each type keeps its own policy on top.

**2026-10-27 · Tags are a set; `custom` is a `BTreeMap`**
Both choices are about sync, not tidiness. Tags sorted and de-duplicated means two
devices that add the same tag converge on identical bytes instead of conflicting over
order. A `BTreeMap` rather than a `HashMap` means identical data serialises to identical
bytes every run; with a `HashMap`, key order varies and every save would look like a
change to a sync client and produce an unreadable diff.

A hand-edited file with out-of-order tags is *corrected* rather than refused — losing
access to a lecture because its tags were listed alphabetically wrong would be a bad
trade.

**2026-10-27 · Unknown fields are denied, so an additive change must bump `schemaVersion`**
The alternative is silent loss: if a newer minor version adds a field, an older reader
that ignores unknown fields would drop it on the next save, and the newer device's data
would vanish. Denying unknown fields makes that impossible by construction — any field
addition has to bump `schemaVersion`, which the load path handles explicitly. It also
means a hand-edit typo like `"corse"` is reported instead of discarded. `custom` is the
sanctioned extension point for anything that does not warrant a version bump.

Note that the dangerous case — a *newer* file reaching an older app — is handled by the
version check and must never trigger the `.bak`-and-rewrite path, which is for corrupt
files only. That distinction lands with the manifest load path in the next substep.

**2026-10-27 · Timestamps are stored in exactly one form, and nothing else is accepted**
`2026-10-27T16:00:00+01:00` and `2026-10-27T16:00:00.5Z` are both valid RFC 3339 and both
refused. The reason is that one canonical form makes **byte order equal chronological
order**, so sorting lectures by date is a plain string sort with no parsing and no date
library. Accepting a second spelling would break that property silently — the symptom
would be a mis-ordered list, not an error — so strictness is the feature. Local time is
never stored either: a vault syncing between a laptop and an iPad across time zones would
otherwise record instants that cannot be compared.

**2026-10-27 · Calendar arithmetic hand-written instead of adding a date crate**
The only calendar operation this app performs is rendering the current instant, so a date
library would be a permanent dependency for one function. Implemented with Hinnant's
`civil_from_days` — exact integer arithmetic, no floating point, no month table, and no
special case for leap years because it shifts the year to start in March.

Hand-rolled date maths is a classic source of silent data corruption, so it was checked
against an independent oracle rather than against itself: `date -u -r` over 20,000
pseudorandom instants spanning 1930 to 2129, zero mismatches. The vectors kept in the
suite are the boundaries — epoch, day rollovers, 2000-02-29 (leap century), 2024-02-29,
2100-03-01 (non-leap century), year ends, and two pre-epoch instants that would land on
the wrong day under truncating division instead of floor division.

The revisit trigger is recorded in the code: if parsing arbitrary formats, date
arithmetic or time zones are ever needed, adopt a real date library rather than extend
this.

**2026-10-27 · `Clock` is the first port, and sets the pattern**
Reading the time is a platform call, so it is a trait in `lecture-core::ports` with
`SystemClock` in `lecture-fs`. Two gains: the domain crate stays free of platform calls,
and anything that stamps a record can be tested against a known instant instead of
against whenever the suite happens to run. `FixedClock` lives beside the trait rather
than in a test module so adapter crates can use it too. `DocumentConverterPort` will
follow this shape.

Note that the *arithmetic* stayed in the domain and only `SystemTime::now()` sits in the
adapter. That keeps the part most likely to harbour a bug under pure, deterministic test,
and the iPadOS adapter inherits it unchanged.

**2026-10-27 · The parent directory is flushed after the rename, not just the file**
`sync_all` on the staging file makes its *contents* durable; it says nothing about the
directory entry the rename created. Without the second flush, a power loss can leave the
rename unrecorded and the file back at its previous content — or, worse, the file's data
flushed while the entry points nowhere. This is the step most atomic-write
implementations omit, and it is cheap, so it is done.

**2026-10-27 · Staging names use a composed token, not a `uuid` crate**
`CLAUDE.md` §4 wrote the staging name as `<file>.tmp.<uuid>`. Implemented as
`.tmp.<16 hex of nanos><8 hex of pid><4 hex of sequence>` — a fixed 33 bytes — rather
than adding `uuid` and `getrandom` for a filename suffix. Uniqueness does not actually
rest on the token: the file is created with `create_new`, so the *kernel* enforces it and
a collision is an error rather than an overwrite. The token only spreads names out. The
wording in `CLAUDE.md` was left as written and this entry records the deviation; it is a
naming difference, not a weaker guarantee.

The suffix width is asserted at *compile time* against the 200-byte cap `Slug` enforces
(`const _: () = assert!(SUFFIX_BYTES <= 41)`), so the two numbers cannot drift apart
without the build failing. That replaced a runtime test, which clippy rightly flagged as
an assertion on constants.

**2026-10-27 · `libc` added to `lecture-fs` only, for `O_NOFOLLOW`**
Needed to name the constant. Hardcoding `0x0100` would be a magic number where the real
lookup exists, which the anti-patchwork clause bans. `libc` is rust-lang-maintained,
`MIT OR Apache-2.0`, already present transitively, and has no dependencies of its own.
`lecture-core` does not gain it: `cargo tree -p lecture-core` shows only `serde`,
`thiserror` and `unicode-normalization`, which is the check that keeps the boundary real
rather than aspirational.

**2026-10-27 · Third recorded gap: `O_NOFOLLOW` is not exercised by any test**
Every symlink reachable through the storage API is refused by `VaultRoot::resolve` one
step earlier, so the flag only fires inside the time-of-check/time-of-use window, which
a single-threaded test cannot open. The symlink tests in `tests/storage.rs` prove
`resolve`, not the flag. Noted in the code as well, so nobody reads those green tests as
coverage of it. This joins the two gaps recorded above; all three are defence-in-depth
whose failure paths are reasoned rather than demonstrated.

**2026-10-27 · `fsync` on macOS is not `F_FULLFSYNC`**
Flushing reaches the OS, not necessarily the drive's own write cache. Forcing the latter
needs `F_FULLFSYNC` through `fcntl`, which `std` does not expose and which would require
`unsafe`. So "durable" in this codebase means the operating system has it, not that it
has survived a power cut mid-write. Stated in `StagingFile::commit`'s doc comment too.
Revisit if the app ever grows a reason to claim crash-consistency it does not have.

**2026-10-27 · `lecture-fs` added as a separate crate rather than I/O in the core**
Filesystem code could technically have gone in `lecture-core`, since `std::fs` compiles
for iOS. It did not, for two reasons. The locked architecture says the domain crate holds
no platform concerns, and more concretely the atomic-write *strategy* genuinely differs
by platform: on iOS with iCloud involved, writes go through `NSFileCoordinator` and a
bare `rename` is not the correct primitive. So the Phase 2 companion will want its own
adapter, and the split that makes that possible had to exist before the first write
landed rather than being retrofitted around it. The iOS CI check targets `lecture-core`
alone, which is what keeps the boundary honest.

**2026-10-27 · A symlinked vault root is allowed; symlinks inside it are not**
Someone keeping their vault on an external drive and linking to it from their home folder
is making a deliberate decision about their own files, so `VaultRoot::open` canonicalises
the root once and resolves everything against the real location. A symlink *inside* the
vault is refused instead — and refused even when it points back into the same vault,
because an alias creates two routes to one bundle, which double-counts it on a vault walk
and gives a sync client a loop to chase.

**2026-10-27 · `ResolvedPath` exists so the containment check cannot be skipped**
`resolve` returns a `ResolvedPath` with no public constructor. Write functions will take
that type rather than a `Path`, so an unchecked location cannot reach them — the type
system refuses to assemble the call. Same reasoning as `Slug` and `VaultRelativePath`:
the check is a property of the value, not a step someone has to remember.

**2026-10-27 · Two known, recorded gaps in filesystem containment**
Neither is papered over, so both are written down here.

1. *TOCTOU.* The containment check and the later open are separate steps, so a component
   swapped for a symlink in between is not caught. Closing it properly needs
   `openat`-style calls `std` does not expose, and `unsafe` is forbidden here. Writes will
   mitigate it independently by opening with `O_NOFOLLOW` via `OpenOptionsExt`, which is
   safe and does not need `libc`. The residual risk is a single user racing their own
   filesystem.
2. *The second containment check is reasoned, not demonstrated.* `confirm_containment`
   runs on every resolve as defence in depth against redirections that are not symlinks —
   macOS firmlinks, for instance. No test drives it to failure, because a test cannot
   create a firmlink. It is therefore unexercised code on its failure path, and is noted
   as such in its own doc comment too.

**2026-10-27 · Path safety is split across two layers, on purpose**
"Sanitise paths" is really two problems with different natures. *Lexical* containment —
is this text a usable vault-relative path at all — is pure logic, and lives in
`VaultRelativePath` in the domain. *Filesystem* containment — does it resolve inside the
root once symlinks are followed — needs I/O, and so belongs in the storage adapter, since
`lecture-core` is required to stay platform-free. Keeping them together would have
dragged `std::fs` into the domain layer and made the pure half untestable without a
temp directory.

The consequence is stated in the type's own doc comment rather than left implicit:
`VaultRelativePath` is the barrier against hostile *text*, not against a hostile
*filesystem*. If a vault folder is a symlink to `/etc`, `lectures/passwd` is a valid
`VaultRelativePath`. That gap closes with `AtomicFsStorage`, and it is listed as open in
§1 until it does.

**2026-10-27 · `..` is refused, never resolved**
The common approach — normalise the path lexically, then check it still starts with the
root — is the classic broken one, because lexical normalisation and symlink resolution
disagree. Nexus never needs `..` in a vault-relative path, so it is rejected outright and
that entire class of bug cannot arise. `Slug` already refuses `.` and `..` as names, so
this falls out of reusing it per segment rather than needing its own rule.

**2026-10-27 · Non-emptiness made structural, not checked**
The first draft stored `Vec<Slug>` and `name()` had to answer for an empty vector that
`parse` already made impossible — the sketch reached for a fallback singleton to stay
panic-free, which is a smell. Storing the final segment as its own field instead means a
path naming nothing cannot be constructed, so `name()` returns `&Slug` with no fallback,
no `unwrap`, and no `debug_assert`. Making the illegal state unrepresentable beat
defending against it.

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

- **Editor requirement (notes milestone):** the code-block affordance must insert a
  *fenced* block (```` ``` ````), never four-space indentation. This is what makes the
  citation scanner's fenced-only handling complete rather than partial, so it is a
  correctness requirement and not a style preference. Same for any paste-as-code path.
- **`@eslint/js` is not installed**, so ESLint's own `recommended` set is not applied;
  only `typescript-eslint`'s `strictTypeChecked`. Most of what it adds (undefined names,
  duplicate keys, unreachable code) the compiler already rejects under the strict flags,
  so the gap is small — but it is a gap, and closing it is a one-package question for
  the user rather than something to install unasked.
- ~~**`npm run build` does not work yet.**~~ **Resolved 2026-10-28.** `vite.config.ts`,
  `index.html` and a real entry point now exist, `npm run build` produces a bundle
  (303 kB JS, 2.6 kB CSS), and the gate runs it — see the entry on wiring the UI.
- **Third-party notices file.** Two crates in the tree carry the `Unicode-3.0` term,
  which is attribution-only but does require a notice to ship with the binary. Nothing
  generates one yet. Belongs with the `cargo deny` work so it is produced from the real
  dependency tree rather than maintained by hand.

### Deferred to a 2.0, with reasoning (decided 2026-10-27)
- **Cloud-drive vaults (Google Drive, Dropbox, OneDrive).** Deferred until the product
  exists, then added incrementally. The user asked whether allowing a symlinked vault
  root means Drive is supported; it does not, and the distinction matters.

  Containment was never the blocker — nothing currently *prevents* someone pointing
  `VaultRoot::open` at a Drive folder, which is the actual hazard. The blocker is that
  the atomic-write guarantee does not hold on a file-provider volume. Drive for desktop
  presents online-only placeholders that materialise on access, and `rename` and
  `sync_all` do not carry their POSIX meanings there — so the single mechanism protecting
  someone's notes degrades silently while everything appears to work. It also cuts
  against the offline-first premise, since opening a lecture could require the network,
  and Drive resolves conflicts by duplicating files rather than merging.

  Syncthing is different, and is why it is the Phase 1 assumption: it syncs real local
  files, so atomic writes behave normally. iCloud Drive has the same file-provider
  problem, but Apple at least exposes `NSFileCoordinator` for it; Google offers third
  parties no equivalent.

  When this is picked up, the work is: detect that the vault sits on a file-provider
  volume, and either refuse with a plain explanation or switch to a write strategy that
  does not assume `rename` atomicity. Guessing which, now, would be speculative.

### Open task, raised 2026-10-28
- ~~`ReorganizeBlock::NameUnusable` collapses two causes~~ — **fixed the same day.** Split
  into `NameUnusable` and `PatternNeedsFacets`, with `PathTemplate::place` carrying the
  reason so nothing has to guess from an error variant.
- **The canvas has two stale states**: *No converter found* offers Keynote, which was
  removed; the diagnostics drawer names `~/Library/Logs/LectureVault/`. Fix on the canvas
  before either is built.

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

#### The whole resolved tree, read on 2026-10-28

The tables above were written before `crates/src-tauri` joined the workspace, so they
covered `lecture-core` and nothing else — which left Tauri's dependency tree unrecorded
against §1.2. Read from `cargo metadata` rather than from memory: **424 third-party
crates**, every one permissive. Counting them row by row would be a table nobody reads, so
what follows is the aggregate plus every licence that needs a decision.

| Family | Crates |
|---|---|
| `MIT OR Apache-2.0` and its spellings (`Apache-2.0 OR MIT`, `MIT/Apache-2.0`, …) | 239 |
| `MIT` alone | 106 |
| `Zlib`/`BSD-3-Clause`/`ISC`/`Unlicense`/`0BSD`/`CC0` variants, each dual with MIT or Apache | 37 |
| `Unicode-3.0` (the ICU crates) | 20 |
| `MPL-2.0` | 5 |
| `Apache-2.0` alone, incl. one with the LLVM exception | 3 |

Three of those need a stated position rather than a count:

- **`Unicode-3.0`, 20 crates** — the ICU family (`icu_*`, `zerovec`, `yoke`, `tinystr`,
  `writeable`, `litemap`, `potential_utf`, `zerotrie`, `zerofrom`). Permissive and
  attribution-only, same term already noted above for `unicode-ident`. It enlarges the
  notices file the shipped app owes; it does not change what may be distributed.
- **`MPL-2.0`, 5 crates** — `cssparser`, `cssparser-macros`, `selectors`, `dtoa-short`,
  `option-ext`, pulled in through the webview stack. MPL-2.0 is file-level copyleft: linking
  into a larger work is fine and the obligation attaches only to *modified* MPL files. None
  is modified, and none will be. Recorded here so that remains a decision rather than an
  assumption.
- **`r-efi`, dual MIT / Apache-2.0 / LGPL-2.1-or-later** — the LGPL arm is one choice among
  three, so MIT applies and nothing copyleft is taken. It is a UEFI target crate and is not
  compiled for macOS at all.

| Crate | Version | Licence | Why |
|---|---|---|---|
| `http-range` | 0.1.6 | MIT | pulled by Tauri's `protocol-asset`, which is how the window reads a lecture's PDF |

#### What ships inside `pdfjs-dist`, read on 2026-10-29

`pdfjs-dist` is Apache-2.0, but the asset directories the viewer bundles carry third-party
work under their own terms, each with a `LICENSE_*` file beside it. Read from the built
`dist/pdfjs/` rather than assumed:

| Bundled | Licence | Note |
|---|---|---|
| `wasm/jbig2.wasm` | BSD-3-Clause (PDFium Authors) | the JBIG2 codec scanned pages use |
| `wasm/openjpeg.wasm` | BSD-2-Clause | JPEG 2000 |
| `wasm/qcms_bg.wasm` | MIT-style (Mozilla, Marti Maria) | colour management |
| pdf.js's own wrappers | Apache-2.0 | `LICENSE_PDFJS_*` |
| `standard_fonts/Foxit*.pfb` | BSD-3-Clause (PDFium Authors) | the 14 standard faces |
| `standard_fonts/Liberation*` | **GPL-2.0 with a font exception** (Red Hat) | metric-compatible substitutes |

**The Liberation fonts are the one that needs a stated position.** They are *not* OFL, unlike
the four typefaces Nexus chose for its own interface. The terms are GPLv2 plus two
exceptions: embedding the font in a document does not make that document GPL, and
distributing the object code in a physical product must come with access to the source.

For Nexus as it exists — one person's own machine, not a shipped product — nothing follows.
If it were ever distributed, three things would: the fonts stay separate data files rather
than linked code, so GPLv2's mere-aggregation clause means they do **not** make Nexus GPL;
their licence text must ship, which it does, because the asset copy is recursive and carries
every `LICENSE_*` file beside the fonts it copies; and a source offer would be owed for the
fonts themselves. Recorded so that stays a decision rather than a surprise.

The alternative — not bundling `standard_fonts` — was considered and rejected: a document
that embeds no fonts would then render in whatever the fallback is, which is exactly the
quiet degradation §1.1 is about.

Dev-only dependencies, which do not ship in the binary. Pulled in by `tempfile`, needed
because storage containment cannot be tested against an in-memory fake — the behaviour
under test *is* the filesystem's. Read from `cargo metadata` on 2026-10-27:

| Crate | Version | Licence |
|---|---|---|
| `bitflags` | 2.13.2 | MIT OR Apache-2.0 |
| `cfg-if` | 1.0.5 | MIT OR Apache-2.0 |
| `errno` | 0.3.14 | MIT OR Apache-2.0 |
| `fastrand` | 2.5.0 | Apache-2.0 OR MIT |
| `getrandom` | 0.4.3 | MIT OR Apache-2.0 |
| `libc` | 0.2.191 | MIT OR Apache-2.0 |
| `linux-raw-sys` | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| `once_cell` | 1.21.4 | MIT OR Apache-2.0 |
| `r-efi` | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |
| `rustix` | 1.1.6 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |
| `tempfile` | 3.27.0 | MIT OR Apache-2.0 |
| `windows-link` | 0.2.1 | MIT OR Apache-2.0 |
| `windows-sys` | 0.61.2 | MIT OR Apache-2.0 |

Every one offers MIT, so `r-efi`'s LGPL option is never the operative term. None is
linked into a shipped artefact in any case.

To be re-checked with `cargo deny` once the dependency set settles — the point of that
tool being that this table should never again be written by hand.

### npm packages (Milestone 1, frontend toolchain)

Read from the installed `node_modules` manifests on 2026-10-27, not from memory. 134
packages resolved, every one with a stated licence.

| Direct dependency | Version | Licence |
|---|---|---|
| `react` | 19.3.1 | MIT |
| `react-dom` | 19.3.1 | MIT |
| `zod` | 4.6.7 | MIT |
| `pdfjs-dist` | 6.4.299 | Apache-2.0 |
| `@tauri-apps/api` | 2.12.4 | Apache-2.0 OR MIT |
| `@tauri-apps/cli` | 2.12.4 | Apache-2.0 OR MIT |
| `@testing-library/react` | 16.3.3 | MIT | *(added 2026-10-29)* |
| `jsdom` | 30.1.3 | MIT | *(added 2026-10-29)* |
| `@playwright/test` | 1.64.1 | Apache-2.0 | *(added 2026-11-05; pulls in `playwright` and `playwright-core`, both Apache-2.0)* |
| `@codemirror/state` | 6.7.6 | MIT | *(added 2026-11-05, the notes editor)* |
| `@codemirror/view` | 6.43.15 | MIT | *(added 2026-11-05)* |
| `@codemirror/commands` | 6.11.1 | MIT | *(added 2026-11-05)* |
| `@codemirror/language` | 6.13.1 | MIT | *(added 2026-11-05)* |
| `@codemirror/lang-markdown` | 6.5.2 | MIT | *(added 2026-11-05; pulls in `@codemirror/{autocomplete,lang-css,lang-html,lang-javascript,lint,streamparser}`, `@lezer/{common,css,highlight,html,javascript,lr,markdown}`, `style-mod`, `w3c-keyname` and `crelt` -- every one MIT, read from the installed manifests)* |
| `@lezer/highlight` | 1.2.5 | MIT | *(made direct 2026-11-05; it was already CodeMirror's dependency, now imported for highlight tags)* |
| `katex` | 0.19.1 | MIT | *(added 2026-11-05, maths in notes; its fonts are OFL-1.1 and bundled as local files)* |
| `mermaid` | 12.3.0 | MIT | *(added 2026-11-05, diagrams; loaded on demand. Pulls in d3, DOMPurify (MPL-2.0 OR Apache-2.0), `khroma` (MIT by its licence file; no field in its manifest) and `elkjs`, which is **EPL-2.0 OR GPL-3.0-or-later** -- taken under EPL-2.0, which permits use in a larger work; elkjs is not modified)* |
| `chart.js` | 4.6.1 | MIT | *(added 2026-11-05, ```chart blocks; loaded on demand)* |
| `@codemirror/lang-javascript` | 6.2.5 | MIT | *(made direct 2026-11-05: already installed with `lang-markdown`, now imported to colour code blocks)* |
| `@codemirror/lang-css` | 6.3.1 | MIT | *(made direct 2026-11-05, likewise)* |
| `@codemirror/lang-html` | 6.4.12 | MIT | *(made direct 2026-11-05, likewise)* |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@vitejs/plugin-react` | 6.1.2 | MIT |
| `eslint` | 10.13.0 | MIT |
| `typescript` | 6.0.3 | Apache-2.0 |
| `typescript-eslint` | 8.72.1 | MIT |
| `vite` | 8.3.5 | MIT |
| `vitest` | 5.0.5 | MIT |

**Playwright's WebKit build** (added 2026-11-05) is a development tool, not part of
anything built or shipped. `npx playwright install webkit` downloads it into
`~/Library/Caches/ms-playwright/` -- outside the repository, which is Playwright's default
and was the download approved -- and nothing in `dist/` or the app bundle references it.
WebKit itself is BSD/LGPL; since it is never redistributed, it carries no obligation here.

**Bundled typefaces** (not npm packages; fetched by `scripts/fetch-fonts.py` and committed
as woff2 under `src/ui/fonts/`). All four permit bundling and redistribution:

| Typeface | Role | Licence |
|---|---|---|
| Bricolage Grotesque | wordmark, headings | SIL OFL 1.1 |
| IBM Plex Sans | interface | SIL OFL 1.1 |
| IBM Plex Mono | paths, keys, code | SIL OFL 1.1 |
| Literata | notes prose | SIL OFL 1.1 |

Whole tree, by licence: MIT 100, Apache-2.0 14, ISC 6, BSD-2-Clause 6,
`Apache-2.0 OR MIT` 3, MPL-2.0 2, BSD-3-Clause 2, BlueOak-1.0.0 1.

Everything is permissive except the two MPL-2.0 packages, `lightningcss@1.33.0` and its
`lightningcss-darwin-arm64@1.33.0` binary — a transitive Vite dependency. MPL-2.0 is
file-level copyleft and distribution-compatible: the obligation attaches only to
modifications of the MPL-licensed files themselves, and we neither modify nor vendor
them. `BlueOak-1.0.0` (`minimatch@10.2.6`) is a permissive, OSI-approved licence.

Build-time-only packages still get recorded, because `vite build` output is what would
ship and the distinction between a bundled and a build-only dependency is easy to get
wrong once there is something to ship.
