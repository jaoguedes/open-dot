// SPDX-License-Identifier: AGPL-3.0-only
/** Entrada do Runner: painel da bandeja (#painel), assistente no primeiro uso ou a central. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../web/src/theme.css";
import "../../web/src/v03.css";
import "./runner.css";
import { Wizard } from "./Wizard.tsx";
import { Central } from "./Central.tsx";
import { Panel } from "./Panel.tsx";
import { useRunnerData } from "./state.ts";

function Root() {
  const data = useRunnerData();
  const [redo, setRedo] = useState(false);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (location.hash === "#painel") return <Panel data={data} reduced={reduced} />;
  if (data.loading) return <p role="status">Carregando o Runner…</p>;
  // Sem processo nativo (prévia web) ou antes de concluir a configuração: assistente.
  if (!data.companion?.settings.setupDone || redo)
    return (
      <Wizard
        onDone={() => {
          setRedo(false);
          data.refresh();
        }}
      />
    );
  return <Central data={data} reduced={reduced} onRedoSetup={() => setRedo(true)} />;
}

createRoot(document.getElementById("root")!).render(<Root />);
