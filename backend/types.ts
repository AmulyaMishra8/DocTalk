export interface AuthUser {
  id: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface Notebook {
  id: string;
  userId: string;
  name: string;
  createdAt: string;
}

export interface DocumentRow {
  id: string;
  notebookId: string;
  filename: string;
  createdAt: string;
}

export interface MarkdownJobData {
  filePath: string;
  originalName: string;
  notebookId: string;
  userId: string;
  fileHash: string;
}

export interface IngestResult {
  filename: string;
  documentId: string | null;
  chunks: number;
  duplicate?: boolean;
}

export interface EmbeddedChunk {
  content: string;
  embedding: number[];
}

export type EmbedTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

export interface ConvertResult {
  filename: string;
  success: boolean;
  markdown?: string;
  error?: string;
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  filename: string;
  content: string;
  score?: number;
}

export interface Citation {
  ref: number;
  chunkId: string;
  documentId: string;
  filename: string;
  snippet: string;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  retrieved: number;
}

export interface StreamEvent {
  token?: string;
  done?: boolean;
  citations?: Citation[];
  retrieved?: number;
  error?: string;
}
