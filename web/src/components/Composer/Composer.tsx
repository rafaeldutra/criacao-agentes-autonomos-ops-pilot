import { useId, useState, type FormEvent, type KeyboardEvent, type Ref } from "react";
import styles from "./Composer.module.css";

export function Composer({
  onSend,
  disabledReason,
  inputRef,
}: {
  onSend: (text: string) => void;
  /** When set, sending is blocked and this text explains why. */
  disabledReason?: string;
  inputRef?: Ref<HTMLTextAreaElement>;
}) {
  const [text, setText] = useState("");
  const inputId = useId();
  const hintId = useId();
  const canSend = text.trim().length > 0 && !disabledReason;

  function submit() {
    if (!canSend) return;
    onSend(text);
    setText("");
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <form className={styles.composer} aria-label="Enviar mensagem" onSubmit={onSubmit}>
      <label htmlFor={inputId} className={styles.label}>
        Mensagem
      </label>
      <div className={styles.row}>
        <textarea
          id={inputId}
          ref={inputRef}
          className={styles.input}
          rows={2}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={onKeyDown}
          aria-describedby={hintId}
        />
        <button type="submit" className={styles.send} disabled={!canSend} aria-describedby={hintId}>
          Enviar
        </button>
      </div>
      <p id={hintId} className={disabledReason ? styles.reason : styles.hint}>
        {disabledReason ?? "Ctrl+Enter (ou Cmd+Enter) envia."}
      </p>
    </form>
  );
}
