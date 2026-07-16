import { generateText, UTIL_MODEL } from './llm';
import type { RetrievedChunk } from '../types';

interface RerankScore {
  index: number;
  score: number;
}

// Second-stage re-ranking: ask the LLM to score how useful each candidate
// passage is for answering the question, then reorder by that score. Falls
// back to the incoming order if the model output can't be parsed.
export async function llmRerank(
  question: string,
  candidates: RetrievedChunk[],
  topN = 5,
): Promise<RetrievedChunk[]> {
  if (candidates.length <= 1) return candidates.slice(0, topN);

  const passages = candidates
    .map((c, i) => `[${i + 1}] ${c.content.replace(/\s+/g, ' ').slice(0, 600)}`)
    .join('\n\n');

  const prompt = `You score how useful each passage is for answering a question.
Question: "${question}"

Passages:
${passages}

Return ONLY JSON of the form {"scores":[{"index":<1-based passage number>,"score":<0-10>}]} for every passage.`;

  try {
    const raw = await generateText(prompt, { temperature: 0, json: true, model: UTIL_MODEL });
    const parsed = JSON.parse(raw) as { scores?: RerankScore[] };
    const scores = parsed.scores ?? [];
    if (scores.length === 0) return candidates.slice(0, topN);

    const ranked = [...candidates]
      .map((chunk, i) => ({
        chunk,
        score: scores.find((s) => s.index === i + 1)?.score ?? -1,
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ chunk, score }) => ({ ...chunk, score }));

    return ranked.slice(0, topN);
  } catch {
    // Model unavailable or returned non-JSON — keep RRF order.
    return candidates.slice(0, topN);
  }
}
