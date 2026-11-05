/**
 * Where an image in the notes loads from.
 *
 * Only `assets/<file>` inside the lecture — the folder pasting writes to, as `claude-spec.md`
 * §2.3 lays out. Anything else answers `null` and is shown as a sentence: a web address
 * would make an offline app fetch something, and a path with `..` or a leading `/` would
 * let a note read a file outside its lecture.
 */
import { convertFileSrc } from "@tauri-apps/api/core";

/** One file directly inside `assets/`, by a name that cannot climb out of it. */
const ASSET = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** Whether `src` names a file in the lecture's own assets folder. */
export function isAssetPath(src: string): boolean {
  return ASSET.test(src) && !src.includes("..");
}

export function assetUrl(vault: string, directory: string, src: string): string | null {
  return isAssetPath(src) ? convertFileSrc(`${vault}/${directory}/${src}`) : null;
}
