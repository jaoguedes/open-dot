// Aplica o tema antes da primeira pintura (evita flash). Script externo para respeitar a CSP.
(function () {
  try {
    var p = JSON.parse(localStorage.getItem("open-dot:prefs") || "{}");
    var dark = p.theme === "dark" || (p.theme !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {
    document.documentElement.dataset.theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
})();
