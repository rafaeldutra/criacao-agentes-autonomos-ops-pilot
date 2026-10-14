import { useId, useRef, useState, type FormEvent } from "react";
import type { PingOutcome } from "../../api/client";
import { parseApiUrl, type Theme } from "../../state/settings";
import { useModalDialog } from "../useModalDialog";
import styles from "./SettingsDialog.module.css";

export const PING_MESSAGES: Record<PingOutcome, string> = {
  ok: "API respondeu.",
  unreachable: "Não foi possível alcançar a API (verifique a URL ou se ela está no ar).",
  cors: "A API recusou esta origem (CORS). Inclua o endereço desta página em OPSPILOT_CORS_ORIGINS na API.",
};

const THEMES: Array<{ value: Theme; label: string }> = [
  { value: "light", label: "Claro" },
  { value: "dark", label: "Escuro" },
  { value: "system", label: "Sistema" },
];

export function SettingsDialog({
  apiUrl,
  defaultUrl,
  theme,
  persisted,
  onSave,
  onThemeChange,
  onTestConnection,
  onClose,
}: {
  apiUrl: string;
  defaultUrl: string;
  theme: Theme;
  persisted: boolean;
  onSave: (url: string) => void;
  onThemeChange: (theme: Theme) => void;
  onTestConnection: (url: string) => Promise<PingOutcome>;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { requestClose, dialogProps } = useModalDialog(onClose, inputRef);
  const [value, setValue] = useState(apiUrl);
  const [error, setError] = useState<string | undefined>(undefined);
  const [testStatus, setTestStatus] = useState("");
  const inputId = useId();
  const hintId = useId();
  const errorId = useId();

  function validate(): string | undefined {
    const parsed = parseApiUrl(value);
    if (parsed.ok) {
      setError(undefined);
      return parsed.url;
    }
    setError(parsed.message);
    inputRef.current?.focus();
    return undefined;
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const url = validate();
    if (!url) return;
    onSave(url);
    requestClose();
  }

  async function testConnection() {
    const url = validate();
    if (!url) return;
    setTestStatus("Testando conexão…");
    const outcome = await onTestConnection(url);
    setTestStatus(PING_MESSAGES[outcome]);
  }

  function restoreDefault() {
    setValue(defaultUrl);
    setError(undefined);
    setTestStatus("");
  }

  const describedBy = error ? `${hintId} ${errorId}` : hintId;

  return (
    <dialog className={styles.dialog} aria-labelledby="settings-title" {...dialogProps}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <h2 id="settings-title" className={styles.title}>
          Configurações
        </h2>

        {!persisted && (
          <p className={styles.notice}>
            O navegador não permite guardar dados nesta página: a configuração não será lembrada ao recarregar.
          </p>
        )}

        <div className={styles.field}>
          <label htmlFor={inputId} className={styles.label}>
            URL da API
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="url"
            inputMode="url"
            autoComplete="url"
            className={styles.input}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required
          />
          <p id={hintId} className={styles.hint}>
            Obrigatório. Endereço http:// ou https:// da API do OpsPilot. Padrão: {defaultUrl}
          </p>
          {error && (
            <p id={errorId} className={styles.error}>
              {error}
            </p>
          )}
          <div className={styles.row}>
            <button type="button" className={styles.secondary} onClick={() => void testConnection()}>
              Testar conexão
            </button>
            <button type="button" className={styles.secondary} onClick={restoreDefault}>
              Restaurar padrão
            </button>
          </div>
          <p role="status" className={styles.hint}>
            {testStatus}
          </p>
        </div>

        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Tema</legend>
          <div className={styles.radios}>
            {THEMES.map((option) => (
              <label key={option.value} className={styles.radio}>
                <input
                  type="radio"
                  name="theme"
                  value={option.value}
                  checked={theme === option.value}
                  onChange={() => onThemeChange(option.value)}
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.footer}>
          <button type="button" className={styles.secondary} onClick={requestClose}>
            Cancelar
          </button>
          <button type="submit" className={styles.primary}>
            Salvar
          </button>
        </div>
      </form>
    </dialog>
  );
}
