import { useId, useRef } from "react";
import type { Metrics, TraceEvent } from "../../api/schemas";
import { MetricsSummary } from "../MetricsSummary/MetricsSummary";
import { TraceStep } from "../TraceStep/TraceStep";
import { useModalDialog } from "../useModalDialog";
import styles from "./ReasoningPanel.module.css";

export function ReasoningPanel({
  trace,
  metrics,
  route,
  onClose,
}: {
  trace: TraceEvent[];
  metrics?: Metrics;
  route?: string;
  onClose: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const { requestClose, dialogProps } = useModalDialog(onClose, closeRef);

  return (
    <dialog className={styles.panel} aria-labelledby={titleId} {...dialogProps}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Raciocínio
          </h2>
          <button ref={closeRef} type="button" className={styles.close} onClick={requestClose}>
            Fechar
          </button>
        </header>
        <MetricsSummary metrics={metrics} route={route} />
        {trace.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>Nenhum passo registrado</p>
            <p className={styles.emptyText}>
              A API não enviou o raciocínio desta resposta. A resposta continua válida; consulte o ID da requisição nos
              logs da API para mais detalhes.
            </p>
          </div>
        ) : (
          <ol className={styles.steps} aria-label="Passos do raciocínio">
            {trace.map((event, index) => (
              <TraceStep key={index} event={event} />
            ))}
          </ol>
        )}
      </div>
    </dialog>
  );
}
