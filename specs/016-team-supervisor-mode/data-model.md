# Data Model: Modo Equipe com Supervisor

Todas as entidades são em memória e vivem apenas durante um turno de `/chat`.
Nada é persistido além do trace e da resposta, pelos caminhos já existentes.

## TeamRole

| valor | label (pt-BR) | tools permitidas |
|-------|---------------|------------------|
| `analista` | Analista | `list_alerts`, `list_incidents`, `consultar_runbook`, `check_provider_status` |
| `planejador` | Planejador | nenhuma |
| `executor` | Executor | `list_incidents`, `open_incident`, `resolve_incident` (com aprovação) |

Regras: nenhum papel recebe `forget_preference`; o conjunto é fixo (não configurável por requisição).

## SupervisorDecision

| campo | tipo | regra |
|-------|------|-------|
| `next` | `TeamRole \| "done"` | obrigatório; enum fechado |
| `brief` | string | obrigatório, `trim().min(1)`; se `next = "done"`, é a resposta final |

Validada com Zod. Inválida → `RouterError` (`ROUTER_FAILED`), nenhum especialista executa.

## BlackboardEntry

| campo | tipo | descrição |
|-------|------|-----------|
| `seq` | number | ordem (1..7) |
| `role` | `TeamRole` | quem contribuiu |
| `brief` | string | instrução recebida do supervisor |
| `content` | string | resposta final do especialista (fatos, plano ou resultado da ação, incluindo observações `APPROVAL_REQUIRED`/`DENIED`) |
| `failed` | boolean? | `true` quando o especialista lançou erro não fatal (registrado como conteúdo) |

## Blackboard (estado do sub-grafo)

| campo | tipo | descrição |
|-------|------|-----------|
| `request` | string | prompt composto recebido pela estratégia |
| `entries` | `BlackboardEntry[]` | reducer de concatenação |
| `decisions` | number | decisões do supervisor já tomadas (0..8) |
| `pendingDecision` | `SupervisorDecision?` | decisão corrente (destino do roteamento condicional) |
| `answer` | string | brief da decisão `done` |
| `trace` | `TraceEvent[]` | reducer de concatenação |
| `llmCalls` / `promptTokens` | number | somados como no grafo de produção |

Render para prompt: função pura `blackboardAsText(request, entries)` em texto (sem JSON), usada pelo supervisor e pelos especialistas.

### Transições

```text
START → supervisor
supervisor --next=analista|planejador|executor--> <papel> → supervisor
supervisor --next=done--> END
```

`mustFinish(state)` (pura) força a decisão a `done` (schema restrito, `limitReached` quando aplicável) se:
- `decisions === 7` (a próxima é a 8ª), ou
- há aprovação pendente no approval context do turno.

Invariantes: `decisions ≤ 8`; exatamente um `handoff` por decisão; o último `handoff` tem `to = "done"`.

## TraceEvent `handoff` (novo)

| campo | tipo | descrição |
|-------|------|-----------|
| `type` | `"handoff"` | discriminante |
| `from` | `"supervisor"` | origem da passagem (sempre o supervisor) |
| `to` | `TeamRole \| "done"` | destino |
| `brief` | string | instrução ou resposta final |
| `limitReached` | boolean? | presente e `true` só quando a decisão foi forçada pelo teto |
| `node` | `"supervisor"` | sempre |

## GraphNode / StrategyRoute (ampliados)

- `GraphNode` += `"team" | "supervisor" | "analista" | "planejador" | "executor"`
- `StrategyRoute` += `"team"`
- Eventos dos especialistas carregam `node` = papel; eventos de modelo-fallback da estratégia saem com `node: "team"`.
