# Feature Specification: War Room Web

**Feature Branch**: `014-war-room-web`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "War room web/ (Vite+react+TS) com as instructions de design: chat -> /chat, com "ver raciocínio" abrindo o trace tipado. 202 vira cartão aprovar/negar; engrenagem com URL da API; base /opspilot/; CORS"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Conversar com o OpsPilot pelo navegador (Priority: P1)

Como pessoa de plantão, quero abrir a war room no navegador e conversar com o OpsPilot (perguntar sobre alertas, incidentes, runbooks), vendo minhas mensagens e as respostas em sequência na mesma conversa, para operar sem precisar montar chamadas HTTP manualmente.

**Why this priority**: É o núcleo da war room; sem o chat funcionando nenhuma outra história tem onde aparecer. Sozinha já entrega valor (substitui `curl`/cliente HTTP).

**Independent Test**: Com a API rodando e acessível, abrir a war room, enviar "Quais alertas estão disparando?" e verificar que a mensagem aparece, que há indicação de processamento e que a resposta do agente é exibida; enviar uma segunda mensagem e verificar que ela continua a mesma conversa.

**Acceptance Scenarios**:

1. **Given** a war room aberta e a API acessível, **When** a pessoa envia uma mensagem não vazia, **Then** a mensagem aparece imediatamente no histórico, o envio fica bloqueado enquanto a resposta não chega e há um indicador de "processando".
2. **Given** uma resposta de sucesso do agente, **When** ela chega, **Then** o texto da resposta aparece no histórico associado à mensagem enviada, e as mensagens seguintes da sessão continuam a mesma conversa no servidor.
3. **Given** a pessoa iniciou uma conversa, **When** escolhe "Nova conversa", **Then** o histórico visível é limpo e a próxima mensagem inicia uma conversa nova no servidor.
4. **Given** uma mensagem vazia ou só com espaços, **When** a pessoa tenta enviar, **Then** o envio não acontece.
5. **Given** a API responde com erro (validação, conversa inexistente, estratégia desconhecida, falha do roteador, modelo indisponível, timeout ou erro interno), **When** a resposta chega, **Then** a war room mostra uma mensagem em linguagem clara dizendo o que aconteceu e o que fazer, com opção de tentar novamente, e exibe o identificador da requisição como detalhe copiável quando disponível; a mensagem original não se perde.
6. **Given** a API não pode ser alcançada (fora do ar, URL errada ou bloqueio de origem), **When** a pessoa envia uma mensagem, **Then** a war room diz que não conseguiu falar com a API e aponta para a engrenagem de configuração.
7. **Given** nenhuma mensagem foi enviada ainda, **When** a war room é aberta, **Then** é exibido um estado vazio explicando o que pode ser perguntado, com exemplos clicáveis.

---

### User Story 2 - Ver o raciocínio de uma resposta (Priority: P1)

Como pessoa de plantão (ou desenvolvedora do agente), quero clicar em "Ver raciocínio" em uma resposta e ver o passo a passo que o agente seguiu — rota escolhida, pensamentos, ferramentas chamadas com argumentos, observações, plano, críticas, trocas de modelo e resposta final — com cada tipo de passo apresentado de forma distinta, para confiar (ou desconfiar) da resposta antes de agir.

**Why this priority**: Em operação de produção, agir com base em uma resposta sem saber como ela foi obtida é arriscado; transparência é requisito para uso real, não um extra.

**Independent Test**: Enviar uma mensagem que faça o agente usar ferramentas, clicar em "Ver raciocínio" na resposta e verificar que todos os passos aparecem em ordem, cada um identificado pelo seu tipo e pela etapa do fluxo em que ocorreu.

**Acceptance Scenarios**:

