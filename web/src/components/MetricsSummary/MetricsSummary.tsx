import type { Metrics } from "../../api/schemas";
import { formatLatency } from "../../lib/time";
import { ROUTE_LABELS } from "../TraceStep/describe";
import styles from "./MetricsSummary.module.css";

export function MetricsSummary({ metrics, route }: { metrics?: Metrics; route?: string }) {
  const items: Array<[string, string]> = [];
  if (metrics?.modelUsed) items.push(["Modelo", metrics.modelUsed]);
  if (metrics?.llmCalls !== undefined) items.push(["Chamadas ao modelo", metrics.llmCalls.toLocaleString("pt-BR")]);
  if (metrics?.promptTokens !== undefined) items.push(["Tokens do prompt", metrics.promptTokens.toLocaleString("pt-BR")]);
  if (metrics?.latencyMs !== undefined) items.push(["Latência", formatLatency(metrics.latencyMs)]);
  if (route) items.push(["Rota", ROUTE_LABELS[route] ?? route]);
  if (items.length === 0) return null;
  return (
    <dl className={styles.metrics}>
      {items.map(([term, value]) => (
        <div key={term} className={styles.item}>
          <dt className={styles.term}>{term}</dt>
          <dd className={styles.value}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
