// SPDX-License-Identifier: AGPL-3.0-only
/** Perfil do projeto (parte C, versão simples): heurística por palavras, explicada e sem IA. */

export type ProjectType = "jogo" | "pwa" | "api" | "automacao" | "extensao" | "documento";
export interface ProjectProfile {
  tipos: ProjectType[];
  plataformas: Array<"web" | "celular" | "desktop" | "servidor" | "terminal">;
  risco: "baixo" | "medio" | "alto";
  precisaDesign: boolean;
  precisaPesquisa: boolean;
  sinais: string[];
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const TYPE_WORDS: Array<[ProjectType, RegExp]> = [
  ["jogo", /\b(jogo|game|fase|personagem|pontuacao|placar)\b/],
  ["pwa", /\b(app|aplicativo|site|pagina|pwa|tela|portfolio|dashboard|painel|landing)\b/],
  ["api", /\b(api|endpoint|servidor|backend|webhook|rest|graphql)\b/],
  ["automacao", /\b(automat|script|bot|rotina|agendar|cron|planilha|lembrete)\w*/],
  ["extensao", /\b(estender|extensao|adicionar ao|no projeto existente|melhorar o|corrigir|bug)\b/],
  ["documento", /\b(documento|relatorio|guia|manual|readme|artigo)\b/],
];
const RISK_HIGH = /\b(pagamento|cobra|cartao|pix|banco|senha|saude|medic|crianca|dados pessoais|cpf|whatsapp|enviar e-?mail|apagar|deletar)\w*/;
const RISK_MED = /\b(login|conta|usuario|cadastro|upload|arquivo|integracao|api externa|notificacao)\w*/;

export function profileFromIdea(idea: string, stack: string[] = []): ProjectProfile {
  const t = norm(idea);
  const sinais: string[] = [];
  const tipos = TYPE_WORDS.filter(([, re]) => re.test(t)).map(([k]) => k).slice(0, 2);
  if (!tipos.length) tipos.push("pwa");
  for (const k of tipos) sinais.push(`tipo ${k}: palavras da ideia`);
  const plataformas: ProjectProfile["plataformas"] = [];
  if (/\b(celular|iphone|android|mobile)\b/.test(t)) plataformas.push("celular");
  if (/\b(desktop|mac|windows)\b/.test(t)) plataformas.push("desktop");
  if (tipos.includes("api")) plataformas.push("servidor");
  if (tipos.includes("automacao") && /\b(terminal|cli|script)\b/.test(t)) plataformas.push("terminal");
  if (!plataformas.length || tipos.includes("pwa")) plataformas.unshift("web");
  const risco = RISK_HIGH.test(t) ? "alto" : RISK_MED.test(t) ? "medio" : "baixo";
  sinais.push(`risco ${risco}: ${risco === "baixo" ? "sem dado sensível nem escrita externa citados" : "a ideia cita dado sensível, conta ou escrita externa"}`);
  if (stack.length) sinais.push(`stack do Passport: ${stack.slice(0, 5).join(", ")}`);
  const precisaDesign = tipos.some((k) => k === "pwa" || k === "jogo");
  const precisaPesquisa = /\b(pesquis|referenc|compar|qual (biblioteca|ferramenta)|alternativ|inspir)\w*/.test(t);
  if (precisaPesquisa) sinais.push("pesquisa: a ideia pede referências ou comparação");
  return { tipos, plataformas: [...new Set(plataformas)], risco, precisaDesign, precisaPesquisa, sinais };
}
