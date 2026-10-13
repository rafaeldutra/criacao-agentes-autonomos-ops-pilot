# Research: Resiliência e Fallback de Modelos

Base instalada: `@langchain/core` 1.2.9, `@langchain/langgraph` 1.4.14,
`@langchain/openai` 1.5.11.

## Decision: Fábrica devolve `ResilientModel`, não um `Runnable` único

**Decision**: `createOpenRouterModel()` passa a devolver um objeto
`ResilientModel` com a mesma superfície que os consumidores já usam —
`invoke(messages)`, `bindTools(tools)` e `withStructuredOutput(schema)` — mais
`primaryModel`/`fallbackModel` (ids). Cada método monta a cadeia sobre o
runnable *derivado*:

```text
resilient(p, f) = p.withRetry(retry).withFallbacks([f])   (+ tradução de erro)
invoke              → resilient(primary,                      fallback)
bindTools(t)        → resilient(primary.bindTools(t),         fallback.bindTools(t))
withStructuredOutput(s) → resilient(primary.withStructuredOutput(s), fallback.withStructuredOutput(s))
```

**Rationale**: `withRetry` devolve `RunnableRetry` e `withFallbacks` devolve
`RunnableWithFallbacks`; nenhum dos dois expõe `bindTools` nem
`withStructuredOutput`. Hoje `plan-and-execute.ts`, `production-graph.ts`
(roteador), `reflection.ts` (crítico) e `learning-reflector.ts` chamam esses
métodos no modelo. Aplicar a cadeia depois de derivar mantém o mesmo esquema/
ferramentas nos dois modelos (edge case de structured output) e cumpre FR-002/
FR-003 literalmente.

**Alternatives considered**: Subclasse de `BaseChatModel` que delega `_generate`
— rejeitada (reimplementa `bindTools`/parsing, mais código e risco).
`ChatOpenAI` com `maxRetries` e sem fallback — não cumpre FR-003.
`withFallbacks` aplicado só no `invoke` — quebra tools e structured output.

## Decision: ReAct recebe o modelo como função dinâmica

**Decision**: `createReactStrategy` passa
`llm: () => model.bindTools(Object.values(tools))` ao `createReactAgent`.

**Rationale**: Verificado em
`node_modules/@langchain/langgraph/dist/prebuilt/react_agent_executor.js`: com
`llm` estático, `_bindTools` exige `ChatModel`/`RunnableBinding`/
`RunnableSequence` e lança `must define bindTools` para `RunnableWithFallbacks`.
O tipo `llm` aceita `(state, runtime) => LanguageModelLike`; nesse caminho
(`_getDynamicModel`) o retorno é usado como está, sem rebind. Não usamos
`responseFormat`, único caminho que exige `ChatModel` real.

**Alternatives considered**: Substituir `createReactAgent` por laço próprio —
rejeitada (mudança grande fora do escopo).

## Decision: Uma única camada de retentativa

**Decision**:

- `ChatOpenAI` primário e reserva com `maxRetries: 0` (desliga o retry interno
  do cliente OpenAI/AsyncCaller, que por padrão tenta várias vezes).
- Primário: `withRetry({ stopAfterAttempt: 3, onFailedAttempt })` — 1 tentativa
  + 2 retentativas (Assumptions da spec).
- `onFailedAttempt` relança (aborta retentativa e segue para o fallback) quando
  o erro tem `status` em `400, 401, 403, 404, 422` — falhas não transitórias.
  Retenta 408, 409, 429, 5xx, erros de rede e erros sem `status`.
- Reserva: uma tentativa, sem `withRetry` (preserva orçamento de tempo).
- `retry` injetável (`stopAfterAttempt`) para testes.

**Rationale**: Retentativas empilhadas (cliente × `withRetry`) multiplicariam
o tempo até o fallback e esgotariam `CHAT_TIMEOUT_MS`. `RunnableRetry` usa o
`p-retry` vendorizado (`core/dist/runnables/base.js`, `pRetry(..., {
onFailedAttempt, retries, randomize: true })`): lançar dentro de
`onFailedAttempt` interrompe o laço. Backoff padrão do `p-retry` (~1s, fator 2)
é aceitável em produção; nos testes usar `stopAfterAttempt` baixo.

**Alternatives considered**: Retentar tudo, inclusive 401 — rejeitada (gasta
tempo sem chance de sucesso). Retry também no reserva — rejeitada (latência).

## Decision: Falha total vira `ModelUnavailableError` (503)

**Decision**: `ModelUnavailableError extends DomainError` com código
`MODEL_SERVICE_UNAVAILABLE`, em `src/agents/model.ts`. A cadeia resiliente
captura o erro final do `RunnableWithFallbacks` (que relança o *primeiro* erro,
do primário) e lança `ModelUnavailableError` com `cause` = erro original.
Mensagem pública fixa: `"Language model service unavailable"`.

Pontos de captura a ajustar:

- `production-graph.ts` `routerNode`: hoje converte **qualquer** erro em
  `RouterError` (502). Passa a relançar `ModelUnavailableError` sem conversão.
