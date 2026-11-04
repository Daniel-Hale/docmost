import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';

export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODELS = [
  'text-embedding-3-small',
  'text-embedding-3-large',
] as const;
export const DEFAULT_EMBEDDING_MODEL = EMBEDDING_MODELS[0];
export const INDEX_QUEUE = 'community-document-embeddings';
export type DocumentChunk = { position: number; text: string; input: string };

export function documentHash(title: string, text: string): string {
  return createHash('sha256')
    .update(title + '\n' + text)
    .digest('hex');
}

export function chunkDocument(title: string, text: string): DocumentChunk[] {
  const characters = Array.from(text);
  const prefix = Array.from(title).slice(0, 200).join('') + '\n\n';
  const chunks: DocumentChunk[] = [];
  for (let start = 0; start < characters.length; start += 1400) {
    if (chunks.length >= 256) throw new Error('document_too_large');
    const content = characters.slice(start, start + 1600).join('');
    chunks.push({
      position: chunks.length,
      text: content,
      input: prefix + content,
    });
    if (start + 1600 >= characters.length) break;
  }
  if (!chunks.length && title.trim())
    chunks.push({ position: 0, text: title, input: prefix.trim() });
  return chunks;
}

export function reciprocalRankFusion(lexical: string[], semantic: string[]) {
  const scores = new Map<string, number>();
  for (const list of [lexical, semantic]) {
    [...new Set(list)].forEach((id, rank) =>
      scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + rank + 1)),
    );
  }
  return [...scores]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

@Injectable()
export class EmbeddingsClient {
  async embed(
    key: string,
    model: string,
    inputs: string[],
  ): Promise<number[][]> {
    if (
      !EMBEDDING_MODELS.includes(model as any) ||
      !inputs.length ||
      inputs.length > 16 ||
      inputs.some(
        (input) => !input.trim() || Buffer.byteLength(input, 'utf8') >= 8000,
      )
    ) {
      throw new BadRequestException('Invalid embedding input');
    }
    let response: Response;
    try {
      response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        signal: AbortSignal.timeout(60000),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          input: inputs,
          dimensions: EMBEDDING_DIMENSIONS,
          encoding_format: 'float',
        }),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Embedding provider is unavailable',
      );
    }
    if (!response.ok)
      throw new ServiceUnavailableException(
        `Embedding provider request failed (${response.status})`,
      );
    try {
      const raw = await response.text();
      if (raw.length > 2_000_000) throw new Error();
      const body = JSON.parse(raw);
      if (!Array.isArray(body.data) || body.data.length !== inputs.length)
        throw new Error();
      const result: number[][] = Array(inputs.length);
      for (const entry of body.data) {
        if (
          !Number.isInteger(entry.index) ||
          entry.index < 0 ||
          entry.index >= inputs.length ||
          result[entry.index] ||
          !Array.isArray(entry.embedding) ||
          entry.embedding.length !== EMBEDDING_DIMENSIONS ||
          entry.embedding.some(
            (value: unknown) =>
              typeof value !== 'number' ||
              !Number.isFinite(value) ||
              Math.abs(value) > 1,
          ) ||
          !entry.embedding.some((value: number) => value !== 0)
        )
          throw new Error();
        result[entry.index] = entry.embedding;
      }
      if (result.some((vector) => !vector)) throw new Error();
      return result;
    } catch {
      throw new ServiceUnavailableException(
        'Embedding provider returned an invalid embedding',
      );
    }
  }
}
