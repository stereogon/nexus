/**
 * Showing a filesystem path in a space too small for it.
 */
/**
 * A vault path short enough for the sidebar's footer.
 *
 * The footer is 264px wide and a vault path is usually far longer, so what matters is the
 * end of it — `NexusVault` identifies the vault, `/Users/alex` does not. Plain
 * truncation keeps the wrong half, and the first attempt at this used `direction: rtl` to
 * keep the tail visible, which moved the leading slash to the end and drew
 * `/Users/me/NexusVault` as `Users/me/NexusVault/`.
 *
 * So the tail is chosen here, where it is a string operation that can be tested, and the
 * full path stays in the element's `title` for anyone who wants it.
 */
export function shortPath(path: string, segments = 2): string {
  const parts = path.split("/").filter((part) => part !== "");

  if (parts.length <= segments) {
    return path;
  }

  return `…/${parts.slice(-segments).join("/")}`;
}
