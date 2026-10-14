import { useEffect, useRef, useState, type Ref } from "react";
import type { ConversationApi, Message } from "../../state/conversation";
import { AgentMessage, PersonMessage } from "../AgentMessage/AgentMessage";
import { ApprovalCard, approvalElementId } from "../ApprovalCard/ApprovalCard";
import { Composer } from "../Composer/Composer";
import { EmptyState } from "../EmptyState/EmptyState";
import { ErrorNotice } from "../ErrorNotice/ErrorNotice";
import { ReasoningPanel } from "../ReasoningPanel/ReasoningPanel";
import styles from "./Chat.module.css";

export const PROCESSING_DELAY_MS = 300;
export const SLOW_DELAY_MS = 10_000;

type WaitPhase = "idle" | "processing" | "slow";

/** No indicator for fast answers; "processando" after 300 ms; "Ainda trabalhando…" after 10 s. */
function useWaitPhase(active: boolean): WaitPhase {
  const [phase, setPhase] = useState<WaitPhase>("idle");
  useEffect(() => {
    setPhase("idle");
    if (!active) return undefined;
    const processing = setTimeout(() => setPhase("processing"), PROCESSING_DELAY_MS);
    const slow = setTimeout(() => setPhase("slow"), SLOW_DELAY_MS);
    return () => {
      clearTimeout(processing);
      clearTimeout(slow);
    };
  }, [active]);
  return active ? phase : "idle";
}

export const DISABLED_REASONS = {
  pendingApproval: "Há uma decisão pendente. Aprove ou negue a ação acima para continuar a conversa.",
  waiting: "Aguardando a resposta do agente.",
} as const;

export function focusApprovalCard(approvalId: string | undefined): void {
  if (!approvalId) return;
  const element = document.getElementById(approvalElementId(approvalId));
  element?.focus();
  element?.scrollIntoView?.({ block: "center" });
}

export function Chat({
  conversation,
  onOpenSettings,
  onNewConversation,
  composerRef,
}: {
  conversation: ConversationApi;
  onOpenSettings: () => void;
  onNewConversation: () => void;
  composerRef?: Ref<HTMLTextAreaElement>;
}) {
  const { state, send, retry, stopWaiting, decide } = conversation;
  const phase = useWaitPhase(Boolean(state.inFlight));
  const [panel, setPanel] = useState<{ messageId: string; opener: HTMLElement } | undefined>(undefined);
  const logRef = useRef<HTMLElement>(null);
  const stickToBottom = useRef(true);

  const pendingApprovalId = state.pendingApprovalId;
  const disabledReason = pendingApprovalId
    ? DISABLED_REASONS.pendingApproval
    : state.inFlight
      ? DISABLED_REASONS.waiting
      : undefined;

  useEffect(() => {
    const log = logRef.current;
    if (log && stickToBottom.current) log.scrollTop = log.scrollHeight;
  }, [state.messages, phase]);

  function onScroll() {
    const log = logRef.current;
    if (!log) return;
    stickToBottom.current = log.scrollHeight - log.scrollTop - log.clientHeight < 64;
  }

  function closePanel() {
    const opener = panel?.opener;
    setPanel(undefined);
    opener?.focus();
  }

  const focusPending = () => focusApprovalCard(pendingApprovalId);
  const panelMessage = panel ? state.messages.find((message) => message.id === panel.messageId) : undefined;

  function renderMessage(message: Message) {
    if (message.author === "person") {
      return (
        <PersonMessage key={message.id} message={message}>
          {message.status === "error" && message.error && (
            <ErrorNotice
              error={message.error}
              onRetry={() => retry(message.id)}
              onNewConversation={onNewConversation}
              onOpenSettings={onOpenSettings}
              onDecideApproval={focusPending}
            />
          )}
        </PersonMessage>
      );
    }
    const card = message.approval;
    return (
      <AgentMessage
        key={message.id}
        message={message}
        onShowReasoning={
          message.trace ? (opener) => setPanel({ messageId: message.id, opener }) : undefined
        }
      >
        {card && (
          <ApprovalCard
            card={card}
            onDecide={(decision) => decide(card.id, decision)}
            onNewConversation={onNewConversation}
          />
        )}
      </AgentMessage>
    );
  }

  return (
    <div className={styles.chat}>
      <section
        id="conversa"
        ref={logRef}
        tabIndex={-1}
        aria-label="Conversa"
        className={styles.scroller}
        onScroll={onScroll}
      >
        <div className={styles.inner}>
          {state.messages.length === 0 && !state.inFlight && <EmptyState onPick={send} />}
          <div role="log" aria-live="polite" aria-label="Mensagens" className={styles.log}>
            {state.messages.map(renderMessage)}
          </div>
          {phase !== "idle" && (
            <div className={styles.pending} role="status">
              <div className={styles.skeleton} aria-hidden="true">
                <span className={styles.line} />
                <span className={styles.lineShort} />
              </div>
              <p className={styles.pendingText}>
                {phase === "slow" ? "Ainda trabalhando…" : "O agente está processando…"}
              </p>
              {phase === "slow" && (
                <button type="button" className={styles.stop} onClick={stopWaiting}>
                  Parar de esperar
                </button>
              )}
            </div>
          )}
        </div>
      </section>
      <div className={styles.composer}>
        <Composer onSend={send} disabledReason={disabledReason} inputRef={composerRef} />
      </div>
      {panel && panelMessage && (
        <ReasoningPanel
          trace={panelMessage.trace ?? []}
          metrics={panelMessage.metrics}
          route={panelMessage.route}
          onClose={closePanel}
        />
      )}
    </div>
  );
}
