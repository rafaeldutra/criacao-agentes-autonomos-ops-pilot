import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import type { Grant } from "../approvals/approval-gate.js";
import type { ApprovalService } from "../approvals/approval-service.js";
import {
  ApprovalAlreadyDecidedError,
  ApprovalExpiredError,
  ApprovalNotFoundError,
  type Approval,
  type ApprovalView,
} from "../store/approval-store.js";
import { getRequestId, setChatOutcome, type ChatOutcome } from "./request-trace.js";

type Reply = (status: number, body: object, outcome?: ChatOutcome) => void;

const approvalIdParam = z.uuid();
const decisionBodySchema = z.object({ decision: z.enum(["approve", "deny"]) }).strict();

export type DecisionHandlerDeps<Turn> = {
  service: ApprovalService;
  view: (approval: Approval) => ApprovalView;
  reply: (response: Response, requestId: string) => Reply;
  /** Resumes the agent in the approval's conversation with the decision's grant. */
  runTurn: (approval: Approval, message: string, grants: Grant[], requestId: string) => Promise<Turn>;
  replyTurn: (
    reply: Reply,
    turn: Turn,
    context: { requestId: string; originalMessage: string; userId?: string; decided?: ApprovalView },
  ) => unknown;
  replyTurnError: (reply: Reply, error: unknown) => boolean;
};

/** POST /approvals/:id/decision — claim, execute once if approved, then resume the agent. */
export const decisionHandler = <Turn>(deps: DecisionHandlerDeps<Turn>) =>
  async (request: Request, response: Response) => {
    const requestId = getRequestId(response);
    const reply = deps.reply(response, requestId);

    const id = approvalIdParam.safeParse(request.params.id);
    const body = decisionBodySchema.safeParse(request.body);
    if (!id.success || !body.success) {
      const issues = [...(id.success ? [] : id.error.issues), ...(body.success ? [] : body.error.issues)];
      reply(400, { issues }, { errorCode: "VALIDATION_ERROR" });
      return;
    }

    const existing = deps.service.find(id.data);
    if (existing) {
      setChatOutcome(response, { conversationId: existing.conversationId, userId: existing.userId ?? undefined, reflect: false });
    }

    try {
      const { approval, turn } = await deps.service.decide(id.data, body.data.decision, {
        requestId,
        runTurn: (message, grants) => deps.runTurn(deps.service.get(id.data), message, grants, requestId),
      });
      deps.replyTurn(reply, turn, {
        requestId,
        originalMessage: approval.originalMessage,
        userId: approval.userId ?? undefined,
        decided: deps.view(approval),
      });
    } catch (error) {
      if (error instanceof ApprovalNotFoundError) {
        reply(404, { error: error.message, code: error.code }, { errorCode: error.code });
        return;
      }
      if (error instanceof ApprovalAlreadyDecidedError || error instanceof ApprovalExpiredError) {
        reply(409, { error: error.message, code: error.code, approval: deps.view(error.approval) }, { errorCode: error.code });
        return;
      }
      if (deps.replyTurnError(reply, error)) return;
      throw error;
    }
  };

/** GET /approvals/:id — current state, used by the war room after a 409. */
export const getApprovalHandler = (deps: { service: ApprovalService; view: (approval: Approval) => ApprovalView }) =>
  (request: Request, response: Response, next: NextFunction) => {
    const id = approvalIdParam.safeParse(request.params.id);
    if (!id.success) {
      response.status(400).json({ issues: id.error.issues });
      return;
    }
    try {
      response.status(200).json(deps.view(deps.service.get(id.data)));
    } catch (error) {
      if (error instanceof ApprovalNotFoundError) {
        response.status(404).json({ error: error.message, code: error.code });
        return;
      }
      next(error);
    }
  };
