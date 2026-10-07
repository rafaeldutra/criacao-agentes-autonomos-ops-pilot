# Feature Specification: Resiliência e Fallback de Modelos

**Feature Branch**: `012-model-fallback-resilience`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Resiliência de modelo: - .env: OPENROUTER_MODEL_FALLBACK - fábrica model.ts: withRetry no primário; withFallbacks([reserva]) - Trace: evento \"fallback\"; metrics.modelUsed. - Caso nada funcione; 503"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Execução primária com retentativa transparente (Priority: P1)

Como operador de plantão, quero que instabilidades transitórias na comunicação com o modelo primário sejam retentadas automaticamente sem interrupção do atendimento, para que incidentes e consultas sejam resolvidos continuamente sem falhas desnecessárias.

**Why this priority**: Interrupções de rede e rate limits esporádicos no provedor de IA são comuns em produção; retentativas evitam abortar tarefas válidas.

**Independent Test**: Executar uma chamada com falha transitória inicial simulada no modelo primário seguida de resposta bem-sucedida; verificar que a resposta é entregue com sucesso, `metrics.modelUsed` registra o modelo primário e nenhum evento de contingência `fallback` é emitido.

**Acceptance Scenarios**:

1. **Given** um modelo primário configurado e saudável, **When** uma requisição de chat é enviada, **Then** a resposta é retornada normalmente, `metrics.modelUsed` indica o modelo primário e nenhum evento `fallback` aparece no rastreio.
2. **Given** um erro transitório recuperável na primeira tentativa do modelo primário, **When** a chamada é realizada, **Then** a política de retentativa tenta novamente com sucesso e o turno é completado sem acionar a contingência.

---

### User Story 2 - Comutação para modelo reserva com rastreio de fallback (Priority: P1)

Como operador de plantão, quero que o sistema comute automaticamente para um modelo de contingência quando o primário estiver indisponível ou esgotar suas retentativas, e registre explicitamente essa comutação no rastreio e nas métricas, para manter o atendimento ativo e saber exatamente qual modelo respondeu.

**Why this priority**: A indisponibilidade do modelo primário não deve paralisar o OpsPilot se um modelo alternativo estiver configurado; transparência no rastreio e métricas é crucial para auditoria e custos operacionais.

**Independent Test**: Simular falha definitiva ou esgotamento de retentativas no modelo primário enquanto o modelo reserva está acessível; verificar que a chamada retorna 200, o rastreio contém um evento `fallback` descrevendo a comutação, e `metrics.modelUsed` reflete o identificador do modelo de contingência.

**Acceptance Scenarios**:

1. **Given** falha persistente ou não recuperável no modelo primário e um modelo reserva saudável configurado, **When** a solicitação é executada, **Then** a chamada é delegada ao modelo reserva, o evento `fallback` é incluído no rastreio operacional e a resposta final é gerada.
2. **Given** uma requisição atendida pelo modelo reserva, **When** as métricas da resposta são verificadas, **Then** `metrics.modelUsed` contém o identificador exato do modelo reserva configurado em `OPENROUTER_MODEL_FALLBACK`.
3. **Given** um turno concluído via fallback, **When** uma nova requisição é submetida e o modelo primário volta a operar normalmente, **Then** o sistema volta a utilizar o modelo primário sem persistir estado degradado.

---

### User Story 3 - Degradação graciosa com HTTP 503 em falha total (Priority: P1)

Como cliente HTTP da API ou operador, quero receber um status HTTP 503 (Service Unavailable) padronizado quando nem o modelo primário nem o modelo reserva conseguirem responder, para diferenciar claramente falha de infraestrutura de inteligência artificial de erros internos da aplicação (500), timeout (504) ou requisições inválidas (400).

**Why this priority**: Quando todos os modelos de IA falham, clientes HTTP, balanceadores e operadores precisam de um sinal de indisponibilidade de serviço upstream inequívoco (503) para acionar alertas ou balanceamento externo, sem mascarar como erro genérico 500.

**Independent Test**: Simular falha tanto no modelo primário quanto no modelo reserva; chamar `POST /chat` e verificar que a resposta HTTP possui status 503, código de erro estruturado indicando indisponibilidade de LLM e mensagem clara.

**Acceptance Scenarios**:

1. **Given** indisponibilidade total do modelo primário e do modelo reserva, **When** uma requisição `POST /chat` é processada, **Then** a API retorna status HTTP 503 com código de erro descritivo (ex.: `MODEL_SERVICE_UNAVAILABLE`).
2. **Given** uma resposta 503 por falha de modelos, **When** inspecionado o corpo da resposta, **Then** a resposta contém formato JSON consistente (`{ "error": "...", "code": "..." }`) sem vazamento de stack trace interno.

---

### User Story 4 - Configuração declarativa de contingência via ambiente (Priority: P2)

Como administrador do sistema, quero declarar o modelo de contingência através de `OPENROUTER_MODEL_FALLBACK` no ambiente (`.env`), para poder alterar o modelo alternativo de produção sem modificar o código-fonte da aplicação.

**Why this priority**: Prover flexibilidade operacional para apontar contingências diferentes em ambientes de desenvolvimento, homologação e produção sem necessidade de rebuild.

**Independent Test**: Carregar a aplicação com `OPENROUTER_MODEL_FALLBACK` definido e validar que a fábrica de modelos inicializa a cadeia resiliente com o modelo reserva correto.

**Acceptance Scenarios**:

