# Model Resilience Contract

Módulos: `src/agents/model.ts`, `src/agents/model-usage.ts`.

## `createResilientModel(options): ResilientModel`

```ts
type ResilientModelOptions = {
  primary: BaseChatModel;
  fallback: BaseChatModel;
  primaryModel: string;   // id reportado em modelUsed/fromModel
  fallbackModel: string;  // id reportado em modelUsed/toModel
  retry?: { stopAfterAttempt?: number }; // default 3
};
```

Garantias:

1. Toda chamada (`invoke`, runnable de `bindTools`, runnable de
   `withStructuredOutput`) tenta o primário primeiro, sempre — sem estado
   entre chamadas.
2. Erro retentável no primário → até `stopAfterAttempt` tentativas no total.
3. Erro com `status ∈ {400,401,403,404,422}` → sem retentativa; segue ao reserva.
4. Primário esgotado → uma tentativa no reserva com a mesma derivação
   (mesmas tools / mesmo schema).
5. Sucesso → `recordModelUsed(id)`; se foi o reserva, antes
   `recordFallback({ fromModel, toModel, reason })`.
6. Reserva falha → lança `ModelUnavailableError` (`cause` = erro do primário).
7. Não lê `process.env`.

## `createOpenRouterModel(): ResilientModel`

Composição de produção: lê `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`,
`OPENROUTER_MODEL_FALLBACK` (lança `"<VAR> is required"`), cria dois
`ChatOpenAI` (`temperature: 0`, `maxRetries: 0`, mesma `baseURL`) e delega a
`createResilientModel`.

Consumidores que tipam `ReturnType<typeof createOpenRouterModel>` passam a
receber `ResilientModel` sem mudar a chamada, exceto:

| Consumidor               | Mudança                                                    |
|--------------------------|------------------------------------------------------------|
| `react.ts`               | `createReactAgent({ llm: () => model.bindTools(tools), … })` |
| `production-graph.ts`    | `routerNode` relança `ModelUnavailableError` (não vira `ROUTER_FAILED`) |
| demais (`plan-and-execute`, `reflection`, `learning-reflector`, `history-summarizer`, `arena`, `bench`) | só tipo |

## `model-usage.ts`

```ts
runWithModelUsage<T>(fn: () => Promise<T>): Promise<{ result: T; modelUsed?: string }>;
recordModelUsed(model: string): void;          // no-op fora de escopo
recordFallback(record: FallbackRecord): void;  // no-op fora de escopo
drainFallbacks(): FallbackRecord[];            // [] fora de escopo
```

Escopos aninhados/concorrentes são independentes (`AsyncLocalStorage`).

## Integração com o grafo de produção (011)

- `runProductionGraph` executa `graph.invoke` dentro de `runWithModelUsage`
  e acrescenta `modelUsed` às `metrics` quando definido.
- Nós `router` e de estratégia (`react`, `plan-and-execute`, `reflect`)
  chamam `drainFallbacks()` ao terminar e prefixam o próprio trace com os
  eventos `fallback` carimbados com seu `node`.
- `ModelUnavailableError` atravessa o grafo sem conversão.
