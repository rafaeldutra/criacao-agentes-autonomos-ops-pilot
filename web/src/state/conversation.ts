import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ApiClient } from "../api/client";
import type { UiError } from "../api/errors";
import type { Approval, ChatOk, ChatPending, DecisionOk, DecisionPending, Metrics, TraceEvent } from "../api/schemas";
import {
  approvalReducer,
  isFinalState,
  toApprovalCard,
  type ApprovalAction,
  type ApprovalCard,
  type Decision,
} from "./approval";

export type MessageAuthor = "person" | "agent" | "system";
export type MessageStatus = "sending" | "delivered" | "error";

export interface Message {
  id: string;
  author: MessageAuthor;
  text: string;
  createdAt: string;
  status: MessageStatus;
  requestId?: string;
  route?: string;
  metrics?: Metrics;
  trace?: TraceEvent[];
  error?: UiError;
  approval?: ApprovalCard;
}

export interface ConversationState {
  conversationId?: string;
  messages: Message[];
  /** id of the person message awaiting /chat */
  inFlight?: string;
  pendingApprovalId?: string;
}

export const initialConversation: ConversationState = { messages: [] };

export type ConversationAction =
  | { type: "send"; id: string; text: string; createdAt: string }
  | { type: "final"; personId: string; id: string; createdAt: string; result: ChatOk; requestId?: string }
  | { type: "pending"; personId: string; id: string; createdAt: string; result: ChatPending; requestId?: string }
  | { type: "failed"; personId: string; error: UiError }
  | { type: "retry"; personId: string }
  | { type: "reset" }
  | { type: "approval"; approvalId: string; action: ApprovalAction }
  | {
      type: "decided";
      approvalId: string;
      id: string;
      createdAt: string;
      result: DecisionOk | DecisionPending;
      requestId?: string;
    }
  | { type: "restore-approval"; id: string; createdAt: string; approval: Approval };

function agentMessage(
  id: string,
  createdAt: string,
  result: ChatOk,
  requestId: string | undefined,
  approval?: Approval,
): Message {
  const message: Message = {
    id,
    author: "agent",
    text: result.answer,
    createdAt,
    status: "delivered",
    requestId: result.requestId || requestId,
    route: result.route,
    metrics: result.metrics,
    trace: result.trace,
  };
  if (approval) message.approval = toApprovalCard(approval);
  return message;
}

function updateMessage(state: ConversationState, id: string, patch: (message: Message) => Message): Message[] {
  return state.messages.map((message) => (message.id === id ? patch(message) : message));
}

function markDelivered(state: ConversationState, personId: string): Message[] {
  return updateMessage(state, personId, (message) => ({ ...message, status: "delivered", error: undefined }));
}

function isPendingResult(result: DecisionOk | DecisionPending): result is DecisionPending {
  return "decided" in result;
}

/** Pure reducer of the conversation shown in the war room. */
export function conversationReducer(state: ConversationState, action: ConversationAction): ConversationState {
  switch (action.type) {
    case "send": {
      const text = action.text.trim();
      if (!text || state.inFlight || state.pendingApprovalId) return state;
      const message: Message = {
        id: action.id,
        author: "person",
        text,
        createdAt: action.createdAt,
        status: "sending",
      };
      return { ...state, messages: [...state.messages, message], inFlight: action.id };
    }
    case "final": {
      if (state.inFlight !== action.personId) return state;
      return {
        ...state,
        conversationId: action.result.conversationId,
        inFlight: undefined,
        messages: [
          ...markDelivered(state, action.personId),
          agentMessage(action.id, action.createdAt, action.result, action.requestId),
        ],
      };
    }
    case "pending": {
      if (state.inFlight !== action.personId) return state;
      return {
        ...state,
        conversationId: action.result.conversationId,
        inFlight: undefined,
        pendingApprovalId: action.result.approval.id,
        messages: [
          ...markDelivered(state, action.personId),
          agentMessage(action.id, action.createdAt, action.result, action.requestId, action.result.approval),
        ],
      };
    }
    case "failed": {
      if (state.inFlight !== action.personId) return state;
      return {
        ...state,
        inFlight: undefined,
        messages: updateMessage(state, action.personId, (message) => ({
          ...message,
          status: "error",
          error: action.error,
        })),
      };
    }
    case "retry": {
      if (state.inFlight || state.pendingApprovalId) return state;
      const target = state.messages.find((message) => message.id === action.personId);
      if (!target || target.author !== "person" || target.status !== "error") return state;
      return {
        ...state,
        inFlight: action.personId,
        messages: updateMessage(state, action.personId, (message) => ({
          ...message,
          status: "sending",
          error: undefined,
        })),
      };
    }
    case "reset":
      return initialConversation;
    case "approval": {
      const messages = state.messages.map((message) =>
        message.approval?.id === action.approvalId
          ? { ...message, approval: approvalReducer(message.approval, action.action) }
          : message,
      );
      const card = messages.find((message) => message.approval?.id === action.approvalId)?.approval;
      const cleared = card && isFinalState(card.state) && state.pendingApprovalId === action.approvalId;
      return { ...state, messages, pendingApprovalId: cleared ? undefined : state.pendingApprovalId };
    }
    case "decided": {
      const finalApproval = isPendingResult(action.result) ? action.result.decided : action.result.approval;
      const newApproval = isPendingResult(action.result) ? action.result.approval : undefined;
      const afterCard = conversationReducer(state, {
        type: "approval",
        approvalId: action.approvalId,
        action: { type: "resolved", approval: finalApproval },
      });
      return {
        ...afterCard,
        conversationId: action.result.conversationId,
        pendingApprovalId: newApproval?.id ?? (afterCard.pendingApprovalId === action.approvalId ? undefined : afterCard.pendingApprovalId),
        messages: [
          ...afterCard.messages,
          agentMessage(action.id, action.createdAt, action.result, action.requestId, newApproval),
        ],
      };
    }
    case "restore-approval": {
      if (state.messages.some((message) => message.approval?.id === action.approval.id)) {
        return { ...state, pendingApprovalId: action.approval.id };
      }
      const card = toApprovalCard(action.approval);
      const message: Message = {
        id: action.id,
        author: "agent",
        text: "",
        createdAt: action.createdAt,
        status: "delivered",
        approval: card,
      };
      return {
        ...state,
        conversationId: state.conversationId ?? action.approval.conversationId,
        messages: [...state.messages, message],
        pendingApprovalId: isFinalState(card.state) ? state.pendingApprovalId : card.id,
      };
    }
  }
}

