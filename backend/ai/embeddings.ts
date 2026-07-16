import axios from 'axios';
import type { EmbedTaskType } from '../types';
import { withRetry } from '../lib/retry';

// Both providers emit 768-dim vectors, matching chunks.embedding vector(768).
//
//   local  (default) — all-mpnet-base-v2 inside the markitdown container.
//                      No API key, no rate limit, nothing leaves the stack.
//   gemini           — gemini-embedding-001 truncated to 768 dims. Needed where
//                      there isn't RAM for PyTorch (e.g. a 512 MB Render free
//                      instance); costs an API call per chunk.
//
// !! The two are DIFFERENT vector spaces. A vector embedded by one provider is
// meaningless to the other, so switching invalidates every stored embedding —
// re-ingest your documents (POST /reset, then re-upload) or retrieval quietly
// returns nonsense rather than failing.
export const EMBED_DIM = 768;

type Provider = 'local' | 'gemini';
const PROVIDER: Provider =
  (process.env.EMBED_PROVIDER || 'local').toLowerCase() === 'gemini' ? 'gemini' : 'local';

const EMBED_URL = process.env.MARKITDOWN_URL || 'http://localhost:8000';

export async function embedText(
  text: string,
  taskType: EmbedTaskType = 'RETRIEVAL_DOCUMENT',
): Promise<number[]> {
  return PROVIDER === 'gemini' ? embedViaGemini(text, taskType) : embedLocally(text);
}

// taskType is ignored: the local model doesn't distinguish query from document.
async function embedLocally(text: string): Promise<number[]> {
  const { data } = await axios.post<{ embedding: number[] }>(
    `${EMBED_URL}/embed`,
    { text },
    { timeout: 60_000 },
  );
  return data.embedding;
}

interface GeminiEmbedResponse {
  embedding?: { values?: number[] };
}

async function embedViaGemini(text: string, taskType: EmbedTaskType): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('EMBED_PROVIDER=gemini but GEMINI_API_KEY is not set');

  const model = process.env.EMBED_MODEL || 'gemini-embedding-001';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

  // outputDimensionality truncates from the model's native size to 768, which
  // both fits the schema and stays under pgvector's 2000-dim index ceiling.
  // Cosine distance is scale-invariant, so the truncated vector needs no
  // renormalising for ranking to be correct.
  const { data } = await withRetry(() =>
    axios.post<GeminiEmbedResponse>(
      url,
      {
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIM,
      },
      { timeout: 60_000 },
    ),
  );

  const values = data.embedding?.values;
  if (!values?.length) throw new Error('Gemini returned no embedding values');
  if (values.length !== EMBED_DIM) {
    throw new Error(`Expected ${EMBED_DIM}-dim embedding, got ${values.length}`);
  }
  return values;
}
