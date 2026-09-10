export type AlertStatus = "firing" | "resolved";
export type IncidentStatus = "open" | "resolved";
export type Severity = "low" | "medium" | "high" | "critical";

export type TraceEvent =
  | { type: "thought"; content: string }
  | { type: "action"; tool: string; args: Record<string, unknown> }
  | { type: "observation"; content: string }
  | { type: "plan"; steps: PlanStep[] }
  | { type: "critique"; content: string }
  | { type: "answer"; content: string };

export type Metrics = {
  llmCalls: number;
  latencyMs: number;
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
};
