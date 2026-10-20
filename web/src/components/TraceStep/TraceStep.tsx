import { useState } from "react";
import type { TraceEvent } from "../../api/schemas";
import { Icon, type IconName } from "../Icon/Icon";
import { describeTraceEvent, type TraceBody } from "./describe";
import styles from "./TraceStep.module.css";

export const COLLAPSE_LIMIT = 600;

function Collapsible({ text, as }: { text: string; as: "p" | "pre" }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > COLLAPSE_LIMIT;
  const shown = long && !expanded ? `${text.slice(0, COLLAPSE_LIMIT)}…` : text;
  const Tag = as;
  return (
    <div className={styles.collapsible}>
      <Tag className={as === "pre" ? styles.pre : styles.text}>{shown}</Tag>
      {long && (
        <button
          type="button"
          className={styles.toggle}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Mostrar menos" : "Mostrar tudo"}
        </button>
      )}
    </div>
  );
}

const STEP_ICONS: Record<"pending" | "completed" | "failed", IconName> = {
  pending: "clock",
  completed: "check",
  failed: "cross",
};

function Body({ body }: { body: TraceBody }) {
  switch (body.kind) {
    case "text":
      return <Collapsible text={body.text} as="p" />;
    case "tool":
      return (
        <div className={styles.stack}>
          <p className={styles.text}>
            Ferramenta <code className={styles.code}>{body.tool}</code>
          </p>
          <Collapsible text={body.argsJson} as="pre" />
        </div>
      );
    case "plan":
      return (
        <ol className={styles.plan}>
          {body.steps.map((step) => (
            <li key={step.id} className={styles.planStep} data-status={step.status}>
              <span className={styles.stepStatus}>
                <Icon name={STEP_ICONS[step.status]} />
                {step.statusLabel}
              </span>
              <span>
                {step.description}
                {step.tool && (
                  <>
                    {" "}
                    <code className={styles.code}>{step.tool}</code>
                  </>
                )}
              </span>
            </li>
          ))}
        </ol>
      );
    case "route":
      return (
        <p className={styles.text}>
          <strong className={styles.strong}>{body.route}</strong>: {body.reason}
        </p>
      );
    case "fallback":
      return (
        <p className={styles.text}>
          <code className={styles.code}>{body.fromModel}</code> → <code className={styles.code}>{body.toModel}</code>
          : {body.reason}
        </p>
      );
    case "handoff":
      return (
        <div className={styles.stack}>
          <p className={styles.handoffTarget}>
            <Icon name="arrow-right" />
            <span>
              <span aria-hidden="true">Para: </span>
              <span className="visually-hidden">Passagem para </span>
              <strong className={styles.strong}>{body.toLabel}</strong>
            </span>
          </p>
          <Collapsible text={body.brief} as="p" />
          {body.limitReached && <p className={styles.limit}>Teto de 8 passagens atingido</p>}
        </div>
      );
    case "unknown":
      return <Collapsible text={body.json} as="pre" />;
  }
}

export function TraceStep({ event }: { event: TraceEvent }) {
  const description = describeTraceEvent(event);
  return (
    <li className={styles.step} data-highlight={description.highlight} data-kind={description.body.kind}>
      <div className={styles.labels}>
        <span className={styles.badge}>{description.label}</span>
        {description.nodeLabel && (
          <span className={styles.node}>
            <span className="visually-hidden">Etapa: </span>
            {description.nodeLabel}
          </span>
        )}
        {description.highlight === "approval" && <span className={styles.flag}>Aprovação humana</span>}
      </div>
      <Body body={description.body} />
    </li>
  );
}
