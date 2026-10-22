# Como contribuir com um agente

Agentes são **dados**. Um pacote não pode pedir ferramenta, comando, rede, segredo, modelo ou roteamento: o carregador recusa o pacote inteiro. Receitas seguem a mesma regra (`orchestrator/recipes/`).

## No repositório

1. Crie `agents/<id>/` com `AGENT.md`, `rubrica.md`, `schema.json` e pelo menos três `evals/*.json` (formato em `agents/README.md`).
2. Escreva do zero, com as suas palavras. Nada copiado de coleções de terceiros.
3. Densidade de verdade: procedimento, listas específicas, exemplos bons e ruins, armadilhas. Corpo com mais de 3 KB.
4. O esquema usa só `type`, `enum`, `required`, `additionalProperties`, `properties`, `items`, `minItems`, `maxItems`, `minLength`, `maxLength`, `pattern`.
5. Rode `node --import tsx scripts/orchestrator/build-agents.ts` e `npm run check`.
6. Novos agentes entram como `nivel: experimental` até terem evidência medida.

## Como pacote local (v0.3)

Na tela **Equipe → Importar pacote de agente**, escolha uma pasta ou um `.zip` no seu computador. Não existe registro online nem download.

- Arquivos aceitos: `AGENT.md`, `rubrica.md`, `schema.json`, `evals/*.json`, `LICENSE` (ou `.md`/`.txt`) e `README.md`, opcionalmente dentro de uma única pasta de topo. Outros arquivos são ignorados; **qualquer script ou código (`.sh`, `.js`, `.py`, `.exe`…) recusa o pacote inteiro**.
- O pacote precisa declarar `nivel: experimental` e um `id` que ainda não exista.
- Recusados: caminho absoluto ou com `..` (zip-slip), link simbólico, zip criptografado, compressão estranha, arquivos grandes demais, mais de 24 arquivos, chaves de permissão no frontmatter.
- O que entra: a tela mostra o que o pacote declara, o **hash** e a licença; o servidor revalida tudo; o pacote fica **desligado** até você ligar confirmando o hash.
- Texto do pacote nunca muda papel, capacidades ou roteamento (o corpo é dado; as regras do host vêm por último).

Contribuições ao repositório exigem o CLA (`CLA.md`).
