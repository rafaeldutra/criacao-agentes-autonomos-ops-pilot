import { formatAbsolute, formatRelative } from "../lib/time";

/** Relative time with the absolute time always available (title + visually hidden text). */
export function Timestamp({ iso, className }: { iso: string; className?: string }) {
  const absolute = formatAbsolute(iso);
  return (
    <time dateTime={iso} title={absolute} className={className}>
      {formatRelative(iso)}
      <span className="visually-hidden"> ({absolute})</span>
    </time>
  );
}
