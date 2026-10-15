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

## Fase B (parcial, ainda não publicada)

- `/api/health` sem sessão responde só `{ok}`. Com sessão devolve schema e `configured`. Testes de health atualizados e passando.
- `/api/legal` não devolve mais `OWNER_EMAIL`. Só `CONTACT_EMAIL`, se existir.
- `APP_ENV` padrão passou a `production`.
- CSP ganhou `media-src 'self'`.
- O gancho `?forcar=render` só entra no bundle quando `import.meta.env.DEV` é verdadeiro.


