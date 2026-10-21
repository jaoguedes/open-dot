import { useState } from "react";
import { AGENTS, toVisual, type Accessory, type AgentId, type SemanticState, agentsInPlace } from "@open-dot/core";
import { useApp } from "../store.tsx";
import { AgentDot } from "@open-dot/mascot";
import { CROWN_UNLOCKED } from "@open-dot/mascot";
import { MAX_VOLUME, SOUND_NAMES, sound, type SoundName } from "../sound.ts";

const STATES: Array<{ id: SemanticState; label: string }> = [
  { id: "idle", label: "Em repouso" },
  { id: "thinking", label: "Pensando" },
  { id: "working", label: "Trabalhando" },
  { id: "waiting", label: "Esperando seu OK" },
  { id: "question", label: "Perguntando" },
  { id: "success", label: "Concluído" },
  { id: "error", label: "Com erro" },
  { id: "disconnected", label: "Sem conexão" },
  { id: "sleep", label: "Dormindo" },
];

export function Mascot() {
  const app = useApp();
  const [agent, setAgent] = useState<AgentId>("dot");
  const [state, setState] = useState<SemanticState>("idle");
  const [signal, setSignal] = useState(0);
  const [note, setNote] = useState("");
  const [hat, setHat] = useState<Accessory | "agent">("agent");
  const [newsPulse, setNewsPulse] = useState(false);
  const visual = toVisual(agent, state);
  const accessory = hat === "agent" ? app.accessoryFor(agent) : hat;

  return (
    <>
      <h1>Mascote & aparência</h1>
      <p className="meta intro-gap">Motor em código (superelipse). Toque, três toques (tonto) e carinho. O GLB/three.js fica atrás de DOT_RENDERER=glb e não carrega neste caminho.</p>

      <section className="card mascot-stage" aria-label="Prévia do Dot">
        <AgentDot
          visual={visual}
          accessory={accessory}
          antennaPulse={newsPulse}
          size={220}
          reducedMotion={app.reducedMotion}
          interactive
          affectionSignal={signal}
          onAffection={(r) => setNote(r === "ok" ? "" : r === "suppressed" ? "Carinho não aparece durante erro, aprovação ou desconexão." : r === "cooldown" ? "Aguarde um instante." : "")}
          ring={agent === "sentinela" && (state === "working" || state === "thinking")}
        />
        <div className="text-center">
          <h2>{AGENTS[agent].name}</h2>
          <p className="meta">{visual.label}</p>
        </div>
        <div className="row-actions justify-center">
          <button className="btn" onClick={() => setSignal((n) => n + 1)}>
            Fazer carinho
          </button>
        </div>
        {note && (
          <p role="status" className="tiny">
            {note}
          </p>
        )}
      </section>

      <div className="mascot-grid mt-16">
        <fieldset className="card">
          <legend className="tiny">Agente (cor e acessório)</legend>
          {agentsInPlace("mascot").map((a) => (
            <label className="choice-row" key={a}>
              <input type="radio" name="agent" checked={agent === a} onChange={() => setAgent(a)} /> {AGENTS[a].name}
            </label>
          ))}
        </fieldset>
        <fieldset className="card">
          <legend className="tiny">Guarda-roupa (peças pelo contorno da cabeça)</legend>
          {(
            [
              ["agent", "Do agente"],
              ["beanie", "Gorro de gatinho"],
              ["bucket", "Bucket"],
              ["antenna", "Antena (Notícias)"],
              ["visor", "Viseira (Mercado)"],
              ["beret", "Boina (Marketing)"],
              ["crown", "Coroa (conquista)"],
            ] as const
          ).map(([id, lab]) => (
            <label className="choice-row" key={id}>
              <input type="radio" name="hat" checked={hat === id} disabled={id === "crown" && !CROWN_UNLOCKED} onChange={() => setHat(id)} />
              {lab}
              {id === "crown" && !CROWN_UNLOCKED ? " — desligada até existir a regra" : ""}
            </label>
          ))}
          <label className="choice-row">
            <input type="checkbox" checked={newsPulse} onChange={(e) => setNewsPulse(e.target.checked)} />
            Notícia importante (antena pisca)
          </label>
        </fieldset>
        <fieldset className="card">
          <legend className="tiny">Estado (prioridade: erro &gt; aprovação &gt; conexão &gt; execução)</legend>
          {STATES.map((s) => (
            <label className="choice-row" key={s.id}>
              <input type="radio" name="state" checked={state === s.id} onChange={() => setState(s.id)} /> {s.label}
            </label>
          ))}
        </fieldset>
      </div>

      <section className="card mt-16" aria-label="Preferências">
        <h2>Preferências</h2>
        <div className="switch">
          <label htmlFor="pf-theme">Tema</label>
          <select id="pf-theme" value={app.prefs.theme} onChange={(e) => app.setPrefs({ theme: e.target.value as "system" })}>
            <option value="system">Do sistema</option>
            <option value="light">Claro</option>
            <option value="dark">Escuro</option>
          </select>
        </div>
        <div className="switch">
          <label htmlFor="pf-motion">Movimento</label>
          <select id="pf-motion" value={app.prefs.motion} onChange={(e) => app.setPrefs({ motion: e.target.value as "system" })}>
            <option value="system">Seguir o sistema</option>
            <option value="reduced">Reduzido</option>
            <option value="full">Completo</option>
          </select>
        </div>
        <div className="switch">
          <label htmlFor="pf-tr">Reduzir transparência</label>
          <input id="pf-tr" type="checkbox" checked={app.prefs.transparency === "reduced"} onChange={(e) => app.setPrefs({ transparency: e.target.checked ? "reduced" : "system" })} />
        </div>
        <div className="switch">
          <label htmlFor="pf-acc">Mostrar acessórios dos agentes</label>
          <input id="pf-acc" type="checkbox" checked={app.prefs.accessories} onChange={(e) => app.setPrefs({ accessories: e.target.checked })} />
        </div>
        <p className="tiny mt-8">Preferências ficam neste navegador. Sem boca e sem sobrancelhas. O tracinho só aparece durante a absorção.</p>
      </section>

      <SoundSettings />
    </>
  );
}

