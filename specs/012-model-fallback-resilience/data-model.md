# Data Model: Resiliência e Fallback de Modelos

Sem schema SQLite novo. Entidades em memória e de contrato.

## ModelConfig

Lida só em `createOpenRouterModel()` (`src/agents/model.ts`).

| Variável                    | Obrigatória | Uso                                  |
|-----------------------------|-------------|--------------------------------------|
| `OPENROUTER_API_KEY`        | sim         | credencial compartilhada (FR-004)    |
| `OPENROUTER_MODEL`          | sim         | id do primário                       |
| `OPENROUTER_MODEL_FALLBACK` | sim         | id do reserva (FR-001)               |

`baseURL` fixa `https://openrouter.ai/api/v1` para os dois. Ausência →
`Error("<VAR> is required")` na inicialização.

## RetryPolicy

| Campo              | Tipo     | Default | Regra                                   |
|--------------------|----------|---------|-----------------------------------------|
| `stopAfterAttempt` | `number` | `3`     | inteiro ≥ 1; total de tentativas        |

Não retentável: `status ∈ {400, 401, 403, 404, 422}` → aborta e segue ao
reserva. Demais erros (429, 5xx, rede, sem `status`) → retenta.
`ChatOpenAI.maxRetries = 0` nos dois modelos.

## ResilientModel

```ts
type ResilientModel = {
  readonly primaryModel: string;
  readonly fallbackModel: string;
  invoke(input: BaseLanguageModelInput): Promise<AIMessageChunk>;
  bindTools(tools: BindToolsInput[]): Runnable<BaseLanguageModelInput, AIMessageChunk>;
  withStructuredOutput<T extends Record<string, unknown>>(schema): Runnable<BaseLanguageModelInput, T>;
};
```

Cada método produz `primary'.withRetry(policy).withFallbacks([fallback'])`,
onde `'` é a mesma derivação (tools/schema) aplicada aos dois modelos.

## ModelUsageScope (por turno)

Estado em `AsyncLocalStorage`, `src/agents/model-usage.ts`.

| Campo       | Tipo                     | Regra                                    |
|-------------|--------------------------|------------------------------------------|
| `modelUsed` | `string \| undefined`    | sobrescrito a cada chamada concluída     |
| `fallbacks` | `FallbackRecord[]`       | append na comutação; `drainFallbacks()` esvazia |

Criado novo em cada `runProductionGraph`; nunca compartilhado entre turnos.
Fora de escopo, `record*` é no-op.

### Transições de uma chamada

```text
primary attempt ─ok──────────────────────────▶ record(modelUsed=primary)
      │fail (retentável, tentativas restantes) ─▶ primary attempt
      │fail (não retentável ou esgotado)
      ▼
fallback attempt ─ok─▶ recordFallback + record(modelUsed=fallback)
      │fail
      ▼
throw ModelUnavailableError(cause = erro do primário)
```

## FallbackTraceEvent

Nova variante de `TraceEvent` (`src/agents/types.ts`):

```ts
{ type: "fallback"; fromModel: string; toModel: string; reason: string; node?: GraphNode }
```

| Campo       | Regra                                                         |
|-------------|---------------------------------------------------------------|
| `fromModel` | `OPENROUTER_MODEL`                                            |
| `toModel`   | `OPENROUTER_MODEL_FALLBACK`                                   |
| `reason`    | `"<status> <primeira linha da mensagem>"`, ≤ 200 chars, sem stack |
| `node`      | nó do grafo onde ocorreu (`router`, `react`, …)               |

Um evento por comutação (pode haver vários num turno). Helper puro
`fallback(fromModel, toModel, reason)` em `trace.ts`; `formatTrace` imprime
`[fallback@<node>] <from> -> <to> (<reason>)`.

## Metrics (extensão)

| Campo       | Tipo                  | Regra                                          |
|-------------|-----------------------|------------------------------------------------|
| `modelUsed` | `string \| undefined` | id configurado da última chamada concluída no turno; omitido se não houve chamada |

## ModelUnavailableError

| Campo     | Valor                                    |
|-----------|------------------------------------------|
| classe    | `ModelUnavailableError extends DomainError` |
| `code`    | `MODEL_SERVICE_UNAVAILABLE`              |
| `message` | `"Language model service unavailable"`   |
| `cause`   | erro original (não serializado no HTTP)  |

HTTP: `503 { "error": "Language model service unavailable", "code": "MODEL_SERVICE_UNAVAILABLE" }`.
