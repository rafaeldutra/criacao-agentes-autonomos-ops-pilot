# Feature Specification: Modo Equipe com Supervisor

**Feature Branch**: `016-team-supervisor-mode`

**Created**: 2026-10-19

**Status**: Draft

**Input**: User description: "Modo equipe em src/team/: supervisor com withStructuredOutput({ next, brief }) sobre um blackboard no estado. Papéis: analista (só leitura, não propõe), planejador (sem tools), executor (incidentes, sem bypass). Evento "handoff" no trace, renderizado no "ver raciocínio". Rota "team" teto 8"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Resolver um pedido operacional com uma equipe de especialistas (Priority: P1)

Como pessoa de plantão, quero que pedidos operacionais que exigem investigar, decidir e agir sejam tratados por uma equipe de especialistas coordenada por um supervisor — um analista que levanta os fatos, um planejador que decide o que fazer e um executor que age sobre incidentes — para obter uma resposta em que cada etapa foi feita pelo papel certo, com as restrições certas.

O supervisor lê, a cada passo, um quadro compartilhado (blackboard) com tudo o que a equipe já produziu, decide quem age em seguida (ou se o trabalho terminou) e entrega ao escolhido uma instrução curta (brief) do que fazer. Cada especialista registra sua contribuição no quadro. Quando o supervisor decide encerrar, a resposta final é composta a partir do quadro.

**Why this priority**: É o núcleo da funcionalidade; sem a coordenação supervisor → especialistas → quadro não existe modo equipe. Sozinha já entrega valor ao separar diagnóstico, decisão e ação.

**Independent Test**: Enviar ao OpsPilot, forçando a rota "team", o pedido "O checkout está com alerta disparando; investigue e abra um incidente se necessário" e verificar que: o analista consultou dados, o planejador produziu um plano sem consultar nada, o executor abriu o incidente, o supervisor encerrou e a resposta final reflete o conteúdo do quadro.

**Acceptance Scenarios**:

1. **Given** um pedido roteado para "team", **When** o turno começa, **Then** o supervisor escolhe o primeiro especialista e entrega a ele um brief não vazio.
2. **Given** um especialista concluiu seu passo, **When** o controle volta ao supervisor, **Then** o supervisor enxerga a contribuição desse especialista no quadro antes de decidir o próximo passo.
3. **Given** o supervisor decide que o trabalho terminou, **When** encerra, **Then** o OpsPilot devolve uma resposta final coerente com o conteúdo do quadro, com o mesmo formato de resposta das demais rotas.
4. **Given** um pedido simples que só exige leitura (ex.: "quais alertas estão disparando?"), **When** roteado para "team", **Then** o supervisor pode encerrar após apenas o analista agir, sem acionar planejador ou executor.

---

### User Story 2 - Garantir que cada papel respeita seus limites (Priority: P1)

Como responsável pela segurança operacional, quero que cada especialista só consiga fazer o que seu papel permite — o analista apenas lê e não propõe ações, o planejador apenas raciocina sem consultar nem alterar nada, o executor atua somente sobre incidentes e nunca contorna a aprovação humana de ações sensíveis — para que dividir o trabalho em equipe não abra brechas que o agente único não tinha.

**Why this priority**: Uma equipe com papéis mal delimitados é mais arriscada que um agente único. As restrições são o que justifica o modo equipe em produção; por isso têm a mesma prioridade do fluxo principal.

**Independent Test**: Para cada papel, provocar uma tentativa de ação fora do escopo (analista tentando abrir incidente, planejador tentando consultar alertas, executor tentando resolver incidente) e verificar que a ação proibida não acontece e que a resolução de incidente pelo executor gera o mesmo pedido de aprovação humana que gera fora do modo equipe.

**Acceptance Scenarios**:

1. **Given** o analista em ação, **When** ele age, **Then** só tem acesso a capacidades de leitura (alertas, incidentes, runbooks, status de provedores externos) e nenhuma capacidade que altere estado.
2. **Given** o analista registra sua contribuição, **When** ela é gravada no quadro, **Then** contém fatos e achados, sem recomendações de ação; propor o que fazer é papel do planejador.
3. **Given** o planejador em ação, **When** ele age, **Then** não tem acesso a nenhuma ferramenta e produz apenas um plano a partir do quadro.
4. **Given** o executor em ação, **When** ele age, **Then** só tem acesso a capacidades de incidentes (listar, abrir e resolver) e a nenhuma outra (ex.: esquecer preferências).
5. **Given** o executor tenta resolver um incidente durante uma conversa web, **When** a ação é solicitada, **Then** ela segue exatamente o mesmo fluxo de aprovação humana das demais rotas (cartão aprovar/negar), sem atalho nem execução automática.
6. **Given** a aprovação humana é negada, **When** o controle volta ao supervisor, **Then** a negativa fica registrada no quadro e a equipe não tenta a mesma ação por outro caminho.

---

### User Story 3 - Ver as passagens de bastão no "Ver raciocínio" (Priority: P2)