const SOUND_LABEL: Record<SoundName, string> = {
  "dot-hello": "Oi",
  "dot-think": "Começou",
  "dot-done": "Concluído",
  "dot-attention": "Precisa de você",
  "dot-error": "Erro",
  "dot-send": "Enviar pergunta",
  "dot-receive": "Resposta",
  "dot-tap": "Toque",
  "dot-love": "Carinho",
  "dot-sleep": "Dormindo",
  "dot-pop": "Abrir",
  "dot-close": "Fechar",
  "dot-notify": "Item novo",
};

/** Sons do Dot (E7): chave, volume e "Ouvir" para cada som. Desligado por padrão. */
function SoundSettings() {
  const app = useApp();
  const [msg, setMsg] = useState<string | null>(null);
  const listen = (name: SoundName) => {
    sound.unlock();
    const r = sound.preview(name);
    setMsg(r === "played" ? null : r === "hidden" ? "A aba está oculta." : "Espere um instante.");
  };
  return (
    <section className="card mt-16" aria-labelledby="h-sons">
      <h2 id="h-sons">Sons do Dot</h2>
      <div className="switch">
        <label htmlFor="pf-sound">Sons do Dot</label>
        <input id="pf-sound" type="checkbox" role="switch" checked={app.prefs.sound} onChange={(e) => (sound.unlock(), app.setPrefs({ sound: e.target.checked }))} />
      </div>
      <div className="switch">
        <label htmlFor="pf-volume">Volume</label>
        <input
          id="pf-volume"
          type="range"
          min={0}
          max={MAX_VOLUME}
          step={0.05}
          value={app.prefs.soundVolume}
          aria-valuetext={`${Math.round((app.prefs.soundVolume / MAX_VOLUME) * 100)}%`}
          onChange={(e) => app.setPrefs({ soundVolume: Number(e.target.value) })}
        />
      </div>
      <p className="tiny">{app.prefs.sound ? "Ligados. Nunca tocam com a aba oculta e no máximo dois por segundo." : "Desligados. Use Ouvir para conhecer cada som."}</p>
      <ul className="sound-list">
        {SOUND_NAMES.map((n) => (
          <li key={n}>
            <span>{SOUND_LABEL[n]}</span>
            <button className="btn ghost" type="button" onClick={() => listen(n)} aria-label={`Ouvir: ${SOUND_LABEL[n]}`}>
              Ouvir
            </button>
          </li>
        ))}
      </ul>
      {msg && (
        <p className="tiny" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
