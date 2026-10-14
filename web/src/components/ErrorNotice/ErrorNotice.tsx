import { useState } from "react";
import type { UiError, UiErrorAction } from "../../api/errors";
import { Icon } from "../Icon/Icon";
import styles from "./ErrorNotice.module.css";

export interface ErrorNoticeHandlers {
  onRetry?: () => void;
  onNewConversation?: () => void;
  onOpenSettings?: () => void;
  onDecideApproval?: () => void;
}

const ACTION_LABELS: Record<UiErrorAction, string> = {
  retry: "Tentar novamente",
  "new-conversation": "Nova conversa",
  "open-settings": "Abrir configurações",
  "decide-approval": "Ir para a decisão",
};

function handlerFor(action: UiErrorAction, handlers: ErrorNoticeHandlers): (() => void) | undefined {
  switch (action) {
    case "retry":
      return handlers.onRetry;
    case "new-conversation":
      return handlers.onNewConversation;
    case "open-settings":
      return handlers.onOpenSettings;
    case "decide-approval":
      return handlers.onDecideApproval;
  }
}

/** Interface error (not an incident severity): warning surface, text title, copyable request id. */
export function ErrorNotice({ error, ...handlers }: { error: UiError } & ErrorNoticeHandlers) {
  const [copyStatus, setCopyStatus] = useState("");
  const primary = handlerFor(error.action, handlers);
  const showRetry = error.action === "open-settings" && handlers.onRetry;

  async function copy(requestId: string) {
    try {
      await navigator.clipboard.writeText(requestId);
      setCopyStatus("Copiado");
    } catch {
      setCopyStatus("Não foi possível copiar; selecione o ID manualmente.");
    }
  }

  return (
    <div className={styles.notice} role="alert">
      <div className={styles.header}>
        <span className={styles.icon}>
          <Icon name="warning" />
        </span>
        <p className={styles.title}>{error.title}</p>
      </div>
      <p className={styles.description}>{error.description}</p>
      <div className={styles.actions}>
        {primary && (
          <button type="button" className={styles.button} onClick={primary}>
            {ACTION_LABELS[error.action]}
          </button>
        )}
        {showRetry && (
          <button type="button" className={styles.secondary} onClick={handlers.onRetry}>
            {ACTION_LABELS.retry}
          </button>
        )}
      </div>
      {error.requestId && (
        <details className={styles.details}>
          <summary>ID da requisição</summary>
          <div className={styles.idRow}>
            <code className={styles.code}>{error.requestId}</code>
            <button type="button" className={styles.secondary} onClick={() => void copy(error.requestId ?? "")}>
              Copiar
            </button>
            <span role="status" className={styles.copyStatus}>
              {copyStatus}
            </span>
          </div>
        </details>
      )}
    </div>
  );
}
