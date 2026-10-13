# Comece aqui (Cursor)

Este guia tem só o que você realmente precisa fazer. O resto já está pronto ou está explicado no `docs/STATUS.md`.

## 1. Qual pasta abrir

No Cursor: **File → Open Folder → `open-dot`** (fica na sua pasta pessoal: `~/open-dot`).

As regras do projeto (`.cursor/rules/`) e o `CLAUDE.md` são carregados automaticamente. Não precisa instalar nenhuma extensão.

## 2. Onde colocar o PDF e as referências

O PDF já está em `docs/referencias/Open_Dot_Projeto_v0.4.pdf`. Coloque novas referências na mesma pasta: imagens podem ser versionadas, mas PDFs ficam fora do Git (são grandes e privados).

O que vale do PDF já está consolidado em `docs/REVISAO_DO_PDF.md`. Os agentes leem esse arquivo, não o PDF inteiro.

## 3. O que falta instalar no seu Mac

Abra o terminal integrado (**Terminal → New Terminal**) e rode:

```bash
node -v
```

- Se aparecer `v22.13` ou mais novo, está pronto.
- Se aparecer outra versão ou “command not found”, instale o **Node 22 LTS** em https://nodejs.org (instalador `.pkg` para macOS). Depois feche e abra o terminal.

O Blender **4.5.14** já está instalado. Não atualize para a versão 5: ela não roda em Mac Intel.

## 4. Como iniciar o aplicativo

No terminal do Cursor, dentro da pasta `open-dot`:

```bash
npm install
npm run dev
```

Depois abra http://localhost:8787. Você vai ver a tela de entrada. Clique em **“Entrar no modo desenvolvimento (local)”**.

- Para ver o app com dados de exemplo, use **“Ver demonstração”** ou rode `npm run demo`.
- Para rodar todas as verificações: `npm run check`.

## 5. Onde colocar as configurações privadas

- **No seu Mac:** no arquivo `.dev.vars`, na raiz do projeto. Ele é criado sozinho no primeiro `npm run dev` e **não vai para o Git**. Use `.env.example` como modelo dos nomes.
- **Na nuvem:** com `npm run setup:cloud`. O assistente pede cada valor no seu terminal, com a digitação oculta, e grava tudo no Cloudflare.

Nunca cole tokens ou senhas no chat do Cursor, em prints ou em commits.

## 6. Como validar uma conexão (Gmail)

Depois de seguir `docs/ACOES_DO_JOAO.md` (grupo Google):

1. Com `npm run dev` rodando, vá em **Conexões → Conectar Gmail** e autorize **só leitura**.
2. Em **Rotinas → Rodar agora**, depois rode no terminal:
   ```bash
   curl -X POST http://localhost:8787/api/dev/tick
   ```
   Sem esse comando, a revisão roda sozinha em até 5 minutos.
3. Em **Meu dia** deve aparecer “Sua revisão das …” com o número de mensagens analisadas, o horário da sincronização e links que abrem a mensagem no Gmail.
4. Se aparecer “Reconecte seu Gmail”, o acesso foi revogado ou expirou. Clique em **Reconectar**.

## 7. Como continuar o trabalho com outro agente

1. Peça ao agente (Cursor, Claude Code ou Codex): **“Leia CLAUDE.md e docs/STATUS.md e execute a ‘Próxima ação exata’.”**
2. Ao final de cada etapa, o agente precisa:
   - rodar `npm run check`;
   - atualizar o `docs/STATUS.md`;
   - dizer o que foi **testado de verdade** e o que foi apenas **simulado**.
3. Se ele propuser algo pago, um serviço novo ou uma mudança no visual do Dot, peça a justificativa em `docs/DECISOES.md` antes de aceitar.
