import { Mechanisms } from "../components/Mechanisms.tsx";
import { AgentDot } from "../dot/AgentDot.tsx";
import { useApp } from "../store.tsx";
import "../workspace.css";
export function Runner() {
  const app = useApp();
  return (
    <section className="runner-page">
      <div className="ws-host">
        <AgentDot visual={app.visualFor("dot")} accessory="none" size={300} reducedMotion={app.reducedMotion} interactive />
        <div>
          <p className="ws-eyebrow">OPEN DOT RUNNER</p>
          <h1>Seu Dot, mais perto.</h1>
          <p className="lead">Uma base local para os seus agentes.</p>
          <p className="meta">O painel continua cuidando das rotinas remotas. O Runner prepara um espaço separado no seu computador.</p>
          <span className="chip">Confira os vínculos no Workspace</span>
        </div>
      </div>
      <Mechanisms />
      <div className="runner-grid">
        <article className="card">
          <h2>Instalação</h2>
          <p>Não verificada neste navegador.</p>
          <p className="tiny">O painel não procura processos ou pastas no seu computador.</p>
        </article>
        <article className="card">
          <h2>Conexão</h2>
          <p>Código de uso único, confirmação na sessão web e revogação por dispositivo.</p>
          <button className="btn" onClick={() => app.navigate("/workspace")}>
            Parear no Workspace
          </button>
        </article>
        <article className="card">
          <h2>Mecanismos</h2>
          <p>Diagnóstico nativo de instalação e login. Execução de tarefas bloqueada.</p>
          <p className="tiny">Nenhum comando local é executado por esta base.</p>
        </article>
      </div>
      <section className="card">
        <h2>Como começar</h2>
        <ol className="ws-steps">
          <li>Instale o aplicativo de teste gerado pelo GitHub Actions.</li>
          <li>Abra o Runner e confira o ambiente local.</li>
          <li>Escolha as pastas pelo seletor nativo. Você pode revogar cada permissão.</li>
          <li>No Runner, informe o endereço HTTPS do seu Open Dot e gere um código. Confirme o código e o nome no Workspace, volte ao Runner e confirme o vínculo.</li>
        </ol>
        <p className="meta">
          Nenhum instalador foi publicado nesta sessão. A base desktop oferece pareamento, cofre nativo, heartbeat, diagnóstico, permissões de pastas e presença no tray; execução de agentes e autostart ainda não estão disponíveis.
        </p>
      </section>
      <button className="btn" onClick={() => app.navigate("/workspace")}>
        Ir ao Workspace
      </button>
    </section>
  );
}
