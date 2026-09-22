# Feature Specification: Conversa persistente

**Feature Branch**: `005-persistent-conversation`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Conversa persistente: ConversationStore (append/lastMessages/create) + tabela messages como no SqliteOpsStore; /chat: conversationId opcional, devolvido na resposta; 12 últimas mensagens no prompt via composição; métrica de historyMessages; testes :memory: + fake"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistir turnos de chat (Priority: P1)

Como operador de plantão conversando com o OpsPilot, quero que cada troca seja salva sob uma identidade de conversa para que turnos posteriores continuem no mesmo fio em vez de começar do zero.

**Why this priority**: Sem turnos duráveis, o triage operacional multi-turno é impossível; o armazenamento é a base da continuidade.

**Independent Test**: Construir um `ConversationStore` em `:memory:`, chamar `create`, `append` de mensagens de usuário e assistente, chamar `lastMessages` e verificar ordem cronológica e conteúdo sem precisar de HTTP ou LLM.

**Acceptance Scenarios**:

1. **Given** nenhuma conversa existe, **When** `create` é chamado, **Then** uma nova identidade de conversa é devolvida e os `append` seguintes se vinculam a ela.
2. **Given** uma conversa existente, **When** `append` grava uma mensagem de usuário e depois uma de assistente, **Then** ambas as linhas são duráveis e associadas a essa conversa.
3. **Given** várias mensagens em uma conversa, **When** `lastMessages` é solicitado com um limite, **Then** retorna as mensagens mais recentes em ordem cronológica, sem exceder o limite.
4. **Given** um store SQLite em `:memory:`, **When** o schema é inicializado, **Then** a tabela `messages` (e qualquer pai de conversa necessário) é criada de forma idempotente no mesmo estilo de `SqliteOpsStore`.

---

### User Story 2 - Continuar o chat via HTTP (Priority: P1)

Como cliente HTTP, quero que `/chat` aceite um `conversationId` opcional e sempre devolva a identidade da conversa na resposta para que eu possa continuar um diálogo multi-turno entre requisições.

**Why this priority**: O endpoint de chat é a superfície voltada ao operador; a continuidade precisa ser visível e controlável pelo cliente.

**Independent Test**: Fazer POST em `/chat` sem `conversationId`, capturar o id devolvido, fazer POST de novo com esse id e verificar que ambas as respostas incluem o mesmo `conversationId` e que o histórico ficou disponível para a camada de estratégia (via store fake e estratégia stub).

**Acceptance Scenarios**:

1. **Given** um body de chat válido sem `conversationId`, **When** `/chat` tem sucesso, **Then** a resposta inclui um `conversationId` recém-criado além dos campos existentes de answer/trace/metrics.
2. **Given** um `conversationId` conhecido, **When** `/chat` é chamado de novo com esse id, **Then** a resposta devolve o mesmo `conversationId` e o novo turno é anexado a essa conversa.
3. **Given** um `conversationId` desconhecido ou em branco, **When** `/chat` é chamado, **Then** a requisição é rejeitada com erro claro de cliente e nenhum turno de assistente é armazenado sob esse id.
4. **Given** um body inválido (mensagem ausente etc.), **When** a validação roda, **Then** o Zod rejeita a requisição como hoje e o estado da conversa permanece inalterado.

---

### User Story 3 - Injetar histórico recente no prompt (Priority: P2)

Como estratégia de raciocínio, quero que as 12 últimas mensagens da conversa sejam compostas no prompt para que as respostas possam referenciar contexto operacional anterior sem que cada estratégia carregue a persistência por conta própria.

**Why this priority**: A continuidade só gera valor se turnos anteriores influenciarem a próxima resposta, e a composição mantém as estratégias livres de preocupações de persistência.

**Independent Test**: Popular uma conversa com mais de 12 mensagens em um store fake, executar um turno de chat pelo caminho composto com uma estratégia stub que registra a entrada, e afirmar que exatamente as 12 mensagens mais recentes foram fornecidas e que `historyMessages` é igual a 12.

**Acceptance Scenarios**:

1. **Given** menos de 12 mensagens anteriores, **When** um novo turno é composto, **Then** todas as mensagens anteriores são incluídas e `metrics.historyMessages` é igual a essa contagem.
2. **Given** mais de 12 mensagens anteriores, **When** um novo turno é composto, **Then** apenas as 12 mais recentes são incluídas e `metrics.historyMessages` é igual a 12.
3. **Given** uma conversa nova, **When** o primeiro turno roda, **Then** `historyMessages` é 0 e a estratégia ainda recebe a mensagem atual do usuário.
4. **Given** a composição da aplicação, **When** o caminho de chat é ligado, **Then** o conversation store é injetado explicitamente (SQLite para produção/integração, fake para testes unitários) em vez de lido de globais ocultos.

---

### User Story 4 - Verificar doubles do store (Priority: P2)

Como desenvolvedor, quero testes SQLite em `:memory:` e um `ConversationStore` fake em memória para cobrir o comportamento de persistência sem banco em disco nem rede.

**Why this priority**: A constituição exige testes com toda lógica nova; doubles mantêm o CI determinístico.

**Independent Test**: Rodar testes unitários do store contra o fake e `SqliteConversationStore(":memory:")` (ou equivalente), cobrindo paridade de create/append/lastMessages para a mesma sequência de fixture.

**Acceptance Scenarios**:

1. **Given** o store fake, **When** create/append/lastMessages rodam, **Then** o comportamento corresponde ao contrato documentado sem abrir arquivo de banco.
2. **Given** um store SQLite em `:memory:`, **When** a mesma sequência roda, **Then** os resultados batem com o fake em conteúdo, ordem e semântica de limite.
3. **Given** qualquer um dos doubles, **When** os testes terminam, **Then** nenhum `opspilot.db` (nem outro DB em arquivo) é necessário para a suíte de conversa.

