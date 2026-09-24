# Research: Refletor de aprendizado

## Decision: Reflector separado da reflection crítica (002)

**Decision**: Implementar `LearningReflector` em `src/memory/learning-reflector.ts`,
invocado na composição HTTP **após** `strategy.run` bem-sucedido. Não alterar
`withReflection` / crítico de qualidade.

**Rationale**: Spec e edge cases exigem separação: 002 avalia a *resposta*; 007
destila *fatos do usuário* para memória. Misturar prompts e loops de crítica
aumentaria acoplamento e flakiness.

**Alternatives considered**: Rodar dentro de `withReflection` — rejeitado.
Rodar dentro de ReAct como passo oculto — rejeitado (atrasa e polui o trace).

## Decision: Fire-and-forget após montar o resultado (não await remember)

**Decision**: Após obter `result` do strategy (e append assistant), se há
`userId`, chamar `scheduleLearning(...)` que inicia uma Promise sem await no
caminho de `res.status(200).json(result)`. Opcionalmente o reflector LLM pode
correr dentro dessa Promise (junto com `remember`), de modo que **nenhum**
trabalho de aprendizado atrase o JSON de resposta.

Ordem recomendada no handler:

1. `result = await runChat(...)` (sem aprendizado bloqueante)
2. `response.status(200).json(result)`
3. `scheduleLearning(...)` // void; inclui reflect + remember

Alternativa aceitável: agendar no fim de `runChat` sem await, desde que testes
provem que o retorno de `runChat` não espera `remember` (SC-004). Preferir
agendar **depois** do `json()` no handler para alinhar literalmente a
“após cada resposta”.

**Rationale**: SC-004 e FR-003; falhas pós-resposta não devem mudar status HTTP
(FR-008).

**Alternatives considered**: `await remember` antes do 200 — rejeitado (bloqueia).
Queue externa — overkill para v1.

## Decision: Contexto de `userId` via getter (não no schema da tool)

**Decision**: `createTools(ops, { memories, getUserId })` onde `getUserId(): string | undefined`
lê um contexto de request (AsyncLocalStorage ou ref mutável setada por
`createApp`/`runChat` no início do turno). `forget_preference` **não** aceita
`userId` no input Zod.

**Rationale**: Evita que o modelo “escolha” outro usuário (spoofing). Alinha à
assumption da spec.

**Alternatives considered**: `userId` no schema da tool — rejeitado (inseguro /
frágil). Recriar registry por request — rejeitado (custo e ripple em arena/bench).

## Decision: Matching de forget via recall top-1 com min 0.3

**Decision**: `forget_preference({ preference })` →
`hits = await memories.recall(userId, preference)` → se `hits[0]` existe
(já filtrado ≥ 0.3 pelo store), `forget(hits[0].id)` e retornar texto
confirmando o `fact` removido; senão retornar “No matching preference found”.

**Rationale**: Reutiliza ranking 006; sem API nova no store; testável com fake.

**Alternatives considered**: Match por substring exata — rejeitado (pior UX
semântica). `forget` por id exposto ao modelo — rejeitado (ids opacos).

## Decision: Stub injetável de LearningReflector nos testes

**Decision**: Tipo
`LearningReflector = (userMessage: string) => Promise<LearningVerdict>`.
Default: LangChain `model.withStructuredOutput(learningVerdictSchema)`.
Testes injetam stub determinístico por fixture (preferência / pontual /
segredo).

**Rationale**: SC-007; espelha o padrão do crítico em 002.

**Alternatives considered**: Sempre LLM real — rejeitado (CI lento/flaky).
Heurística regex sem LLM — rejeitado (fora do pedido `withStructuredOutput`).

## Decision: Observabilidade mínima

**Decision**: Em falha de reflector/`remember` async: `console.error` com
código estável (ex. `[learning-reflector]`). Métrica aditiva opcional
`learningQueued: boolean` no JSON (true se `userId` presente e schedule
disparado). Não adicionar campo obrigatório que quebre clientes se preferir
só log — **preferir** `learningQueued` por simetria com `memoryFacts`.

**Rationale**: FR-008 “não silencioso”; campo aditivo é reversível.

**Alternatives considered**: Só métrica sem log — insuficiente para debug.
OpenTelemetry — fora de escopo v1.

## Decision: Extensão de createTools / registry

**Decision**: Estender `createTools` e `createAgentRegistry` com opções
opcionais `{ memories?: MemoryStore; getUserId?: () => string | undefined }`.
Se `memories` ausente, `forget_preference` responde que memória não está
configurada (ou a tool é omitida). Produção (`index.ts`) sempre passa
`SqliteMemoryStore` + getter do contexto HTTP.

**Rationale**: Arena/bench/MCP podem continuar sem memória; HTTP ganha o ciclo
completo.

**Alternatives considered**: Tool sempre no-op sem memories — aceitável; omitir
a tool quando sem store é mais limpo para o modelo.
