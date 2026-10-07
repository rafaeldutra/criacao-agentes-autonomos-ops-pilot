# Contract: Trace (extensão grafo)

Complementa `specs/001-reasoning-core/contracts/reasoning-strategy.md`.

## Tipos

`TraceEvent` existente + `route` + `node?` em todas as variantes.
Ver [data-model.md](../data-model.md).

## Helpers (`src/agents/trace.ts`)

- `route(route, reason, node = "router")` → evento `route`
- `withNode(events, node)` → novos objetos com `node` definido
- `formatTrace`:
  - sem `node`: `[type] …` (compatível com testes atuais)
  - com `node`: `[type@node] …`
  - `route`: `[route@router] react client override` (reason no restante da linha)

## Regras

- Grafo de produção: 100% dos eventos com `node`.
- Estratégias isoladas (Arena): `node` omitido.
- Não mutar arrays de origem; `withNode` retorna cópia rasa dos eventos.
