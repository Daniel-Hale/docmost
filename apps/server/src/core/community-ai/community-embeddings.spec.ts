import {
  chunkDocument,
  documentHash,
  EmbeddingsClient,
  EMBEDDING_DIMENSIONS,
  reciprocalRankFusion,
} from './community-embeddings';

describe('Community embedding boundaries', () => {
  afterEach(() => jest.restoreAllMocks());
  it('preserves Unicode, overlaps chunks and bounds every provider input', () => {
    const text = '😀漢字'.repeat(2000);
    const chunks = chunkDocument('Title', text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(Buffer.byteLength(chunk.input, 'utf8')).toBeLessThan(8000);
      expect(chunk.text).not.toContain('\ufffd');
    }
    expect(
      chunks[1].text.startsWith(
        Array.from(chunks[0].text).slice(-200).join(''),
      ),
    ).toBe(true);
    expect(documentHash('Title', text)).not.toBe(
      documentHash('Changed title', text),
    );
  });
  it('rejects oversized documents rather than silently claiming complete indexing', () => {
    expect(() => chunkDocument('Title', 'x'.repeat(400000))).toThrow(
      'document_too_large',
    );
  });
  it('fuses semantic paraphrases with keyword results without duplicates', () => {
    const result = reciprocalRankFusion(
      ['exact', 'both'],
      ['paraphrase', 'both'],
    );
    expect(result[0].id).toBe('both');
    expect(result.map((r) => r.id)).toEqual(['both', 'exact', 'paraphrase']);
  });
  it('restores embedding response order using explicit indexes', async () => {
    const vector = (n: number) => [
      n,
      ...Array(EMBEDDING_DIMENSIONS - 1).fill(0),
    ];
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () =>
        JSON.stringify({
          data: [
            { index: 1, embedding: vector(0.5) },
            { index: 0, embedding: vector(1) },
          ],
        }),
    } as any);
    expect(
      (
        await new EmbeddingsClient().embed(
          'synthetic-key',
          'text-embedding-3-small',
          ['one', 'two'],
        )
      )[0][0],
    ).toBe(1);
  });
  it.each(['duplicate', 'wrong-size', 'nonfinite', 'zero'])(
    'rejects malformed vectors: %s',
    async (kind) => {
      let embedding = [1, ...Array(EMBEDDING_DIMENSIONS - 1).fill(0)];
      if (kind === 'wrong-size') embedding = [1];
      if (kind === 'nonfinite') embedding[0] = Number.NaN;
      if (kind === 'zero') embedding = Array(EMBEDDING_DIMENSIONS).fill(0);
      const data = [{ index: 0, embedding }];
      if (kind === 'duplicate') data.push({ index: 0, embedding });
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValue({
          ok: true,
          text: async () => JSON.stringify({ data }),
        } as any);
      await expect(
        new EmbeddingsClient().embed(
          'synthetic-key',
          'text-embedding-3-small',
          ['one'],
        ),
      ).rejects.toThrow('invalid embedding');
    },
  );
  it('does not contact OpenAI for invalid input or expose provider error text', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    await expect(
      new EmbeddingsClient().embed('synthetic-key', 'unrecognized-model', [
        'one',
      ]),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'synthetic-key',
    } as any);
    await expect(
      new EmbeddingsClient().embed('synthetic-key', 'text-embedding-3-small', [
        'one',
      ]),
    ).rejects.toThrow('Embedding provider request failed (401)');
  });
});
