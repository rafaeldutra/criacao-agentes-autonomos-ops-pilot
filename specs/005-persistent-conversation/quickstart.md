# Conversa persistente: Quickstart

## Prerequisites

- Node.js 22 LTS com `node:sqlite`.
- Dependências instaladas em `ops-pilot/`.
- Sem OpenRouter/rede para testes de store e composição HTTP com stub.

## Validação determinística

Na raiz do projeto:

```powershell
npm run typecheck
npm test
```

A suíte deve cobrir:

1. `SqliteConversationStore(":memory:")` cria `conversations` e `messages`
   idempotentemente (ver [data-model.md](./data-model.md)).
2. Contrato compartilhado fake + `:memory:`: `create` → `append` user/assistant
   → `lastMessages` com ordem e limite corretos
   ([contracts/conversation-store.md](./contracts/conversation-store.md)).
3. `lastMessages` em conversa vazia devolve `[]`.
4. Com mais de 12 mensagens, a composição HTTP injeta exatamente 12 e
   `historyMessages === 12`.
5. Com 3 mensagens anteriores, `historyMessages === 3`; conversa nova → `0`.
6. `POST /chat` sem `conversationId` devolve um id; segundo POST com o mesmo id
   ecoa o id ([contracts/chat-http.md](./contracts/chat-http.md)).
7. `conversationId` desconhecido → erro de cliente **antes** da strategy.
8. Casos existentes de `/chat` (400 Zod, 422 strategy, 504 timeout, reflect)
   permanecem verdes.

## Smoke HTTP local (opcional)

Com credenciais OpenRouter configuradas no ambiente do processo (sem ler
`.env` no código):

```powershell
npm run dev
```

```powershell
# turno 1
curl -s -X POST http://127.0.0.1:3000/chat -H "content-type: application/json" -d "{\"message\":\"liste alertas firing\"}"

# turno 2 — reutilize conversationId da resposta anterior
curl -s -X POST http://127.0.0.1:3000/chat -H "content-type: application/json" -d "{\"message\":\"e o mais crítico?\",\"conversationId\":\"<id>\"}"
```

Esperado: mesmo `conversationId` nos dois turnos; segundo turno com
`historyMessages >= 2` após o primeiro par user/assistant.

## Security checks

- Nenhum SQL montado por concatenação de `conversationId` ou `content`.
- Prepared statements em todo DML/SELECT do conversation store.
- Runtime `data/*.db` continua ignorado pelo Git.
