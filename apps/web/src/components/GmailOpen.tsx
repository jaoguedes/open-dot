import { gmailWebHref } from "@open-dot/connectors/gmail.ts";

/** O app do Gmail abre a caixa de entrada, não a mensagem. Sem timer e sem detecção de instalação. */
export function GmailOpen({ gmailId, rfc822, demo }: { gmailId: string; rfc822?: string | null; demo: boolean }) {
  const web = gmailWebHref(gmailId, rfc822);
  if (demo) {
    return (
      <>
        <span className="btn" aria-disabled="true" title="Demonstração: sem conta conectada">
          Abrir no app do Gmail
        </span>
        <span className="btn" aria-disabled="true" title="Demonstração: sem conta conectada">
          Abrir na web
        </span>
      </>
    );
  }
  return (
    <>
      <button
        type="button"
        className="btn"
        onClick={() => {
          window.location.href = "googlegmail://";
        }}
      >
        Abrir no app do Gmail
      </button>
      <a className="btn" href={web} target="_blank" rel="noreferrer">
        Abrir na web
      </a>
    </>
  );
}
