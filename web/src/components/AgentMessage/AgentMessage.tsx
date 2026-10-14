import type { ReactNode } from "react";
import Markdown from "react-markdown";
import type { Message } from "../../state/conversation";
import { Timestamp } from "../Timestamp";
import styles from "./AgentMessage.module.css";

/** Agent text rendered as safe markdown: raw HTML skipped, no rehype-raw, images disallowed. */
export function SafeMarkdown({ text }: { text: string }) {
  return (
    <Markdown skipHtml disallowedElements={["img"]} unwrapDisallowed>
      {text}
    </Markdown>
  );
}

export function AgentMessage({
  message,
  onShowReasoning,
  children,
}: {
  message: Message;
  onShowReasoning?: (trigger: HTMLButtonElement) => void;
  children?: ReactNode;
}) {
  return (
    <article className={styles.agent} aria-label="Resposta do OpsPilot">
      <header className={styles.meta}>
        <span className={styles.author}>OpsPilot</span>
        <Timestamp iso={message.createdAt} className={styles.time} />
      </header>
      {message.text.trim().length > 0 && (
        <div className={styles.body}>
          <SafeMarkdown text={message.text} />
        </div>
      )}
      {children}
      {onShowReasoning && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.link}
            onClick={(event) => onShowReasoning(event.currentTarget)}
          >
            Ver raciocínio
          </button>
        </div>
      )}
    </article>
  );
}

export function PersonMessage({ message, children }: { message: Message; children?: ReactNode }) {
  return (
    <article className={styles.person} aria-label="Sua mensagem">
      <header className={styles.meta}>
        <span className={styles.author}>Você</span>
        <Timestamp iso={message.createdAt} className={styles.time} />
        {message.status === "sending" && <span className={styles.time}>Enviando…</span>}
        {message.status === "error" && <span className={styles.time}>Não respondida</span>}
      </header>
      <p className={styles.personText}>{message.text}</p>
      {children}
    </article>
  );
}
