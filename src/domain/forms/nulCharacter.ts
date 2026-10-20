// Postgres text and jsonb refuse U+0000 ("invalid byte sequence for encoding UTF8: 0x00"), so a
// field holding one cannot be stored. Every editor refuses it before anything is written, with a
// message that names the field, rather than letting the insert fail (for a card, after its version
// was already made).

/** Whether `text` holds a NUL character (U+0000). */
export const hasNul = (text: string): boolean => text.includes("\u0000");

/** What a person is told: `what` names the field. */
export const nulMessage = (what: string): string =>
  `${what} contains a NUL character (U+0000), which cannot be stored. Remove it and save again.`;
