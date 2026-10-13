# Ações que dependem de você

Estão aqui só as tarefas que exigem sua conta, seu login ou uma decisão sua. Faça na ordem. Cada grupo diz como eu verifico depois que funcionou.

**Regra geral:** nunca cole tokens ou senhas no chat. Os segredos vão para o `.dev.vars` (no Mac) ou para o assistente `npm run setup:cloud`, que pede cada valor no seu terminal com a digitação oculta.

---

## A. Aprovar o modelo do Dot (5 minutos, quando o build do Blender rodar)

- **O que fazer:** olhar `assets/dot/poster-frente-512.png`, `poster-tres-quartos-512.png` e `poster-lado-512.png`, e responder “aprovado” ou dizer o que ajustar (forma, olhos, tracinho).
- **Por que depende de você:** aprovação artística é decisão sua. O técnico já é validado pelos scripts.
- **Como verifico:** registro sua resposta em `docs/DECISOES.md` e sigo para o runtime 3D.

---

## B. Google: login e Gmail somente leitura (≈ 15 min)

1. **Criar o projeto**
   - Link: https://console.cloud.google.com/projectcreate
   - Campo **Project name**: `open-dot`
2. **Ativar a Gmail API**
   - Link: https://console.cloud.google.com/apis/library/gmail.googleapis.com
   - Clicar em **Enable**.
3. **Tela de consentimento**
   - Link: https://console.cloud.google.com/auth/overview
   - App name: `Open Dot`
   - User support email: seu Gmail
   - Audience: **External**
   - Developer contact: seu Gmail
4. **Escopos**
   - Em **Data access → Add or remove scopes**, marque só: `openid`, `.../auth/userinfo.email`, `.../auth/gmail.readonly`.
5. **Público e status de publicação**
   - Em **Audience**, adicione seu Gmail como **Test user** e depois clique em **Publish app** (“In production”).
   - O Google vai mostrar “app não verificado” quando você autorizar. Isso é esperado no uso pessoal: clique em *Avançado → Acessar Open Dot*.
   - **Por que publicar:** no modo *Testing*, o Google expira o acesso do Gmail a cada 7 dias. Publicado, o acesso só cai se você revogar, trocar a senha ou ficar 6 meses sem usar.
6. **Cliente OAuth**
   - Link: https://console.cloud.google.com/auth/clients → **Create client**
   - Application type: **Web application**
   - Name: `open-dot`
   - Authorized redirect URIs (cadastre as duas):
     - `http://localhost:8787/api/oauth/google/callback`
     - `https://open-dot.SEU-SUBDOMINIO.workers.dev/api/oauth/google/callback` (adicione depois do passo C)
7. **Guardar os valores**
   - No Mac, abra o `.dev.vars` no Cursor e acrescente:
     ```
     GOOGLE_CLIENT_ID=<Client ID>
     GOOGLE_CLIENT_SECRET=<Client secret>
     OWNER_EMAIL=<seu Gmail>
     ```
   - Na nuvem, o `npm run setup:cloud` pede os mesmos valores.

- **Permissões mínimas:** `openid email gmail.readonly`. Nada de envio, exclusão ou arquivamento.
- **Como verifico:** com `npm run dev`, a página Conexões passa a mostrar “Conectado · leitura” e o feed recebe “Sua revisão das …”, com o número de mensagens analisadas e links que abrem no Gmail.

---

## C. Cloudflare: onde o app roda de graça, com o Mac desligado (≈ 5 min)

1. **Criar a conta (se ainda não tiver)**
   - Link: https://dash.cloudflare.com/sign-up
   - Plano **Free**. Não cadastre cartão.
2. **Escolher o subdomínio gratuito**
   - Link: https://dash.cloudflare.com → **Workers & Pages** → escolha o subdomínio `*.workers.dev`.
3. **Fazer login pelo terminal**
   - O `npm run setup:cloud` abre o login do Cloudflare no navegador quando precisar (`wrangler login`). Basta autorizar.

- **Como verifico:** depois do deploy, `https://open-dot.SEU-SUBDOMINIO.workers.dev/api/health` responde `"ok": true`.

---

## D. Turso: banco separado do Open Dot (≈ 3 min)

Os seus bancos atuais, como o do SafeWear, **não serão tocados**.

1. **Criar o banco**
   - Link: https://app.turso.tech → **Create Database**
   - Name: `open-dot`
   - Região: a mais próxima do Brasil disponível.
2. **Criar o token**
   - No banco `open-dot`, use **Create Token** (Read & Write) e copie a URL `libsql://open-dot-….turso.io` e o token.
3. **Confirmar que não há cobrança**
   - Em **Billing**, confirme que **Overages está desligado**.
4. **Guardar os valores**
   - Não cole no chat. O `npm run setup:cloud` pede a URL e o token e aplica as migrações.
   - Se o banco tiver tabelas de outro projeto, o script recusa e não altera nada.

- **Como verifico:** o setup mostra “Migrações aplicadas: 0001” e o `/api/health` mostra `"schema": "0001"`.

---

## E. Publicar (1 comando)

```bash
npm run setup:cloud
```

- O assistente pede os valores dos grupos B e D, grava os segredos no Cloudflare e **pergunta antes de publicar**.
- Essa é a única confirmação de deploy: sem “s”, nada é publicado.

---

## F. Opcional: IA para resumos melhores (Groq Free, ≈ 3 min)

Sem isso, os resumos continuam funcionando por regras.

1. **Criar a chave**
   - Link: https://console.groq.com/keys
   - **Create API Key**, nome `open-dot`.
2. **Ativar a retenção zero**
   - No console da Groq, em **Settings → Data Controls**, ative **Zero Data Retention**.
   - Sem isso, seus e-mails **não** são enviados à IA.
3. **Liberar os e-mails para a IA**
   - Só depois do passo 2, troque `GROQ_ZDR_CONFIRMED` para `"true"` no `wrangler.jsonc` (ou no `.dev.vars`).

- **Como verifico:** a página Conexões mostra “Groq · dados privados liberados (ZDR confirmado)” e o resumo passa a dizer “Classificado com IA”.

---

## G. Mais tarde (fase 7): GitHub e Vercel em leitura

Fica para depois, porque o Gmail é a primeira integração completa. Quando chegar a vez, eu preparo o passo a passo do GitHub App (só os repositórios que você escolher) e do token da Vercel com escopo só no projeto.
