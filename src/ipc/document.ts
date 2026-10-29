/**
 * Opening one lecture's document, and what the screening found in it.
 *
 * Everything here crosses from Rust, so everything here is parsed before use (§4). That
 * matters more than usual for this payload: it describes a *foreign* document, and the one
 * thing worse than not screening a file is screening it and then mis-reading the answer.
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { z } from "zod";

/**
 * How much notice an indicator deserves.
 *
 * Two levels, matching `RiskSeverity` in `lecture-core`. An unknown value is a mismatch
 * between the two sides rather than something to render, so the enum refuses it instead of
 * falling back — a severity silently read as "informational" is the failure that matters.
 */
export const RiskSeveritySchema = z.enum(["notable", "informational"]);

/** One thing the document was found to ask for. */
export const DocumentRiskSchema = z.object({
  code: z.string(),
  severity: RiskSeveritySchema,
  explanation: z.string(),
});

/** Everything the viewer needs to open one lecture. */
export const OpenedDocumentSchema = z.object({
  path: z.string(),
  bytes: z.number().int().nonnegative(),
  risks: z.array(DocumentRiskSchema),
  /**
   * Whether to show the findings before the document.
   *
   * Sent rather than derived here, so the severity rule lives only in the domain. Deriving
   * it in the UI would mean a second copy to keep in step with `RiskSeverity`.
   */
  needsAttention: z.boolean(),
});

export type RiskSeverity = z.infer<typeof RiskSeveritySchema>;
export type DocumentRisk = z.infer<typeof DocumentRiskSchema>;
export type OpenedDocument = z.infer<typeof OpenedDocumentSchema>;

/**
 * Locates, verifies and screens a lecture's PDF.
 *
 * @throws {CommandError} if the lecture cannot be read, if its PDF has not been made yet
 * (`ERR_DOCUMENT_NOT_READY`), or if the file is not a PDF (`ERR_NOT_A_PDF`). Indicators
 * found are **not** a rejection: they are reported alongside a document that still opens.
 */
export async function openDocument(
  vault: string,
  directory: string,
): Promise<OpenedDocument> {
  const payload: unknown = await invoke("open_document", { vault, directory });

  return OpenedDocumentSchema.parse(payload);
}

/**
 * The URL the window loads a document from.
 *
 * `path` is where the file is on disk; the window cannot open that directly and should
 * not be able to. `convertFileSrc` turns it into the asset-protocol URL that Tauri will
 * serve — and will serve only because `open_document` granted the scope for this exact
 * file. Keeping the conversion here means the viewer never handles a raw filesystem path.
 */
export function documentUrl(opened: OpenedDocument): string {
  return convertFileSrc(opened.path);
}
