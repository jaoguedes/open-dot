# Comportamento do Dot

Descreve o que o código faz **hoje** (15/10/2026). Fontes: `packages/core/src/visual.ts` (estado semântico e prioridade), `packages/core/src/dot/states.ts` e `reactions.ts` (motor), `apps/web/src/dot/DotView.tsx` (ligação), `apps/web/src/dot/ticker.ts` (quadros), `apps/web/src/presence.ts` (quem aparece).

## Estados

| Estado (semântico) | No motor | O que se vê | Duração | Prioridade | Gatilho |
|---|---|---|---|---|---|
| repouso (`idle`) | `idle` | olhos abertos, olhar livre, flutuação suave, piscada a cada 2,5–6 s | enquanto nada mais vale | 10 | nada em andamento |
| pensando (`thinking`) | `thinking` | olhar para cima, selo de bolinhas, brilho lilás | enquanto durar | 60 | reservado: o servidor não emite hoje |
| trabalhando (`working`) | `working` | olhos focados, ondas, tremor leve, quadradinhos saindo | enquanto a execução estiver ativa há ≤ 10 min | 70 | execução `running`, `queued` ou `retry_scheduled`; também o clique em “Revisar agora” (atividade local) |
| esperando você (`waiting`) | `waiting` | olhar atento, selo “!”, brilho âmbar | até a aprovação ser decidida | 90 | execução `waiting_approval` |
| pergunta (`question`) | `question` | cabeça inclinada, selo “?” | enquanto durar | 85 | reservado (sem gatilho no servidor hoje) |
| erro (`error`) | `error` | entrada de erro (tremida), olhos bravos, “x”, metade vermelha | até a próxima execução do agente; “Dispensar” esconde até lá; `stale_run` deixa de contar após 30 min | 100 | execução `failed`/`uncertain`, ou ativa parada há > 10 min (`countsAsAgentError`) |
| desconectado (`disconnected`) | `disconnected` | cinza, olhos semicerrados, flutuação baixa | enquanto a conexão faltar | 80 | Gmail `reauth_required`; Entregas sem encomenda e sem rastreio |
| concluído (`success`) | reação `success` | pulo, giro, olhos felizes, “✓”, faíscas verdes | 2 s no motor; o resolvedor volta a repouso após 2,5 s | 50 | execução terminou `succeeded` |
| dormindo (`sleep`) | `sleep` | olhos fechados, “z”, respiração lenta | enquanto durar | 5 | reservado (sem gatilho hoje) |

Reações por toque (não são estados): carinho (`love`, 3,1 s), tonto (`dizzy`, recarga de 5 s), cutucão (`poke`), “oi” (`oi`, mãos só aqui, 2,8 s), absorção (`absorb`: o corpo vira quadrado e o tracinho abre só durante a absorção). Carinho e tonto ficam **bloqueados** em erro, esperando você e pergunta (`BLOCK_PLAY`).

## Desempate

Quando dois agentes competem pela ilha ou pelo Dot grande, vence a maior prioridade da tabela (`dominantVisual` em `apps/web/src/presence.ts`). Empate: o primeiro na ordem do registro de agentes (`AGENT_REGISTRY`). Dentro de um mesmo agente, o resolvedor (`VisualStateStore`) também usa a maior prioridade entre as execuções e descarta evento repetido ou com revisão antiga.

O Dot grande do Meu dia só muda de humor por erro, esperando você ou trabalho (sem conexão não o acinzenta); o desempate é o mesmo.

A ilha não é região viva para leitor de tela: ela só anuncia quando o estado dominante vira erro ou esperando você, uma vez por mudança.

## Movimento reduzido e aba oculta

- `prefers-reduced-motion` (ou a preferência do app): sem flutuação, sem partículas, sem animação de entrada do erro (o selo aparece direto), troca de olhos instantânea. A piscada continua (é curta e não desloca o corpo).
- Aba oculta: o `requestAnimationFrame` único é cancelado; nada é desenhado até a aba voltar.
- Avatares pequenos (barra lateral, pílulas, faixa) só animam quando o estado muda.

## Divergências encontradas e o que foi feito

| Divergência | Situação |
|---|---|
| A ilha mostrava qualquer agente trabalhando mesmo com outro em erro (o código preferia `working` a tudo). | Corrigido: `dominantVisual`, teste em `apps/web/test/presence-reason.test.ts`. |
| O Dot grande do Meu dia pegava o primeiro erro **ou** espera na ordem da lista (Correio esperando ganhava de Código com erro). | Corrigido com a mesma função. |
| D-013 diz “repouso sem loop de render”; isso valia para o GLB. O motor SVG (D-014) anima o Dot grande continuamente enquanto visível (flutuação). | Não alterado: é o comportamento aprovado do motor. Registrado aqui. |
| `question`, `thinking` e `sleep` existem no motor e no resolvedor, mas nenhum gatilho do servidor os usa. | Não alterado (reservados). |
| O botão “Dispensar” do erro (A2.6) não existia, apesar de citado na fase A. | Feito: `applyDismiss` + `dismissError` (guarda a revisão da execução no `localStorage`), botão no aviso de erro do agente. Teste em `apps/web/test/presence-reason.test.ts`. |

## Resumo do Correio: o que o `eval:correio` mede (e o que não mede)

`npm run eval:correio` roda no `check` e na CI e falha se a precisão de “precisa de você” cair abaixo de 90% ou a revocação de segurança+pagamento abaixo de 95% no conjunto `packages/core/test/fixtures/correio-gold.json`. **Não é medida de qualidade**: os 85 e-mails sintéticos foram escritos e ajustados junto com as regras, então o resultado (100%) só protege contra regressão. Quando 16 casos novos foram escritos depois das regras, a revocação de segurança+pagamento foi 0% antes do vocabulário ser ampliado. A medida real depende do conjunto cego em `packages/core/test/fixtures/correio-holdout/` (ainda vazio).