Como pessoa de plantão (ou desenvolvedora do agente), quero ver em "Ver raciocínio" cada passagem de bastão do supervisor — para qual especialista o trabalho foi entregue e com qual brief — intercalada com os passos de cada especialista, para entender quem fez o quê e por quê.

**Why this priority**: Transparência é requisito de uso em produção (herdado da war room), mas a equipe já funciona e é segura sem a visualização; por isso vem depois das duas primeiras histórias.

**Independent Test**: Executar um turno na rota "team", abrir "Ver raciocínio" e verificar que cada passagem aparece como um passo próprio, visualmente distinto dos demais tipos, mostrando o papel de destino e o brief, na ordem em que ocorreram.

**Acceptance Scenarios**:

1. **Given** um turno na rota "team", **When** o supervisor entrega o trabalho a um especialista, **Then** o raciocínio registra um passo do tipo "handoff" com o papel de destino e o brief.
2. **Given** o supervisor encerra o trabalho, **When** o raciocínio é registrado, **Then** há um passo "handoff" final indicando o encerramento.
3. **Given** a pessoa abre "Ver raciocínio" de uma resposta da equipe, **When** o painel é exibido, **Then** cada handoff aparece com rótulo, destino e brief legíveis, distinto de pensamentos, ações e observações, e os passos de cada especialista aparecem identificados pelo papel que os executou.
4. **Given** o brief contém texto arbitrário vindo do modelo, **When** é exibido, **Then** é apresentado como texto, nunca como conteúdo ativo.
5. **Given** um raciocínio persistido de um turno na rota "team", **When** é consultado posteriormente pelos registros de execução, **Then** os handoffs aparecem preservados como os demais passos.

---

### User Story 4 - Escolher e limitar a rota "team" (Priority: P2)

Como cliente da API (ou pessoa de plantão escolhendo a estratégia), quero poder pedir explicitamente a rota "team" e que o roteador também possa escolhê-la sozinho quando o pedido exigir investigar, decidir e agir, sempre com um teto de 8 passagens por turno, para usar a equipe quando faz sentido sem risco de laços sem fim.

**Why this priority**: Torna o modo equipe acessível e com custo previsível; depende das histórias anteriores para ter o que rotear.

**Independent Test**: Enviar uma mensagem pedindo explicitamente a estratégia "team" e verificar que a rota registrada é "team"; simular um supervisor que nunca encerra e verificar que o turno termina após 8 passagens com uma resposta.

**Acceptance Scenarios**:

1. **Given** um cliente pede explicitamente a estratégia "team", **When** a mensagem é processada, **Then** o roteamento registra a rota "team" com origem "override".
2. **Given** nenhuma estratégia explícita, **When** o pedido combina investigação, decisão e ação sobre incidentes, **Then** o roteador pode escolher "team" com uma justificativa.
3. **Given** o supervisor já fez 8 passagens no turno, **When** ainda não encerrou, **Then** o modo equipe encerra mesmo assim e devolve a melhor resposta possível a partir do quadro, indicando no raciocínio que o teto foi atingido.
4. **Given** um cliente pede uma estratégia desconhecida, **When** a mensagem é processada, **Then** o comportamento de erro existente (estratégia desconhecida) continua inalterado; "team" passa a ser aceita como conhecida.

---

### Edge Cases

