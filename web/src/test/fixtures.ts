import chat202Json from "../../../specs/014-war-room-web/contracts/fixtures/chat-202.json";
import decision409Json from "../../../specs/014-war-room-web/contracts/fixtures/decision-409.json";
import decisionApprove200Json from "../../../specs/014-war-room-web/contracts/fixtures/decision-approve-200.json";
import chatTeam200Json from "../../../specs/016-team-supervisor-mode/contracts/fixtures/chat-200-team.json";

/** Contract fixtures shared with the API tests (deep-cloned so tests may mutate freely). */
export const chat202 = (): typeof chat202Json => structuredClone(chat202Json);
export const decisionApprove200 = (): typeof decisionApprove200Json =>
  structuredClone(decisionApprove200Json);
export const decision409 = (): typeof decision409Json => structuredClone(decision409Json);
/** A 200 /chat body of the team route (specs/016-team-supervisor-mode). */
export const chatTeam200 = (): typeof chatTeam200Json => structuredClone(chatTeam200Json);

/** A 200 /chat body containing every known TraceEvent type plus one unknown event. */
export const chat200 = () => ({
  requestId: "11111111-2222-4333-8444-555555555555",
  conversationId: "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d",
  answer: "Há **2 alertas** disparando no checkout.",
  route: "plan-and-execute",
  trace: [
    { type: "route", route: "plan-and-execute", reason: "várias consultas", node: "router" },
    { type: "thought", content: "Vou listar os alertas.", node: "plan-and-execute" },
    { type: "action", tool: "list_alerts", args: { service: "checkout", severity: "SEV1" }, node: "plan-and-execute" },
    { type: "observation", content: "[{\"id\":\"al-1\"}]", node: "plan-and-execute" },
    {
      type: "plan",
      steps: [
        { id: 1, description: "Listar alertas", tool: "list_alerts", args: { service: "checkout" }, status: "completed" },
        { id: 2, description: "Consultar runbook", status: "pending" },
        { id: 3, description: "Abrir incidente", status: "failed" },
      ],
      node: "plan-and-execute",
    },
    { type: "critique", content: "A resposta cobre os alertas.", node: "reflect" },
    { type: "fallback", fromModel: "openai/gpt-4o", toModel: "openai/gpt-4o-mini", reason: "timeout", node: "plan-and-execute" },
    { type: "summarize", content: "Resumo do histórico.", node: "context" },
    { type: "answer", content: "Há 2 alertas disparando no checkout.", node: "response" },
    { type: "telemetry", foo: 1 },
  ],
  metrics: {
    llmCalls: 4,
    latencyMs: 1234,
    historyMessages: 2,
    memoryFacts: 1,
    learningQueued: false,
    promptTokens: 2048,
    modelUsed: "openai/gpt-4o-mini",
  },
  prompt: "ignored by the web",
  keptHistory: [],
  keptMemories: [],
});
