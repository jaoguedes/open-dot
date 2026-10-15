# Sons do Dot

Treze sons curtos, **originais**: foram sintetizados do zero por `scripts/sounds/make_dot_sounds.py` (marimba/bolha suave). Nenhum áudio, nome ou desenho de outro projeto foi copiado. Estilo inspirado só na ideia de "um bichinho que reage com sons pequenos".

| Arquivo | Quando toca | Duração |
|---|---|---|
| dot-hello | Ao abrir o app depois do carregamento | 0,9 s |
| dot-think | O Dot começa a trabalhar num pedido | 0,5 s |
| dot-done | Execução concluída | 0,9 s |
| dot-attention | Algo pede você (aprovação, alerta) | 0,9 s |
| dot-error | Erro com o Dot de erro | 0,5 s |
| dot-send | Você envia uma pergunta | 0,2 s |
| dot-receive | A resposta chegou | 0,3 s |
| dot-tap | Toque em botão do Dot / carinho | 0,1 s |
| dot-love | Carinho no Dot | 0,8 s |
| dot-sleep | Dot em repouso por muito tempo | 1,4 s |
| dot-pop | Abre busca, painel ou diálogo | 0,2 s |
| dot-close | Fecha busca, painel ou diálogo | 0,2 s |
| dot-notify | Chegou um item novo no Meu dia | 0,6 s |

Regras de uso:
- **Desligado por padrão.** O usuário liga em Mascote > Som. Sons nunca tocam com a aba oculta.
- Volume padrão 0,25 (pico do arquivo em -8 dBFS); controle de 0 a 0,6.
- No iPhone o áudio só toca depois de um toque do usuário. Pré-carregar no primeiro toque.
- Nunca tocar dois sons ao mesmo tempo mais de 2 vezes por segundo; `dot-error` e `dot-attention` têm prioridade e cortam os outros.

Regerar: `python3 -I scripts/sounds/make_dot_sounds.py apps/web/public/sounds` (precisa de numpy, scipy e ffmpeg).
