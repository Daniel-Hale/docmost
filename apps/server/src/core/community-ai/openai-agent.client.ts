import { isIP } from 'node:net';

const API_ROOT = 'https://api.openai.com/v1';
const BETA_HEADER = 'agents=v1';
const REQUEST_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_500;
const MAX_POLLS = 60;
const MAX_METADATA_BYTES = 1_000_000;
const MAX_ITEM_PAGE_BYTES = 4_000_000;
const MAX_ITEM_PAGES = 3;
const MAX_INPUT_BYTES = 200_000;
const MAX_ANSWER_BYTES = 32_000;

export type AgentToolSummary = {
  type: string;
  label: string;
  host: string | null;
};

export type OpenAiAgentMetadata = {
  id: string;
  name: string | null;
  model: string;
  tools: AgentToolSummary[];
};

export type OpenAiAgentRunResult = {
  answer: string;
  externalSources?: Array<{ title: string; url: string }>;
  toolsUsed?: string[];
  notice?: string;
};
export type AgentRunOptions = { disableTools?: boolean };

export class OpenAiAgentClientError extends Error {
  constructor(
    message: string,
    readonly code: 'request_failed' | 'run_failed' | 'cleanup_failed',
    readonly sessionId?: string,
  ) {
    super(message);
    this.name = 'OpenAiAgentClientError';
  }
}

class AgentHttpError extends Error {
  constructor(readonly status: number) {
    super('Agent API request failed');
  }
}

export class OpenAiAgentClient {
  async inspect(key: string, agentId: string): Promise<OpenAiAgentMetadata> {
    this.validateInputs(key, agentId);
    try {
      const agent = await this.loadAgent(key, agentId);
      assertSupportedTools(agent);
      return {
        id: agentId,
        name: cleanLabel(agent.name, 120) || null,
        model: cleanLabel(agent.model, 80),
        tools: summarizeTools(agent.tools),
      };
    } catch {
      throw new OpenAiAgentClientError(
        'Agent request failed',
        'request_failed',
      );
    }
  }

  async run(
    key: string,
    agentId: string,
    input: string,
    options: AgentRunOptions = {},
  ): Promise<OpenAiAgentRunResult> {
    this.validateInputs(key, agentId);
    if (
      typeof input !== 'string' ||
      !input.trim() ||
      Buffer.byteLength(input, 'utf8') > MAX_INPUT_BYTES
    ) {
      throw new OpenAiAgentClientError(
        'Agent request failed',
        'request_failed',
      );
    }

    const deadline = Date.now() + RUN_TIMEOUT_MS;
    let sessionId: string | undefined;
    let result: OpenAiAgentRunResult | undefined;
    let failed = false;

    try {
      const savedAgent = await this.loadAgent(key, agentId, deadline);
      assertSupportedTools(savedAgent);
      const requestBody: Record<string, unknown> = {
        agent_id: agentId,
        environment: { type: 'none' },
        input,
        stream: false,
      };
      if (options.disableTools) requestBody.agent = { tools: [] };
      const session = await this.requestJson(
        key,
        '/agents/sessions',
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
        },
        MAX_METADATA_BYTES,
        deadline,
      );
      if (isRecord(session) && validId(session.id, 'sess'))
        sessionId = session.id;
      if (!sessionId) throw new Error();

      if (Array.isArray(session.vault_ids) && session.vault_ids.length > 0)
        throw new Error();
      if (!isRecord(session.agent)) throw new Error();
      assertSupportedTools(session.agent);
      const tools = summarizeTools(session.agent.tools);
      if (options.disableTools && tools.length > 0) throw new Error();
      const completed = await this.waitForRootTurn(key, sessionId, deadline);
      const items = await this.listTurnItems(
        key,
        sessionId,
        completed.id,
        deadline,
      );
      const final = finalAnswer(items, completed.id);
      if (!final || Buffer.byteLength(final.text, 'utf8') > MAX_ANSWER_BYTES) {
        throw new Error();
      }
      const answer = final.text;
      const toolsUsed = toolsUsedBy(items, tools, completed.id);
      if (
        options.disableTools &&
        items.some(
          (item) => item.type === 'mcp_call' || item.type === 'web_search_call',
        )
      ) {
        throw new Error();
      }
      const webSearchCompleted = items.some(
        (item) =>
          item.type === 'web_search_call' &&
          item.status === 'completed' &&
          item.error == null &&
          item.turn_id === completed.id,
      );
      const externalSources = parseExternalSources(answer, [
        ...(webSearchCompleted ? final.sources : []),
        ...items
          .filter(
            (item) =>
              item.type === 'mcp_call' &&
              item.status === 'completed' &&
              item.error == null &&
              item.turn_id === completed.id,
          )
          .flatMap((item) => [
            ...structuredSources(item.output ?? item.result),
            ...(tools.some(
              (tool) =>
                tool.type === 'mcp' &&
                tool.label === item.server_label &&
                tool.host === 'docs.cipp.app',
            )
              ? cippMarkdownSources(item.output ?? item.result)
              : []),
          ]),
      ]);
      result = {
        answer,
        ...(externalSources.length ? { externalSources } : {}),
        ...(toolsUsed.length ? { toolsUsed } : {}),
      };
    } catch {
      failed = true;
    }

