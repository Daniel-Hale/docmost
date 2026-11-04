import api from "@/lib/api-client";

export type AiSettings = {
  enabled: boolean;
  configured: boolean;
  model: string;
  semanticEnabled: boolean;
  embeddingModel: string;
};
export type AiMode = "ask" | "summarize" | "improve" | "draft";
export type AiAnswer = {
  answer: string;
  sources: { id: string; title: string; url: string }[];
};
export type AiSearchResult = {
  items: {
    id: string;
    title: string;
    url: string;
    excerpt: string;
    score: number;
    kind: "keyword" | "semantic" | "hybrid";
  }[];
  mode: "hybrid" | "keyword";
  notice?: string;
};
export type AiIndexStatus = {
  eligiblePages: number;
  indexedPages: number;
  failedPages: number;
  pendingPages: number;
  active: boolean;
  lastError?: string;
};
export const getAiSettings = async (): Promise<AiSettings> =>
  (await api.post("/community-ai/status")).data;
export const saveAiSettings = async (settings: {
  enabled: boolean;
  model: string;
  semanticEnabled?: boolean;
  embeddingModel?: string;
  apiKey?: string;
  removeKey?: boolean;
}): Promise<AiSettings> =>
  (await api.post("/community-ai/settings", settings)).data;
export const getAiIndexStatus = async (): Promise<AiIndexStatus> =>
  (await api.post("/community-ai/index-status")).data;
export const refreshAiIndex = async (): Promise<{ queued: boolean }> =>
  (await api.post("/community-ai/index-refresh", {})).data;
export const searchDocumentation = async (
  query: string,
  spaceId?: string,
): Promise<AiSearchResult> =>
  (await api.post("/community-ai/search", { query, spaceId })).data;
export const generate = async (
  mode: AiMode,
  input: string,
  spaceId?: string,
): Promise<AiAnswer> =>
  (await api.post("/community-ai/generate", { mode, input, spaceId })).data;
export const aiError = (error: any): string =>
  error?.response?.data?.message || "AI request failed. Try again.";
