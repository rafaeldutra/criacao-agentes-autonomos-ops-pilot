# Refletor de aprendizado: Quickstart

## Prerequisites

- Feature `006-semantic-memory` implementada (`MemoryStore`, `userId` em `/chat`).
- Node.js 22 LTS; dependências instaladas.
- Testes de critério usam stub de `LearningReflector` (sem OpenRouter
  obrigatório).

## Validação determinística

```powershell
npm run typecheck
npm test
```

A suíte deve cobrir:

1. Stub preferência durável → `remember` chamado 1× com fato não vazio
   ([learning-reflector.md](./contracts/learning-reflector.md)).
2. Stub pedido pontual → `remember` 0×.
3. Stub segredo → `remember` 0×.
4. HTTP: retorno de `/chat` não espera conclusão de `remember` (SC-004);
   `learningQueued === true` com `userId`
   ([chat-http.md](./contracts/chat-http.md)).
5. Sem `userId` → `learningQueued === false`, nenhum `remember`.
6. `forget_preference` remove fato via recall+forget
   ([forget-preference-tool.md](./contracts/forget-preference-tool.md)).
7. Contratos 005/006 (conversationId, memoryFacts, history) permanecem verdes.

## Smoke HTTP local (opcional)

Com OpenRouter configurado no ambiente do processo:

```powershell
npm run dev
```

```powershell
curl -s -X POST http://127.0.0.1:3000/chat -H "content-type: application/json" -d "{\"message\":\"Sempre responda em portugues brasileiro.\",\"userId\":\"demo-user\"}"
```

Esperado: `200` rápido com `learningQueued: true`; em turno seguinte com
consulta relacionada, `memoryFacts >= 1` se o reflector gravou o fato.

Para esquecer (via agente com tool): pedir “esqueca minha preferencia de idioma”
com o mesmo `userId` e strategy ReAct.

## Security checks

- Tool não aceita `userId` no body do modelo.
- Reflector prompt exclui segredos; testes cobrem fixture de credencial.
- Falhas async não elevam 5xx na resposta já enviada.
