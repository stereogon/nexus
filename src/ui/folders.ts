/**
 * Folder paths, as the sidebar and the editor read them.
 *
 * Every path in the vault is relative and `/`-separated (Rust's `RelativePath` writes
 * nothing else), and the top of the vault is the empty string, as the folder commands take
 * it. So these are string rules, kept in one place so "the folder this item is in" has one
 * answer everywhere it is asked.
 */

/** The folder holding `path`, or `""` when it is at the top of the vault. */
export function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");

  return cut === -1 ? "" : path.slice(0, cut);
}

/** The last segment of `path`: the folder's or item's own name. */
export function nameOf(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Each folder from the top down to `folder` itself, as paths; empty at the top. */
export function trail(folder: string): readonly string[] {
  if (folder === "") {
    return [];
  }

  const parts = folder.split("/");

  return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
}

/** Whether `path` is inside `folder`, at any depth. Everything is inside the top. */
export function isWithin(path: string, folder: string): boolean {
  return folder === "" || path.startsWith(`${folder}/`);
}

/** `CS454 / Week 3`, for saying where something is. Empty at the top of the vault. */
export function spoken(folder: string): string {
  return folder.split("/").filter((part) => part !== "").join(" / ");
}

/** Numeric, or "Week 10" sorts before "Week 9" and reads as broken. */
export function byName(left: string, right: string): number {
  return left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" });
}

/** What the top of the vault is called: the vault folder's own name. */
export function vaultNameOf(root: string): string {
  return nameOf(root.replace(/\/+$/, "")) || "Vault";
}
