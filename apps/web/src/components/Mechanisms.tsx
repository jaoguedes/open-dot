import { MECHANISMS, type MechanismId } from "@open-dot/core/mechanisms.ts";
import "../mechanisms.css";

/** O acento é do mecanismo real informado pelo chamador, nunca da função do agente. */
export function MechanismLabel({ id, activity }: { id: MechanismId; activity?: string }) {
  const mechanism = MECHANISMS.find((m) => m.id === id)!;
  return (
    <span className="mechanism-label" data-mechanism={id} data-activity={activity}>
      <span className="mechanism-indicator" aria-hidden="true" />
      {mechanism.name}
      {activity ? ` · ${activity}` : ""}
    </span>
  );
}

export function Mechanisms() {
  return (
    <section className="mechanisms" aria-label="Mecanismos de agentes">
      <h2>Mecanismos</h2>
      <p className="mechanisms-note">A função define o trabalho; o mecanismo define quem executa. Os drivers ainda não estão disponíveis nesta versão.</p>
      <div className="mechanism-grid">
        {MECHANISMS.map((mechanism) => (
          <article className="mechanism-card" data-mechanism={mechanism.id} key={mechanism.id}>
            <MechanismLabel id={mechanism.id} />
            <p>Integração em desenvolvimento</p>
          </article>
        ))}
      </div>
    </section>
  );
}
