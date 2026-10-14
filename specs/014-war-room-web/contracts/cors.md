# Contract: CORS da API

Configuração: `OPSPILOT_CORS_ORIGINS`, uma lista de origens separadas por vírgula. Exemplo: `https://ops.exemplo.com,http://localhost:5173`.

- Cada item é validado com Zod como origem `http(s)://host[:porta]`, sem caminho, query ou credenciais. Item inválido ou `*` **impede a inicialização** com erro claro.
- Variável ausente ou vazia usa o padrão `http://localhost:5173, http://127.0.0.1:5173, http://localhost:4173, http://127.0.0.1:4173`.

Decisão (função pura `corsHeadersFor(origin | undefined, method, allowlist)`):

| Situação | Resposta |
|----------|----------|
| Sem cabeçalho `Origin` | Nenhum cabeçalho CORS; fluxo inalterado |
| `Origin` permitida, requisição simples | Segue para o handler, com `Access-Control-Allow-Origin: <origin>`, `Vary: Origin` e `Access-Control-Expose-Headers: X-Request-Id` |
| `Origin` permitida, `OPTIONS` (preflight) | **204**, com os cabeçalhos acima mais `Access-Control-Allow-Methods: GET, POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type` e `Access-Control-Max-Age: 600` |
| `Origin` não permitida, requisição simples | Segue sem cabeçalhos CORS (o navegador bloqueia a leitura). Inclui `Vary: Origin` |
| `Origin` não permitida, `OPTIONS` | **403** sem cabeçalhos CORS |

Nunca é emitido `Access-Control-Allow-Origin: *` nem `Access-Control-Allow-Credentials`.

Aplicado a todas as rotas: `/chat`, `/approvals/*`, `/requests/*` e `/stats`.
