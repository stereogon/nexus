# CLAUDE.md — Nexus

Read this fully before acting. It is binding on every Claude instance working in this
repository, in every session. If anything here conflicts with a request, say so and ask
rather than quietly picking one.

**Nexus** is a 100% offline, local-first macOS app for studying lecture documents (PDF /
PPT / PPTX / DOC / DOCX) beside deeply linked Markdown notes. Full requirements live in
[`claude-spec.md`](./claude-spec.md). Current state and decision history live in
[`PROGRESS.md`](./PROGRESS.md).

A Phase 2 iPadOS companion app is planned. That is not a someday-maybe; it constrains
real decisions today. See **Locked decisions**.

---

## 1. The values we work by

These are not decoration. Each one has a concrete operational meaning, and the meaning is
what to follow when the word alone is ambiguous.

### 1.1 Transparent
- Report what actually happened, including what failed, what was skipped, and what was
  not verified. Never describe intent as outcome.
- If a test fails, show the output. If a step was not run, say it was not run.
- Never claim something is "done" or "working" unless it was executed and observed. The
  phrase "should work" means it was not checked — say that instead.
- Surface uncertainty at the moment it arises, not after the work is built on top of it.

### 1.2 Ethical
- No shortcut that creates a false impression of quality: no test weakened to pass, no
  assertion loosened, no error swallowed to silence a log.
- Respect licences. Every bundled font, crate and package must have a licence compatible
  with distribution, recorded in `PROGRESS.md`.
- The user's study material is private. It never leaves the machine, is never logged
  verbatim into diagnostics, and is never sent anywhere.

### 1.3 Non-destructive
- Prefer additive change. Create new files rather than rewriting unrelated ones.
- Before deleting or overwriting anything not created in the current session, read it and
  state what will be lost.
- Every write to user data goes through the atomic path (temp file → `sync_all` →
  `rename`). No in-place truncation of `notes.md` or `annotations.json`, ever.
- Destructive git operations (`reset --hard`, `clean -fd`, force push, history rewrite,
  branch deletion) require explicit permission each time. Prior permission does not carry
  over to the next occasion.

### 1.4 Empathetic
- The reader of an error message is a tired student the night before an exam. Every
  `CoreError` carries a machine code *and* a plain sentence saying what to do next.
- Failure must never lose work. A conversion that fails keeps the original file. A schema
  that fails to parse is backed up to `.bak`, not discarded.
- An invalid Mermaid or LaTeX block shows an inline hint and keeps the editor mounted,
  cursor and undo history intact. Losing someone's typing is the worst bug this app can have.

### 1.5 Smart
- Solve the actual problem, not the symptom. A race fixed with a sleep is not fixed.
- Reuse what exists in the repo before adding a dependency. Every new dependency is a
  permanent cost and needs a reason.
- Choose the approach that is easiest to debug in six months, not the one that is fastest
  to type now.

### 1.6 Think before doing
- Read before you write. Understand the surrounding code's conventions and match them.
- For anything non-trivial, state the plan and its risks before executing.
- When two readings of a request would produce materially different work, ask.

### 1.7 Consider the repercussions
- Ask: what does this break, who else touches this file, is it reversible, and what
  happens if it runs twice?
- Anything touching the on-disk schema is a migration. Treat `schemaVersion` as a
  contract with files that already exist on someone's disk — and with an iPad that may
  hold an older copy.
- Changes that affect sync behaviour must be considered against two devices editing
  concurrently, not just one.

### 1.8 Care for the environment we work in
- This is the user's personal machine, not a disposable container.
- Stay inside `/Users/chandangupta/Developer/projects/nexus`. Temporary files go to the
  session scratchpad, never `/tmp` or the home directory.
- Do not modify global state: no edits to shell profiles, `~/.claude`, global git config,
  `rustup` defaults, or anything in `/usr` or `/etc`.
- Leave no stray processes, servers or watchers running. Clean up what you start.

### 1.9 Never do anything that can destroy it
- **No `sudo`. Ever.** If something appears to need it, stop and ask.
- No recursive deletes outside the scratchpad. No `rm -rf` with a variable in the path.
- No command whose failure mode is unbounded. If the blast radius is unclear, it is too
  large.

---

## 2. Ask-first protocol

Stop and ask for explicit permission before any of the following. Do not bundle these
into a larger action and proceed.

| Category | Examples |
|---|---|
| **Installing anything** | `npm install`, `cargo install`, `cargo add`, `brew`, `rustup target add`, `pip`, any first build that fetches dependencies |
| **Network access** | fetching a registry, downloading a font or crate, cloning a repo, any HTTP request |
| **Leaving the project directory** | reading or writing anywhere outside the repo and the scratchpad |
| **Destructive git** | `reset --hard`, `clean`, force push, rebase of pushed commits, branch or tag deletion |
| **Deleting / overwriting** | any file not created in this session |
| **Global or system state** | shell profiles, global configs, `~/.claude`, launch agents, anything needing elevation |
| **Running the real app against real data** | pointing the app at an actual `StudyVault`, rather than a temp fixture |

Asking costs one message. Guessing wrong can cost someone's notes.

**Commits.** Standing authorization (2026-10-27): commit at each **complete, verified
substep** — not only at milestone boundaries. A substep is committable only once its tests
and `clippy` pass, and the message states what was verified. Never commit a red tree to
"save progress"; that turns history into a minefield for anyone bisecting it.

**Pushing, remotes, and anything that leaves this machine still require asking every
time.** Authorization to commit is not authorization to publish.

---

## 3. Locked decisions

These were settled deliberately. Do not quietly revisit them; if one looks wrong, raise it
and explain why. Rationale is recorded in `PROGRESS.md`.

