import test from "node:test";
import assert from "node:assert/strict";
import { createResilientModel } from "../agents/model.js";
import { RouterError } from "../agents/production-graph.js";
import { createScriptedModel, type ScriptedModelOptions } from "../agents/test-models.js";
import {
  assertSupervisorDecision,
  createDefaultDecideNext,
  doneOnlySchema,
  mustFinish,
  supervisorDecisionSchema,
  TEAM_MAX_DECISIONS,
} from "./supervisor.js";

const scripted = (options: ScriptedModelOptions) => {
  const primary = createScriptedModel(options);
  const model = createResilientModel({
    primary: primary.model,
    fallback: createScriptedModel(options).model,
    primaryModel: "primary/model",
    fallbackModel: "fallback/model",
    retry: { stopAfterAttempt: 1 },
  });
  return { model, state: primary.state };
};

test("supervisorDecisionSchema accepts the four targets and rejects bad decisions", () => {
  for (const next of ["analista", "planejador", "executor", "done"]) {
    assert.equal(supervisorDecisionSchema.safeParse({ next, brief: "faça" }).success, true);
  }
  assert.equal(supervisorDecisionSchema.safeParse({ next: "dba", brief: "x" }).success, false);
  assert.equal(supervisorDecisionSchema.safeParse({ next: "analista", brief: "   " }).success, false);
  assert.equal(doneOnlySchema.safeParse({ next: "analista", brief: "x" }).success, false);
});

test("assertSupervisorDecision trims valid decisions and throws RouterError otherwise", () => {
  assert.deepEqual(assertSupervisorDecision({ next: "analista", brief: "  liste  " }), { next: "analista", brief: "liste" });
  assert.throws(() => assertSupervisorDecision({ next: "analista", brief: "" }), RouterError);
  assert.throws(() => assertSupervisorDecision(undefined), RouterError);
  assert.throws(() => assertSupervisorDecision({ next: "executor", brief: "x" }, true), RouterError);
});

test("mustFinish forces done on the last allowed decision and on a pending approval", () => {
  assert.deepEqual(mustFinish({ decisions: 0, approvalPending: false }), { force: false });
  assert.deepEqual(mustFinish({ decisions: TEAM_MAX_DECISIONS - 2, approvalPending: false }), { force: false });
  assert.deepEqual(mustFinish({ decisions: TEAM_MAX_DECISIONS - 1, approvalPending: false }), { force: true, reason: "limit" });
  assert.deepEqual(mustFinish({ decisions: 2, approvalPending: true }), { force: true, reason: "approval" });
  assert.deepEqual(mustFinish({ decisions: TEAM_MAX_DECISIONS - 1, approvalPending: true }), { force: true, reason: "approval" });
});

test("default decider uses withStructuredOutput and the restricted schema when forced", async () => {
  const free = scripted({ structured: { next: "analista", brief: "liste alertas" } });
  const decision = await createDefaultDecideNext(free.model)({ blackboard: "Pedido: x", forceFinish: false });
  assert.deepEqual(decision, { next: "analista", brief: "liste alertas" });
  assert.equal(free.state.schemas.at(-1), supervisorDecisionSchema);

  const forced = scripted({ structured: { next: "done", brief: "resposta" } });
  await createDefaultDecideNext(forced.model)({ blackboard: "Pedido: x", forceFinish: true, reason: "limit" });
  assert.equal(forced.state.schemas.at(-1), doneOnlySchema);
});

test("default decider maps an invalid model verdict to RouterError", async () => {
  const bad = scripted({ structured: { next: "chefe", brief: "" } });
  await assert.rejects(createDefaultDecideNext(bad.model)({ blackboard: "x", forceFinish: false }), RouterError);
});