1. **Given** uma resposta de sucesso com raciocínio registrado, **When** a pessoa aciona "Ver raciocínio", **Then** abre-se um painel com todos os passos na ordem original, sem precisar sair da conversa.
2. **Given** o painel aberto, **When** os passos são exibidos, **Then** cada tipo de passo tem apresentação própria e rótulo textual: rota (rota escolhida e motivo), pensamento, ação (nome da ferramenta e argumentos legíveis), observação, plano (lista de etapas com estado), crítica, troca de modelo (modelo de origem, de destino e motivo), resumo e resposta; a etapa do fluxo em que o passo ocorreu também é indicada.
3. **Given** um passo de tipo que a war room não conhece (adicionado ao agente no futuro), **When** o painel é exibido, **Then** o passo aparece de forma genérica com seu tipo e conteúdo, sem quebrar o painel.
4. **Given** uma resposta sem passos de raciocínio, **When** a pessoa aciona "Ver raciocínio", **Then** o painel exibe um estado vazio explicativo.
5. **Given** a resposta inclui métricas (modelo usado, chamadas ao modelo, tokens, latência), **When** o painel é aberto, **Then** esses dados aparecem em um resumo no topo do painel.
6. **Given** o painel aberto, **When** a pessoa pressiona `Esc` ou fecha o painel, **Then** o foco volta ao botão "Ver raciocínio" que o abriu.

---

### User Story 3 - Aprovar ou negar uma ação pendente (Priority: P2)

Como pessoa de plantão, quando o OpsPilot precisar da minha autorização antes de executar uma ação (resposta "aceita, aguardando decisão" — HTTP 202), quero ver um cartão com o que ele pretende fazer e por quê, e decidir com "Aprovar" ou "Negar", para que nenhuma ação de impacto aconteça sem um humano no controle.

**Why this priority**: Dá segurança operacional e materializa o princípio de ações sensíveis com aprovação humana, mas depende do chat (US1) e de um contrato de aprovação na API.

**Independent Test**: Provocar uma resposta 202 (com uma ação pendente) e verificar que aparece o cartão com descrição da ação, alvo e motivo; aprovar e verificar que o resultado chega na conversa; repetir negando e verificar que a conversa registra a negação e a ação não é executada.

**Acceptance Scenarios**:

1. **Given** a API responde 202 a uma mensagem com uma ação pendente, **When** a resposta chega, **Then** a war room exibe na conversa um cartão de aprovação com: o que será feito (ação e alvo em linguagem clara), os parâmetros relevantes, o motivo informado pelo agente e os botões "Aprovar" e "Negar".
2. **Given** um cartão pendente, **When** a pessoa clica "Aprovar", **Then** a decisão é enviada, os botões ficam desabilitados com indicação de processamento e, ao concluir, o cartão passa a mostrar "Aprovado" com o horário e a resposta resultante do agente aparece na conversa.
3. **Given** um cartão pendente, **When** a pessoa clica "Negar", **Then** a decisão é enviada, o cartão passa a mostrar "Negado" com o horário, a ação não é executada e o agente confirma na conversa que não agiu.
4. **Given** um cartão já decidido, **When** a pessoa o visualiza, **Then** não é possível decidir de novo.
5. **Given** o envio da decisão falha, **When** o erro retorna, **Then** o cartão volta a ficar decidível, mostra o erro e permite tentar novamente; a decisão nunca é considerada tomada sem confirmação da API.
6. **Given** existe um cartão pendente, **When** a pessoa tenta enviar outra mensagem na mesma conversa, **Then** a war room avisa que há uma decisão pendente e só permite continuar depois da decisão.
7. **Given** o agente decide resolver um incidente ou esquecer uma preferência aprendida, **When** chega o momento de executar essa ação, **Then** a API não a executa: pausa a execução, guarda a ação pendente e responde 202 com os dados do cartão.
8. **Given** o agente decide abrir um incidente ou executar uma ação apenas de leitura (listar alertas/incidentes, consultar runbook, checar status de provedor), **When** a ação é executada, **Then** ela acontece imediatamente, sem aprovação.
9. **Given** uma ação pendente aprovada, **When** a API recebe a decisão, **Then** a ação é executada uma única vez e o agente continua o raciocínio a partir do resultado, devolvendo a resposta final (ou um novo 202, se precisar de outra aprovação).
10. **Given** uma ação pendente negada, **When** a API recebe a decisão, **Then** a ação não é executada e o agente continua sabendo que a ação foi negada pela pessoa, respondendo de acordo.

