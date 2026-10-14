const absoluteFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "medium",
});

/** Absolute local time, e.g. "14/10/2026, 09:00:00". */
export function formatAbsolute(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : absoluteFormatter.format(date);
}

/** Short relative time in pt-BR ("agora", "há 5 min", "há 2 h", or the date). */
export function formatRelative(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return "agora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  return formatAbsolute(iso);
}

/** "1,2 s" for latencies ≥ 1 s, otherwise "850 ms". */
export function formatLatency(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}