    if (sessionId) {
      const deleted = await this.cleanupSession(key, sessionId, failed);
      if (!deleted) {
        throw new OpenAiAgentClientError(
          'Agent session cleanup could not be confirmed',
          'cleanup_failed',
          sessionId,
        );
      }
    }
    if (failed || !result) {
      throw new OpenAiAgentClientError(
        'Agent run could not be completed',
        'run_failed',
        sessionId,
      );
    }
    return result;
  }

  private validateInputs(key: string, agentId: string): void {
    if (
      typeof key !== 'string' ||
      !key.trim() ||
      key.length > 4096 ||
      !validId(agentId, 'agent')
    ) {
      throw new OpenAiAgentClientError(
        'Agent request failed',
        'request_failed',
      );
    }
  }

  private async loadAgent(
    key: string,
    agentId: string,
    deadline?: number,
  ): Promise<Record<string, any>> {
    const agent = await this.getJson(
      key,
      `/agents/${encodeURIComponent(agentId)}`,
      MAX_METADATA_BYTES,
      deadline,
    );
    if (
      !isRecord(agent) ||
      agent.id !== agentId ||
      typeof agent.model !== 'string'
    ) {
      throw new Error();
    }
    return agent;
  }

  private async waitForRootTurn(
    key: string,
    sessionId: string,
    deadline: number,
  ): Promise<Record<string, any>> {
    for (let poll = 0; poll < MAX_POLLS && Date.now() < deadline; poll += 1) {
      const session = await this.getJson(
        key,
        `/agents/sessions/${encodeURIComponent(sessionId)}`,
        MAX_METADATA_BYTES,
        deadline,
      );
      if (!isRecord(session)) throw new Error();
      if (
        session.status === 'failed' ||
        session.status === 'cancelled' ||
        session.status === 'requires_action' ||
        (Array.isArray(session.required_actions) &&
          session.required_actions.length > 0)
      ) {
        throw new Error();
      }

      const turns = await this.getJson(
        key,
        `/agents/sessions/${encodeURIComponent(sessionId)}/turns?limit=100&order=desc`,
        MAX_METADATA_BYTES,
        deadline,
      );
      const roots = Array.isArray(turns?.data)
        ? turns.data.filter(
            (turn: unknown) => isRecord(turn) && turn.subagent_id == null,
          )
        : [];
      const root = roots[0] as Record<string, any> | undefined;
      if (
        root?.status === 'failed' ||
        root?.status === 'cancelled' ||
        root?.status === 'requires_action'
      ) {
        throw new Error();
      }
      if (root?.status === 'completed' && validId(root.id, 'turn')) return root;
      await delay(
        Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())),
      );
    }
    throw new Error();
  }

  private async listTurnItems(
    key: string,
    sessionId: string,
    turnId: string,
    deadline: number,
  ): Promise<Record<string, any>[]> {
    const items: Record<string, any>[] = [];
    let after: string | undefined;
    for (let pageIndex = 0; pageIndex < MAX_ITEM_PAGES; pageIndex += 1) {
      const query = new URLSearchParams({ limit: '100', order: 'asc' });
      if (after) query.set('after', after);
      const page = await this.getJson(
        key,
        `/agents/sessions/${encodeURIComponent(sessionId)}/turns/${encodeURIComponent(turnId)}/items?${query}`,
        MAX_ITEM_PAGE_BYTES,
        deadline,
      );
      if (
        !Array.isArray(page?.data) ||
        page.data.some((item: unknown) => !isRecord(item))
      ) {
        throw new Error();
      }
      items.push(...page.data);
      if (items.length > MAX_ITEM_PAGES * 100) throw new Error();
      if (!page.has_more) return items;
      const last = page.last_id ?? page.data.at(-1)?.id;
      if (typeof last !== 'string' || !last || last === after)
        throw new Error();
      after = last;
    }
    throw new Error();
  }

  private async cleanupSession(
    key: string,
    sessionId: string,
    cancel: boolean,
  ): Promise<boolean> {
    if (cancel) await this.cancelTurn(key, sessionId);
    const first = await this.deleteSession(key, sessionId);
    if (first === 'deleted') return true;
    if (first !== 'conflict') return false;

    const reconcileDeadline = Date.now() + 8_000;
    let cancelSent = false;
    while (Date.now() < reconcileDeadline) {
      try {
        const session = await this.getJson(
          key,
          `/agents/sessions/${encodeURIComponent(sessionId)}`,
          MAX_METADATA_BYTES,
          reconcileDeadline,
        );
        if (!isRecord(session) || !isActive(session.status)) break;
        if (!cancelSent) {
          await this.cancelTurn(key, sessionId, reconcileDeadline);
          cancelSent = true;
        }
      } catch {
        break;
      }
      await delay(Math.min(500, Math.max(0, reconcileDeadline - Date.now())));
    }
    return (await this.deleteSession(key, sessionId)) === 'deleted';
  }

  private async cancelTurn(
    key: string,
    sessionId: string,
    deadline?: number,
  ): Promise<void> {
    try {
      await this.requestRaw(
        key,
        `/agents/sessions/${encodeURIComponent(sessionId)}/events`,
        {
          method: 'POST',
          body: JSON.stringify({
            events: [{ type: 'agent.session.input.cancel' }],
          }),
        },
        deadline ?? Date.now() + REQUEST_TIMEOUT_MS,
      );
    } catch {
      // Deletion is still attempted; any orphan is surfaced by cleanupSession.
    }
  }

  private async deleteSession(
    key: string,
    sessionId: string,
  ): Promise<'deleted' | 'conflict' | 'failed'> {
    try {
      const response = await this.requestRaw(
        key,
        `/agents/sessions/${encodeURIComponent(sessionId)}`,
        { method: 'DELETE' },
        Date.now() + REQUEST_TIMEOUT_MS,
        [404, 409],
      );
      if (
        (response.status >= 200 && response.status < 300) ||
        response.status === 404
      ) {
        await response.body?.cancel().catch(() => undefined);
        return 'deleted';
      }
      await response.body?.cancel().catch(() => undefined);
      return response.status === 409 ? 'conflict' : 'failed';
    } catch {
      return 'failed';
    }
  }

  private getJson(
    key: string,
    path: string,
    maxBytes: number,
    deadline?: number,
  ): Promise<any> {
    return this.requestJson(key, path, { method: 'GET' }, maxBytes, deadline);
  }

  private async requestJson(
    key: string,
    path: string,
    init: RequestInit,
    maxBytes: number,
    deadline?: number,
  ): Promise<any> {
    const response = await this.requestRaw(key, path, init, deadline);
    const body = await readBoundedBody(response, maxBytes);
    try {
      return JSON.parse(body);
    } catch {
      throw new Error('Invalid agent response');
    }
  }

  private async requestRaw(
    key: string,
    path: string,
    init: RequestInit,
    deadline?: number,
    allowedStatuses: number[] = [],
  ): Promise<Response> {
    const remaining = deadline ? deadline - Date.now() : REQUEST_TIMEOUT_MS;
    if (remaining <= 0) throw new Error('Agent request timeout');
    const timeout = Math.min(REQUEST_TIMEOUT_MS, remaining);
    try {
      const response = await fetch(`${API_ROOT}${path}`, {
        ...init,
        signal: AbortSignal.timeout(timeout),
        redirect: 'error',
        headers: {
          Authorization: `Bearer ${key}`,
          'OpenAI-Beta': BETA_HEADER,
          'Content-Type': 'application/json',
          ...init.headers,
        },
      });
      if (!response.ok && !allowedStatuses.includes(response.status)) {
        await response.body?.cancel().catch(() => undefined);
        throw new AgentHttpError(response.status);
      }
      return response;
    } catch (error) {
      if (error instanceof AgentHttpError) throw error;
      throw new Error('Agent request failed');
    }
  }
}

