import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { summarize } from "../agents/trace.js";
import { createOpenRouterModel } from "../agents/model.js";
import type { TraceEvent } from "../agents/types.js";
import type { ConversationMessage, ConversationStore } from "../store/conversation-store.js";
import { selectSummaryBatch, SUMMARY_BATCH_SIZE } from "./summary-batch.js";

export const SUMMARIZER_PROMPT = `Comprima o trecho de conversa a seguir em no máximo 150 tokens, preservando
obrigatoriamente: decisões tomadas, fatos estabelecidos (nomes, datas, prazos, preferências), incidentes abertos/
resolvidos e pendências abertas. Descarte cumprimentos e conversa social. Se houver um resumo anterior, incorporeo a.
Responda só o resumo, em tópicos telegráficos`;

/** @deprecated Use SUMMARIZER_PROMPT */
export const SUMMARY_SYSTEM_PROMPT = SUMMARIZER_PROMPT;

export type HistorySummarizer = (input: {
  previousSummary: string;
  batch: readonly ConversationMessage[];
}) => Promise<string>;

const textOf = (content: unknown): string =>
  typeof content === "string" ? content : JSON.stringify(content);

const formatBatchForPrompt = (batch: readonly ConversationMessage[]): string =>
  batch.map((message) => `${message.role}: ${message.content}`).join("\n");

export const createHistorySummarizer = (
  model = createOpenRouterModel(),
): HistorySummarizer => async ({ previousSummary, batch }) => {
  const previous = previousSummary.trim();
  const human = [
    previous ? `Resumo anterior:\n${previous}` : "Resumo anterior: (nenhum)",
    "",
    "Trecho de conversa:",
    formatBatchForPrompt(batch),
  ].join("\n");

  const result = await model.invoke([new SystemMessage(SUMMARIZER_PROMPT), new HumanMessage(human)]);
  const summary = textOf(result.content).trim();
  if (!summary) throw new Error("History summarizer returned empty summary");
  return summary;
};

export type FakeHistorySummarizer = HistorySummarizer & {
  calls: Array<{ previousSummary: string; batch: ConversationMessage[] }>;
};

export const createFakeHistorySummarizer = (): FakeHistorySummarizer => {
  const calls: FakeHistorySummarizer["calls"] = [];
  const fn: HistorySummarizer = async ({ previousSummary, batch }) => {
    calls.push({ previousSummary, batch: batch.map((message) => ({ ...message })) });
    const batchText = batch.map((message) => `${message.role}:${message.content}`).join("|");
    return previousSummary.trim()
      ? `MERGE:${previousSummary.trim()}+${batchText}`
      : `NEW:${batchText}`;
  };
  return Object.assign(fn, { calls });
};

export type MaybeSummarizeResult = {
  summary: string;
  event: TraceEvent;
};

export type MaybeSummarizeArgs = {
  conversations: ConversationStore;
  conversationId: string;
  summarizer: HistorySummarizer;
  onError?: (error: unknown) => void;
};

/** After a turn's appends: if a full batch is eligible, merge/persist and return a summarize trace event. */
export const maybeSummarizeAfterTurn = async (
  args: MaybeSummarizeArgs,
): Promise<MaybeSummarizeResult | undefined> => {
  const { conversations, conversationId, summarizer, onError = (error) => console.error(error) } = args;
  try {
    const total = conversations.messageCount(conversationId);
    const record = conversations.getSummary(conversationId);
    const coveredCount = record?.coveredCount ?? 0;
    const selection = selectSummaryBatch({ totalMessages: total, coveredCount });
    if (!selection) return undefined;

    const batch = conversations.messagesAscending(conversationId, selection.offset, selection.limit);
    if (batch.length !== SUMMARY_BATCH_SIZE) return undefined;

    const next = (await summarizer({
      previousSummary: record?.summary ?? "",
      batch,
    })).trim();
    if (!next) throw new Error("History summarizer returned empty summary");

    conversations.upsertSummary(conversationId, next, coveredCount + SUMMARY_BATCH_SIZE);
    return { summary: next, event: summarize(next) };
  } catch (error) {
    onError(error);
    return undefined;
  }
};
