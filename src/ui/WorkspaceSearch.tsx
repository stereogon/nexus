/**
 * The ⌘P window, wired to the workspace: where each kind of result goes when chosen. Apart
 * from `App` so the shell does not also spell out search routing.
 */
import type { VaultSearch } from "../ipc/search";
import type { CommandError, LectureRow } from "../ipc/vault";
import type { SearchResult } from "./searchResults";
import { SearchWindow } from "./SearchWindow";
import type { Listing } from "./sidebarRows";
import type { ArrivalTarget } from "./useArrival";

export function WorkspaceSearch({
  listing,
  query,
  onQuery,
  found,
  failure,
  onFolder,
  onOpen,
  onOpenAt,
  onClose,
}: {
  readonly listing: Listing;
  readonly query: string;
  readonly onQuery: (text: string) => void;
  readonly found: VaultSearch | null;
  readonly failure: CommandError | null;
  /** Shows a folder in the sidebar. */
  readonly onFolder: (path: string) => void;
  readonly onOpen: (lecture: LectureRow) => void;
  /** Opens an item at a line of its notes or one of its highlights. */
  readonly onOpenAt: (lecture: LectureRow, at: ArrivalTarget) => void;
  readonly onClose: () => void;
}) {
  const choose = (result: SearchResult) => {
    onClose();

    switch (result.target.kind) {
      case "folder":
        onFolder(result.target.path);
        return;
      case "item":
        onOpen(result.target.lecture);
        return;
      case "place":
        onOpenAt(result.target.lecture, result.target.at);
        return;
    }
  };

  return (
    <SearchWindow
      failure={failure}
      found={found}
      listing={listing}
      onChoose={choose}
      onClose={onClose}
      onQuery={onQuery}
      query={query}
    />
  );
}
