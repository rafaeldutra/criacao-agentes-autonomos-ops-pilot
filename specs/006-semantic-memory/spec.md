# Feature Specification: Memória semântica

**Feature Branch**: `006-semantic-memory`

**Created**: 2026-09-22

**Status**: Draft

**Input**: User description: "Memória semântica: MemoryStore por userId - remember (dedup > 0.92), recall top-3 por produto escalar (min 0.3), forget; tabela memories, embedding all-MiniLM-L6-v2 local em BLOB; /chat ganha userId e injeta o recall no prompt; teste: recall acha fato sem palavra em comum. @huggingface/transformers com pooling: mean + normalize: true e lazy singleton src/memory/embeddings.ts e src/memory/memory-store.ts. As colunas de memories (id, user_id, fact, embedding, created_at)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guardar e recuperar fatos por usuário (Priority: P1)

Como operador (ou cliente HTTP) identificado por um `userId`, quero que fatos relevantes sobre mim ou meu contexto operacional sejam gravados e depois recuperados por similaridade de significado — não apenas por palavras iguais — para que o assistente lembre preferências e restrições em turnos futuros.

**Why this priority**: Sem persistência semântica por usuário, cada conversa recomeça sem memória de longo prazo; remember/recall/forget são o núcleo da feature.

**Independent Test**: Com um `MemoryStore` em SQLite `:memory:` (ou fake), chamar `remember` com um fato, depois `recall` com uma consulta parafraseada sem palavras em comum e verificar que o fato aparece entre os top-3; chamar `forget` e confirmar que o fato some do recall.

**Acceptance Scenarios**:

1. **Given** um `userId` sem memórias, **When** `remember(userId, fact)` é chamado, **Then** um fato é persistido com embedding e timestamp, isolado daquele usuário.
2. **Given** um fato já gravado, **When** `remember` recebe um fato com similaridade de embedding > 0.92 ao existente do mesmo usuário, **Then** nenhum duplicado é inserido (deduplicação).
3. **Given** vários fatos do mesmo usuário, **When** `recall(userId, query)` é chamado, **Then** devolve no máximo 3 fatos ordenados por produto escalar decrescente, apenas com score ≥ 0.3.
4. **Given** um fato recuperável, **When** `forget` remove essa memória, **Then** recalls posteriores não a incluem.
5. **Given** o embedding local `all-MiniLM-L6-v2` (pooling mean, normalize true), **When** o fato "O usuário prefere café sem açúcar" é lembrado e a consulta é "How does he like his coffee?", **Then** o recall encontra o fato mesmo sem palavras em comum (cenário de teste obrigatório).

---

### User Story 2 - Injetar memória no chat HTTP (Priority: P1)

Como cliente de `/chat`, quero enviar um `userId` e ter os fatos mais relevantes recuperados automaticamente e compostos no prompt, para que as respostas do OpsPilot usem a memória semântica daquele usuário.

**Why this priority**: A memória só gera valor operacional se influenciar o turno atual; `/chat` é a superfície principal.

**Independent Test**: Com store fake pré-carregado e estratégia stub, POST `/chat` com `userId` e mensagem relacionada semanticamente; afirmar que o prompt/contexto recebido pela estratégia inclui os fatos do recall e que a validação Zod aceita `userId`.

**Acceptance Scenarios**:

1. **Given** um body de chat válido com `userId`, **When** `/chat` tem sucesso, **Then** o caminho composto executa `recall` para esse usuário com a mensagem atual e injeta os fatos recuperados no prompt antes da estratégia.
2. **Given** um body sem `userId`, **When** `/chat` é chamado, **Then** o chat continua a funcionar como hoje sem injeção de memória semântica (sem recall/remember obrigatórios).
3. **Given** um `userId` presente mas sem memórias acima do limiar, **When** `/chat` roda, **Then** nenhum bloco de memória é forçado e a resposta ainda é válida.
4. **Given** body inválido (`userId` em branco quando enviado, tipos errados etc.), **When** a validação roda, **Then** Zod rejeita com erro de cliente e o store de memória não é alterado.

---

### User Story 3 - Embeddings locais reutilizáveis (Priority: P2)

