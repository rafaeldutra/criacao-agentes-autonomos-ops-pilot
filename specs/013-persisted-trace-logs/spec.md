# Feature Specification: Trace Persistido e Logs Estruturados

**Feature Branch**: `013-persisted-trace-logs`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Trace persistido + logs JSON: - /chat: requestId no corpo e no header X-Request-Id. - SQLite: requests (métricas) e trace_events (node, payloads). - src/obs/logger.ts: 1 linha JSON por evento, só metadados. - GET /requests/:id registro + trace ordenado"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Identificador único por requisição de chat (Priority: P1)

Como cliente da API ou operador de plantão, quero que toda chamada a `POST /chat` devolva um identificador único de requisição (`requestId`), tanto no corpo da resposta quanto no header `X-Request-Id`, para poder citar exatamente aquela execução ao investigar um comportamento ou abrir um chamado.

**Why this priority**: O `requestId` é a chave que conecta resposta, registro persistido, trace e linhas de log. Sem ele, nenhuma das demais histórias é utilizável.

**Independent Test**: Enviar `POST /chat` válido e verificar que o header `X-Request-Id` está presente, que o corpo JSON contém `requestId` com o mesmo valor e que duas chamadas consecutivas produzem identificadores distintos.

**Acceptance Scenarios**:

1. **Given** uma requisição `POST /chat` válida, **When** a resposta é retornada com sucesso, **Then** o header `X-Request-Id` e o campo `requestId` do corpo existem e são idênticos.
2. **Given** uma requisição `POST /chat` que termina em erro (400, 404, 422, 502, 503, 504 ou 500 inesperado), **When** a resposta de erro é retornada, **Then** o header `X-Request-Id` está presente e o corpo JSON de erro também inclui `requestId` com o mesmo valor.
3. **Given** duas requisições `POST /chat` quaisquer, **When** ambas são respondidas, **Then** seus `requestId` são diferentes.

---

### User Story 2 - Registro persistido da requisição e do trace (Priority: P1)

Como operador ou desenvolvedor do OpsPilot, quero que cada execução de `/chat` fique gravada no banco local com suas métricas (latência, chamadas ao modelo, tokens, modelo usado, rota, status) e com todos os eventos de trace na ordem em que ocorreram (nó do grafo, tipo e payload), para poder auditar e depurar execuções depois que a resposta HTTP já foi entregue.

**Why this priority**: Hoje o trace só existe na resposta HTTP e se perde em seguida; a persistência é o valor central da feature e a base da consulta por `requestId`.

**Independent Test**: Executar `POST /chat` com banco em memória e um grafo determinístico; consultar diretamente o armazenamento e verificar que existe um registro da requisição com as métricas da resposta e eventos de trace em mesma quantidade, mesma ordem e mesmo conteúdo do `trace` retornado.

**Acceptance Scenarios**:

1. **Given** uma requisição `POST /chat` concluída com sucesso, **When** o armazenamento é consultado pelo `requestId`, **Then** existe um registro com `conversationId`, status HTTP, latência, `llmCalls`, `promptTokens` (quando disponível), `modelUsed`, rota escolhida e data/hora de criação.
2. **Given** a mesma requisição, **When** os eventos de trace persistidos são listados, **Then** cada evento do `trace` da resposta aparece com seu número de sequência, nó (`node`), tipo (`type`) e payload completo, na mesma ordem.
3. **Given** uma requisição que falha após validação (ex.: timeout 504, indisponibilidade de modelo 503, roteador 502, conversa inexistente 404), **When** o armazenamento é consultado, **Then** existe um registro com o status HTTP e o código de erro correspondentes.
4. **Given** uma falha ao gravar o registro ou o trace, **When** a requisição de chat é processada, **Then** a resposta ao cliente não é alterada e a falha de persistência é registrada em log.

---

### User Story 3 - Consulta de uma requisição por identificador (Priority: P2)

Como operador ou desenvolvedor, quero consultar `GET /requests/:id` e receber o registro da requisição com o trace completo ordenado, para reconstruir o raciocínio do agente a partir de um `requestId` recebido de um cliente ou visto nos logs.

**Why this priority**: Torna os dados persistidos acessíveis sem acesso direto ao banco; depende das histórias 1 e 2.

**Independent Test**: Executar um `POST /chat`, extrair o `requestId` e chamar `GET /requests/:id`; verificar status 200, registro com as métricas da execução e `trace` ordenado por sequência. Chamar com um identificador inexistente e verificar 404.

**Acceptance Scenarios**:

