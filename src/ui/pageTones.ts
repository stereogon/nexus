/** The page tones as offered, in order: the name, as said, and a line about it. */
import type { PageTone } from "../ipc/pageTone";

export const TONES: readonly { readonly name: PageTone; readonly label: string; readonly line: string }[] = [
  { name: "printed", label: "Printed", line: "As the document was made." },
  { name: "sepia", label: "Sepia", line: "Warm paper, softer than white." },
  { name: "dusk", label: "Dusk", line: "Soft grey, light text: easy at night." },
  { name: "night", label: "Night", line: "Darkest, the text dimmed against glare." },
];
