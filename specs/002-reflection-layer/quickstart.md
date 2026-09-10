# Reflection Layer Quickstart

## Prerequisites

- Node.js 22 LTS
- Dependencies installed with `npm install`
- No OpenRouter credentials required for deterministic tests

## Deterministic validation

Run:

```powershell
npm run typecheck
npm run test
```

The reflection tests should verify:

1. An approved first critique stops after one critique event.
2. A rejected critique causes regeneration with feedback in context.
3. A rejected final attempt returns the last answer and respects `maxReflections`.
4. Metrics include critic and regeneration calls.
5. Critique events preserve order and do not mutate the base trace.
6. The Arena resolves both reflection aliases.

## Live Arena validation

With `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` available through the existing Arena command:

```powershell
npm run arena -- reflect:react "liste os alertas firing e resuma o risco"
npm run arena -- reflect:plan-and-execute "abra um incidente para o alerta crítico do worker"
```

Expected output contains the selected strategy heading, at least one `[critique]` line, the final answer, and metrics whose `llmCalls` include review work.
