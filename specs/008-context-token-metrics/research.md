# Research: Instrumentação de medição de contexto

## Decision: Módulo puro em `src/context/tokens.ts`

**Decision**: Exportar pelo menos:

- `estimateTokens(text: string): number` → `Math.floor(text.length / 4)`
- `promptTokensFromUsage(usage: unknown): number | undefined` — lê
  `input_tokens` numérico finito ≥ 0; caso contrário `undefined`
- `sumPromptTokensFromMessages(messages: readonly BaseMessage[]): number | undefined`
  — soma `usage_metadata` de mensagens AI; se nenhum usage válido, `undefined`
- `buildContextBreakdown(parts: { memory: string; history: string; message: string }): ContextBreakdown`
  — aplica `estimateTokens` a cada parte

**Rationale**: Spec exige fonte única; funções puras alinhadas à constituição;
testável sem LLM.

**Alternatives considered**: Tokenizer tiktoken/js-tiktoken — rejeitado (spec
fixa chars/4). Estimar só no script bash — rejeitado (diverge do `/chat`).

## Decision: Usage real = `AIMessage.usage_metadata.input_tokens`

**Decision**: Usar o campo LangChain `@langchain/core` `UsageMetadata.input_tokens`
presente em `AIMessage.usage_metadata` (OpenRouter/OpenAI via LangChain). Não
usar `response_metadata.tokenUsage` legado a menos que seja fallback documentado
só se `usage_metadata` ausente e um shape conhecido existir — **v1**: apenas
`usage_metadata.input_tokens`.

**Rationale**: Tipo oficial no core 1.2.x; OpenRouter via `@langchain/openai`
popula `usage_metadata` nas AI messages.

**Alternatives considered**: Tokenizer local como “real” — rejeitado (FR-007).
Só último AI message — rejeitado pela assumption de total agregável.

## Decision: `promptTokens` = soma de todos os `input_tokens` do turno

**Decision**: Em caminhos baseados em mensagens (ReAct via
`metricsFromMessages`), somar `input_tokens` de **todas** as AI messages do
turno. Em Plan-and-Execute / reflection, somar usage capturado nas invocações
do turno da mesma forma (acumular ao contar `llmCalls`). Se a soma for 0 porque
nenhum usage existiu, expor `undefined` (omitir campo), **não** `0` inventado —
exceto quando o provedor reportar explicitamente `input_tokens: 0`.

Regra prática: `sumPromptTokensFromMessages` retorna `undefined` se **zero**
mensagens tiveram usage válido; retorna a soma (pode ser 0) se pelo menos um
usage válido foi lido.

**Rationale**: Spec pede total agregável quando possível; valor permanece real.

**Alternatives considered**: Só última chamada — rejeitado (subestima tools/
reflection). Preencher com estimativa — rejeitado (FR-007).

## Decision: `contextBreakdown` só do input composto do `/chat`

**Decision**: Fontes fixas sempre presentes no JSON:

| Key | Texto estimado |
|---|---|
| `memory` | saída de `formatMemoryBlock(facts)` (string vazia → 0) |
| `history` | mensagens da janela formatadas `role: content` unidas por `\n` **sem** a mensagem atual |
| `message` | `user: ${currentMessage}` (mesma linha que `formatChatHistory` anexa) |

HTTP calcula após montar facts/history e **antes/depois** do `strategy.run`,
independente de usage. Strategies não precisam conhecer o breakdown.

Não incluir system prompts internos da strategy nem tool observations no
breakdown desta feature.

**Rationale**: SC-003 testável; espelha composição real
`memoryBlock + formatChatHistory(...)`.

**Alternatives considered**: Breakdown por tool call — fora de escopo. Omitir
chaves zeradas — rejeitado (contrato mais simples com chaves estáveis = 0).

## Decision: Campo opcional omitido (não `null`) quando sem usage

**Decision**: `metrics.promptTokens?: number` — se `undefined`, o JSON de
sucesso **omite** a chave. Script usa `.metrics.promptTokens // "n/a"`.
`contextBreakdown` é **sempre** objeto com as três chaves numéricas.

**Rationale**: Compatibilidade aditiva; distingue “provedor disse 0” de
“sem usage” sem `null` ambíguo em clientes fracos.

**Alternatives considered**: `null` explícito — aceitável pela spec, mas omitir
é suficiente e já previsto pelo script.

## Decision: Script `conversa-longa.sh` já alinhado; só garantir contrato

**Decision**: Manter impressão de `promptTokens` por turno; estimativa local
req/res continua com `chars/4` (floor) coerente com `estimateTokens`. Nenhuma
obrigação de parsear `contextBreakdown` no script nesta feature.

**Rationale**: FR-008 / SC-005 já cobertos pelo script existente após métricas
existirem no `/chat`.

**Alternatives considered**: Reescrever script em Node — overkill.

## Decision: Testes sem LLM real

**Decision**: Unitários constroem `AIMessage` com `usage_metadata` fake.
HTTP injeta strategy stub retornando `metrics.promptTokens` ou omitindo.
Não exigir OpenRouter no CI.

**Rationale**: Constituição + SC-006; padrão das features 002/007.
