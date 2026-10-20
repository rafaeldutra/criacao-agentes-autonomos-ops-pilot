# Contract delta: `POST /chat` (aditivo sobre specs/014-war-room-web/contracts/chat-http.md)

## Request

- `strategy` aceita também `"team"`. Outros valores fora de `react | plan-and-execute | reflect | team` continuam → `422 UNKNOWN_STRATEGY`.

## Response 200 / 202

- `route` pode ser `"team"`.
- `trace[].node` pode ser também `team | supervisor | analista | planejador | executor`.
- Novo evento:

```json
{ "type": "handoff", "from": "supervisor", "to": "analista", "brief": "Liste alertas firing do checkout e consulte o runbook.", "node": "supervisor" }
{ "type": "handoff", "from": "supervisor", "to": "done", "brief": "<resposta final>", "limitReached": true, "node": "supervisor" }
```

`to ∈ { analista, planejador, executor, done }`; `limitReached` é opcional.

- Exemplo de ordem num turno `team`:

```text
thought@context → route@router(team) → handoff@supervisor(analista) → action@analista → observation@analista → answer@analista
→ handoff@supervisor(planejador) → answer@planejador → handoff@supervisor(executor) → action@executor → observation@executor
→ answer@executor → handoff@supervisor(done) → answer@team
```

- Aprovação: se o executor pedir `resolve_incident`, a resposta é `202` com o cartão de aprovação exatamente como nas outras rotas (014); o trace termina com `handoff(done)`.

## Erros

- Decisão inválida do supervisor → `502 ROUTER_FAILED` (existente).
- Modelos indisponíveis → comportamento existente (012).

## Logs (013)

- Linha de trace para `handoff`: `{ seq, node: "supervisor", type: "handoff", to, limitReached?, chars }`; o `brief` nunca é logado.
