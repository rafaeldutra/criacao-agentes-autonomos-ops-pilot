# Research: Núcleo de raciocínio do OpsPilot

## Decision: Usar um contrato próprio para estratégias e traces

**Rationale**: ReAct e Plan-and-Execute possuem estados internos diferentes, mas a arena precisa comparar ambos por `answer`, `trace` e `metrics`. Um tipo discriminado comum reduz acoplamento e torna a formatação testável.

**Alternatives considered**: Expor diretamente o estado interno de cada grafo, rejeitado porque dificultaria a comparação e criaria contratos diferentes para consumidores.

## Decision: Criar o modelo OpenRouter em uma única fábrica

**Rationale**: Centralizar `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `baseURL` e `temperature: 0` evita configurações divergentes entre estratégias e permite substituir o modelo nos testes.

**Alternatives considered**: Instanciar clientes em cada estratégia, rejeitado por duplicação e risco de configurações inconsistentes.

## Decision: Usar ferramentas LangChain com schemas Zod

**Rationale**: Schemas Zod validam a fronteira das tools e fornecem os metadados necessários para tool calling. O mesmo serviço de domínio pode ser chamado diretamente pelos testes determinísticos.

**Alternatives considered**: Validar apenas dentro dos grafos, rejeitado porque chamadas diretas às ferramentas ficariam sem proteção.

## Decision: Usar `data/seed.json` como fonte local e store em memória

**Rationale**: A arena, o modelo e os testes precisam de dados previsíveis e não podem depender de rede ou banco externo. O JSON fornece a base compartilhada e o store em memória permite mutações de incidentes durante a execução.

**Alternatives considered**: Usar MySQL neste momento, rejeitado por tornar testes lentos, frágeis e dependentes de ambiente.

## Decision: Controlar limites no orquestrador de cada estratégia

**Rationale**: O limite de iterações deve ser aplicado mesmo quando o modelo não encerra naturalmente. Plan-and-Execute terá ainda o limite fixo de oito passos para proteger o custo e garantir encerramento.

**Alternatives considered**: Delegar limites apenas às configurações do LangGraph, rejeitado porque não cobre igualmente o grafo de replanning nem fornece uma métrica uniforme.
