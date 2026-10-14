import styles from "./Icon.module.css";

const PATHS = {
  gear: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.5a7.4 7.4 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1l-.4-2.5h-4l-.4 2.5a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z",
  plus: "M12 5v14M5 12h14",
  chat: "M4 5h16v11H8l-4 4V5Z",
  warning: "M12 3 2 21h20L12 3Zm0 6v5m0 3v.5",
  check: "M5 12.5 10 17 19 7",
  cross: "M6 6l12 12M18 6 6 18",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2",
  shield: "M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z",
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative icon (always aria-hidden; meaning must also be conveyed by text). */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  );
}
