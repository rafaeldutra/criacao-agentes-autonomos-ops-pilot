# Contract: configuração de build da web e delta de CORS

## Variáveis de build (`web/`)

| Variável | Uso | Padrão | Validação |
|----------|-----|--------|-----------|
| `VITE_BASE` | caminho base dos assets e do redirect sem barra | `/opspilot/` | `resolveBase` (ver [data-model.md](../data-model.md#buildconfig-web-em-tempo-de-build)); inválido → build falha |
| `VITE_OPSPILOT_API_URL` | URL padrão da API mostrada na engrenagem | `http://localhost:3000` | vazio/inválido → padrão |

Saída do build: `dist/index.html`, `dist/404.html` (idêntico) e `dist/assets/*` sob `base`.

## CORS: delta da 014 (`specs/014-war-room-web/contracts/cors.md`)

| Situação | Resposta |
|----------|----------|
| `OPTIONS` de origem permitida com `Access-Control-Request-Private-Network: true` | 204, cabeçalhos da 014 + `Access-Control-Allow-Private-Network: true` |
| `OPTIONS` de origem permitida sem esse cabeçalho | inalterado (sem `Allow-Private-Network`) |
| `OPTIONS` de origem não permitida (com ou sem o cabeçalho) | 403, sem cabeçalhos CORS |

Para a página publicada, a origem a autorizar é `https://rafaeldutra.github.io` (origem é esquema + host, sem o caminho do repositório).