Como desenvolvedor da feature, quero um módulo de embeddings local lazy (singleton) que produza vetores normalizados para remember e recall, para que testes e produção compartilhem o mesmo contrato sem recarregar o modelo a cada chamada.

**Why this priority**: Remember/recall dependem de embeddings consistentes; o singleton evita custo e flutuação desnecessários.

**Independent Test**: Importar o módulo de embeddings duas vezes na mesma suíte, gerar vetores para a mesma string e afirmar identidade de referência do pipeline (singleton) e norma ~1 após normalize; sem rede em runtime após o modelo estar em cache local.

**Acceptance Scenarios**:

1. **Given** a primeira chamada de embed, **When** o pipeline é carregado, **Then** usos posteriores reutilizam a mesma instância lazy singleton.
2. **Given** textos distintos, **When** embutidos com pooling mean e normalize true, **Then** os vetores resultantes são adequados a produto escalar como similaridade (vetores unitários).
3. **Given** a composição da aplicação, **When** o memory store é ligado, **Then** embeddings e store são injetáveis/explicitamente compostos (sem globais ocultos além do singleton de modelo documentado).

---

### User Story 4 - Doubles e testes determinísticos (Priority: P2)

Como desenvolvedor, quero testes do `MemoryStore` com SQLite `:memory:` e, se útil, um fake, cobrindo remember/recall/forget e o cenário sem palavras em comum, mantendo a suíte verde.

**Why this priority**: A constituição exige teste com lógica nova; o cenário semântico é o critério de aceite da feature.

**Independent Test**: Rodar testes unitários do store e do recall semântico; `npm run test` e `npm run typecheck` passam.

**Acceptance Scenarios**:

1. **Given** SQLite `:memory:`, **When** o schema é inicializado, **Then** a tabela `memories` é criada de forma idempotente com colunas `id`, `user_id`, `fact`, `embedding`, `created_at`.
2. **Given** o teste de recall sem palavras em comum, **When** a suíte roda, **Then** o fato é encontrado no top-3 com score ≥ 0.3.
3. **Given** isolamento por `userId`, **When** recall é feito para outro usuário, **Then** fatos do primeiro usuário não aparecem.

## Edge Cases

- `recall` sem memórias (ou todas abaixo de 0.3) devolve lista vazia, não erro.
- `remember` com fato vazio/whitespace é rejeitado na fronteira do store ou da validação.
- Dedup > 0.92 compara apenas memórias do mesmo `userId`.
- Produto escalar usa embeddings já normalizados; scores fora de [-1, 1] por erro numérico são tratados de forma estável (clamp ou comparação direta documentada nos testes).
- `forget` de id inexistente é no-op idempotente ou erro de domínio claro — comportamento fixado nos testes do store.
- Falha ao carregar o modelo de embedding falha de forma explícita na primeira necessidade de embed (não silenciosa).
- Entradas SQL usam apenas parâmetros vinculados; `user_id`, `fact` e ids nunca são concatenados em SQL.
- Memórias de usuários distintos nunca vazam entre recalls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST disponibilizar a fronteira `MemoryStore` com pelo menos `remember`, `recall` e `forget`, escopadas por `userId`.
- **FR-002**: O memory store baseado em SQLite MUST criar a tabela `memories` de forma idempotente com colunas `id`, `user_id`, `fact`, `embedding` (BLOB), `created_at`, no estilo de persistência do projeto (`node:sqlite` / `DatabaseSync`, prepared statements, `:memory:` para testes).
- **FR-003**: `remember(userId, fact)` MUST gerar embedding local, persistir o fato se não houver memória existente do mesmo usuário com similaridade (produto escalar) > 0.92, e caso haja, MUST NOT inserir duplicata.
- **FR-004**: `recall(userId, query)` MUST embutir a consulta, ranquear memórias do usuário por produto escalar e devolver no máximo os 3 melhores com score ≥ 0.3.
- **FR-005**: `forget` MUST remover a memória indicada do store de forma que não volte em recalls posteriores.
- **FR-006**: Embeddings MUST usar o modelo local `all-MiniLM-L6-v2` via `@huggingface/transformers`, com pooling `mean` e `normalize: true`, expostos por um lazy singleton em `src/memory/embeddings.ts`.
- **FR-007**: A implementação do store MUST viver em `src/memory/memory-store.ts` (e módulos auxiliares sob `src/memory/` conforme necessário).
- **FR-008**: `POST /chat` MUST aceitar `userId` opcional no body validado (Zod); quando presente e válido, MUST executar recall e injetar os fatos recuperados no prompt/contexto antes da estratégia.
- **FR-009**: Quando `userId` for omitido, `/chat` MUST preservar o comportamento existente sem exigir memória semântica.
- **FR-010**: A composição da aplicação MUST injetar o memory store explicitamente (SQLite para produção/integração; fake ou `:memory:` para testes).
- **FR-011**: Testes automatizados MUST incluir um caso em que `recall` encontra um fato semanticamente relacionado sem palavras em comum entre fato e consulta, e MUST manter `npm run test` / `npm run typecheck` verdes.

