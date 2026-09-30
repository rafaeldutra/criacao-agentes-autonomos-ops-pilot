# Feature Specification: Instrumentação de medição de contexto

**Feature Branch**: `008-context-token-metrics`

**Created**: 2026-09-28

**Status**: Draft

**Input**: User description: "Instrumente a medição de contexto: src/context/tokens.ts com estimateTokens (chars/4) e o usage real do LangChain; métricas do /chat com promptTokens real e contextBreakdown estimado por fontes; conversa-longa.sh imprime o promptTokens por turno. Com testes"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Estimar e ler uso de tokens de forma reutilizável (Priority: P1)

Como mantenedor do OpsPilot, quero um módulo único de medição de tokens que (a) estime tokens a partir do tamanho do texto e (b) extraia o uso real reportado pelo provedor/LLM no fluxo LangChain, para que chat, scripts e testes compartilhem a mesma regra.

**Why this priority**: Sem uma fonte canônica, estimativas locais e métricas do `/chat` divergem e a observabilidade de contexto fica inconsistente.

**Independent Test**: Chamar a estimativa com strings de tamanho conhecido e afirmar `floor(chars/4)`; alimentar um objeto de usage no formato LangChain e afirmar que prompt/completion (quando presentes) são lidos corretamente; ausência de usage retorna valor seguro/nulo sem lançar.

**Acceptance Scenarios**:

1. **Given** um texto com `N` caracteres, **When** a estimativa de tokens é aplicada, **Then** o resultado é `Math.floor(N / 4)` (regra fixa chars/4).
2. **Given** um resultado de invocação LangChain que inclui usage real de prompt, **When** a leitura de usage é aplicada, **Then** o contador de prompt tokens real é obtido desse usage (não da estimativa).
3. **Given** invocação sem usage disponível, **When** a leitura de usage é aplicada, **Then** o sistema indica ausência de valor real (ex.: `undefined`/`null`) sem falhar o turno.
4. **Given** texto vazio, **When** a estimativa é aplicada, **Then** o resultado é `0`.

---

### User Story 2 - Expor promptTokens real e breakdown estimado no `/chat` (Priority: P1)

Como operador ou autor de scripts de carga, quero que a resposta de sucesso do `POST /chat` inclua `metrics.promptTokens` com o uso real do prompt quando o provedor informar, e `metrics.contextBreakdown` com estimativa por fonte do contexto montado (memória, histórico, mensagem atual e demais partes relevantes), para eu entender o que está consumindo a janela.

**Why this priority**: É o contrato observável que permite comparar crescimento de contexto ao longo de uma conversa longa e validar o script de plantão.

**Independent Test**: Em teste HTTP com strategy stub que reporta usage real e composição com memória + histórico, afirmar presença de `promptTokens` (número do usage) e `contextBreakdown` com chaves por fonte e totais coerentes com a regra chars/4 sobre os textos daquelas fontes.

**Acceptance Scenarios**:

1. **Given** um turno de chat bem-sucedido em que o LLM reporta usage de prompt, **When** a resposta `200` é devolvida, **Then** `metrics.promptTokens` é o valor real de prompt tokens (inteiro ≥ 0).
2. **Given** o mesmo turno, **When** as métricas são inspecionadas, **Then** `metrics.contextBreakdown` lista estimativas por fonte do contexto composto (pelo menos: fatos de memória quando houver, mensagens de histórico na janela, mensagem atual do usuário) usando a regra chars/4.
3. **Given** um turno sem usage real disponível, **When** a resposta é devolvida, **Then** `promptTokens` fica ausente ou explicitamente nulo (comportamento documentado) e `contextBreakdown` estimado **ainda** é preenchido.
4. **Given** cliente legado que só lê `llmCalls`/`latencyMs`/`historyMessages`/`memoryFacts`/`learningQueued`, **When** novos campos aparecem, **Then** os campos existentes permanecem válidos (compatibilidade aditiva).
5. **Given** ausência de memória e histórico vazio, **When** o turno roda, **Then** o breakdown reflete zeros/omissão nas fontes vazias e estima ao menos a mensagem atual (e qualquer prefixo fixo de composição, se existir).

