interface ChunkOptions {
  maxChars?: number;
  overlap?: number;
}

// Split markdown into overlapping chunks, preferring paragraph boundaries.
// ~2000 chars ≈ 500 tokens — a reasonable retrieval granularity.
export function chunkText(
  text: string,
  { maxChars = 2000, overlap = 200 }: ChunkOptions = {},
): string[] {
  const clean = (text || '').replace(/\r\n/g, '\n').trim();
  if (!clean) return [];

  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > maxChars && current) {
      chunks.push(current.trim());
      // Carry a tail of the previous chunk so context isn't lost at the seam.
      const tail = current.slice(-overlap);
      current = `${tail}\n\n${para}`;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
