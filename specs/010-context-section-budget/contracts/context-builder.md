# Contract: `src/context/context-builder`

## Types

```ts
type SectionBudget = {
  summary: number;
  window: number;
  memories: number;
};

type ContextBuildInput = {
  system?: string;
  summary?: string;
  memories?: readonly RecalledMemory[];
  history?: readonly ConversationMessage[];
  message: string;
};

type ContextBuildResult = {
  prompt: string;
  sections: {
    system: string;
    summary: string;
    memory: string;
    history: string;
    message: string;
  };
  keptHistory: ConversationMessage[];
  keptMemories: RecalledMemory[];
};
```

## `DEFAULT_SECTION_BUDGET`

```ts
{ summary: 200, window: 1200, memories: 300 }
```

## `loadSectionBudgets`

```ts
loadSectionBudgets(env?: NodeJS.ProcessEnv): SectionBudget
```

- Lê `CONTEXT_BUDGET_SUMMARY`, `CONTEXT_BUDGET_WINDOW`, `CONTEXT_BUDGET_MEMORIES`.
- Ausente / não numérico / não finito / `< 0` → default da seção.
- Não lança; não lê arquivos `.env`.

## `buildContext`

```ts
buildContext(input: ContextBuildInput, budget?: SectionBudget): ContextBuildResult
```

- `budget` default = `DEFAULT_SECTION_BUDGET`.
- Puro (sem IO / sem `process.env`).
- Tokens: `estimateTokens` (chars/4) sobre o texto **formatado** da seção.

### Regras de corte

| Seção | Regra |
|-------|--------|
| `system` | Intocável; omitir se vazio |
| `message` | Intocável; sempre `user: ${message}` no compose |
| `summary` | Truncar raw pelo final até format ≤ `budget.summary`; 0 → omitir |
| `window` | Remover oldest enquanto format > `budget.window` e length > 1; última mensagem intacta mesmo se > teto |
| `memories` | Remover menor `score` (empate: menor índice) enquanto format > `budget.memories` |

### Ordem do `prompt`

`system` + `summary` + `memory` + `history` + `message` (só partes não vazias; sem `\n` extras entre blocos além do que os formatters já emitem).

## Test obligations

| Case | Expect |
|------|--------|
| Inputs abaixo dos defaults | prompt contém summary/memory/history/message integrais; system se fornecido |
| 3 msgs A,B,C; window cabe só C | `keptHistory` = [C]; A sai primeiro |
| 3 facts scores 0.9/0.5/0.1; memories cabe só 0.9 | kept = [0.9]; 0.1 sai antes de 0.5 |
| budgets 0 nas orçáveis + system + message | prompt contém system e message intactos; sem summary/memory/history |
| summary over budget | texto raw truncado; `estimateTokens(sections.summary) ≤ budget.summary` |
| empate score | remove o de menor índice primeiro |
| `loadSectionBudgets({})` | `{200,1200,300}` |
| `loadSectionBudgets` com `"abc"` / `"-1"` | fallback default |
| budgets diferentes, mesmo input | `kept*` / sections diferem (SC-005) |
