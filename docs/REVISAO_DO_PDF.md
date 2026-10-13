# Revisão do PDF “Open Dot — Projeto mestre v0.4”

Revisão feita em 13/10/2026, com o PDF lido por completo (70 páginas, incluindo as 9 imagens: capa, layout aprovado, rotinas, estudo do personagem, funções e acessórios e as quatro pranchas do catálogo original). Os pontos que mudam com o tempo foram conferidos na documentação oficial nesse mesmo dia.

**Ordem de prioridade aplicada:** as instruções explícitas do João vêm primeiro. Depois vêm as decisões finais do PDF (capítulos 36 a 42), depois os capítulos 01 a 35 e, por último, os anexos históricos.

Legenda da coluna “Decisão”: **Mantida**, **Corrigida** (o PDF é ajustado), **Adiada** (fica para uma fase posterior) ou **Nova** (ponto que o PDF não cobre).

## 1. Personagem e arte

| # | Requisito (pág.) | Decisão | Motivo técnico | Impacto no produto e no custo | Fonte | Critério de aceite |
|---|---|---|---|---|---|---|
| A1 | Absorção substitui a fenda por “depressão luminosa temporária”; nenhum elemento facial novo (p. 40, 43) | **Corrigida** | Instrução do João: o pequeno tracinho de entrada de arquivos no alto da cabeça faz parte do catálogo (p. 67 e 70) e é uma abertura de absorção, não uma boca. | O `Slot` é permanente, discreto e fica acima dos olhos. Na absorção, a forma `Absorb_Receive` aprofunda a região e o runtime acende o tracinho. Custo zero. | Catálogo, p. 67 e 70 | O tracinho aparece em todos os estados e não fica abaixo dos olhos. Nenhum nó se chama boca. O validador recusa `mouth`/`brow`. |
| A2 | Sem boca e sem sobrancelhas (p. 21, 40) | Mantida | Regra absoluta do catálogo. | Expressão só pelos olhos, pela inclinação e pelo blush. | p. 21, 40, 68 | `validate_glb.py` falha se existir um nó de boca ou sobrancelha. A prévia 2D não tem boca. |
| A3 | Silhueta: estudo raster em forma de “feijão” (p. 21) × catálogo “caixa macia” (p. 67) × cap. 17 (1,00 × 0,80 × 0,62) | **Corrigida** | O PDF manda adotar o catálogo como referência de silhueta. A vista lateral do catálogo mostra profundidade próxima de 0,7. | O corpo é uma superelipse (topo em arco, base achatada) com 1,00 × 0,80 × 0,70. Isso continua sendo proposta até a aprovação artística sobre o render do Blender. | p. 4, 21, 67 | Folha frente/¾/lado gerada pelo próprio `.blend` e aprovada pelo João. |
| A4 | Olhos a 35% da altura e separação de 0,25 (p. 21) | **Corrigida** (ajuste) | No catálogo os olhos ficam mais baixos e mais afastados. Adotado 30% de altura e 0,30 de separação, como meio-termo a ser aprovado. | Só visual. Os valores ficam em `blender/dot_spec.py`. | p. 21, 67 | Reconhecível em 32, 64 e 160 px (renders `poster-frente-*`). |
| A5 | Nós `Eye_L` e `Eye_R` separados (p. 24) | **Corrigida** | No Blender 4.4+ as Actions passaram a ter “slots”. Dois datablocks de shape keys complicam a exportação dos clipes. Uma malha `Eyes` com morphs por olho (`Blink_L`, `Blink_R` etc.) mantém a independência com um único datablock. | O contrato do manifesto lista os morphs por olho. O runtime controla cada olho pelo peso do morph. | p. 24-26, 30; B02/B06 do PDF | O manifesto lista os morphs e o validador confere todos. |
| A6 | Catálogo de clipes com nomes únicos (p. 27) | **Corrigida** | Camadas disjuntas, como o próprio PDF pede (p. 30): `body_*` anima o rig e `face_*` anima os morphs. Os estados (sucesso, erro…) combinam as duas camadas pelo `STATE_MAP`. | Evita duas Actions com o mesmo nome e permite rodar o corpo e o rosto ao mesmo tempo sem disputa. | p. 26, 27, 30 | O GLB exportado contém exatamente os clipes do manifesto (validador). |
| A7 | Erro em vermelho, aprovação em âmbar, Correio azul, Código lavanda, Sentinela ciano, sucesso menta breve (p. 42) | Mantida | — | Implementado no resolvedor visual único (`packages/core/src/visual.ts`). | p. 42 | Testes: erro recente não é apagado por sucesso antigo; troca direta para vermelho, sem mistura. |
| A8 | Sem badge permanente acima da cabeça (p. 21, 40) | Mantida | O “Dot” do Mascot Desk tem indicador flutuante e mãos. Ele é **outro personagem** e não foi reaproveitado. | — | p. 21, 40 | Nenhum socket ou malha fixa acima da cabeça. O `Socket_FX` é só para efeitos transitórios. |
| A9 | Blender 4.5 LTS, versão fixada após `--version` (p. 24) | Mantida | Instalado no Mac: **Blender 4.5.14**. O 4.5 LTS é a última versão com suporte oficial a Mac Intel, suportada até 2027. | O pipeline avisa quando a versão é diferente de 4.5. | devtalk.blender.org (remoção do Intel no 5.0) | `run_blender.py preflight` mostra 4.5.x. |
| A10 | Integração Cursor ↔ Blender por MCP (p. 31) | **Adiada** | A linha de comando reproduzível resolve sem expor uma porta. Não há benefício concreto agora. | Sem servidor extra. | p. 31 | O fluxo inteiro roda por `npm run blender:build`. |
| A11 | Corações com ciclo de vida independente; no máximo 6; intervalo de 2,5 s (p. 28) | Mantida | — | `HeartEmitter` no core. | p. 28 | Testes: cancelar um coração não afeta os outros; sem fila; com movimento reduzido, no máximo 1 parado. |
| A12 | Fallback CSS/2D não substitui o modelo final (p. 5, 38) | Mantida | — | A prévia 2D tem o selo “2D” e a página Mascote diz que o modelo 3D está pendente. | p. 5, 38 | O STATUS não declara o Dot 3D pronto sem GLB exportado e aberto no runtime. |

