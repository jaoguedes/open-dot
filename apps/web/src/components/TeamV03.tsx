// SPDX-License-Identifier: AGPL-3.0-only
/**
 * Equipe v0.3: receitas, os especialistas (nível, versão, hash, ligar/desligar), ajustes do motor
 * (calibração, ciclo Corretor, sugestão de skill) e propostas de skill. Tudo que muda comportamento
 * começa desligado; a demonstração não salva nada.
 */
import { useEffect, useState } from "react";
import { Chip, MonoLabel } from "./ui.tsx";
import { DEMO_RECIPES } from "../demo.ts";

async function call<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: { "x-open-dot": "1", ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(typeof data.error?.message === "string" ? data.error.message : "Não consegui falar com o servidor.");
  return data as T;
}

export interface Recipe {
  id: string;
  nome: string;
  descricao?: string;
  agentes?: string[];
  estimativa?: number;
  modo?: string;
  hash?: string;
}
interface AgentRow {
  id: string;
  descricao: string;
  nivel: string;
  versao: string;
  papel: string;
  hash: string;
  tamanho: number;
  origem: "repositorio" | "importado";
  ativo: boolean;
  obrigatorio: boolean;
}
interface Prefs {
  calibracao: boolean;
  cicloCorretor: { ativo: boolean; rodadas: number };
  paraleloSomenteLeitura: boolean;
  sugestaoDeSkill: boolean;
  agentesDesligados: string[];
}
interface Calibration {
  ativa: boolean;
  ciclo: number;
  porque: string[];
  regras: string;
}
interface SkillProposal {
  id: string;
  padrao: string;
  estado: string;
  evidencia: string;
  tipo: string;
  arquivos: Record<string, string>;
  hash: string;
}

export const AGENT_LABEL: Record<string, string> = {
  produto: "Produto",
  pesquisa: "Pesquisa",
  design: "Design",
  desenvolvedor: "Desenvolvedor",
  qa: "QA",
  arquitetura: "Arquitetura",
  seguranca: "Segurança",
  documentacao: "Documentação",
};
const NIVEL: Record<string, string> = { nucleo: "núcleo", verificado: "verificado", experimental: "experimental" };

export function RecipePicker({ demo, value, onChange }: { demo: boolean; value: string; onChange: (id: string, r: Recipe | null) => void }) {
  const [list, setList] = useState<Recipe[]>([]);
  useEffect(() => {
    if (demo) return setList([...DEMO_RECIPES]);
    void call<{ receitas: Recipe[] }>("/api/orchestrator/recipes").then((d) => setList(d.receitas), () => setList([]));
  }, [demo]);
  useEffect(() => {
    if (value && list.length) onChange(value, list.find((r) => r.id === value) ?? null);
    // só quando a lista chega: a escolha vinda da URL ganha os detalhes da receita
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list]);
  const cur = list.find((r) => r.id === value);
  return (
    <section className="card stack-10" aria-labelledby="rec-title">
      <h2 id="rec-title" className="m-0">
        Receitas
      </h2>
      <p className="meta m-0">Sequências prontas de especialistas, só dados. Escolher uma receita monta a equipe; nada roda antes da sua confirmação.</p>
      <div className="chips-row" role="radiogroup" aria-label="Receita">
        <Chip pressed={!value} onClick={() => onChange("", null)}>
          Automática (pelo perfil da ideia)
        </Chip>
        {list.map((r) => (
          <Chip key={r.id} pressed={value === r.id} onClick={() => onChange(r.id, r)}>
            {r.nome}
          </Chip>
        ))}
      </div>
      {cur?.descricao && (
        <p className="tiny m-0">
          {cur.descricao} {cur.modo === "somente-leitura" ? "Somente leitura." : "Propõe mudanças (você aprova pelo hash)."} Estimativa declarada: {cur.estimativa} chamada(s).
          {cur.hash && (
            <>
              {" "}
              Hash <span className="hash">{cur.hash.slice(0, 16)}…</span>
            </>
          )}
        </p>
      )}
    </section>
  );
}

