# Política de segurança

O Open Dot é uma **beta**. Leia o que está habilitado e o que continua desligado no `README.md` antes de usar com dados reais.

## Como relatar uma vulnerabilidade

- **Não abra issue pública** para vulnerabilidades.
- Use o relatório privado do GitHub (**Security → Report a vulnerability**) neste repositório, ou escreva para **[CONTATO_A_DEFINIR]**.
- Inclua versão ou SHA, a fronteira afetada (Worker, Runner, memória, CI), o comportamento observado e um teste mínimo com **dados fictícios**.
- Nunca envie tokens, dumps de banco, conteúdo de e-mail, caminhos pessoais ou dados de terceiros. Se um segredo vazou, diga só onde e de que tipo; nós pedimos a rotação.

Responderemos assim que possível. Não há programa de recompensa nem prazo garantido nesta fase.

## Escopo e limites conhecidos

- **Instância de cada pessoa:** cada instalação tem dono único (`OWNER_GOOGLE_SUB` recomendado), banco e chaves próprios. Um e-mail ou nome conhecido não dá acesso a nada.
- **Runner:** só gera propostas; o dono aprova o conteúdo exato e o host aplica num worktree isolado. Shell, testes de projeto, paralelismo, merge, commit ou push automáticos estão **desligados**. Worktree não é sandbox. O executor no Windows está desligado.
- **Revogação e lease** não provam que um processo offline parou; o estado `uncertain` preserva essa distinção e nunca é repetido automaticamente.
- **Memória e Passport** são dados, não autorização. Excluir é exclusão lógica; cópias de backup do provedor do banco não são apagadas pelo app.
- **Varredura de segredos e dados pessoais** (`npm run scan:secrets`, `scan:history`) é heurística, não DLP.
- **Instaladores** não são assinados nem notarizados.

## Para quem mantém uma instância

Veja `docs/audit/SEGURANCA_DO_MANTENEDOR.md` (2FA, rotação de segredos, proteções do repositório) e `docs/SETUP.md`.

Não rode testes ofensivos contra instâncias de outras pessoas.
