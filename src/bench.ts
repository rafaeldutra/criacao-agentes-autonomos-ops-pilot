import { pathToFileURL } from "node:url";
import { createOpenRouterModel } from "./agents/model.js";
import { createPlanAndExecuteStrategy } from "./agents/plan-and-execute.js";
import { createReactStrategy } from "./agents/react.js";
import { createSeededStore } from "./agents/store.js";
import { createTools } from "./agents/tools.js";
import type { ReasoningResult, ReasoningStrategy } from "./agents/types.js";
import type { StoreSnapshot } from "./agents/store.js";

export type BenchScenario = {
  id: "C1" | "C2" | "C3";
  input: string;
  isCorrect: (snapshot: StoreSnapshot, result: ReasoningResult) => boolean;
};

export type BenchOptions = {
  scenario?: BenchScenario["id"];
  replanner: boolean;
};

export type BenchRow = {
  scenario: string;
  strategy: string;
  correct: boolean;
  llmCalls: number;
  latencyMs: number;
};

const scenarios: readonly BenchScenario[] = [
  {
    id: "C1",
    input: "quantos alertas críticos estão disparando?",
    isCorrect: (snapshot) => snapshot.alerts.filter((alert) => alert.status === "firing" && alert.severity === "critical").length === 1,
  },
  {
    id: "C2",
    input: "abra três incidentes sev2 para checkout, payment e catalog, nessa mesma ordem, e resolva o primeiro.",
    isCorrect: (snapshot) => {
      const incidents = snapshot.incidents;
      return incidents.length === 3 &&
        incidents.map((incident) => incident.serviceId).join(",") === "svc-checkout,svc-payments,svc-catalog" &&
        incidents.every((incident) => incident.severity === "medium") &&
        incidents[0]?.status === "resolved" &&
        incidents.slice(1).every((incident) => incident.status === "open");
    },
  },
  {
    id: "C3",
    input: "dos alertas disparando, abra um incidente para o mais antigo e diga quantos sobraram.",
    isCorrect: (snapshot) => {
      const incident = snapshot.incidents[0];
      return snapshot.incidents.length === 1 && incident?.serviceId === "svc-api" && incident.status === "open";
    },
  },
];

export const benchScenarios = scenarios;

export const parseBenchArgs = (args: readonly string[]): BenchOptions => {
  let scenario: BenchScenario["id"] | undefined;
  let replanner = true;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--scenario") {
      const value = args[++index];
      if (!value || !scenarios.some((item) => item.id === value)) throw new Error("scenario must be C1, C2, or C3");
      scenario = value as BenchScenario["id"];
    } else if (arg === "--no-replanner") {
      replanner = false;
    } else if (scenarios.some((item) => item.id === arg)) {
      scenario = arg as BenchScenario["id"];
    } else {
      throw new Error(`Unknown benchmark option: ${arg}`);
    }
  }
  return { scenario, replanner };
};

const table = (rows: readonly BenchRow[]): string => {
  const header = "| cenário | estratégia | acerto | llmCalls | latencyMs |\n|---|---|---:|---:|---:|";
  const lines = rows.map((row) => `| ${row.scenario} | ${row.strategy} | ${row.correct ? "sim" : "não"} | ${row.llmCalls} | ${row.latencyMs} |`);
  return [header, ...lines].join("\n");
};

export const runBenchmark = async (
  model: ReturnType<typeof createOpenRouterModel>,
  options: BenchOptions,
): Promise<{ rows: BenchRow[]; output: string }> => {
  const selected = options.scenario ? scenarios.filter((item) => item.id === options.scenario) : scenarios;
  const rows: BenchRow[] = [];
  const strategies = [
    (tools: ReturnType<typeof createTools>): ReasoningStrategy => createReactStrategy(model, tools),
    (tools: ReturnType<typeof createTools>): ReasoningStrategy => createPlanAndExecuteStrategy(model, tools),
  ];

  for (const scenario of selected) {
    for (const createStrategy of strategies) {
      const store = createSeededStore();
      const strategy = createStrategy(createTools(store));
      const result = await strategy.run(scenario.input, { maxIterations: 8, replanner: options.replanner });
      rows.push({
        scenario: scenario.id,
        strategy: strategy.name,
        correct: scenario.isCorrect(store.read(), result),
        llmCalls: result.metrics.llmCalls,
        latencyMs: result.metrics.latencyMs,
      });
    }
  }
  return { rows, output: table(rows) };
};

const main = async () => {
  const options = parseBenchArgs(process.argv.slice(2));
  const { output } = await runBenchmark(createOpenRouterModel(), options);
  console.log(output);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
