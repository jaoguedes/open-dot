# Registro de decisões técnicas

Formato: contexto → decisão → consequência. Novas decisões entram no fim. Revisões do PDF estão em `REVISAO_DO_PDF.md`.

### D-001 · Um Worker do Cloudflare para interface, API e cron (13/10/2026)
- **Contexto:** as rotinas precisam rodar com o Mac desligado, a custo zero. O Vercel Hobby limita o cron e o Render dorme.
- **Decisão:** um único Worker gratuito serve os arquivos estáticos (`apps/web/dist`), a API (`/api/*`) e um Cron Trigger de 5 em 5 minutos.
- **Consequência:** só dois provedores de infraestrutura (Cloudflare e Turso). Limites que importam: 10 ms de CPU e 50 subrequisições por invocação.

### D-002 · Sem Cloudflare Queues no MVP (13/10/2026)
- **Decisão:** o banco é a autoridade. Cada execução tem chave única por slot, lease e compare-and-set de versão. O próprio cron processa as execuções vencidas.
- **Consequência:** menos um serviço e menos uma cota para acompanhar. A fila volta se houver carga que justifique.

### D-003 · Turso via HTTP (Hrana) sem SDK (13/10/2026)
- **Decisão:** cliente próprio em `apps/worker/src/db/hrana.ts`, que usa o `/v2/pipeline` documentado e faz transação com batch condicional. No desenvolvimento local, o mesmo contrato roda sobre SQLite (`node:sqlite`).
- **Consequência:** zero dependências e testável offline com um servidor Hrana simulado. Ainda falta o teste contra o Turso real.

### D-004 · esbuild no lugar do Vite (13/10/2026)
- **Contexto:** sem acesso ao registro npm na sessão de criação. O esbuild estava disponível e é o motor que o Vite usa.
- **Decisão:** `scripts/build.mjs` gera o build e `scripts/dev.ts` sobe o servidor local (interface + API + agendador num processo).
- **Consequência:** dá para trocar pelo Vite depois sem mexer no código React.

### D-005 · Gmail primeiro, só metadados e trecho (13/10/2026)
- **Decisão:** a primeira integração completa é o Gmail com `gmail.readonly`, lendo `format=metadata` e o `snippet`. Corpo e anexos não são baixados. Outlook adiado.
- **Consequência:** menos dados privados guardados. A cobertura do resumo declara os campos lidos.

### D-006 · App OAuth publicado “Em produção” sem verificação (13/10/2026)
- **Contexto:** no modo *Testing*, o refresh token com escopos do Gmail expira em 7 dias (documentação oficial).
- **Decisão:** usar a exceção de uso pessoal: publicar o app, aceitar a tela de “app não verificado” e restringir a entrada a um único dono.
- **Consequência:** a reconexão só é pedida em caso de revogação, troca de senha, 6 meses sem uso ou o limite de 100 tokens por cliente.

### D-007 · IA só por provedor aprovado por tipo de dado (13/10/2026)
- **Decisão:** a allowlist começa só com o Groq Free (gpt-oss-20b/120b). E-mails privados só vão para lá depois que o ZDR for confirmado pelo João. O Gemini Free fica fora dos dados privados. Sem fallback pago.
- **Consequência:** sem chave ou sem ZDR, a triagem por regras continua funcionando.

### D-008 · Dot: tracinho de absorção permanente (13/10/2026)
- **Contexto:** os capítulos 36 e 39 do PDF tinham trocado a fenda por uma depressão temporária. O João pediu explicitamente para preservar o tracinho do catálogo.
- **Decisão:** a malha `Slot` é permanente e fica no alto da face frontal. A forma `Absorb_Receive` e o brilho do runtime marcam a absorção.
- **Consequência:** o validador recusa nós de boca ou sobrancelha. O tracinho não é boca.

### D-009 · Clipes do Dot em duas camadas (13/10/2026)
- **Decisão:** `body_*` anima o rig e `face_*` anima os morphs de uma única malha `Eyes`. Os estados combinam as duas camadas pelo `STATE_MAP` do manifesto.
- **Consequência:** evita conflito de nomes de Action e de slots no Blender 4.4+ e permite corpo e rosto simultâneos sem disputa no `AnimationMixer`.

### D-010 · Projeto em `~/open-dot`, separado de Mascot Desk e OpenMascot (13/10/2026)
- **Decisão:** o Open Dot começa do zero, porque a base “v0.2” citada no PDF não existe no Mac. O “Dot” do Mascot Desk, com mãos e indicador flutuante, é outro personagem e não foi reaproveitado.
- **Consequência:** nenhum arquivo dos outros projetos foi alterado.

### D-011 · Posters do Dot com Cycles na CPU (13/10/2026)
- **Contexto:** em `--background`, o EEVEE (GPU/Metal) levou ~4 min por poster com 64 amostras e travou de vez num render de 64 px, provavelmente com a tela do Mac bloqueada.
- **Decisão:** os posters usam Cycles na CPU (32 amostras, denoise) e só três renders de 512 px; 160/64/32 px são reduções do poster de frente.
- **Consequência:** build completo em ~3 min, sem depender da GPU. O GLB não muda: só o render de conferência.

### D-012 · three.js sob demanda e um único canvas (13/10/2026)
- **Contexto:** o three.js minificado tem ~620 KB; a maior parte das telas não mostra o Dot grande.
- **Decisão:** o runtime 3D (`apps/web/src/dot3d/DotScene.ts`) é importado dinamicamente pelo `Dot3D.tsx` (esbuild com `splitting`). Só a página Mascote usa o 3D por enquanto; ícones da barra lateral, cabeçalho e ilha continuam no 2D. Um segundo `Dot3D` montado ao mesmo tempo cai para o 2D (“busy”).
- **Consequência:** o bundle inicial não cresce. Levar o 3D para a ilha é uma decisão de produto posterior (custo de GPU contínuo).

### D-013 · Repouso sem loop de render (13/10/2026)
- **Decisão:** em repouso o Dot não renderiza continuamente: só desenha quando algo muda (estado, olhar, carinho, toque, redimensionamento) e numa piscada a cada 3–6 s. “Pensando” e “trabalhando” rodam a até 30 fps.
- **Consequência:** a respiração `body_idle_breathe` só aparece durante transições. Se o João quiser respiração contínua, ela custa um loop de 30 fps (ou um modo de 10–15 fps a medir).
