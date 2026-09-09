# Feature Specification: Núcleo de raciocínio do OpsPilot

**Feature Branch**: `001-reasoning-core`
**Created**: 2026-09-09
**Status**: Draft
**Input**: User description: "Núcleo de racicínio do OpsPilot: Interface comum ReasoningStrategy: name + run(input) -> (answer, trace, metrics). trace = eventos tipados (thought | action | observation | plan | critique | answer; action carrega (tool, args)). metrics = (llmCalls, latencyMs). Fábrica única em src/agents/model.ts lendo OPENROUTER_API_KEY e OPENROUTER_MODEL (baseURL do OpenRouter), temperature 0. Ferramentas mock em src/agents/tools.ts sobre um store in-memory pré-populado (o seed primário: 5 serviços, 6 alertas variados - 3 firing, 3 reolved (crie um script para rodar o seed, e execute ele ao final desse prompt)): list_alerts(status), open_incident(title, service, severity), resolve_incident(id). Schemas zod, banco mysql, utilizando sequelize. Estratégia ReAct em src/agents/react.ts usando o agente ReAct pré-construído LangGraph com essas tools, capturando o trace completo. Estratégia Plan-and-Execute em src/agents/plan-and-execute.ts como grafo: planner (saída estruturada: lista de passos), executor (um passo por vez com as tools), replanner (revisa o restante após cada passo; encerra quando não resta nada). Máximo 8 passos. Toda estratégia respeita limite de iterações e conta chamadas de LLM. Arena minima em src/arena.ts: roda 1+ estratégias sobre o mesmo input e imprime traces e métricas (flags --strategies e --max-iterations). Testes: store e formatação de trace (deterministicos, sem rede)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Executar uma estratégia de raciocínio (Priority: P1)

Como operador de plantão, quero enviar uma solicitação operacional a uma estratégia de raciocínio e receber uma resposta acompanhada do trace e das métricas, para entender o que o agente fez e avaliar o resultado.

**Why this priority**: A interface comum é o contrato central que permite comparar e executar as estratégias do OpsPilot.

**Independent Test**: Executar uma estratégia com uma entrada sobre alertas ou incidentes e verificar que ela retorna uma resposta, eventos tipados em ordem e métricas de chamadas e latência.

**Acceptance Scenarios**:

1. **Given** uma entrada operacional válida, **When** uma estratégia é executada, **Then** o resultado contém `answer`, `trace` e `metrics`.
2. **Given** um trace retornado, **When** seus eventos são inspecionados, **Then** cada evento pertence a `thought`, `action`, `observation`, `plan`, `critique` ou `answer`, e eventos `action` incluem a ferramenta e seus argumentos.
3. **Given** uma estratégia configurada com limite de iterações, **When** o limite é atingido, **Then** a execução encerra de forma controlada e informa métricas sem exceder o limite.

---

### User Story 2 - Consultar e alterar o estado operacional (Priority: P1)

Como operador de plantão, quero consultar alertas e abrir ou resolver incidentes, para que as estratégias possam atuar sobre um estado operacional previsível durante uma simulação.

**Why this priority**: As ferramentas fornecem as ações mínimas necessárias para raciocinar sobre alertas e incidentes.

**Independent Test**: Inicializar o estado de demonstração, listar alertas por status, abrir um incidente e resolvê-lo; verificar os resultados e as alterações no estado.

**Acceptance Scenarios**:

1. **Given** o estado inicial de demonstração, **When** os alertas são listados sem filtro, **Then** são retornados seis alertas associados a cinco serviços.
2. **Given** o estado inicial de demonstração, **When** os alertas são filtrados por `firing` ou `resolved`, **Then** são retornados respectivamente três alertas em cada status.
3. **Given** um título, serviço e severidade válidos, **When** um incidente é aberto, **Then** um incidente identificável é criado para o serviço informado.
4. **Given** um incidente existente, **When** ele é resolvido, **Then** seu estado passa a resolvido; um identificador inexistente produz um erro de domínio explícito.

---

### User Story 3 - Comparar estratégias na arena (Priority: P2)

Como desenvolvedor do OpsPilot, quero executar uma ou mais estratégias sobre a mesma entrada e visualizar seus traces e métricas, para comparar seus comportamentos sem alterar o estado de teste de forma inesperada.

**Why this priority**: A arena torna o núcleo observável e permite avaliar ReAct e Plan-and-Execute com o mesmo cenário.

**Independent Test**: Executar a arena com uma estratégia e depois com duas, usando as flags de seleção e limite, e verificar que cada resultado imprime resposta, trace e métricas.

**Acceptance Scenarios**:

1. **Given** uma entrada e uma estratégia selecionada, **When** a arena é executada, **Then** apenas a estratégia selecionada é executada e seu trace e métricas são impressos.
2. **Given** uma entrada e múltiplas estratégias selecionadas, **When** a arena é executada, **Then** todas recebem a mesma entrada e seus resultados são apresentados separadamente.
3. **Given** a flag `--max-iterations`, **When** a arena é executada, **Then** cada estratégia respeita o limite informado.

