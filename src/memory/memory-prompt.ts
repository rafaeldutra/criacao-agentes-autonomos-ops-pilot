import type { RecalledMemory } from "./memory-store.js";

/** Formats recalled facts as a prompt prefix; empty when no facts. */
export const formatMemoryBlock = (facts: readonly RecalledMemory[]): string => {
  if (facts.length === 0) return "";
  const lines = ["[Relevant memories]", ...facts.map((fact) => `- ${fact.fact}`)];
  return `${lines.join("\n")}\n\n`;
};