---

### User Story 4 - Configurar a URL da API pela engrenagem (Priority: P2)

Como pessoa usuária da war room, quero abrir uma engrenagem de configurações e informar o endereço da API do OpsPilot, para usar a mesma war room contra ambientes diferentes (local, homologação, produção) sem recompilar.

**Why this priority**: Necessária para usar a war room fora do ambiente padrão, mas existe um valor padrão que permite o MVP sem ela.

**Independent Test**: Abrir a engrenagem, informar uma URL, salvar, recarregar a página e verificar que a URL persiste e que as mensagens passam a ir para ela; informar uma URL inválida e verificar que não é salva.

**Acceptance Scenarios**:

1. **Given** nenhuma URL configurada, **When** a war room é usada, **Then** ela usa um endereço padrão definido na publicação e mostra qual é na engrenagem.
2. **Given** a engrenagem aberta, **When** a pessoa informa uma URL válida (http ou https) e salva, **Then** a URL fica gravada neste navegador, sobrevive a recarregamentos e as próximas requisições usam esse endereço.
3. **Given** a engrenagem aberta, **When** a pessoa informa um valor que não é uma URL http/https, **Then** o salvamento é bloqueado com mensagem de erro junto ao campo.
4. **Given** a engrenagem aberta, **When** a pessoa usa "Testar conexão", **Then** a war room informa se a API respondeu, se não foi alcançada ou se a origem foi bloqueada.
5. **Given** a URL é alterada com uma conversa em andamento, **When** a pessoa salva, **Then** a war room avisa que a conversa atual pertence ao endereço anterior e inicia uma nova conversa.
6. **Given** a engrenagem, **When** a pessoa usa "Restaurar padrão", **Then** a URL volta ao endereço padrão.
7. **Given** a engrenagem, **When** a pessoa escolhe o tema (claro, escuro ou do sistema), **Then** a escolha é aplicada imediatamente e lembrada neste navegador.

---

### User Story 5 - Publicação sob o caminho /opspilot/ e acesso entre origens (Priority: P1)

Como responsável pela infraestrutura, quero publicar a war room sob o caminho `/opspilot/` de um servidor web e que a API aceite chamadas vindas das origens autorizadas (CORS), para hospedar a interface separada da API sem proxy obrigatório.

**Why this priority**: Sem acesso entre origens permitido, o navegador bloqueia todas as chamadas e nenhuma história funciona fora do mesmo host; o caminho base é requisito de implantação.

**Independent Test**: Publicar a war room sob `/opspilot/`, abrir `/opspilot/` e um recarregamento em qualquer rota interna e verificar que todos os recursos carregam; com a API em outra origem autorizada, enviar uma mensagem com sucesso; a partir de uma origem não autorizada, verificar que o navegador bloqueia.

**Acceptance Scenarios**:

1. **Given** a war room publicada sob `/opspilot/`, **When** alguém acessa `/opspilot/` (com ou sem barra final) ou recarrega uma rota interna, **Then** a página e todos os seus recursos carregam sem erro.
2. **Given** a API configurada com uma lista de origens autorizadas, **When** a war room em uma origem autorizada chama a API, **Then** a chamada (incluindo a verificação prévia do navegador) é aceita e o identificador da requisição fica legível para a war room.
3. **Given** uma origem fora da lista, **When** ela chama a API, **Then** a API não concede permissão de acesso entre origens.
4. **Given** nenhuma lista de origens configurada, **When** a API sobe, **Then** apenas as origens de desenvolvimento local da war room são autorizadas (nunca "qualquer origem").

