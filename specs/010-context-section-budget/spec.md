# Feature Specification: ContextBuilder com orçamento por seção

**Feature Branch**: `010-context-section-budget`

**Created**: 2026-10-01

**Status**: Draft

**Input**: User description: "ContextBuilder com orçamento por seção: src/context/context-builder.ts monta o prompt de TODAS as estratégias com teto por seção via env CONTEXT_BUDGET_*: system e mensagens intocáveis, resumo 200, janela 1200 (corta as mais antigas), memórias 300 (corta o menor score). Teste: tetos baixos cortam na ordem certa"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Montar o prompt de contexto com tetos por seção (Priority: P1)

Como mantenedor do OpsPilot, quero um construtor único de contexto que monte o prompt enviado a **todas** as estratégias (ReAct, Plan-and-Execute, reflection e stubs de teste), aplicando um teto configurável por seção (resumo, janela de histórico, memórias), para que a composição deixe de ser ad-hoc no caminho HTTP e respeite um orçamento previsível.

**Why this priority**: Sem um construtor canônico com tetos, o prompt cresce sem controle e cada estratégia pode receber contexto inconsistente.

**Independent Test**: Chamar o construtor com resumo, histórico, memórias, system e mensagem atuais conhecidos; afirmar que o texto composto inclui as seções na ordem esperada e que, com orçamentos padrão, seções abaixo do teto passam intactas.

**Acceptance Scenarios**:

1. **Given** seções de resumo, histórico, memórias, system e mensagem atual abaixo dos tetos, **When** o construtor monta o prompt, **Then** todas as seções presentes entram no resultado e system + mensagem atual permanecem intactos.
2. **Given** qualquer estratégia usada pelo `/chat` (ou stub equivalente), **When** um turno é processado, **Then** o input recebido pela strategy é o resultado do mesmo construtor (não uma concatenação paralela no handler).
3. **Given** ausência de resumo e/ou memórias, **When** o construtor monta o prompt, **Then** seções vazias são omitidas (não poluem o prompt) e o restante é composto normalmente.

---

### User Story 2 - Respeitar orçamentos configuráveis e regras de corte (Priority: P1)

Como operador, quero definir tetos por seção via configuração de ambiente (`CONTEXT_BUDGET_*`), com defaults **resumo = 200**, **janela = 1200**, **memórias = 300** (unidade: tokens estimados), e quero que o corte siga regras explícitas: janela remove as mensagens **mais antigas**; memórias removem os fatos de **menor score**; system e mensagem(ns) atuais **nunca** são truncados.

**Why this priority**: As regras de corte e os defaults são o valor central da feature; sem elas o orçamento não é testável nem operacional.

**Independent Test**: Com tetos artificiais baixos e entradas dimensionadas, afirmar: (a) histórico perde as mais antigas primeiro até caber; (b) memórias perdem as de menor score primeiro até caber; (c) resumo é reduzido até caber no teto; (d) system e mensagem atual permanecem byte-a-byte iguais.

**Acceptance Scenarios**:

1. **Given** histórico cuja estimativa de tokens excede o teto da janela, **When** o construtor aplica o orçamento, **Then** remove mensagens começando pelas mais antigas até a estimativa da seção ficar ≤ teto (ou até sobrar o mínimo viável documentado nas Assumptions).
2. **Given** memórias com scores distintos cuja estimativa excede o teto de memórias, **When** o orçamento é aplicado, **Then** remove fatos em ordem crescente de score (menor score sai primeiro) até caber.
3. **Given** resumo cuja estimativa excede o teto de resumo, **When** o orçamento é aplicado, **Then** o texto do resumo é reduzido para caber no teto (sem afetar system/mensagem).
4. **Given** system e mensagem atual presentes, **When** qualquer combinação de tetos (inclusive zero nas outras seções), **Then** system e mensagem atual permanecem intactos no prompt composto.
5. **Given** variáveis `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_WINDOW` e `CONTEXT_BUDGET_MEMORIES` definidas, **When** o construtor lê a configuração, **Then** usa esses valores; na ausência delas, usa 200 / 1200 / 300 respectivamente.

---

### User Story 3 - Testes com tetos baixos validam a ordem de corte (Priority: P1)

Como mantenedor, quero testes automatizados que, com tetos deliberadamente baixos, comprovem que o corte ocorre na **ordem certa** (antigas primeiro na janela; menor score primeiro nas memórias; system/mensagem intocáveis), para que regressões sejam detectadas por `npm run test` / `npm run typecheck`.

**Why this priority**: A constituição exige teste junto com lógica nova; a ordem de corte é o comportamento fácil de quebrar em refactors.

**Independent Test**: Suíte `node:test` exclusiva do construtor com fixtures determinísticas (mensagens datadas/ordenadas e fatos com scores), sem LLM real.

**Acceptance Scenarios**:

1. **Given** três mensagens de histórico A (antiga), B, C (recente) e teto de janela que só comporta C (ou B+C), **When** o orçamento da janela é aplicado, **Then** A é a primeira a sair; C permanece.
2. **Given** fatos com scores 0.9, 0.5 e 0.1 e teto de memórias que só comporta o de maior score, **When** o orçamento de memórias é aplicado, **Then** o fato de score 0.1 sai antes do de 0.5; o de 0.9 permanece.
3. **Given** system e mensagem atuais não vazios e tetos 0 (ou mínimos) para resumo/janela/memórias, **When** o construtor monta o prompt, **Then** system e mensagem atuais ainda aparecem intactos.
4. **Given** o código novo, **When** `npm run test` e `npm run typecheck` rodam, **Then** permanecem verdes.

