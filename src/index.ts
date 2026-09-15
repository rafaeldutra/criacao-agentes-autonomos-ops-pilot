import { createAgentRegistry } from "./agents/index.js";
import { createApp } from "./http/server.js";
import { SqliteOpsStore } from "./store/sqlite-ops-store.js";

const port = Number(process.env.PORT ?? 3000);
const store = new SqliteOpsStore();
const app = createApp(createAgentRegistry(store));

const server = app.listen(port, () => {
  console.log(`OpsPilot HTTP server listening on port ${port}`);
});

const shutdown = () => {
  server.close(() => store.close());
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);