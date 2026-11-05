// Flat config (ESLint 9+). The bans in CLAUDE.md section 4 are enforced here rather than
// by review discipline, for the same reason the Rust panic lints are set to `deny`: a
// rule a person has to remember is a rule that gets forgotten at 2am.
//
// ESLint's own `recommended` set lives in `@eslint/js`, a separate package that is not
// installed -- adding one needs asking first (CLAUDE.md section 2). Most of what it
// catches (undefined names, duplicate keys, unreachable code) the compiler already
// rejects under the strict flags in tsconfig.json, so the gap is small. Recorded in
// PROGRESS.md as a one-package question rather than left silent.
import tseslint from "typescript-eslint";

/** The bans, as rules. Errors, not warnings -- a warning is a thing that accumulates. */
const bannedConstructs = {
  "@typescript-eslint/no-explicit-any": "error",
  "@typescript-eslint/no-non-null-assertion": "error",
  "@typescript-eslint/ban-ts-comment": [
    "error",
    { "ts-expect-error": "allow-with-description", "ts-ignore": true },
  ],

  // `as unknown as X` has no dedicated rule, so it is matched structurally. Banning
  // `as unknown` outright is the right granularity: on its own it is almost always the
  // first half of a double cast used to silence a type error, which is exactly what
  // section 4 forbids. A genuinely unknown value needs no assertion to become `unknown`.
  "no-restricted-syntax": [
    "error",
    {
      selector: "TSAsExpression > TSUnknownKeyword",
      message:
        "`as unknown` is banned (CLAUDE.md section 4). It is the first half of a double cast that hides a real type error. Validate the value with Zod instead.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["dist", "node_modules", "target", "coverage", "fixtures"] },

  // Type-aware linting needs a file to be part of the TypeScript project, so it is
  // scoped to the sources rather than applied to this config file as well.
  {
    // The Playwright harness too: it runs inside the app's page, and test code is held
    // to the same rules as the code it tests (CLAUDE.md §1.11).
    files: ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: bannedConstructs,
  },

  // This file and any other build-time script: the syntactic rules still apply, without
  // the type information they do not need.
  {
    files: ["*.js", "*.ts"],
    extends: [tseslint.configs.strict],
    rules: bannedConstructs,
  },
);
