/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";

const BASE = "/opspilot/";

/** `/opspilot` (no trailing slash) → 301 `/opspilot/`, in dev and preview alike. */
const redirectBareBase = (): Plugin => {
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const [path, query] = (request.url ?? "").split("?");
    if (path !== BASE.slice(0, -1)) return next();
    response.statusCode = 301;
    response.setHeader("Location", query ? `${BASE}?${query}` : BASE);
    response.end();
  };
  return {
    name: "opspilot-redirect-bare-base",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
};

export default defineConfig({
  base: BASE,
  plugins: [react(), redirectBareBase()],
  server: { port: 5173, fs: { allow: [".."] } },
  preview: { port: 4173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
