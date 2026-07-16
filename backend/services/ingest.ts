import { chunkText } from '../lib/chunk';
import { embedText } from '../ai/embeddings';
import { storeDocumentChunks } from '../db/store';
import type { EmbeddedChunk, IngestResult } from '../types';

type ProgressFn = (step: 'embedding' | 'storing', current: number, total: number) => Promise<void> | void;

export async function ingestMarkdown(
  filename: string,
  markdown: string,
  notebookId: string,
  userId: string,
  fileHash?: string,
  onProgress?: ProgressFn,
): Promise<IngestResult> {
  const pieces = chunkText(markdown || '');
  if (pieces.length === 0) return { filename, documentId: null, chunks: 0 };

  const embedded: EmbeddedChunk[] = [];
  for (let i = 0; i < pieces.length; i++) {
    await onProgress?.('embedding', i + 1, pieces.length);
    const embedding = await embedText(pieces[i], 'RETRIEVAL_DOCUMENT');
    embedded.push({ content: pieces[i], embedding });
  }

  await onProgress?.('storing', 0, pieces.length);
  const { documentId, count } = await storeDocumentChunks(filename, embedded, notebookId, userId, fileHash);
  return { filename, documentId, chunks: count };
}
