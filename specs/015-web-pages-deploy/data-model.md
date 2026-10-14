# Data Model: Publicação da War Room no GitHub Pages

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md)

Sem persistência nova. As "entidades" são configurações de build e de fluxo.

## BuildConfig (web, em tempo de build)

| Campo | Origem | Regra | Padrão |
|-------|--------|-------|--------|
| `base` | `VITE_BASE` | `resolveBase(raw)`: trim; vazio → padrão; adiciona `/` inicial e final; rejeita `..`, `//`, `:` (esquema) e espaços → erro de build com mensagem clara | `/opspilot/` |
| `defaultApiUrl` | `VITE_OPSPILOT_API_URL` | `resolveDefaultApiUrl(raw)`: trim; vazio ou inválido para `parseApiUrl` → padrão | `http://localhost:3000` |

Exemplos de `resolveBase`:

| Entrada | Saída |
|---------|-------|
| `undefined`, `""`, `"  "` | `/opspilot/` |
| `/criacao-agentes-autonomos-ops-pilot/` | igual |
| `criacao-agentes-autonomos-ops-pilot` | `/criacao-agentes-autonomos-ops-pilot/` |
| `/a/b` | `/a/b/` |
| `../x`, `//evil`, `https://x/` | erro |

## Artefato do Pages

O conteúdo de `web/dist/`: `index.html`, `404.html` (cópia idêntica de `index.html`) e `assets/*`, todos referenciados sob `base`.

## Fluxo `pages.yml` (estados de uma execução)

```text
trigger ──▶ build (typecheck → test → build → upload artifact)
              │ falha ─────────────────────────────▶ fim (nada publicado)
              │ ok + PR ───────────────────────────▶ fim (artefato não implantado)
              │ ok + push/dispatch em master ──────▶ deploy (serializado) ──▶ page_url
```

## CorsDecision (delta da 014)

`corsHeadersFor(origin, method, allowlist, requestPrivateNetwork = false)`: igual à 014, mais `Access-Control-Allow-Private-Network: "true"` **apenas** quando `method = OPTIONS`, a origem está permitida e `requestPrivateNetwork` é verdadeiro.