## Edge Cases

- `lastMessages` em conversa vazia devolve lista vazia, não erro.
- Pedir mais mensagens do que existem devolve todas as disponíveis.
- `append`s concorrentes na mesma conversa permanecem ordenados por inserção/timestamp para que `lastMessages` continue determinístico.
- Um id de conversa que existe mas não tem mensagens ainda permite `append` e devolve `historyMessages` 0 no próximo turno.
- Falhas de persistência no `append` após resposta bem-sucedida do modelo aparecem como erro explícito; o cliente não é informado de que o turno foi salvo quando não foi.
- Entradas SQL usam apenas parâmetros vinculados; ids de conversa e conteúdo de mensagem nunca são concatenados em SQL.
- Papéis de mensagem fora do conjunto fechado (`user` / `assistant`) são rejeitados na fronteira do store ou da validação.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST disponibilizar a fronteira `ConversationStore` com pelo menos `create`, `append` e `lastMessages`.
- **FR-002**: O conversation store baseado em SQLite MUST criar a tabela `messages` de forma idempotente, seguindo o mesmo estilo de persistência de `SqliteOpsStore` (`node:sqlite` / `DatabaseSync`, prepared statements, `:memory:` para testes).
- **FR-003**: `create` MUST alocar uma nova identidade de conversa utilizável por chamadas posteriores de `append` e `lastMessages`.
- **FR-004**: `append` MUST persistir uma mensagem com id de conversa, papel fechado (`user` | `assistant`), conteúdo e timestamp.
- **FR-005**: `lastMessages(conversationId, limit)` MUST devolver até `limit` mensagens mais recentes em ordem cronológica.
- **FR-006**: `POST /chat` MUST aceitar `conversationId` opcional no body validado da requisição.
- **FR-007**: Respostas bem-sucedidas de `/chat` MUST incluir `conversationId` junto com os campos de resultado já existentes.
- **FR-008**: Quando `conversationId` for omitido, `/chat` MUST criar uma conversa, persistir a mensagem do usuário e a resposta do assistente, e devolver o novo id.
- **FR-009**: Quando `conversationId` for fornecido e válido, `/chat` MUST continuar essa conversa, carregar o histórico, persistir o novo turno e ecoar o mesmo id.
- **FR-010**: Quando `conversationId` for fornecido mas desconhecido, `/chat` MUST rejeitar a requisição com erro de cliente e MUST NOT anexar mensagens sob esse id.
- **FR-011**: A composição da aplicação MUST carregar no máximo as 12 mensagens anteriores mais recentes no prompt/contexto antes de invocar a estratégia selecionada.
- **FR-012**: As métricas da resposta MUST incluir `historyMessages` igual ao número de mensagens anteriores efetivamente injetadas naquele turno (0–12).
- **FR-013**: A persistência de conversa MUST ser injetável: produção/integração usa a implementação SQLite; testes unitários MAY usar um store fake em memória.
- **FR-014**: Testes automatizados MUST cobrir o conversation store com SQLite `:memory:` e o double fake, e MUST manter `npm run test` / `npm run typecheck` verdes.

### Key Entities

- **Conversation**: Identidade durável de fio que agrupa turnos de chat ordenados.
- **Message**: Entrada de um turno com papel (`user` ou `assistant`), conteúdo, timestamp e conversa dona.
- **ConversationStore**: Fronteira de persistência expondo create/append/lastMessages para implementações SQLite e fake.
- **ChatResponse**: Resultado de raciocínio existente estendido com `conversationId` e métricas que incluem `historyMessages`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Um cliente consegue completar duas chamadas sucessivas bem-sucedidas a `/chat` usando o `conversationId` devolvido e observar o mesmo id nas duas respostas.
- **SC-002**: Depois que existem 15 mensagens anteriores, o próximo turno composto injeta exatamente 12 mensagens de histórico e reporta `historyMessages` como 12.
- **SC-003**: Depois que existem 3 mensagens anteriores, o próximo turno reporta `historyMessages` como 3.
- **SC-004**: 100% dos testes de contrato do conversation store passam no double fake e no SQLite `:memory:` sem criar arquivo de banco no filesystem.
- **SC-005**: Requisições com `conversationId` desconhecido falham antes da execução da estratégia nos testes HTTP automatizados.
- **SC-006**: Comportamentos existentes de `/chat` (Zod 400, strategy desconhecida 422, timeout 504, flag de reflection) permanecem intactos para clientes que omitem `conversationId`, salvo os campos aditivos `conversationId` e `historyMessages`.

## Assumptions

- Por turno de `/chat`, apenas a mensagem `user` do operador e a resposta final `assistant` são persistidas; traces completos de tools permanecem no `trace` da resposta e não são rejogados como histórico de conversa.
- O tamanho da janela de histórico fica fixo em 12 mensagens anteriores na v1 (não configurável via request).
- O armazenamento de conversa reutiliza as convenções de caminho SQLite do projeto (`OPSPILOT_DB`, caminho padrão em arquivo, `:memory:` nos testes); colocalizar com tabelas de ops versus arquivo dedicado é escolha de implementação, desde que a composição injete um store explicitamente.
- Um fake leve (em memória) de `ConversationStore` é necessário para testes unitários rápidos; a paridade com SQLite é verificada por fixtures de contrato compartilhadas.
- Estender `Metrics` com `historyMessages` é aditivo e retrocompatível para callers que só afirmam `llmCalls` / `latencyMs`.
- Autenticação, isolamento multi-tenant e redação de mensagens estão fora do escopo desta feature.
