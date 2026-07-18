import { useLang } from "./i18n";

/* Seção "Built for players, not the house.": título à esquerda e quatro
   blocos de vantagem (número em lima, título branco, descrição suave).
   Estilo limpo, sem cards pesados — segue o print. */
export default function PlayerAdvantageSection() {
  const { t } = useLang();

  return (
    <section className="advantages reveal" id="advantages">
      <h2 className="advantages-title">{t.advantages.title}</h2>

      <div className="advantages-grid">
        {t.advantages.items.map((item) => (
          <article className="advantage" key={item.n}>
            <span className="advantage-n">{item.n}</span>
            <h3 className="advantage-heading">{item.title}</h3>
            <p className="advantage-text">{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