1. **Given** as variáveis `OPENROUTER_MODEL` e `OPENROUTER_MODEL_FALLBACK` preenchidas no ambiente, **When** a fábrica de modelos é invocada, **Then** uma instância com cadeia de retentativa e fallback é criada com sucesso.
2. **Given** a ausência de variável obrigatória de contingência quando requerida pelo ambiente, **When** o sistema valida a configuração, **Then** um erro explícito de configuração ausente é emitido na inicialização.

---

### Edge Cases

- **Esgotamento de tempo antes do fallback completar**: Se o tempo de retentativa do primário somado à execução do reserva atingir o teto de timeout global (`CHAT_TIMEOUT_MS`), o tratador de timeout tem precedência (retornando 504) para respeitar o SLA do cliente.
- **Falha com erros de validação ou autenticação upstream**: Erros de autorização (401/403) ou formato incompatível no primário acionam a contingência caso a política de fallback capture essas falhas, ou falham caso ambos compartilhem a mesma credencial rejeitada.
- **Modelos com diferentes capacidades de structured output**: Caso o fallback seja acionado em nós que exigem ferramentas ou esquemas estruturados, o modelo reserva deve manter suporte aos mesmos esquemas para não quebrar a execução a jusante.
- **Recuperação transparente entre requisições**: O acionamento do modelo reserva em uma requisição não deve prender a aplicação em modo degradado permanente; a requisição subsequente deve sempre tentar o modelo primário primeiro.


## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST carregar a variável de ambiente `OPENROUTER_MODEL_FALLBACK`, documentando seu propósito e valor de exemplo no arquivo `.env.example`.
- **FR-002**: A fábrica de modelos em `src/agents/model.ts` MUST configurar o modelo primário com política de retentativa automática (`withRetry`) para lidar com falhas transitórias.
- **FR-003**: A fábrica de modelos em `src/agents/model.ts` MUST compor o modelo primário com um modelo reserva configurado a partir de `OPENROUTER_MODEL_FALLBACK` usando mecanismo de contingência (`withFallbacks`).
- **FR-004**: O modelo reserva MUST utilizar as mesmas credenciais base (`OPENROUTER_API_KEY`) e base URL de comunicação do OpenRouter que o modelo primário.
- **FR-005**: O sistema MUST emitir um evento de rastreio (`TraceEvent`) do tipo `"fallback"` quando a execução falhar no modelo primário e for atendida pelo modelo reserva.
- **FR-006**: O evento de rastreio `"fallback"` MUST conter informações sobre a transição de modelos (modelo de origem, modelo de contingência e causa/motivo do fallback).
- **FR-007**: A estrutura de métricas (`Metrics`) MUST incluir o campo `modelUsed?: string`, indicando o identificador do modelo que efetivamente concluiu a geração da resposta.
- **FR-008**: Quando a execução for completada pelo modelo primário, `metrics.modelUsed` MUST reportar o identificador do modelo primário (`OPENROUTER_MODEL`).
- **FR-009**: Quando a execução for completada pelo modelo reserva após contingência, `metrics.modelUsed` MUST reportar o identificador do modelo reserva (`OPENROUTER_MODEL_FALLBACK`).
- **FR-010**: Quando todas as tentativas do modelo primário e do modelo reserva falharem, o sistema MUST disparar um erro identificável de indisponibilidade de modelo.
- **FR-011**: A camada HTTP (`src/http/server.ts`) MUST interceptar a falha irrecuperável de modelos e responder com status HTTP 503 (Service Unavailable), contendo corpo JSON padronizado com mensagem descritiva e código de erro explícito.
- **FR-012**: O sistema MUST incluir testes automatizados determinísticos (sem dependência de rede externa) cobrindo: sucesso no modelo primário, retentativas do primário, disparo do fallback com evento e métrica de modelo utilizado, e conversão de falha total para HTTP 503.

### Key Entities

- **ResilientModel**: Cadeia de modelo de linguagem composta por um modelo primário com retentativas e um modelo reserva de contingência.
- **FallbackTraceEvent**: Evento no rastreio com `type: "fallback"`, indicando a comutação de modelo (`fromModel`, `toModel`, `reason`).
- **ModelMetrics**: Extensão das métricas de raciocínio contendo `modelUsed`, informando qual modelo concluiu a geração da resposta.
- **ModelUnavailableError**: Erro de domínio / infraestrutura representativo de falha exaustiva em todos os modelos de linguagem disponíveis, mapeado para HTTP 503.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% das requisições bem-sucedidas expõem `metrics.modelUsed` identificado com precisão (primário ou reserva).
- **SC-002**: 100% das transições onde o modelo primário falha e o modelo reserva responde com sucesso registram o evento `fallback` no rastreio operacional.
- **SC-003**: 100% dos cenários em que primário e reserva falham simultaneamente resultam em resposta com status HTTP 503 para o consumidor, com 0 ocorrências de respostas não tratadas com código 500 para falha de modelo.
- **SC-004**: Instabilidades transitórias cobertas pela política de retentativa do modelo primário são recuperadas de forma transparente sem acionamento desnecessário do modelo de contingência.

## Assumptions

- A variável `OPENROUTER_MODEL_FALLBACK` é lida de `process.env` de forma centralizada na fábrica `src/agents/model.ts`, respeitando a constituição do OpsPilot sobre isolamento de variáveis de ambiente.
- O modelo de fallback possui capacidades equivalentes suficientes para executar os prompts das ferramentas, roteamento e reflexão configurados no OpsPilot.
- O número de retentativas no modelo primário é mantido baixo (por padrão, até 2 retentativas adicionais) para não esgotar o orçamento de tempo global do chat HTTP.

