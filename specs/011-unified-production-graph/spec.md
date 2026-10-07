# Feature Specification: Grafo unificado de produção

**Feature Branch**: `011-unified-production-graph`

**Created**: 2026-10-05

**Status**: Draft

**Input**: User description: "Grafo unificado: production-graph.ts: nós contexto, roteador, as 3 estratégias como nós e resposta. Roteador: withStructuredOutput (route, reason); tabela no prompt; evento 'route' e campo node em todo evento de trace. /chat: strategy opcional (se vier, é override no trace)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Uma execução, um grafo (Priority: P1)

Como operador de plantão, quero que cada turno de chat passe por um único fluxo de produção (preparar contexto, escolher como raciocinar, executar, responder), para que a resposta e o rastro sejam sempre comparáveis, independentemente da forma de raciocínio usada.

**Why this priority**: Sem um grafo único, cada estratégia é um caminho paralelo e o operador não vê a mesma sequência de etapas (contexto → decisão → execução → resposta).

**Independent Test**: Enviar uma mensagem válida em `POST /chat` sem forçar estratégia e verificar que a resposta inclui rastreio com etapas de contexto, roteamento, execução da estratégia escolhida e resposta final.

**Acceptance Scenarios**:

1. **Given** uma mensagem operacional válida e nenhum campo `strategy`, **When** o turno de chat é processado, **Then** o fluxo percorre contexto, roteador, exatamente uma das três estratégias e resposta.
2. **Given** uma execução bem-sucedida, **When** o rastreio é inspecionado, **Then** existe um evento de roteamento com a rota escolhida e o motivo, e a resposta final está presente.
3. **Given** o mesmo endpoint de chat já usado hoje, **When** o turno termina, **Then** o cliente continua recebendo resposta, rastreio e métricas no contrato existente, acrescido dos campos de observabilidade desta feature.

---

### User Story 2 - O roteador escolhe a estratégia (Priority: P1)

Como operador, quero que o sistema escolha sozinho entre as três formas de raciocínio com um motivo explícito, para não ter de saber qual modo usar em cada incidente.

**Why this priority**: O valor do grafo unificado é a decisão automática; sem roteador estruturado, o default rígido (`react`) permanece.

**Independent Test**: Executar o roteador com uma decisão determinística (duplo/fixo) e verificar que a estratégia correspondente é a única executada e que o evento de rota registra `route` e `reason`.

**Acceptance Scenarios**:

1. **Given** uma mensagem sem `strategy`, **When** o roteador devolve uma rota válida e um motivo, **Then** apenas o nó daquela estratégia é executado.
2. **Given** o prompt do roteador, **When** ele é inspecionado, **Then** contém uma tabela explícita de critérios (quando usar cada uma das três estratégias).
3. **Given** a saída do roteador, **When** ela é validada, **Then** contém exatamente os campos `route` (uma das três estratégias) e `reason` (texto não vazio).

---

### User Story 3 - Override explícito no chat (Priority: P1)

Como operador ou avaliador, quero opcionalmente informar a estratégia no `POST /chat` para forçar o caminho, e ainda assim ver essa escolha no rastreio, para reproduzir um modo específico sem perder observabilidade.

**Why this priority**: Arena, testes e plantão precisam de controle; o override não pode silenciar a decisão no trace.

**Independent Test**: Chamar `POST /chat` com `strategy` válida e com `strategy` desconhecida; afirmar override no evento de rota no primeiro caso e rejeição no segundo.

**Acceptance Scenarios**:

1. **Given** um `strategy` igual a uma das três estratégias conhecidas, **When** o turno é processado, **Then** essa estratégia é executada e o evento de rota registra a mesma rota, com motivo indicando override do cliente (sem decisão automática).
2. **Given** um `strategy` omitido ou vazio, **When** o turno é processado, **Then** o roteador automático decide a rota.
3. **Given** um `strategy` desconhecido, **When** a requisição é validada, **Then** o sistema rejeita com erro de estratégia desconhecida (mesmo comportamento de contrato já esperado pelos clientes) e não executa o grafo.

---

### User Story 4 - Rastreio com origem de cada evento (Priority: P2)

Como operador que audita uma decisão, quero que todo evento do rastreio diga em qual etapa do grafo nasceu, para correlacionar pensamento, ferramentas e resposta com contexto, roteador, estratégia ou resposta.

**Why this priority**: Sem o campo de nó, o evento `route` isolado não explica a origem do restante do trace.

**Independent Test**: Inspecionar um rastreio completo (override e rota automática) e afirmar que cada evento possui `node` preenchido com o identificador do nó que o emitiu.

**Acceptance Scenarios**:

1. **Given** qualquer evento de rastreio produzido pelo grafo de produção, **When** ele é inspecionado, **Then** possui um campo `node` identificando o nó (`context`, `router`, o nome da estratégia executada, ou `response`).
2. **Given** a decisão de rota, **When** o rastreio é lido em ordem, **Then** há um evento do tipo `route` emitido pelo nó `router`, contendo a rota e o motivo.

---

### Edge Cases

