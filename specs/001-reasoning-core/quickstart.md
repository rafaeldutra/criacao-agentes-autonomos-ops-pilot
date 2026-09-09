# Quickstart: Núcleo de raciocínio do OpsPilot

## Prerequisites

- Node.js 22 LTS.
- Dependencies installed with `npm install`.
- OpenRouter credentials only for live strategy execution:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL`

Deterministic tests and the seed do not require network access or credentials.

## Seed local

Execute o script de seed para recriar o estado de demonstração:

```powershell
npm run seed
```

Expected result: `data/seed.json` is loaded and reports five services and six alerts, with three `firing` and three `resolved`.

## Deterministic validation

```powershell
npm run test
npm run typecheck
```

The tests cover the store and trace formatting without contacting OpenRouter.

## Arena

Run both strategies with a shared input:

```powershell
npm run arena -- --strategies react,plan-and-execute --max-iterations 8
```

The output contains one answer, ordered trace and metrics block per strategy. See [reasoning-strategy.md](./contracts/reasoning-strategy.md) and [arena.md](./contracts/arena.md) for the contracts.
