import { createAgentRegistry, createOpsToolExecutor } from "./agents/index.js";
import { createOpenRouterModel } from "./agents/model.js";
import { createHistorySummarizer } from "./conversation/history-summarizer.js";
import { embed } from "./memory/embeddings.js";
import { createLearningReflector } from "./memory/learning-reflector.js";
import { SqliteMemoryStore } from "./memory/sqlite-memory-store.js";
import { parseCorsOrigins } from "./http/cors.js";
import { createApp } from "./http/server.js";
import { getUserId } from "./http/request-context.js";
import { SqliteConversationStore } from "./store/sqlite-conversation-store.js";
import { SqliteOpsStore } from "./store/sqlite-ops-store.js";
import { SqliteRequestStore } from "./store/sqlite-request-store.js";
import { SqliteApprovalStore } from "./store/sqlite-approval-store.js";
import { loadApprovalTtlMinutes } from "./store/approval-store.js";

const port = Number(process.env.PORT ?? 3000);

let corsOrigins: string[];
let approvalTtlMinutes: number;
try {
  corsOrigins = parseCorsOrigins(process.env.OPSPILOT_CORS_ORIGINS);
  approvalTtlMinutes = loadApprovalTtlMinutes(process.env);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const store = new SqliteOpsStore();
const conversations = new SqliteConversationStore();
const requests = new SqliteRequestStore();
const approvals = new SqliteApprovalStore();
const memories = new SqliteMemoryStore({ embed });
const model = createOpenRouterModel();
const registry = createAgentRegistry(store, { memories, getUserId });
const app = createApp(registry, {
  conversations,
  memories,
  learningReflector: createLearningReflector(model),
  historySummarizer: createHistorySummarizer(model),
  requests,
  corsOrigins,
  approvals,
  approvalTtlMinutes,
  // resolve_incident / forget_preference only run here, after a human approval.
  executeTool: createOpsToolExecutor(store, { memories, getUserId }),
});

const server = app.listen(port, () => {
  console.log(`OpsPilot HTTP server listening on port ${port} (CORS: ${corsOrigins.join(", ")})`);
});

const shutdown = () => {
  server.close(() => {
    memories.close();
    requests.close();
    approvals.close();
    conversations.close();
    store.close();
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