---

### User Story 3 - Script de conversa longa imprime promptTokens por turno (Priority: P2)

Como desenvolvedor, quero que `scripts/conversa-longa.sh` imprima, a cada turno, o `promptTokens` real vindo de `metrics`, para observar o crescimento do contexto em ~30 turnos no mesmo `conversationId`.

**Why this priority**: Fecha o loop de validação manual/demo sem depender de logs internos.

**Independent Test**: Com servidor mock ou fixture JSON contendo `metrics.promptTokens`, o script (ou trecho documentado de parsing) extrai e imprime o valor por turno; se o campo faltar, imprime marcador legível (`n/a` ou equivalente).

**Acceptance Scenarios**:

1. **Given** respostas `/chat` com `metrics.promptTokens` numérico, **When** o script processa o turno, **Then** a linha de saída contém esse valor rotulado (ex.: `promptTokens=<n>`).
2. **Given** resposta sem `metrics.promptTokens`, **When** o script processa o turno, **Then** a saída indica ausência (`n/a` ou equivalente) e o script não aborta só por isso.
3. **Given** o fluxo completo do script, **When** os turnos avançam no mesmo `conversationId`, **Then** cada turno continua imprimindo `promptTokens` independentemente das estimativas locais req/res (se mantidas).

---

### User Story 4 - Cobertura automatizada da medição (Priority: P1)

Como mantenedor, quero testes automatizados para estimativa, leitura de usage e métricas do `/chat`, para que regressões na instrumentação sejam detectadas por `npm run test` / `npm run typecheck`.

**Why this priority**: Constituição exige teste junto com lógica nova; medição errada engana demos e decisões de janela de contexto.

**Independent Test**: Suíte `node:test` cobre módulo de tokens e extensão das métricas HTTP; typecheck verde.

**Acceptance Scenarios**:

1. **Given** a suíte de testes do projeto, **When** `npm run test` roda, **Then** há casos passando para `estimateTokens` (incl. borda vazia e tamanho não múltiplo de 4) e para leitura de usage real.
2. **Given** testes do `POST /chat`, **When** executados com stub que injeta usage, **Then** afirmam `metrics.promptTokens` e formato/valores de `contextBreakdown`.
3. **Given** o código novo, **When** `npm run typecheck` roda, **Then** permanece verde.

## Edge Cases

- Texto com caracteres multibyte: a estimativa usa contagem de caracteres da string (comportamento JS/`length`), documentado; não exige tokenizer do modelo.
- Usage parcial (só completion, sem prompt): `promptTokens` real ausente/nulo; breakdown estimado permanece.
- Fontes com texto vazio: contribuição `0` naquela chave; não quebra serialização JSON.
- Estratégias (ReAct / Plan-and-Execute / reflection): o `promptTokens` real deve refletir o uso reportado no caminho da invocação LLM do turno (soma ou último prompt — ver Assumptions); breakdown descreve o **contexto de entrada composto** do `/chat`, não cada tool call intermediária.
- Script sem `jq` ou servidor fora: comportamento de falha existente do script permanece; esta feature não redefine bootstrap do ambiente.
- Valores de usage não numéricos / malformados: tratados como usage ausente, sem 5xx.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST expor uma função pura de estimativa de tokens com a regra fixa `floor(chars / 4)`.
- **FR-002**: O sistema MUST expor uma função (ou equivalente testável) que extrai o usage real de prompt tokens a partir do resultado/mensagens LangChain quando presente.
- **FR-003**: A resposta de sucesso do `POST /chat` MUST incluir `metrics.promptTokens` com o valor real de prompt tokens quando o usage estiver disponível.
- **FR-004**: A resposta de sucesso do `POST /chat` MUST incluir `metrics.contextBreakdown`: objeto com estimativas por fonte do contexto composto do turno, usando a mesma regra de estimativa (chars/4).
- **FR-005**: Fontes mínimas do breakdown MUST incluir, quando aplicável: memória (`memory`), histórico (`history`), mensagem atual (`message`); fontes vazias MUST aparecer como `0` ou ser omitidas de forma consistente e documentada no plano/contrato.
- **FR-006**: Campos de métricas já existentes (`llmCalls`, `latencyMs`, `historyMessages`, `memoryFacts`, `learningQueued`) MUST permanecer presentes e semanticamente inalterados.
- **FR-007**: Quando usage real estiver indisponível, o sistema MUST NOT inventar `promptTokens` a partir da estimativa no mesmo campo; estimativa permanece apenas no breakdown (e/ou campos explicitamente estimados).
- **FR-008**: O script `scripts/conversa-longa.sh` MUST imprimir o `promptTokens` de `metrics` em cada turno (ou `n/a` se ausente).
- **FR-009**: Testes automatizados MUST cobrir estimativa, leitura de usage e métricas do `/chat` com breakdown; `npm run test` e `npm run typecheck` MUST permanecer verdes.

