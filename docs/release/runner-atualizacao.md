# Atualização automática do Runner

Estado: **implementada, sem teste real de ponta a ponta** (exige duas versões publicadas e a chave do João).

## Como funciona

1. **Consentimento primeiro.** Na primeira abertura o Runner pergunta: “Quer ser avisado de novas versões? O Runner consulta os lançamentos públicos no GitHub algumas vezes por dia. Nenhum dado seu é enviado.” Sem resposta ou com “Agora não”, **nenhuma requisição de rede** é feita (código: `updater::gate`, teste `gate_order_consent_key_version_task`).
2. **Endpoint fixo e só HTTPS:** `https://github.com/jaoguedes/open-dot/releases/download/runner-canal-beta/latest.json` (`tauri.conf.json`, conferido por `updater::allowed_endpoint`).
3. **Assinatura obrigatória:** o plugin oficial do Tauri confere a assinatura minisign do pacote com a chave pública compilada no app antes de instalar. Assinatura inválida nunca instala. A mesma biblioteca (`minisign-verify`) é exercitada nos testes com uma chave efêmera gerada só na memória do teste.
4. **Sem downgrade** (`updater::is_newer`, semver estrito) e **sem interromper tarefa**: com uma tarefa no journal, a instalação espera.
5. **Chave provisória bloqueia tudo:** enquanto `pubkey` for `[CHAVE_PUBLICA_A_DEFINIR]`, o Runner não consulta nem instala e mostra “baixe a nova versão pela página de lançamentos”; `scripts/release/check-updater-key.mjs` faz o rascunho de release falhar.
6. **Notas do release** aparecem como texto puro (sem HTML, sem links clicáveis) e limitadas a 4.000 caracteres.
7. **Preservação:** a atualização troca o binário; `settings.json`, pastas permitidas, consentimentos e o cofre do sistema ficam onde estão (diretório de dados do app e chaveiro), fora do pacote.

## Por que este endpoint (e não `latest`)

O endereço `releases/latest/download/...` do GitHub **ignora rascunhos e pré-lançamentos**. Como o Runner é beta e os releases do projeto são marcados como pré-lançamento, `latest` nunca encontraria a versão nova. A decisão é um **release-canal** com a tag fixa `runner-canal-beta`, publicado (não rascunho, não pré-lançamento), cujo único papel é guardar o `latest.json` mais recente; o `latest.json` aponta para os pacotes do release da versão (`runner-vX.Y.Z`). Para publicar uma versão nova o João substitui o `latest.json` desse release-canal depois de conferir o rascunho.

## Estados na interface

“Verificando…” → “Há uma versão nova (x.y.z)” com **Atualizar agora / O que mudou / Depois** → “Verificando a assinatura e baixando…” → reinício → “Versão x.y.z”. Erros com texto: sem rede, assinatura recusada, versão não mais nova, tarefa em andamento, chave não configurada.

## Limitação no macOS sem Developer ID

O instalador não é assinado pela Apple (sem custo é o combinado; notarização é paga). A atualização substitui o `.app` com um pacote assinado pela chave do updater, que é independente da Apple. **Não foi testado** se o Gatekeeper do macOS 15+ exige de novo “Abrir mesmo assim” depois de uma atualização automática. Se exigir ou falhar, a alternativa honesta é baixar a nova versão manualmente pelo release (a interface já oferece esse caminho).

## Roteiro de teste manual (para o João)

1. Gere a chave e configure o secret (ver `runner-chave-de-assinatura.md`).
2. Publique `runner-v0.3.0` (instalar no Mac Intel) e depois `runner-v0.3.1` com `latest.json` no release-canal.
3. Abra a 0.3.0, responda “Sim, avisar”, vá em Atualizações → Verificar. Deve aparecer 0.3.1.
4. Com uma tarefa em andamento, “Atualizar agora” deve recusar e explicar.
5. Sem tarefa, atualize. Depois do reinício: versão 0.3.1, pastas e consentimentos iguais.
6. Teste negativo: edite um byte do `.app.tar.gz` num release de teste; a instalação deve falhar com “Download ou assinatura recusados”.
7. Teste de downgrade: aponte o `latest.json` de teste para 0.2.9; deve dizer que a versão não é mais nova.
