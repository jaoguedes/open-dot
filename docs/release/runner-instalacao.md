# Instalar e atualizar o Open Dot Runner

Estado das plataformas:

| Plataforma | Estado |
|---|---|
| macOS Intel (x86_64) | **testado** (binário de release iniciado e medido nesta máquina; GUI completa ainda sem roteiro nativo automatizado) |
| macOS Apple Silicon (arm64) | **sem teste real** (compila no CI quando habilitado) |
| Windows x64 | **sem teste real** (compila no CI quando habilitado) |
| Linux | fora do escopo |

## Primeiro uso no macOS

1. Baixe `OpenDot-Runner-macos-x64.dmg` (ou `arm64`) do release e o arquivo `.sha256` ao lado.
2. Confira o hash antes de abrir:

```bash
shasum -a 256 -c OpenDot-Runner-macos-x64.dmg.sha256
```

3. Abra o `.dmg` e arraste o Runner para Aplicativos.
4. O instalador **não é assinado pela Apple** (sem custo). No macOS 15 ou mais novo, a primeira abertura é bloqueada: vá em **Ajustes do Sistema → Privacidade e Segurança**, role até a mensagem sobre o Open Dot Runner e clique em **Abrir mesmo assim**. Isso acontece uma vez.
5. O assistente pede o endereço do seu Open Dot e mostra um código de uso único; confirme o código e o nome em **Runner** no app web (código vale por poucos minutos).

## Primeiro uso no Windows (sem teste real)

1. Baixe `OpenDot-Runner-windows-x64-setup.exe` e o `.sha256`; confira com `certutil -hashfile OpenDot-Runner-windows-x64-setup.exe SHA256`.
2. O SmartScreen pode avisar sobre editor desconhecido: **Mais informações → Executar assim mesmo**.

## Atualizar

Com “Avisos de versão” ligados, a aba **Atualizações** mostra quando há versão nova; a assinatura é conferida antes de instalar e a tarefa em andamento não é interrompida. Sem a chave de assinatura configurada (situação atual), baixe a nova versão pelo release e repita a instalação: ajustes, pastas e consentimentos ficam guardados no computador.

## Fechar e sair

Fechar a janela deixa o Runner na barra de menus (macOS) ou na bandeja (Windows). Para sair, use **Sair do Runner** no menu do ícone.
