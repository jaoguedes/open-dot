# Conjunto cego do Correio

Conjunto cego, escrito por um revisor que não leu as regras de `packages/core/src/correio.ts`.

**Ainda está vazio.** Os 85 e-mails de `../correio-gold.json` foram escritos e ajustados junto com as regras, então o resultado deles não mede a qualidade real. Este diretório existe para receber um conjunto escrito por outra pessoa (ou outra sessão que não veja as regras), no mesmo formato do `correio-gold.json` (e-mails sintéticos, domínios `.test`, campo `expected` e `importante`).

Regras para quem escrever:
- Nenhum e-mail real, nenhum endereço real.
- Não abra `correio.ts` antes de terminar os rótulos.
- Pelo menos 40 e-mails, com promoções que usam palavras de prazo e pagamento, avisos reais de segurança e cobrança, códigos de login, rastreio, perguntas de pessoas e conversas com várias mensagens.
- Depois de pronto, rode `npm run eval:correio` e registre o número sem ajustar as regras na mesma sessão.
