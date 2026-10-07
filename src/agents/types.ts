export type AlertStatus = "firing" | "resolved";
export type IncidentStatus = "open" | "resolved";
export type Severity = "low" | "medium" | "high" | "critical";
export type ServiceTier = "tier1" | "tier2" | "tier3";
export type IncidentFilter = "open" | "resolved" | "all";

export type GraphNode = "context" | "router" | "react" | "plan-and-execute" | "reflect" | "response";
export type StrategyRoute = Extract<GraphNode, "react" | "plan-and-execute" | "reflect">;

export type RouteDecision = {
  route: StrategyRoute;
  reason: string;
  source?: "llm" | "override";
};

export type TraceEvent =
  | { type: "thought"; content: string; node?: GraphNode }
  | { type: "action"; tool: string; args: Record<string, unknown>; node?: GraphNode }
  | { type: "observation"; content: string; node?: GraphNode }
  | { type: "plan"; steps: PlanStep[]; node?: GraphNode }
  | { type: "critique"; content: string; node?: GraphNode }
  | { type: "answer"; content: string; node?: GraphNode }
  | { type: "summarize"; content: string; node?: GraphNode }
  | { type: "route"; route: StrategyRoute; reason: string; node?: GraphNode };

export type ContextBreakdown = {
  memory: number;
  history: number;
  message: number;
  summary: number;
};

export type Metrics = {
  llmCalls: number;
  latencyMs: number;
  historyMessages: number;
  memoryFacts: number;
  learningQueued: boolean;
  /** Real prompt tokens from LangChain usage when available. */
  promptTokens?: number;
  /** Estimated tokens by composed /chat input source (chars/4). */
  contextBreakdown?: ContextBreakdown;
};

export type PlanStep = {
  id: number;
  description: string;
  tool?: string;
  args?: Record<string, unknown>;
  status: "pending" | "completed" | "failed";
};

export type ReasoningInput = string;

export type ReasoningOptions = {
  maxIterations?: number;
  replanner?: boolean;
};

export type ReflectionOptions = {
  maxReflections?: number;
  critic?: Critic;
};

export type CritiqueResult = {
  approved: boolean;
  feedback: string;
};

export type CriticInput = {
  input: string;
  answer: string;
  observations: string;
  reflection: number;
  feedback?: string;
};

export type Critic = (input: CriticInput) => Promise<CritiqueResult>;

export type ReasoningResult = {
  answer: string;
  trace: TraceEvent[];
  metrics: Metrics;
};

export interface ReasoningStrategy {
  readonly name: string;
  run(input: ReasoningInput, options?: ReasoningOptions): Promise<ReasoningResult>;
}

export type Service = {
  id: string;
  name: string;
  description?: string;
  tier?: ServiceTier;
};

export type Alert = {
  id: string;
  serviceId: string;
  status: AlertStatus;
  severity: Severity;
  title: string;
  createdAt: string;
  resolvedAt?: string;
};

export type Incident = {
  id: string;
  title: string;
  serviceId: string;
  severity: Severity;
  status: IncidentStatus;
  createdAt: string;
  resolvedAt?: string;
  summary?: string;
};

export type Runbook = {
  id: string;
  service: string;
  content: string;
  updatedAt: string;
};
