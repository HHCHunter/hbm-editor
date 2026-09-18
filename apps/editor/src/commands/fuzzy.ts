export interface FuzzyMatch {
  score: number;
  /** Matched character positions in the text, for highlighting. */
  positions: number[];
}

const isBoundary = (text: string, i: number) =>
  i === 0 || /[\s_\-/.!#:]/.test(text[i - 1]!) || (/[a-z]/.test(text[i - 1]!) && /[A-Z]/.test(text[i]!));

/**
 * Whether every character of the query appears in the text in order, and how well: consecutive
 * runs, word starts and an early first match score higher. Case-insensitive. Null when it
 * doesn't match.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const q = query.trim().toLowerCase();
  if (!q) return { score: 0, positions: [] };
  const lower = text.toLowerCase();

  // A plain substring is the strongest match; prefer one at a word start.
  const direct = lower.indexOf(q);
  if (direct >= 0) {
    let at = direct;
    for (let i = direct; i >= 0; i = lower.indexOf(q, i + 1)) {
      if (isBoundary(text, i)) {
        at = i;
        break;
      }
    }
    const positions = Array.from({ length: q.length }, (_, k) => at + k);
    return { score: 1000 + (isBoundary(text, at) ? 200 : 0) - at - text.length * 0.1, positions };
  }

  const positions: number[] = [];
  let score = 0;
  let from = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const at = lower.indexOf(ch, from);
    if (at < 0) return null;
    const prev = positions.at(-1);
    if (prev !== undefined && at === prev + 1) score += 15;
    if (isBoundary(text, at)) score += 25;
    score -= Math.min(at - from, 10);
    positions.push(at);
    from = at + 1;
  }
  return { score: score - text.length * 0.1, positions };
}
