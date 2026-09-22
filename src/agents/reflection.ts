import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createOpenRouterModel } from "./model.js";
import { critique } from "./trace.js";
import type {
  Critic,
  CriticInput,
  CritiqueResult,
  ReasoningInput,
  ReasoningOptions,
  ReasoningResult,
  ReasoningStrategy,
  ReflectionOptions,
  TraceEvent,
} from "./types.js";

const verdictSchema = z.object({
  approved: z.boolean(),
  feedback: z.string().trim().min(1).describe("se aprovado: o que corrigir, em específico e acionável"),
});

const CRITIC_PROMPT =
  "Você é o crítico do OpsPilot. Avalie APENAS se a resposta atende ao pedido e é sustentada pelas observações do trace. " +
  "Não invente fatos, ferramentas ou observações. Se reprovar, forneça feedback específico e acionável para corrigir a resposta.";

const text = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value));

const observationsOf = (trace: readonly TraceEvent[]): string =>
  trace
    .filter((event): event is Extract<TraceEvent, { type: "observation" }> => event.type === "observation")
    .map((event) => event.content)
    .join("\n");

const reflectionLimit = (options?: ReflectionOptions): number => {
  const value = options?.maxReflections ?? 2;
  if (!Number.isInteger(value) || value < 1) throw new Error("maxReflections must be a positive integer");
  return value;
};

const critiqueContent = (result: CritiqueResult): string =>
  `${result.approved ? "approved" : "rejected"}: ${result.feedback}`;

const defaultCritic = (model: ReturnType<typeof createOpenRouterModel>): Critic =>
  async (input: CriticInput): Promise<CritiqueResult> => {
    const result = await model.withStructuredOutput(verdictSchema).invoke([
      new SystemMessage(CRITIC_PROMPT),
      new HumanMessage(
        `Pedido: ${input.input}\nObservações: ${input.observations || "(nenhuma)"}\nResposta: ${input.answer}\n` +
          `Reflexão: ${input.reflection}${input.feedback ? `\nFeedback anterior: ${input.feedback}` : ""}`,
      ),
    ]);
    return verdictSchema.parse(result);
  };

const regenerationInput = (input: string, result: ReasoningResult, feedback: string): string =>
  `${input}\n\n[REFLECTION FEEDBACK]\nA resposta anterior foi rejeitada. Gere uma nova resposta corrigindo este feedback: ${feedback}\n` +
  `Resposta anterior: ${result.answer}\nObservações anteriores: ${observationsOf(result.trace) || "(nenhuma)"}`;

export const withReflection = (
  strategy: ReasoningStrategy,
  options: ReflectionOptions = {},
): ReasoningStrategy => {
  let criticFn = options.critic;
  const name = `reflect:${strategy.name}`;

  return {
    name,
    async run(input: ReasoningInput, strategyOptions?: ReasoningOptions): Promise<ReasoningResult> {
      const startedAt = Date.now();
      const limit = reflectionLimit(options);
      const trace: TraceEvent[] = [];
      let currentInput = input;
      let current = await strategy.run(currentInput, strategyOptions);
      let llmCalls = current.metrics.llmCalls;
      let previousFeedback: string | undefined;

      for (let reflection = 1; reflection <= limit; reflection += 1) {
        const critic = criticFn ?? (criticFn = defaultCritic(createOpenRouterModel()));
        const verdict = await critic({
          input,
          answer: current.answer,
          observations: observationsOf(current.trace),
          reflection,
          feedback: previousFeedback,
        });
        const parsed = verdictSchema.parse(verdict);
        trace.push(...current.trace, critique(critiqueContent(parsed)));
        llmCalls += 1;
        if (parsed.approved || reflection === limit) {
          return {
            answer: current.answer,
            trace,
            metrics: { llmCalls, latencyMs: Math.max(0, Date.now() - startedAt), historyMessages: 0 },
          };
        }
        previousFeedback = parsed.feedback;
        currentInput = regenerationInput(input, current, parsed.feedback);
        current = await strategy.run(currentInput, strategyOptions);
        llmCalls += current.metrics.llmCalls;
      }
      throw new Error("Reflection ended without a result");
    },
  };
};

export const createReflectionCritic = (model = createOpenRouterModel()): Critic => defaultCritic(model);
