import { formatSummaryBlock } from "../conversation/summary-prompt.js";
import { formatMemoryBlock } from "../memory/memory-prompt.js";
import type { RecalledMemory } from "../memory/memory-store.js";
import type { ConversationMessage } from "../store/conversation-store.js";
import { estimateTokens } from "./tokens.js";

export type SectionBudget = {
  summary: number;
  window: number;
  memories: number;
};

export type ContextBuildInput = {
  system?: string;
  summary?: string;
  memories?: readonly RecalledMemory[];
  history?: readonly ConversationMessage[];
  message: string;
};

export type ContextSections = {
  system: string;
  summary: string;
  memory: string;
  history: string;
  message: string;
};

export type ContextBuildResult = {
  prompt: string;
  sections: ContextSections;
  keptHistory: ConversationMessage[];
  keptMemories: RecalledMemory[];
};

export const DEFAULT_SECTION_BUDGET: SectionBudget = {
  summary: 200,
  window: 1200,
  memories: 300,
};

type CutStrategy = "never" | "truncate-end" | "oldest-first" | "lowest-score-first";

type FittedSection = {
  name: "system" | "summary" | "memories" | "history";
  text: string;
  keptHistory?: ConversationMessage[];
  keptMemories?: RecalledMemory[];
};

/** Same format as `formatHistoryOnly` in chat-history (kept here to avoid context→http). */
const formatHistoryLines = (history: readonly ConversationMessage[]): string =>
  history.map((message) => `${message.role}: ${message.content}`).join("\n");

const parseBudget = (raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
};

/** Reads CONTEXT_BUDGET_* from env-like map; invalid/missing → defaults. */
export const loadSectionBudgets = (env: NodeJS.ProcessEnv = process.env): SectionBudget => ({
  summary: parseBudget(env.CONTEXT_BUDGET_SUMMARY, DEFAULT_SECTION_BUDGET.summary),
  window: parseBudget(env.CONTEXT_BUDGET_WINDOW, DEFAULT_SECTION_BUDGET.window),
  memories: parseBudget(env.CONTEXT_BUDGET_MEMORIES, DEFAULT_SECTION_BUDGET.memories),
});

const truncateSummaryRaw = (raw: string, budget: number): string => {
  if (budget <= 0) return "";
  let text = raw.trim();
  if (!text) return "";
  while (text.length > 0 && estimateTokens(formatSummaryBlock(text)) > budget) {
    text = text.slice(0, -1);
  }
  return text;
};

const fitHistory = (
  history: readonly ConversationMessage[],
  budget: number,
): ConversationMessage[] => {
  if (history.length === 0) return [];
  let kept = [...history];
  while (kept.length > 1 && estimateTokens(formatHistoryLines(kept)) > budget) {
    kept = kept.slice(1);
  }
  return kept;
};

const fitMemories = (memories: readonly RecalledMemory[], budget: number): RecalledMemory[] => {
  if (budget <= 0) return [];
  let kept = [...memories];
  while (kept.length > 0 && estimateTokens(formatMemoryBlock(kept)) > budget) {
    let dropIdx = 0;
    for (let i = 1; i < kept.length; i += 1) {
      if (kept[i]!.score < kept[dropIdx]!.score) dropIdx = i;
    }
    kept = kept.filter((_, index) => index !== dropIdx);
  }
  return kept;
};

/**
 * Declarative section descriptor (sketch API).
 * Content is raw payload; formatting happens in fitToBudget.
 */
const section = <T>(
  name: FittedSection["name"],
  content: T,
  options: { budget: number; cut: CutStrategy },
): { name: FittedSection["name"]; content: T; budget: number; cut: CutStrategy } => ({
  name,
  content,
  budget: options.budget,
  cut: options.cut,
});

const fitToBudget = (sec: {
  name: FittedSection["name"];
  content: unknown;
  budget: number;
  cut: CutStrategy;
}): FittedSection => {
  switch (sec.name) {
    case "system": {
      const text = typeof sec.content === "string" ? sec.content : "";
      return { name: "system", text };
    }
    case "summary": {
      const raw = typeof sec.content === "string" ? sec.content : "";
      const trimmed =
        sec.cut === "never" ? raw.trim() : truncateSummaryRaw(raw, sec.budget);
      return { name: "summary", text: formatSummaryBlock(trimmed) };
    }
    case "history": {
      const history = Array.isArray(sec.content)
        ? (sec.content as ConversationMessage[])
        : [];
      const kept =
        sec.cut === "never" ? [...history] : fitHistory(history, sec.budget);
      return { name: "history", text: formatHistoryLines(kept), keptHistory: kept };
    }
    case "memories": {
      const memories = Array.isArray(sec.content)
        ? (sec.content as RecalledMemory[])
        : [];
      const kept =
        sec.cut === "never" ? [...memories] : fitMemories(memories, sec.budget);
      return { name: "memories", text: formatMemoryBlock(kept), keptMemories: kept };
    }
  }
};

const assemble = (fitted: FittedSection[], message: string): ContextBuildResult => {
  const messageText = `user: ${message}`;
  const byName = {
    system: fitted.find((s) => s.name === "system")?.text ?? "",
    summary: fitted.find((s) => s.name === "summary")?.text ?? "",
    memory: fitted.find((s) => s.name === "memories")?.text ?? "",
    history: fitted.find((s) => s.name === "history")?.text ?? "",
    message: messageText,
  };
  const keptHistory = fitted.find((s) => s.name === "history")?.keptHistory ?? [];
  const keptMemories = fitted.find((s) => s.name === "memories")?.keptMemories ?? [];

  // History + current message need an explicit newline (same as formatChatHistory).
  const historyAndMessage =
    byName.history && byName.message
      ? `${byName.history}\n${byName.message}`
      : byName.history || byName.message;

  const prompt = [byName.system, byName.summary, byName.memory, historyAndMessage]
    .filter((part) => part.length > 0)
    .join("");

  return {
    prompt,
    sections: byName,
    keptHistory,
    keptMemories,
  };
};

/**
 * Pure context composer with per-section budgets.
 * system + current message are never cut; summary truncates; history drops oldest;
 * memories drop lowest score first.
 */
export const buildContext = (
  input: ContextBuildInput,
  budget: SectionBudget = DEFAULT_SECTION_BUDGET,
): ContextBuildResult => {
  const sections = [
    section("system", input.system ?? "", { budget: Number.POSITIVE_INFINITY, cut: "never" }),
    section("summary", input.summary ?? "", { budget: budget.summary, cut: "truncate-end" }),
    section("memories", input.memories ?? [], {
      budget: budget.memories,
      cut: "lowest-score-first",
    }),
    section("history", input.history ?? [], { budget: budget.window, cut: "oldest-first" }),
  ];
  const fitted = sections.map(fitToBudget);
  return assemble(fitted, input.message);
};
