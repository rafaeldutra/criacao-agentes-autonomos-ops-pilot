import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { createOpenRouterModel } from "./model.js";
import { createTools, type AgentTools } from "./tools.js";
import { maxIterations, metricsFromMessages } from "./strategy.js";
import { action, answer, observation, thought } from "./trace.js";
import type { ReasoningInput, ReasoningOptions, ReasoningResult, ReasoningStrategy, TraceEvent } from "./types.js";

const text = (content: unknown): string =>
  typeof content === "string" ? content : JSON.stringify(content);

const toolByName = (tools: AgentTools, name: string) => Object.values(tools).find((candidate) => candidate.name === name);

export const createReactStrategy = (
  model = createOpenRouterModel(),
  tools = createTools(),
): ReasoningStrategy => ({
  name: "react",
  async run(input: ReasoningInput, options?: ReasoningOptions): Promise<ReasoningResult> {
    const startedAt = Date.now();
    const limit = maxIterations(options);
    const agent = createReactAgent({ llm: model, tools: Object.values(tools), name: "ops-pilot-react" });
    const state = await agent.invoke(
      { messages: [new HumanMessage(input)] },
      { recursionLimit: Math.max(2, limit * 2 + 1) },
    );
    const messages = state.messages as Array<AIMessage | ToolMessage | HumanMessage>;
    const trace: TraceEvent[] = [];
    for (const message of messages) {
      if (message instanceof AIMessage) {
        if (message.tool_calls?.length) {
          for (const call of message.tool_calls) trace.push(action(call.name, call.args as Record<string, unknown>));
        } else if (message.content) {
          trace.push(thought(text(message.content)));
        }
      } else if (message instanceof ToolMessage) {
        trace.push(observation(text(message.content)));
      }
    }
    const finalMessage = [...messages].reverse().find((message) => message instanceof AIMessage && !message.tool_calls?.length);
    const finalAnswer = text(finalMessage?.content ?? "Execution ended without a final answer.");
    trace.push(answer(finalAnswer));
    return { answer: finalAnswer, trace, metrics: metricsFromMessages(startedAt, messages) };
  },
});

export const createToolExecutor = (tools: AgentTools) => async (name: string, args: Record<string, unknown>) => {
  const candidate = toolByName(tools, name);
  if (!candidate) throw new Error(`Unknown tool: ${name}`);
  const invoke = candidate.invoke.bind(candidate) as (input: Record<string, unknown>) => Promise<unknown>;
  return invoke(args);
};
