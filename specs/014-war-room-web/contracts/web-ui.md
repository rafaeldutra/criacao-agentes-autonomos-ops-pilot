# Contract: War Room (interface)

Regras de design: [.github/instructions/design.instructions.md](../../../.github/instructions/design.instructions.md). Este contrato fixa a **estrutura** e os **nomes acessíveis** usados nos testes.

## Publicação

- Caminho base: `/opspilot/`. Todos os assets são resolvidos sob esse prefixo.
- Rota única: `/opspilot/` (e `/opspilot/index.html`). O servidor estático deve devolver `index.html` para `/opspilot/*`.
- Variável de build: `VITE_OPSPILOT_API_URL` (padrão `http://localhost:3000`).

## Layout (landmarks)

```text
<header>  "OpsPilot — War Room"  [Nova conversa]  [⚙ Configurações]
<main>
  <section aria-label="Conversa">  lista de mensagens (role="log", aria-live="polite")
  <form aria-label="Enviar mensagem">  <textarea label="Mensagem">  [Enviar]
<aside / dialog aria-label="Raciocínio">   (painel lateral ≥ 1024px; diálogo em tela cheia abaixo)
<dialog aria-labelledby="settings-title">  Configurações
```

## Componentes e nomes acessíveis

| Componente | Elemento / nome acessível | Comportamento |
|------------|---------------------------|---------------|
| Enviar | `button` "Enviar" | desabilitado com texto vazio, resposta pendente ou cartão pendente; `Ctrl/Cmd+Enter` envia |
| Estado vazio | heading "Como posso ajudar no plantão?" + 3 `button` de exemplo | clicar preenche e envia |
| Mensagem do agente | `article` com o texto (markdown seguro), horário em `<time>`, `button` "Ver raciocínio" | |
| Erro | `role="alert"`: título, descrição, `button` "Tentar novamente", detalhe "ID da requisição" com `button` "Copiar" | sem stack trace |
| Painel de raciocínio | `dialog`/`complementary` "Raciocínio", resumo de métricas no topo, `ol` de passos | `Esc` fecha e o foco volta ao gatilho |
| Passo | `li` com rótulo textual do tipo (Rota, Pensamento, Ação, Observação, Plano, Crítica, Troca de modelo, Resumo, Resposta, "Evento: <type>") + etapa (Contexto, Roteador, ReAct, Plano e execução, Reflexão, Resposta) | conteúdo > 600 caracteres recolhido com `button` "Mostrar tudo"; args em `pre` JSON formatado |
| Cartão de aprovação | `article` "Aprovação necessária": ação em linguagem clara ("Resolver incidente inc-123" / "Esquecer preferência"), parâmetros (`dl`), motivo, `button` "Aprovar" e `button` "Negar" | estados de [data-model.md](../data-model.md#approvalcard); mudanças anunciadas via `role="status"` |
| Configurações | `dialog` "Configurações": `input type="url"` "URL da API", `button` "Testar conexão", "Restaurar padrão", `radiogroup` "Tema" (Claro, Escuro, Sistema), "Salvar", "Cancelar" | erro junto ao campo via `aria-describedby` |

## Testar conexão

`GET <apiUrl>/stats?since=1m` com timeout de 5 s. Resultados: "API respondeu", "Não foi possível alcançar a API (verifique a URL ou se ela está no ar)" ou "A API recusou esta origem (CORS)". O caso CORS é inferido por falha de rede com a origem não listada; a mensagem sugere configurar `OPSPILOT_CORS_ORIGINS`.

## Tempos

- Indicador "processando" aparece após 300 ms. Após 10 s, mostra "Ainda trabalhando…" com `button` "Parar de esperar" (aborta o `fetch`; a mensagem fica com o erro "Espera cancelada" e a opção de reenviar).
- Timeout do cliente: 190 s, acima dos 180 s da API.