### Key Entities

- **Memory**: Fato textual durável associado a um usuário, com embedding vetorial e timestamp de criação.
- **UserId**: Identidade lógica que isola memórias entre operadores/clientes.
- **MemoryStore**: Fronteira de persistência expondo remember/recall/forget.
- **EmbeddingVector**: Representação numérica normalizada do texto, armazenada em BLOB e usada para ranking por produto escalar.
- **ChatRequest**: Body de `/chat` estendido com `userId` opcional; o caminho composto pode enriquecer o prompt com fatos do recall.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Após `remember` de um fato, um `recall` com paráfrase sem palavras em comum devolve esse fato entre os top-3 com score ≥ 0.3 no teste automatizado obrigatório.
- **SC-002**: Um segundo `remember` com similaridade > 0.92 ao fato existente do mesmo usuário não aumenta a contagem de memórias daquele usuário.
- **SC-003**: `recall` nunca devolve mais de 3 fatos nem fatos com score < 0.3.
- **SC-004**: Um POST `/chat` com `userId` e memórias relevantes faz a estratégia receber os fatos recuperados no contexto do prompt (verificável via stub em teste).
- **SC-005**: Um POST `/chat` sem `userId` permanece bem-sucedido com o contrato anterior (salvo campos aditivos já existentes de outras features).
- **SC-006**: 100% dos testes de contrato do memory store passam em SQLite `:memory:` sem depender de arquivo de banco no filesystem para a suíte de memória.
- **SC-007**: Memórias de um `userId` nunca aparecem no `recall` de outro `userId` nos testes de isolamento.

## Assumptions

- `userId` em `/chat` é opcional na v1: presente → recall (e eventual remember futuro via fluxos explícitos); ausente → chat sem memória semântica. Autenticação real / multi-tenant seguro ficam fora de escopo (como na feature de conversa).
- `remember` automático a partir de cada turno de chat não é obrigatório nesta feature; o escopo mínimo é a fronteira do store + injeção de recall no prompt. Chamadas explícitas a `remember` (testes, ferramentas futuras ou composição) são suficientes para validar o núcleo.
- `forget` remove por identidade da memória (`id`); detalhes exatos da assinatura ficam no contrato do plano, desde que o efeito observável seja a exclusão.
- O modelo `all-MiniLM-L6-v2` roda localmente; o primeiro carregamento pode baixar pesos para cache local do ambiente de desenvolvimento/CI, mas o contrato de runtime trata o pipeline como singleton lazy.
- Embeddings normalizados tornam o produto escalar equivalente à similaridade de cosseno; limiares 0.92 (dedup) e 0.3 (recall) são fixos na v1.
- A tabela `memories` pode colocalizar no mesmo SQLite operacional (`OPSPILOT_DB`) ou ser composta via o mesmo caminho padrão do projeto; a escolha de arquivo dedicado versus compartilhado é de implementação, desde que a injeção do store seja explícita.
- Um fake em memória de `MemoryStore` é opcional se os testes `:memory:` cobrirem o contrato; preferível quando acelerar testes sem carregar o modelo real — nesse caso o fake deve documentar scores stubados, e o teste semântico obrigatório usa embeddings reais.
- Esta feature complementa (não substitui) o histórico de conversa de curto prazo da feature `005-persistent-conversation`.
