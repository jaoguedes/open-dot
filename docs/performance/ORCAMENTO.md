# Orçamento de desempenho — v0.3

Números definidos a partir do que foi **medido** (ver `BASE_V03.md`), na máquina do João: Mac Intel i7-1060NG7 (8 núcleos lógicos, 16 GB), macOS 15.8.1, em 22/10/2026. Windows e Apple Silicon: **sem teste real**; os tetos abaixo não valem como promessa para eles.

Fonte de verdade em código: `docs/performance/orcamento.json`. Conferência: `npm run perf:check` (falha se estourar).

| Item | Teto | Medido depois (v0.3) | Antes (v0.2) |
|---|---|---|---|
| Runner oculto na bandeja (`--oculto`), CPU média em 30–45 s | 3 % | **0,0–0,1 %** | não medido (sem modo oculto) |
| Runner oculto, memória (soma com WebKit) | 260 MB | 196 MB | — |
| Runner com a central aberta, perfil Leve (Dot a 10 qps), CPU média | 45 % | **36,9–37,5 %** | 120,7 % (assistente a 60 qps) |
| Runner com a central aberta, memória | 280 MB | 224–229 MB | 177 MB |
| Primeira tela do app web (JS) | 400 KB (meta 350) | 363,5 KB | 356,0 KB |
| JavaScript da interface do Runner | 420 KB | 301,4 KB | — |

Outras medidas do Runner depois (60 s, janela visível): assistente de primeiro uso a 10 qps ≈ 86 %; central no perfil Equilibrado (24 qps) 69,5 %; Máximo (60 qps) 104,2 %. **A janela aberta ainda custa caro nesta máquina** porque o WebKit recompõe os desfoques do Dot a cada quadro; o caso comum (Runner fechado na bandeja) fica parado. A memória subiu ~50 MB com os plugins novos (atualização, notificação, início com o sistema) e o amostrador de saúde.

## Regras que o código segue (G2)

- Consulta à fila com recuo: mínimo do perfil quando há trabalho, dobra até o máximo quando ocioso (Leve 5→60 s), o dobro com a janela oculta. Teste: `perf::tests::backoff_grows_caps_and_resets`.
- Janela oculta = quase parada: o Dot e as atualizações da interface pausam (`setPaused`, evento `od-visibility`), a saúde é amostrada 3× mais devagar e o diagnóstico da interface não roda com `document.hidden`.
- Teto de quadros do Dot pelo perfil (`setMaxFps`): Leve 10, Equilibrado 24, Máximo 60.
- Processos do Runner com prioridade baixa (nice 10 no macOS/Linux, abaixo do normal no Windows — Windows sem teste real). Teste: `process::tests::children_run_with_lower_priority`.
- Registros com teto: auditoria rotaciona em 256 KB (já existia); saída das ferramentas limitada em bytes e tempo (já existia).

## O que não foi medido

- Uso real com tarefas rodando por horas (só há a garantia por teste de que nada cresce sem teto nos registros).
- Bateria e temperatura em outras plataformas; Windows e Apple Silicon como um todo.
- Navegador real com GPU para o app web (a medição usa Chromium sem GPU).
