import { useLang } from "../i18n";

/** Painel recolhível "Como jogar": passos + de onde vem o prêmio.
 *  Conteúdo vem do i18n (t.howto[game]). */
export default function HowTo({ steps, profit }: { steps: string[]; profit: string }) {
  const { t } = useLang();
  return (
    <details className="card howto">
      <summary>{t.howto.title}</summary>
      <ol className="howto-steps">
        {steps.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>
      <p className="howto-profit">
        <b>💰 {t.howto.profitLabel}:</b> {profit}
      </p>
    </details>
  );
}
