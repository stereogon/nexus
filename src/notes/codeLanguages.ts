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

/** A language a code block can be set to from its menu, and the tag written after ```. */
export interface CodeChoice {
  readonly label: string;
  readonly tag: string;
}

/**
 * The code block menu's choices: plain text, and each language coloured by a grammar that
 * is installed. Choosing one rewrites the fence's tag, and the colouring follows from it.
 */
export const CODE_CHOICES: readonly CodeChoice[] = [
  { label: "Plain text", tag: "" },
  { label: "JavaScript", tag: "js" },
  { label: "TypeScript", tag: "ts" },
  { label: "JSON", tag: "json" },
  { label: "CSS", tag: "css" },
  { label: "HTML", tag: "html" },
];

/**
 * The menu choice a fence's tag stands for: an installed language by any of its names, or,
 * for a tag nothing here colours, a choice of its own, so the menu still shows what the
 * block says it is rather than calling it plain text.
 */
export function choiceFor(tag: string): CodeChoice {
  const lower = tag.toLowerCase();

  if (lower === "") {
    return { label: "Plain text", tag: "" };
  }

  if (lower === "json") {
    return { label: "JSON", tag: "json" };
  }

  const known = codeLanguages.find((language) => language.alias.includes(lower));
  const choice = known === undefined ? undefined : CODE_CHOICES.find((each) => each.label === known.name);

  return choice ?? { label: `${tag} (not coloured)`, tag };
}
