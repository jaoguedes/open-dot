/**
 * Dicionário fixo de erros, em português. Sem IA: funciona offline e não inventa causa.
 * Código desconhecido usa a frase genérica e guarda o código.
 */

export interface ErrorExplanation {
  code: string;
  frase: string;
  causa: string;
  acao: string;
}

const GENERIC = {
  frase: "Opa, achei o tropeço. Não sei ainda o que é isso, mas guardei o código.",
  causa: "O código não está no dicionário fixo.",
  acao: "Toque em Copiar detalhes e guarde o código. Nada foi enviado para fora.",
};

const DICT: Record<string, Omit<ErrorExplanation, "code">> = {
  subrequest_limit: {
    frase: "Tropecei aqui. Tentei fazer chamadas demais de uma vez e o Cloudflare Free só deixa 50 por execução.",
    causa: "Cada consulta ao banco e cada pedido externo contam. O teto desta execução estourou.",
    acao: "Já anotei: a correção é gravar em lote. Toque em Tentar de novo daqui a pouco.",
  },
  db_error: {
    frase: "Tropecei ao falar com o banco. Nada foi apagado.",
    causa: "A consulta não concluiu.",
    acao: "Toque em Tentar de novo. Se repetir, o próximo tique do agendador tenta outra vez.",
  },
  upstream_timeout: {
    frase: "O serviço de fora demorou demais e eu parei de esperar.",
    causa: "Tempo esgotado na chamada externa.",
    acao: "Nada foi alterado lá. Toque em Tentar de novo.",
  },
  invalid_feed: {
    frase: "O feed desta fonte não veio num formato que eu leio.",
    causa: "O XML do RSS ou Atom falhou na leitura.",
    acao: "As outras fontes seguem. Esta fica na lista de falhas.",
  },
  schema_mismatch: {
    frase: "O banco está num formato que esta versão do app não espera.",
    causa: "A migração esperada ainda não está aplicada, ou o app está à frente do banco.",
    acao: "Não gravei nada nesta execução. Confira o health antes de publicar de novo.",
  },
  unknown: {
    frase: "Opa, achei o tropeço. Não sei ainda o que é isso, mas guardei o código.",
    causa: "A falha não caiu num código conhecido.",
    acao: "Toque em Copiar detalhes. Nada foi enviado para fora.",
  },
  chunk_missing: {
    frase: "Carreguei uma versão velha do app guardada no seu aparelho e ela não achou uma peça nova.",
    causa: "O cache do navegador pediu um arquivo que este deploy não tem.",
    acao: "Toque em Limpar cache e recarregar. Eu faço isso uma vez, sem ficar em loop.",
  },
  render_error: {
    frase: "A tela quebrou ao desenhar. O resto do Open Dot não foi apagado.",
    causa: "Um erro de renderização parou esta vista.",
    acao: "Toque em Tentar de novo. Se a tela continuar preta, limpe o cache e recarregue.",
  },
  stale_run: {
    frase: "Uma execução ficou parada por mais de 10 minutos e eu encerrei ela.",
    causa: "O estado running ou queued passou do prazo.",
    acao: "O agente volta ao repouso ou ao erro. O próximo ciclo pode tentar de novo.",
  },
  not_supported: {
    frase: "Esse tipo de execução ainda não existe no agendador.",
    causa: "O tipo do trabalho não tem implementação.",
    acao: "Marquei a execução como falha. Nada foi enviado para fora.",
  },
  not_connected: {
    frase: "Esta conta não está conectada.",
    causa: "Falta a conexão que a rotina precisa.",
    acao: "Abra Conexões e conecte só o que você quiser.",
  },
  not_found: {
    frase: "Não achei o que essa ação pedia.",
    causa: "O registro não está mais aqui.",
    acao: "Atualize a tela. Nada foi apagado além do que você pediu.",
  },
  organize_failed: {
    frase: "Não consegui organizar o texto deste arquivo.",
    causa: "A organização por regras parou no meio.",
    acao: "O arquivo continua na lista. Toque em Tentar de novo.",
  },
  offline: {
    frase: "Não consegui falar com o servidor.",
    causa: "A primeira carga não alcançou a API.",
    acao: "Toque em Tentar de novo. A demonstração só abre se você pedir.",
  },
  internal: {
    frase: "Algo deu errado. Nada foi enviado ou alterado fora do Open Dot.",
    causa: "Falha interna com código genérico.",
    acao: "Toque em Tentar de novo. Os detalhes guardam só o código.",
  },
  not_api: {
    frase: "O servidor respondeu uma página, não a API.",
    causa: "A resposta não era JSON do Open Dot.",
    acao: "Se isso veio depois de um deploy, limpe o cache e recarregue.",
  },
  disabled: {
    frase: "Este agente está desativado.",
    causa: "A configuração local desligou o agente.",
    acao: "Ative de novo em Conexões, se quiser.",
  },
  owner_calls: {
    frase: "A cota de chamadas de IA de hoje acabou.",
    causa: "O limite diário de chamadas foi atingido.",
    acao: "Sigo com as regras, sem chamar a IA.",
  },
  owner_tokens: {
    frase: "A cota de tokens de IA de hoje acabou.",
    causa: "O limite diário de tokens foi atingido.",
    acao: "Sigo com as regras, sem chamar a IA.",
  },
  model_requests: {
    frase: "O modelo de IA atingiu o limite de pedidos de hoje.",
    causa: "O limite do modelo foi atingido.",
    acao: "Sigo com as regras, sem chamar a IA.",
  },
  model_tokens: {
    frase: "O modelo de IA atingiu o limite de tokens de hoje.",
    causa: "O limite de tokens do modelo foi atingido.",
    acao: "Sigo com as regras, sem chamar a IA.",
  },
  chave_recusada: {
    frase: "A chave do PacoteVício foi recusada. O rastreio automático pausou.",
    causa: "O serviço recusou a autenticação.",
    acao: "Não repito a consulta até você revisar a chave. Nada foi comprado.",
  },
  limite: {
    frase: "O PacoteVício limitou as consultas agora.",
    causa: "Resposta 429 ou o teto mensal.",
    acao: "Paro o lote. O contador do mês continua visível.",
  },
  nao_encontrado: {
    frase: "A transportadora ainda não reconhece este código.",
    causa: "A consulta voltou sem encomenda.",
    acao: "Espero 6 horas antes de consultar de novo.",
  },
  fora_da_cobertura: {
    frase: "Esta transportadora não entra na consulta automática.",
    causa: "O plano usado não cobre esta transportadora.",
    acao: "Abra a página pública da transportadora. Não chamei a API.",
  },
  tempo_esgotado: {
    frase: "A consulta de rastreio demorou demais.",
    causa: "Tempo esgotado.",
    acao: "Tento de novo no próximo ciclo, dentro do intervalo de 6 horas.",
  },
  indisponivel: {
    frase: "A consulta automática está indisponível agora.",
    causa: "O serviço não respondeu como esperado.",
    acao: "A encomenda continua na lista. Nada foi apagado.",
  },
  busy: {
    frase: "O desenho 3D ficou de fora porque o canvas já está em uso.",
    causa: "Há outro Dot 3D na tela.",
    acao: "Sigo no motor 2D.",
  },
  manifest: {
    frase: "O arquivo 3D do Dot não passou na checagem.",
    causa: "O manifesto do GLB não está ok.",
    acao: "Sigo no motor 2D.",
  },
  b3_fora_do_plano: {
    frase: "Ações da B3 não estão no plano gratuito desta fonte.",
    causa: "A fonte gratuita usada para ações não cobre a B3.",
    acao: "Cripto e câmbio seguem. A Petrobras não entra como falha.",
  },
  missing_key: {
    frase: "Falta a chave opcional desta fonte.",
    causa: "A variável não está no servidor.",
    acao: "Sem a chave, esta cotação não é inventada. O resto do Mercado segue.",
  },
};

