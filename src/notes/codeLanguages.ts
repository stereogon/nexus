/**
 * The languages fenced code in the notes is coloured in.
 *
 * Only those whose grammars are already installed — JavaScript and TypeScript (with JSX),
 * CSS, HTML and JSON — which came with `@codemirror/lang-markdown`. Each loads the first
 * time a block in it appears. A block in any other language is still drawn as a code
 * panel, uncoloured; colouring Python or Rust would mean a grammar package each, which is
 * a dependency to ask for, not to slip in.
 */
import { LanguageDescription } from "@codemirror/language";

export const codeLanguages = [
  LanguageDescription.of({
    name: "JavaScript",
    alias: ["js", "javascript", "mjs", "cjs", "jsx", "json"],
    load: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true }),
  }),
  LanguageDescription.of({
    name: "TypeScript",
    alias: ["ts", "typescript", "tsx"],
    load: async () => (await import("@codemirror/lang-javascript")).javascript({ jsx: true, typescript: true }),
  }),
  LanguageDescription.of({
    name: "CSS",
    alias: ["css"],
    load: async () => (await import("@codemirror/lang-css")).css(),
  }),
  LanguageDescription.of({
    name: "HTML",
    alias: ["html", "htm", "xml", "svg"],
    load: async () => (await import("@codemirror/lang-html")).html(),
  }),
];