## 2. Interface

| # | Requisito (pág.) | Decisão | Motivo técnico | Impacto | Fonte | Critério de aceite |
|---|---|---|---|---|---|---|
| U1 | Texto 13–14 px (cap. 04) × corpo 15/22 px (cap. 37) | **Corrigida** → 15/22 | O cap. 37 prevalece. | — | p. 8, 41 | Tokens em `styles.css`. |
| U2 | Raios 7–11 e 13–17 (cap. 04) × 8–12 e 16 (cap. 37) | **Corrigida** → 10 e 16 | O cap. 37 prevalece. | — | p. 8, 41 | — |
| U3 | “Inter Variable local” (p. 8) | **Corrigida** | O arquivo variável não estava disponível offline. Foi usada a Inter 4.0 estática (400/500/600), recortada para latim/português, em WOFF (~25 KB cada), com a licença OFL junto. | Visual equivalente e menos bytes. | rsms.me/inter | Teste de interface confirma a Inter carregada localmente, sem CDN. |
| U4 | Agentes Foco e Social na navegação (p. 7, 23) | **Adiada** | O protótipo os mostrava, mas não há função real. Você pediu para não deixar botões que não fazem nada. | A barra lateral mostra Dot, Correio, Código e Sentinela. | p. 7, 23 | Nenhum item navegável sem função. |
| U5 | “Preparar resposta” no resumo (p. 41) | **Adiada** | Exige `gmail.compose` (escopo restrito) e um novo consentimento. Fica na fase de escrita com aprovação. | O resumo oferece “Abrir e-mail”. | p. 11, 41 | O botão só aparece quando o rascunho existir de verdade. |
| U6 | Estados: vazio, carregando, parcial, antigo, sem permissão, cota, erro, desconectado (p. 8) | Mantida | — | Implementados: carregando (esqueleto), vazio com ação, offline (últimos dados + horário), falha parcial (lista do que não atualizou), reconexão do Gmail, cobertura parcial, demonstração rotulada e configuração incompleta. | p. 8, 45 | `npm run test:ui` (36 verificações). |
| U7 | 320 px, zoom 200%, teclado, contraste, movimento reduzido (p. 8, 41) | Mantida | — | Sem rolagem horizontal em 320/390 px nem com zoom 200%. Link para pular ao conteúdo, foco visível, ⌘K. | p. 41; W3C (S35, S36) | Teste de interface. A auditoria com leitor de tela real continua pendente. |
| U8 | React + Vite (p. 16, 49) | **Corrigida** | Nesta sessão não havia acesso ao registro npm para instalar o Vite. O esbuild (o mesmo motor que o Vite usa) estava disponível e cobre o build estático e o modo de desenvolvimento. | Uma dependência a menos. Dá para migrar para o Vite depois sem mudar o código React. | — | `npm run build` gera `apps/web/dist`. |

