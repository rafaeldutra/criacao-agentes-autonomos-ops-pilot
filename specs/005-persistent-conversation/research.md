# Research: Conversa persistente

## Decision: Boundary `ConversationStore` separado de `OpsStore`

**Decision**: Criar `ConversationStore` em `src/store/conversation-store.ts` com
implementações SQLite e fake, sem estender a interface `OpsStore`.

**Rationale**: Conversas são um domínio distinto de alertas/incidentes; a
constituição pede boundaries explícitos e injeção. Manter `OpsStore` estável
reduz risco de regressão nas tools/MCP.

**Alternatives considered**: Fundir mensagens em `SqliteOpsStore` foi rejeitado
por misturar responsabilidades. Um único `DatabaseSync` compartilhado entre
stores via DI avançada foi adiado — duas conexões no mesmo `OPSPILOT_DB` bastam
para v1.

## Decision: Compor histórico como texto antes de `strategy.run`

**Decision**: A borda HTTP (composição) carrega até 12 mensagens, formata um
prefixo de contexto + mensagem atual, e chama `strategy.run(composedInput)`.
As strategies não recebem o store.

**Rationale**: A spec exige composição; a assinatura atual
`ReasoningStrategy.run(input: string)` permanece intacta (arena/bench/MCP
não quebram). Função pura de formatação é testável sem LLM.

**Alternatives considered**: Alterar `ReasoningInput` para lista de mensagens
foi rejeitado por ripple em ReAct, Plan-and-Execute, reflection e arena.
Carregar histórico dentro de cada strategy foi rejeitado por violar camadas.

## Decision: Tabelas `conversations` + `messages` no mesmo DB file

**Decision**: DDL idempotente cria `conversations(id, created_at)` e
`messages(id, conversation_id, role, content, created_at)` com FK e índices;
path default igual a `SqliteOpsStore` (`OPSPILOT_DB` / `./data/opspilot.db`).

**Rationale**: Alinha com a constituição e a assumption da spec; um arquivo
só simplifica ops locais. `:memory:` por instância de store nos testes.

**Alternatives considered**: Arquivo DB separado para conversas foi rejeitado
como complexidade sem benefício na v1. Guardar só `messages` sem tabela pai
foi rejeitado porque `create` precisa de identidade durável verificável.

## Decision: Janela fixa 12 + métrica na composição

**Decision**: Constante `HISTORY_WINDOW = 12`. `historyMessages` = número de
mensagens anteriores injetadas (0–12). A composição faz merge em
`result.metrics` antes de responder.

**Rationale**: Spec fixa 12 e exige a métrica; strategies base não precisam
conhecer histórico.

**Alternatives considered**: Limite configurável por request foi rejeitado
(fora de escopo v1). Contar só pares user/assistant foi rejeitado — a spec
conta mensagens.

## Decision: Erro de conversa desconhecida antes do LLM

**Decision**: Se `conversationId` vier preenchido e não existir,
lançar/mapear `DomainError` (`CONVERSATION_NOT_FOUND`) → HTTP 404 (ou 422
consistente com erros de cliente já usados), sem chamar a strategy e sem
`append`.

**Rationale**: SC-005 exige falha antes da execução da strategy. Id em branco
já é rejeitado pelo Zod (string trim min 1 quando presente).

**Alternatives considered**: Criar conversa silenciosamente para id
desconhecido foi rejeitado por mascarar bugs de cliente. 500 genérico foi
rejeitado por violar erros de domínio.

## Decision: Contrato de teste fake + `:memory:`

**Decision**: Um helper de contrato executa a mesma sequência
create/append/lastMessages contra `FakeConversationStore` e
`SqliteConversationStore(":memory:")`.

**Rationale**: Spec FR-014 / SC-004; alinhado ao princípio X da constituição.

**Alternatives considered**: Só SQLite foi rejeitado (unitários mais lentos /
menos isolados). Só fake foi rejeitado (não prova DDL/SQL).