1. **Given** um `requestId` existente, **When** `GET /requests/:id` é chamado, **Then** a resposta tem status 200 e contém o registro da requisição e a lista `trace` ordenada pela sequência original dos eventos.
2. **Given** um `requestId` com formato válido mas inexistente, **When** `GET /requests/:id` é chamado, **Then** a resposta tem status 404 com corpo `{ "error": "...", "code": "REQUEST_NOT_FOUND" }`.
3. **Given** um identificador com formato inválido, **When** `GET /requests/:id` é chamado, **Then** a resposta tem status 400 com a descrição do problema de validação.
4. **Given** uma requisição registrada que terminou em erro, **When** `GET /requests/:id` é chamado, **Then** o registro mostra o status e o código de erro, e o `trace` contém os eventos produzidos até a falha (possivelmente vazio).

---

### User Story 4 - Logs estruturados em JSON somente com metadados (Priority: P2)

Como operador que coleta a saída do processo, quero que o OpsPilot emita uma linha JSON por evento relevante (início e fim da requisição, cada evento de trace, falhas de persistência), contendo apenas metadados — nunca o texto da mensagem do usuário, respostas, argumentos de ferramentas ou observações —, para correlacionar execuções por `requestId` em qualquer agregador de logs sem expor conteúdo sensível.

**Why this priority**: Observabilidade em tempo real e correlação com ferramentas externas; os dados completos já ficam disponíveis via persistência, então o log pode ser enxuto e seguro.

**Independent Test**: Executar `POST /chat` com um logger capturável; verificar que cada linha emitida é um JSON válido e independente, que todas carregam o mesmo `requestId`, e que nenhuma linha contém o texto da mensagem enviada, da resposta ou de qualquer payload do trace.

**Acceptance Scenarios**:

1. **Given** uma requisição `POST /chat`, **When** ela é processada, **Then** são emitidas uma linha de início, uma linha por evento de trace e uma linha de conclusão, todas com `requestId`.
2. **Given** qualquer linha de log emitida, **When** ela é interpretada, **Then** é um objeto JSON em uma única linha contendo ao menos data/hora, nível, nome do evento e `requestId` (quando aplicável).
3. **Given** um trace com conteúdo textual (pensamentos, observações, resposta, argumentos de ferramenta), **When** os logs da requisição são inspecionados, **Then** nenhum desses conteúdos aparece; só metadados como `node`, `type`, nome da ferramenta, sequência, duração, status e tamanhos.

---

### Edge Cases

- **Requisição rejeitada na validação (400/422)**: recebe `requestId` no header e no corpo de erro e é registrada com seu status; não há trace.
- **Timeout (504)**: a execução do grafo pode continuar em segundo plano após a resposta; o registro reflete o status 504 entregue ao cliente, com `errorCode` `CHAT_TIMEOUT`, e o trace persistido fica vazio, pois o trace parcial do grafo não está acessível no momento da resposta. Eventos produzidos depois da resposta não são persistidos.
- **Eventos adicionados após o grafo** (ex.: evento `summarize` do resumo de histórico, evento `fallback`): também são persistidos e logados na posição em que aparecem no `trace` da resposta.
- **Payloads grandes** (observações longas, planos extensos): são persistidos integralmente; o log registra apenas o tamanho.
- **Erro inesperado (500) ou de provedor (502) no tratador global**: a resposta mantém o formato atual acrescido de `requestId`; o registro é gravado com o status entregue e o trace fica vazio.
- **Banco indisponível ou erro de escrita**: a resposta do chat segue inalterada; um log de nível `error` com `requestId` é emitido.
- **Leitura com `GET /requests/:id` de uma requisição ainda em andamento**: retorna 404 até que o registro seja gravado ao final da requisição.
- **Header `X-Request-Id` enviado pelo cliente**: é ignorado; o servidor sempre gera o próprio identificador, evitando colisões no armazenamento.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST gerar no servidor um identificador único (`requestId`, UUID) para cada requisição `POST /chat`, antes da validação do corpo.
- **FR-002**: Toda resposta de `POST /chat` MUST incluir o header `X-Request-Id` e o campo `requestId` no corpo JSON, com o mesmo valor, inclusive respostas produzidas pelo tratador global de erros (JSON inválido 400, `PROVIDER_ERROR` 502 e erro inesperado 500).
- **FR-003**: O sistema MUST persistir, no SQLite operacional (`OPSPILOT_DB`), uma tabela `requests` com um registro por requisição `/chat`, contendo: `requestId`, `conversationId` (quando houver), `userId` (quando houver), rota executada pelo grafo de produção (`react`, `plan-and-execute` ou `reflect`), se a reflexão foi solicitada, status HTTP, código de erro (quando houver), `latencyMs`, `llmCalls`, `promptTokens`, `modelUsed`, `historyMessages`, `memoryFacts`, `contextBreakdown` (estimativa de tokens por fonte do contexto, em JSON) e data/hora de criação.
- **FR-004**: O sistema MUST persistir uma tabela `trace_events` com um registro por evento de trace, contendo `requestId`, número de sequência, `node`, `type` e payload completo serializado, preservando a ordem do `trace` retornado ao cliente.
- **FR-005**: O schema de `requests` e `trace_events` MUST ser criado de forma idempotente, usar prepared statements e funcionar com `:memory:` nos testes, conforme a constituição.
- **FR-006**: A gravação do registro e do trace de uma requisição MUST ser atômica (tudo ou nada).
- **FR-007**: Falhas na persistência MUST NOT alterar o status nem o corpo da resposta do `/chat`; MUST gerar uma linha de log de nível `error` com o `requestId`.
- **FR-008**: O sistema MUST expor `GET /requests/:id`, que retorna 200 com o registro da requisição e a lista `trace` ordenada por sequência crescente.
- **FR-009**: `GET /requests/:id` MUST validar o formato do identificador na borda (400 se inválido) e retornar 404 com código `REQUEST_NOT_FOUND` quando não houver registro.
- **FR-010**: O sistema MUST prover um módulo de logging estruturado em `src/obs/logger.ts` que escreve exatamente um objeto JSON por linha, por evento, na saída padrão do processo (erros na saída de erro).
- **FR-011**: Cada linha de log MUST conter ao menos `ts` (ISO 8601), `level`, `event` e, quando aplicável, `requestId`.
- **FR-012**: O logger MUST registrar somente metadados: MUST NOT incluir texto da mensagem do usuário, resposta, conteúdo de pensamentos/observações/críticas/resumos, argumentos de ferramentas ou fatos de memória. Metadados permitidos incluem `node`, `type`, nome da ferramenta, sequência, status, código de erro, duração, contagens, modelo usado e tamanhos em caracteres.
- **FR-013**: Para cada `/chat`, o sistema MUST emitir uma linha de início (`request.start`), uma linha por evento de trace (`trace.event`) e uma linha de conclusão (`request.end`) com status e latência.
- **FR-014**: O logger e o armazenamento de requisições MUST ser injetáveis na composição da aplicação, permitindo doubles determinísticos nos testes.
- **FR-015**: O sistema MUST incluir testes automatizados determinísticos cobrindo: `requestId` no header e no corpo (sucesso e erro), persistência de registro e trace ordenado, `GET /requests/:id` (200, 404, 400), isolamento de falha de persistência e ausência de conteúdo nos logs.

