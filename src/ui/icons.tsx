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

export function GearIcon() {
  return (
    <Icon>
      <circle cx="8" cy="8" r="2.2" />
      <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" />
    </Icon>
  );
}
