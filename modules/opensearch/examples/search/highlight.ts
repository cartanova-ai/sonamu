// Highlight fragments are not escaped: never render them as HTML; split on these private-use markers instead.

export const HIGHLIGHT_START = "\uE000";
export const HIGHLIGHT_END = "\uE001";

export function highlightClause(fields: readonly string[]) {
  return {
    pre_tags: [HIGHLIGHT_START],
    post_tags: [HIGHLIGHT_END],
    fields: Object.fromEntries(fields.map((field) => [field, {}])),
  };
}

export interface HighlightSegment {
  readonly text: string;
  readonly highlighted: boolean;
}

/** Render each segment as a text node, never through innerHTML or dangerouslySetInnerHTML. */
export function splitHighlight(fragment: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  const [head = "", ...rest] = fragment.split(HIGHLIGHT_START);
  if (head !== "") segments.push({ text: head, highlighted: false });
  for (const part of rest) {
    const [marked = "", ...tail] = part.split(HIGHLIGHT_END);
    if (marked !== "") segments.push({ text: marked, highlighted: true });
    const after = tail.join("");
    if (after !== "") segments.push({ text: after, highlighted: false });
  }
  return segments;
}
