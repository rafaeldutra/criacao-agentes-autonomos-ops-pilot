# Feature Specification: Publicação da War Room no GitHub Pages

**Feature Branch**: `015-web-pages-deploy`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Deploy do web/ no Pages via Actions: upload-pages-artifact + deploy-pages, permissions, README (atualizar)"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publicação automática a cada mudança aprovada (Priority: P1)

Como mantenedora do OpsPilot, quero que, a cada mudança integrada na branch principal que afete a war room, ela seja verificada (tipos, testes e build) e publicada automaticamente no GitHub Pages do repositório, para que a versão on-line esteja sempre igual ao código aprovado, sem passos manuais.

**Why this priority**: É o objetivo da feature. Sem publicação automática, nada mais tem valor.

**Independent Test**: Integrar na branch principal uma mudança visível em `web/` (ex.: um texto do estado vazio), aguardar o fluxo terminar e abrir o endereço público: a mudança aparece e todos os recursos carregam.

**Acceptance Scenarios**:

1. **Given** uma mudança em `web/` integrada na branch principal, **When** o fluxo de publicação roda, **Then** ele verifica tipos, executa os testes da war room, gera o build e publica no GitHub Pages; o endereço público passa a servir a nova versão.
2. **Given** a verificação de tipos, os testes ou o build falham, **When** o fluxo roda, **Then** nada é publicado, a versão anterior continua no ar e a execução fica marcada como falha, com o passo que falhou visível.
3. **Given** uma mudança na branch principal que não toca `web/` nem o próprio fluxo de publicação, **When** ela é integrada, **Then** o fluxo de publicação não roda.
4. **Given** a página publicada, **When** alguém acessa o endereço público (com ou sem barra final) ou recarrega a página, **Then** a war room e todos os recursos carregam sem erro 404.
5. **Given** a publicação concluída, **When** alguém abre a execução do fluxo, **Then** o endereço público da versão publicada aparece na própria execução.

---

### User Story 2 - Verificação em pull requests sem publicar (Priority: P2)

Como pessoa que revisa código, quero que pull requests que alteram `web/` executem a mesma verificação (tipos, testes e build) **sem publicar**, para saber antes do merge se a publicação vai funcionar.

**Why this priority**: Evita quebrar a publicação na branch principal, mas a publicação (US1) funciona sem isso.

**Independent Test**: Abrir um pull request com um teste da war room quebrado: a verificação falha no PR e nada é publicado. Corrigir: a verificação passa e, ainda assim, nada é publicado até o merge.

**Acceptance Scenarios**:

1. **Given** um pull request que altera `web/`, **When** ele é aberto ou atualizado, **Then** a verificação roda e reporta sucesso ou falha no próprio PR.
2. **Given** um pull request, **When** a verificação conclui com sucesso, **Then** nenhuma publicação no Pages acontece.

---

### User Story 3 - Publicação manual e permissões mínimas (Priority: P2)

Como mantenedora, quero poder disparar a publicação manualmente (por exemplo, depois de mudar o endereço da API configurado para o build) e quero que o fluxo tenha apenas as permissões estritamente necessárias, para operar com segurança.

**Why this priority**: Necessário para trocar a configuração sem commit e para cumprir "segurança por padrão", mas não bloqueia a publicação automática.

**Independent Test**: Disparar o fluxo manualmente na branch principal e verificar que ele publica; inspecionar a definição do fluxo e confirmar que só pede leitura do conteúdo e escrita no Pages/identidade, e só na etapa de publicação.

**Acceptance Scenarios**:

1. **Given** a página de execução manual do fluxo, **When** a mantenedora o dispara na branch principal, **Then** ele verifica e publica como no disparo automático.
2. **Given** a definição do fluxo, **When** suas permissões são inspecionadas, **Then** a etapa de verificação e build tem apenas leitura do conteúdo do repositório, e somente a etapa de publicação tem permissão de escrita no Pages e de emissão de identidade para a publicação.
3. **Given** duas execuções disparadas em sequência rápida, **When** ambas tentam publicar, **Then** as publicações não se sobrepõem: uma publicação em andamento termina antes da próxima começar.
4. **Given** um disparo manual em uma branch diferente da principal, **When** a etapa de publicação é avaliada, **Then** a publicação é recusada pelo ambiente protegido do Pages.

