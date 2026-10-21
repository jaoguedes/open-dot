# Visão do orquestrador

O Dot recebe uma ideia, vê quais ferramentas de IA de programação você já tem instaladas e logadas no seu computador, diz o que funciona e como configurar o resto, e divide o trabalho entre elas com **especialistas** (perfis densos: Produto, Pesquisa, Design, Desenvolvedor, QA).

Princípios:

- **Local e seu.** O Runner abre os CLIs oficiais com o login de quem usa. A nuvem nunca vê login, token ou sessão de ferramenta.
- **Sequencial em código.** Um passo por vez, todos lendo a mesma ideia e as saídas anteriores. Paralelismo, se vier, só em pesquisa e revisão somente leitura.
- **Agente é perfil, não chamada.** O custo está nas chamadas; o catálogo de agentes pode crescer sem aumentar o custo.
- **Evidência acima de opinião.** Fatos do fabricante com fonte e data; resultados medidos na sua máquina; nada de “ferramenta X é melhor” embutido.
- **Honesto.** O que não foi verificado fica indisponível. O que não foi medido não vira promessa.
- **R$ 0.** Nada pago por padrão; login por chave de API é tratado como possivelmente pago e não é usado.