## 3. Arquitetura, hospedagem e custo

| # | Requisito (pág.) | Decisão | Motivo técnico | Impacto | Fonte (13/10/2026) | Critério de aceite |
|---|---|---|---|---|---|---|
| H1 | UI estática + Workers + Turso (p. 45, 48) | Mantida | Workers Free: 100 mil req/dia, 10 ms de CPU por requisição e por cron, 128 MB, **5 Cron Triggers por conta**, **50 subrequisições por invocação**. | Um único Worker serve a interface, a API e o cron. R$ 0 dentro das franquias. | developers.cloudflare.com/workers/platform/limits | Deploy com `wrangler.jsonc` e smoke test em `/api/health`. |
| H2 | Cloudflare Queues como transporte (p. 17, 48) | **Corrigida** (removida do MVP) | O banco já é a autoridade (runs, lease, CAS, chave única por slot). A fila acrescentaria um serviço, 10 mil operações/dia e retenção de 24 h sem benefício para um único usuário. | Menos uma peça para falhar. A fila pode voltar depois, se houver carga real. | developers.cloudflare.com/queues/platform/pricing | Cron repetido não duplica a revisão (teste). |
| H3 | Limite de 50 subrequisições (o PDF não cobre) | **Nova** | Cada mensagem do Gmail é uma chamada. | Teto de 40 por tique. Os metadados são buscados em lotes de até 15; o restante fica pendente e continua no próximo tique. | idem H1 | Teste: falha parcial não perde mensagens; o cursor só avança quando tudo foi registrado. |
| H4 | 10 ms de CPU (p. 20, 59) | Mantida como **risco** | AES-GCM, parse de JSON e zod contam CPU. Ainda não foi medido no Cloudflare. | Se passar do limite, reduzir o lote por tique. | idem H1 | Medir o p95 de CPU no painel após o deploy. |
| H5 | Turso existente (p. 49) | **Corrigida** | O Mac tem projetos com Turso (SafeWear). O Open Dot usa um **banco separado**. O script de migração **recusa** banco com tabelas de outros projetos. A inspeção é somente leitura. | Nenhum risco aos dados do SafeWear. | turso.tech/pricing: Free 100 bancos, 5 GB, 500 mi leituras e 10 mi escritas/mês, PITR de 1 dia; excedentes “cobrados automaticamente **quando habilitados**” | Manter overages desligados. `db:migrate --remote` aborta em banco compartilhado. |
| H6 | Vercel Hobby e Render (p. 45) | Mantida (não usados) | Cron Hobby diário; Render dorme. | Um provedor de infraestrutura a menos. | p. 45 | — |
| H7 | Distribuição desktop assinada a custo zero (p. 34, 57) | Mantida (sem promessa) | A notarização exige uma conta paga da Apple. | O build pessoal local é viável; a distribuição não. | p. 34, S39 | — |

## 4. Integrações