---

### User Story 4 - Documentação atualizada (Priority: P3)

Como pessoa nova no projeto, quero que o README explique onde a war room está publicada, como a publicação funciona, a configuração única necessária no repositório e como apontar a página publicada para uma API, para conseguir usar e manter o deploy sem perguntar a ninguém.

**Why this priority**: Documentação é necessária para manter o deploy, mas não afeta o funcionamento.

**Independent Test**: Seguindo só o README, uma pessoa habilita o Pages, define o endereço da API, publica e abre a war room conversando com uma API própria.

**Acceptance Scenarios**:

1. **Given** o README da war room, **When** alguém o lê, **Then** encontra: endereço público, gatilhos do fluxo (push na principal, PR, manual), configuração única do Pages ("Source: GitHub Actions"), a variável do repositório para o endereço da API, a lista de origens que a API precisa autorizar e como verificar uma publicação.
2. **Given** a raiz do repositório, **When** alguém a abre, **Then** existe um README com uma visão geral curta do OpsPilot, os comandos principais e o link para a war room publicada e para o README da war room.

---

### Edge Cases

- Pages não habilitado ou com origem diferente de "GitHub Actions": a etapa de publicação falha com mensagem clara; o README explica a configuração.
- Endereço da API não configurado no repositório: o build usa o padrão local (`http://localhost:3000`) e a página publicada funciona contra uma API rodando na máquina de quem a abre; a engrenagem continua permitindo trocar o endereço.
- Endereço da API configurado com `http://` não local: o navegador bloqueia conteúdo misto vindo de uma página `https`; o README alerta que a API pública precisa de `https`.
- Navegadores que restringem acesso de sites públicos à rede local (ex.: chamadas da página publicada para `localhost`): a API deve aceitar a verificação prévia específica dessas chamadas quando a origem é autorizada; caso o navegador ainda bloqueie, a war room mostra o erro de conexão já existente apontando para a engrenagem.
- Origem do Pages não autorizada na API: o navegador bloqueia as chamadas; "Testar conexão" mostra "A API recusou esta origem (CORS)" e o README mostra qual origem adicionar.
- Recarregar a página publicada em um caminho interno inexistente: o Pages devolve uma página que leva de volta à war room, sem quebrar a navegação.
- Falha transitória no serviço de publicação: a execução falha sem afetar a versão no ar e pode ser reexecutada manualmente.

## Requirements *(mandatory)*

### Functional Requirements

**Fluxo de publicação**

- **FR-001**: O repositório MUST ter um fluxo automatizado que, em push na branch principal com mudanças em `web/` ou no próprio fluxo, verifica tipos, executa os testes da war room, gera o build e publica no GitHub Pages.
- **FR-002**: O fluxo MUST também rodar por disparo manual e em pull requests que alteram `web/` ou o fluxo; em pull requests ele MUST verificar e gerar o build, mas nunca publicar.
- **FR-003**: Qualquer falha de verificação, teste ou build MUST impedir a publicação e manter a versão anterior no ar.
- **FR-004**: A publicação MUST usar o mecanismo oficial de artefato e implantação do GitHub Pages, publicando exatamente o resultado do build da war room, e MUST expor o endereço publicado na execução.
- **FR-005**: Publicações MUST ser serializadas: no máximo uma publicação por vez no ambiente do Pages, sem cancelar uma publicação em andamento.
- **FR-006**: A instalação de dependências no fluxo MUST ser reprodutível (versões travadas do projeto) e usar a mesma versão de Node da constituição.

**Permissões e segurança**

- **FR-007**: As permissões padrão do fluxo MUST ser somente leitura de conteúdo; apenas a etapa de publicação MUST receber escrita no Pages e emissão de token de identidade, e somente ela MUST rodar no ambiente protegido do Pages.
- **FR-008**: O fluxo MUST NOT usar segredos para o build; o endereço da API é configuração pública (variável do repositório), nunca um segredo.