---

### Edge Cases

- Resposta do agente demorando muito (até o limite de 180 s da API): o indicador de processamento informa, após ~10 s, que está demorando e permite cancelar a espera; cancelar não apaga a mensagem enviada.
- Timeout da API (504): mensagem específica ("o agente demorou demais") com opção de reenviar.
- Conversa expirada/inexistente no servidor (404): a war room avisa e oferece iniciar nova conversa reenviando a última mensagem.
- Modelo indisponível (503) ou falha do provedor/roteador (502): mensagem dizendo que o problema é no provedor de IA, não na pergunta.
- Corpo de resposta inesperado (não JSON ou fora do formato): tratado como erro da interface, sem quebrar a tela, com o identificador da requisição se houver.
- Trace muito longo (dezenas de passos) ou argumentos/observações extensos: o painel continua navegável; conteúdos longos ficam recolhidos com opção de expandir.
- Resposta do agente com formatação (listas, blocos de código): exibida legível, sem executar nenhum conteúdo como código ou HTML ativo.
- Duas abas da war room abertas: cada aba mantém sua própria conversa; a URL configurada é compartilhada.
- Armazenamento do navegador indisponível (modo privado/bloqueado): a war room funciona com a URL padrão e avisa que a configuração não será lembrada.
- Resposta 202 sem dados suficientes para montar o cartão: exibida como erro claro, sem botões de decisão.
- Aprovação respondida depois que a ação pendente expirou ou já foi decidida em outro lugar: o cartão mostra o estado final informado pela API.
- Tela estreita (celular) e zoom de 200%: chat, painel de raciocínio, cartão e engrenagem continuam utilizáveis sem rolagem horizontal.

## Requirements *(mandatory)*

### Functional Requirements

**Chat**

- **FR-001**: A war room MUST enviar cada mensagem da pessoa ao endpoint de chat da API configurada e exibir a resposta do agente na conversa.
- **FR-002**: A war room MUST manter o identificador de conversa devolvido pela API e reutilizá-lo nas mensagens seguintes até a pessoa iniciar uma nova conversa.
- **FR-003**: A war room MUST impedir envio de mensagens vazias e impedir envio concorrente enquanto uma resposta está pendente na mesma conversa.
- **FR-004**: A war room MUST traduzir cada classe de erro da API (400, 404, 422, 502, 503, 504, 500) e a falha de conexão em mensagens claras com "o que aconteceu / o que fazer", oferecendo tentar novamente, sem exibir stack traces ou mensagens cruas como texto principal.
- **FR-005**: A war room MUST exibir o identificador da requisição (do corpo ou do cabeçalho de resposta) como detalhe copiável em respostas e erros.
- **FR-006**: A war room MUST exibir o conteúdo do agente como texto seguro, sem interpretar HTML ou scripts vindos da resposta.

**Raciocínio (trace)**

- **FR-007**: Cada resposta de sucesso MUST ter a ação "Ver raciocínio", que abre um painel com os passos do trace na ordem recebida.
- **FR-008**: O painel MUST apresentar cada tipo de passo conhecido (rota, pensamento, ação, observação, plano, crítica, troca de modelo, resumo, resposta) com rótulo textual e estrutura própria, indicando também a etapa do fluxo do agente (contexto, roteador, estratégia, reflexão, resposta).
- **FR-009**: O painel MUST exibir tipos de passo desconhecidos de forma genérica, sem falhar.
- **FR-010**: O painel MUST exibir, quando presentes, as métricas da resposta: modelo usado, número de chamadas ao modelo, tokens do prompt e latência.
- **FR-011**: A war room MUST validar o formato de cada resposta recebida antes de exibi-la; dados fora do formato são tratados como erro da interface.

**Aprovação humana**