- O supervisor devolve uma decisão inválida (papel inexistente, brief vazio ou formato inesperado): o turno falha com o mesmo tipo de erro de roteamento já existente, sem executar especialista algum com instrução inválida.
- O supervisor escolhe o mesmo especialista repetidamente: é permitido, mas cada passagem conta para o teto de 8.
- O supervisor encerra antes de qualquer especialista agir: a resposta final é composta pelo supervisor e explicita que não houve investigação.
- Um especialista falha (erro de ferramenta ou de modelo): a falha é registrada no quadro como observação e o supervisor decide o próximo passo; indisponibilidade total de modelos segue o comportamento de fallback já existente.
- A ação sensível do executor fica pendente de aprovação: o turno se comporta como nas demais rotas (resposta de "aguardando aprovação"), e a decisão humana é refletida no quadro quando o turno prossegue.
- O teto é atingido exatamente quando o executor tem uma ação pendente de aprovação: a ação pendente não é cancelada nem executada sem aprovação.
- Conversas com histórico, memória e resumo: o modo equipe recebe o mesmo contexto composto que as demais rotas.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: O sistema MUST oferecer um modo de raciocínio "equipe" composto por um supervisor e três especialistas: analista, planejador e executor.
- **FR-002**: O supervisor MUST, a cada passo, produzir uma decisão estruturada contendo exatamente: o próximo a agir (um dos três especialistas ou "encerrar") e um brief textual não vazio.
- **FR-003**: O sistema MUST manter, durante o turno, um quadro compartilhado (blackboard) com o pedido original e as contribuições de cada especialista, identificadas pelo papel e pela ordem; o supervisor e os especialistas MUST decidir e agir a partir desse quadro.
- **FR-004**: O analista MUST ter acesso somente a capacidades de leitura: alertas, incidentes, runbooks e status de provedores externos; MUST NOT ter acesso a nenhuma capacidade que altere estado.
- **FR-005**: As instruções do analista MUST restringi-lo a relatar fatos e achados, sem propor ações.
- **FR-006**: O planejador MUST NOT ter acesso a nenhuma ferramenta; MUST produzir apenas um plano a partir do quadro e do brief.
- **FR-007**: O executor MUST ter acesso somente a capacidades de incidentes (listar, abrir e resolver).
- **FR-008**: Ações sensíveis do executor MUST passar pelo mesmo fluxo de aprovação humana já existente, sem qualquer forma de contorno; uma negativa MUST ser registrada no quadro.
- **FR-009**: O sistema MUST registrar no raciocínio um evento do tipo "handoff" para cada decisão do supervisor, contendo o destino (papel ou encerramento) e o brief.
- **FR-010**: Os passos de cada especialista (pensamentos, ações, observações, plano) MUST ser registrados no raciocínio identificando o papel que os executou.
- **FR-011**: O sistema MUST limitar o modo equipe a no máximo 8 passagens do supervisor por turno; ao atingir o teto, MUST encerrar e devolver uma resposta composta a partir do quadro, registrando no raciocínio que o teto foi atingido.
- **FR-012**: O sistema MUST aceitar "team" como rota de estratégia, tanto por escolha explícita do cliente quanto por decisão do roteador.
- **FR-013**: O resultado de um turno na rota "team" MUST seguir o mesmo formato de resposta, métricas e persistência de raciocínio das demais rotas.
- **FR-014**: A war room MUST exibir o evento "handoff" em "Ver raciocínio" como um passo próprio e visualmente distinto, mostrando destino e brief como texto, com rótulo acessível.
- **FR-015**: A war room MUST aceitar respostas que contenham eventos "handoff" e a rota "team" sem tratá-las como resposta inválida.
- **FR-016**: Uma decisão inválida do supervisor MUST resultar no erro de roteamento já existente, sem executar nenhum especialista.
- **FR-017**: As rotas existentes (react, plan-and-execute, reflect) MUST manter o comportamento atual.

### Key Entities *(include if feature involves data)*

- **Supervisor**: coordenador da equipe; lê o quadro e decide quem age a seguir ou se o trabalho terminou, sempre com um brief.
- **Especialista (papel)**: analista, planejador ou executor; cada um com um conjunto fixo de capacidades permitidas e uma responsabilidade única.
- **Decisão do supervisor**: par (próximo, brief); próximo ∈ {analista, planejador, executor, encerrar}.
- **Quadro (blackboard)**: registro do turno com o pedido e a lista ordenada de contribuições (papel, brief recebido, conteúdo produzido); vive apenas durante o turno.
- **Evento handoff**: passo do raciocínio que representa uma decisão do supervisor (destino, brief).
- **Teto de passagens**: limite de 8 decisões do supervisor por turno.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Em 100% dos turnos na rota "team", o número de passagens do supervisor é ≤ 8 e o turno termina com uma resposta ou com o erro de domínio apropriado.
- **SC-002**: Em 100% das tentativas de ação fora do escopo do papel (testes de restrição por papel), a ação proibida não é executada.
- **SC-003**: Em 100% das resoluções de incidente pedidas pelo executor em conversa web, a pessoa recebe o pedido de aprovação antes de qualquer alteração.
- **SC-004**: Em 100% dos turnos na rota "team", cada decisão do supervisor aparece como um passo "handoff" em "Ver raciocínio", na ordem correta.
- **SC-005**: Uma pessoa de plantão consegue, apenas lendo "Ver raciocínio", identificar qual papel executou cada ação em menos de 30 segundos.
- **SC-006**: Todos os testes existentes continuam passando sem alteração de comportamento nas rotas react, plan-and-execute e reflect.
- **SC-007**: O painel de raciocínio com eventos "handoff" passa nas verificações automáticas de acessibilidade já usadas pela war room.

## Assumptions

- O código do modo equipe fica em `src/team/`, conforme pedido; detalhes de composição ficam para o plano.
- "teto 8" significa no máximo 8 decisões do supervisor por turno, contando a decisão de encerrar; ao atingi-lo, a resposta é composta a partir do quadro em vez de falhar.
- O roteador automático passa a conhecer "team" e pode escolhê-la; o cliente também pode forçá-la pelo campo de estratégia já existente.
- A capacidade de esquecer preferências não pertence a nenhum papel da equipe.
- "Sem bypass" significa que o executor usa a mesma aprovação humana das outras rotas; fora de uma conversa HTTP (CLI, arena, bench), vale o comportamento atual dessas superfícies.
- O quadro não é persistido entre turnos; o que persiste é o raciocínio (com os handoffs) e a resposta final, como nas demais rotas.
- A composição da resposta final é responsabilidade do supervisor ao encerrar, a partir do quadro.
- Os testes usam modelos determinísticos (doubles), como nas demais rotas.
