// SPDX-License-Identifier: AGPL-3.0-only
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./store.tsx";
import { App } from "./App.tsx";
import { ScreenBoundary } from "./components/ScreenBoundary.tsx";
import { chunkPlan, clearAppCache } from "./components/DotTrouble.tsx";
import "./styles.css";
import { sound } from "./sound.ts";
import { watchKeyboard } from "./keyboard-inset.ts";

watchKeyboard();

// iOS só toca áudio depois de um gesto: pré-carrega os sons no primeiro toque ou tecla.
const unlockSound = () => {
  sound.unlock();
  window.removeEventListener("pointerdown", unlockSound);
  window.removeEventListener("keydown", unlockSound);
};
window.addEventListener("pointerdown", unlockSound, { passive: true });
window.addEventListener("keydown", unlockSound);

const CHUNK_KEY = "od-chunk-reload";

function chunkFailure(reason: unknown): boolean {
  const text = reason instanceof Error ? reason.message : String(reason ?? "");
  return /dynamically imported module|importing a module script failed|chunk/i.test(text);
}

window.addEventListener("unhandledrejection", (ev) => {
  if (!chunkFailure(ev.reason)) return;
  const plan = chunkPlan(sessionStorage.getItem(CHUNK_KEY) === "1");
  if (plan === "reload") {
    sessionStorage.setItem(CHUNK_KEY, "1");
    void clearAppCache().then(() => location.reload());
    return;
  }
  window.dispatchEvent(new CustomEvent("od-trouble", { detail: { code: "chunk_missing" } }));
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <ScreenBoundary>
        <App />
      </ScreenBoundary>
    </AppProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    /* sem SW o app continua; o estado offline já existe na interface */
  });
}