**Caminho base e configuração**

- **FR-009**: O build da war room MUST aceitar um caminho base configurável no momento do build, mantendo `/opspilot/` como padrão para hospedagem própria (feature 014).
- **FR-010**: A versão publicada no Pages MUST ser servida na raiz do site do projeto, `https://rafaeldutra.github.io/criacao-agentes-autonomos-ops-pilot/`, com todos os recursos carregando nesse caminho; o caminho base do build do Pages MUST derivar do nome do repositório (não fixo no código), para continuar correto se o repositório for renomeado.
- **FR-011**: O endereço padrão da API embutido na versão publicada MUST vir de uma variável do repositório; sem ela, MUST usar `http://localhost:3000`.
- **FR-012**: A publicação MUST incluir uma página de "não encontrado" que redireciona para a war room, para que caminhos inexistentes sob o site não quebrem a navegação.

**Compatibilidade com a API**

- **FR-013**: Quando a origem do Pages estiver autorizada na API, a verificação prévia de acesso a rede local enviada por navegadores (página pública chamando `localhost`) MUST ser aceita; origens não autorizadas continuam recusadas como na feature 014.

**Documentação**

- **FR-014**: O README da war room MUST ser atualizado com: endereço público, gatilhos do fluxo, configuração única do Pages, variável do endereço da API, origem a autorizar na API (`OPSPILOT_CORS_ORIGINS`), exigência de `https` para API pública e como verificar/reexecutar uma publicação.
- **FR-015**: MUST existir um README na raiz do repositório com visão geral do OpsPilot, comandos principais (API e war room) e links para a war room publicada e para o README da war room.

### Key Entities

- **Fluxo de publicação**: definição versionada com gatilhos (push na principal, PR, manual), etapa de verificação/build e etapa de publicação.
- **Artefato do Pages**: resultado do build da war room, incluindo a página de "não encontrado".
- **Ambiente do Pages**: ambiente protegido do repositório que recebe a publicação e registra o endereço publicado.
- **Configuração do build**: caminho base e endereço padrão da API, ambos públicos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Uma mudança em `web/` integrada na branch principal fica disponível no endereço público em até 10 minutos, sem nenhum passo manual.
- **SC-002**: 100% das execuções com falha de verificação, teste ou build terminam sem publicar; a versão anterior continua acessível.
- **SC-003**: 0 publicações a partir de pull requests.
- **SC-004**: A página publicada carrega sem nenhum recurso com erro 404, no acesso direto, com e sem barra final e após recarregar.
- **SC-005**: Apenas a etapa de publicação possui permissões de escrita; nenhuma outra etapa consegue alterar o repositório ou o Pages.
- **SC-006**: Uma pessoa nova consegue, só com o README, habilitar o Pages, configurar o endereço da API e ver a war room publicada conversando com uma API própria em menos de 15 minutos.

## Assumptions

- A feature 014 (war room em `web/`) é a base desta feature e será integrada na branch principal antes ou junto com ela.
- A branch principal do repositório é `master` (a usada localmente); se o padrão do GitHub for outra, o fluxo segue a branch padrão.
- O repositório é público ou o plano da conta permite GitHub Pages; habilitar o Pages com origem "GitHub Actions" é uma configuração única feita por quem administra o repositório (documentada no README).
- A API do OpsPilot não é publicada por esta feature; a página publicada conversa com a API configurada (padrão: API local de quem a abre).
- O endereço da API é público (vai no código entregue ao navegador); por isso é variável do repositório e não segredo.
- Os testes da API (raiz) continuam rodando localmente; este fluxo cobre só a war room. Integração contínua da API está fora de escopo.
- Domínio próprio para o Pages está fora de escopo.

## Clarifications

### Session 2026-10-14

- Q: Em qual endereço a war room deve ficar no Pages? → A: Na raiz do site do projeto (`https://rafaeldutra.github.io/criacao-agentes-autonomos-ops-pilot/`); o build do Pages usa essa base e a hospedagem própria continua com `/opspilot/`.
