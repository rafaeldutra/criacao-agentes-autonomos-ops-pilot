import { useMemo, useRef, useState } from "react";
import { createApiClient, type ApiClient } from "./api/client";
import styles from "./App.module.css";
import { Chat } from "./components/Chat/Chat";
import { Icon } from "./components/Icon/Icon";
import { SettingsDialog } from "./components/SettingsDialog/SettingsDialog";
import { useConversation } from "./state/conversation";
import { DEFAULT_API_URL, useSettings } from "./state/settings";

export type ClientFactory = (baseUrl: string) => ApiClient;

const defaultClientFactory: ClientFactory = (baseUrl) => createApiClient({ baseUrl });

export function App({ createClient = defaultClientFactory }: { createClient?: ClientFactory }) {
  const settings = useSettings();
  const client = useMemo(() => createClient(settings.apiUrl), [createClient, settings.apiUrl]);
  const conversation = useConversation(client);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const gearRef = useRef<HTMLButtonElement>(null);

  function newConversation() {
    conversation.reset();
    setNotice("");
    composerRef.current?.focus();
  }

  function closeSettings() {
    setSettingsOpen(false);
    gearRef.current?.focus();
  }

  function saveApiUrl(url: string) {
    if (url === settings.apiUrl) return;
    const hadConversation = conversation.state.messages.length > 0;
    settings.setApiUrl(url);
    if (hadConversation) {
      conversation.reset();
      setNotice(`A URL da API mudou para ${url}. Uma nova conversa foi iniciada.`);
    } else {
      setNotice("");
    }
  }

  return (
    <div className={styles.app}>
      <a href="#conversa" className={styles.skip}>
        Pular para a conversa
      </a>
      <header className={styles.header}>
        <h1 className={styles.title}>OpsPilot — War Room</h1>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={newConversation}>
            <Icon name="plus" />
            Nova conversa
          </button>
          <button
            ref={gearRef}
            type="button"
            className={styles.iconButton}
            aria-label="Configurações"
            aria-haspopup="dialog"
            onClick={() => setSettingsOpen(true)}
          >
            <Icon name="gear" />
          </button>
        </div>
      </header>
      <main className={styles.main}>
        <p role="status" className={styles.notice}>
          {notice}
        </p>
        <Chat
          conversation={conversation}
          onOpenSettings={() => setSettingsOpen(true)}
          onNewConversation={newConversation}
          composerRef={composerRef}
        />
      </main>
      {settingsOpen && (
        <SettingsDialog
          apiUrl={settings.apiUrl}
          defaultUrl={DEFAULT_API_URL}
          theme={settings.theme}
          persisted={settings.persisted}
          onSave={saveApiUrl}
          onThemeChange={settings.setTheme}
          onTestConnection={(url) => createClient(url).ping()}
          onClose={closeSettings}
        />
      )}
    </div>
  );
}
