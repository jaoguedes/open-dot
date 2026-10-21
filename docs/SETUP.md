# Configurar a sua instância do Open Dot

Passo a passo para quem clonou o repositório e quer a própria instância, no plano gratuito. Nada aqui usa conta de outra pessoa: cada instância tem dono único, banco próprio e chaves próprias.

**Regra geral:** nunca cole tokens ou senhas em chat, issue ou commit. Localmente, os segredos ficam em `.dev.vars` (ignorado pelo Git). Na nuvem, o assistente `npm run setup:cloud` pede cada valor com digitação oculta e grava com `wrangler secret put`.

## 1. Rodar localmente (sem nuvem)

```bash
npm install
npm run demo   # só interface, com dados de demonstração rotulados
npm run dev    # app + API + agendador em http://localhost:8787 (SQLite em .data/)
```

O `npm run dev` cria `.dev.vars` com `APP_ENV=development`, origem local e uma `TOKEN_KEYS` aleatória. A entrada de desenvolvimento só existe em `localhost`.

## 2. Google: login e Gmail somente leitura

1. Crie um projeto em https://console.cloud.google.com/projectcreate.
2. Ative a Gmail API: https://console.cloud.google.com/apis/library/gmail.googleapis.com.
3. Tela de consentimento (https://console.cloud.google.com/auth/overview): nome do app, e-mail de suporte e contato do desenvolvedor (use um endereço que você aceite publicar), público **External**.
4. Escopos: só `openid`, `.../auth/userinfo.email` e `.../auth/gmail.readonly`.
5. Em **Audience**, adicione sua conta como usuário de teste. Para uso pessoal prolongado, publique o app (“In production”); no modo de teste o Google expira o acesso do Gmail a cada 7 dias. O aviso de “app não verificado” é esperado em uso pessoal.
6. Crie um cliente OAuth do tipo **Web application** com os redirects:
   - `http://localhost:8787/api/oauth/google/callback`
   - `https://open-dot.<SEU-SUBDOMINIO>.workers.dev/api/oauth/google/callback`
7. No `.dev.vars`, acrescente `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e o dono:
   - `OWNER_GOOGLE_SUB` (**recomendado e esperado em produção**): o identificador estável da sua conta Google (`sub` do ID token). Não muda se o e-mail mudar.
   - `OWNER_EMAIL`: alternativa. Exige e-mail verificado e fixa a primeira identidade que entrar; outra conta com o mesmo e-mail é recusada.
   - Sem nenhum dos dois, ninguém entra.

## 3. Cloudflare: onde o app roda

1. Conta no plano **Free** em https://dash.cloudflare.com/sign-up, sem cartão.
2. Escolha o subdomínio gratuito `*.workers.dev` em **Workers & Pages**.
3. O `npm run setup:cloud` abre `wrangler login` quando precisar.

O `wrangler.jsonc` versionado traz só placeholders. A origem da sua instância e o nome da saudação ficam em `.deploy.local.json` (ignorado pelo Git), criado pelo `setup:cloud`, e entram no deploy por `wrangler deploy --var`. Com placeholder, o Worker recusa iniciar.

## 4. Turso: banco separado

1. Crie um banco **só para o Open Dot** em https://app.turso.tech.
2. Crie um token de leitura e escrita para esse banco.
3. Em **Billing**, confirme que overages estão desligados.
4. O `setup:cloud` pede a URL e o token e aplica as migrações. Se o banco tiver tabelas de outro projeto, ele recusa e não altera nada.

## 5. Publicar

```bash
npm run setup:cloud
```

O assistente pede os valores, grava os segredos no Cloudflare, cria `.deploy.local.json` e **pergunta antes de publicar**. Sem “s”, nada é publicado. Depois, `npm run deploy` refaz build, testes, migração expansiva e deploy, e registra a versão anterior para rollback.

## 6. Opcionais

- **IA (Groq Free):** crie a chave, ative **Zero Data Retention** no console e só então defina `GROQ_ZDR_CONFIRMED="true"`. Sem isso, e-mails privados não vão para a IA e o resumo fica por regras.
- **Search Console (Marketing):** ative a API no mesmo projeto Google e acrescente `.../auth/webmasters.readonly`; a conexão é um fluxo separado em Conexões.
- **Finnhub (ações):** chave gratuita em `FINNHUB_API_KEY`. Cripto e câmbio funcionam sem chave.
- **Rastreio (PacoteVício):** leia os termos, guarde `PACOTEVICIO_API_KEY` e confirme `PACOTEVICIO_TERMS_CONFIRMED=true`. Sem a confirmação, a chave sozinha não liga o provedor.
- **Contato público:** `/privacidade` mostra o contato salvo em Conexões → Contato público, ou `CONTACT_EMAIL`. Use um alias ou link de issues, não o e-mail de login.

## 7. Segurança da sua conta

Veja `docs/audit/SEGURANCA_DO_MANTENEDOR.md`: chaves de acesso/2FA nas contas, rotação de segredos e proteções do repositório.
