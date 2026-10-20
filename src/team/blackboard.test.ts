import test from "node:test";
import assert from "node:assert/strict";
import { appendEntry, blackboardAsText } from "./blackboard.js";

test("appendEntry numbers contributions in order without mutating the board", () => {
  const first = appendEntry([], "analista", "liste alertas", "2 alertas firing");
  const second = appendEntry(first, "planejador", "planeje", "1. abrir incidente");

  assert.equal(first.length, 1);
  assert.deepEqual(second.map((entry) => [entry.seq, entry.role]), [[1, "analista"], [2, "planejador"]]);
  assert.equal(second[0]?.failed, undefined);
  assert.equal(appendEntry(second, "executor", "abra", "erro", true)[2]?.failed, true);
});

test("blackboardAsText renders the request and every entry as plain text", () => {
  assert.equal(blackboardAsText("status?", []), "Pedido:\nstatus?\n\nQuadro:\n(vazio)");

  const board = appendEntry(appendEntry([], "analista", "liste alertas", "2 alertas"), "executor", "abra", "falhou", true);
  const text = blackboardAsText("checkout lento", board);
  assert.match(text, /#1 Analista\ninstrução: liste alertas\nresultado: 2 alertas/);
  assert.match(text, /#2 Executor \(falhou\)/);
  assert.ok(text.indexOf("#1") < text.indexOf("#2"));
});
