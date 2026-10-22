// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Página pública (v0.3, 5.5): abre sem login. Proposta honesta, estado do projeto, instalação em
 * dois passos, licenças e links. Sem depoimentos, métricas inventadas, logotipos de marcas ou
 * contagem de agentes como argumento.
 */
import { toVisual } from "@open-dot/core";
import { AgentDot } from "@open-dot/mascot";

const REPO = "https://github.com/jaoguedes/open-dot/blob/main";

const STATE: Array<[string, string]> = [
  ["Testado", "App web e Worker (testes automáticos e de interface), Correio só leitura, Runner no Mac Intel, Codex como ferramenta local."],
  ["Sem teste real", "Claude Code (desligado por padrão), Runner no Apple Silicon e no Windows, atualização automática de ponta a ponta."],
  ["Simulado", "Comparações do orquestrador, calibração, ciclo de correção e paralelismo só leitura."],
  ["Planejado", "Gemini CLI e Cursor (até haver modo só leitura verificável), RSS próprio, instaladores assinados."],
  ["Bloqueado", "Rodar testes do projeto em cópia isolada (sem contenção comprovada sem custo)."],
];

export function About() {
  const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return (
    <article className="legal landing">
      <section className="landing-hero">
        <div>
          <p className="mono-label">SEU CONTEXTO. UM COMPANHEIRO.</p>
          <h1>Open Dot</h1>
          <p className="lead">O resultado depende menos do modelo e mais da equipe e da configuração: o Dot monta a equipe certa com as ferramentas que você já tem, na sua máquina.</p>
          <p>Beta de código aberto. Nada sai do seu computador ou é enviado em seu nome sem a sua aprovação do conteúdo exato. Custo recorrente: R$ 0, dentro das franquias gratuitas.</p>
          <div className="row-actions">
            <a className="btn primary" href="/">
              Entrar
            </a>
            <a className="btn" href="/privacidade">
              Política de privacidade
            </a>
          </div>
        </div>
        <AgentDot visual={toVisual("dot", "idle")} accessory="none" size={170} reducedMotion={reduced} label="Dot, o mascote do Open Dot" />
      </section>

      <h2>Estado do projeto (beta)</h2>
      <dl className="landing-state">
        {STATE.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>

      <h2>Instalar em dois passos</h2>
      <ol>
        <li>
          <b>Instale o Runner</b> pelo instalador do release do projeto e confira o hash publicado ao lado. No macOS 15 ou mais novo, o instalador ainda não é assinado pela Apple: na primeira abertura, vá em Ajustes do Sistema → Privacidade e Segurança → <b>Abrir mesmo assim</b>.
        </li>
        <li>
          <b>Conecte:</b> o Runner mostra um código de uso único que vale por poucos minutos; confirme o código e o nome do computador na tela Runner do seu Open Dot.
        </li>
      </ol>
      <p>Plataformas: macOS Intel testado; macOS Apple Silicon e Windows compilam, mas estão sem teste real; Linux fora do escopo. Também dá para rodar tudo localmente: Node 22.13 ou mais novo, <code>npm install</code> e <code>npm run dev</code>.</p>

      <h2>Licenças</h2>
      <ul>
        <li>Código: AGPL-3.0-only (texto oficial em LICENSE).</li>
        <li>Licença comercial disponível para quem não pode cumprir a AGPL (modelo ainda sem revisão jurídica).</li>
        <li>O Dot (mascote, arte e animação) é só para visualização: não pode ser copiado nem reutilizado; forks trocam o mascote.</li>
      </ul>
      <p>
        Leia{" "}
        <a href={`${REPO}/README.md`} rel="noopener noreferrer" target="_blank">
          README
        </a>
        ,{" "}
        <a href={`${REPO}/SECURITY.md`} rel="noopener noreferrer" target="_blank">
          SECURITY
        </a>{" "}
        e{" "}
        <a href={`${REPO}/CONTRIBUTING.md`} rel="noopener noreferrer" target="_blank">
          CONTRIBUTING
        </a>{" "}
        no repositório (os links funcionam quando ele estiver público).
      </p>
      <p className="tiny">Open Dot não é afiliado à Anthropic, OpenAI, Google nem Cursor. Os nomes das ferramentas aparecem só para dizer com quais o Runner sabe conversar no seu computador.</p>
    </article>
  );
}
