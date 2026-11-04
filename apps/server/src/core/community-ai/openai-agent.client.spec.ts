import { OpenAiAgentClient } from './openai-agent.client';

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });
const allowedTools = [
  { type: 'web_search' },
  {
    type: 'mcp',
    server_label: 'Microsoft CIPP',
    transport: { type: 'http', server_url: 'https://docs.cipp.app/mcp' },
  },
];
const createdSession = (status = 'idle') =>
  response({ id: 'sess_abc123', status, agent: { tools: allowedTools } });
const savedAgent = () =>
  response({
    id: 'agent_abc123',
    model: 'gpt-6-luna',
    tools: allowedTools,
  });

describe('OpenAiAgentClient', () => {
  let client: OpenAiAgentClient;
  const fetchMock = jest.fn();

  beforeEach(() => {
    client = new OpenAiAgentClient();
    jest.spyOn(globalThis, 'fetch').mockImplementation(fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => jest.restoreAllMocks());

  it('returns only bounded public agent metadata and strips URLs to HTTPS hosts', async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        id: 'agent_abc123',
        name: 'Company research',
        model: 'gpt-6-luna',
        instructions: 'private instructions',
        tools: [
          { type: 'web_search' },
          {
            type: 'mcp',
            server_label: 'Microsoft CIPP',
            credential_id: null,
            transport: {
              type: 'http',
              server_url: 'https://docs.cipp.app/mcp',
            },
          },
        ],
      }),
    );

    const metadata = await client.inspect('sk-test-secret', 'agent_abc123');

    expect(metadata).toEqual({
      id: 'agent_abc123',
      name: 'Company research',
      model: 'gpt-6-luna',
      tools: [
        { type: 'web_search', label: 'Web search', host: null },
        { type: 'mcp', label: 'Microsoft CIPP', host: 'docs.cipp.app' },
      ],
    });
    expect(JSON.stringify(metadata)).not.toMatch(/private|secret|pass|token/i);
  });

  it('waits for a completed root turn and returns only its final answer', async () => {
    fetchMock
      .mockResolvedValueOnce(savedAgent())
      .mockResolvedValueOnce(createdSession())
      .mockResolvedValueOnce(response({ id: 'sess_abc123', status: 'idle' }))
      .mockResolvedValueOnce(
        response({
          data: [
            { id: 'turn_abc123', status: 'in_progress', subagent_id: null },
          ],
        }),
      )
      .mockResolvedValueOnce(response({ id: 'sess_abc123', status: 'idle' }))
      .mockResolvedValueOnce(
        response({
          data: [{ id: 'turn_abc123', status: 'completed', subagent_id: null }],
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: [
            {
              type: 'message',
              role: 'assistant',
              turn_id: 'turn_abc123',
              phase: 'commentary',
              status: 'completed',
              content: [{ type: 'output_text', text: 'not final' }],
            },
            {
              type: 'web_search_call',
              turn_id: 'turn_abc123',
              status: 'completed',
            },
            {
              type: 'mcp_call',
              turn_id: 'turn_abc123',
              server_label: 'Microsoft CIPP',
              status: 'completed',
              error: null,
              output:
                '{"results":[{"title":"CIPP docs","contentUrl":"https://docs.cipp.app/guide"}]}',
            },
            {
              type: 'mcp_call',
              turn_id: 'turn_abc123',
              server_label: 'Microsoft CIPP',
              status: 'completed',
              error: null,
              output: 'Unstructured text [Raw](https://raw.example/doc).',
            },
            {
              type: 'mcp_call',
              turn_id: 'turn_abc123',
              server_label: 'Microsoft CIPP',
              status: 'completed',
              error: null,
              output: {
                _meta: {
                  noise: Array(600).fill({
                    url: 'https://metadata.example/irrelevant',
                  }),
                },
                content: [
                  {
                    type: 'text',
                    text: '{"results":[{"title":"Conditional Access","contentUrl":"https://learn.microsoft.com/entra/identity/conditional-access/overview"}]}',
                  },
                ],
                structuredContent: {
                  results: [
                    {
                      title: 'Conditional Access',
                      contentUrl:
                        'https://learn.microsoft.com/entra/identity/conditional-access/overview',
                    },
                  ],
                },
              },
            },
            {
              type: 'message',
              role: 'assistant',
              turn_id: 'turn_abc123',
              phase: 'final_answer',
              status: 'completed',
              content: [
                {
                  type: 'output_text',
                  text: 'Result https://docs.cipp.app/guide [Conditional Access](https://learn.microsoft.com/entra/identity/conditional-access/overview) [Source](https://example.test/doc) [Unverified](https://unverified.example/doc) [Raw](https://raw.example/doc).',
                  annotations: [
                    {
                      type: 'url_citation',
                      title: 'Source',
                      url: 'https://example.test/doc',
                    },
                  ],
                },
              ],
            },
            {
              type: 'message',
              role: 'assistant',
              turn_id: 'turn_other',
              phase: 'final_answer',
              status: 'completed',
              content: [{ type: 'output_text', text: 'Wrong turn.' }],
            },
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(response({ id: 'sess_abc123', deleted: true }));

    const result = await client.run(
      'sk-test-secret',
      'agent_abc123',
      'Question?',
    );

    expect(result).toEqual({
      answer:
        'Result https://docs.cipp.app/guide [Conditional Access](https://learn.microsoft.com/entra/identity/conditional-access/overview) [Source](https://example.test/doc) [Unverified](https://unverified.example/doc) [Raw](https://raw.example/doc).',
      externalSources: [
        {
          title: 'Conditional Access',
          url: 'https://learn.microsoft.com/entra/identity/conditional-access/overview',
        },
        { title: 'Source', url: 'https://example.test/doc' },
        { title: 'CIPP docs', url: 'https://docs.cipp.app/guide' },
      ],
      toolsUsed: ['Microsoft CIPP'],
    });
    const createCall = fetchMock.mock.calls[1];
    expect(createCall[0]).toBe('https://api.openai.com/v1/agents/sessions');
    expect(JSON.parse(createCall[1].body)).toEqual({
      agent_id: 'agent_abc123',
      environment: { type: 'none' },
      input: 'Question?',
      stream: false,
    });
    expect(createCall[1].headers['OpenAI-Beta']).toBe('agents=v1');
    expect(fetchMock).toHaveBeenCalledTimes(8);
  });

  it('cancels and deletes sessions that stop for unsupported required action', async () => {
    fetchMock
      .mockResolvedValueOnce(savedAgent())
      .mockResolvedValueOnce(createdSession('in_progress'))
      .mockResolvedValueOnce(
        response({
          id: 'sess_abc123',
          status: 'requires_action',
          required_actions: [{ type: 'function_call' }],
        }),
      )
      .mockResolvedValueOnce(response({ ok: true }))
      .mockResolvedValueOnce(response({ id: 'sess_abc123', deleted: true }));

    await expect(
      client.run('sk-do-not-leak', 'agent_abc123', 'Question?'),
    ).rejects.toThrow('Agent run could not be completed');

    expect(fetchMock.mock.calls[3][0]).toBe(
      'https://api.openai.com/v1/agents/sessions/sess_abc123/events',
    );
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({
      events: [{ type: 'agent.session.input.cancel' }],
    });
    expect(fetchMock.mock.calls[4][0]).toBe(
      'https://api.openai.com/v1/agents/sessions/sess_abc123',
    );
  });

  it('reconciles one delete conflict and retries session deletion once', async () => {
    fetchMock
      .mockResolvedValueOnce(savedAgent())
      .mockResolvedValueOnce(createdSession())
      .mockResolvedValueOnce(response({ id: 'sess_abc123', status: 'idle' }))
      .mockResolvedValueOnce(
        response({
          data: [{ id: 'turn_abc123', status: 'completed', subagent_id: null }],
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: [
            {
              type: 'message',
              role: 'assistant',
              turn_id: 'turn_abc123',
              phase: 'final_answer',
              status: 'completed',
              content: [{ type: 'output_text', text: 'Done.' }],
            },
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(response({ error: 'busy' }, 409))
      .mockResolvedValueOnce(response({ id: 'sess_abc123', status: 'idle' }))
      .mockResolvedValueOnce(response({ id: 'sess_abc123', deleted: true }));

    await expect(
      client.run('sk-test-secret', 'agent_abc123', 'Question?'),
    ).resolves.toEqual({ answer: 'Done.' });
    expect(
      fetchMock.mock.calls.filter((call) => call[1].method === 'DELETE'),
    ).toHaveLength(2);
  });

  it('reports an undeleted session id without exposing the key or provider body', async () => {
    fetchMock
      .mockResolvedValueOnce(savedAgent())
      .mockResolvedValueOnce(createdSession('in_progress'))
      .mockResolvedValueOnce(
        response({
          id: 'sess_abc123',
          status: 'requires_action',
          required_actions: [{}],
        }),
      )
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ error: 'sk-do-not-leak' }, 500));

    let captured: any;
    try {
      await client.run('sk-do-not-leak', 'agent_abc123', 'Question?');
    } catch (error) {
      captured = error;
    }
    expect(captured).toMatchObject({
      code: 'cleanup_failed',
      sessionId: 'sess_abc123',
    });
    expect(captured.message).not.toContain('sk-do-not-leak');
    expect(captured.message).not.toContain('provider body');
  });

  it('does not retry session creation after a provider failure and never exposes credentials', async () => {
    fetchMock.mockResolvedValueOnce(savedAgent());
    fetchMock.mockResolvedValueOnce(
      response({ message: 'sk-do-not-leak' }, 500),
    );

    await expect(
      client.run('sk-do-not-leak', 'agent_abc123', 'Question?'),
    ).rejects.toThrow('Agent run could not be completed');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('fails closed before session creation when saved agent has unsupported tools', async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        id: 'agent_abc123',
        model: 'gpt-6-luna',
        tools: [{ type: 'function', name: 'do_work' }],
      }),
    );

    await expect(
      client.run('sk-test-secret', 'agent_abc123', 'Question?'),
    ).rejects.toThrow('Agent run could not be completed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects an unapproved MCP host before sending the question', async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        id: 'agent_abc123',
        model: 'gpt-6-luna',
        tools: [
          {
            type: 'mcp',
            server_label: 'Microsoft CIPP',
            transport: {
              type: 'http',
              server_url: 'https://attacker.example/mcp',
            },
          },
        ],
      }),
    );

    await expect(
      client.run('sk-test-secret', 'agent_abc123', 'Private question'),
    ).rejects.toThrow('Agent run could not be completed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('applies the same unsupported-tool checks to metadata inspection', async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        id: 'agent_abc123',
        model: 'gpt-6-luna',
        tools: [{ type: 'function', name: 'private_tool' }],
      }),
    );

    await expect(
      client.inspect('sk-test-secret', 'agent_abc123'),
    ).rejects.toThrow('Agent request failed');
  });

  it.each([
    [
      'saved-agent vault IDs',
      (agent: any) => (agent.vault_ids = ['vault_abc123']),
    ],
    [
      'tool authorization',
      (agent: any) => (agent.tools[1].authorization = 'secret'),
    ],
    [
      'tool vault IDs',
      (agent: any) => (agent.tools[1].vault_ids = ['vault_abc123']),
    ],
    [
      'transport authorization',
      (agent: any) => (agent.tools[1].transport.authorization = 'secret'),
    ],
  ])('rejects %s before submitting the input', async (_label, addAuth) => {
    const agent = {
      id: 'agent_abc123',
      model: 'gpt-6-luna',
      tools: structuredClone(allowedTools),
    };
    addAuth(agent);
    fetchMock.mockResolvedValueOnce(response(agent));

    await expect(
      client.run('sk-test-secret', 'agent_abc123', 'Question?'),
    ).rejects.toThrow('Agent run could not be completed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('disables all inherited tools when requested while keeping saved-agent inheritance', async () => {
    fetchMock
      .mockResolvedValueOnce(savedAgent())
      .mockResolvedValueOnce(
        response({ id: 'sess_abc123', status: 'idle', agent: { tools: [] } }),
      )
      .mockResolvedValueOnce(response({ id: 'sess_abc123', status: 'idle' }))
      .mockResolvedValueOnce(
        response({
          data: [{ id: 'turn_abc123', status: 'completed', subagent_id: null }],
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: [
            {
              type: 'message',
              role: 'assistant',
              turn_id: 'turn_abc123',
              phase: 'final_answer',
              status: 'completed',
              content: [{ type: 'output_text', text: 'Internal answer.' }],
            },
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(response({ id: 'sess_abc123', deleted: true }));

    await expect(
      client.run('sk-test-secret', 'agent_abc123', 'Internal request', {
        disableTools: true,
      }),
    ).resolves.toEqual({ answer: 'Internal answer.' });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      agent_id: 'agent_abc123',
      agent: { tools: [] },
      environment: { type: 'none' },
      input: 'Internal request',
      stream: false,
    });
  });

  it('fails closed if a tools-disabled session emits any tool call item', async () => {
    fetchMock
      .mockResolvedValueOnce(savedAgent())
      .mockResolvedValueOnce(
        response({ id: 'sess_abc123', status: 'idle', agent: { tools: [] } }),
      )
      .mockResolvedValueOnce(response({ id: 'sess_abc123', status: 'idle' }))
      .mockResolvedValueOnce(
        response({
          data: [{ id: 'turn_abc123', status: 'completed', subagent_id: null }],
        }),
      )
      .mockResolvedValueOnce(
        response({
          data: [
            {
              type: 'web_search_call',
              turn_id: 'turn_abc123',
              status: 'failed',
              error: { message: 'do not expose' },
            },
            {
              type: 'message',
              role: 'assistant',
              turn_id: 'turn_abc123',
              phase: 'final_answer',
              status: 'completed',
              content: [{ type: 'output_text', text: 'Answer.' }],
            },
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(response({}))
      .mockResolvedValueOnce(response({ id: 'sess_abc123', deleted: true }));

    await expect(
      client.run('sk-test-secret', 'agent_abc123', 'Question?', {
        disableTools: true,
      }),
    ).rejects.toThrow('Agent run could not be completed');
  });
});
