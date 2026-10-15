# Diário da rodada 3

## Pré-checagem (15/10/2026)

- `git log -3`: `754c0b2`, `c9dd09c`, `7042a96`.
- `npm run check`: typecheck ok, 151 testes ok, Blender 7/7, `app.js` 344,8 KB.
- Sons em `apps/web/public/sounds/` (13 MP3 + README) e `scripts/sounds/make_dot_sounds.py` existem. Não foram regerados. Entram na Fase E.
- `blender/gui_run_build.py`, `docs/PROMPT_CURSOR_DOT_VISUAL_IA.md` e `docs/referencias/` não têm segredo (sem chave, token ou URL de banco). Serão commitados.

## Fase A (em andamento, 15/10/2026)

- A4 reproduzido no feed ao vivo da Folha (`rss091.xml`, HTTP 200, `text/xml`, 124968 bytes): o parser respondia `nenhum item com título e link https` porque o `<link>` é `https://redir.folha.com.br/.../*https://…folha.uol.com.br/…`. Teste sintético falhou com essa mensagem e passou depois do desempacotamento. Os outros 7 feeds da allowlist voltaram 200 e o parser aceitou itens. CoinGecko com User-Agent respondeu 200 `application/json` (sem chave).
- A2: `stale_run` com 31 min deixa de contar como erro; com 5 min continua (`packages/core/test/rodada3-a.test.ts`).
- A3: host público sem dados cai em `unreachable`, não em demonstração (mesmo arquivo).
- A6: falha forçada na consulta do Gmail no tique deixa monitores, execuções e donos seguirem (`apps/worker/test/worker.test.ts`).
- A7: schema `0006` com exigência `0005` é compatível; `0004` não é.
- PETR4 não entra como falha (`b3_fora_do_plano`); a segunda leitura em menos de 15 min vem `skipped`.
- Ainda nesta fase, sem teste que falhou antes: botão Voltar e faixa de agentes na interface, “Feito”/“Adiar”, tela de servidor fora, e o texto do teste de agente que deixava de imprimir `[object Object]`. O `ui:mobile` passou depois (390×844), inclusive Código e Sentinela, que tinham ficado com botão sob a caixa de perguntas.

## Publicação da fase A (15/10/2026)

- `npm test`: 161 testes, 0 falhas, antes do deploy.
- Migração remota `0006` aplicada (`Aplicadas: 0006`).
- `test:workerd`: `{"ok":true,"schema":"0006"}` com o código ainda expondo o schema.
- `ui:mobile` ok.
- Worker publicado: `4d1dbc6e-b55d-475f-8e27-ec36659eb036`. App `75ea1683146c`. Rollback: `da21bebf-d11a-4fdc-abad-c87022130c56` (o script tinha gravado o id errado `b914aa87`; a lista do Wrangler mostra `da21bebf` imediatamente antes).
- A fumaça do script falhou na hora porque o health ainda era o Worker anterior (`ok:false` com schema 0006). Segundos depois: `ok:true`, `schema:0006`, hash do `app.js` igual, `/sw.js` contém o hash, `/assets/inexistente` é 404 texto. Flags `GROQ_ZDR_CONFIRMED` e `PACOTEVICIO_TERMS_CONFIRMED` seguem `false`.
- Os MP3 em `public/sounds/` subiram como arquivo estático neste deploy. O player da fase E ainda não existe.

## Retomada pelo Claude Code (15/10/2026)

- O `npm run typecheck` estava vermelho no `d9337a1`: `tests/deploy-script.test.ts` importava `scripts/lib/deploy-plan.mjs` sem declaração. Corrigido com `deploy-plan.d.mts` (`f1324bf`). Base: 164 testes, 0 falhas.
- O agente anterior deixou `apps/worker/test/fase-b.test.ts` (4 testes) e um `scrubSecrets` que devolvia o texto intacto. Os 4 estavam vermelhos.

## Fase B (parcial, ainda não publicada)