### Key Entities

- **TokenEstimate**: Número inteiro ≥ 0 derivado de texto via chars/4.
- **PromptTokenUsage**: Contagem real de tokens de prompt reportada pelo provedor/LLM, quando disponível.
- **ContextBreakdown**: Mapa fonte → tokens estimados das partes do contexto composto enviado ao raciocínio no turno.
- **ChatMetrics**: Métricas do turno de chat, estendidas com `promptTokens` (real) e `contextBreakdown` (estimado).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em teste unitário, estimativa de uma string de 10 caracteres retorna `2`; string vazia retorna `0`.
- **SC-002**: Em teste com usage real de prompt = `N`, a resposta `/chat` expõe `metrics.promptTokens === N`.
- **SC-003**: Em teste com memória + histórico + mensagem conhecidos, a soma das partes do `contextBreakdown` coincide com a estimativa chars/4 aplicada a cada fonte isoladamente (tolerância zero para a regra floor).
- **SC-004**: Em teste sem usage, `promptTokens` não é preenchido com estimativa no campo real; breakdown estimado ainda está presente.
- **SC-005**: O script de conversa longa, ao processar uma resposta com `promptTokens`, exibe esse valor na saída do turno correspondente.
- **SC-006**: 100% dos novos comportamentos desta feature cobertos por teste automatizado passam em `npm run test`; typecheck verde.

## Assumptions

- O módulo canônico de tokens vive em `src/context/tokens.ts` (caminho pedido pelo usuário); detalhes de export e helpers ficam para `/speckit-plan`.
- “Usage real do LangChain” significa ler os metadados/usage já expostos pelas mensagens ou retorno das invocações usadas pelo projeto (OpenRouter via LangChain), sem introduzir um tokenizer oficial do modelo.
- `contextBreakdown` estima o **input composto** do `/chat` (memória + histórico formatado + mensagem), não o acumulado de todas as tool calls internas do agente; se o plano optar por incluir um prefixo de sistema/instruções da strategy, isso entra como fonte adicional nomeada.
- Para turnos com múltiplas chamadas LLM (reflection, tools), `promptTokens` real no `/chat` representa o total de prompt tokens reportados no turno quando agregável; se só o último usage estiver disponível no caminho atual, o plano documenta essa limitação e o valor ainda é “real”, nunca estimado no mesmo campo.
- Compatibilidade: extensão aditiva do JSON de métricas; não exige versão de API nova.
- Arena/bench/MCP não são obrigados a expor `contextBreakdown` nesta feature; o foco é `/chat` + módulo compartilhado + script.
- O script `conversa-longa.sh` já existente (ou equivalente no repositório) é o veículo de demo; pode manter estimativas locais req/res além do `promptTokens` real.
