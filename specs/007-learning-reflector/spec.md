# Feature Specification: Refletor de aprendizado

**Feature Branch**: `007-learning-reflector`

**Created**: 2026-09-24

**Status**: Draft

**Input**: User description: "Refletor de aprendizado: após cada resposta, um withStructuredOutput({ hasLearning, fact }) lê a última mensagem do usuário e destila fatos duráveis (nunca pedido pontual, nunca segredo) -> memories.remember assíncrono; tool forget_preference"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Destilar fatos duráveis após o chat (Priority: P1)

Como operador identificado por `userId`, quero que, depois de cada resposta do assistente, o sistema analise a última mensagem do usuário e, quando houver um fato durável (preferência ou restrição estável), grave-o na memória semântica — sem bloquear a entrega da resposta — para que turnos futuros reutilizem esse conhecimento.

**Why this priority**: A memória semântica (006) só gera valor contínuo se fatos forem capturados automaticamente; o refletor é o elo entre conversa e `remember`.

**Independent Test**: Com um learning reflector stub/real e um `MemoryStore` fake, simular uma mensagem de usuário com preferência durável e uma resposta já gerada; afirmar que `hasLearning=true` leva a uma chamada assíncrona a `remember` com o fato destilado, e que a resposta HTTP/estratégia já foi devolvida sem esperar o `remember`.

**Acceptance Scenarios**:

1. **Given** um turno com `userId` e mensagem do usuário contendo preferência durável (ex.: “sempre me avise em português”), **When** a resposta do assistente é concluída, **Then** o refletor produz `{ hasLearning: true, fact: ... }` e dispara `memories.remember(userId, fact)` de forma assíncrona (não atrasa o caminho crítico da resposta).
2. **Given** um pedido pontual (ex.: “liste os alertas firing agora”), **When** o refletor analisa a mensagem, **Then** `hasLearning` é `false` e `remember` **não** é chamado.
3. **Given** conteúdo sensível (segredo, token, senha, credencial), **When** o refletor analisa, **Then** `hasLearning` é `false` e nenhum fato contendo o segredo é persistido.
4. **Given** ausência de `userId` no turno, **When** a resposta termina, **Then** o refletor **não** é obrigatório e `remember` não roda (sem identidade de memória).
5. **Given** falha no `remember` assíncrono (store/embed), **When** o erro ocorre após a resposta, **Then** a resposta já entregue permanece válida; a falha é observável em log/métrica sem derrubar o processo.

---

### User Story 2 - Esquecer preferência via ferramenta (Priority: P1)

Como operador (via o agente), quero uma tool `forget_preference` para remover uma preferência/fato previamente lembrado, para que eu possa corrigir ou revogar o que foi gravado pelo refletor.

**Why this priority**: Aprendizado automático sem revogação cria risco de fatos errados persistirem; a tool fecha o ciclo remember/forget.

**Independent Test**: Pré-popular memória do usuário; invocar `forget_preference` com descrição da preferência; afirmar que recalls posteriores não incluem o fato removido (via contrato da tool + store fake/` :memory:`).

**Acceptance Scenarios**:

1. **Given** um fato lembrado para o `userId` atual, **When** o agente chama `forget_preference` com texto que identifica semanticamente essa preferência, **Then** a memória correspondente é removida (`forget`) e a tool devolve confirmação legível.
2. **Given** nenhuma memória compatível, **When** `forget_preference` é chamada, **Then** a tool informa que nada foi removido (sem erro fatal opaco).
3. **Given** a suíte de tools do agente, **When** as tools são listadas/criadas, **Then** `forget_preference` está disponível junto às tools operacionais existentes (ReAct/Plan-and-Execute podem invocá-la).

---

### User Story 3 - Critérios explícitos do que é “aprendível” (Priority: P2)

Como mantenedor do OpsPilot, quero regras claras no prompt/schema do refletor para que testes e revisões possam afirmar o que deve e o que não deve virar fato.

**Why this priority**: Sem critérios testáveis, o refletor vira caixa-preta e pode vazar pedidos pontuais ou segredos.

**Independent Test**: Casos de fixture (preferência durável / pedido pontual / segredo) passam pelo refletor com modelo stub de structured output e produzem `hasLearning` esperado; schema Zod rejeita saídas malformadas.

**Acceptance Scenarios**:

1. **Given** o schema estruturado `{ hasLearning: boolean, fact: string }`, **When** `hasLearning` é `false`, **Then** `fact` pode ser vazio e `remember` não roda.
2. **Given** `hasLearning` é `true`, **When** a validação roda, **Then** `fact` é string não vazia (após trim) descrevendo o fato durável em terceira pessoa / forma estável.
3. **Given** fixtures de mensagem, **When** avaliadas, **Then** pelo menos um caso positivo (preferência) e dois negativos (pedido pontual + segredo) estão cobertos por teste automatizado (stub do LLM estruturado).

## Edge Cases

