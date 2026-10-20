# Contract: `POST /chat` (delta da 014)

Base: contrato da 013 (`specs/013-persisted-trace-logs/contracts/chat-http.md`). Esta feature **acrescenta** os itens abaixo e mantém todo o resto.

## Request

Sem mudanças: `{ message, strategy?, reflect?, conversationId?, userId? }`.

## Respostas

### 200: resposta final (inalterada)

```jsonc
{
  "requestId": "uuid",
  "conversationId": "uuid",
  "answer": "string",
  "route": "react | plan-and-execute | reflect",
  "trace": [TraceEvent],
  "metrics": { "llmCalls": 0, "latencyMs": 0, "historyMessages": 0, "memoryFacts": 0,
               "learningQueued": false, "promptTokens?": 0, "modelUsed?": "string",
               "contextBreakdown?": { "memory": 0, "history": 0, "message": 0, "summary": 0 } }
  // demais campos atuais (prompt, keptHistory, keptMemories) continuam presentes;
  // a web os ignora
}
```

### 202: ação aguardando aprovação (novo)

Emitido quando o turno tentou `resolve_incident` ou `forget_preference` sem concessão. A ação **não** foi executada.

```jsonc
{
  "requestId": "uuid",
  "conversationId": "uuid",
  "status": "pending_approval",
  "answer": "string",            // texto do agente no fim do turno (pode estar vazio)
  "route": "react | plan-and-execute | reflect",
  "trace": [TraceEvent],         // inclui a action pendente e a observação APPROVAL_REQUIRED
  "metrics": { ... },            // como no 200
  "approval": Approval           // ver approvals-http.md
}
```

Exemplo: [fixtures/chat-202.json](./fixtures/chat-202.json).

### 409: conversa com ação pendente (novo)

```json
{ "requestId": "uuid", "error": "Conversation has a pending approval", "code": "APPROVAL_PENDING", "approvalId": "uuid" }
```

Nada é anexado à conversa e o agente não roda.

### Erros existentes

400, 404 `CONVERSATION_NOT_FOUND`, 422 `UNKNOWN_STRATEGY`, 502 `ROUTER_FAILED`/`PROVIDER_ERROR`, 503 `MODEL_SERVICE_UNAVAILABLE`, 504 `CHAT_TIMEOUT` e 500 `INTERNAL_ERROR` ficam inalterados.

## TraceEvent

```ts
type GraphNode = "context" | "router" | "react" | "plan-and-execute" | "reflect" | "response";
type TraceEvent =
  | { type: "thought";     content: string; node?: GraphNode }
  | { type: "action";      tool: string; args: Record<string, unknown>; node?: GraphNode }
  | { type: "observation"; content: string; node?: GraphNode }
  | { type: "plan";        steps: { id: number; description: string; tool?: string;
                                    args?: Record<string, unknown>;
                                    status: "pending" | "completed" | "failed" }[]; node?: GraphNode }
  | { type: "critique";    content: string; node?: GraphNode }
  | { type: "answer";      content: string; node?: GraphNode }
  | { type: "summarize";   content: string; node?: GraphNode }
  | { type: "route";       route: "react" | "plan-and-execute" | "reflect"; reason: string; node?: GraphNode }
  | { type: "fallback";    fromModel: string; toModel: string; reason: string; node?: GraphNode };
```

Consumidores **devem** aceitar tipos desconhecidos (`{ type: string, ... }`) sem falhar.

## Persistência (delta da 013)

- `toRequestRecord` persiste métricas e trace também em **202**. O `GET /requests/:id` de um 202 devolve o trace parcial.

> **Ver também: 016** — a rota `team`, os nós `team | supervisor | analista | planejador | executor` e o evento `handoff` são acréscimos descritos em [specs/016-team-supervisor-mode/contracts/chat-http.md](../../016-team-supervisor-mode/contracts/chat-http.md).
