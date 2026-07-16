import axios from 'axios';
import type { EmbedTaskType } from '../types';

// all-mpnet-base-v2 outputs 768-dim normalised vectors — same as before, no
// schema changes needed. The model runs inside the markitdown container so
// there's no API key, no rate limit, and no per-call cost.
export const EMBED_DIM = 768;

const EMBED_URL = process.env.MARKITDOWN_URL || 'http://localhost:8000';

// taskType kept for call-site compatibility; the local model doesn't need it.
export async function embedText(
  text: string,
  _taskType: EmbedTaskType = 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  const { data } = await axios.post<{ embedding: number[] }>(
    `${EMBED_URL}/embed`,
    { text },
    { timeout: 60_000 },
  );
  return data.embedding;
}
