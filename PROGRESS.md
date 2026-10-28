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
- [ ] Source hashes in the manifest — **deliberately deferred to Milestone 2**, see the
      decision log. Will bump `schemaVersion` to 2 and be the first real migration.
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
- [ ] `schemaVersion` migration machinery (lands with the first real migration in M2)
      — **next substep**: `tracing` to `~/Library/Logs/LectureVault/app.log`
- [ ] `.nexus/` rebuildable cache, including per-device view state
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
- **`npm run build` does not work yet**, and `vite.config.ts` does not exist. There is no
  `index.html` and no application entry point, because the UI is Milestone 3 and a
  placeholder `App.tsx` would be exactly the stub-that-reads-as-complete §4 forbids. The
  `build` script is therefore a name without an implementation behind it until then.
  `typecheck`, `lint` and `test` all work.
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
| `@tauri-apps/api` | 2.12.4 | Apache-2.0 OR MIT |
| `@tauri-apps/cli` | 2.12.4 | Apache-2.0 OR MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@vitejs/plugin-react` | 6.1.2 | MIT |
| `eslint` | 10.13.0 | MIT |
| `typescript` | 6.0.3 | Apache-2.0 |
| `typescript-eslint` | 8.72.1 | MIT |
| `vite` | 8.3.5 | MIT |
| `vitest` | 5.0.5 | MIT |

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
