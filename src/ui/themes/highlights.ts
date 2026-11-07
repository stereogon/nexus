/**
 * The four highlight meanings' colours, per theme (2026-11-07).
 *
 * A highlight is saved as its meaning — key, definition, exam, question — never as a colour
 * (`lecture_core::HighlightSemantic`), so the colour is free to change with the theme. Most
 * themes use the standard four. A theme whose accent would sit too close in hue to one of
 * them swaps that one for an alternative, so a blue accent gets a violet "question" and a
 * meaning is never mistaken for the window's chrome; each still carries its letter, K/D/E/Q.
 * The user asked for themes in any colour, and for the highlights to move aside when one
 * clashes.
 *
 * Each colour comes with its wash, the highlight drawn over the always-white page. Alphas
 * differ per colour because yellow at the weight that suits violet is barely there.
 * `themes.test.ts` measures every set: the washes visible on white, the letter chips
 * readable, the four apart from one another and from the accent.
 */

export type Semantic = "key" | "definition" | "exam" | "question";

export interface Highlight {
  /** Solid, for the letter chips and markers. */
  readonly colour: string;
  /** Translucent, for the highlight over the page. */
  readonly wash: string;
}

export type HighlightSet = Readonly<Record<Semantic, Highlight>>;

/** The standard four: amber, green, red, blue. `tokens.css` holds the same values. */
export const STANDARD_HIGHLIGHTS: HighlightSet = {
  key: { colour: "#f2b63c", wash: "rgba(242, 182, 60, 0.38)" },
  definition: { colour: "#2ea37a", wash: "rgba(46, 163, 122, 0.3)" },
  exam: { colour: "#e0523c", wash: "rgba(224, 82, 60, 0.28)" },
  question: { colour: "#2e86de", wash: "rgba(46, 134, 222, 0.28)" },
};

/** What a theme can swap in, each meeting the bar the standard four set. */
export const VIOLET_QUESTION: Highlight = { colour: "#7650d8", wash: "rgba(118, 80, 216, 0.24)" };
export const TEAL_DEFINITION: Highlight = { colour: "#0f8fa3", wash: "rgba(15, 143, 163, 0.28)" };
export const LIME_DEFINITION: Highlight = { colour: "#5e9a22", wash: "rgba(94, 154, 34, 0.3)" };
export const YELLOW_KEY: Highlight = { colour: "#e3c414", wash: "rgba(227, 196, 20, 0.42)" };
export const CRIMSON_EXAM: Highlight = { colour: "#d42a3c", wash: "rgba(212, 42, 60, 0.24)" };

/** A theme's four: the standard ones, with its swaps. */
export function highlightsOf(swaps: Partial<HighlightSet> | undefined): HighlightSet {
  return { ...STANDARD_HIGHLIGHTS, ...swaps };
}

/**
 * The custom properties for a set, without their leading `--`. `exam-wash` is the exam
 * colour behind a problem notice, stronger on a dark ground where a tenth all but vanishes.
 */
export function highlightTokens(set: HighlightSet, scheme: "light" | "dark"): Record<string, string> {
  const tokens: Record<string, string> = {};

  for (const [semantic, { colour, wash }] of Object.entries(set)) {
    tokens[`semantic-${semantic}`] = colour;
    tokens[`highlight-${semantic}`] = wash;
  }

  tokens["exam-wash"] = washAt(set.exam.colour, scheme === "dark" ? 0.2 : 0.12);

  return tokens;
}

function washAt(colour: string, alpha: number): string {
  const value = Number.parseInt(colour.slice(1), 16);

  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255, alpha];

  return `rgba(${channels.map(String).join(", ")})`;
}
