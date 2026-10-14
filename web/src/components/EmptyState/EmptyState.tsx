import { Icon } from "../Icon/Icon";
import styles from "./EmptyState.module.css";

export const EXAMPLE_PROMPTS = [
  "Quais alertas estão disparando?",
  "Liste os incidentes abertos",
  "Consulte o runbook do checkout",
] as const;

export function EmptyState({ onPick, disabled }: { onPick: (text: string) => void; disabled?: boolean }) {
  return (
    <div className={styles.empty}>
      <span className={styles.icon}>
        <Icon name="chat" />
      </span>
      <h2 className={styles.title}>Como posso ajudar no plantão?</h2>
      <p className={styles.text}>
        Pergunte sobre alertas, incidentes ou runbooks. Ações sensíveis sempre pedem sua aprovação antes de executar.
      </p>
      <ul className={styles.examples} aria-label="Exemplos de perguntas">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <li key={prompt}>
            <button type="button" className={styles.example} onClick={() => onPick(prompt)} disabled={disabled}>
              {prompt}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
