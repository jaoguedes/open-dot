// SPDX-License-Identifier: AGPL-3.0-only
import type { SavedAnswer } from "../ask.ts";

/** Resposta do Dot com as fontes citadas. Usada pela caixa de perguntas e pela paleta. */
export function AnswerView({ answer, onClear }: { answer: SavedAnswer; onClear?: () => void }) {
  return (
    <section className="answer" aria-label="Resposta do Dot">
      <div className="answer-head">
        <span className="tiny">Você perguntou: {answer.question}</span>
        {onClear && (
          <button className="btn ghost" type="button" onClick={onClear}>
            Limpar
          </button>
        )}
      </div>
      <p className="answer-text">{answer.answer}</p>
      {answer.sources.length > 0 && (
        <ul className="list meta">
          {answer.sources.map((s) => (
            <li key={s.id}>
              {s.href ? (
                <a href={s.href} target="_blank" rel="noreferrer noopener">
                  {s.title}
                </a>
              ) : (
                s.title
              )}{" "}
              — {s.detail}
            </li>
          ))}
        </ul>
      )}
      {answer.note && <div className="tiny">{answer.note}</div>}
    </section>
  );
}
