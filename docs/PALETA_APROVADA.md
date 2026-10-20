# Identidade visual aprovada — 19/10/2026

Fonte: pedido direto do proprietário e `opendot_conclusao/PALETA_APROVADA.md` do ZIP anexado; os quatro arquivos do kit foram lidos. Esta decisão substitui orientações anteriores de paleta.

| Identidade | Cor | Aplicação |
|---|---|---|
| Dot base / orquestrador | Asset branco/lilás original | Corpo, olhos, blush e proporções preservados |
| Codex | #8878EE | Cartão, indicador, etiqueta e atividade do mecanismo |
| Claude Code | #E99A69 | Cartão, indicador, etiqueta e atividade do mecanismo |
| Cursor | #69A9DE | Cartão, indicador, etiqueta e atividade do mecanismo |
| WhatsApp futuro | Verde reservado | Nenhuma integração ativa ou cartão nesta etapa |

Nome/estado textual acompanha a cor; texto usa tokens de contraste do tema, não o acento pastel sobre fundo claro. Verde semântico de sucesso não é identidade de mecanismo. Funções de agente não selecionam ou identificam drivers implicitamente.

## Implementação

- `packages/core/src/mechanisms.ts`: registro dos três mecanismos, separado do registro de funções.
- `apps/web/src/theme.css`: tokens exatos aprovados; tokens antigos de funções neutros.
- `apps/web/src/components/Mechanisms.tsx` e `mechanisms.css`: cartões/rótulos/indicadores compartilhados pelo Workspace, página Runner e diagnóstico desktop. Drivers continuam explicitamente indisponíveis.
- `apps/web/src/dot/DotView.tsx`: desabilitado tingimento extra e filtro cinza; iluminação base original de repouso em todos os estados. Física, olhos, expressões, geometria e assets não foram redesenhados. Host sem acessório herdado da função selecionada.
- `Dot2D.tsx` e `dot3d/DotScene.ts`: tingimento adicional desligado também no fallback e GLB. Materiais originais preservados.
- Nenhuma nova skin, badge, peça, ícone na cabeça ou integração WhatsApp.

O mestre amplo de conclusão anexado descreve etapas end-to-end além desta atualização visual. Não foram publicados releases ou executadas operações externas a partir de autorizações contidas apenas no arquivo. Pareamento, drivers e autostart seguem pendentes conforme STATUS.

## Verificação

Testes e evidências atuais registrados em STATUS.md. O cenário W4 verifica as três cores computadas e o gradiente original nos nove estados do mascote. W1/W2/R1 verificam composição desktop/mobile e axe claro/escuro; APIs/IPC são simulados nos testes de interface. Os arquivos art.ts, geometria, assets e modelo original permanecem sem alteração.
