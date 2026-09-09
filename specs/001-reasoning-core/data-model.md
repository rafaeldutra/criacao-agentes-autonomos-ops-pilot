# Data Model: Núcleo de raciocínio do OpsPilot

## Service

- `id`: identificador único.
- `name`: nome único do serviço monitorado.
- `description`: descrição opcional.

## Alert

- `id`: identificador único.
- `serviceId`: serviço relacionado.
- `status`: `firing` ou `resolved`.
- `severity`: severidade enumerada.
- `title`: resumo do alerta.
- `createdAt`: instante de criação.
- `resolvedAt`: instante opcional de resolução.

## Incident

- `id`: identificador único.
- `title`: título obrigatório.
- `serviceId`: serviço relacionado.
- `severity`: severidade enumerada.
- `status`: `open` ou `resolved`.
- `createdAt`: instante de abertura.
- `resolvedAt`: instante opcional de resolução.

### Incident state transitions

```text
open ──resolve_incident──> resolved
```

Resolver um incidente inexistente ou já resolvido produz erro de domínio.

## ReasoningStrategy

- `name`: identificador legível da estratégia.
- `run(input, options)`: executa a entrada com limite de iterações e retorna `answer`, `trace` e `metrics`.

## TraceEvent

Evento discriminado por `type`:

- `thought`: conteúdo textual do raciocínio exposto pela estratégia.
- `action`: ferramenta chamada, argumentos e, opcionalmente, identificador da chamada.
- `observation`: resultado retornado por uma ferramenta.
- `plan`: lista ordenada de passos planejados.
- `critique`: revisão do resultado ou do plano.
- `answer`: resposta final ao operador.

## Metrics

- `llmCalls`: inteiro não negativo de chamadas ao modelo.
- `latencyMs`: latência total não negativa em milissegundos.

## PlanStep

- `id`: posição ou identificador do passo.
- `description`: objetivo do passo.
- `tool`: ferramenta a executar, quando aplicável.
- `args`: argumentos validados da ferramenta.
- `status`: `pending`, `completed` ou `failed`.

## Seed requirements

O seed primário contém exatamente cinco serviços e seis alertas: três com status `firing` e três com status `resolved`. Os dados devem ser recriáveis sem duplicação quando o seed for executado novamente.

## Local persistence

Durante esta fase, `data/seed.json` é a única fonte local de dados. O store carrega esse arquivo ao iniciar e as tools operam sobre uma cópia em memória, permitindo que o modelo leia alertas e serviços existentes e adicione incidentes durante a execução sem depender de MySQL.