## Edge Cases

- Seção já vazia: orçamento não altera o resultado; seção continua omitida.
- Empate de score entre memórias: desempate determinístico documentado (ex.: ordem estável de entrada / id); não aleatório.
- Mensagem única de histórico que sozinha excede o teto da janela: documentar comportamento — preferência: manter a mensagem mais recente intacta mesmo acima do teto **ou** truncar conteúdo da mensagem; default razoável: **manter a mais recente intacta** (espelha “mensagens intocáveis” no espírito da mensagem atual; ver Assumptions).
- Resumo exatamente no limite do teto: permanece intacto.
- Valores de env inválidos (não numéricos, negativos, vazios): fallback para o default da seção; sem crash.
- Estimativa de tokens alinhada à regra chars/4 já usada no projeto (feature 008).
- Breakdown de métricas (feature 008): após o corte, as estimativas devem refletir o texto **já orçado** enviado à strategy (não o bruto pré-corte), quando o caminho `/chat` for atualizado para usar o construtor.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST expor um construtor de contexto canônico que monte o prompt composto a partir das seções: system, resumo, memórias, janela de histórico e mensagem(ns) atual(is).
- **FR-002**: Todas as estratégias usadas pelo fluxo de chat MUST receber o prompt produzido por esse construtor (fonte única de composição).
- **FR-003**: O construtor MUST aplicar tetos por seção configuráveis via `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_WINDOW` e `CONTEXT_BUDGET_MEMORIES`, com defaults 200, 1200 e 300 (tokens estimados).
- **FR-004**: As seções system e mensagem(ns) atual(is) MUST ser intocáveis — nunca truncadas nem removidas pelo orçamento.
- **FR-005**: Quando a janela de histórico exceder o teto, o construtor MUST remover mensagens começando pelas mais antigas até caber.
- **FR-006**: Quando as memórias excederem o teto, o construtor MUST remover fatos começando pelos de menor score até caber.
- **FR-007**: Quando o resumo exceder o teto, o construtor MUST reduzir o texto do resumo até a estimativa ficar ≤ teto.
- **FR-008**: Seções vazias MUST ser omitidas do prompt composto.
- **FR-009**: Testes automatizados MUST cobrir tetos baixos e a ordem correta de corte (janela: antigas primeiro; memórias: menor score primeiro; system/mensagem intactos); `npm run test` e `npm run typecheck` MUST permanecer verdes.

### Key Entities

- **ContextSection**: Parte nomeada do prompt (system, summary, memories, window/history, current message) com texto e contribuição estimada em tokens.
- **SectionBudget**: Teto numérico por seção orçável (summary, window, memories), lido da configuração com defaults.
- **ContextBuildResult**: Prompt composto final + (opcional) visão das seções após o corte, útil para métricas/breakdown.
- **MemoryFact (entrada)**: Fato de memória com texto e score usado na ordem de remoção.
- **HistoryMessage (entrada)**: Mensagem ordenada no tempo; as mais antigas são candidatas preferenciais a remoção na janela.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em teste com três mensagens ordenadas e teto que comporta só a mais recente, exatamente as mais antigas são removidas e a mais recente permanece.
- **SC-002**: Em teste com três fatos de scores distintos e teto que comporta só o de maior score, os de menor score saem primeiro e o de maior score permanece.
- **SC-003**: Em teste com tetos zero/mínimos nas seções orçáveis, system e mensagem atual permanecem caracteres idênticos aos de entrada.
- **SC-004**: Com defaults (200 / 1200 / 300) e entradas abaixo dos tetos, o prompt composto contém integralmente resumo, janela e memórias fornecidos.
- **SC-005**: Alterar `CONTEXT_BUDGET_*` muda o resultado do corte de forma observável no teste (mesmo input, tetos diferentes → seções finais diferentes).
- **SC-006**: 100% dos novos comportamentos desta feature cobertos por teste automatizado passam em `npm run test`; typecheck verde.

## Assumptions

- O módulo canônico vive em `src/context/context-builder.ts` (caminho pedido); detalhes de API pública ficam para `/speckit-plan`.
- “Tokens” do orçamento usam a estimativa `floor(chars / 4)` já padronizada em `src/context/tokens.ts` (feature 008) — sem tokenizer oficial do modelo.
- “Mensagens intocáveis” significa a mensagem atual do usuário do turno (e qualquer prefixo system/instruções fixas passadas ao construtor); a janela de histórico **é** orçável e pode perder mensagens antigas.
- Se uma única mensagem da janela exceder sozinha o teto, o default é **manter a mensagem mais recente intacta** mesmo acima do teto (não truncar o miolo da mensagem), para preservar coerência do turno imediato.
- Empate de score: ordem estável — ao remover, entre scores iguais, remove o que aparecer primeiro na lista de entrada (FIFO na remoção).
- Redução do resumo: truncar o texto do resumo (pelo final) até a estimativa ≤ teto; se o teto for 0, omitir o bloco de resumo.
- O construtor é função pura (ou pureza com config injetada) sempre que possível, alinhado à constituição; leitura de env pode ocorrer na composição da aplicação e ser injetada como `SectionBudget`.
- Integração no `/chat` substitui a concatenação atual (`summaryText + memoryText + composeStrategyInput`); arena/bench/MCP só precisam do construtor se já montam o mesmo tipo de prompt — fora do escopo mínimo se não compartilham esse caminho.
- Features 008 (métricas) e 009 (resumo) permanecem; esta feature orça o que já entra no contexto após recall/resumo, não redefine a janela raw de 8 mensagens nem o lote de summarize.
