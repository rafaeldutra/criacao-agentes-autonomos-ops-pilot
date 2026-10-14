import { apiErrorSchema } from "./schemas";

export type UiErrorAction = "retry" | "new-conversation" | "open-settings" | "decide-approval";

export interface UiError {
  code: string;
  title: string;
  description: string;
  action: UiErrorAction;
  requestId?: string;
  /** HTTP status when the error came from an HTTP response. */
  status?: number;
}

export type UiErrorInput =
  | { kind: "http"; status: number; body: unknown; requestId?: string }
  | { kind: "network" }
  | { kind: "aborted" }
  | { kind: "bad-response"; requestId?: string };

type Template = Omit<UiError, "code" | "requestId" | "status">;

const TEMPLATES = {
  validation: {
    title: "Mensagem não aceita",
    description: "A API recusou o formato da mensagem. Nada foi processado. Revise o texto e envie novamente.",
    action: "retry",
  },
  conversationNotFound: {
    title: "A conversa não existe mais no servidor",
    description: "O histórico desta conversa não está disponível na API. Inicie uma nova conversa e reenvie a mensagem.",
    action: "new-conversation",
  },
  approvalNotFound: {
    title: "A ação pendente não foi encontrada",
    description: "A API não reconhece esta ação. Inicie uma nova conversa para continuar.",
    action: "new-conversation",
  },
  approvalPending: {
    title: "Há uma decisão pendente",
    description: "O agente aguarda sua decisão sobre uma ação sensível. Aprove ou negue o cartão antes de enviar outra mensagem.",
    action: "decide-approval",
  },
  approvalAlreadyDecided: {
    title: "Esta ação já foi decidida",
    description: "Outra decisão já foi registrada para esta ação. Nada foi executado de novo.",
    action: "retry",
  },
  approvalExpired: {
    title: "A ação expirou",
    description: "O prazo para decidir esta ação acabou e ela não foi executada. Peça ao agente novamente se ainda for necessária.",
    action: "new-conversation",
  },
  unknownStrategy: {
    title: "Estratégia não suportada",
    description: "A API não reconheceu a estratégia pedida. A mensagem não foi processada. Tente enviar de novo.",
    action: "retry",
  },
  provider: {
    title: "Falha no provedor de IA",
    description: "O provedor do modelo respondeu com erro e o agente não concluiu. Tente novamente.",
    action: "retry",
  },
  modelsUnavailable: {
    title: "Modelos indisponíveis",
    description: "Nenhum modelo de IA está disponível agora e a mensagem não foi respondida. Tente novamente em instantes.",
    action: "retry",
  },
  timeout: {
    title: "O agente demorou demais",
    description: "A resposta passou do tempo limite e foi descartada. Reenvie a mensagem; perguntas mais específicas costumam ser mais rápidas.",
    action: "retry",
  },
  internal: {
    title: "Erro interno da API",
    description: "A API falhou ao processar a mensagem. Tente novamente; se persistir, informe o ID da requisição.",
    action: "retry",
  },
  network: {
    title: "Não foi possível falar com a API",
    description: "A mensagem não chegou à API. Verifique a URL nas configurações, se a API está no ar e se ela autoriza esta origem (CORS).",
    action: "open-settings",
  },
  aborted: {
    title: "Espera cancelada",
    description: "Você parou de esperar pela resposta. A mensagem pode ter sido processada pela API; reenvie se precisar.",
    action: "retry",
  },
  badResponse: {
    title: "Resposta inesperada da API",
    description: "A API respondeu num formato que a war room não reconhece, então a resposta não foi exibida. Tente novamente.",
    action: "retry",
  },
} satisfies Record<string, Template>;

function fromHttp(status: number, code: string | undefined): { code: string; template: Template } {
  switch (code) {
    case "CONVERSATION_NOT_FOUND":
      return { code, template: TEMPLATES.conversationNotFound };
    case "APPROVAL_NOT_FOUND":
      return { code, template: TEMPLATES.approvalNotFound };
    case "APPROVAL_PENDING":
      return { code, template: TEMPLATES.approvalPending };
    case "APPROVAL_ALREADY_DECIDED":
      return { code, template: TEMPLATES.approvalAlreadyDecided };
    case "APPROVAL_EXPIRED":
      return { code, template: TEMPLATES.approvalExpired };
    default:
      break;
  }
  if (status === 400) return { code: code ?? "VALIDATION_ERROR", template: TEMPLATES.validation };
  if (status === 404) return { code: code ?? "NOT_FOUND", template: TEMPLATES.conversationNotFound };
  if (status === 422) return { code: code ?? "UNKNOWN_STRATEGY", template: TEMPLATES.unknownStrategy };
  if (status === 502) return { code: code ?? "PROVIDER_ERROR", template: TEMPLATES.provider };
  if (status === 503) return { code: code ?? "MODEL_SERVICE_UNAVAILABLE", template: TEMPLATES.modelsUnavailable };
  if (status === 504) return { code: code ?? "CHAT_TIMEOUT", template: TEMPLATES.timeout };
  return { code: code ?? "INTERNAL_ERROR", template: TEMPLATES.internal };
}

/** Pure mapping from a failed API interaction to a user-facing pt-BR error (data-model.md#uierror). */
export function toUiError(input: UiErrorInput): UiError {
  switch (input.kind) {
    case "network":
      return { code: "NETWORK", ...TEMPLATES.network };
    case "aborted":
      return { code: "ABORTED", ...TEMPLATES.aborted };
    case "bad-response":
      return withRequestId({ code: "BAD_RESPONSE", ...TEMPLATES.badResponse }, input.requestId);
    case "http": {
      const parsed = apiErrorSchema.safeParse(input.body);
      const body = parsed.success ? parsed.data : {};
      const { code, template } = fromHttp(input.status, body.code);
      return withRequestId({ code, status: input.status, ...template }, body.requestId ?? input.requestId);
    }
  }
}

function withRequestId(error: UiError, requestId: string | undefined): UiError {
  return requestId ? { ...error, requestId } : error;
}
