import test from "node:test";
import assert from "node:assert/strict";
import { boundTools } from "../agents/react.js";
import { createSeededStore } from "../agents/store.js";
import { createTools } from "../agents/tools.js";
import { ROLE_PROMPTS, TEAM_ROLES, toolsForRole } from "./roles.js";

const namesOf = (role: (typeof TEAM_ROLES)[number]): string[] =>
  boundTools(toolsForRole(createTools(createSeededStore()), role))
    .map((candidate) => candidate.name)
    .sort();

test("each role reaches exactly the tools of its contract", () => {
  assert.deepEqual(namesOf("analista"), ["check_provider_status", "consultar_runbook", "list_alerts", "list_incidents"]);
  assert.deepEqual(namesOf("planejador"), []);
  assert.deepEqual(namesOf("executor"), ["list_incidents", "open_incident", "resolve_incident"]);
});

test("no role can forget preferences and the analyst cannot change state", () => {
  for (const role of TEAM_ROLES) assert.equal(namesOf(role).includes("forget_preference"), false);
  for (const mutating of ["open_incident", "resolve_incident", "forget_preference"]) {
    assert.equal(namesOf("analista").includes(mutating), false);
  }
});

test("the executor gets the gated resolve_incident instance, not a copy", () => {
  const tools = createTools(createSeededStore());
  assert.equal(toolsForRole(tools, "executor").resolveIncident, tools.resolveIncident);
});

test("role prompts state each role's limits", () => {
  assert.match(ROLE_PROMPTS.analista, /NÃO proponha soluções/);
  assert.match(ROLE_PROMPTS.analista, /NÃO abra nem resolva incidentes/);
  assert.match(ROLE_PROMPTS.planejador, /não tem ferramentas/);
  assert.match(ROLE_PROMPTS.executor, /APPROVAL_REQUIRED/);
});
