import { render } from "@testing-library/react";
import { vi } from "vitest";
import type { ApiClient } from "../api/client";
import { Chat } from "../components/Chat/Chat";
import { useConversation } from "../state/conversation";

function ChatHarness({
  client,
  onOpenSettings,
}: {
  client: ApiClient;
  onOpenSettings: () => void;
}) {
  const conversation = useConversation(client);
  return (
    <main>
      <Chat conversation={conversation} onOpenSettings={onOpenSettings} onNewConversation={conversation.reset} />
    </main>
  );
}

/** Renders the Chat wired to `useConversation` with an injected (fake) client. */
export function renderChat(client: ApiClient) {
  const onOpenSettings = vi.fn();
  const utils = render(<ChatHarness client={client} onOpenSettings={onOpenSettings} />);
  return { ...utils, onOpenSettings };
}
