import axios from 'axios';
import type { Readable } from 'stream';
import { withRetry } from '../lib/retry';
import { rateLimited } from '../lib/throttle';
import { withCircuit } from '../lib/circuit';

type Provider = 'groq' | 'gemini';
const PROVIDER: Provider =
  (process.env.LLM_PROVIDER || 'groq').toLowerCase() === 'gemini' ? 'gemini' : 'groq';

const DEFAULT_MODELS: Record<Provider, { chat: string; util: string }> = {
  groq:   { chat: 'openai/gpt-oss-120b', util: 'openai/gpt-oss-20b' },
  gemini: { chat: 'gemini-2.5-flash',    util: 'gemini-2.0-flash-lite' },
};

export const CHAT_MODEL = process.env.CHAT_MODEL || DEFAULT_MODELS[PROVIDER].chat;
export const UTIL_MODEL = process.env.UTIL_MODEL || DEFAULT_MODELS[PROVIDER].util;

const MIN_GAP_MS =
  Number(process.env.LLM_MIN_GAP_MS) || (PROVIDER === 'groq' ? 1500 : 4000);

interface GenerateOptions {
  temperature?: number;
  json?: boolean;
  model?: string;
}

export async function generateText(
  prompt: string,
  { temperature = 0.2, json = false, model = CHAT_MODEL }: GenerateOptions = {},
): Promise<string> {
  return rateLimited(
    () =>
      withRetry(() =>
        withCircuit('llm', () =>
          PROVIDER === 'groq'
            ? callGroq(prompt, temperature, json, model)
            : callGemini(prompt, temperature, json, model),
        ),
      ),
    MIN_GAP_MS,
  );
}

// Streaming version — yields tokens as they arrive from Groq.
// Only supports Groq (Gemini streaming is a different protocol).
export async function* streamGroq(
  prompt: string,
  model = CHAT_MODEL,
): AsyncGenerator<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const response = await withCircuit('llm', () =>
    axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model, messages: [{ role: 'user', content: prompt }], temperature: 0.2, stream: true },
      { headers: { Authorization: `Bearer ${apiKey}` }, responseType: 'stream', timeout: 60_000 },
    ),
  );

  const stream = response.data as Readable;
  let buf = '';

  for await (const raw of stream) {
    buf += (raw as Buffer).toString();
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;
      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
        };
        const text = parsed.choices?.[0]?.delta?.content ?? '';
        if (text) yield text;
        if (parsed.choices?.[0]?.finish_reason) return;
      } catch { /* skip malformed chunk */ }
    }
  }
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

async function callGroq(
  prompt: string,
  temperature: number,
  json: boolean,
  model: string,
): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY is not set');

  const { data } = await axios.post<OpenAIChatResponse>(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
    },
    { headers: { Authorization: `Bearer ${apiKey}` }, timeout: 60_000 },
  );
  return data.choices?.[0]?.message?.content ?? '';
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

async function callGemini(
  prompt: string,
  temperature: number,
  json: boolean,
  model: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set');

  const generationConfig: Record<string, unknown> = { temperature };
  if (model.includes('2.5')) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  if (json) generationConfig.responseMimeType = 'application/json';

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const { data } = await axios.post<GeminiResponse>(
    url,
    { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig },
    { timeout: 60_000 },
  );
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
}
