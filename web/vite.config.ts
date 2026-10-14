/// <reference types="vitest/config" />
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Connect, type Plugin } from "vite";
import { resolveBase } from "./build-config";

/** `/opspilot/` by default; GitHub Pages builds set VITE_BASE=/<repo>/. */
const base = resolveBase(process.env.VITE_BASE);

/** `<base>` without the trailing slash → 301 `<base>`, in dev and preview alike. */
const redirectBareBase = (): Plugin => {
  const middleware: Connect.NextHandleFunction = (request, response, next) => {
    const [path, query] = (request.url ?? "").split("?");
    if (path !== base.slice(0, -1)) return next();
    response.statusCode = 301;
    response.setHeader("Location", query ? `${base}?${query}` : base);
    response.end();
  };
  return {
    name: "opspilot-redirect-bare-base",
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  };
};

/** Copies index.html to 404.html so static hosts (GitHub Pages) serve the app on unknown paths. */
const emitNotFoundPage = (): Plugin => {
  let outDir = "";
  return {
    name: "opspilot-emit-404",
    apply: "build",
    configResolved: (config) => {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle: () => {
      const index = resolve(outDir, "index.html");
      if (existsSync(index)) copyFileSync(index, resolve(outDir, "404.html"));
    },
  };
};

export default defineConfig({
  base,
  plugins: [react(), redirectBareBase(), emitNotFoundPage()],
  server: { port: 5173, fs: { allow: [".."] } },
  preview: { port: 4173 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