---

### Edge Cases

- Entradas externas inválidas ou argumentos de ferramentas fora do schema devem produzir erro explícito, sem alterar o estado.
- Listagens com status desconhecido devem ser rejeitadas por validação.
- Resolver incidente inexistente deve retornar erro de domínio identificável.
- A estratégia Plan-and-Execute deve encerrar quando não houver passos restantes e nunca executar mais de oito passos planejados.
- Ausência das configurações necessárias do provedor deve ser reportada claramente pela fábrica de modelos.
- Testes determinísticos não devem depender de rede nem de uma chave real do provedor.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer um contrato `ReasoningStrategy` comum com nome e execução de uma entrada que retorne resposta, trace e métricas.
- **FR-002**: O sistema MUST representar traces com eventos tipados `thought`, `action`, `observation`, `plan`, `critique` e `answer`; eventos de ação MUST registrar ferramenta e argumentos.
- **FR-003**: O sistema MUST registrar em métricas a quantidade de chamadas ao modelo e a latência da execução em milissegundos.
- **FR-004**: O sistema MUST criar modelos para OpenRouter usando as configurações `OPENROUTER_API_KEY` e `OPENROUTER_MODEL`, URL base do OpenRouter e temperatura zero.
- **FR-005**: O sistema MUST disponibilizar as ferramentas `list_alerts(status)`, `open_incident(title, service, severity)` e `resolve_incident(id)` com entradas validadas por schema.
- **FR-006**: O sistema MUST manter um estado de demonstração em memória, com cinco serviços e seis alertas, sendo três `firing` e três `resolved`.
- **FR-007**: O sistema MUST disponibilizar um script para executar o seed primário do estado de demonstração.
- **FR-008**: O sistema MUST disponibilizar uma estratégia ReAct que use as ferramentas e capture o trace completo da execução.
- **FR-009**: O sistema MUST disponibilizar uma estratégia Plan-and-Execute com planejamento estruturado, execução de um passo por vez e replanning após cada passo.
- **FR-010**: A estratégia Plan-and-Execute MUST encerrar quando não houver passos restantes e MUST limitar o plano a no máximo oito passos.
- **FR-011**: Toda estratégia MUST respeitar o limite de iterações recebido e contabilizar suas chamadas ao modelo.
- **FR-012**: A arena MUST executar pelo menos uma estratégia sobre uma mesma entrada e imprimir resposta, trace e métricas.
- **FR-013**: A arena MUST aceitar as flags `--strategies` e `--max-iterations`.
- **FR-014**: O sistema MUST incluir testes determinísticos, sem rede, para o store e para a formatação de traces.
- **FR-015**: A execução local MUST usar `data/seed.json` como fonte de dados, carregando-o para um store em memória que permita ao modelo consultar itens existentes e adicionar incidentes durante a execução.lação.

### Key Entities

- **ReasoningStrategy**: contrato de uma estratégia, com nome e execução de uma entrada.
- **TraceEvent**: evento tipado que explica uma etapa do raciocínio ou resposta; ações incluem ferramenta e argumentos.
- **Metrics**: medidas de execução, incluindo chamadas ao modelo e latência.
- **Service**: serviço monitorado, identificado e associado aos alertas e incidentes.
- **Alert**: sinal operacional com serviço, status e dados de severidade.
- **Incident**: registro acionável associado a um serviço, com título, severidade e estado.
- **PlanStep**: passo estruturado do plano que pode ser executado por uma ferramenta.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das execuções válidas retornam resposta, trace e métricas no contrato comum.
- **SC-002**: O seed primário produz exatamente cinco serviços e seis alertas, com divisão de três alertas `firing` e três `resolved`.
- **SC-003**: 100% das entradas inválidas de ferramentas são rejeitadas antes de alterar o estado operacional.
- **SC-004**: Nenhuma execução Plan-and-Execute ultrapassa oito passos planejados ou o limite de iterações configurado.
- **SC-005**: A arena apresenta separadamente resultados de todas as estratégias selecionadas sobre a mesma entrada.
- **SC-006**: Os testes de store e formatação de trace passam de forma repetível sem acesso à rede ou a credenciais externas.

## Assumptions

- O primeiro seed é um cenário local de demonstração; os dados podem ser reinicializados para repetir testes.
- O arquivo `data/seed.json` é a fonte de dados local; o store em memória é a fonte de estado para a arena, o modelo e os testes determinísticos.
- A chave e o modelo do OpenRouter são necessários apenas para execuções reais das estratégias, não para os testes sem rede.
- A entrada da arena será fornecida pelo mecanismo de execução existente do projeto, sem requisito de uma interface HTTP nesta feature.
- A severidade e os status aceitos seguirão um conjunto enumerado e explícito nos schemas das ferramentas.
