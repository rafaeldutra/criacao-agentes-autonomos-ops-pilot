# Research: War Room Web

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-10-14

Cada seção resolve uma incógnita do Technical Context no formato Decisão / Racional / Alternativas.

## R1. Como pausar o agente antes de uma ação sensível

**Decisão**: **Portão de aprovação na camada de ferramentas.** `resolve_incident` e `forget_preference` são embrulhadas por `withApprovalGate`. Ao serem chamadas, elas consultam um contexto de aprovação por requisição (`AsyncLocalStorage`, como o `request-context.ts` já faz com o `userId`):

- **Sem concessão** para aquela `(tool, args)`: o portão **não executa**. Ele registra a ação no contexto como pendente e devolve ao modelo a observação fixa `APPROVAL_REQUIRED: a ação <tool> aguarda aprovação humana e NÃO foi executada. Não tente novamente; encerre informando que aguarda aprovação.` O agente termina o turno normalmente. A borda HTTP vê a ação pendente no contexto, persiste e responde **202** em vez de 200.
- **Com concessão "aprovada"**: devolve o resultado já gravado, sem executar de novo.
- **Com concessão "negada"**: devolve `DENIED: a pessoa operadora negou <tool>; a ação não foi executada.`

Só **uma** ação pendente por turno. Uma segunda chamada sensível no mesmo turno recebe a mesma observação de "aguardando", mas não gera outro cartão (é registrada só no trace).

**Racional**:
- Funciona sem alterar as três estratégias (ReAct pré-construído, plan-and-execute e o wrapper de reflexão). Todas chegam às ferramentas pelo mesmo `createTools`.
- O trace parcial fica preservado (rota, pensamentos, a `action` pendente e a observação). Assim, "Ver raciocínio" também funciona no 202.
- Não depende de exceções. O `ToolNode` do LangGraph e o executor do plan-and-execute **capturam erros de ferramenta** e os transformam em observação, então lançar um erro não abortaria a execução.
- É uma função pura de decisão (`decideGate(grants, call)`) mais um efeito pequeno, fácil de testar com `node:test`.

**Alternativas consideradas**:
- `interrupt()` do LangGraph com checkpointer: exige checkpointer persistente em grafos aninhados (produção → estratégia → `createReactAgent`) e repetição determinística. O checkpointer SQLite oficial usa `better-sqlite3`, o que conflita com o princípio IX (`node:sqlite`). Rejeitada por custo e risco.
- Lançar `ApprovalRequiredError`: engolido pelo `ToolNode` e pelo `try/catch` do executor. Exigiria mudar as estratégias. Rejeitada.
- Confirmação só no frontend: não garante nada para clientes CLI ou MCP, e a spec exige a garantia na API (SC-003). Rejeitada.

## R2. Como retomar após a decisão

**Decisão**: `POST /approvals/:id/decision` faz, nesta ordem:
1. **Reivindica** a ação de forma atômica: `UPDATE ... SET status=? WHERE id=? AND status='pending'`. Se nenhuma linha mudar, responde 409 sem efeitos.
2. Se aprovada, **executa a ferramenta uma única vez** com o executor direto (`createToolExecutor`), dentro do `runWithUserId(userIdOriginal)`, e grava `result` (ou `failed` com a mensagem de erro).
3. Anexa à conversa uma mensagem de decisão, com papel `user` e prefixo fixo `[decisão]`, descrevendo ação, decisão e resultado.
4. Roda um **novo turno** do grafo de produção na mesma conversa, com a mensagem de continuação abaixo e o contexto de aprovação **carregando a concessão**. Se o agente repetir a mesma chamada, recebe o resultado gravado (aprovada) ou `DENIED` (negada), sem executar de novo:
   `Continue a solicitação original "<mensagem original>" considerando a decisão acima.`
5. Responde no mesmo formato do `/chat`: 200 com a resposta final, ou 202 se surgir outra ação sensível diferente.

**Racional**: dá a garantia de "exatamente uma vez" por meio do banco (a reivindicação atômica) e não depende de retomar o estado interno do LangGraph. O histórico da conversa e o resumo (features 005 e 009) já levam o contexto até o agente.

**Alternativas**: reexecutar a mensagem original inteira com a concessão. Rejeitada porque o raciocínio se repetiria e a resposta poderia divergir.

## R3. Motivo exibido no cartão

**Decisão**: adicionar `reason: string` **opcional** aos esquemas de `resolve_incident` e `forget_preference`, com a descrição "Why this action is needed now (shown to the human approver)". Se o modelo não preencher, o cartão usa o último `thought` do trace parcial e, na falta dele, "O agente solicitou esta ação.". O `reason` não é repassado ao `OpsStore` nem ao `MemoryStore`.

**Racional**: é determinístico, testável e não exige outra chamada ao modelo. A mudança no esquema é aditiva e não quebra chamadas existentes.

## R4. Persistência das ações pendentes

