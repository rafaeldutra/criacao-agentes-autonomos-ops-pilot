# Memória semântica: Quickstart

## Prerequisites

- Node.js 22 LTS com `node:sqlite`.
- Dependências instaladas em `ops-pilot/` (inclui `@huggingface/transformers`
  após a implementação).
- Primeira execução do teste semântico pode baixar pesos ONNX para cache
  local do Transformers.js (rede só nesse bootstrap).
- Sem OpenRouter/LLM para testes de store e composição HTTP com stub.

## Validação determinística

Na raiz do projeto:

```powershell
npm run typecheck
npm test
```

A suíte deve cobrir:

1. `SqliteMemoryStore(":memory:")` cria `memories` idempotentemente
   ([data-model.md](./data-model.md)).
2. Contrato remember → recall → forget
   ([contracts/memory-store.md](./contracts/memory-store.md)).
3. Dedup: segundo `remember` com similaridade > 0.92 → `created: false` e
   contagem estável.
4. Recall: no máx. 3 itens, todos com `score >= 0.3`; vazio quando abaixo do
   limiar.
5. **Semântico obrigatório**: fato
   `"O usuário prefere café sem açúcar"` recuperado por
   `"How does he like his coffee?"` no top-3 com score ≥ 0.3.
6. Isolamento por `userId`.
7. `POST /chat` com `userId` e store pré-carregado injeta fatos no input da
   strategy (stub) e reporta `metrics.memoryFacts`
   ([contracts/chat-http.md](./contracts/chat-http.md)).
8. `POST /chat` sem `userId` → `memoryFacts === 0`; contratos 005
   (conversationId / historyMessages) permanecem verdes.
9. Casos existentes de `/chat` (400, 404, 422, 504, reflect) permanecem verdes.

## Smoke HTTP local (opcional)

Com modelo em cache e credenciais OpenRouter no ambiente do processo:

```powershell
npm run dev
```

Pré-popular memórias via script/teste ou chamada direta ao store em um REPL;
depois:

```powershell
curl -s -X POST http://127.0.0.1:3000/chat -H "content-type: application/json" -d "{\"message\":\"How does he like his coffee?\",\"userId\":\"demo-user\"}"
```

Esperado: `memoryFacts >= 1` se o fato de café foi lembrado antes para
`demo-user`; a resposta do modelo pode referenciar a preferência.

## Security checks

- Nenhum SQL montado por concatenação de `user_id`, `fact` ou `id`.
- Prepared statements em todo DML/SELECT do memory store.
- Runtime `data/*.db` e caches locais de modelo não versionados no Git.
