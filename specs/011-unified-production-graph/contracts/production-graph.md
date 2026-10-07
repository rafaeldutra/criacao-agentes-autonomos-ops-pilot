# Contract: Production Graph

## Factory

```ts
createProductionGraph(options: {
  strategies: {
    react: ReasoningStrategy;
    "plan-and-execute": ReasoningStrategy;
  };
  decideRoute?: (prompt: string) => Promise<RouteDecision>;
  reflectionOptions?: ReflectionOptions;
  model?: ChatModel; // default createOpenRouterModel(); usado se decideRoute omitido
}): CompiledGraph
```

Nó `reflect` = `withReflection(strategies.react, reflectionOptions)`.

Default `decideRoute`:

1. System prompt com tabela:

   | route | when to use |
   |-------|-------------|
   | react | diagnóstico iterativo com ferramentas |
   | plan-and-execute | tarefa com vários passos sequenciais |
   | reflect | conclusão operacional que precisa de crítica extra |

2. Human = `prompt` já composto.
3. `model.withStructuredOutput(routeDecisionSchema).invoke(...)`.

`routeDecisionSchema`:

```ts
z.object({
  route: z.enum(["react", "plan-and-execute", "reflect"]),
  reason: z.string().min(1),
})
```

## Invoke input

```ts
{
  message: string;
  history: ChatMessage[];
  summary: string;
  memories: MemoryFact[];
  budget: SectionBudget;
  override?: StrategyRoute;
  reflect?: boolean;
}
```

## Invoke output

`ProductionGraphResult` em [data-model.md](../data-model.md).

## Nodes

| Node | Efeitos |
|------|---------|
| `context` | `buildContext`; evento `thought` `node: "context"`; preenche prompt/breakdown/kept* |
| `router` | decisão; evento `{ type: "route", route, reason, node: "router" }`; +1 `llmCalls` se LLM |
| `react` / `plan-and-execute` / `reflect` | `run(prompt)`; `withNode(trace, nome)`; se `reflect` flag e nó ≠ `reflect`, decorar |
| `response` | `answer` da estratégia; `latencyMs`; garante evento `answer` com `node: "response"` se a estratégia já emitiu `answer`, **não duplicar** — apenas garantir `node` no último `answer` (estratégia) **ou** emitir um `answer` em `response` se ausente |

Preferência: não duplicar `answer`. O nó `response` só adiciona `answer` se a estratégia não tiver emitido um. Eventos da estratégia já vêm com `node` da estratégia.

## Conditional edges

`decision.route` → nome do nó. Rota inválida após o roteador ⇒ `ROUTER_FAILED` (não deve ocorrer se o schema Zod passou).

## Errors

- `DomainError("Router failed to choose a strategy", "ROUTER_FAILED")` se `decideRoute` lançar ou devolver `reason` vazio.

## Test obligations

| Case | Expect |
|------|--------|
| `override: "plan-and-execute"` + stubs | só P&E `run`; `decideRoute` não chamado; evento route override |
| `decideRoute` → `react` | só react `run`; `llmCalls` estratégia + 1 se decideRoute real / +0 se stub não contabiliza — **stubs de teste não incrementam**; o wrapper de produção incrementa só no caminho LLM |
| `decideRoute` lança | `ROUTER_FAILED`; nenhuma strategy `run` |
| eventos da strategy | todos `node` = rota |
| prompt | igual a `buildContext` das fontes de entrada |