- **FR-012**: Quando a API responder 202 com uma ação pendente, a war room MUST exibir um cartão de aprovação com ação, alvo, parâmetros, motivo e os botões "Aprovar" e "Negar".
- **FR-013**: A war room MUST enviar a decisão à API, refletir os estados do cartão (pendente → enviando → aprovado/negado/erro) e exibir na conversa o resultado devolvido após a decisão.
- **FR-014**: Um cartão MUST aceitar uma única decisão confirmada pela API; após confirmada, os botões deixam de existir.
- **FR-015**: Enquanto houver cartão pendente, a war room MUST bloquear novas mensagens naquela conversa, explicando o motivo.
- **FR-016**: A API MUST exigir aprovação humana antes de executar as ações sensíveis "resolver incidente" e "esquecer preferência"; as demais ações (incluindo abrir incidente) executam sem aprovação.
- **FR-016a**: Ao encontrar uma ação sensível, a API MUST pausar a execução do agente, persistir a ação pendente com o estado necessário para retomar e responder 202 com identificador da ação, ação, parâmetros, motivo, identificador da conversa e identificador da requisição.
- **FR-016b**: A API MUST oferecer um ponto para registrar a decisão (aprovar ou negar) de uma ação pendente; aprovar executa a ação exatamente uma vez e retoma o agente; negar não executa e retoma o agente informando a negativa; a resposta segue o mesmo formato do chat (200 com resposta final ou novo 202).
- **FR-016c**: Decisão sobre ação inexistente MUST resultar em "não encontrada"; decisão sobre ação já decidida MUST ser rejeitada como conflito, sem reexecutar; entradas de decisão MUST ser validadas na fronteira.
- **FR-016d**: Ações pendentes, decisões e o resultado MUST ficar registrados e auditáveis (quem não aplica nesta versão, mas quando e qual decisão), incluindo no trace da requisição que retomou o agente.

**Configuração**

- **FR-017**: A war room MUST oferecer uma engrenagem de configurações acessível de qualquer tela, com o campo "URL da API", "Testar conexão", "Restaurar padrão" e escolha de tema.
- **FR-018**: A URL da API MUST aceitar apenas endereços http/https válidos, ser gravada no navegador da pessoa e ter um valor padrão definido na publicação.
- **FR-019**: Alterar a URL da API com conversa em andamento MUST iniciar nova conversa, com aviso.

**Publicação e acesso entre origens**

- **FR-020**: A war room MUST funcionar integralmente quando publicada sob o caminho base `/opspilot/`, incluindo acesso direto e recarregamento de rotas internas.
- **FR-021**: A API MUST responder às verificações prévias de acesso entre origens e às chamadas de chat, aprovação e consulta apenas para origens presentes em uma lista configurável, expondo o cabeçalho do identificador da requisição.
- **FR-022**: Sem lista configurada, a API MUST autorizar somente as origens de desenvolvimento local da war room; a API MUST nunca autorizar "qualquer origem".
- **FR-023**: O comportamento atual dos endpoints existentes para clientes sem origem de navegador (CLI, testes, MCP) MUST permanecer inalterado.

**Design e acessibilidade**

- **FR-024**: Todas as telas MUST seguir as instruções de design do projeto para `web/` (`.github/instructions/design.instructions.md`): hierarquia, escala de espaçamento, estados carregando/vazio/erro/sucesso, temas claro e escuro e acessibilidade WCAG 2.2 AA.
- **FR-025**: Respostas novas, erros e mudanças de estado do cartão MUST ser anunciados a tecnologias assistivas; todo o fluxo (enviar, ver raciocínio, aprovar/negar, configurar) MUST ser operável apenas por teclado.
- **FR-026**: A interface MUST estar em português do Brasil.

### Key Entities