async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<string> {
  const declaredLength = Number(response.headers.get('content-length') ?? 0);
  if (declaredLength > maxBytes || !response.body) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('Invalid agent response');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('Invalid agent response');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function summarizeTools(raw: unknown): AgentToolSummary[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 200).flatMap((tool: unknown) => {
    if (!isRecord(tool) || typeof tool.type !== 'string') return [];
    const type = /^[a-z0-9_-]{1,40}$/i.test(tool.type) ? tool.type : 'other';
    if (type === 'web_search')
      return [{ type, label: 'Web search', host: null }];
    if (type === 'mcp') {
      const transport = isRecord(tool.transport) ? tool.transport : {};
      let host: string | null = null;
      try {
        const url = new URL(String(transport.server_url ?? ''));
        if (
          url.protocol === 'https:' &&
          !url.port &&
          isPublicHost(url.hostname)
        ) {
          host = url.hostname.slice(0, 200);
        }
      } catch {
        // A malformed or non-HTTPS transport never exposes a host.
      }
      return [
        {
          type,
          label: cleanLabel(tool.server_label, 100) || 'Connected service',
          host,
        },
      ];
    }
    const labels: Record<string, string> = {
      service_http: 'Connected service',
      function: 'Function tool',
      automations: 'Automations',
      browser: 'Browser',
      computer_use: 'Computer use',
      code_interpreter: 'Code interpreter',
      file_search: 'File search',
    };
    return [{ type, label: labels[type] ?? 'Other tool', host: null }];
  });
}

