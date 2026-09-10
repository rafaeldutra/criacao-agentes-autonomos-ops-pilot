import { pathToFileURL } from "node:url";
import { createOpenRouterModel } from "./agents/model.js";
import { createPlanAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { createReactStrategy } from "./agents/react.js";
import { createReflectionCritic, withReflection } from "./agents/reflection.js";
import { formatTrace } from "./agents/trace.js";
import type { ReasoningStrategy } from "./agents/types.js";

export type ArenaOptions = { strategies: string[]; maxIterations: number; input: string };

export const parseArenaArgs = (args: readonly string[]): ArenaOptions => {
  const names = ["react", "plan-and-execute", "reflect:react", "reflect:plan-and-execute"];
  let strategies = names;
  let maxIterations = 8;
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--strategies") strategies = (args[++index] ?? "").split(",").filter(Boolean);
    else if (arg === "--max-iterations") maxIterations = Number(args[++index]);
    else if (!arg.startsWith("--")) positional.push(arg);
  }
  const positionalStrategies: string[] = [];
  while (positional.length > 0) {
    const candidate = positional[0].split(",").filter(Boolean);
    if (!candidate.length || candidate.some((name) => !names.includes(name))) break;
    positional.shift();
    positionalStrategies.push(...candidate);
  }
  if (positionalStrategies.length > 0) strategies = positionalStrategies;
  if (positional.length > 0 && positional[0].includes(":") && !positional[0].includes(" ")) {
    throw new Error("Unknown strategy");
  }
  if (!strategies.length || strategies.some((name) => !names.includes(name))) throw new Error("Unknown strategy");
  if (!Number.isInteger(maxIterations) || maxIterations < 1) throw new Error("max-iterations must be a positive integer");
  return {
    strategies,
    maxIterations,
    input: positional.join(" ") || "List firing alerts and summarize the operational risk.",
  };
};

export const runArena = async (options: ArenaOptions, registry: Record<string, ReasoningStrategy>): Promise<string> => {
  const output: string[] = [];
  for (const name of options.strategies) {
    const result = await registry[name].run(options.input, { maxIterations: options.maxIterations });
    output.push(`## ${name}\nAnswer: ${result.answer}\nTrace:\n${formatTrace(result.trace)}\nMetrics: ${JSON.stringify(result.metrics)}`);
  }
  return output.join("\n\n");
};

const main = async () => {
  const options = parseArenaArgs(process.argv.slice(2));
  const model = createOpenRouterModel();
  const critic = createReflectionCritic(model);
  const registry = {
    react: createReactStrategy(model),
    "plan-and-execute": createPlanAndExecuteStrategy(model),
    "reflect:react": withReflection(createReactStrategy(model), { critic }),
    "reflect:plan-and-execute": withReflection(createPlanAndExecuteStrategy(model), { critic }),
  };
  console.log(await runArena(options, registry));
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
