import { useEffect, useState } from "react";
import { api } from "../api.ts";

/** Política pública — o contato vem de Conexões (ou do ambiente), nunca do código. */
export function Privacy() {
  const [contact, setContact] = useState<string | null>(null);
  const [kind, setKind] = useState<"email" | "url" | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    void api
      .legal()
      .then((r) => (setContact(r.contact), setKind(r.contactKind ?? (r.contact ? "email" : null))))
      .catch(() => setContact(null))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <article className="legal">
      <p className="serif legal-kicker">Política</p>
      <h1>Privacidade</h1>
      <p className="lead">O Open Dot é um espaço pessoal. Não vendemos, alugamos nem compartilhamos os seus dados com terceiros.</p>

      <h2>Gmail só em leitura</h2>
      <p>
        Pedimos apenas a permissão <span className="mono">gmail.readonly</span>. O Correio lê metadados e um trecho curto. Não envia, apaga, arquiva nem marca nada sem uma política explícita e a sua
        aprovação do conteúdo exato.
      </p>

      <h2>Inteligência artificial</h2>
      <p>
        Quando a IA está ligada, usamos um provedor com retenção zero (zero data retention). Conteúdo de e-mail, issue, site ou arquivo é dado não confiável: nunca vira instrução e não libera
        ferramenta.
      </p>

      <h2>Como revogar o acesso</h2>
      <p>
        Em{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer noopener">
          myaccount.google.com/permissions
        </a>{" "}
        você remove o acesso do Open Dot. Depois disso, os tokens deixam de funcionar.
      </p>

      <h2>Contato</h2>
      <p>
        {loaded && contact ? (
          <>
            Dúvidas:{" "}
            {kind === "url" ? (
              <a href={contact} target="_blank" rel="noreferrer noopener">
                {contact}
              </a>
            ) : (
              <a href={`mailto:${contact}`}>{contact}</a>
            )}
          </>
        ) : loaded ? (
          "Contato ainda não configurado."
        ) : (
          "Carregando o contato…"
        )}
      </p>

      <div className="row-actions">
        <a className="btn" href="/sobre">
          Sobre o Open Dot
        </a>
      </div>
    </article>
  );
}
