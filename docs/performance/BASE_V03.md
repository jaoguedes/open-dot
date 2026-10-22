# Linha de base de desempenho — antes do v0.3 (22/10/2026)

Medido na máquina do João: **Mac Intel** (x86_64, Intel Core i7-1060NG7 1,2 GHz, 8 núcleos lógicos, 16 GB), **macOS 15.8.1**. Windows e Apple Silicon: **sem teste real**.

## Runner (binário de release de `release/v0.2`, `cargo build --release --locked`)

Comando: `node scripts/perf/measure-runner.mjs --seconds 60`. HOME/CODEX_HOME descartáveis (sem conta, sem pareamento), janela visível no assistente de configuração, 15 s de aquecimento e 30 amostras de `ps` a cada 2 s. Soma do processo do Runner e dos processos WebKit que nasceram para ele.

| Medida | Valor |
|---|---|
| Abertura (processo → `runner_started` gravado) | 1.493 ms |
| CPU média em repouso (janela visível) | **120,7 %** (pico 127,5 %) |
| Memória residente (soma) | 177 MB (estável: 176 MB no fim) |
| Acordadas ociosas por segundo (processo do Runner) | 65 |

**Causa encontrada:** quase toda a CPU é do processo de GPU do WebKit (~107–110 %), com ~10 % do processo de conteúdo e ~2 % do próprio Runner. O assistente mostra o Dot a 320 px animando a 60 quadros/s, com desfoques SVG (`feGaussianBlur`) recompostos a cada quadro. É o principal motivo para o Runner pesar numa máquina sem GPU forte.

Também medido no código: o Runner consulta a fila a cada **2 s** fixos (`main.rs`), envia batimento a cada 5 s e redetecta ferramentas a cada 60 s, com ou sem janela, com ou sem tarefa.

Janela oculta (fechar → bandeja): não medida aqui (o binário não oferece como ocultar sem interação); fica para a medição depois da otimização, com o comando de ocultar do próprio Runner.

## App web (servidor `npm run demo`, Chromium headless com renderização por software)

Comando: `UI_BASE=http://localhost:8794 node scripts/perf/measure-web.mjs`. CPU = `TaskDuration` do CDP em 10 s parado; “aba oculta” = 5 s depois de `visibilitychange` para oculto.

| Largura | Rota | Carga (ms) | CPU em repouso | CPU com aba oculta | Heap JS |
|---|---|---|---|---|---|
| 390 | `/` (Meu dia) | 1.160 | 3,9 % | 0,0 % | 17 MB |
| 390 | `/workspace` | 713 | 3,2 % | 0,0 % | 18 MB |
| 768 | `/` | 947 | 5,1 % | 0,6 % | 20 MB |
| 768 | `/workspace` | 885 | 5,7 % | 0,5 % | 14 MB |
| 1440 | `/` | 1.066 | 4,8 % | 0,4 % | 20 MB |
| 1440 | `/workspace` | 931 | 7,2 % | 0,4 % | 16 MB |

Primeira tela do build de produção (`npm run build`): **356,0 KB** de JavaScript (meta 350 KB, teto 400 KB; aviso preexistente do v0.2).

Os valores web servem para comparar antes/depois nesta máquina; não são o consumo de um navegador real com GPU.
