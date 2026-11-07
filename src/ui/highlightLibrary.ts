/**
 * The highlights library's rules: which highlights a set of filters keeps, and in what
 * order. Pure, so "every exam point in week 3" is tested without rendering anything.
 */
import type { Annotation, HighlightSemantic } from "../ipc/annotations";
import type { VaultMarks } from "../ipc/search";
import type { LectureRow } from "../ipc/vault";
import { byName, isWithin, parentOf, trail } from "./folders";

/** What can be filtered on: the four meanings, and sticky notes, which have none. */
export type MarkKind = HighlightSemantic | "sticky";

export const MARK_KINDS: readonly MarkKind[] = ["key", "definition", "exam", "question", "sticky"];

export interface LibraryFilter {
  /** Which kinds to show; empty shows every kind. */
  readonly kinds: ReadonlySet<MarkKind>;
  /** A folder to keep the highlights of, at any depth inside it; `null` keeps all. */
  readonly folder: string | null;
  /** Words the highlighted text must contain, ignoring case; blank shows all. */
  readonly text: string;
}

export const NO_FILTER: LibraryFilter = { kinds: new Set(), folder: null, text: "" };

export interface LibraryGroup {
  readonly lecture: LectureRow;
  readonly marks: readonly Annotation[];
}

/** An annotation's kind for filtering. */
export function kindOf(annotation: Annotation): MarkKind {
  return annotation.kind === "textBox" ? "sticky" : annotation.semantic;
}

/** The words an annotation carries: its quote, its caption, or what was typed on it. */
export function wordsOf(annotation: Annotation): string {
  switch (annotation.kind) {
    case "textHighlight":
      return annotation.quote;
    case "areaHighlight":
      return annotation.caption ?? "";
    case "textBox":
      return annotation.text;
  }
}

/** Where on its page an annotation sits, for ordering down the page. */
function topOf(annotation: Annotation): number {
  switch (annotation.kind) {
    case "textHighlight":
      return Math.min(...annotation.rects.map((rect) => rect.y));
    case "areaHighlight":
    case "textBox":
      return annotation.region.y;
  }
}

function lectureKept(lecture: LectureRow, filter: LibraryFilter): boolean {
  return filter.folder === null || isWithin(lecture.directory, filter.folder);
}

/**
 * The highlights the filter keeps, grouped by lecture in the sidebar's order, each
 * lecture's in reading order: by page, then down the page. Lectures with none kept are
 * left out.
 */
export function libraryGroups(
  marks: VaultMarks,
  lectures: readonly LectureRow[],
  filter: LibraryFilter,
): readonly LibraryGroup[] {
  const held = new Map(marks.lectures.map((lecture) => [lecture.directory, lecture.annotations]));
  const needle = filter.text.trim().toLowerCase();

  return lectures.flatMap((lecture) => {
    const annotations = held.get(lecture.directory);

    if (annotations === undefined || !lectureKept(lecture, filter)) {
      return [];
    }

    const kept = [...annotations]
      .filter((annotation) => filter.kinds.size === 0 || filter.kinds.has(kindOf(annotation)))
      .filter((annotation) => needle === "" || wordsOf(annotation).toLowerCase().includes(needle))
      .sort((a, b) => a.page - b.page || topOf(a) - topOf(b));

    return kept.length === 0 ? [] : [{ lecture, marks: kept }];
  });
}

/**
 * The folders that hold highlights, at any depth, sorted, for the menu: each folder above
 * an item with highlights, so "everything in CS454" and "just Week 3" are both there.
 */
export function folderChoices(marks: VaultMarks, lectures: readonly LectureRow[]): readonly string[] {
  const marked = new Set(marks.lectures.map((lecture) => lecture.directory));
  const folders = lectures
    .filter((lecture) => marked.has(lecture.directory))
    .flatMap((lecture) => trail(parentOf(lecture.directory)));

  return [...new Set(folders)].sort(byName);
}
