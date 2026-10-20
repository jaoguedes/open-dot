> Atualização 20/10/2026: fluxo real Codex validado no núcleo nativo. João pediu continuar **sem publicação**. Não criar release/tag ou deploy. GitHub autenticado; orçamento US$ 0 com bloqueio de uso pago confirmado pelo usuário. Resultados abaixo datados de 19/10 são históricos; consulte STATUS para a rodada atual.

# Instaladores e drafts — Open Dot Runner

## Estado e segurança

Workflows preparados, não disparados nesta sessão. Nenhuma tag, commit, release ou publicação automática foi criada. `runner-ci.yml` verifica web e, com opt-in, compila três targets. `runner-release.yml` aceita tag `runner-v*` ou dispatch: tag gera somente artefatos; draft exige dispatch, input `create_draft=true` e execução no ref de uma tag existente. Não há passo que publique o draft. `gh release create --verify-tag --draft` falha se a tag não existir ou a release já existir; não modifica release publicada.

Os jobs nativos dependem da variável do repositório `RUNNER_BUILDS_ENABLED=true`. Antes de habilitar, conferir franquia de Actions e cobrança/overage desligados; não foi habilitada cobrança ou variável remotamente. Retenção dos artefatos Runner CI: 1 dia. Configurar o environment `runner-release` com revisão obrigatória e restrição de tags antes do primeiro draft. O gate de revisão depende da configuração do repositório, não pode ser garantido por YAML sozinho.

## Alvos e artefatos

| Runner GitHub padrão | Rust target | Instalador |
|---|---|---|
| macos-15-intel | x86_64-apple-darwin | OpenDot-Runner-macos-x64.dmg |
| macos-15 | aarch64-apple-darwin | OpenDot-Runner-macos-arm64.dmg |
| windows-2022 | x86_64-pc-windows-msvc | OpenDot-Runner-windows-x64-setup.exe |

Cada instalador acompanha SHA-256. Draft só recebe o conjunto exato de seis arquivos após validar integridade. NSIS por usuário. Builds de teste sem assinatura/notarização. Não há auto-updater; não há credencial de assinatura requerida. A CLI Tauri está fixada no package-lock; dependências Rust no Cargo.lock. Gerar ícones novamente somente a partir do ícone original do Dot.

## Uso local (opcional)

Node 24, `npm ci`, `npm run runner:build`. Isso compila a interface sem Rust/Xcode. Para nativo: Rust stable, macOS Command Line Tools (`xcode-select --install`) ou no Windows MSVC Build Tools/WebView2. No Mac não é necessário Xcode completo para esta aplicação desktop; iOS está fora do escopo. `CI=true npm run runner:desktop -- build --bundles dmg --no-sign -- --locked` no Mac; `--bundles nsis` no Windows. `npm run runner:desktop -- dev` compila o frontend antes de iniciar (reexecute para atualizar). O caminho do Cargo deve estar no PATH do shell que executa a CLI.

## Operação após aprovação

1. Revisar diff, resultados e versão 0.1.0; configurar proteção do environment e franquia gratuita.
2. Habilitar opt-in de builds e executar Runner CI manualmente. Baixar os artefatos e testar instalação/desinstalação/tray/diálogo/reabertura em cada sistema.
3. Somente após autorização para escrita externa: criar/push da tag correspondente à versão. A tag gera artefatos, sem release.
4. Para draft autorizado: selecionar essa tag em workflow_dispatch e marcar create_draft. Revisar os três checksums e notas. Publicação pública é manual e depende de nova aprovação.
5. Para versão assinada futura: configurar certificados e secrets apropriados separadamente, sem mudar a regra de custo zero sem consentimento explícito.

## Fontes técnicas verificadas em 19/10/2026

- [Tauri GitHub pipelines](https://v2.tauri.app/distribute/pipelines/github/)
- [Pré-requisitos desktop](https://v2.tauri.app/start/prerequisites/)
- [Capabilities](https://v2.tauri.app/security/capabilities/)
- [Tray](https://v2.tauri.app/learn/system-tray/)
- [Runners hospedados GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [Apple Command Line Tools](https://developer.apple.com/documentation/xcode/installing-the-command-line-tools)

O modo local `CI=true` pula o ajuste estético via AppleScript/Finder do empacotador DMG. Não precisa conceder automação do Finder. GitHub Actions já define CI=true. A tentativa local inicial sem essa variável foi interrompida ao aguardar Finder; somente o volume temporário criado pelo build foi desmontado e removido.

## Resultado local confirmado

Mac Intel: DMG debug sem assinatura/notarização gerado com Tauri 2.12.3, Rust 1.99.1 temporário e apenas CLT existentes (sem Xcode completo). Saída `apps/runner/installers/OpenDot-Runner-macos-x64-debug.dmg`, 8,83 MiB. `hdiutil verify`: checksum VALID. Imagem montada somente leitura, conferidos `com.opendot.runner`, versão 0.1.0, executável x86_64 e symlink Applications; desmontada em seguida. Nenhuma instalação ou execução do app foi realizada.

SHA-256: `c3497ea660ce128e926c2090cf60c60c8370eee534bf0d904b600d2d3a4a7164`. Arquivo `.sha256` ao lado. Ambos são artefatos locais ignorados pelo Git. Essa saída debug não substitui os builds release da matriz; ARM e Windows ainda não foram gerados/testados.

## Revisão atual — paleta D-024 (19/10/2026)

DMG debug Intel recompilado com a paleta aprovada e preservação do Dot em todos os estados. Checksum hdiutil VALID, conteúdo 0.1.0 / com.opendot.runner / x86_64 / atalho Applications conferido somente leitura e desmontado. Sem assinatura, instalação ou execução real. Esta revisão substitui o artefato local anterior no mesmo caminho; o hash da seção anterior é histórico.

SHA-256 atual: `5ced7eb520e7972401b5140863fe6b18f085b339fe729000601a8318cf6a0db1`. Arquivo e checksum atualizados em `apps/runner/installers/OpenDot-Runner-macos-x64-debug.dmg` e `.dmg.sha256`. Sem publicação ou alteração de release.

## Executor real — build local 20/10/2026

DMG Intel debug atualizado (12,11 MiB), sem assinatura/notarização, gerado sem Xcode completo. `hdiutil verify` PASS. SHA-256: `51f5d98619fb367b104c42874c0404b3a05a6e46838b89729e1b2fa68d274016`. Artefato local: `apps/runner/installers/OpenDot-Runner-macos-x64-debug.dmg`. Não substitui os builds release do Actions; inicialização gráfica/instalação completa ainda não validadas. Os hashes anteriores são históricos.

## Actions e inicialização — checkpoint 20/10/2026

[Runner CI 39425600153](https://github.com/jaoguedes/open-dot/actions/runs/39425600153): verify PASS, ARM64 PASS, Intel/Windows ainda em empacotamento na última consulta. [CI geral](https://github.com/jaoguedes/open-dot/actions/runs/39425600235) PASS. ARM64 baixado, hdiutil VALID, versão 0.1.0 / com.opendot.runner / arm64 conferidos somente leitura. SHA-256 `89384bd4715995a91c52512b26419ceeb921ffd8798fa1884054f8524500c549` (7.402.065 bytes). Não executado nativamente.

O DMG Intel debug local teve inicialização básica PASS: binário da imagem ativo por dez segundos com HOME/CODEX_HOME isolados, sem conta ou pareamento. Processo próprio encerrado e imagem desmontada. Não comprova cliques/tray/instalação completa. Nenhuma release/tag criada.