function finalAnswer(
  items: Record<string, any>[],
  turnId: string,
):
  | { text: string; sources: Array<{ title: string; url: string }> }
  | undefined {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index];
    if (
      item.type !== 'message' ||
      item.role !== 'assistant' ||
      item.phase !== 'final_answer' ||
      item.status !== 'completed' ||
      item.turn_id !== turnId ||
      !Array.isArray(item.content)
    ) {
      continue;
    }
    const parts = item.content.filter(
      (part: unknown) =>
        isRecord(part) &&
        part.type === 'output_text' &&
        typeof part.text === 'string',
    );
    const answer = parts
      .map((part: { text: string }) => part.text)
      .join('')
      .trim();
    if (answer) {
      const sources = parts.flatMap((part: Record<string, any>) =>
        Array.isArray(part.annotations)
          ? part.annotations
              .filter(
                (annotation: unknown) =>
                  isRecord(annotation) && annotation.type === 'url_citation',
              )
              .map((annotation: any) =>
                safeSource(annotation.title, annotation.url),
              )
              .filter(Boolean)
          : [],
      );
      return { text: answer, sources };
    }
  }
  return undefined;
}

function toolsUsedBy(
  items: Record<string, any>[],
  tools: AgentToolSummary[],
  turnId: string,
): string[] {
  const used = new Set<string>();
  for (const item of items) {
    if (
      item.status !== 'completed' ||
      item.error != null ||
      item.turn_id !== turnId
    )
      continue;
    if (item.type === 'mcp_call') {
      const server = cleanLabel(item.server_label, 100);
      const tool = tools.find(
        (candidate) => candidate.type === 'mcp' && candidate.label === server,
      );
      used.add(tool?.label ?? 'Connected service');
    }
  }
  return [...used].slice(0, 20);
}

function parseExternalSources(
  answer: string,
  proven: Array<{ title: string; url: string }>,
): Array<{ title: string; url: string }> {
  const sources: Array<{ title: string; url: string }> = [];
  const seen = new Set<string>();
  const provenance = new Map(
    proven.map((source) => [source.url, source.title]),
  );
  const links = /\[([^\]\r\n]{1,200})\]\((https:\/\/[^\s)<>]{1,2048})\)/g;
  for (const match of answer.matchAll(links)) {
    if (sources.length >= 10) break;
    try {
      const candidate = safeSource(match[1], match[2]);
      if (!candidate) continue;
      const normalized = candidate.url;
      if (!provenance.has(normalized)) continue;
      const sourceTitle = provenance.get(normalized);
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      sources.push({
        title: cleanLabel(sourceTitle, 160) || candidate.title,
        url: normalized,
      });
    } catch {
      // Ignore malformed links.
    }
  }
  const bareUrls = /https:\/\/[^\s<>"'\]]+/gi;
  for (const match of answer.matchAll(bareUrls)) {
    if (sources.length >= 10) break;
    const value = match[0].replace(/[.,!?;:]+$/g, '');
    const candidate = safeSource(value, value);
    if (!candidate || !provenance.has(candidate.url) || seen.has(candidate.url))
      continue;
    seen.add(candidate.url);
    sources.push({
      title: cleanLabel(provenance.get(candidate.url), 160) || candidate.title,
      url: candidate.url,
    });
  }
  return sources;
}

