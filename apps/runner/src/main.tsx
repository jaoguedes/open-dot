import { Mechanisms } from "../../web/src/components/Mechanisms.tsx";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { toVisual } from "@open-dot/core";
import { AgentDot } from "../../web/src/dot/AgentDot.tsx";
import { invoke, nativeAvailable, type LocalDiagnostics } from "./bridge.ts";
import "../../web/src/theme.css";
import "./runner.css";

const STEPS = ["Bem-vindo", "Conheça o Runner", "Ambiente", "Conexão", "Pastas", "Conclusão"];
function RunnerApp() {
  const [step, setStep] = useState(0);
  const [diagnostics, setDiagnostics] = useState<LocalDiagnostics | null>(null);
  const [origin, setOrigin] = useState("");
  const [name, setName] = useState("Meu computador");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const native = nativeAvailable();
  useEffect(() => {
    if (!native) return;
    let active = true;
    async function refresh() {
      try {
        const d = await invoke<LocalDiagnostics>("diagnostics");
        if (active) setDiagnostics(d);
      } catch {
        if (active) setDiagnostics(null);
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [native]);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  async function act(command: "diagnostics" | "choose_folder" | "revoke_folder" | "pair_begin" | "pair_confirm" | "pair_disconnect", args?: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (command === "pair_begin") {
        const result = await invoke<{ code: string }>(command, args);
        setCode(result.code);
      } else if (command !== "diagnostics") {
        await invoke(command, args);
        if (command === "pair_disconnect" || command === "pair_confirm") setCode("");
      }
      setDiagnostics(await invoke<LocalDiagnostics>("diagnostics"));
    } catch (e) {
      setError(typeof e === "string" ? e : "Não consegui concluir a operação local. Confira o estado antes de tentar novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="runner-shell">
      <header>
        <span className="runner-wordmark">
          open<b>dot</b> <small>RUNNER</small>
        </span>
        <span className="runner-chip">
          {native ? `Aplicativo local · ${diagnostics?.channel?.online ? "conectado" : diagnostics?.paired ? "sem confirmação de rede" : "sem vínculo"}` : "Prévia web · recursos locais indisponíveis"}
        </span>
      </header>
      <nav aria-label="Etapas de configuração">
        {STEPS.map((name, i) => (
          <button key={name} aria-label={`Etapa ${i + 1}: ${name}`} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}>
            {String(i + 1).padStart(2, "0")} <span>{name}</span>
          </button>
        ))}
      </nav>
      <section className="runner-stage">
        <div className="runner-host">
          <AgentDot visual={toVisual("dot", error ? "error" : diagnostics?.activeTask?.phase === "awaiting_approval" ? "waiting" : diagnostics?.activeTask ? "working" : busy ? "thinking" : "idle")} accessory="none" size={320} reducedMotion={reduced} interactive />
          <p>
            Seu contexto.
            <br />
            <em>Um companheiro.</em>
          </p>
        </div>
        <div className="runner-copy">
          <p className="runner-kicker">
            {step + 1} DE 6 · {STEPS[step]}
          </p>
          {step === 0 && (
            <>
              <h1>O Dot tem um lugar no seu computador.</h1>
              <p>Prepare um espaço local, com calma e permissões claras. Você escolhe por onde começar.</p>
            </>
          )}
          {step === 1 && (
            <>
              <h1>Perto dos seus projetos.</h1>
              <p>O canal de pareamento usa autenticação de dispositivo e permite revogar o vínculo pelo Workspace. O Codex oferece edição com aprovação em worktree no macOS após verificar o sandbox. Outros mecanismos e comandos de projeto permanecem desabilitados.</p>
              <p>Ao fechar a janela, o Runner fica no tray. Use “Abrir” para voltar ou “Sair do Runner” para encerrar. As rotinas remotas continuam no Open Dot.</p>
            </>
          )}
          {step === 2 && (
            <>
              <h1>Vamos conferir o ambiente.</h1>
              <Mechanisms />
              <button disabled={!native || busy} onClick={() => void act("diagnostics")}>
                {busy ? "Verificando…" : "Verificar ambiente local"}
              </button>
              {diagnostics && (
                <dl>
                  <dt>Sistema</dt>
                  <dd>
                    {diagnostics.os} · {diagnostics.arch}
                  </dd>
                  <dt>Runner</dt>
                  <dd>{diagnostics.version}</dd>
                  <dt>Mecanismos</dt>
                  <dd>
                    {diagnostics.drivers.length
                      ? diagnostics.drivers.map((d) => (
                          <p key={d.id} data-mechanism={d.id}>
                            <b>{d.id}</b> · {d.installed ? (d.authenticated ? "autenticado" : "login não confirmado") : "não instalado"}
                            <br />
                            {d.reason}
                          </p>
                        ))
                      : "Diagnóstico em andamento. Atualize em alguns segundos."}
                  </dd>
                </dl>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <h1>Uma conexão de confiança.</h1>
              <p>Digite a origem HTTPS do seu Open Dot. Confira esse endereço: o Runner se conectará a ele. Confirme o código e o nome no Workspace autenticado em até cinco minutos.</p>
              <label htmlFor="runner-origin">Endereço do Open Dot</label>
              <input id="runner-origin" type="url" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder="https://seu-open-dot.example" />
              <label htmlFor="runner-name">Nome deste computador</label>
              <input id="runner-name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
              <button disabled={!native || busy || !origin || !name || diagnostics?.paired} onClick={() => void act("pair_begin", { origin, name })}>
                Gerar código de pareamento
              </button>
              {code && (
                <>
                  <p>
                    Código de uso único: <code>{code}</code>
                  </p>
                  <p>
                    Nome a confirmar: <b>{name}</b>
                  </p>
                  <button disabled={busy} onClick={() => void act("pair_confirm")}>
                    Já confirmei no Workspace
                  </button>
                </>
              )}
              {diagnostics?.channel && <p role="status">{diagnostics.channel.message || "Sem vínculo."}</p>}
              <button disabled={!native || busy} onClick={() => void act("diagnostics")}>
                Atualizar conexão
              </button>
              <button disabled={!native || busy} onClick={() => void act("pair_disconnect")}>
                Remover vínculo local
              </button>
              <p className="runner-note">O token fica no cofre do sistema. Para invalidar o dispositivo no servidor, use “Revogar” no Workspace. A prévia web não pareia.</p>
            </>
          )}
          {step === 4 && (
            <>
              <h1>Você escolhe as pastas.</h1>
              <p>
                A escolha abre o seletor do sistema. A permissão fica registrada localmente; o caminho completo permanece no aplicativo. Só o nome e um identificador opaco são enviados ao Open Dot
                pareado.
              </p>
              <button disabled={!native || busy} onClick={() => void act("choose_folder")}>
                Escolher pasta permitida
              </button>
              <button disabled={!native || busy} onClick={() => void act("diagnostics")}>
                Atualizar permissões
              </button>
              {diagnostics?.folders.length ? (
                <ul>
                  {diagnostics.folders.map((folder, index) => (
                    <li key={folder}>
                      <span>{folder}</span>
                      <button disabled={busy} onClick={() => void act("revoke_folder", { index })}>
                        Revogar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="runner-note">Nenhuma pasta carregada. Atualize para conferir as permissões salvas.</p>
              )}
            </>
          )}
          {step === 5 && (
            <>
              <h1>Base preparada. Você no controle.</h1>
              <p>Confira o ambiente e as pastas a qualquer momento. O pareamento pode ser conferido na etapa Conexão. O modo inicial do Codex gera propostas sem shell. Aprove os conteúdos exatos no Workspace para aplicá-los ao worktree. Início com o sistema ainda não está disponível.</p>
              <p className="runner-note">
                Últimas execuções: nenhuma. Eventos de início e mudanças de permissão são gravados em audit.jsonl na pasta de dados do aplicativo, sem caminhos ou conteúdo.
              </p>
              <button onClick={() => setStep(2)}>Revisar ambiente</button>
            </>
          )}
          {error && (
            <p role="alert" className="runner-error">
              {error}
            </p>
          )}
          <footer>
            {step > 0 && <button onClick={() => setStep(step - 1)}>Voltar</button>}
            {step < 5 && (
              <button className="runner-primary" onClick={() => setStep(step + 1)}>
                {step === 3 ? "Preparar sem conexão" : "Continuar"}
              </button>
            )}
          </footer>
        </div>
      </section>
      <p className="runner-note">Beta em desenvolvimento · edição Codex com aprovação no macOS · sem shell ou execução de testes de projeto.</p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<RunnerApp />);
