# Contract delta: war room — "Ver raciocínio" (aditivo sobre specs/014-war-room-web/contracts/web-ui.md)

## Validação (Zod, `web/src/api/schemas.ts`)

- `routeNameSchema` += `team`; `graphNodeSchema` += `team`, `supervisor`, `analista`, `planejador`, `executor`.
- `knownTraceEventSchema` += `{ type: "handoff", from: "supervisor", to: enum(analista|planejador|executor|done), brief: string, limitReached?: boolean, node? }`.
- Resposta com esses valores é válida (não cai em erro de contrato).

## Apresentação (`describeTraceEvent`)

| evento | label | etapa | corpo |
|--------|-------|-------|-------|
| `handoff` (to ≠ done) | "Passagem" | "Supervisor" | "Para: <Analista\|Planejador\|Executor>" + brief em texto |
| `handoff` (to = done) | "Passagem" | "Supervisor" | "Para: Encerrar" + brief em texto |
| `handoff` com `limitReached` | idem | idem | aviso textual "Teto de 8 passagens atingido" |
| `route` com `team` | "Rota" | "Roteador" | "Equipe" + razão |
| eventos com `node` de papel | (inalterado) | "Analista" / "Planejador" / "Executor" / "Equipe" | (inalterado) |

## Regras

- Brief e destino renderizados como texto (nunca HTML ativo).
- Passagem visualmente distinta de pensamento/ação/observação (corpo próprio `kind: "handoff"`), com rótulo acessível (lido por leitor de tela como "Passagem para Analista").
- Painel passa vitest-axe com um trace `team` de fixture.
