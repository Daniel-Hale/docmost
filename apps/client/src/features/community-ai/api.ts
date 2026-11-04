import api from "@/lib/api-client";

export type AiSettings = {
  enabled: boolean;
  configured: boolean;
  model: string;
};
export type AiMode = "ask" | "summarize" | "improve" | "draft";
export type AiAnswer = {
  answer: string;
  sources: { id: string; title: string; url: string }[];
};
export const getAiSettings = async (): Promise<AiSettings> =>
  (await api.post("/community-ai/status")).data;
export const saveAiSettings = async (settings: {
  enabled: boolean;
  model: string;
  apiKey?: string;
  removeKey?: boolean;
}): Promise<AiSettings> =>
  (await api.post("/community-ai/settings", settings)).data;
export const generate = async (
  mode: AiMode,
  input: string,
  spaceId?: string,
): Promise<AiAnswer> =>
  (await api.post("/community-ai/generate", { mode, input, spaceId })).data;
export const aiError = (error: any): string =>
  error?.response?.data?.message || "AI request failed. Try again.";
