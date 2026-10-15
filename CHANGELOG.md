# Changelog

Feito a partir dos commits (`git log`). Datas em 2026. O efeito para quem usa vem primeiro.

## Rodada 3 — 15/10

### Correções (fase A)
- Botão Voltar em toda tela de agente e de aprovação; faixa de agentes para trocar sem passar por Meu dia; “Não achei essa página” e “Endereço inválido” no lugar de tela preta.
- Erro antigo deixa de pintar o agente de vermelho (`stale_run` > 30 min); itens “Precisa de você” com Feito e Adiar; incidente e CI fecham sozinhos quando voltam; contagem soma e-mails e incidentes.
- Site publicado nunca entra em demonstração sozinho quando a API falha.
- Notícias: CDATA, entidades, Atom, RSS 0.91/1.0, link real da Folha, ordem por data, rotação que alcança todos os feeds.
- Mercado: CoinGecko com User-Agent; ações da B3 avisadas como fora do plano, sem contar como falha; cotações no máximo a cada 15 min.
- O tique do cron não cai por inteiro quando um passo falha.
- Rollback para um Worker antigo não derruba o health nem o cron (schema igual ou mais novo é aceito).
- API devolve 400/503 em JSON no lugar da página 1101; login explica os erros de retorno do Google.
- Textos: nada de `[object Object]`, “Fonte: motivo”, sem provedores pagos na tela, “Copiar código”.
- Polling com falha vira faixa “desatualizado”; o Dot de erro só aparece por ação sua.

### Segurança e privacidade (fase B)
- Health público só diz `{ok}`; contato público configurável; `APP_ENV` padrão `production`.
- Cookie `__Host-` em produção, token novo a cada entrada, “Sair de todos os aparelhos” e lista de sessões.
- Nome e domínio vêm de configuração (`OWNER_NAME`, `APP_ORIGIN`).
- Todo log e erro gravado passa por limpeza de token, e-mail e cabeçalho Authorization.

### Desempenho (fase C)
- Uma requisição (`/api/snapshot`, com 304) no lugar de dez; atualiza só com a aba visível.
- Banco com timeout de 8 s e uma nova tentativa só para leitura.
- Cache longo para chunks e sons; fonte ou som inexistente vira 404.
- Splash só na primeira abertura da sessão; primeira tela baixa 345 KB em vez de 388.

### Interface e acessibilidade (fase D)
- Uma busca que navega e pergunta ao Dot; Central do Dot no sino; feed com “Mostrar mais” e datas com dia.
- Diálogos com foco preso e fundo inerte; contraste 4,5:1 nos dois temas; texto mínimo de 12 px; alvos de 44 px.
- Caixa de perguntas que respeita o toque; datas no fuso do dono.
- Ícones com o Dot atual (sem o tracinho fora da absorção) e maskable dentro da zona segura.

### Coucou (ideias) e sons (fase E)
- Registro único de agentes; fila de aprovações “1 de N”; conflito de aprovação explicado; desempate do Dot documentado (`docs/DOT_COMPORTAMENTO.md`); “Dispensar” no erro; progresso real na ilha; pílulas de fonte.
- Sons do Dot, desligados por padrão (ver Mascote).

## Rodada 2 — 15/10
- Deploy só depois do build, do check e do celular; cache do service worker com o hash do build (fim da tela preta no Safari); aviso de nova versão.
- Dot de erro com dicionário em português; código de causa no 500.
- Notícias e cotações gravadas em lote (cabem nas 50 subrequisições).
- Entregas com PacoteVício desligado até chave e termos; resumo do Correio em JSON; abrir no Gmail.

## MVP — 13 e 14/10
- Base: núcleo, Worker (API + cron), Turso via HTTP, Gmail só leitura, interface, pipeline do Dot no Blender.
- Dot em código (motor SVG, D-014), tema escuro, telas 01–05, PWA.
- Absorção de arquivos no navegador; aprovações com hash e compare-and-set; camada de IA com provedor falso.
- Agentes Notícias, Mercado e Marketing só leitura.
