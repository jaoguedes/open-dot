/** Página inicial pública — abre sem login. */
export function About() {
  return (
    <article className="legal">
      <p className="serif legal-kicker">Uso pessoal</p>
      <h1>Open Dot</h1>
      <p className="lead">Um companheiro pessoal que organiza o seu dia: e-mail só em leitura, sites, código e rotinas. Não é um produto comercial. Só existe para o dono desta instalação.</p>
      <p>Nada é vendido, alugado ou compartilhado. Ações que saem do Open Dot pedem a sua aprovação do conteúdo exato. O custo recorrente fica dentro das franquias gratuitas.</p>
      <div className="row-actions">
        <a className="btn primary" href="/">
          Entrar
        </a>
        <a className="btn" href="/privacidade">
          Política de privacidade
        </a>
      </div>
    </article>
  );
}