| # | Requisito (pág.) | Decisão | Motivo técnico | Impacto | Fonte (13/10/2026) | Critério de aceite |
|---|---|---|---|---|---|---|
| I1 | Gmail **ou** Outlook (p. 10-11) | **Gmail** | A conta do João é Gmail. Implementar dois provedores agora não se justifica. | Outlook adiado. | — | Um único provedor de ponta a ponta. |
| I2 | Modo Testing gera refresh token de 7 dias (p. 11, 53) | **Corrigida** (configuração definida) | Confirmado: app “Testing” com escopos além de nome/e-mail recebe refresh token de 7 dias. Para não exigir login toda semana: publicar o app como **“Em produção”** sem verificação (exceção de uso pessoal: poucos usuários, todos conhecidos), aceitando a tela de “app não verificado”. | Uma reautorização só em caso de revogação, troca de senha (com escopo Gmail), 6 meses sem uso ou mais de 100 tokens no mesmo cliente. | developers.google.com/identity/protocols/oauth2; …/restricted-scope-verification | Após publicar, o refresh token continua válido depois de 7 dias. |
| I3 | `gmail.readonly` é restrito (p. 11) | Mantida | Confirmado: `gmail.readonly`, `metadata`, `compose` e `modify` são **restritos**; `gmail.send` é sensível. | Começar só com leitura. | developers.google.com/workspace/gmail/api/auth/scopes | O consentimento pede só `openid email gmail.readonly`. Teste: escopo negado não vira conexão. |
| I4 | O que ler do e-mail (p. 11) | **Nova** (mais restritiva) | Só metadados (`format=metadata`: remetente, assunto, data, List-Unsubscribe, Precedence) e o trecho curto (`snippet`). O corpo e os anexos não são baixados. | A classificação fica menos informada; em troca, há menos dados privados guardados e enviados. A cobertura informa os campos lidos. | p. 11 | A faixa de cobertura lista “Lido: remetente, assunto, trecho curto”. |
| I5 | Push com Pub/Sub (p. 11, 53) | **Adiada** | Exige billing. Polling de 5 minutos atende às revisões das 08h e 17h. | R$ 0. | p. 53 (S26/S27) | — |
| I6 | GitHub App, token de 1 h, assinatura HMAC (p. 12) | Mantida | Confirmado: token de instalação de 1 h, restringível por repositório e permissão; `X-Hub-Signature-256` com `sha256=` e comparação em tempo constante. | Webhook implementado e testado com eventos simulados. A geração do token está implementada, mas sem teste real. | docs.github.com (installation token; validating webhook deliveries) | Testes: assinatura inválida → 401; entrega duplicada ignorada; evento antigo não regride. |
| I7 | Vercel: account webhooks Pro/Enterprise (p. 14, 53) | Mantida | Confirmado na doc oficial. | Consulta a `GET /v7/deployments` a cada ~15 min, só leitura. Nada de redeploy ou rollback. | vercel.com/docs/webhooks; vercel.com/docs/rest-api/deployments | Deploy com estado ERROR gera um item no feed com “logs não lidos”. |
| I8 | Monitor HTTP (p. 14, 53) | Mantida | — | Até 3 sites, apenas HTTPS, allowlist, redirecionamentos revalidados, bloqueio de IP privado/metadata, incidente após 3 falhas e encerramento após 2 sucessos. | — | Testes de SSRF e de abertura/fechamento de incidente. |

## 5. IA e agentes

| # | Requisito (pág.) | Decisão | Motivo técnico | Impacto | Fonte (13/10/2026) | Critério de aceite |
|---|---|---|---|---|---|---|
| IA1 | OmniRoute (p. 44) | Mantida a recomendação do PDF | Não instalar. Um adapter TypeScript próprio cobre allowlist, capacidade, privacidade, orçamento, 429, timeout e circuit breaker. | Nenhum processo extra. | github.com/diegosouzapw/OmniRoute | — |
| IA2 | Groq como primeiro candidato (p. 50) | Mantida | Tabela Free conferida para gpt-oss-20b/120b: 30 RPM, 1K RPD, 8K TPM, 200K TPD. ZDR: “All customers may enable” (a página não detalha o plano Free). | **E-mail privado só vai ao Groq depois que o João ativar o ZDR na conta** e definir `GROQ_ZDR_CONFIRMED=true`. Até lá, a triagem é por regras. | console.groq.com/docs/rate-limits; /docs/your-data | Teste: sem ZDR, e-mail privado não é roteado. |
| IA3 | Gemini Free (p. 44, 50) | Mantida (excluído de dados privados) | Confirmado: os termos dizem para não enviar conteúdo pessoal e permitem revisão humana. | Não entra na allowlist. | ai.google.dev/gemini-api/terms | — |
| IA4 | Teto de 100 mil tokens e 100 chamadas/dia (Anexo A) × 50 chamadas (cap. 40) | **Corrigida** → 50 chamadas e 100 mil tokens | O cap. 40 prevalece sobre o anexo. | Configurável (`AI_CALLS_PER_DAY`, `AI_TOKENS_PER_DAY`). | p. 44, 51 | Reserva atômica no banco: testes com reservas concorrentes no último saldo. |
| IA5 | Supervisor determinístico; conteúdo externo não autoriza nada (p. 19, 44) | Mantida | — | `authorizeTool` e `sanitizeUntrusted`. Citações da IA validadas contra IDs reais. | — | Testes de injeção e de ID inventado. |

