import { pool } from './pool';
import type { EmbeddedChunk } from '../types';

export async function storeDocumentChunks(
  filename: string,
  chunks: EmbeddedChunk[],
  notebookId: string,
  userId: string,
  fileHash?: string,
): Promise<{ documentId: string; count: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const docRes = await client.query<{ id: string }>(
      `INSERT INTO documents (notebook_id, user_id, filename, file_hash)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [notebookId, userId, filename, fileHash ?? null],
    );
    const documentId = docRes.rows[0].id;

    for (let i = 0; i < chunks.length; i++) {
      const { content, embedding } = chunks[i];
      await client.query(
        `INSERT INTO chunks (document_id, chunk_index, content, embedding)
         VALUES ($1, $2, $3, $4)`,
        [documentId, i, content, `[${embedding.join(',')}]`],
      );
    }

    await client.query('COMMIT');
    return { documentId, count: chunks.length };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
