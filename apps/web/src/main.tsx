import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppProvider } from "./store.tsx";
import { App } from "./App.tsx";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  navigator.serviceWorker.register("/sw.js").catch(() => {
    /* sem SW o app continua; o estado offline já existe na interface */
  });
}
