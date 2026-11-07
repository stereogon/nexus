/**
 * The notes' headings as short dashes down the right edge, Notion's way of showing where a
 * page goes (2026-11-07): the section being read is the bright one, a hover lists the
 * headings by name, and choosing one goes there. Shown once there are two headings, since
 * one is not a page worth a map of.
 */
import { EditorView } from "@codemirror/view";
import { useEffect, useState, type RefObject } from "react";

import { headingsOf, type Heading } from "../notes/blocks";

/**
 * The heading whose section is at the top of the notes — or, scrolled to the very end, the
 * last heading on screen: a heading near the end can never reach the top, and the rail
 * would otherwise never light it (found by the journey, as the page counter's was).
 */
function currentOf(view: EditorView, headings: readonly Heading[]): number | null {
  const scroller = view.scrollDOM;
  const atEnd = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
  const top = atEnd ? scroller.scrollTop + scroller.clientHeight - 40 : scroller.scrollTop + 48;
  let current: number | null = headings[0]?.line ?? null;

  for (const heading of headings) {
    if (view.lineBlockAt(view.state.doc.line(heading.line).from).top <= top) {
      current = heading.line;
    }
  }

  return current;
}

export function HeadingRail({
  view,
  text,
}: {
  readonly view: RefObject<EditorView | null>;
  /** The notes as they are now; the rail is rebuilt when they change. */
  readonly text: string;
}) {
  const headings = headingsOf(text);
  const [current, setCurrent] = useState<number | null>(null);

  useEffect(() => {
    const editor = view.current;

    if (editor === null) {
      return undefined;
    }

    const follow = () => {
      setCurrent(currentOf(editor, headingsOf(editor.state.doc.toString())));
    };

    follow();
    editor.scrollDOM.addEventListener("scroll", follow);

    return () => {
      editor.scrollDOM.removeEventListener("scroll", follow);
    };
  }, [view, text]);

  if (headings.length < 2) {
    return null;
  }

  const go = (heading: Heading) => {
    const editor = view.current;

    if (editor === null) {
      return;
    }

    const at = editor.state.doc.line(heading.line).from;

    editor.dispatch({ selection: { anchor: at }, effects: EditorView.scrollIntoView(at, { y: "start", yMargin: 24 }) });
    editor.focus();
  };

  return (
    <nav aria-label="Headings" className="heading-rail">
      <ul className="heading-dashes">
        {headings.map((heading) => (
          <li key={heading.line}>
            <span aria-hidden="true" className="heading-dash" data-current={heading.line === current} data-level={heading.level} />
          </li>
        ))}
      </ul>
      <ul className="heading-list">
        {headings.map((heading) => (
          <li key={heading.line}>
            <button
              aria-current={heading.line === current ? "location" : undefined}
              className="heading-link"
              data-level={heading.level}
              onClick={() => {
                go(heading);
              }}
              type="button"
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