- **Mensagem**: item da conversa — autoria (pessoa, agente ou sistema), texto, horário, estado (enviando, entregue, erro) e, para respostas do agente, identificador da requisição, rota, métricas e trace.
- **Conversa**: sequência de mensagens e cartões de uma sessão, vinculada ao identificador de conversa do servidor e à URL da API em uso.
- **Passo de raciocínio (evento do trace)**: tipo, etapa do fluxo e conteúdo específico do tipo (texto; ferramenta e argumentos; etapas do plano; rota e motivo; modelos de origem/destino e motivo).
- **Ação pendente / Cartão de aprovação**: identificador da ação, ação e alvo, parâmetros, motivo do agente, estado (pendente, enviando, aprovado, negado, expirado, erro), horário da decisão e resultado.
- **Configuração local**: URL da API e preferência de tema, guardadas no navegador da pessoa.
- **Lista de origens autorizadas**: configuração da API com as origens que podem chamá-la do navegador.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma pessoa de plantão que nunca usou a war room envia a primeira pergunta e lê a resposta em menos de 1 minuto após abrir a página, sem instruções.
- **SC-002**: A partir de qualquer resposta, a pessoa chega ao raciocínio completo com 1 clique (ou 1 tecla) e identifica qual ferramenta foi usada em menos de 10 segundos.
- **SC-003**: 100% das execuções de "resolver incidente" e "esquecer preferência" passam por cartão aprovado; 0 execuções dessas ações sem aprovação registrada, e 0 execuções de ação negada.
- **SC-004**: 100% das classes de erro da API e a falha de conexão produzem uma mensagem específica com ação sugerida; nenhuma produz tela em branco.
- **SC-005**: Trocar o ambiente da API leva menos de 30 segundos pela engrenagem, sem recompilar ou republicar.
- **SC-006**: A war room publicada sob `/opspilot/` carrega sem recursos quebrados em acesso direto e recarregamento de qualquer rota interna.
- **SC-007**: Nenhuma origem fora da lista autorizada recebe permissão de acesso entre origens nos testes.
- **SC-008**: Zero violações de nível A/AA em verificação automatizada de acessibilidade nos temas claro e escuro, e todos os fluxos principais concluídos só com teclado.
- **SC-009**: Clientes existentes da API (CLI, testes, MCP) continuam funcionando sem alteração.

## Assumptions

- A war room é uma aplicação de página única dentro de `web/`, com a pilha indicada pela pessoa solicitante (Vite + React + TypeScript); detalhes técnicos ficam para o plano.
- A constituição hoje lista apenas a pilha do servidor; o plano deve tratar a inclusão da pilha de interface (emenda da constituição ou registro de exceção justificada) e a estratégia de testes da interface, mantendo `npm run typecheck`/`npm run test` verdes.
- Não há autenticação nesta versão: a war room é usada em rede confiável/interna; controle de acesso fica fora de escopo. A identificação de usuário (memória semântica) não é enviada nesta versão.
- O endereço padrão da API é definido na publicação (padrão de desenvolvimento: a API local na porta 3000).
- A conversa é mantida apenas durante a sessão da aba; listar ou retomar conversas antigas está fora de escopo.
- A escolha manual de estratégia e a opção de reflexão não são expostas na interface nesta versão; o roteador do agente decide.
- O trace exibido é o devolvido na própria resposta de chat; a consulta posterior por identificador de requisição pode ser usada como complemento, mas não é requisito.
- O painel de estatísticas e alertas em tempo real ficam fora do escopo desta feature.
- A lista de origens autorizadas é configurada por variável de ambiente da API, sem ler ou versionar `.env`.

## Clarifications

### Session 2026-10-14

- Q: O que esta feature entrega do lado da API para o 202? → A: API + war room — a API passa a pausar ações sensíveis, responder 202 e aceitar a decisão.
- Q: Quais ações exigem aprovação? → A: Somente resolver incidente (`resolve_incident`) e esquecer preferência (`forget_preference`); abrir incidente continua imediato.