- `server.ts` `chatHandler`: `isModelUnavailable` → `503 { error, code }`
  antes do rethrow; checado depois de `isTimeout` (504 vence se o teto global
  estourar primeiro — edge case da spec).
- `isProviderError`/502 continua para erros de provedor que escapem da cadeia
  (ex.: arena/bench).

Caminhos fora do turno que já engolem erro continuam iguais: sumarizador (009,
`onError`) e learning (007, background).

**Rationale**: Constituição III (erro de domínio traduzido na borda); FR-010,
FR-011, SC-003. Mensagem fixa evita vazar detalhes do provedor.

**Alternatives considered**: Detectar falha total por regex no handler —
rejeitada (frágil, indistinguível de 502). Código 502 — rejeitado pela spec.

## Decision: Rastreio por escopo `AsyncLocalStorage` do turno

**Decision**: Novo módulo `src/agents/model-usage.ts`, no mesmo padrão de
`src/http/request-context.ts`:

- `runWithModelUsage(fn)` abre um escopo `{ modelUsed?, fallbacks[] }`.
- A cadeia resiliente chama `recordModelUsed(id)` ao concluir com sucesso
  (primário ou reserva) e `recordFallback({ fromModel, toModel, reason })`
  quando o reserva é acionado. O motivo vem do último erro do primário
  (guardado em `onFailedAttempt`/catch), sanitizado: `status` + primeira linha
  da mensagem, ≤ 200 caracteres, sem stack.
- `drainFallbacks()` devolve e limpa os eventos pendentes.
- Fora de escopo (arena, bench, sumarizador pós-turno) as chamadas são no-op.

`runProductionGraph` envolve `graph.invoke` em `runWithModelUsage`. Os nós
`router` e de estratégia drenam os fallbacks ocorridos durante sua execução e
os inserem no início do próprio trace com o `node` do nó. Ao final,
`metrics.modelUsed` = último modelo que concluiu uma chamada no turno.

**Rationale**: O modelo é criado uma vez no boot e compartilhado entre
requisições concorrentes; estado em closure misturaria turnos. ALS já é usado
com sucesso através de `createReactAgent` (tools leem `getUserId()`), então a
propagação pelo LangChain/LangGraph está comprovada no repo. Estado novo por
turno garante “sem modo degradado persistente” (US2-3): cada requisição tenta
o primário primeiro.

**Alternatives considered**: `response_metadata.model_name` do `AIMessage` —
rejeitada (perde-se em `withStructuredOutput`; OpenRouter pode devolver nome
com sufixo de versão). Callbacks LangChain (`handleLLMError`) — viável, mas
indireto e depende de tags; ALS é mais simples de testar. Circuit breaker
global — fora de escopo e contraria US2-3.

## Decision: Definição de `modelUsed`

**Decision**: `metrics.modelUsed` é o id configurado (`OPENROUTER_MODEL` ou
`OPENROUTER_MODEL_FALLBACK`) da **última chamada de modelo concluída** no
grafo. Omitido quando nenhuma chamada LLM ocorreu (override + estratégias stub
nos testes).

**Rationale**: A última chamada é a que produz a resposta final (estratégia) ou
o veredito que a aprova (`reflect`). Usar o id configurado dá valor exato,
como FR-008/FR-009 pedem.

**Alternatives considered**: Lista de todos os modelos usados — mais ruído; a
lista de eventos `fallback` já cobre a auditoria.

## Decision: Configuração `OPENROUTER_MODEL_FALLBACK` obrigatória

**Decision**: `createOpenRouterModel` lê `OPENROUTER_MODEL_FALLBACK` junto de
`OPENROUTER_API_KEY`/`OPENROUTER_MODEL` e lança
`"OPENROUTER_MODEL_FALLBACK is required"` se ausente (US4-2). Mesma chave e
`baseURL` do OpenRouter (FR-004). `.env.example` ganha a variável com exemplo
e comentário. Testes nunca chamam a fábrica de produção: injetam modelos.

**Rationale**: Mesmo padrão fail-fast das variáveis atuais; leitura de
`process.env` concentrada na fábrica (Assumptions).

**Alternatives considered**: Opcional com degradação para “só retry” —
rejeitada: a spec trata a contingência como requerida e o 503 pressupõe dois
modelos.

## Decision: Testes determinísticos sem rede

**Decision**: `createResilientModel({ primary, fallback, primaryModel,
fallbackModel, retry })` aceita `BaseChatModel` injetados.
`createOpenRouterModel()` é só a composição com `ChatOpenAI`. Testes usam
dublês derivados de `FakeListChatModel` (`@langchain/core/utils/testing`) ou
`BaseChatModel` mínimo que lança N vezes um erro com `status`.

Cobertura (FR-012): sucesso primário; retry transitório sem fallback; 401 pula
retry e vai ao reserva; fallback com evento + `modelUsed`; falha total →
`ModelUnavailableError`; isolamento entre turnos; roteador relança 503;
HTTP 503 com corpo `{ error, code }`.

**Rationale**: Constituição V; mesmo padrão de injeção das features 002/007/011.