**Architecture**
- `crates/lecture-core` is pure Rust domain logic with **zero** Tauri, UI or platform
  dependencies. It must compile for `aarch64-apple-ios` with no feature flags. CI enforces
  this; a violation is a build failure, not a warning.
- `crates/src-tauri` is a thin IPC adapter only. No business logic.
- Any desktop-only capability is a **port** (trait) declared in `lecture-core` and
  implemented in a platform adapter.

**Documents and conversion**
- **PDF is the canonical render format.** Every imported document becomes a PDF; the
  viewer only ever renders PDF.
- Conversion is a one-time **import-step**, never a view-step. Converters (LibreOffice CLI,
  Keynote/Pages via `osascript`) are optional adapters behind `DocumentConverterPort`.
  Neither is required for the app to function, and no converter implementation may exist
  inside `lecture-core`.
- The original file is always kept at `source/original.<ext>` so reconversion stays possible.
- `manifest.json` records conversion provenance under `source.conversion`
  (`state`, `converter`, `convertedAt`) so a synced bundle is self-describing.

**Vault organisation**
- Arbitrary folder nesting, capped at 5 levels. **A lecture is any directory containing
  `manifest.json`**; the vault walk prunes at the first one it finds.
- Taxonomy lives in each bundle's `manifest.json` as facets (`course`, `module`, `week`,
  `tags`, plus an open `custom` map). The sidebar groups on facets at runtime, so one
  physical layout serves many logical views.
- **`sequence` (a fractional/LexoRank-style string key) is the authoritative order.**
  `01-` folder-name prefixes are a *derived projection* of it, maintained for Finder and
  Files-app legibility. **If a prefix disagrees with `sequence`, `sequence` wins**, and the
  app offers a renumber. Renumbering renames tail-first so no rename collides.
- **No central index is a source of truth.** A top-level file listing every lecture is a
  sync-conflict magnet; per-bundle manifests confine each edit to one file. `.nexus/` is a
  rebuildable cache and deleting it must fully reconstruct from a vault scan.

**Coordinates and data**
- All annotation geometry is normalised to `[0.0, 1.0]` against the **unscaled**
  (`scale: 1`) page dimensions, accounting for page rotation. Raw pixels never reach disk.
- Everything inside a bundle is referenced relatively, so moving a bundle directory
  requires no link rewriting. This property has a test.

**Design**
- **No dark-mode PDF inversion.** Inverting a document corrupts photographs, colour-coded
  diagrams and scans. The page stays light in both themes, on a dark bed.
- The document surface is light in both themes, so page-drawn annotation chrome uses
  `accentInk` (sized for white) while app chrome uses the theme `accent`.
- Brand accent: `#BE1A72` (light) / `#FF72C6` (dark); `accentInk` `#9E477B`. Chosen to sit
  outside the four highlight semantics *and* outside Obsidian's violet.
- Highlight semantics: amber `#F2B63C` key, green `#2EA37A` definition, red `#E0523C` exam,
  blue `#2E86DE` question — each also carrying a letter glyph (K/D/E/Q) so the set does not
  rely on hue alone.
- Type: Bricolage Grotesque (brand/headings), IBM Plex Sans (UI), Literata (notes prose),
  IBM Plex Mono (paths, keys, code). All OFL, all bundled as local woff2 — no network font
  requests in the shipped app.

---

## 4. Engineering rules

**Rust**
- `#![forbid(unsafe_code)]`, `#![warn(clippy::all, clippy::pedantic)]`.
- **Banned in production code:** `.unwrap()`, `.expect()`, `panic!()`, `todo!()`,
  `unimplemented!()`, and indexing that can panic. Tests may use them.
- Every fallible function returns `Result<T, CoreError>`. `CoreError` is a `thiserror` enum
  with a machine code and a user-facing remediation sentence.
- Atomic writes only: `<file>.tmp.<uuid>` → `sync_all()` → `fs::rename`.

**TypeScript**
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`,
  `noFallthroughCasesInSwitch` — all on.
- **Banned:** `any`, non-null assertion `!`, `@ts-ignore`, `as unknown as`.
- Every JSON payload read from disk or IPC is validated with Zod before use. A corrupted
  or hand-edited file must never crash the UI.

**Both**
- Source files stay under **300 lines**. Over that, split into focused modules.
- No file may be left with stub behaviour that reads as complete. Incomplete work is
  recorded in `PROGRESS.md` and named in the reply.
- Structured logging via `tracing` to `~/Library/Logs/LectureVault/app.log`. Log codes and
  timings, never the contents of someone's notes.

**Anti-patchwork clause**

The following are not acceptable, even to make something pass:

- weakening, skipping or `#[ignore]`-ing a test to get green (an `#[ignore]` is allowed
  *only* for a genuinely environment-dependent test, and must say why in a comment);
- `as any`, `!`, or a cast to silence a type error;
- `catch {}` that swallows an error;
- a sleep, retry or timeout added to paper over a race;
- commented-out code left behind "in case";
- a hardcoded value where the real lookup was too awkward.

If the correct fix is blocked, **stop and say so**. Shipping a workaround silently is worse
than not shipping. A known gap is a manageable problem; a hidden one is not.

---

## 5. Definition of done

A milestone is complete only when all of these have been **run and observed**:

```
cargo test && cargo clippy --all-targets -- -D warnings
npm run typecheck && npm run lint && npm run test
```

plus, from Milestone 5, the Playwright suite. `PROGRESS.md` is updated in the same change
that completes the work — not later.

If any of these were not run, the milestone is not done, and the reply says which.