let localIdCounter = 0;
export function newLocalId(prefix = "msg"): string {
  localIdCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${localIdCounter}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface ConversationApi {
  state: ConversationState;
  send(text: string): void;
  retry(personId: string): void;
  stopWaiting(): void;
  reset(): void;
  decide(approvalId: string, decision: Decision): void;
}

/** Wires the pure reducer to the API client. The latest client is always used. */
export function useConversation(client: ApiClient): ConversationApi {
  const [state, dispatch] = useReducer(conversationReducer, initialConversation);
  const stateRef = useRef(state);
  const clientRef = useRef(client);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const generationRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    clientRef.current = client;
  }, [client]);
  useEffect(() => () => abortRef.current?.abort(), []);

  const runChat = useCallback(async (personId: string, text: string, conversationId: string | undefined) => {
    const controller = new AbortController();
    abortRef.current = controller;
    const generation = generationRef.current;
    const result = await clientRef.current.postChat(
      conversationId ? { message: text, conversationId } : { message: text },
      { signal: controller.signal },
    );
    if (abortRef.current === controller) abortRef.current = undefined;
    if (generation !== generationRef.current) return;
    if (result.ok === "final") {
      dispatch({ type: "final", personId, id: newLocalId(), createdAt: nowIso(), result: result.data, requestId: result.requestId });
      return;
    }
    if (result.ok === "pending") {
      dispatch({ type: "pending", personId, id: newLocalId(), createdAt: nowIso(), result: result.data, requestId: result.requestId });
      return;
    }
    dispatch({ type: "failed", personId, error: result.error });
    const approvalId = result.body?.approvalId;
    if (result.error.code === "APPROVAL_PENDING" && approvalId) {
      const known = stateRef.current.messages.some((message) => message.approval?.id === approvalId);
      if (!known) {
        const approval = await clientRef.current.getApproval(approvalId);
        if (generation !== generationRef.current) return;
        if (approval.ok === "final") {
          dispatch({ type: "restore-approval", id: newLocalId(), createdAt: nowIso(), approval: approval.data });
        }
      }
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const current = stateRef.current;
      const trimmed = text.trim();
      if (!trimmed || current.inFlight || current.pendingApprovalId) return;
      const id = newLocalId();
      const action: ConversationAction = { type: "send", id, text: trimmed, createdAt: nowIso() };
      stateRef.current = conversationReducer(current, action);
      dispatch(action);
      void runChat(id, trimmed, current.conversationId);
    },
    [runChat],
  );

  const retry = useCallback(
    (personId: string) => {
      const current = stateRef.current;
      const target = current.messages.find((message) => message.id === personId);
      if (!target) return;
      const action: ConversationAction = { type: "retry", personId };
      const next = conversationReducer(current, action);
      if (next === current) return;
      stateRef.current = next;
      dispatch(action);
      void runChat(personId, target.text, current.conversationId);
    },
    [runChat],
  );

  const stopWaiting = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    generationRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = undefined;
    stateRef.current = initialConversation;
    dispatch({ type: "reset" });
  }, []);

  const decide = useCallback((approvalId: string, decision: Decision) => {
    const card = stateRef.current.messages.find((message) => message.approval?.id === approvalId)?.approval;
    if (!card || (card.state !== "pending" && card.state !== "error")) return;
    const submit: ConversationAction = { type: "approval", approvalId, action: { type: "submit", decision } };
    stateRef.current = conversationReducer(stateRef.current, submit);
    dispatch(submit);
    const generation = generationRef.current;
    void (async () => {
      const client = clientRef.current;
      const result = await client.postDecision(approvalId, decision);
      if (generation !== generationRef.current) return;
      if (result.ok === "final" || result.ok === "pending") {
        dispatch({
          type: "decided",
          approvalId,
          id: newLocalId(),
          createdAt: nowIso(),
          result: result.data,
          requestId: result.requestId,
        });
        return;
      }
      if (result.error.code === "APPROVAL_EXPIRED") {
        dispatch({ type: "approval", approvalId, action: { type: "expired", approval: result.body?.approval } });
        return;
      }
      if (result.error.code === "APPROVAL_ALREADY_DECIDED") {
        const latest = await client.getApproval(approvalId);
        if (generation !== generationRef.current) return;
        const approval = latest.ok === "final" ? latest.data : result.body?.approval;
        if (approval) {
          dispatch({
            type: "approval",
            approvalId,
            action: approval.status === "expired" ? { type: "expired", approval } : { type: "resolved", approval },
          });
          return;
        }
      }
      dispatch({ type: "approval", approvalId, action: { type: "failed", error: result.error } });
    })();
  }, []);

  return { state, send, retry, stopWaiting, reset, decide };
}

