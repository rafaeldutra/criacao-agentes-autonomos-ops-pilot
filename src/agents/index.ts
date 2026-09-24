import { createOpenRouterModel } from "./model.js";
import { createPlanAndExecuteStrategy } from "./plan-and-execute.js";
import { createReactStrategy } from "./react.js";
import { withReflection } from "./reflection.js";
import { createTools } from "./tools.js";
import type { MemoryStore } from "../memory/memory-store.js";
import { SqliteOpsStore } from "../store/sqlite-ops-store.js";
import type { OpsStore } from "../store/ops-store.js";
import type { ReflectionOptions, ReasoningStrategy } from "./types.js";

export type AgentRegistry = Readonly<Record<string, ReasoningStrategy>>;

export type AgentRegistryOptions = {
  memories?: MemoryStore;
  getUserId?: () => string | undefined;
};

export const createAgentRegistry = (
  store: OpsStore = new SqliteOpsStore(),
  options: AgentRegistryOptions = {},
): AgentRegistry => {
  const model = createOpenRouterModel();
  const tools = createTools(store, {
    memories: options.memories,
    getUserId: options.getUserId,
  });
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
