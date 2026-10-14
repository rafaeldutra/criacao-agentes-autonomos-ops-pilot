import { describe, expect, it } from "vitest";
import { toUiError } from "../api/errors";
import { chatOkSchema, chatPendingSchema, decisionOkSchema, decisionPendingSchema } from "../api/schemas";
import { chat200, chat202, decisionApprove200 } from "../test/fixtures";
import { conversationReducer, initialConversation, type ConversationState } from "./conversation";

const at = "2026-10-14T12:00:00.000Z";
const send = (state: ConversationState, id: string, text: string) =>
  conversationReducer(state, { type: "send", id, text, createdAt: at });

describe("conversationReducer", () => {
  it("send appends a sending person message and sets inFlight", () => {
    const state = send(initialConversation, "p1", "  Quais alertas?  ");
    expect(state.messages).toEqual([
      { id: "p1", author: "person", text: "Quais alertas?", createdAt: at, status: "sending" },
    ]);
    expect(state.inFlight).toBe("p1");
  });

  it("ignores empty text and a second send while in flight", () => {
    expect(send(initialConversation, "p1", "   ")).toBe(initialConversation);
    const inFlight = send(initialConversation, "p1", "oi");
    expect(send(inFlight, "p2", "de novo")).toBe(inFlight);
  });

  it("final appends the agent message and stores conversationId", () => {
    const result = chatOkSchema.parse(chat200());
    const state = conversationReducer(send(initialConversation, "p1", "oi"), {
      type: "final",
      personId: "p1",
      id: "a1",
      createdAt: at,
      result,
    });
    expect(state.inFlight).toBeUndefined();
    expect(state.conversationId).toBe(result.conversationId);
    expect(state.messages[0]?.status).toBe("delivered");
    expect(state.messages[1]).toMatchObject({
      id: "a1",
      author: "agent",
      text: result.answer,
      requestId: result.requestId,
      route: "plan-and-execute",
      metrics: result.metrics,
      trace: result.trace,
    });
  });

  it("failed keeps the text and marks the message with the UiError; retry resends it", () => {
    const error = toUiError({ kind: "http", status: 504, body: {} });
    const failed = conversationReducer(send(initialConversation, "p1", "oi"), { type: "failed", personId: "p1", error });
    expect(failed.inFlight).toBeUndefined();
    expect(failed.messages[0]).toMatchObject({ text: "oi", status: "error", error });

    const retried = conversationReducer(failed, { type: "retry", personId: "p1" });
    expect(retried.inFlight).toBe("p1");
    expect(retried.messages[0]).toMatchObject({ text: "oi", status: "sending" });
    expect(retried.messages[0]?.error).toBeUndefined();
    expect(retried.messages).toHaveLength(1);
  });

  it("reset clears messages and conversationId", () => {
    const result = chatOkSchema.parse(chat200());
    const state = conversationReducer(send(initialConversation, "p1", "oi"), {
      type: "final",
      personId: "p1",
      id: "a1",
      createdAt: at,
      result,
    });
    expect(conversationReducer(state, { type: "reset" })).toEqual(initialConversation);
  });

  it("pending appends a card and blocks sending until decided", () => {
    const result = chatPendingSchema.parse(chat202());
    const pending = conversationReducer(send(initialConversation, "p1", "resolve"), {
      type: "pending",
      personId: "p1",
      id: "a1",
      createdAt: at,
      result,
    });
    expect(pending.pendingApprovalId).toBe(result.approval.id);
    expect(pending.messages[1]?.approval).toMatchObject({ id: result.approval.id, state: "pending" });
    expect(send(pending, "p2", "outra")).toBe(pending);

    const decided = conversationReducer(pending, {
      type: "decided",
      approvalId: result.approval.id,
      id: "a2",
      createdAt: at,
      result: decisionOkSchema.parse(decisionApprove200()),
    });
    expect(decided.pendingApprovalId).toBeUndefined();
    expect(decided.messages[1]?.approval?.state).toBe("approved");
    expect(decided.messages[2]).toMatchObject({ author: "agent", text: "Incidente inc-1 resolvido com o resumo informado." });
  });

  it("decided with a new 202 keeps the conversation blocked by the new card", () => {
    const first = chatPendingSchema.parse(chat202());
    const pending = conversationReducer(send(initialConversation, "p1", "resolve"), {
      type: "pending",
      personId: "p1",
      id: "a1",
      createdAt: at,
      result: first,
    });
    const next = chat202();
    const nextBody = {
      ...next,
      approval: { ...next.approval, id: "new-approval", tool: "forget_preference", args: { preference: "tema" } },
      decided: { ...first.approval, status: "approved", decidedAt: at },
    };
    const decided = conversationReducer(pending, {
      type: "decided",
      approvalId: first.approval.id,
      id: "a2",
      createdAt: at,
      result: decisionPendingSchema.parse(nextBody),
    });
    expect(decided.pendingApprovalId).toBe("new-approval");
    expect(decided.messages[1]?.approval?.state).toBe("approved");
    expect(decided.messages[2]?.approval).toMatchObject({ id: "new-approval", state: "pending" });
  });
});