- Mensagem do usuário vazia após trim: refletor não roda / `hasLearning=false`.
- `hasLearning=true` com `fact` só whitespace: tratado como inválido — não chama `remember`.
- Reflector LLM falha ou timeout: resposta do chat já entregue; aprendizado omitido sem 5xx no chat.
- Dedup do `MemoryStore` (> 0.92): segundo fato quase idêntico não duplica linha (comportamento 006).
- `forget_preference` sem `userId` no contexto da tool: rejeição clara (tool exige identidade de usuário injetada na composição).
- Concorrência: vários `remember` assíncronos do mesmo usuário não corrompem o store (prepared statements / isolamento por `userId`).
- O refletor de aprendizado é distinto da camada de *reflection* crítica (002): um avalia qualidade da resposta; o outro destila memória.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Após uma resposta bem-sucedida de chat (ou caminho composto equivalente), o sistema MUST executar um refletor de aprendizado que analisa a **última mensagem do usuário** daquele turno.
- **FR-002**: O refletor MUST usar saída estruturada com campos `hasLearning` (boolean) e `fact` (string), validada na fronteira (ex.: schema Zod + `withStructuredOutput`).
- **FR-003**: Quando `hasLearning` é `true` e existe `userId`, o sistema MUST chamar `memories.remember(userId, fact)` de forma **assíncrona** (fire-and-forget seguro: não bloqueia o retorno da resposta ao cliente).
- **FR-004**: Quando `hasLearning` é `false`, ou falta `userId`, ou `fact` é inválido, o sistema MUST NOT chamar `remember`.
- **FR-005**: O refletor MUST instrucionalmente excluir: (a) pedidos pontuais / one-shot; (b) segredos e credenciais (tokens, senhas, chaves, dados sensíveis óbvios).
- **FR-006**: O sistema MUST disponibilizar a tool `forget_preference` para remover preferências/fatos da memória do usuário corrente via `MemoryStore` (`recall`/`forget` conforme contrato).
- **FR-007**: A composição da aplicação MUST injetar `MemoryStore` e identidade `userId` no caminho do refletor e da tool; strategies continuam sem IO direto de memória fora das tools.
- **FR-008**: Falhas do aprendizado assíncrono MUST NOT alterar o status HTTP/resultado já produzido do turno; MUST ser tratadas de forma não silenciosa em observabilidade mínima (log ou métrica).
- **FR-009**: Testes automatizados MUST cobrir: destilação positiva, rejeição de pedido pontual, rejeição de segredo, fire-and-forget de `remember`, e `forget_preference`; `npm run test` / `npm run typecheck` permanecem verdes.

### Key Entities

- **LearningReflector**: Componente que, dado o texto da última mensagem do usuário (e opcionalmente contexto mínimo), devolve `{ hasLearning, fact }`.
- **LearningVerdict**: Resultado estruturado com `hasLearning` e `fact`.
- **DurableFact**: Fato estável sobre preferências/restrições do usuário, adequado a memória semântica de longo prazo.
- **forget_preference**: Tool do agente que revoga uma preferência previamente lembrada para o `userId` do turno.
- **MemoryStore**: Fronteira existente (006) usada por `remember` assíncrono e pela tool de esquecimento.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em teste com preferência durável + `userId`, após a resposta, `remember` é invocado exatamente uma vez com um fato não vazio.
- **SC-002**: Em teste com pedido pontual, `remember` é invocado zero vezes.
- **SC-003**: Em teste com mensagem contendo segredo/credencial óbvia, `remember` é invocado zero vezes.
- **SC-004**: O tempo até devolver a resposta ao cliente no caminho de teste stub **não** inclui a conclusão de `remember` (aprendizado é assíncrono / pós-resposta).
- **SC-005**: Após `forget_preference` bem-sucedido sobre um fato conhecido, um `recall` subsequente com consulta relacionada **não** devolve aquele fato.
- **SC-006**: Turnos sem `userId` preservam o comportamento de chat existente e não gravam memórias.
- **SC-007**: 100% dos novos testes da feature passam sem LLM real obrigatório nos casos de critério (stub de structured output); um caminho opcional com modelo real pode existir mas não bloqueia CI.

## Assumptions

- O typo `hasLearnin` do pedido significa `hasLearning`.
- Esta feature depende da memória semântica (`006-semantic-memory`): `MemoryStore.remember` / `forget` / `recall` e `userId` opcional em `/chat`.
- O refletor de aprendizado roda na composição pós-`strategy.run` (borda HTTP ou helper injetável), não dentro do crítico de qualidade (feature 002).
- “Assíncrono” significa não bloquear a resposta: `void remember(...).catch(...)` (ou equivalente) após enviar/retornar o resultado do turno.
- `forget_preference` recebe uma descrição textual da preferência; a implementação localiza a memória do usuário (ex.: melhor match de `recall`) e chama `forget(id)`. Detalhe exato no plano.
- Sem `userId`, não há aprendizado automático nem `forget_preference` útil; a tool reporta erro de contexto se invocada sem identidade.
- O modelo do refletor reutiliza o stack LangChain/OpenRouter já usado pelo projeto; em testes, um double de `withStructuredOutput` é suficiente.
- Não há UI dedicada de gestão de memórias nesta feature — só refletor automático + tool.
- Redação/PII avançada além da regra “nunca segredo” fica fora de escopo v1; o prompt do refletor cobre o caso óbvio.