- `strategy` informado mas inválido: rejeitar na fronteira; não chamar roteador nem estratégias.
- `strategy` válido que o roteador automático nunca escolheria: o override prevalece.
- Falha no roteador automático (saída inválida ou erro do modelo): erro de domínio explícito, sem executar uma estratégia “por default silencioso”.
- Flag `reflect` já existente: se o cliente a enviar junto com override ou rota automática que não seja o nó `reflect`, a reflexão continua a decorar a estratégia efetiva; se a rota já for `reflect`, não aplicar o decorator uma segunda vez.
- Timeout, conversa inexistente, validação Zod e orçamento de contexto permanecem com os códigos e semânticas atuais.
- Arena e bench continuam selecionando estratégias pelo registro direto; esta feature não os obriga a passar pelo grafo unificado.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST expor um grafo de produção único com os nós `context`, `router`, as três estratégias (`react`, `plan-and-execute`, `reflect`) e `response`.
- **FR-002**: O nó `context` MUST preparar o input do turno reutilizando a montagem de contexto já existente (resumo, memória, histórico, mensagem e orçamento), de forma que as estratégias recebam o mesmo prompt composto que o chat já produz.
- **FR-003**: O nó `router` MUST produzir saída estruturada `{ route, reason }`, em que `route` é um enumerado das três estratégias e `reason` é um texto não vazio.
- **FR-004**: O prompt do roteador MUST incluir uma tabela de critérios descrevendo quando escolher cada estratégia.
- **FR-005**: Na ausência de `strategy` no chat, o sistema MUST usar a decisão do roteador e executar somente o nó correspondente.
- **FR-006**: Quando `strategy` vier preenchido e for uma das três estratégias, o sistema MUST tratar o valor como override: não consultar o modelo do roteador, executar o nó correspondente e registrar no rastreio um evento `route` com essa rota e motivo de override.
- **FR-007**: Quando `strategy` vier preenchido e não for uma das três estratégias, o sistema MUST rejeitar o turno com o mesmo erro de estratégia desconhecida já usado pelos clientes, sem executar o grafo.
- **FR-008**: O rastreio MUST aceitar o tipo de evento `route` com os campos `route` e `reason`.
- **FR-009**: Todo evento de rastreio emitido pelo grafo de produção MUST incluir o campo `node` com o identificador do nó emissor.
- **FR-010**: O nó `response` MUST consolidar a resposta final enviada ao cliente a partir da estratégia executada, preservando `answer`, `trace` e `metrics`.
- **FR-011**: O chat MUST manter `strategy` opcional; omitir o campo deixa de implicar default `react` e passa a implicar roteamento automático.
- **FR-012**: Métricas MUST somar as chamadas ao modelo do roteador (quando houver) às da estratégia executada; `latencyMs` MUST medir a execução completa do grafo.
- **FR-013**: Persistência de conversa, orçamento de contexto, timeout, reflection opcional via `reflect`, learning e sumarização MUST permanecer nos mesmos pontos do turno, salvo a substituição da execução isolada de uma estratégia pelo grafo unificado.
- **FR-014**: O sistema MUST incluir testes determinísticos (sem rede) para: override vs roteamento automático, evento `route`, campo `node` em todos os eventos, rejeição de estratégia desconhecida, e encaminhamento para o nó correto a partir de uma decisão de rota injetada.

### Key Entities

- **ProductionGraph**: fluxo único de produção com nós de contexto, roteador, três estratégias e resposta.
- **RouteDecision**: decisão `{ route, reason }`, originada do roteador automático ou de override do cliente.
- **TraceEvent**: evento de rastreio; passa a incluir `node` e o tipo `route`.
- **StrategyNode**: um dos três modos executáveis (`react`, `plan-and-execute`, `reflect`).
- **ChatTurn**: turno HTTP que opcionalmente informa `strategy` como override.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% dos turnos de chat bem-sucedidos percorrem contexto → decisão de rota → uma estratégia → resposta, visível no rastreio.
- **SC-002**: 100% dos turnos sem `strategy` incluem um evento de rota com motivo não vazio e executam exatamente a estratégia nomeada nesse evento.
- **SC-003**: 100% dos turnos com `strategy` válido executam essa estratégia e registram override no rastreio; 100% dos valores desconhecidos são rejeitados antes da execução.
- **SC-004**: 100% dos eventos de rastreio do grafo de produção identificam o nó de origem.
- **SC-005**: Clientes que omitiam `strategy` deixam de ser amarrados a um único modo: em uma bateria de mensagens distintas, o roteador automático é capaz de selecionar mais de uma das três estratégias (verificável com decisões injetadas ou com o prompt/tabela).
- **SC-006**: Testes do grafo e do `/chat` relacionados a esta feature passam de forma repetível sem rede.

## Assumptions

- As três estratégias-nó são as já conhecidas no produto: `react`, `plan-and-execute` e `reflect` (`withReflection` sobre a estratégia-base ReAct, sem reaplicar o decorator se o cliente também enviar `reflect: true`).
- A tabela do roteador, na ausência de texto fornecido pelo usuário, usa critérios: `react` para diagnóstico iterativo com ferramentas; `plan-and-execute` para tarefas com vários passos sequenciais; `reflect` quando a resposta precisa de crítica extra (risco, evidência incompleta, conclusão operacional firme).
- Override não altera persistência nem o orçamento de contexto; só substitui a decisão do roteador.
- Arena, bench e MCP permanecem no registro de estratégias e não entram no escopo desta feature.
- Eventos produzidos dentro de uma estratégia herdam `node` igual ao nome da estratégia-nó em execução.
- A composição oficial do grafo vive em `src/agents/production-graph.ts`; o plano detalhará o encaixe no handler HTTP.
- O default atual `strategy ?? "react"` no `/chat` é comportamento a substituir, não a preservar.
