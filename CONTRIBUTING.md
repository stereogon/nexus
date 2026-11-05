# Contributing to Nexus

Thank you for your interest. Nexus is a personal study tool built to a professional standard,
and this guide explains that standard. It covers how to get set up, what a change must meet,
and how to propose one.

Nexus is built for one person's use and is not a shipped product. That removes some
*requirements*: there is no telemetry, no accounts and no App Store work. It removes no
*standards*. "It's only a personal app" is never a reason for a weaker test or a
swallowed error.

**Before starting anything non-trivial, open an issue to discuss it.** A short conversation
up front is cheaper than a pull request built on a different reading of the problem.

---

## Contents

- [Ground rules](#ground-rules)
- [Setting up](#setting-up)
- [Where things live](#where-things-live)
- [Engineering standards](#engineering-standards)
- [Testing](#testing)
- [The definition of done](#the-definition-of-done)
- [Commits and pull requests](#commits-and-pull-requests)
- [Specification, decisions and design](#specification-decisions-and-design)
- [Dependencies and licences](#dependencies-and-licences)
- [Reporting bugs](#reporting-bugs)

## Ground rules

These are the values the project works by. [`CLAUDE.md`](./CLAUDE.md) states them in full.

- **Report what actually happened.** If a test was skipped or a step was not run, say so.
  "Should work" means "not checked".
- **Never lose someone's work.** That is the worst bug this app can have. Every write to user
  data is atomic. A file that fails to parse is backed up, never discarded.
- **Keep study material private.** Notes, excerpts and paths never reach a log, an error
  report or the network.
- **Fix causes, not symptoms.** A race fixed with a sleep is not fixed.
- **Prefer additive, reversible change.** Read code before rewriting it, and say what a
  deletion will lose.

## Setting up

1. Follow [Set up locally](./README.md#set-up-locally-from-source) in the README: Xcode
   Command Line Tools, Rust via rustup (the toolchain is pinned in `rust-toolchain.toml`),
   Node.js 22, and optionally LibreOffice and Playwright's WebKit.
2. Install dependencies and run the app:
   ```sh
   npm ci
   npm run app
   ```
3. Confirm your checkout is green before changing anything:
   ```sh
   ./scripts/gate.sh
   ```

**Test against a throwaway vault, never your real one.** Make a folder, drop a PDF or two
in it, and open that. Nexus writes real files, and a bug in a branch should not be able to
reach your notes.

## Where things live

| Path | Responsibility |
|---|---|
| `crates/lecture-core` | Pure domain logic. **No** Tauri, UI or platform dependencies, and it must compile for `aarch64-apple-ios` with no feature flags. |
| `crates/lecture-fs` | Filesystem adapters: atomic storage, the per-file stores, the vault scan, logging. |
| `crates/lecture-convert` | The optional LibreOffice converter. Nothing else depends on it. |
| `crates/src-tauri` | The IPC adapter. Each command deserialises, calls one thing and serialises. Decisions belong in `lecture-core`. |
| `src/ipc` | One typed wrapper per command, validating every payload with Zod. |
| `src/pdf`, `src/notes` | Pure rules for the document and the notes, unit-tested without a browser. |
| `src/ui` | React components, hooks and stylesheets. |
| `e2e/` | Playwright journeys. `e2e/answers/` stands in for the Rust side. |
| `fixtures/` | Contract fixtures written by Rust tests (`UPDATE_FIXTURES=1`) and read by TypeScript tests, so both sides agree on the IPC shapes. |

Dependencies point one way: `src-tauri` → `lecture-fs` → `lecture-core`. A desktop-only
capability is a **port** (a trait) declared in `lecture-core` and implemented in an adapter.

## Engineering standards

### Both languages

- **Files stay under 300 lines**, stylesheets included. `scripts/check-line-limits.sh`
  enforces it. Split by responsibility, not by line count.
- **No stub that looks finished.** Incomplete work is recorded in `PROGRESS.md` and named
  in the pull request.
- **Match the surrounding code**: its naming, its comment density, its idioms. Comments
  explain *why*, not *what*.
- **Name the pattern** when you use an established one, and don't reach for one larger than
  the problem.

### Rust

- `#![forbid(unsafe_code)]`, with `clippy::all` and `clippy::pedantic` as warnings, and
  warnings are errors in the gate.
- **Banned in production code:** `.unwrap()`, `.expect()`, `panic!()`, `todo!()`,
  `unimplemented!()`, and indexing that can panic. Tests may use them, with an explicit
  `#![allow(...)]` at the top of the file.
- Every fallible function returns `Result<T, CoreError>`. Each `CoreError` carries a machine
  code and **a plain sentence telling the reader what to do next**. Write it for a tired
  student the night before an exam.
- **Atomic writes only**, through `AtomicFsStorage`: `<file>.tmp.<uuid>` → `sync_all` →
  `rename`. Never truncate a user file in place.
- **Log through `lecture_fs::logging`'s typed events**, which record codes, counts and
  timings. Never log an error's `Display` text, because it contains paths.

### TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`
  and `noFallthroughCasesInSwitch` are all on.
- **Banned:** `any`, the non-null assertion `!`, `@ts-ignore`, `as unknown as`, and any
  cast used to silence a type error. Typed ESLint rules enforce this.
- **Validate everything that crosses a boundary with Zod**: IPC results, files, drag
  payloads. A corrupted or hand-edited file must never crash the window.
- Keep rules pure and out of components where possible (see `src/notes/format.ts` or
  `src/ui/notesWidth.ts`), so they can be unit-tested.

### On-disk data

- **All annotation geometry is normalised to `[0, 1]`** against the unscaled page,
  accounting for rotation. Raw pixels never reach disk.
- **A change to a stored file's shape is a migration.** Treat `schemaVersion` as a contract
  with files already on someone's disk, and with an iPad that may hold an older copy.
- **`.nexus/` holds derived data only.** If it cannot be rebuilt from a vault scan, it does
  not go there. Per-device state goes in `~/Library/Application Support/Nexus/`.

## Testing

| Layer | Tool | What it covers |
|---|---|---|
| Rust | `cargo test` | Domain invariants, and contract tests of each command's blocking half against real temporary vaults |
| TypeScript | Vitest + Testing Library | Pure rules, components, and the stylesheet checks (no undefined or unused classes) |
| End to end | Playwright in WebKit | Journeys through the real React tree and stylesheets, with the Rust side mocked |

Playwright cannot drive the real Nexus window on macOS. WKWebView exposes no WebDriver
interface, so `tauri-driver` does not support it. The suite therefore runs the window's
half in WebKit against `e2e/backend.ts`. Disk behaviour is tested in Rust.

Expectations:

- **Prove a new test can fail.** Break the thing it covers, watch it fail, then restore it.
  A test that passes either way is worse than none.
- **Never weaken a test to get green.** No loosened assertion, no skip, no `#[ignore]`
  (except for a genuinely environment-dependent test, with a comment saying why), and no
  retry, sleep or timeout to hide a race.
- **A mock of a native event must copy the native source**, not your model of it. A harness
  built on the same wrong assumption as the code proves nothing; it has happened here before.
- **Use temporary directories.** No test may write to the real `~/Library`.

## The definition of done

A change is done when this passes, run and observed:

```sh
./scripts/gate.sh
```

It runs:
- `cargo fmt --check`, `cargo test`, `cargo clippy --all-targets -- -D warnings`
- the iOS check of `lecture-core`
- `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`
- the LibreOffice end-to-end tests
- the Playwright suite
- the line limit

The gate never installs anything. A missing tool is reported with the command that fixes
it. If a step could not run on your machine, say which one in the pull request.

**Update `PROGRESS.md` in the same change.** Record what was built, the decisions taken and
why, and anything left undone.

## Commits and pull requests

- **Commit at each complete, verified step**, and never commit a red tree. History should
  be safe to bisect.
- **Write the message in plain English.** Say what changed and why, then what was verified:
  ```text
  Add a divider to set how wide the notes are, kept per device

  <What changed and why, in a few sentences.>

  Verified: gate green — cargo fmt/test/clippy, iOS check, typecheck,
  lint, vitest, build, Playwright, line limits. New journeys proved by
  breaking the feature each covers.
  ```
- **Keep one concern per pull request.** A refactor the change needs is fine; unrelated
  cleanup is a separate pull request.
- **In the description, say:** what problem this solves, how you verified it, any step you
  could not run, and anything recorded as a known gap.
- **No destructive history operations on shared branches**: no force-push and no rewriting
  pushed commits.

## Specification, decisions and design

- **[`claude-spec.md`](./claude-spec.md) is a draft, not scripture.** If a requirement
  looks wrong or contradicts itself, raise it rather than implementing it faithfully or
  quietly deviating. An agreed change is recorded as a **dated amendment next to the
  original wording**, with the reasoning in `PROGRESS.md`.
- **Locked decisions** in [`CLAUDE.md`](./CLAUDE.md#3-locked-decisions) are settled. Examples:
  PDF as the only render format, no dark-mode inversion of documents, `sequence` as the
  authoritative order, and no central index. To change one, open an issue and explain why.
- **The approved design lives on a canvas**, and it wins over any colour or type value
  written down elsewhere. Take colours, type and states from it rather than inventing them.
  The palette is copied into `PROGRESS.md` for convenience. A UI with no artboard yet is
  styled to fit the existing window and recorded as owing a pass from the canvas.
- **The document surface stays light in both themes.** Page-drawn chrome uses `accentInk`;
  app chrome uses the theme `accent`. The four highlight meanings always carry their letter
  as well as their colour.

## Dependencies and licences

Every dependency is a permanent cost, so:

- **Reuse what is already in the repository first.**
- **Propose a new crate or package in an issue before adding it**, with the reason and its
  licence.
- **Record its licence in `PROGRESS.md` §5.** It must be compatible with distribution.
- **No network resources at runtime.** Fonts and assets are bundled locally, and the CSP
  forbids outside connections.

## Reporting bugs

Open an issue with:

- what you did, what you expected, and what happened
- the **error code** from the message or the error panel (`⌘0`)
- your macOS version and how you ran Nexus (`npm run app` or a built `.app`)

**Never paste the contents of your notes, highlights or lecture files into an issue**, and
redact folder names from any path, because they often contain course titles. A minimal
reproduction with a made-up PDF is ideal. Logs in `~/Library/Logs/Nexus/` contain only codes,
digests and timings by design, but read them before attaching.
