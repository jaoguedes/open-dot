# Segurança do mantenedor — o que fazer fora do código

Guia curto do que só o dono das contas pode fazer. Nada aqui foi feito pelo agente: são ações nas suas contas. Faça antes de tornar o repositório público.

## 1. Contas: chaves de acesso e 2FA

Em cada conta abaixo: ative **chave de acesso (passkey)** ou **2FA com app autenticador** (evite SMS), guarde os códigos de recuperação offline e revise **sessões e dispositivos ativos**, encerrando o que não reconhecer.

| Conta | Onde | Revisar também |
|---|---|---|
| Google | myaccount.google.com → Segurança | Apps com acesso à conta; remova o que não usa |
| GitHub | Settings → Password and authentication | Sessions, SSH/GPG keys, tokens pessoais (apague os antigos), OAuth/GitHub Apps autorizados |
| Cloudflare | My Profile → Authentication | API Tokens (apague os sem uso), membros da conta |
| Turso | Configurações da conta | Tokens de banco antigos; overages desligados |
| Vercel | Account Settings → Authentication | Tokens |
| ChatGPT/Codex e Claude | Configurações de segurança de cada serviço | Sessões ativas e dispositivos conectados |

## 2. Segredos de produção

Nenhum segredo real foi encontrado no repositório nem no histórico. Mesmo assim, **rotacione se houver qualquer dúvida** (por exemplo, se já colou algum valor em chat, terminal compartilhado ou captura de tela):

- `TURSO_AUTH_TOKEN`: crie um token novo no Turso, grave com `npx wrangler secret put TURSO_AUTH_TOKEN` e revogue o antigo.
- `GOOGLE_CLIENT_SECRET`: gere um novo segredo no cliente OAuth, grave com `wrangler secret put` e apague o antigo no console.
- `TOKEN_KEYS`: gere com `npm run secrets:keygen -- v2` e grave `TOKEN_KEYS="v2:…,v1:…"` (a chave nova cifra, a antiga só decifra). Depois que os dados forem regravados, remova a antiga.
- Tokens opcionais (`GROQ_API_KEY`, `VERCEL_TOKEN`, `FINNHUB_API_KEY`, `PACOTEVICIO_API_KEY`, `GITHUB_WEBHOOK_SECRET`): mesma lógica.

## 3. Identidade do dono em produção

- Defina **`OWNER_GOOGLE_SUB`** em produção (`npx wrangler secret put OWNER_GOOGLE_SUB`). É o identificador estável da sua conta Google. Com ele, o e-mail deixa de ser a chave de entrada.
- **Contato público:** a página `/privacidade` e `/api/legal` mostram, sem login, o contato configurado. Troque por um alias ou link de issues (Conexões → Contato público) e remova `CONTACT_EMAIL` se ele for seu e-mail pessoal: `npx wrangler secret delete CONTACT_EMAIL`.
- **Próximo deploy:** o `wrangler.jsonc` versionado agora só tem placeholders. Antes de publicar de novo, rode `npm run setup:cloud` ou crie `.deploy.local.json` (ignorado pelo Git) com a origem da sua instância:

  ```json
  { "appOrigin": "https://open-dot.<seu-subdominio>.workers.dev", "ownerName": "" }
  ```

  Sem isso, os scripts de deploy param antes de publicar. A migração `0017` (limite de taxa) precisa ser aplicada antes do Worker novo; `npm run deploy` faz isso na ordem certa.

## 4. Repositório no GitHub (antes e logo depois de tornar público)

`scripts/release/publish.sh` automatiza o que é possível com `gh api` e só roda com `--execute`. Confira no navegador:

- **Proteção da `main`:** exigir PR, revisão, checks verdes (CI), histórico linear; bloquear force push e exclusão. Inclua administradores.
- **Code security:** secret scanning, **push protection**, Dependabot alerts e security updates, **private vulnerability reporting**.
- **Actions:** “Require approval for all outside collaborators” em PRs de fork; permissões padrão do `GITHUB_TOKEN` como **somente leitura**; não permitir que Actions criem ou aprovem PRs.
- **Environments:** `runner-release` com você como revisor obrigatório.
- **CODEOWNERS:** troque `<OWNER>` em `.github/CODEOWNERS` pelo seu usuário e descomente as linhas.
- **Execuções antigas de Actions:** os logs atuais não têm segredos (varridos nesta auditoria), mas contêm o nome do repositório. Apague artefatos e execuções antigas se preferir começar limpo.

## 5. Sua máquina

- `docs/privado/` e `.pii-terms.local` ficam só na máquina (ignorados pelo Git). Não os mova para dentro de pastas versionadas.
- Instale o hook opcional: `npm run hooks:install`. Ele recusa commits com segredo ou dado pessoal no conteúdo preparado.
- Nunca publique com `git push --mirror` ou `--all`: há refs locais antigas (`refs/original/…`, `refs/codex/…`, `backup-antes-do-github`). O script de publicação envia só refs explícitas.
