import { createAgentRegistry } from "./agents/index.js";
import { createOpenRouterModel } from "./agents/model.js";
import { embed } from "./memory/embeddings.js";
import { createLearningReflector } from "./memory/learning-reflector.js";
import { SqliteMemoryStore } from "./memory/sqlite-memory-store.js";
import { createApp } from "./http/server.js";
import { getUserId } from "./http/request-context.js";
import { SqliteConversationStore } from "./store/sqlite-conversation-store.js";
import { SqliteOpsStore } from "./store/sqlite-ops-store.js";

const port = Number(process.env.PORT ?? 3000);
const store = new SqliteOpsStore();
const conversations = new SqliteConversationStore();
const memories = new SqliteMemoryStore({ embed });
const registry = createAgentRegistry(store, { memories, getUserId });
const app = createApp(registry, {
  conversations,
  memories,
  learningReflector: createLearningReflector(createOpenRouterModel()),
});

const server = app.listen(port, () => {
  console.log(`OpsPilot HTTP server listening on port ${port}`);
});

const shutdown = () => {
  server.close(() => {
    memories.close();
    conversations.close();
    store.close();
  });
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