function structuredSources(
  value: unknown,
): Array<{ title: string; url: string }> {
  const found: Array<{ title: string; url: string }> = [];
  let visited = 0;
  const visit = (
    node: unknown,
    depth: number,
    parseJsonString = false,
  ): void => {
    if (depth > 6 || found.length >= 100 || visited++ >= 500) return;
    if (typeof node === 'string') {
      if (parseJsonString && Buffer.byteLength(node) <= 200_000) {
        try {
          visit(JSON.parse(node), depth + 1);
        } catch {
          // Unstructured MCP text is never treated as source provenance.
        }
      }
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node.slice(0, 100)) visit(item, depth + 1);
      return;
    }
    if (!isRecord(node)) return;
    const title = cleanLabel(node.title ?? node.name, 160);
    for (const key of [
      'url',
      'contentUrl',
      'content_url',
      'sourceUrl',
      'source_url',
    ]) {
      if (typeof node[key] === 'string') {
        const source = safeSource(title, node[key]);
        if (source) found.push(source);
      }
    }
    if (node.structuredContent) visit(node.structuredContent, depth + 1);
    if (node.content) visit(node.content, depth + 1);
    if (node.type === 'text' && typeof node.text === 'string') {
      visit(node.text, depth + 1, true);
    }
    for (const [key, child] of Object.entries(node).slice(0, 100)) {
      if (
        key !== '_meta' &&
        key !== 'structuredContent' &&
        key !== 'content' &&
        key !== 'text' &&
        typeof child === 'object'
      ) {
        visit(child, depth + 1);
      }
    }
  };
  visit(value, 0, typeof value === 'string');
  return found;
}

function cippMarkdownSources(
  value: unknown,
): Array<{ title: string; url: string }> {
  if (!isRecord(value) || !Array.isArray(value.content)) return [];
  const found: Array<{ title: string; url: string }> = [];
  for (const part of value.content.slice(0, 20)) {
    if (
      !isRecord(part) ||
      part.type !== 'text' ||
      typeof part.text !== 'string' ||
      Buffer.byteLength(part.text) > 200_000
    )
      continue;
    const heading = /^#{1,6}[ \t]+Sources[ \t]*\r?$/im.exec(part.text);
    if (!heading) continue;
    const section = part.text
      .slice(heading.index + heading[0].length)
      .split(/^#{1,6}[ \t]+/m, 1)[0];
    for (const match of section.matchAll(
      /^\s*[-*]\s+\[([^\]\r\n]{1,200})\]\((https:\/\/[^\s)<>]{1,2048})\)/gm,
    )) {
      const source = safeSource(match[1], match[2]);
      if (source && new URL(source.url).origin === 'https://docs.cipp.app')
        found.push(source);
      if (found.length >= 20) return found;
    }
  }
  return found;
}

function safeSource(
  title: unknown,
  value: unknown,
): { title: string; url: string } | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !isPublicHost(url.hostname)
    ) {
      return undefined;
    }
    // Section anchors identify the same retrieved document. Keep the origin,
    // path and query exact, while comparing citations at document scope.
    url.hash = '';
    return { title: cleanLabel(title, 160), url: url.toString() };
  } catch {
    return undefined;
  }
}

function cleanLabel(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value
        .replace(/\p{Cc}/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength)
    : '';
}

function isPublicHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    isIP(host) === 0 &&
    host !== 'localhost' &&
    !host.endsWith('.localhost') &&
    !host.endsWith('.local') &&
    !host.endsWith('.internal')
  );
}

function validId(value: unknown, prefix: string): value is string {
  return (
    typeof value === 'string' &&
    new RegExp(`^${prefix}_[A-Za-z0-9_-]{1,128}$`).test(value)
  );
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isActive(status: unknown): boolean {
  return ['in_progress', 'requires_action'].includes(String(status));
}

function assertSupportedTools(agent: unknown): void {
  if (!isRecord(agent) || !Array.isArray(agent.tools)) throw new Error();
  if (Array.isArray(agent.vault_ids) && agent.vault_ids.length > 0)
    throw new Error();
  for (const tool of agent.tools) {
    if (!isRecord(tool)) throw new Error();
    if (
      tool.authorization ||
      (Array.isArray(tool.vault_ids) && tool.vault_ids.length > 0)
    )
      throw new Error();
    if (tool.type === 'web_search') continue;
    if (
      tool.type === 'mcp' &&
      isRecord(tool.transport) &&
      tool.transport.type === 'http'
    ) {
      const transport = tool.transport;
      const headers = isRecord(transport.headers) ? transport.headers : {};
      const origin = tool.connection_origin;
      if (transport.authorization) throw new Error();
      try {
        const url = new URL(String(transport.server_url ?? ''));
        if (
          url.protocol === 'https:' &&
          !url.port &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          ['learn.microsoft.com', 'docs.cipp.app'].includes(
            url.hostname.toLowerCase(),
          ) &&
          !tool.credential_id &&
          Object.keys(headers).length === 0 &&
          (origin === undefined || origin === 'service')
        )
          continue;
      } catch {
        // Unsupported endpoint configurations fail closed.
      }
    }
    throw new Error();
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
