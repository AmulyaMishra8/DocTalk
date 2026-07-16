import { embedText } from '../ai/embeddings';
import { vectorSearch, keywordSearch } from '../db/search';
import { reciprocalRankFusion } from '../lib/fusion';
import { llmRerank } from '../ai/rerank';
import { generateText, streamGroq } from '../ai/llm';
import type { AskResult, Citation, RetrievedChunk, StreamEvent } from '../types';

interface AskOptions {
  topN?: number;
  rerank?: boolean;
  notebookId: string;
}

export async function retrieve(
  question: string,
  { topN = 5, rerank = true, notebookId }: AskOptions,
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedText(question, 'RETRIEVAL_QUERY');
  const [vec, kw] = await Promise.all([
    vectorSearch(queryEmbedding, notebookId, 20),
    keywordSearch(question, notebookId, 20),
  ]);

  const fused = reciprocalRankFusion([vec, kw]);
  if (fused.length === 0) return [];

  return rerank
    ? llmRerank(question, fused.slice(0, 15), topN)
    : fused.slice(0, topN);
}

function buildPrompt(question: string, context: string): string {
  return `You answer questions using ONLY the context below, which comes from the user's own documents.
Rules:
- If the answer is not in the context, say you don't know — do not invent facts.
- Cite the passages you use inline with [n], matching the numbered context blocks.

Context:
${context}

Question: ${question}

Answer:`;
}

// Chunk text comes from MarkItDown and can carry PDF/markdown noise — table
// pipes, alignment rows, and `(cid:NN)` codes (glyphs the PDF font couldn't map
// to Unicode, e.g. contact icons). Strip that so the source preview reads as
// prose, then trim to a word boundary near 200 chars.
function cleanSnippet(raw: string): string {
  const cleaned = raw
    .replace(/\(cid:\d+\)/gi, ' ')   // unmapped PDF glyph codes
    .replace(/\|/g, ' ')             // markdown table cell borders
    .replace(/[-:]{2,}/g, ' ')       // table separator / alignment rows
    .replace(/[#>*_`~]+/g, ' ')      // stray markdown marks
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
  if (cleaned.length <= 200) return cleaned;
  const cut = cleaned.slice(0, 200);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 160 ? cut.slice(0, lastSpace) : cut).trim();
}

function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((c, i) => ({
    ref: i + 1,
    chunkId: String(c.id),
    documentId: String(c.documentId),
    filename: c.filename,
    snippet: cleanSnippet(c.content),
  }));
}

// Non-streaming path (kept for internal/eval use).
export async function askQuestion(
  question: string,
  options: AskOptions,
): Promise<AskResult> {
  const top = await retrieve(question, options);
  if (top.length === 0) {
    return { answer: "I couldn't find anything relevant in this notebook.", citations: [], retrieved: 0 };
  }

  const context = top.map((c, i) => `[${i + 1}] (source: ${c.filename})\n${c.content}`).join('\n\n');
  const answer = await generateText(buildPrompt(question, context), { temperature: 0.2 });

  return { answer: answer.trim(), citations: buildCitations(top), retrieved: top.length };
}

// Streaming path — yields SSE-ready events consumed by the /ask endpoint.
export async function* streamQuestion(
  question: string,
  options: AskOptions,
): AsyncGenerator<StreamEvent> {
  const top = await retrieve(question, options);

  if (top.length === 0) {
    yield { token: "I couldn't find anything relevant in this notebook." };
    yield { done: true, citations: [], retrieved: 0 };
    return;
  }

  const context = top.map((c, i) => `[${i + 1}] (source: ${c.filename})\n${c.content}`).join('\n\n');

  for await (const token of streamGroq(buildPrompt(question, context))) {
    yield { token };
  }

  yield { done: true, citations: buildCitations(top), retrieved: top.length };
}
