# Como contribuir com um agente

Agentes são **dados**. Um pacote não pode pedir ferramenta, comando, rede, segredo, modelo ou roteamento: o carregador recusa o pacote inteiro.

1. Crie `agents/<id>/` com `AGENT.md`, `rubrica.md`, `schema.json` e pelo menos três `evals/*.json` (formato em `agents/README.md`).
2. Escreva do zero, com as suas palavras. Nada copiado de coleções de terceiros.
3. Densidade de verdade: procedimento, listas específicas, exemplos bons e ruins, armadilhas. Corpo com mais de 3 KB.
4. O esquema usa só `type`, `enum`, `required`, `additionalProperties`, `properties`, `items`, `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`.
5. Rode `node --import tsx scripts/orchestrator/build-agents.ts` e `npm run check`.
6. Novos agentes entram como `nivel: experimental` até terem evidência medida.

Contribuições exigem o CLA (`CLA.md`).
