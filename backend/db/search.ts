import { pool } from './pool';
import type { RetrievedChunk } from '../types';

export async function vectorSearch(
  queryEmbedding: number[],
  notebookId: string,
  limit = 20,
): Promise<RetrievedChunk[]> {
  const literal = `[${queryEmbedding.join(',')}]`;
  const { rows } = await pool.query<RetrievedChunk>(
    `SELECT c.id, c.document_id AS "documentId", d.filename, c.content,
            1 - (c.embedding <=> $1::vector) AS score
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.notebook_id = $3
     ORDER BY c.embedding <=> $1::vector
     LIMIT $2`,
    [literal, limit, notebookId],
  );
  return rows;
}

export async function keywordSearch(
  query: string,
  notebookId: string,
  limit = 20,
): Promise<RetrievedChunk[]> {
  const { rows } = await pool.query<RetrievedChunk>(
    `SELECT c.id, c.document_id AS "documentId", d.filename, c.content,
            ts_rank(to_tsvector('english', c.content),
                    plainto_tsquery('english', $1)) AS score
     FROM chunks c
     JOIN documents d ON d.id = c.document_id
     WHERE d.notebook_id = $3
       AND to_tsvector('english', c.content) @@ plainto_tsquery('english', $1)
     ORDER BY score DESC
     LIMIT $2`,
    [query, limit, notebookId],
  );
  return rows;
}