## 6. Dados e segurança

| # | Requisito (pág.) | Decisão | Motivo técnico | Impacto | Critério de aceite |
|---|---|---|---|---|---|
| D1 | Retenção da auditoria: 90 dias (cap. 15) × 30 (Anexo A) | **Corrigida** → 90 | O capítulo principal prevalece sobre o anexo. | Evidências 7 dias, resumos 30, auditoria sem conteúdo 90. | `applyRetention` roda de hora em hora. |
| D2 | Tokens cifrados com chave versionada fora do banco (p. 19, 54) | Mantida | AES-256-GCM, `TOKEN_KEYS` com rotação e AAD por registro. | Remetente, assunto e trecho também cifrados. | Teste: o refresh token não aparece em texto no banco. |
| D3 | Login separado do consentimento do serviço (p. 19, 60) | Mantida | Google OIDC com PKCE, state e nonce. Dono único por `sub` estável (ou e-mail verificado no primeiro acesso). | Entrada local de desenvolvimento só em `localhost` com `APP_ENV=development`. | Testes de state reaproveitado, sessão trocada, CSRF e isolamento por dono. |
| D4 | Estrutura de pastas (cap. 12) × lista do João | **Corrigida** | As instruções do João prevalecem: `blender/`, `assets/dot/`, `apps/worker/migrations/`. Sem `packages/mascot` vazio enquanto não houver runtime 3D. | — | — |
| D5 | Base anterior “v0.2” com 12 + 4 testes e QA.md (p. 5, 36, 58) | **Corrigida** | Essa base **não foi encontrada** no Mac (procurei em Documentos, Mesa, Downloads e openmascot). Foi recriada do zero a partir do PDF. | — | — |
| D6 | Nome “Open Dot” (p. 37, 47) | **Adiada** | Existe `composio-community/open-dot`. O nome segue provisório. | Decidir antes de publicar algo. | — |

## Fontes consultadas em 13/10/2026

- Cloudflare Workers, limites: https://developers.cloudflare.com/workers/platform/limits/
- Cloudflare Queues, preços: https://developers.cloudflare.com/queues/platform/pricing/
- Cloudflare Cron Triggers: https://developers.cloudflare.com/workers/configuration/cron-triggers/
- Turso, planos: https://turso.tech/pricing
- Turso, API HTTP: https://docs.turso.tech/sdk/http/reference
- Google OAuth (refresh token): https://developers.google.com/identity/protocols/oauth2
- Google, verificação de escopos restritos: https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- Gmail, escopos: https://developers.google.com/workspace/gmail/api/auth/scopes
- Groq, limites: https://console.groq.com/docs/rate-limits
- Groq, dados: https://console.groq.com/docs/your-data
- Gemini, termos: https://ai.google.dev/gemini-api/terms
- GitHub, token de instalação: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
- GitHub, validação de webhooks: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
- Vercel, webhooks: https://vercel.com/docs/webhooks
- Vercel, deployments: https://vercel.com/docs/rest-api/deployments
- Cursor, regras: https://cursor.com/docs/rules
- Blender, fim do Intel no 5.0: https://devtalk.blender.org/t/deprecation-and-removal-of-macos-intel-builds-in-blender-5-0/38835
