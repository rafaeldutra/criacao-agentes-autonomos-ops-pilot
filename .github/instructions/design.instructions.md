---
applyTo: "web/**"
description: Regras de design de interface do OpsPilot (hierarquia, espaçamento, estados, dark mode, acessibilidade)
---

# Design de interface — OpsPilot Web

O OpsPilot é usado por quem está de plantão, muitas vezes de madrugada e sob pressão. A interface deve priorizar **leitura rápida, estado inequívoco e zero ambiguidade** sobre estética. Na dúvida, escolha o que reduz o tempo até a pessoa entender "o que está quebrado e o que eu faço agora".

## 1. Hierarquia visual

- Cada tela tem **um único foco primário**: um título (`h1`) e no máximo uma ação primária visível por vez.
- Ordem de leitura de um incidente/alerta: **severidade → status → título → serviço afetado → tempo decorrido → responsável**. Mantenha essa ordem em listas, cards e detalhes.
- Use no máximo **3 níveis de ênfase** por região: primário (conteúdo/ação principal), secundário (metadados), terciário (rótulos auxiliares, timestamps).
- Hierarquia vem primeiro de **tamanho e peso**, depois de **espaçamento**, e só por último de **cor**. Nunca dependa apenas de cor.
- Escala tipográfica fixa (não invente tamanhos):

  | Token        | Tamanho / altura de linha | Uso                              |
  | ------------ | ------------------------- | -------------------------------- |
  | `text-xs`    | 12px / 16px               | rótulos, badges, timestamps      |
  | `text-sm`    | 14px / 20px               | metadados, tabelas densas        |
  | `text-base`  | 16px / 24px               | corpo de texto (padrão)          |
  | `text-lg`    | 18px / 28px               | títulos de card/seção            |
  | `text-xl`    | 20px / 28px               | títulos de painel                |
  | `text-2xl`   | 24px / 32px               | `h1` da página                   |

- Pesos permitidos: 400 (corpo), 500 (ênfase/rótulos), 600 (títulos). Evite 700+ fora de números de destaque (KPIs).
- Números (contagens, latências, durações) usam `font-variant-numeric: tabular-nums` para não "dançar" ao atualizar.
- Headings em ordem semântica (`h1` → `h2` → `h3`), sem pular níveis para obter um tamanho visual.

## 2. Espaçamento em escala

- Use **somente** a escala base 4px. Valores fora dela são proibidos (nada de `13px`, `18px`, `22px`):

  | Token      | Valor |
  | ---------- | ----- |
  | `space-0`  | 0     |
  | `space-1`  | 4px   |
  | `space-2`  | 8px   |
  | `space-3`  | 12px  |
  | `space-4`  | 16px  |
  | `space-6`  | 24px  |
  | `space-8`  | 32px  |
  | `space-12` | 48px  |
  | `space-16` | 64px  |

- Defina a escala uma única vez como tokens (CSS custom properties ou config do framework) e consuma sempre via token.
- **Proximidade comunica relação**: espaço interno de um grupo < espaço entre grupos. Regra prática: elementos relacionados `space-2`, itens de lista/campos `space-3`–`space-4`, seções `space-6`–`space-8`.
- Padding de componentes: botões/inputs `space-2` vertical × `space-3`/`space-4` horizontal; cards `space-4` (denso) ou `space-6` (padrão).
- Gutter lateral mínimo de `space-4` (16px) em telas pequenas; sem scroll horizontal da página.
- Prefira `gap` (flex/grid) a margens em filhos. Não use margens para "consertar" alinhamento.
- Raios e bordas também em escala: raio `4px` (controles), `8px` (cards), `9999px` (pills); borda `1px`.

## 3. Estados vazios, de carregamento e de erro

Todo componente que exibe dados remotos **deve** implementar explicitamente os quatro estados: **carregando, vazio, erro e sucesso**. PR sem os quatro estados está incompleto.

### Carregando
- Use skeletons com o mesmo layout do conteúdo final (evita layout shift). Spinner só para ações pontuais (< 1 área).
- Não mostre skeleton para respostas < 300ms; após ~10s, informe que está demorando e ofereça cancelar/tentar novamente.
- Atualizações em tempo real não devem apagar o conteúdo atual: mantenha os dados antigos e indique "atualizando".

### Vazio
- Diferencie os tipos de vazio, com textos distintos:
  - **Vazio "bom"** (nenhum incidente aberto): tom positivo e calmo — "Nenhum incidente aberto. Tudo operando normalmente."
  - **Vazio por filtro**: diga o que foi filtrado e ofereça "Limpar filtros".
  - **Primeiro uso** (nada configurado): explique o próximo passo e ofereça a ação que resolve.
- Estrutura: ícone discreto (decorativo, `aria-hidden`) + título curto + uma frase + no máximo uma ação.
- Nunca deixe uma área em branco ou uma tabela só com cabeçalho.

