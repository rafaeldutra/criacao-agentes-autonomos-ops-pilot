# Contract: estratégia `team` (interna, `src/team/`)

## Fábrica

```ts
createTeamStrategy(model, tools: AgentTools, options?: { decideNext?: DecideNext }): ReasoningStrategy
// name: "team"
```

- `DecideNext = (input: { blackboard: string; forceFinish: boolean }) => Promise<SupervisorDecision>`
  - default: `model.withStructuredOutput(forceFinish ? finishOnlySchema : supervisorDecisionSchema)`
  - injetável para testes (sem rede), como `DecideRoute`.

## Garantias

| # | garantia | verificado por |
|---|----------|----------------|
| T1 | O especialista `analista` só tem ligadas as tools `list_alerts`, `list_incidents`, `consultar_runbook`, `check_provider_status` | teste de `roles.ts` (nomes por papel) |
| T2 | `planejador` não tem tool ligada | teste: stub de modelo que registra `bindTools` nunca é chamado para o planejador |
| T3 | `executor` só tem `list_incidents`, `open_incident`, `resolve_incident` | teste de `roles.ts` |
| T4 | Nenhum papel tem `forget_preference` | teste de `roles.ts` |
| T5 | `resolve_incident` dentro de approval context → `APPROVAL_REQUIRED`, `pending` preenchido, próxima decisão forçada a `done` | teste do grafo com `runWithApprovalContext` |
| T6 | Grant `denied` → observação `DENIED` no blackboard; store não muda | teste do grafo |
| T7 | No máximo 8 decisões; a 8ª é `done` com `limitReached: true` quando forçada | teste com decisor que sempre devolve `analista` |
| T8 | Decisão inválida (papel desconhecido / brief vazio) → `RouterError` antes de qualquer especialista | teste do grafo |
| T9 | Resultado: `answer` = brief do `done`; trace contém um `handoff` por decisão e os eventos dos especialistas com `node` = papel | teste do grafo |

## Prompts (resumo normativo)

- **Supervisor**: lê o blackboard; escolhe o próximo papel ou `done`; ao encerrar, `brief` é a resposta final em pt-BR baseada apenas no blackboard; se houver aprovação pendente, informa que aguarda aprovação.
- **Analista**: relatar fatos e achados com evidência das tools; NÃO propor ações nem recomendações.
- **Planejador**: produzir plano numerado a partir do blackboard; sem consultar dados.
- **Executor**: executar apenas ações de incidente pedidas no brief; preencher `reason` em `resolve_incident`; nunca tentar contornar aprovação.
