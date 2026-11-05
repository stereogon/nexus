/**
 * What the harness's answers share: the shape of a request about one lecture, and the
 * rejection the window's `asCommandError` expects.
 */
import type { InvokeArgs } from "@tauri-apps/api/core";
import { z } from "zod";

export const InLecture = z.object({ vault: z.string(), directory: z.string() });

/** One command's answer. */
export type Handlers = Record<string, (args: InvokeArgs | undefined) => unknown>;

/** The shape the window's `asCommandError` expects of a rejection. */
export class CommandFailure extends Error {
  constructor(
    readonly code: string,
    readonly remediation: string,
  ) {
    super(remediation);
  }
}
