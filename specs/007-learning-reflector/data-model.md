# Data Model: Refletor de aprendizado

## LearningVerdict

Resultado estruturado do reflector (Zod + `withStructuredOutput`).

| Field | Type | Rules |
|---|---|---|
| `hasLearning` | boolean | `true` somente se houver fato durável |
| `fact` | string | Se `hasLearning`: trim, min 1, forma estável (preferência/restrição). Se `false`: pode ser `""` |

**Refine**: `!hasLearning || fact.trim().length >= 1`.

## DurableFact

Conceito: texto adequado a `MemoryStore.remember` — preferências e restrições
estáveis do usuário. **Não** é entidade de tabela nova; persiste como `Memory`
(006).

## LearningReflector

```ts
type LearningReflector = (userMessage: string) => Promise<LearningVerdict>;
```

Default: LLM com system prompt de critérios + schema Zod.
Test double: função pura/async por fixture.

## scheduleLearning input

| Field | Type | Rules |
|---|---|---|
| `userId` | string | Required para agendar |
| `userMessage` | string | Última mensagem do usuário do turno |
| `memories` | MemoryStore | Boundary 006 |
| `reflect` | LearningReflector | Injetável |
| `onError?` | `(err: unknown) => void` | Default: log |

Comportamento:

1. Se `userMessage` vazio → no-op.
2. `verdict = await reflect(userMessage)`.
3. Se `!verdict.hasLearning` ou `fact` inválido → no-op.
4. `await memories.remember(userId, fact.trim())`.
5. Erros → `onError` / log; nunca propagam ao HTTP já respondido.

## forget_preference (tool I/O)

### Input

| Field | Type | Rules |
|---|---|---|
| `preference` | string | trim, min 1 — descrição da preferência a remover |

### Context (não no schema)

| Field | Source |
|---|---|
| `userId` | `getUserId()` do request context |
| `memories` | injeção em `createTools` |

### Output (string legível)

- Sucesso: confirma fato removido (inclui texto do `fact`).
- Sem match: “No matching preference found.”
- Sem `userId`: “userId is required to forget preferences.”
- Sem `memories`: “Memory store is not configured.”

## Metrics (extensão aditiva)

| Field | Type | Rules |
|---|---|---|
| `learningQueued` | boolean | `true` se o turno tinha `userId` e o schedule foi disparado após a resposta |

(Campos 006/005 permanecem: `historyMessages`, `memoryFacts`, etc.)

## Relationships

- `POST /chat` + `userId` → recall (006) → strategy → resposta → **scheduleLearning**.
- Agent tools → `forget_preference` → `recall` + `forget` no mesmo `MemoryStore`.
- Reflection 002 permanece ortogonal (qualidade da resposta).

## State / lifecycle (turno com userId)

1. Validar body (`userId?`).
2. Set request `userId` context.
3. Recall + compose + run + append.
4. Responder 200 (+ `learningQueued` se aplicável).
5. Async: reflect → maybe remember.
6. Clear/end request context.
