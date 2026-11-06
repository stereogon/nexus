/**
 * The document pane: a light page on a dark bed, virtualised.
 *
 * Taken from the canvas's *Workspace* artboards, whose viewer toolbar reads
 * `4 / 18 · − · 124% · + · Fit width`. §3 makes that authoritative, so the controls are
 * those controls in that order, and the page surface stays light in both themes — there is
 * no dark-mode inversion, because inverting a page ruins photographs, colour-coded
 * diagrams and scans. Confirmed with the user on 2026-10-28.
 *
 * Only the visible pages and a two-page buffer are mounted. The arithmetic for that lives
 * in `../pdf/pages`, tested on its own, so this file reads scroll offsets and draws.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Annotation } from "../ipc/annotations";
import { documentUrl, type OpenedDocument } from "../ipc/document";
import { matchesByPage, NO_MATCHES } from "../pdf/find";
import { usePdfDocument } from "../pdf/useDocument";
import { DocumentNotice } from "./DocumentNotice";
import { Failure } from "./Failure";
import { FindBar } from "./FindBar";
import { HighlightMenu } from "./HighlightMenu";
import { PdfPage } from "./PdfPage";
import type { NotesLink } from "./HighlightLayer";
import { PdfToolbar } from "./PdfToolbar";
import { onPage } from "./annotationList";
import { useAnnotations } from "./useAnnotations";
import { outlineOn, useAreaDraw } from "./useAreaDraw";
import { useElementSize } from "./useElementSize";
import { useFind } from "./useFind";
import { useHighlightMenu } from "./useHighlightMenu";
import { useStickies } from "./useStickies";
import { usePageLayout } from "./usePageLayout";
import { useReadingPosition } from "./useReadingPosition";
import { useUndoKeys } from "./useUndoKeys";
import { useJump, type Jump } from "./useJump";
import { ZOOM_LIMITS } from "./zoom";
import { useZoom } from "./useZoom";

export function PdfViewer({
  document,
  title,
  vault,
  directory,
  onClose,
  onLinkToNotes,
  jump,
  notesOpen,
  onNotes,
  notesLink,
}: {
  readonly document: OpenedDocument;
  readonly title: string;
  readonly vault: string;
  readonly directory: string;
  readonly onClose: () => void;
  /** Puts a citation of this annotation into the notes beside the document. */
  readonly onLinkToNotes: (annotation: Annotation) => void;
  /** A cited highlight to take the document to, from a click in the notes. */
  readonly jump: Jump | null;
  readonly notesOpen: boolean;
  readonly onNotes: () => void;
  /** Which highlights the notes cite, and how to show where (§2.4's reverse lookup). */
  readonly notesLink: NotesLink;
}) {
  const highlights = useAnnotations(vault, directory);
  useUndoKeys(highlights.undo, highlights.redo);
  const stickies = useStickies(highlights, onLinkToNotes, (at) => (state.sizes[at]?.width ?? 0) * scale);
  const menu = useHighlightMenu(highlights, onLinkToNotes, stickies.startBeside);
  const dismissMenu = menu.dismiss;
  const [boxing, setBoxing] = useState(false);
  const area = useAreaDraw(menu.draw, boxing);
  const { state, page } = usePdfDocument(documentUrl(document));
  const scroller = useRef<HTMLDivElement | null>(null);
  const viewport = useElementSize(scroller);

  const zoom = useZoom(state.sizes[0]?.width ?? 0, viewport.width);
  const scale = zoom.scale;
  const { mode, changeMode, setPageIndex, boxes, showing, mounted, stackHeight, goTo, track } = usePageLayout(
    state.sizes,
    scale,
    viewport.height,
    scroller,
  );

  const onScroll = useCallback(() => {
    track();

    // The menu is positioned against the window while the pages scroll underneath it, so
    // leaving it open would park it over unrelated text. Dismissing is also the honest
    // behaviour: a selection scrolled out of sight should not keep a menu on screen.
    dismissMenu();
  }, [dismissMenu, track]);

  /**
   * Anything that moves the page out from under the menu closes it.
   *
   * Driven by what changed rather than by each control calling `dismiss`, which was the
   * first version and was already wrong: scrolling was handled, so the arrows, the page
   * field, the mode switch and the zoom buttons each looked fine on their own while none
   * of them closed the menu. Reported on 2026-10-29 after switching from scroll to page
   * mode left a Remove button floating over a different page.
   *
   * The list is the three things that can move a page: which page is showing, which mode
   * lays it out, and what scale it is drawn at. A control added later moves one of them
   * or it does not move the page at all, so it needs no line here.
   */
  useEffect(() => {
    dismissMenu();
  }, [showing, mode, scale, dismissMenu]);

  const find = useFind(page, state.sizes.length, showing);
  const found = useMemo(() => matchesByPage(find.matches, find.current), [find.matches, find.current]);
  const currentMatch = find.current === null ? undefined : find.matches[find.current];

  // A new current match is on a page that may not be drawn yet; go to it, and the page
  // scrolls the match itself into view once its text is laid out.
  useEffect(() => {
    if (currentMatch !== undefined) {
      goTo(currentMatch.pageIndex);
    }
    // Only a new match moves the document, not the page changing as it scrolls.
  }, [currentMatch]);

  useReadingPosition({ vault, directory, boxes, mode, showing, scroller, arriving: jump !== null });

  const jumped = useJump({
    jump,
    annotations: highlights.all,
    boxes,
    mode,
    viewportHeight: viewport.height,
    scroller,
    goToPage: setPageIndex,
    ready: highlights.loaded && boxes.length > 0,
  });

  return (
    <section className="viewer">
      <PdfToolbar
        boxing={boxing}
        fitting={zoom.fitting}
        notesOpen={notesOpen}
        onBoxing={setBoxing}
        onNotes={onNotes}
        limits={ZOOM_LIMITS}
        mode={mode}
        onClose={onClose}
        onFit={zoom.fit}
        onGoTo={goTo}
        onMode={changeMode}
        onZoom={zoom.step}
        pages={state.sizes.length}
        scale={scale}
        showing={showing}
        title={title}
      />

      <DocumentNotice
        needsAttention={document.needsAttention}
        risks={document.risks}
      />

      {highlights.failure !== null && <Failure error={highlights.failure} />}
      {jumped.missing && (
        <p className="note">
          That citation points at a highlight this lecture no longer has — it was removed after
          it was cited. The citation in your notes is unchanged.
        </p>
      )}

      {menu.open !== null && (
        <HighlightMenu
          at={menu.open.at}
          current={menu.open.current}
          onChoose={menu.open.onChoose}
          onDismiss={menu.dismiss}
          onLink={menu.open.onLink}
          onSticky={menu.open.onSticky}
          onRemove={menu.open.onRemove}
        />
      )}

      {find.open && <FindBar find={find} />}

      <div className={boxing ? "viewer-bed boxing" : "viewer-bed"} onScroll={onScroll} ref={scroller}>
        {state.loading && <p className="note">Opening the document…</p>}
        {state.failure !== null && (
          <div className="card error">
            <div className="code">{state.failure.code}</div>
            <div>{state.failure.remediation}</div>
          </div>
        )}

        <div className="pdf-stack" style={{ height: stackHeight }}>
          {mounted !== null &&
            page !== null &&
            state.sizes.slice(mounted.first, mounted.last + 1).map((size, offset) => {
              const index = mounted.first + offset;
              const box = boxes[index];

              return box === undefined ? null : (
                <PdfPage
                  annotations={onPage(highlights.all, index)}
                  height={box.height}
                  index={index}
                  key={index}
                  onAreaStart={area.begin}
                  onPick={menu.pick}
                  outline={outlineOn(index, area.drawing, menu.drawn)}
                  notesLink={notesLink}
                  stickies={stickies}
                  pulse={jumped.pulse?.pageIndex === index ? jumped.pulse : null}
                  found={found.get(index) ?? NO_MATCHES}
                  revealFound={find.reveal && currentMatch?.pageIndex === index}
                  onFoundRevealed={find.revealed}
                  scale={scale}
                  source={page}
                  // In page mode the one mounted page sits at the top of its own stack,
                  // not at the offset it would have had in the full document.
                  top={mode === "page" ? 0 : box.top}
                  width={size.width * scale}
                />
              );
            })}
        </div>
      </div>
    </section>
  );
}
