# Chat HTTP Contract (extensão resiliência de modelo)

Estende o contrato de 011 (`specs/011-unified-production-graph/contracts/chat-http.md`).
Request inalterado.

## Success response `200`

`metrics` ganha campo opcional:

```json
{ "metrics": { "llmCalls": 2, "latencyMs": 812, "modelUsed": "openai/gpt-4o-mini" } }
```

`trace` pode conter, quando o reserva foi acionado:

```json
{
  "type": "fallback",
  "fromModel": "anthropic/claude-sonnet-5.5",
  "toModel": "openai/gpt-4o-mini",
  "reason": "503 Provider returned error",
  "node": "react"
}
```

Ausência de evento `fallback` ⇔ todas as chamadas do turno concluíram no
primário (`modelUsed = OPENROUTER_MODEL`).

## Error responses

| Status | Quando                                         | Corpo |
|--------|------------------------------------------------|-------|
| 400    | Zod / JSON inválido                            | inalterado |
| 404    | conversa inexistente                           | inalterado |
| 422    | strategy desconhecida                          | inalterado |
| 502    | `ROUTER_FAILED` (roteador respondeu inválido); `PROVIDER_ERROR` fora da cadeia | inalterado |
| **503**| **primário e reserva falharam**                | `{ "error": "Language model service unavailable", "code": "MODEL_SERVICE_UNAVAILABLE" }` |
| 504    | `CHAT_TIMEOUT_MS` estourou (precede o 503)     | inalterado |

O corpo 503 não inclui `cause`, stack nem mensagem do provedor.

## Composition

Inalterada em relação a 011. Em falha total, o turno do usuário já foi
anexado à conversa (passo 4) e nenhuma resposta do assistente é gravada —
mesmo comportamento atual de 502/504.
