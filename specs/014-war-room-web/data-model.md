# Data Model: War Room Web

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

## API (servidor)

### Approval (tabela `approvals`, nova)

| Campo | Tipo | Regras |
|-------|------|--------|
| `id` | TEXT PK | UUID v4 gerado pelo servidor |
| `conversation_id` | TEXT NOT NULL | conversa em que a ação surgiu |
| `request_id` | TEXT NOT NULL | requisição que gerou o 202 |
| `user_id` | TEXT NULL | `userId` da requisição original; restaurado ao executar |
| `tool` | TEXT NOT NULL | `CHECK (tool IN ('resolve_incident','forget_preference'))` |
| `args` | TEXT NOT NULL | JSON dos argumentos **sem** `reason` |
| `reason` | TEXT NOT NULL | motivo exibido (R3) |
| `original_message` | TEXT NOT NULL | mensagem da pessoa que originou o turno |
| `status` | TEXT NOT NULL | `CHECK (status IN ('pending','approved','denied','failed'))`, default `pending` |
| `created_at` | TEXT NOT NULL | ISO 8601 UTC |
| `decided_at` | TEXT NULL | ISO 8601 UTC; obrigatório quando status ≠ `pending` |
| `result` | TEXT NULL | saída serializada da ferramenta (aprovada) ou mensagem de erro (`failed`) |
| `resume_request_id` | TEXT NULL | requisição de decisão que retomou o agente |

Índice: `idx_approvals_conversation_status (conversation_id, status)`.

**Estado derivado**: `expired` = `status = 'pending' AND created_at + TTL < now`. Ele é calculado na leitura e nunca gravado.

**Transições** (função pura `applyDecision(approval, decision, now, ttl)`):

```text
pending ──approve──▶ approved ──(execução lança erro)──▶ failed
   │
   ├────deny──────▶ denied
   │
   └──(TTL vencido)──▶ expired (derivado; decisão → 409 APPROVAL_EXPIRED)
approved | denied | failed ──qualquer decisão──▶ 409 APPROVAL_ALREADY_DECIDED
```

`ApprovalStore`:
- `create(input): Approval`
- `get(id): Approval | undefined`
- `findPending(conversationId, now): Approval | undefined`
- `claim(id, status: 'approved'|'denied', decidedAt): boolean`: o `UPDATE ... WHERE status='pending'` atômico.
- `complete(id, { status, result, resumeRequestId })`
- `close()`

### ApprovalContext (memória, por requisição; `AsyncLocalStorage`)

| Campo | Descrição |
|-------|-----------|
| `grants` | `Array<{ tool, args, outcome: 'approved'\|'denied', result? }>`: concessões válidas neste turno (só na retomada) |
| `pending` | `{ tool, args, reason? } \| undefined`: a primeira ação sensível bloqueada no turno |

Função pura `decideGate(ctx, call) → { kind: 'execute' } | { kind: 'replay', result } | { kind: 'deny' } | { kind: 'hold', first: boolean }`. As chamadas são comparadas por `tool` mais o JSON canônico dos `args`, sem `reason`.

### Mudanças em entidades existentes

- `resolveIncidentSchema` e `forgetPreferenceSchema`: ganham `reason?: string` (aditivo).
- `RequestRecordInput` e `toRequestRecord`: o trace e as métricas passam a ser persistidos também em **202** (`ok = status === 200 || status === 202`). O registro passa a valer também para `POST /approvals/:id/decision`.
- `ChatOutcome`: ganha `approvalId?`.

## Web (cliente)

Todos os tipos são derivados de esquemas Zod em `web/src/api/schemas.ts`. Os nomes batem com os de [contracts/](./contracts/).

### TraceEvent (união discriminada + reserva)

`route | thought | action | observation | plan | critique | answer | summarize | fallback`, cada um com `node?`, mais `{ type: string; [k]: unknown }` como reserva (`UnknownTraceEvent`). O esquema tenta a união conhecida primeiro e, se falhar, aceita a reserva (FR-009).

### ChatResult (200) / PendingApprovalResult (202)

Ver [contracts/chat-http.md](./contracts/chat-http.md) e [contracts/approvals-http.md](./contracts/approvals-http.md).

### Message (estado da UI)

| Campo | Tipo |
|-------|------|
| `id` | string local |
| `author` | `'person' \| 'agent' \| 'system'` |
| `text` | string |
| `createdAt` | ISO string |
| `status` | `'sending' \| 'delivered' \| 'error'` |
| `requestId?` | string |
| `route?`, `metrics?`, `trace?` | apenas em `agent` |
| `error?` | `UiError` (abaixo) |
| `approval?` | `ApprovalCard` (quando a resposta foi 202) |

### ApprovalCard

`{ id, tool, args, reason, createdAt, state: 'pending'|'submitting'|'approved'|'denied'|'failed'|'expired'|'error', decidedAt?, errorMessage? }`

Transições na UI (redutor puro `approvalReducer`):

```text
pending ─click─▶ submitting ─200/202─▶ approved | denied
                     │
                     ├─409 ALREADY_DECIDED─▶ estado final lido em GET /approvals/:id
                     ├─409 EXPIRED────────▶ expired
                     └─erro de rede/5xx───▶ error ─click─▶ submitting
```

### Conversation (estado da UI, memória da aba)

`{ conversationId?: string; apiUrl: string; messages: Message[]; pendingApprovalId?: string }`. Enquanto `pendingApprovalId` estiver definido, o envio fica bloqueado (FR-015).

### UiError (mapeamento puro `toUiError(status, body, kind)`)

| Origem | `code` | Título | Ação sugerida |
|--------|--------|--------|---------------|
| 400 | `VALIDATION_ERROR`/`INVALID_JSON` | Mensagem não aceita | Revisar e reenviar |
| 404 `CONVERSATION_NOT_FOUND` | — | A conversa não existe mais no servidor | Nova conversa e reenviar |
| 409 `APPROVAL_PENDING` | — | Há uma decisão pendente | Decidir o cartão |
| 422 | `UNKNOWN_STRATEGY` | Estratégia não suportada | Reenviar |
| 502 | `ROUTER_FAILED`/`PROVIDER_ERROR` | Falha no provedor de IA | Tentar novamente |
| 503 | `MODEL_SERVICE_UNAVAILABLE` | Modelos indisponíveis | Tentar em instantes |
| 504 | `CHAT_TIMEOUT` | O agente demorou demais | Reenviar |
| 500 | `INTERNAL_ERROR` | Erro interno da API | Tentar novamente |
| rede/CORS | `NETWORK` | Não foi possível falar com a API | Abrir a engrenagem |
| corpo inválido | `BAD_RESPONSE` | Resposta inesperada da API | Tentar novamente |

### Settings (localStorage)

| Chave | Valor | Validação |
|-------|-------|-----------|
| `opspilot.apiUrl` | URL | Zod: `http:` ou `https:` sem credenciais; barra final removida |
| `opspilot.theme` | `'light'\|'dark'\|'system'` | enum; padrão `system` |