- `/api/health` sem sessão responde só `{ok}`. Com sessão devolve schema e `configured`. Testes de health atualizados e passando.
- `/api/legal` não devolve mais `OWNER_EMAIL`. Só `CONTACT_EMAIL`, se existir.
- `APP_ENV` padrão passou a `production`.
- CSP ganhou `media-src 'self'`.
- O gancho `?forcar=render` só entra no bundle quando `import.meta.env.DEV` é verdadeiro.



## Fase B (concluída no código, 15/10/2026)

Prova vermelha: o mesmo `apps/worker/test/fase-b.test.ts` rodado contra o código anterior (stash das mudanças, `scrubSecrets` vazio) deu 0/6. Depois, 6/6.

| Item | Antes (o que o teste viu) | Depois |
|---|---|---|
| B3 cookie | `od_session=…; Secure`, sem `__Host-` | `__Host-od_session` em origem https, `Path=/`, sem `Domain`. O cookie antigo `od_session` ainda é lido uma vez (não desloga ninguém) e é apagado na próxima entrada/saída. |
| B3 sair de todos | `POST /api/sessions/logout-all` → 404 | 200; as duas sessões do teste deixam de autenticar. `GET /api/sessions` lista aparelho (Safari no iPhone etc.) e data, nunca o token. Cartão “Sessões” em Conexões. |
| B3 rotação | entrada nova mantinha o token antigo válido | `startSession` apaga a sessão que veio na requisição antes de criar a nova. |
| B5 nome | `displayNameFor` devolvia “João” fixo | vem de `OWNER_NAME` (no `wrangler.jsonc`, público); vazio mostra só “Bom dia”. Demonstração usa “Alex”. |
| B5 domínio | `OPEN_DOT_HEALTH_URL` fixo com o subdomínio do João | `selfHealthUrl(APP_ORIGIN)`; origem local responde 409. `setup-cloud` lê o `APP_ORIGIN` do `wrangler.jsonc`. |
| B7 isca | callback do Google com erro → 500 (JSON cru); 4 `console.*` diretos | callback com falha → 302 `?erro=callback_invalido`; todo log passa por `logSafe` → `scrubSecrets`. Varredura com isca (token, e-mail, Bearer, chave longa) em respostas, logs, `od_connections.last_error`, `od_runs.error_message`, `od_audit_events.detail`, `od_agent_settings.last_error`: nada vaza. |
| B1, B2, B4, B6 | já estavam no código (commits `fa0ce11` e anteriores) | conferidos: health público `{ok}`, `/api/legal` só `CONTACT_EMAIL`, `APP_ENV` padrão `production`, `media-src 'self'` em `_headers` e `SECURITY_HEADERS`, `?forcar=render` só com `import.meta.env.DEV`. |

Também: o 503 de configuração incompleta não lista mais os nomes das variáveis ausentes para o público (vai só para o log).
`npm run check`: 171 testes, 0 falhas. `ui:mobile` ok.

## Publicação da fase B (15/10/2026)

- Primeira tentativa de `npm run deploy` parou antes de publicar: o passo “erro de render” do `ui:mobile` usa `?forcar=render`, que a B4 tirou do build de produção. Nada foi ao ar. Correção (`scripts/ui-mobile.mjs`): o passo só roda quando o bundle servido tem o gancho; caso contrário diz “pulado”.
- Achado: `npm run dev` observa o código e escreve no mesmo `apps/web/dist`. `scripts/deploy.mjs` agora guarda o hash depois do check, recusa dist com gancho de teste e aborta se o hash mudar antes do `wrangler deploy`.
- Publicado: Worker `509e4b64-2ff9-44a1-8a24-9dfcc0b8c84d`, app `bcfc3da9a745` (commit `a6fe017`), rollback `4d1dbc6e-b55d-475f-8e27-ec36659eb036`. Fumaça do script ok. `/api/health` público = `{"ok":true}`. CSP com `media-src 'self'`.
- `/api/legal` devolve um contato porque o segredo `CONTACT_EMAIL` existe em produção com o mesmo Gmail do login. É configuração (a B1 permite); se o João não quiser publicar esse endereço, basta `wrangler secret delete CONTACT_EMAIL` ou trocar.
