# Feature Specification: Sumarização de histórico (pruning)

**Feature Branch**: `009-history-summarization`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Sumarização de histórico (pruning): tabela conversation_summaries; o que sai das 8 mensagens recentes vira resumo de ~150 tokens preservando decisões, fatos e pendencias, MESCLADO ao resumo anterior e persistido - refeito só quando 8 novas saem da janela, nunca a cada request. Resumo entra no contexto; evento \"summarize\". Com teste fake"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Persistir resumo por conversa (Priority: P1)

Como sistema de conversa persistente, quero armazenar um resumo acumulado por `conversationId` em uma tabela dedicada (`conversation_summaries`), para que o contexto antigo sobreviva ao pruning sem manter todas as mensagens no prompt.

**Why this priority**: Sem persistência do resumo, o pruning perderia decisões e fatos de plantões longos.

**Independent Test**: Com store fake (e, quando aplicável, SQLite `:memory:`), gravar/ler um resumo para uma conversa; atualizar com merge; afirmar que o valor persistido é o mesclado e que conversa inexistente é rejeitada de forma clara.

**Acceptance Scenarios**:

1. **Given** uma conversa existente sem resumo, **When** o primeiro resumo é persistido, **Then** existe exatamente um registro associado a esse `conversationId` com o texto do resumo e metadados mínimos (ex.: contagem de mensagens já cobertas / ponteiro de progresso).
2. **Given** um resumo já persistido, **When** um novo lote é mesclado, **Then** o registro é atualizado com o texto mesclado (não cria segundo resumo paralelo para a mesma conversa).
3. **Given** um `conversationId` desconhecido, **When** se tenta ler/gravar resumo, **Then** o erro é o de domínio de conversa inexistente (mesmo contrato da feature 005), sem criar órfãos.
4. **Given** schema SQLite, **When** o store inicializa, **Then** a tabela `conversation_summaries` é criada de forma idempotente.

---

### User Story 2 - Pruning em lotes de 8 (não a cada request) (Priority: P1)

Como mantenedor do OpsPilot, quero que mensagens que saem da janela das **8 mais recentes** só sejam condensadas quando **8 novas** mensagens tiverem saído da janela desde o último resumo — nunca em toda requisição — para controlar custo de LLM e manter o comportamento previsível.

**Why this priority**: A regra de lote é o diferencial da feature; sumarizar a cada request violaria o pedido e degradaria latência/custo.

**Independent Test**: Com summarizer fake determinístico e store fake: popular conversa; após turnos que ainda não completam 8 mensagens fora da janela, afirmar que o summarizer **não** foi chamado e o resumo não mudou; ao completar exatamente o lote de 8 fora da janela, afirmar **uma** chamada de merge e persistência.

**Acceptance Scenarios**:

1. **Given** conversa com ≤ 8 mensagens totais, **When** um turno de chat roda, **Then** nenhum summarize ocorre; o contexto usa só o histórico recente (sem bloco de resumo ou com resumo vazio omitido).
2. **Given** conversa com mensagens além das 8 recentes, mas com **menos de 8** mensagens ainda não cobertas pelo resumo, **When** turnos adicionais ocorrem, **Then** o summarizer **não** é invocado nesses requests.
3. **Given** exatamente **8** mensagens novas fora da janela desde o último progresso de resumo, **When** o caminho de chat detecta essa condição (no turno em que o lote completa), **Then** o summarizer roda **uma** vez, mescla com o resumo anterior (se houver), persiste, e avança o ponteiro de progresso.
4. **Given** o mesmo lote já sumarizado, **When** requests seguintes não acumulam novo lote completo de 8, **Then** nenhum novo summarize ocorre.
5. **Given** summarizer falha, **When** o lote seria processado, **Then** a resposta do chat não precisa falhar com 5xx por causa do summarize (falha observável; resumo anterior permanece; ponteiro não avança indevidamente) — ver Assumptions se o summarize for síncrono no caminho crítico.

---

### User Story 3 - Resumo ~150 tokens com decisões, fatos e pendências (Priority: P1)

