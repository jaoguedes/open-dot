// SPDX-License-Identifier: AGPL-3.0-only
import { useState } from "react";
import { useApp } from "../store.tsx";
import { api } from "../api.ts";
import "../screens.css";

/** Configurações: só o que existe de verdade; o resto aparece desligado e rotulado. */
export function Settings() {
  const app = useApp();
  const demo = app.mode === "demo";
  const owner = app.snap?.owner ?? null;
  const [name, setName] = useState(owner?.name ?? "");
  const [note, setNote] = useState("");
  async function saveName() {
    if (demo) return setNote("Demonstração: nada é salvo.");
    try {
      await api.updateName(name.trim());
      setNote("Nome salvo.");
    } catch {
      setNote("Não consegui salvar. Use letras, espaço, apóstrofo ou hífen (até 40).");
    }
  }
  async function logoutAll() {
    if (demo) return setNote("Demonstração: nenhuma sessão real.");
    try {
      const r = await api.logoutAll();
      setNote(`${r.removed} ${r.removed === 1 ? "sessão encerrada" : "sessões encerradas"}.`);
      location.assign("/");
    } catch {
      setNote("Não consegui encerrar as sessões. Tente de novo.");
    }
  }
  return (
    <section className="screen screen-narrow" aria-labelledby="settings-title">
      <header className="screen-head">
        <h1 id="settings-title">Configurações</h1>
      </header>
      {note && (
        <p role="status" className="chip">
          {note}
        </p>
      )}
      <h2 className="screen-section">Conta</h2>
      <article className="card stack-10">
        <p className="m-0">{owner?.email ?? (demo ? "Conta de demonstração" : "Sem sessão")}</p>
        <label htmlFor="st-name">Nome na saudação</label>
        <div className="row-actions">
          <input id="st-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          <button className="btn" type="button" onClick={() => void saveName()} disabled={!name.trim()}>
            Salvar
          </button>
        </div>
      </article>
      <h2 className="screen-section">Aparência</h2>
      <article className="card stack-10">
        <label htmlFor="st-theme">Tema</label>
        <select id="st-theme" value={app.prefs.theme} onChange={(e) => app.setPrefs({ theme: e.target.value as "system" })}>
          <option value="system">Seguir o sistema</option>
          <option value="dark">Escuro</option>
          <option value="light">Claro</option>
        </select>
        <label htmlFor="st-motion">Movimento</label>
        <select id="st-motion" value={app.prefs.motion} onChange={(e) => app.setPrefs({ motion: e.target.value as "system" })}>
          <option value="system">Seguir o sistema</option>
          <option value="reduced">Reduzido</option>
          <option value="full">Completo</option>
        </select>
        <p className="tiny">Mascote, acessórios e sons ficam em Mascote.</p>
      </article>
      <h2 className="screen-section">Notificações</h2>
      <article className="card stack-10">
        <div className="row-between">
          <span>Alertas de aprovação no celular (Web Push)</span>
          <span className="status-pill off">Em desenvolvimento · desligado</span>
        </div>
        <p className="tiny">Por enquanto, aprovações aparecem no sino e em Meu dia. Não testado em iPhone.</p>
      </article>
      <h2 className="screen-section">Segurança e dados</h2>
      <article className="card stack-10">
        <button className="btn" type="button" onClick={() => void logoutAll()}>
          Sair de todos os aparelhos
        </button>
        <button className="btn ghost" type="button" onClick={() => app.navigate("/conexoes")}>
          Exportar ou apagar meus dados (em Conexões)
        </button>
      </article>
    </section>
  );
}
