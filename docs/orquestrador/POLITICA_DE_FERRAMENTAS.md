# Política das ferramentas de terceiros

O Open Dot **não é afiliado** à Anthropic, OpenAI, Google nem Anysphere. Usa as ferramentas que a pessoa já instalou, com o login dela.

1. **Local apenas.** O Runner abre o CLI na máquina do usuário. O Worker nunca recebe login, token ou sessão de ferramenta; recebe só um snapshot sem credenciais (esquema estrito).
2. **Nunca ler credenciais.** O Runner não abre `~/.codex/auth.json`, chaveiros, `~/.claude*`, `~/.gemini*` nem equivalentes. Pergunta ao próprio CLI (`claude auth status`, `codex login status`, `--version`).
3. **Nunca compartilhar entre pessoas.** O login de cada pessoa serve só a ela, naquela máquina.
4. **Binário não modificado.** O Open Dot executa o CLI instalado como ele é, com flags verificadas (`FLAGS_VERIFICADAS.md`).
5. **Nada pago por padrão.** Logins `api_key`, `api_key_helper` e `third_party` são “possivelmente pagos” e excluídos, salvo permissão explícita por ferramenta. Nunca há fallback automático para chave de API.
6. **Claude Code** é opt-in, desligado por padrão, com aviso na primeira ativação (“usa o crédito programático do seu plano; mantenha o uso extra desligado”); exige também opt-in local no Runner (`OPEN_DOT_EXPERIMENTAL_DRIVERS=claude-code`). Não usa `--bare`. Para ao receber erro de limite, sem repetir.
7. **Codex** roda pelo app-server oficial com perfil somente leitura e sem ferramentas; o host aplica arquivos só após aprovação por hash.
8. **Gemini CLI** fica indisponível para implementar: nem o modo plan é somente leitura estrito. Uso para planejar/revisar só depois de verificar flags num CLI instalado e numa cópia descartável.
9. **Cursor** fica indisponível até existir modo sem ferramentas verificável (ACP planejado).
10. **Flag não verificada = driver indisponível.**