Como operador em plantão longo, quero que o lote condensado preserve **decisões**, **fatos** e **pendências** em um resumo curto (~150 tokens), mesclado ao resumo anterior, para que o agente continue coerente sem o texto integral antigo.

**Why this priority**: Qualidade do conteúdo sumarizado é o valor operacional do pruning.

**Independent Test**: Summarizer fake que recebe (resumoAnterior + lote de 8 mensagens) e devolve texto fixo; afirmar que a API do summarizer foi chamada com esses insumos e que o resultado persistido/injetado é o retorno do merge.

**Acceptance Scenarios**:

1. **Given** um lote elegível e resumo anterior não vazio, **When** o summarize roda, **Then** a entrada do summarizer inclui o resumo anterior **e** o texto das 8 mensagens que saíram da janela, e a saída é o novo resumo mesclado.
2. **Given** primeiro lote (sem resumo anterior), **When** o summarize roda, **Then** o resumo gerado cobre só esse lote e é persistido.
3. **Given** instruções do summarizer, **When** avaliadas, **Then** pedem preservar decisões, fatos e pendências e visar ~150 tokens (não romancear nem inventar).
4. **Given** testes, **When** usam summarizer fake, **Then** nenhum LLM real é obrigatório no CI.

---

### User Story 4 - Resumo no contexto + evento `summarize` (Priority: P2)

Como cliente/observador do `/chat`, quero que o resumo acumulado entre no contexto enviado à estratégia e que, quando um summarize ocorrer naquele turno, o trace inclua um evento `summarize`, para auditar pruning e medir impacto no contexto.

**Why this priority**: Fecha o ciclo observabilidade + composição; depende do store e da regra de lote.

**Independent Test**: Composição HTTP (ou helper de compose) com resumo persistido + 8 mensagens recentes; strategy stub vê o bloco de resumo no input; quando o lote dispara, `trace` contém evento do tipo `summarize`.

**Acceptance Scenarios**:

1. **Given** resumo persistido não vazio, **When** um turno é composto, **Then** o input da strategy inclui o resumo (bloco explícito) **além** das até 8 mensagens mais recentes e da mensagem atual (e demais blocos existentes: memória etc.).
2. **Given** resumo vazio/ausente, **When** o turno é composto, **Then** nenhum bloco de resumo vazio polui o prompt.
3. **Given** um turno em que o lote de 8 dispara summarize, **When** a resposta é montada, **Then** o `trace` inclui um evento tipado `summarize` (conteúdo = resumo resultante ou indicador legível do merge).
4. **Given** um turno sem summarize, **When** a resposta é montada, **Then** não há evento `summarize` espúrio.
5. **Given** métricas/contexto (feature 008), **When** o resumo entra no prompt, **Then** pode contribuir para estimativa de tokens do contexto (se o breakdown for estendido); no mínimo o texto está no composed input — detalhe fino no plano.

## Edge Cases