export function EngineSettings({ demo }: { demo: boolean }) {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [cal, setCal] = useState<Calibration | null>(null);
  const [skills, setSkills] = useState<SkillProposal[]>([]);
  const [msg, setMsg] = useState("");
  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (demo) return;
    void (async () => {
      try {
        const [a, p, c, s] = await Promise.all([
          call<{ agentes: AgentRow[] }>("/api/orchestrator/agents"),
          call<{ prefs: Prefs }>("/api/orchestrator/prefs"),
          call<Calibration>("/api/orchestrator/calibration"),
          call<{ propostas: SkillProposal[] }>("/api/orchestrator/skills"),
        ]);
        setAgents(a.agentes);
        setPrefs(p.prefs);
        setCal(c);
        setSkills(s.propostas);
      } catch (e) {
        setMsg(e instanceof Error ? e.message : "Não consegui carregar os ajustes.");
      }
    })();
  }, [demo, rev]);
  async function save(patch: Partial<Prefs> & { consentimento?: string }) {
    if (demo) return setMsg("Demonstração: nada é salvo.");
    try {
      const r = await call<{ prefs: Prefs }>("/api/orchestrator/prefs", "PUT", patch);
      setPrefs(r.prefs);
      setRev((v) => v + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não consegui salvar.");
    }
  }
  async function act(path: string, body: unknown, done: string) {
    try {
      await call(path, "POST", body);
      setMsg(done);
      setRev((v) => v + 1);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não consegui concluir.");
    }
  }
  return (
    <>
      <section className="card stack-10" aria-labelledby="esp-title">
        <h2 id="esp-title" className="m-0">
          Especialistas
        </h2>
        <p className="meta m-0">Perfis densos (instruções, critérios e esquema). Só um perfil entra em cada chamada; a quantidade não é medida de qualidade.</p>
        {demo && <p className="tiny m-0">Demonstração: a lista real vem do servidor.</p>}
        {msg && (
          <p role="status" className="chip m-0">
            {msg}
          </p>
        )}
        <ul className="plain-list">
          {agents.map((a) => (
            <li key={`${a.origem}-${a.id}`} className="row-v3">
              <div className="grow">
                <b>{AGENT_LABEL[a.id] ?? a.id}</b> <span className="sub">· {a.papel} · {NIVEL[a.nivel] ?? a.nivel} · v{a.versao} · {(a.tamanho / 1024).toFixed(1)} KB{a.origem === "importado" ? " · importado" : ""}</span>
                <div className="sub">{a.descricao}</div>
                <div className="sub">
                  Hash <span className="hash">{a.hash.slice(0, 16)}…</span>
                </div>
              </div>
              <label className="row-center-8">
                <input
                  type="checkbox"
                  checked={a.ativo}
                  disabled={a.obrigatorio || a.origem === "importado" || !prefs}
                  aria-label={`${AGENT_LABEL[a.id] ?? a.id} ${a.ativo ? "ligado" : "desligado"}`}
                  onChange={(e) => prefs && void save({ agentesDesligados: e.target.checked ? prefs.agentesDesligados.filter((x) => x !== a.id) : [...prefs.agentesDesligados, a.id] })}
                />
                <span className="tiny">{a.obrigatorio ? "sempre ligado" : a.ativo ? "ligado" : "desligado"}</span>
              </label>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack-10" aria-labelledby="motor-title">
        <h2 id="motor-title" className="m-0">
          Ajustes do motor
        </h2>
        <MonoLabel>TUDO DESLIGADO POR PADRÃO</MonoLabel>
        <label className="row-between">
          <span>Calibração adaptativa (ajusta pesos pelos resultados medidos aqui)</span>
          <input type="checkbox" checked={prefs?.calibracao ?? false} disabled={!prefs} onChange={(e) => void save({ calibracao: e.target.checked })} />
        </label>
        {cal && (
          <div className="tiny">
            <p className="m-0">{cal.regras}</p>
            {cal.porque.length ? (
              <details>
                <summary>Por quê (ciclo {cal.ciclo})</summary>
                <ul>
                  {cal.porque.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <p className="m-0">Sem resultados medidos ainda: todos os fatores ficam neutros.</p>
            )}
            <button className="btn ghost" type="button" disabled={demo} onClick={() => window.confirm("Zerar a calibração? Os fatores voltam ao neutro.") && void act("/api/orchestrator/calibration/reset", { confirmar: "zerar-calibracao" }, "Calibração zerada.")}>
              Zerar calibração
            </button>
          </div>
        )}
        <label className="row-between">
          <span>Ciclo revisar → corrigir (Corretor, em sequência)</span>
          <input type="checkbox" checked={prefs?.cicloCorretor.ativo ?? false} disabled={!prefs} onChange={(e) => prefs && void save({ cicloCorretor: { ...prefs.cicloCorretor, ativo: e.target.checked } })} />
        </label>
        <label className="row-between">
          <span>Rodadas no máximo</span>
          <select value={prefs?.cicloCorretor.rodadas ?? 2} disabled={!prefs} onChange={(e) => prefs && void save({ cicloCorretor: { ...prefs.cicloCorretor, rodadas: Number(e.target.value) } })}>
            {[1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {n} (até {n * 2} chamadas a mais)
              </option>
            ))}
          </select>
        </label>
        <p className="tiny m-0">A avaliação simulada não mostrou ganho real do ciclo nem da calibração; por isso começam desligados (docs/orquestrador/AVALIACAO.md).</p>
        <label className="row-between">
          <span>Sugerir skills a partir das minhas decisões (aprovou, rejeitou, receita)</span>
          <input
            type="checkbox"
            checked={prefs?.sugestaoDeSkill ?? false}
            disabled={!prefs}
            onChange={(e) => {
              if (!e.target.checked) return void save({ sugestaoDeSkill: false });
              if (window.confirm("O Dot vai usar só as suas decisões (aprovou, rejeitou, receita escolhida) para sugerir skills. Nada de e-mail, página ou saída de ferramenta. Tudo fica local e nada vira ativo sem a sua aprovação. Ativar?"))
                void save({ sugestaoDeSkill: true, consentimento: "aprender-com-minhas-decisoes" });
            }}
          />
        </label>
      </section>

      {prefs?.sugestaoDeSkill && (
        <section className="card stack-10" aria-labelledby="skills-title">
          <h2 id="skills-title" className="m-0">
            Sugestões de skill
          </h2>
          {!skills.length && <p className="meta m-0">Nenhum padrão seu repetido o bastante ainda.</p>}
          {skills.map((s) => (
            <article key={s.id} className="card-v3 stack-10">
              <b>{s.evidencia}</b>
              <span className="sub">
                Rascunho de {s.tipo} · experimental · {s.estado} · hash <span className="hash">{s.hash}</span>
              </span>
              <details>
                <summary>Ver o rascunho exato</summary>
                {Object.entries(s.arquivos).map(([k, v]) => (
                  <div key={k}>
                    <code>{k}</code>
                    {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- bloco rolável precisa receber foco pelo teclado (axe: scrollable-region-focusable) */}
                    <pre className="diff-v3" tabIndex={0} aria-label={`Conteúdo de ${k}`}>
                      {v}
                    </pre>
                  </div>
                ))}
              </details>
              {s.estado === "pendente" && (
                <div className="row-actions">
                  <button className="btn approve v3" type="button" onClick={() => void act(`/api/orchestrator/skills/${s.id}/approve`, { hash: s.hash }, "Skill ativada como experimental.")}>
                    Aprovar este rascunho
                  </button>
                  <button className="btn v3" type="button" onClick={() => void act(`/api/orchestrator/skills/${s.id}/forget`, {}, "Esquecido. Esse padrão não volta a ser sugerido.")}>
                    Esquecer isto
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
