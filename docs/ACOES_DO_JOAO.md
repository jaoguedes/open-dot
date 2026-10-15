# Ações que dependem de você

Estão aqui só as tarefas que exigem sua conta, seu login ou uma decisão sua. Faça na ordem. Cada grupo diz como eu verifico depois que funcionou.

**Regra geral:** nunca cole tokens ou senhas no chat. Os segredos vão para o `.dev.vars` (no Mac) ou para o assistente `npm run setup:cloud`, que pede cada valor no seu terminal com a digitação oculta.

---

## A. Aprovar o modelo do Dot (5 minutos) — **o build já rodou, falta só o seu olhar**

- **O que fazer:**
  1. Abrir no Finder ou no Cursor: `assets/dot/poster-frente-512.png`, `poster-tres-quartos-512.png`, `poster-lado-512.png` e os pequenos `poster-frente-160/64/32.png`.
  2. Ver o Dot girando no app: `npm run dev` → http://localhost:8787/mascote (entre pelo modo desenvolvimento). Troque agente e estado nos botões; passe o mouse para ver o olhar; clique para o “apertão”.
  3. Responder “aprovado” ou dizer o que ajustar. Os ajustes mais prováveis são números em `blender/dot_spec.py`: proporção do corpo (`WIDTH/HEIGHT/DEPTH`, `EXP_*`), olhos (`EYE_X`, `EYE_Z`, `EYE_RX`, `EYE_RZ`), blush (`CHEEK_*`) e tracinho (`SLOT_Z`, `SLOT_HALF_W`, `SLOT_HALF_H`, cor `M_Slot`).
- **O que já foi conferido por mim:** sem boca, sem sobrancelhas, tracinho visível acima dos olhos, blush na linha dos olhos, nenhum efeito ou acessório aparecendo fixo, olhos legíveis em 32 px.
- **O que ainda não está bom (minha opinião):** o boné, os óculos e o fone são formas simples de conferência, não arte final. Os acessórios aparecem no app, mas não nos posters.
- **Por que depende de você:** aprovação artística é decisão sua. O técnico já é validado pelos scripts.
- **Como verifico:** registro sua resposta em `docs/DECISOES.md`. Depois disso copio `blender/out/<build>/dot_master.blend` para `blender/dot_master.blend` como fonte aprovada.

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

- **Como verifico:** o setup mostra “Migrações aplicadas: 0001, 0002, 0003, 0004” (ou “já atualizado”) e o `/api/health` mostra `"schema": "0004"`.

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

4. **Conferir modelos e limites** no painel Free da Groq (gpt-oss-20b / 120b).
5. **Teste fictício** em Conexões → Provedores → “Testar com exemplo fictício” (roda no provedor falso; não gasta a franquia).
6. **Piloto de 7 dias só leitura** — só depois dos passos 1–5, quando você pedir.

- **Como verifico:** a página Conexões lista Groq com estado, modelo e consumo do dia. “Conectado” depois do teste fictício **não** significa aprovação de privacidade. Sem ZDR, e-mail privado continua só por regras.

---

## H. Opcional: Search Console (Marketing) e Finnhub (Mercado)

Não cole chaves no chat.

1. **Search Console API** (só leitura) no mesmo projeto Google do passo B:
   - Ativar: https://console.cloud.google.com/apis/library/searchconsole.googleapis.com
   - Em **Data access**, acrescente `.../auth/webmasters.readonly` (além do Gmail). O app pede esse escopo num fluxo separado, em Conexões → Marketing → “Conectar Search Console”.
2. **Finnhub Free** (só se quiser ações, ex.: PETR4.SA):
   - Conta gratuita em https://finnhub.io — a documentação do plano gratuito (14/10/2026) exige chave; cripto (CoinGecko) e câmbio (Frankfurter) continuam sem chave.
   - Grave `FINNHUB_API_KEY` no `.dev.vars` ou pelo `npm run setup:cloud`. Sem a chave, o cartão do Mercado diz o que falta — sem cotação inventada.

- **Como verifico:** Conexões mostra Search Console “conectado · leitura” e, no Mercado, PETR4 deixa de pedir a chave.

---

## I. Opcional: rastreio de encomendas (PacoteVício)

Sem isto o Entregas continua útil: guarda o código e abre o site da transportadora. A consulta automática fica desligada, sem erro.

1. **Ler os termos** em https://painel.pacotevicio.dev/docs/ (plano Básico: 1.000 consultas por mês e atribuição obrigatória).
2. **Guardar a chave** `PACOTEVICIO_API_KEY` só no `.dev.vars`. Não cole no chat.
3. **Confirmar os termos** com `PACOTEVICIO_TERMS_CONFIRMED=true` no `.dev.vars` e `"PACOTEVICIO_TERMS_CONFIRMED": "true"` no `wrangler.jsonc`. Sem essa flag, a chave sozinha não liga o provedor.
4. **Enviar para a nuvem** (grava a chave; não imprime o valor):

```bash
npm run setup:cloud -- --from-dev-vars
```

O comando pergunta antes de publicar. A flag de termos não é segredo: ela fica no `wrangler.jsonc`.

- **Como verifico:** em Entregas, o aviso de “desligado” some e, abaixo de uma encomenda consultada, aparece o link “Rastreamento por PacoteVício” para https://pacotevicio.dev. Ao chegar em 900 consultas no mês, as consultas param e a tela avisa.

---

## G. Mais tarde (fase 7): GitHub e Vercel em leitura

Fica para depois, porque o Gmail é a primeira integração completa. Quando chegar a vez, eu preparo o passo a passo do GitHub App (só os repositórios que você escolher) e do token da Vercel com escopo só no projeto.
