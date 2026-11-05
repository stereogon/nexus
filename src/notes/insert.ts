/**
 * Where a citation goes when "Link to notes" is pressed.
 *
 * At the cursor, as `claude-spec.md` §2.4 says — but as a block of its own. A citation is
 * a blockquote line, and in Markdown a line typed straight after a blockquote is read as
 * part of it ("lazy continuation"), while a quote typed into the middle of a sentence
 * splits the sentence. So it is given a blank line on each side unless one is already
 * there, and the cursor lands on a fresh line after it, ready for the next thought.
 *
 * Pure, so the spacing rules are tested without an editor.
 */

/** What to insert at the cursor, and where the cursor goes after, relative to it. */
export interface Insertion {
  readonly text: string;
  readonly cursor: number;
}

export function citationAt(doc: string, at: number, block: string): Insertion {
  const before = doc.slice(0, at);
  const after = doc.slice(at);

  // A blank line before, unless this is the start of the document or one is there.
  const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  // And after: enough that what follows starts a new paragraph rather than joining the
  // quote. The cursor goes on the empty line between.
  const trail = after.startsWith("\n\n") ? "\n" : after.startsWith("\n") ? "\n\n" : "\n\n\n";
  const text = `${lead}${block}${trail}`;

  return { text, cursor: lead.length + block.length + 2 };
}
