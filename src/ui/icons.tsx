/**
 * The window's own icons: one stroke weight, drawn on a 16px grid, coloured by
 * `currentColor` so every theme colours them. Gathered here when the title bar went
 * (redesign, 2026-11-07) and its controls moved to the sidebar.
 */
import type { ReactNode } from "react";

function Icon({ children, size = 16 }: { readonly children: ReactNode; readonly size?: number }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.4"
      viewBox="0 0 16 16"
      width={size}
    >
      {children}
    </svg>
  );
}

export function SidebarIcon() {
  return (
    <Icon>
      <rect height="10" rx="2" width="12" x="2" y="3" />
      <path d="M6 3v10" />
    </Icon>
  );
}

export function PlusIcon() {
  return (
    <Icon>
      <path d="M8 3v10M3 8h10" strokeWidth="1.8" />
    </Icon>
  );
}

export function ChevronDownIcon() {
  return (
    <Icon size={12}>
      <path d="M4.5 6.5l3.5 3.5 3.5-3.5" />
    </Icon>
  );
}

export function HighlightsIcon() {
  return (
    <Icon>
      <path d="M3 13l2.2-.6L12 5.6 10.4 4 3.6 10.8z" />
      <path d="M9.4 5l1.6 1.6M2.5 14.5h11" />
    </Icon>
  );
}

export function ErrorsIcon() {
  return (
    <Icon>
      <path d="M8 2.5l6 10.5H2z" />
      <path d="M8 6.5v3M8 11.2v.1" />
    </Icon>
  );
}

/** A tick: the item chosen, in a menu of choices. */
export function CheckIcon() {
  return (
    <Icon size={14}>
      <path d="M3.5 8.5l3 3 6-7" />
    </Icon>
  );
}

/** A crescent: the page tone, in a document's bar. */
export function MoonIcon() {
  return (
    <Icon>
      <path d="M12.5 9.6A5 5 0 016.4 3.5a5 5 0 106.1 6.1z" />
    </Icon>
  );
}

/** A palette: the control opens the theme picker. */
export function ThemeIcon() {
  return (
    <Icon>
      <path d="M8 1.8a6.2 6.2 0 100 12.4c.9 0 1.2-.8.7-1.5s-.1-1.6.8-1.6h1.7a3 3 0 003-3A6.2 6.2 0 008 1.8z" />
      <circle cx="5" cy="7.4" fill="currentColor" r=".6" />
      <circle cx="7" cy="4.7" fill="currentColor" r=".6" />
      <circle cx="10.2" cy="5.1" fill="currentColor" r=".6" />
    </Icon>
  );
}

export function NoteIcon() {
  return (
    <Icon>
      <rect height="11.5" rx="1.6" width="10.5" x="2.75" y="2.25" />
      <path d="M5.5 6h5M5.5 8h5M5.5 10h3" />
    </Icon>
  );
}

/** A magnifier, for a field that filters or searches. */
export function SearchIcon() {
  return (
    <Icon size={14}>
      <circle cx="7" cy="7" r="4.6" />
      <path d="M10.4 10.4l3.1 3.1" />
    </Icon>
  );
}

export function FolderIcon() {
  return (
    <Icon>
      <path d="M2 4.6a1.3 1.3 0 011.3-1.3h3l1.4 1.7h5a1.3 1.3 0 011.3 1.3v5.6a1.3 1.3 0 01-1.3 1.3H3.3A1.3 1.3 0 012 11.9z" />
    </Icon>
  );
}

export function ImportIcon() {
  return (
    <Icon>
      <path d="M8 2.5v8M5 7.5l3 3 3-3M3 13.5h10" />
    </Icon>
  );
}

/**
 * A gear with eight teeth, for Settings. It had been a ring with eight short rays, which
 * read as a sun (reported 2026-11-07); the outline is generated: each tooth narrows from
 * 34° at the root (r 4.7) to 20° at its tip (r 6.5).
 */
export function GearIcon() {
  return (
    <Icon>
      <path d="M6.63 3.51 L6.87 1.6 L9.13 1.6 L9.37 3.51 L10.21 3.85 L11.73 2.68 L13.32 4.27 L12.15 5.79 L12.49 6.63 L14.4 6.87 L14.4 9.13 L12.49 9.37 L12.15 10.21 L13.32 11.73 L11.73 13.32 L10.21 12.15 L9.37 12.49 L9.13 14.4 L6.87 14.4 L6.63 12.49 L5.79 12.15 L4.27 13.32 L2.68 11.73 L3.85 10.21 L3.51 9.37 L1.6 9.13 L1.6 6.87 L3.51 6.63 L3.85 5.79 L2.68 4.27 L4.27 2.68 L5.79 3.85Z" />
      <circle cx="8" cy="8" r="2" />
    </Icon>
  );
}

export function DocumentIcon() {
  return (
    <Icon>
      <path d="M4 2h5.5l3 3v9h-8.5z" />
      <path d="M9.5 2v3h3" />
    </Icon>
  );
}

/** A page inside a note (2026-11-14): a sheet with a turned corner and two lines on it. */
export function PageIcon() {
  return (
    <Icon size={15}>
      <path d="M4 2h5.5l3 3v9h-8.5z" />
      <path d="M9.5 2v3h3M6 8.5h4M6 11h3" />
    </Icon>
  );
}

/** Deleting something that moves to the vault's `.trash`. */
export function TrashIcon() {
  return (
    <Icon size={14}>
      <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5" />
    </Icon>
  );
}

/** Putting a link back into the text. */
export function LinkIcon() {
  return (
    <Icon size={14}>
      <path d="M7 9a3 3 0 004.2 0l2-2a3 3 0 00-4.2-4.2l-.8.8M9 7a3 3 0 00-4.2 0l-2 2a3 3 0 004.2 4.2l.8-.8" />
    </Icon>
  );
}
