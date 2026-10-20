# Quickstart: validar o Modo Equipe

## Pré-requisitos

- Node.js 22 LTS, `npm install` e `npm --prefix web install` feitos.
- Para o roteiro manual: `OPENROUTER_API_KEY` configurada no ambiente (não ler `.env` nos testes).

## 1. Testes automáticos (sem rede)

```bash
npm run typecheck
npm run test              # inclui src/team/*.test.ts e testes de grafo/HTTP atualizados
npm run web:typecheck
npm run web:test          # schemas, describe/TraceStep e a11y com fixture team
```

Esperado: tudo verde; os testes cobrem as garantias T1–T9 de [contracts/team-strategy.md](./contracts/team-strategy.md).

## 2. Rota forçada pelo cliente

```bash
npm run dev
curl -s localhost:3000/chat -H 'content-type: application/json' \
  -d '{"message":"O checkout está com alerta disparando; investigue e abra um incidente se necessário","strategy":"team"}'
```

Esperado ([contracts/chat-http.md](./contracts/chat-http.md)):
- `route = "team"`, evento `route` com `reason = "client override"`.
- Um `handoff` por decisão do supervisor (≤ 8), o último com `to = "done"`.
- Ações do analista só com tools de leitura; o planejador sem `action`; o executor com `open_incident`.

## 3. Aprovação sem bypass

Pedir "Resolva o incidente aberto do checkout" com `strategy: "team"`.
Esperado: `202` com cartão de aprovação; trace com `observation@executor` iniciando por `APPROVAL_REQUIRED` e `handoff(done)` em seguida. Negar na war room e verificar que o incidente continua aberto.

## 4. Roteamento automático

Sem `strategy`, enviar um pedido que combine investigar, decidir e agir. Esperado: o roteador pode escolher `team` com justificativa (não determinístico; validar só que `route` ∈ rotas conhecidas).

## 5. War room

`npm run web:dev`, enviar a mensagem do passo 2 e abrir "Ver raciocínio". Esperado ([contracts/web-ui.md](./contracts/web-ui.md)): passos "Passagem" com etapa "Supervisor", destino e brief em texto; passos dos especialistas com etapa "Analista"/"Planejador"/"Executor".

## 6. Regressão

`strategy` = `react`, `plan-and-execute`, `reflect` e `"foo"` (→ 422) se comportam como antes.
