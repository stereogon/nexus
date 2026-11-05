/**
 * The vault a Playwright run sees: lectures, their pages, and their highlights.
 *
 * Shared by both sides of the harness. The specs run in Node and build one of these; the
 * page receives it through `addInitScript` and the fake backend answers from it. It holds
 * only plain data so that it crosses that boundary as JSON without losing anything.
 *
 * Why there is a fake backend at all is in `harness.ts`.
 */
import type { Annotation } from "../src/ipc/annotations";
import type { LectureRow } from "../src/ipc/vault";

declare global {
  interface Window {
    /** Set by `addInitScript` before the app loads. Absent means the standard fixture. */
    __NEXUS_E2E__?: Fixture;
  }
}

/** One line of text on a page, in PDF points from the page's bottom-left corner. */
export interface Line {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export interface Fixture {
  readonly vault: string;
  readonly lectures: readonly LectureRow[];
  /** Each lecture's pages, keyed by directory. A lecture with none cannot be opened. */
  readonly pages: Readonly<Record<string, readonly (readonly Line[])[]>>;
  readonly annotations: Readonly<Record<string, readonly Annotation[]>>;
  /** Each lecture's `notes.md`, keyed by directory; absent means none yet. */
  readonly notes?: Readonly<Record<string, string>>;
}

/** Slide-shaped, because most of what this app opens is a lecture deck. */
export const PAGE = { width: 720, height: 405 } as const;

function row(directory: string, title: string, week: string): LectureRow {
  return {
    directory,
    title,
    sequence: "a0",
    course: "Software Systems Engineering",
    module: "Requirement Engineering",
    week,
    tags: [],
    conversion: "notRequired",
    documentReady: true,
  };
}

/**
 * A twelve-page deck.
 *
 * Long enough that scroll mode has real distance to cover, which is what the window-
 * scrolling bug needed in order to show. Page 1 opens with a heading on its first line,
 * where the badge bug lived; page 2 carries a word against the right margin, where the
 * menu bug lived.
 */
function deck(): readonly (readonly Line[])[] {
  return Array.from({ length: 12 }, (_, index) => {
    const number = index + 1;
    const lines: Line[] = [
      { text: `Page ${String(number)} heading`, x: 40, y: 340, size: 28 },
      { text: `Body text on page ${String(number)}`, x: 40, y: 280, size: 18 },
    ];

    if (number === 2) {
      // Ends against the page's right edge: Helvetica 18pt "Margin" is about 55pt wide.
      // The first version sat at x = 630, which left room for the menu, so the journey
      // passed with the clamp switched off and proved nothing.
      lines.push({ text: "Margin", x: 662, y: 200, size: 18 });
    }

    return lines;
  });
}

export const READING = row("week-2/process-overview", "2. ProcessOverview", "Week 2");
export const OTHER = row("week-1/foundations", "1. Foundations", "Week 1");

export function standardFixture(): Fixture {
  return {
    vault: "/e2e-vault",
    lectures: [OTHER, READING],
    pages: { [READING.directory]: deck(), [OTHER.directory]: deck() },
    annotations: {},
  };
}
