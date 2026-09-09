# Tools Contract

## `list_alerts`

Input:

```ts
{ status?: "firing" | "resolved" }
```

Returns alert records. Omitting `status` returns all alerts.

## `open_incident`

Input:

```ts
{
  title: string;
  service: string;
  severity: "low" | "medium" | "high" | "critical";
}
```

Returns the created open incident.

## `resolve_incident`

Input:

```ts
{ id: string }
```

Returns the resolved incident. Unknown or already resolved IDs return a domain error.

All inputs are validated before state mutation. The store is initialized from `data/seed.json` and then operates in memory for the duration of the run.