### Erro
- A mensagem responde: **o que aconteceu, o que isso afeta e o que fazer**. Ex.: "Não foi possível carregar os alertas. A lista pode estar desatualizada. [Tentar novamente]".
- Nunca exiba stack trace, mensagem crua do backend ou códigos internos como texto principal; um ID de correlação/trace pode aparecer como detalhe copiável.
- Erro de uma região não derruba a página: isole por componente (error boundary ou equivalente).
- Erros de formulário aparecem junto ao campo, associados via `aria-describedby`, e o foco vai para o primeiro campo inválido.
- Distinga **erro da interface** (falha ao buscar dados) de **estado crítico do sistema monitorado** (incidente SEV1). Eles não podem ter a mesma aparência.
- Mensagens assíncronas (erro, sucesso, novo alerta) usam região viva: `role="alert"` para erros/urgências, `role="status"` / `aria-live="polite"` para o resto.

## 4. Dark mode

- Dark mode é cidadão de primeira classe, não um tema "extra". Toda tela deve ser verificada nos dois temas.
- Cores só via **tokens semânticos** (`--color-bg`, `--color-surface`, `--color-text`, `--color-text-muted`, `--color-border`, `--color-accent`, `--color-danger`, `--color-warning`, `--color-success`, `--color-info`). Proibido usar hex/rgb literal em componentes.
- Ordem de resolução do tema: preferência salva do usuário → `prefers-color-scheme` → claro. Aplique via atributo na raiz (`data-theme="light|dark"`) e evite flash de tema errado no carregamento.
- Defina `color-scheme: light dark` para que controles nativos e scrollbars acompanhem o tema.
- No escuro:
  - Fundo não é `#000` puro; use cinza muito escuro (ex.: ~`#0f1115`) e eleve superfícies **clareando**, não com sombra.
  - Texto principal não é `#fff` puro; use ~90% de luminosidade para reduzir ofuscamento.
  - Reduza saturação de cores de status para não "vibrarem"; mantenha o contraste mínimo (seção 5).
- Cores de severidade mantêm o **mesmo significado e ordem** nos dois temas (SEV1 > SEV2 > SEV3 > SEV4), sempre acompanhadas de rótulo textual.
- Imagens, gráficos e ícones precisam funcionar nos dois temas (use `currentColor` em SVGs; ajuste grids e eixos de gráficos por token).

## 5. Acessibilidade

Meta: **WCAG 2.2 nível AA** em todas as telas.

- **Contraste**: texto normal ≥ 4.5:1, texto grande (≥ 18.66px bold ou ≥ 24px) ≥ 3:1, componentes de UI, ícones informativos e contorno de foco ≥ 3:1 — nos **dois temas**.
- **Cor nunca sozinha**: severidade e status sempre têm texto (e preferencialmente ícone/forma). Um badge vermelho sem "SEV1" é inválido.
- **HTML semântico primeiro**: `button` para ações, `a` para navegação, `table` para dados tabulares, `nav`/`main`/`header` como landmarks. ARIA só quando não houver elemento nativo equivalente.
- **Teclado**: tudo que é clicável é alcançável e operável por teclado, em ordem lógica. Nada de `tabindex` > 0. Inclua link "Pular para o conteúdo".
- **Foco visível**: nunca remova `outline` sem substituto; use `:focus-visible` com anel de ≥ 2px e contraste ≥ 3:1.
- **Modais/diálogos**: prendem o foco, fecham com `Esc`, devolvem o foco ao gatilho e têm `aria-labelledby`.
- **Alvos de toque**: mínimo 24×24px (WCAG 2.2), recomendado 44×44px em ações frequentes.
- **Formulários**: todo campo tem `label` visível associado; placeholder não substitui label; obrigatoriedade indicada em texto.
- **Imagens e ícones**: ícones decorativos com `aria-hidden="true"`; botões só com ícone exigem `aria-label`.
- **Movimento**: respeite `prefers-reduced-motion`; nada piscando mais de 3 vezes por segundo — inclusive alertas críticos (use destaque estático + região viva, não animação piscante).
- **Tempo relativo** ("há 5 min") deve ter o horário absoluto acessível (`<time datetime="...">` + tooltip/título).
- **Zoom e reflow**: a interface funciona com zoom de 200% e em 320px de largura sem perda de conteúdo.
- **Idioma**: `<html lang="pt-BR">`.

## Checklist antes de abrir PR em `web/`

- [ ] Um foco primário por tela; ordem severidade → status → título respeitada.
- [ ] Apenas tokens de tipografia, espaçamento e cor; nenhum valor mágico.
- [ ] Estados carregando, vazio (tipo correto), erro e sucesso implementados.
- [ ] Verificado em tema claro e escuro.
- [ ] Navegável só por teclado, com foco visível.
- [ ] Contraste AA conferido nos dois temas; nenhuma informação só por cor.
- [ ] Testes de componente cobrem os estados vazio e de erro.
