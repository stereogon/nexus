/**
 * The top of the sidebar, from the redesign canvas (2026-11-07): room for the window's own
 * buttons with a control to hide the sidebar, then the vault — its name opens a menu to
 * switch vaults — and the one "+" that makes a note or folder or imports a document into
 * the folder showing.
 *
 * The strip is a window drag region: with the title bar gone (`titleBarStyle: Overlay`),
 * the app's own header strips are where the window is moved from.
 */
import { useState } from "react";

import { vaultNameOf } from "./folders";
import { ChevronDownIcon, FolderIcon, ImportIcon, NoteIcon, PlusIcon, SidebarIcon } from "./icons";
import type { MenuAt } from "./menuPlacement";
import { PopMenu, under } from "./PopMenu";
import type { Making } from "./sidebarRows";

export function SidebarHead({
  root,
  busy,
  onHide,
  onMake,
  onImport,
  onChooseVault,
  place,
}: {
  readonly root: string;
  readonly busy: boolean;
  readonly onHide: () => void;
  readonly onMake: (making: Making) => void;
  readonly onImport: () => void;
  readonly onChooseVault: () => void;
  /** The name of the folder showing, which the + menu says new things go into. */
  readonly place: string;
}) {
  const [open, setOpen] = useState<{ readonly menu: "vault" | "new"; readonly at: MenuAt } | null>(null);
  const close = () => {
    setOpen(null);
  };

  return (
    <>
      <div className="sidebar-top" data-tauri-drag-region="">
        <button aria-label="Hide sidebar" className="chrome-icon" onClick={onHide} title="Hide sidebar" type="button">
          <SidebarIcon />
        </button>
      </div>

      <div className="sidebar-vault">
        <button
          aria-expanded={open?.menu === "vault"}
          aria-haspopup="menu"
          className="vault-switch"
          data-opens="vault"
          onClick={(event) => {
            const at = under(event.currentTarget, "left", 240);

            setOpen((current) => (current?.menu === "vault" ? null : { menu: "vault", at }));
          }}
          aria-label={`Vault: ${vaultNameOf(root)}`}
          title="Switch vault"
          type="button"
        >
          <span aria-hidden="true" className="vault-mark">
            N
          </span>
          <span className="vault-name">{vaultNameOf(root)}</span>
          <ChevronDownIcon />
        </button>
        <button
          aria-expanded={open?.menu === "new"}
          aria-haspopup="menu"
          aria-label="New note, folder or import"
          className="new-button"
          data-opens="new"
          disabled={busy}
          onClick={(event) => {
            const at = under(event.currentTarget, "right", 220);

            setOpen((current) => (current?.menu === "new" ? null : { menu: "new", at }));
          }}
          title="New"
          type="button"
        >
          <PlusIcon />
        </button>
      </div>

      {open?.menu === "new" && (
        <PopMenu
          at={open.at}
          items={[
            { label: "Note", icon: <NoteIcon />, keys: "⌘N", onSelect: () => { onMake("note"); } },
            { label: "Folder", icon: <FolderIcon />, keys: "⇧⌘N", onSelect: () => { onMake("folder"); } },
            { label: "Import document…", icon: <ImportIcon />, keys: "⌘O", onSelect: onImport },
          ]}
          label="New"
          note={`Added to ${place}`}
          onDismiss={close}
          opener="new"
        />
      )}
      {open?.menu === "vault" && (
        <PopMenu
          at={open.at}
          items={[{ label: "Open another vault…", icon: <FolderIcon />, onSelect: onChooseVault }]}
          label="Vault"
          note={root}
          onDismiss={close}
          opener="vault"
        />
      )}
    </>
  );
}
