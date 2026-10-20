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
  const [commitPreview,setCommitPreview]=useState<{task:string;projectId:string;projectLabel:string;proposalHash:string;baseSha:string;branch:string;subject:string;body:string;proposal:{files:Array<{path:string;content:string;beforeContent?:string}>}}|null>(null);
  const [commitConsent,setCommitConsent]=useState(false),[commitResult,setCommitResult]=useState("");
  async function previewCommit(task:string) {
    setBusy(true);setError("");setCommitPreview(null);setCommitConsent(false);setCommitResult("");
    try {const result=await invoke<NonNullable<typeof commitPreview>>("checkpoint_preview",{task});
      if(!result || result.task!==task || typeof result.projectLabel!=="string" || !/^[a-f0-9-]{36}$/.test(result.projectId) || !/^[a-f0-9]{64}$/.test(result.proposalHash) || typeof result.body!=="string" || !Array.isArray(result.proposal?.files) || !result.proposal.files.length)throw "Prévia incompatível; nenhum commit autorizado.";
      setCommitPreview(result);} catch(e){setError(typeof e==="string"?e:"Prévia não confirmada.");} finally {setBusy(false);}
  }
  async function confirmCommit() {
    if(!commitPreview || !commitConsent)return;
    setBusy(true);setError("");
    try {const result=await invoke<{commitSha:string;branch:string}>("checkpoint_commit",{task:commitPreview.task,proposalHash:commitPreview.proposalHash,consent:"commit-exact-reviewed-files-locally"});setCommitResult(`Commit local confirmado: ${result.commitSha} · ${result.branch}`);setCommitPreview(null);setCommitConsent(false);}
    catch(e){setError(typeof e==="string"?e:"Commit não confirmado. Releia o recibo antes de tentar novamente.");}finally{setBusy(false);}
  }
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
                Revogar acesso e desconectar
              </button>
              <p className="runner-note">O token fica no cofre do sistema. Desconectar solicita revogação ao servidor. Sem rede, a revogação fica pendente e a execução local é bloqueada; confira a confirmação acima. A prévia web não pareia.</p>
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
                Checkpoints registram fases observadas e recibos confirmados; não autorizam repetição de efeitos nem comprovam testes ou commits. Eventos mínimos também ficam no log local, sem conteúdo de tarefas.
              </p>
              <section aria-label="Checkpoints preservados">
                <h2>Checkpoints preservados</h2>
                <button disabled={!native || busy} onClick={() => void act("diagnostics")}>Atualizar checkpoints</button>
                {diagnostics?.checkpoints ? <>
                  {!diagnostics.checkpoints.items.length && <p>Nenhum checkpoint legível encontrado nesta consulta.</p>}
                  <ul>{diagnostics.checkpoints.items.map(c=><li key={c.task}><code>{c.task}</code> · fase {c.phase} · {c.terminalReceipt ? `Recibo confirmado: ${c.terminalReceipt}` : "Sem recibo terminal confirmado"}{c.headSha && <span> · HEAD observado <code>{c.headSha}</code></span>}{c.terminalReceipt==="completed" && <button disabled={!native || busy} onClick={()=>void previewCommit(c.task)}>Revisar commit local</button>}</li>)}</ul>
                  {!!diagnostics.checkpoints.unreadable && <p role="status">Há registros ilegíveis. Preserve os arquivos e revise a recuperação.</p>}
                  {diagnostics.checkpoints.truncated && <p>Consulta limitada a 50 registros; há outros arquivos preservados.</p>}
                </> : <p>Atualize o diagnóstico no desktop para consultar os registros locais.</p>}
              </section>
              {commitPreview && <section aria-label="Revisão de commit local">
                <h2>Revisar commit local</h2><p>Projeto: {commitPreview.projectLabel} · <code>{commitPreview.projectId}</code></p><p>Tarefa: <code>{commitPreview.task}</code>. Branch: <code>{commitPreview.branch}</code>. Base: <code>{commitPreview.baseSha}</code>.</p>
                <p>Mensagem completa do commit:</p><pre>{commitPreview.subject+"\n\n"+commitPreview.body}</pre><p>Autor técnico Open Dot Runner. A confirmação abre um diálogo nativo vinculado a esta tarefa e hash. Sem hooks, filtros, shell, push ou merge.</p>
                <p>Hash da proposta revisada: <code>{commitPreview.proposalHash}</code>. Somente os arquivos abaixo serão incluídos; alterações fora deles ficam preservadas.</p>
                {commitPreview.proposal.files.map(f=><article key={f.path}><h3>{f.path}</h3><p>Antes</p><pre>{f.beforeContent??"Arquivo novo"}</pre><p>Conteúdo completo aprovado para o commit</p><pre>{f.content}</pre></article>)}
                <details open><summary>Conteúdo revisado em JSON escapado</summary><pre>{JSON.stringify(commitPreview.proposal).replace(/[\u007f-\uffff]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,"0")}`)}</pre></details>
                <label><input type="checkbox" checked={commitConsent} onChange={e=>setCommitConsent(e.target.checked)} /> Autorizo somente este commit local, destes bytes, na branch da tarefa. Não autorizo sincronização ou integração.</label>
                <button disabled={busy || !commitConsent} onClick={()=>void confirmCommit()}>Confirmar commit local</button>
                <button disabled={busy} onClick={()=>setCommitPreview(null)}>Fechar revisão</button>
              </section>}
              {commitResult && <p role="status">{commitResult}</p>}
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