- Conversa nova / primeira mensagem: sem resumo, sem evento `summarize`.
- Número ímpar de mensagens fora da janela (ex.: 7, 9, 15): só dispara ao completar múltiplos de 8 mensagens **ainda não cobertas** pelo ponteiro; o excedente fica pendente até completar o próximo lote.
- Conteúdo do lote com segredos: summarizer instrui a não copiar segredos/credenciais para o resumo (alinhar espírito do refletor 007); testes fake não precisam de LLM real.
- Falha parcial de persistência após gerar texto: não avançar ponteiro sem gravação bem-sucedida (evita perder lote).
- Janela “8 recentes” conta mensagens já persistidas **antes** do append do turno atual (mesmo espírito de `lastMessages` em 005); o plano fixa se o turno corrente entra no cálculo antes ou depois do append.
- Compatibilidade com `historyMessages`: a métrica deve refletir quantas mensagens **raw** entraram no prompt (0..8), não o tamanho do resumo.
- Fake store e fake summarizer obrigatórios nos testes unitários/HTTP; SQLite `:memory:` para schema da tabela nova.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST persistir no máximo um resumo acumulado por conversa na tabela `conversation_summaries` (schema idempotente no store SQLite de conversa).
- **FR-002**: O contexto raw de histórico no `/chat` MUST usar as **8** mensagens mais recentes (janela raw desta feature), não as 12 da 005, quando a sumarização estiver ativa no caminho de composição.
- **FR-003**: Mensagens fora dessa janela MUST ser candidatas a sumarização; o summarizer MUST rodar somente quando houver pelo menos **8** mensagens novas fora da janela ainda não cobertas pelo progresso do resumo.
- **FR-004**: O summarizer MUST mesclar o resumo anterior (se houver) com o lote de 8 mensagens, visando ~150 tokens e preservando decisões, fatos e pendências; o resultado MUST ser persistido substituindo o resumo anterior.
- **FR-005**: O sistema MUST NOT invocar o summarizer em todo request — apenas na condição de lote completo (FR-003).
- **FR-006**: Quando existir resumo não vazio, a composição do prompt MUST incluí-lo no contexto enviado à strategy.
- **FR-007**: Quando um summarize ocorrer no turno, o `trace` MUST incluir um evento do tipo `summarize`.
- **FR-008**: Summarizer e store MUST ser injetáveis; testes MUST cobrir regra de lote, merge, persistência e composição com **fake** (sem LLM real obrigatório); `npm run test` / `npm run typecheck` permanecem verdes.
- **FR-009**: Ponteiro/progresso de mensagens já cobertas pelo resumo MUST avançar somente após persistência bem-sucedida do novo resumo.

### Key Entities

- **ConversationSummary**: Texto acumulado por `conversationId`, persistido em `conversation_summaries`, com progresso (ex.: quantas mensagens já foram absorvidas no resumo).
- **SummaryBatch**: Lote de exatamente 8 mensagens que saíram da janela raw e ainda não estavam cobertas.
- **HistorySummarizer**: Porta injetável `(previousSummary, batchMessages) => newSummary` (default LLM; fake nos testes).
- **TraceEvent `summarize`**: Evento de auditoria emitido quando um merge/persistência de resumo ocorre no turno.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em teste com fake, com 8 mensagens totais ou menos, o summarizer é chamado **0** vezes ao longo de N turnos.
- **SC-002**: Em teste com fake, ao completar o primeiro lote de 8 mensagens fora da janela, o summarizer é chamado **exatamente 1** vez e o resumo persistido é o retorno do fake.
- **SC-003**: Em teste com resumo anterior + novo lote, a entrada do fake inclui ambos e o persistido é o merge retornado.
- **SC-004**: Em turnos intermediários (lote incompleto), summarizer chamado 0 vezes e resumo inalterado.
- **SC-005**: Com resumo persistido, o input da strategy contém o texto do resumo e no máximo 8 mensagens raw de histórico; `historyMessages` ∈ [0, 8].
- **SC-006**: Turno que dispara summarize inclui evento `summarize` no trace; turnos sem disparo não incluem.
- **SC-007**: Suíte automatizada com fakes passa em `npm run test`; typecheck verde.

## Assumptions

- A janela raw de **8** substitui a janela de **12** da feature 005 no caminho de composição do `/chat` (pruning + resumo cobrem o papel do histórico mais antigo).
- “~150 tokens” é alvo instrucional do summarizer (e/ou validação suave); não exige tokenizer oficial — pode alinhar à estimativa chars/4 (~600 caracteres) no plano se útil para testes.
- O progresso “8 novas saem da janela” conta mensagens persistidas da conversa cujo índice/ordem já não cabe nas 8 mais recentes e ainda não foram absorvidas pelo resumo; o lote processado é sempre de tamanho 8.
- Default summarizer usa LLM (mesmo provedor do projeto); CI usa fake injetável.
- Memória semântica (006) e learning reflector (007) permanecem; o bloco de resumo de conversa é ortogonal ao bloco de memórias do usuário.
- Arena/bench/MCP não são obrigados a ativar summarize nesta feature; foco em store + composição `/chat` + testes fake.
- Evento `summarize` estende o union de `TraceEvent` existente.