### Key Entities

- **RequestRecord**: Uma execução de `/chat`. Atributos: `requestId`, `conversationId`, `userId`, rota, status HTTP, código de erro, métricas (`latencyMs`, `llmCalls`, `promptTokens`, `modelUsed`, `historyMessages`, `memoryFacts`) e data/hora de criação. Possui zero ou mais `TraceEventRecord`.
- **TraceEventRecord**: Um evento do trace de uma requisição. Atributos: `requestId`, sequência, `node`, `type` e payload completo. Pertence a exatamente um `RequestRecord`.
- **LogEntry**: Uma linha de log estruturado. Atributos: `ts`, `level`, `event`, `requestId` e metadados adicionais; nunca contém conteúdo textual de domínio.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das respostas de `/chat` (sucesso ou erro tratado) trazem um identificador de requisição idêntico no header e no corpo.
- **SC-002**: 100% das requisições `/chat` concluídas podem ser recuperadas por identificador com registro e trace completos, na mesma ordem e com o mesmo conteúdo entregue ao cliente.
- **SC-003**: 0 linhas de log contêm texto da mensagem do usuário, da resposta ou de payloads de trace, verificado por testes automatizados.
- **SC-004**: 100% das linhas de log emitidas são interpretáveis isoladamente como JSON.
- **SC-005**: Falhas de persistência simuladas não alteram nenhuma resposta de chat (0 respostas afetadas).
- **SC-006**: Um operador consegue, a partir de um identificador informado por um cliente, obter o trace completo da execução com uma única consulta.

## Assumptions

- O `requestId` é sempre gerado pelo servidor; um `X-Request-Id` recebido do cliente é ignorado (propagação de IDs externos fica fora do escopo).
- `GET /requests/:id` segue o mesmo modelo de acesso de `/chat` (sem autenticação), coerente com o uso local/acadêmico atual do OpsPilot; controle de acesso fica fora do escopo.
- Não há política de retenção ou expurgo automático das tabelas nesta versão.
- A persistência ocorre uma única vez, ao final da requisição (após resposta montada ou erro tratado), sem gravação incremental durante a execução.
- Requisições a outras rotas (incluindo o próprio `GET /requests/:id`) recebem log estruturado, mas não são persistidas em `requests`.
- As tabelas residem no mesmo banco SQLite operacional (`OPSPILOT_DB`) já usado por conversas e memórias.
- Os logs existentes via `console.error` nos fluxos de `/chat` passam a usar o logger estruturado; demais pontos do sistema podem migrar gradualmente.
- Esta feature depende da 012 (`012-model-fallback-resilience`): o evento de trace `fallback`, a métrica `modelUsed` e a resposta 503 (`MODEL_SERVICE_UNAVAILABLE`) são considerados existentes. A 012 deve estar concluída e integrada antes do início da implementação da 013.
