/**
 * Another service's error text, as a person may see it.
 *
 * The sidecars and the platform are internal: their error bodies can carry a
 * traceback, an internal address or a long JSON document. What reaches the
 * person (an action's error, a 502 body, the card page's notice) is one line of
 * at most SHOWN_DETAIL characters; the whole text stays in the server log.
 */
export const SHOWN_DETAIL = 300;

/** `text` on one line, cut to `max` characters (the cut marked with "..."). */
export function shortDetail(text: string, max: number = SHOWN_DETAIL): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 3)}...` : line;
}
