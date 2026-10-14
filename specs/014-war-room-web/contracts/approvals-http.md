# Contract: Aprovações humanas

Ações sensíveis: `resolve_incident` e `forget_preference`. Todas as demais ferramentas executam sem aprovação.

## Objeto `Approval`

```jsonc
{
  "id": "uuid",
  "conversationId": "uuid",
  "requestId": "uuid",                 // requisição que gerou o 202
  "tool": "resolve_incident | forget_preference",
  "args": { "id": "inc-123", "summary": "..." },   // sem `reason`
  "reason": "string",
  "status": "pending | approved | denied | failed | expired",
  "createdAt": "ISO 8601",
  "decidedAt": "ISO 8601 | null",
  "result": "string | null",           // saída da ferramenta (approved) ou erro (failed)
  "resumeRequestId": "uuid | null"
}
```

## `POST /approvals/:id/decision`

Request (validado com Zod; `:id` precisa ser UUID):

```json
{ "decision": "approve" }
```

`decision ∈ { "approve", "deny" }`. Campos extras são rejeitados (`strict`).

Processamento (ver [research.md R2](../research.md#r2-como-retomar-após-a-decisão)): reivindica a ação de forma atômica, executa a ferramenta uma vez (se aprovada), anexa `[decisão] ...` à conversa e roda um novo turno do agente com a concessão.

| Status | Corpo | Quando |
|--------|-------|--------|
| **200** | igual ao 200 do `/chat`, mais `"approval": Approval` (estado final) | o agente concluiu após a decisão |
| **202** | igual ao 202 do `/chat` (com o **novo** `approval`), mais `"decided": Approval` | o agente precisou de outra ação sensível diferente |
| 400 | `{ requestId, issues }` | `:id` ou corpo inválidos |
| 404 | `{ requestId, error, code: "APPROVAL_NOT_FOUND" }` | id inexistente |
| 409 | `{ requestId, error, code: "APPROVAL_ALREADY_DECIDED", approval }` | a ação já foi decidida (não executa de novo) |
| 409 | `{ requestId, error, code: "APPROVAL_EXPIRED", approval }` | passou do TTL (`OPSPILOT_APPROVAL_TTL_MINUTES`, padrão 1440) |
| 502/503/504/500 | como no `/chat` | falha ao retomar o agente. **A decisão e a execução já ficam gravadas**; `GET /approvals/:id` mostra o estado |

Garantias:
- Execução **exatamente uma vez**: só quem vence o `UPDATE ... WHERE status='pending'` executa.
- Negar **nunca** executa a ferramenta.
- Erro da ferramenta aprovada: `status = failed`, `result` recebe a mensagem, e o agente é retomado sabendo da falha.
- A requisição de decisão é registrada em `requests`/`trace_events` como o `/chat` (o `GET /requests/:id` funciona com o `requestId` da resposta).

Exemplos: [fixtures/decision-approve-200.json](./fixtures/decision-approve-200.json) e [fixtures/decision-409.json](./fixtures/decision-409.json).

## `GET /approvals/:id`

| Status | Corpo |
|--------|-------|
| 200 | `Approval` |
| 400 | `{ issues }` |
| 404 | `{ error, code: "APPROVAL_NOT_FOUND" }` |

Usado pela war room para obter o estado final depois de um 409.
