# Research: Memória semântica

## Decision: Pacote `@huggingface/transformers` + modelo Xenova

**Decision**: Adicionar `@huggingface/transformers` e usar o pipeline
`feature-extraction` com `Xenova/all-MiniLM-L6-v2`, opções
`{ pooling: "mean", normalize: true }`. Expor `embed(text): Promise<Float32Array>`
via lazy singleton em `src/memory/embeddings.ts` (uma Promise de pipeline
compartilhada; chamadas concorrentes aguardam a mesma inicialização).

**Rationale**: Spec FR-006 exige esse stack e pooling/normalize; Xenova é o
caminho ONNX padrão no Transformers.js para o MiniLM sem runtime Python.
Normalize true permite tratar produto escalar como similaridade de cosseno.

**Alternatives considered**: `@xenova/transformers` (nome legado) foi rejeitado
em favor do pacote atual pedido. Embeddings remotos (OpenAI/OpenRouter) foram
rejeitados — a spec exige modelo local e BLOB. Carregar o pipeline a cada
chamada foi rejeitado por custo e instabilidade de testes.

## Decision: Ranking e dedup in-process sobre memórias do userId

**Decision**: Em `remember`/`recall`, carregar embeddings do `userId` via SELECT
parametrizado, desserializar BLOBs para `Float32Array`, calcular produto
escalar em TypeScript puro (`memory-ranking.ts`). Sem extensão vetorial SQLite
na v1.

**Rationale**: Escala local (poucos fatos por operador); evita dependência de
extensões nativas; ranking top-3 e dedup > 0.92 ficam testáveis como funções
puras com vetores fixture.

**Alternatives considered**: sqlite-vss / sqlite-vec foi rejeitado como escopo
extra. Índice ANN externo foi rejeitado pela mesma razão.

## Decision: Serialização BLOB = bytes de Float32 little-endian

**Decision**: Persistir `embedding` como `Buffer`/`Uint8Array` com
`byteLength === dim * 4` (dim 384 para MiniLM-L6). Helper
`vectorToBlob` / `blobToVector` no store ou módulo vizinho.

**Rationale**: Formato simples, portátil, sem JSON de floats (precisão e
tamanho). Prepared statements aceitam BLOB nativamente em `node:sqlite`.

**Alternatives considered**: JSON array de numbers — rejeitado (maior, menos
preciso). Float64 — rejeitado (desnecessário; modelo é float32).

## Decision: Boundary em `src/memory/` (não em `src/store/`)

**Decision**: Interface + SQLite (+ fake) sob `src/memory/`, conforme FR-007.
`SqliteMemoryStore` abre `DatabaseSync` no mesmo path `OPSPILOT_DB` que os
outros stores (conexão própria na v1, como conversation store).

**Rationale**: Spec fixa os paths; domínio de memória semântica é distinto de
ops/conversa; injecção explícita na composição (`index.ts` / `createApp`).

**Alternatives considered**: Colocar em `src/store/` ao lado de conversation —
rejeitado por contradizer FR-007. Estender `OpsStore` — rejeitado por misturar
domínios.

## Decision: Assinaturas remember / recall / forget

**Decision**:

- `remember(userId: string, fact: string): Promise<RememberResult>` onde
  `RememberResult = { id: string; created: boolean }` — `created: false` quando
  dedup > 0.92 (devolve id da memória existente mais similar).
- `recall(userId: string, query: string): Promise<RecalledMemory[]>` —
  no máx. 3 itens `{ id, fact, score }` com `score >= 0.3`, ordenados por score
  desc.
- `forget(id: string): void` — DELETE por `id`; id inexistente = no-op
  (idempotente).
- `close(): void` — encerra `DatabaseSync` (no-op no fake).

`remember`/`recall` são async porque `embed` é async; o SQLite permanece sync
por baixo.

**Rationale**: Spec deixa forget por id; no-op evita erro de domínio ruidoso em
clientes idempotentes. `created` torna o dedup observável nos testes (SC-002).

**Alternatives considered**: `forget(userId, id)` — desnecessário se `id` é
globalmente único (PK). Throw em forget missing — rejeitado em favor de
idempotência. Remember sync com embed pré-computado — rejeitado; o store deve
possuir o pipeline via injeção de `embed` para testabilidade.

## Decision: Injetar função `embed` no store (testabilidade)

**Decision**: `SqliteMemoryStore` recebe `embed: (text: string) => Promise<Float32Array>`
(default = singleton de `embeddings.ts`). Testes de ranking/dedup podem injetar
stubs; o teste semântico obrigatório usa o embed real.

**Rationale**: Permite contrato rápido sem carregar ONNX em todos os casos, e
ainda prova o caminho real no cenário sem palavras em comum.

**Alternatives considered**: Import estático único sem DI — rejeitado (testes
lentos/frágeis). Fake store só com scores manuais para o teste semântico —
rejeitado pela SC-001 (precisa do modelo real).

## Decision: Composição de prompt = memória + histórico + mensagem

**Decision**: Na borda HTTP, se `userId` presente: `facts = await memories.recall(userId, message)`.
Compor string: bloco opcional de memória semântica + histórico formatado
existente (`formatChatHistory`) + mensagem atual. Strategies continuam
recebendo um único `string`.

Ordem sugerida:

```text
[Relevant memories]
- fact1
- fact2

user: ...
assistant: ...
user: <current>
```

(Se não houver fatos, omitir o bloco inteiro.)

**Rationale**: Mesmo padrão da feature 005; zero ripple em ReAct/Plan-and-Execute.
Memória de longo prazo precede o histórico de curto prazo para contexto
estável.

**Alternatives considered**: Alterar `ReasoningInput` estruturado — rejeitado
(ripple). Injetar só via system prompt LangChain interno — rejeitado (strategies
divergiriam).

## Decision: `userId` opcional + métrica `memoryFacts`

**Decision**: Zod: `userId: z.string().trim().min(1).optional()`. Omitido → sem
recall. Presente → recall e merge `metrics.memoryFacts = facts.length` (0–3).

**Rationale**: Spec FR-008/FR-009 e simetria com `historyMessages`; facilita
SC-004 sem inspecionar o prompt (embora o stub HTTP ainda possa afirmar o
texto composto).

**Alternatives considered**: `userId` obrigatório — rejeitado (quebra clientes
atuais). Sem métrica — aceitável mas pior observabilidade; preferimos aditivo.

## Decision: FakeMemoryStore para HTTP; semântico com modelo real

**Decision**: `FakeMemoryStore` guarda fatos + vetores stub ou fatos pré-ranked
por substring/score injetado para testes HTTP rápidos. O teste SC-001 vive em
`memory-store.test.ts` (ou arquivo dedicado) com `SqliteMemoryStore(":memory:")`
+ embed real (timeout maior permitido).

**Rationale**: Spec assume fake opcional; HTTP não deve baixar ONNX. O critério
semântico exige o modelo.

**Alternatives considered**: Só `:memory:` em todos os testes HTTP — rejeitado
(flaky/lento no CI). Mockar recall na composição via interface mínima — o fake
já cobre isso.