export function explainError(code: string): ErrorExplanation {
  const http = /^upstream_http_(\d{3})$/.exec(code);
  if (http) {
    return {
      code,
      frase: `O serviço de fora respondeu ${http[1]}. Parei nesta fonte.`,
      causa: "A resposta HTTP não foi sucesso.",
      acao: "As outras fontes seguem. Esta fica na lista, com o código.",
    };
  }
  const known = DICT[code];
  if (known) return { code, ...known };
  return { code: code.slice(0, 80) || "unknown", ...GENERIC };
}

export function isKnownReason(code: string): boolean {
  if (DICT[code]) return true;
  return /^upstream_http_\d{3}$/.test(code);
}

/** Remove segredo, e-mail, token e número longo. Não devolve stack. */
export function sanitizeDetail(input: string): string {
  const noStack = input.split("\n")[0] ?? "";
  return noStack
    .replace(/bearer\s+[a-z0-9._-]{8,}/gi, "bearer [oculto]")
    .replace(/\b(sk|pk|rk)-[a-z0-9]{6,}/gi, "[oculto]")
    .replace(/ya29\.[a-z0-9._-]+/gi, "[oculto]")
    .replace(/eyJ[a-z0-9_-]{8,}\.[a-z0-9_.-]{8,}/gi, "[oculto]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[oculto]")
    .replace(/\b\d{13,19}\b/g, "[oculto]")
    .replace(/\b(token|senha|password|secret|authorization|api[_-]?key)\b\s*[:=]\s*\S+/gi, "$1=[oculto]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}

export function versionChanged(loaded: string, remote: string | null | undefined): boolean {
  if (!loaded || !remote) return false;
  return loaded !== remote;
}
