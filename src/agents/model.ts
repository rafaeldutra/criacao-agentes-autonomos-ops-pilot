import { ChatOpenAI } from "@langchain/openai";

export const createOpenRouterModel = (): ChatOpenAI => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required");
  if (!model) throw new Error("OPENROUTER_MODEL is required");
  return new ChatOpenAI({
    apiKey,
    model,
    temperature: 0,
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
  });
};
