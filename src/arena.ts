import { pathToFileURL } from "node:url";
import { createPlanAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { createReactStrategy } from "./agents/react.js";
import { formatTrace } from "./agents/trace.js";
import type { ReasoningStrategy } from "./agents/types.js";

export type ArenaOptions = { strategies: string[]; maxIterations: number; input: string };

export const parseArenaArgs = (args: readonly string[]): ArenaOptions => {
  const names = ["react", "plan-and-execute"];
  let strategies = names;
  let maxIterations = 8;
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--strategies") strategies = (args[++index] ?? "").split(",").filter(Boolean);
    else if (arg === "--max-iterations") maxIterations = Number(args[++index]);
    else if (!arg.startsWith("--")) positional.push(arg);
  }
  if (positional.length > 0 && names.includes(positional[0])) {
    strategies = [positional.shift() as string];
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
  const registry = { react: createReactStrategy(), "plan-and-execute": createPlanAndExecuteStrategy() };
  console.log(await runArena(options, registry));
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