**Decisão**: nova tabela `approvals` no mesmo `OPSPILOT_DB`, via `node:sqlite` com statements preparados, schema idempotente e um `FakeApprovalStore` em memória para os testes. Seguem os princípios IX e X e o padrão de `SqliteRequestStore`. As transições de estado ficam em funções puras (`applyDecision`). A expiração é **calculada** (`createdAt + TTL < now`, com `OPSPILOT_APPROVAL_TTL_MINUTES`, padrão 1440 = 24 h), sem tarefa agendada.

## R5. Bloqueio do chat com ação pendente

**Decisão**: `POST /chat` com um `conversationId` que tem ação `pending` (e não expirada) responde **409 `APPROVAL_PENDING`**, com `approvalId` no corpo. A war room também bloqueia na interface (FR-015). Assim a regra vale para qualquer cliente.

## R6. CORS

**Decisão**: middleware próprio de poucas linhas, com a decisão em função pura `corsHeadersFor(origin, allowlist)`:
- Lista em `OPSPILOT_CORS_ORIGINS`, separada por vírgulas e validada com Zod (cada item é uma origem `http(s)://host[:porta]` sem caminho). `*` é **rejeitado** na inicialização.
- Padrão quando a variável está ausente: `http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:4173` e `http://127.0.0.1:4173` (portas de `vite dev` e `vite preview`).
- Origem permitida: `Access-Control-Allow-Origin: <origem>`, `Vary: Origin`, `Access-Control-Expose-Headers: X-Request-Id`. No preflight `OPTIONS`, também `Allow-Methods: GET, POST, OPTIONS`, `Allow-Headers: Content-Type` e `Max-Age: 600`, com resposta 204.
- Origem não permitida ou ausente: nenhum cabeçalho CORS. Preflight de origem não permitida recebe 403. Requisições sem `Origin` (CLI, testes, MCP) seguem exatamente como hoje (FR-023).
- Sem credenciais nem cookies.

**Racional**: são poucas regras e cabem numa função pura com teste de tabela. Evita uma dependência (`cors`) cuja configuração por callback seria mais difícil de testar contra a regra "nunca `*`".

## R7. Stack e estrutura da war room

**Decisão**: projeto npm **separado** em `web/`, com o próprio `package.json` e sem workspaces, para não mexer nas dependências da API:
- Vite e React nas versões estáveis vigentes na implementação (fixadas no `web/package-lock.json`), TypeScript na mesma major da raiz (strict, `moduleResolution: bundler`) e Zod 4 (a mesma major da API) para validar as respostas da API (princípio II aplicado à fronteira do cliente).
- `react-markdown` **sem** `rehype-raw`, para a formatação da resposta. HTML cru é ignorado (FR-006).
- Vitest, Testing Library, jsdom e `vitest-axe` para os testes de componente e acessibilidade (SC-008).
- Estilo com **CSS Modules + tokens em CSS custom properties** (`web/src/styles/tokens.css`), espelhando a escala das instruções de design. Sem Tailwind e sem biblioteca de componentes.
- `base: '/opspilot/'` no `vite.config.ts`. A aplicação tem uma única rota: engrenagem e raciocínio abrem como diálogo e painel, sem roteador. Por isso o recarregamento sob `/opspilot/` sempre serve o `index.html`. O quickstart documenta o fallback do servidor estático.
- URL padrão da API vinda de `import.meta.env.VITE_OPSPILOT_API_URL`, com padrão `http://localhost:3000`. A configuração da pessoa fica em `localStorage` (`opspilot.apiUrl`, `opspilot.theme`), com leitura e escrita protegidas por `try/catch`.
- O raciocínio é tipado no cliente por um esquema Zod de união discriminada que espelha `TraceEvent`, mais um ramo `unknown` de reserva (FR-009).

**Alternativas**: workspaces npm (mais acoplamento no `package-lock` da raiz); Next.js (servidor desnecessário, base path mais complexo); Tailwind (as instruções pedem tokens semânticos, e com CSS Modules e variáveis isso fica explícito e verificável).

## R8. Testes e comandos

**Decisão**:
- A API continua em `node:test` via `tsx` (`npm run test` e `npm run typecheck` na raiz, sem mudança de escopo).
- A web tem `npm --prefix web run test` (Vitest), `run typecheck` (`tsc -b --noEmit`) e `run build`. A raiz ganha os atalhos `web:dev`, `web:build`, `web:test` e `web:typecheck`.
- Testes de contrato da web usam fixtures JSON iguais aos exemplos de [contracts/](./contracts/). Um teste da API garante que a resposta real de 202 bate com o mesmo fixture (`src/http/approvals.contract.test.ts` lê `specs/014-war-room-web/contracts/fixtures/*.json`).

## R9. Emenda da constituição

**Decisão**: a constituição 1.1.0 lista apenas a stack do servidor. Esta feature propõe a **emenda 1.2.0 (MINOR)**, adicionando a seção "Stack da interface web (`web/`)" com Vite, React, TypeScript strict, Zod, Vitest e as instruções de design, além dos comandos `web:*`. A emenda é a primeira tarefa de implementação e precisa ser aprovada antes do código de `web/`.
