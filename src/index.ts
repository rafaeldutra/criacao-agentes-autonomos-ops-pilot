import { createAgentRegistry } from "./agents/index.js";
import { createApp } from "./http/server.js";

const port = Number(process.env.PORT ?? 3000);
const app = createApp(createAgentRegistry());

app.listen(port, () => {
  console.log(`OpsPilot HTTP server listening on port ${port}`);
});