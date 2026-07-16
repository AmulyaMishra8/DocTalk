import type { RetrievedChunk } from '../types';

// Reciprocal Rank Fusion: merge multiple ranked lists into one, rewarding
// chunks that rank highly across lists. k softens the contribution of lower
// ranks (60 is the value from the original RRF paper).
export function reciprocalRankFusion(
  lists: RetrievedChunk[][],
  k = 60,
): RetrievedChunk[] {
  const scores = new Map<string, number>();
  const byId = new Map<string, RetrievedChunk>();

  for (const list of lists) {
    list.forEach((chunk, rank) => {
      const id = String(chunk.id);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank + 1));
      if (!byId.has(id)) byId.set(id, chunk);
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ ...(byId.get(id) as RetrievedChunk), score }));
}
