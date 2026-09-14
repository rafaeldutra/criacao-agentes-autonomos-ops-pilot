import { createOpenRouterModel } from "./model.js";
import { createPlanAndExecuteStrategy } from "./plan-and-execute.js";
import { createReactStrategy } from "./react.js";
import { withReflection } from "./reflection.js";
import { createTools } from "./tools.js";
import type { ReflectionOptions, ReasoningStrategy } from "./types.js";

export type AgentRegistry = Readonly<Record<string, ReasoningStrategy>>;

export const createAgentRegistry = (): AgentRegistry => {
  const model = createOpenRouterModel();
  const tools = createTools();
  return {
    react: createReactStrategy(model, tools),
    "plan-and-execute": createPlanAndExecuteStrategy(model, tools),
  };
};

export const resolveStrategy = (
  registry: AgentRegistry,
  name: string,
  reflect = false,
  reflectionOptions: ReflectionOptions = {},
): ReasoningStrategy | undefined => {
  const strategy = registry[name];
  return strategy ? (reflect ? withReflection(strategy, reflectionOptions) : strategy) : undefined;
};
