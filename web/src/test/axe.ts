import axe from "axe-core";
import { expect } from "vitest";

/**
 * Runs axe-core against `container` and fails with a readable list of violations.
 * jsdom cannot compute colors, so `color-contrast` ends up "incomplete" (not a violation);
 * contrast is guaranteed by the token pairs in styles/tokens.css.
 */
export async function expectNoAxeViolations(container: Element): Promise<void> {
  const results = await axe.run(container, {
    rules: { region: { enabled: false } },
  });
  const message = results.violations
    .map(
      (violation) =>
        `${violation.id} (${violation.impact ?? "n/a"}): ${violation.help}\n` +
        violation.nodes.map((node) => `  - ${node.target.join(" ")}`).join("\n"),
    )
    .join("\n");
  expect(results.violations, message).toEqual([]);
}
