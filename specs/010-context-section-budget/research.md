# Research: ContextBuilder com orçamento por seção

## 1. Onde vive a composição hoje

**Decision**: Substituir a concatenação em `runChatTurn`
(`summaryText + memoryText + composeStrategyInput`) por `buildContext(...)`.

**Rationale**: Spec exige fonte única para todas as strategies; o HTTP já é o
único caminho que monta esse prompt composto.

**Alternatives considered**:
- Cortar só no `formatHistoryOnly` / `formatMemoryBlock` — espalha regra de
  orçamento e não cobre resumo/system de forma uniforme.
- Orçamento global único — rejeitado; pedido é teto **por seção**.

## 2. Unidade de token e medição

**Decision**: Usar `estimateTokens` = `floor(chars / 4)` (feature 008) para
todos os tetos e para o `contextBreakdown` pós-corte.

**Rationale**: Já é a regra canônica do projeto; testes determinísticos sem
tokenizer.

**Alternatives considered**: Tokenizer do modelo / tiktoken — fora de escopo e
não reprodutível no CI sem deps extras.

## 3. API do builder (pureza vs env)

**Decision**:
- `buildContext(input, budget): ContextBuildResult` — **puro**.
- `loadSectionBudgets(env?: NodeJS.ProcessEnv): SectionBudget` — lê
  `CONTEXT_BUDGET_SUMMARY|WINDOW|MEMORIES`; inválido/ausente → 200 / 1200 / 300.
- App HTTP chama `loadSectionBudgets(process.env)` uma vez na composição (ou
  por request) e injeta o budget; testes passam budgets literais.

**Rationale**: Constituição (funções puras); testes não dependem do env do CI.

**Alternatives considered**: Ler `process.env` dentro de `buildContext` —
acopla e dificulta SC-005.

## 4. Ordem das seções no prompt

**Decision**: `system` + `summary` + `memories` + `window` + `message`
(seções vazias omitidas). System opcional (string vazia = omitir). Hoje o
`/chat` não injeta system; o campo existe para strategies/futuro e para o
requisito “system intocável”.

**Rationale**: Mantém o prefixo atual (summary → memory → history+message) e
adiciona system no início sem quebrar expectativas dos testes de conteúdo.

**Alternatives considered**: System no final — pior para instruções; message
antes do history — quebraria o formato atual `role: content` + `user: …`.

## 5. Algoritmo de corte — janela

**Decision**:
1. Partir da lista de mensagens já limitada a `HISTORY_WINDOW` (8),
   oldest→newest.
2. Enquanto `estimateTokens(formatHistoryOnly(kept)) > budget.window` **e**
   `kept.length > 1`, remover o primeiro (mais antigo).
3. Se sobrar 1 mensagem e ainda `> budget.window`, **manter intacta**.

**Rationale**: Spec: corta mais antigas; mensagem única acima do teto permanece.

**Alternatives considered**: Truncar conteúdo da mensagem — rejeitado pela
assumption da spec.

## 6. Algoritmo de corte — memórias

**Decision**:
1. Receber `RecalledMemory[]` (já top-k do store).
2. Enquanto `estimateTokens(formatMemoryBlock(kept)) > budget.memories` **e**
   `kept.length > 0`, remover o fato de **menor score**; empate → remove o de
   **menor índice** na lista atual (FIFO na remoção entre iguais).
3. Se `budget.memories === 0`, resultado = nenhum fato (bloco omitido).

**Rationale**: Spec SC-002; format incluir cabeçalho/bullets no orçamento evita
passar do teto após formatar.

**Alternatives considered**: Cortar só pelo texto do `fact` sem header —
subestimaria tokens reais no prompt.

## 7. Algoritmo de corte — resumo

**Decision**: Truncar o **texto bruto** do resumo (não o wrapper) pelo **final**
até `estimateTokens(formatSummaryBlock(trimmed)) ≤ budget.summary`, ou até
string vazia. `budget.summary === 0` → omitir bloco.

Implementação prática: `maxRawChars` via busca binária/linear no comprimento
do raw, ou loop `while (estimate > budget) slice(0, -1)` em testes com strings
curtas; para produção, `slice(0, budget.summary * 4)` é limite superior seguro
(`floor((4N)/4) = N`), refinando se o wrapper do format estourar.

**Rationale**: Assumption da spec; wrapper `[Conversation summary]\n…\n\n`
conta no teto.

**Alternatives considered**: Truncar o bloco já formatado — pode corromper o
marcador; preferir truncar o corpo e re-formatar.

## 8. Integração com métricas (008)

**Decision**: Após `buildContext`, alimentar `buildContextBreakdown` com as
strings **pós-corte** (`sections.summary`, `sections.memory`,
`sections.history`, `sections.message`). System, se presente, não precisa de
chave nova no breakdown nesta feature (fora do mapa atual); se for incluído no
prompt, o plano **não** exige estender `ContextBreakdown` — escopo mínimo.

**Rationale**: Spec edge case: breakdown reflete o enviado à strategy.

**Alternatives considered**: Nova chave `system` no breakdown — útil, mas
aditivo opcional; deixar para tasks se os testes HTTP exigirem.

## 9. Escopo arena / bench / MCP

**Decision**: Fora do escopo mínimo. Só `/chat` (`runChatTurn`) é obrigatório.

**Rationale**: Spec Assumptions; strategies já recebem a string composta pelo
HTTP.

## 10. Configuração documentada

**Decision**: Documentar em `.env.example`:

```text
CONTEXT_BUDGET_SUMMARY=200
CONTEXT_BUDGET_WINDOW=1200
CONTEXT_BUDGET_MEMORIES=300
```

**Rationale**: Operador descobre os knobs; código de produção lê env na borda;
testes injetam.

---

*Todos os pontos de NEEDS CLARIFICATION do Technical Context foram resolvidos.*
