import { useId } from "react";
import { APPROVAL_STATE_LABELS, describeAction, type ApprovalCard as Card, type Decision } from "../../state/approval";
import { ErrorNotice } from "../ErrorNotice/ErrorNotice";
import { Icon, type IconName } from "../Icon/Icon";
import { Timestamp } from "../Timestamp";
import styles from "./ApprovalCard.module.css";

const PARAM_LABELS: Record<string, string> = {
  id: "Incidente",
  summary: "Resumo",
  preference: "Preferência",
};

const STATE_ICONS: Record<Card["state"], IconName> = {
  pending: "clock",
  submitting: "clock",
  approved: "check",
  denied: "cross",
  failed: "warning",
  expired: "clock",
  error: "warning",
};

function formatValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function approvalElementId(approvalId: string): string {
  return `approval-${approvalId}`;
}

export function ApprovalCard({
  card,
  onDecide,
  onNewConversation,
}: {
  card: Card;
  onDecide: (decision: Decision) => void;
  onNewConversation?: () => void;
}) {
  const titleId = useId();
  const params = Object.entries(card.args).filter(([key]) => key !== "reason");
  const decidable = card.state === "pending" || card.state === "submitting" || card.state === "error";
  const submitting = card.state === "submitting";

  return (
    <article id={approvalElementId(card.id)} tabIndex={-1} className={styles.card} aria-labelledby={titleId}>
      <header className={styles.header}>
        <span className={styles.icon}>
          <Icon name="shield" />
        </span>
        <h2 id={titleId} className={styles.title}>
          Aprovação necessária
        </h2>
      </header>

      <p className={styles.action}>{describeAction(card.tool, card.args)}</p>

      {params.length > 0 && (
        <dl className={styles.params}>
          {params.map(([key, value]) => (
            <div key={key} className={styles.param}>
              <dt className={styles.term}>{PARAM_LABELS[key] ?? key}</dt>
              <dd className={styles.value}>{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className={styles.reason}>
        <span className={styles.term}>Motivo: </span>
        {card.reason}
      </p>

      <p className={styles.meta}>
        Solicitada <Timestamp iso={card.createdAt} />
      </p>

      <div className={styles.status} data-state={card.state}>
        <Icon name={STATE_ICONS[card.state]} />
        <span role="status">
          {APPROVAL_STATE_LABELS[card.state]}
          {card.decidedAt && !decidable && (
            <>
              {" "}
              <Timestamp iso={card.decidedAt} />
            </>
          )}
        </span>
      </div>

      {card.error && card.state === "error" && (
        <ErrorNotice
          error={card.error}
          onRetry={card.decision ? () => onDecide(card.decision ?? "deny") : undefined}
          onNewConversation={onNewConversation}
        />
      )}

      {decidable && (
        <div className={styles.buttons}>
          <button
            type="button"
            className={styles.approve}
            disabled={submitting}
            aria-busy={submitting && card.decision === "approve"}
            onClick={() => onDecide("approve")}
          >
            Aprovar
          </button>
          <button
            type="button"
            className={styles.deny}
            disabled={submitting}
            aria-busy={submitting && card.decision === "deny"}
            onClick={() => onDecide("deny")}
          >
            Negar
          </button>
        </div>
      )}
    </article>
  );
}
