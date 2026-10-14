import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import { DEFAULT_API_URL, STORAGE_KEYS } from "../../state/settings";
import { expectNoAxeViolations } from "../../test/axe";
import { chatFinal, createFakeClient, type FakeClient } from "../../test/fakeClient";
import { chat200 } from "../../test/fixtures";

function renderApp() {
  const clients = new Map<string, FakeClient>();
  const createClient = vi.fn((baseUrl: string) => {
    let client = clients.get(baseUrl);
    if (!client) {
      client = createFakeClient(baseUrl);
      client.postChat.mockResolvedValue(chatFinal(chat200()));
      clients.set(baseUrl, client);
    }
    return client;
  });
  const user = userEvent.setup();
  const utils = render(<App createClient={createClient} />);
  const clientFor = (url: string) => {
    const client = clients.get(url);
    if (!client) throw new Error(`no client for ${url}`);
    return client;
  };
  return { ...utils, user, createClient, clientFor };
}

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Configurações" }));
  return screen.getByRole("dialog", { name: "Configurações" });
}

describe("SettingsDialog", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("opens from the gear showing the current (default) URL", async () => {
    const { user } = renderApp();
    const dialog = await openSettings(user);
    expect(within(dialog).getByLabelText("URL da API")).toHaveValue(DEFAULT_API_URL);
  });

  it("rejects an invalid URL next to the field and saves nothing", async () => {
    const { user } = renderApp();
    const dialog = await openSettings(user);
    const input = within(dialog).getByLabelText("URL da API");
    await user.clear(input);
    await user.type(input, "ftp://x");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription(expect.stringContaining("http:// ou https://"));
    expect(input).toHaveFocus();
    expect(localStorage.getItem(STORAGE_KEYS.apiUrl)).toBeNull();
    expect(screen.getByRole("dialog", { name: "Configurações" })).toBeInTheDocument();
  });

  it("saves a valid URL, persists it and uses it for the next message", async () => {
    const { user, clientFor } = renderApp();
    const dialog = await openSettings(user);
    const input = within(dialog).getByLabelText("URL da API");
    await user.clear(input);
    await user.type(input, "https://api.exemplo.com/");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(localStorage.getItem(STORAGE_KEYS.apiUrl)).toBe("https://api.exemplo.com");
    expect(screen.queryByRole("dialog", { name: "Configurações" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Mensagem"), "oi");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(clientFor("https://api.exemplo.com").postChat).toHaveBeenCalledTimes(1);
    expect(clientFor(DEFAULT_API_URL).postChat).not.toHaveBeenCalled();
  });

  it("changing the URL with an active conversation starts a new one with a notice", async () => {
    const { user } = renderApp();
    await user.type(screen.getByLabelText("Mensagem"), "oi");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText(/2 alertas/);
    const dialog = await openSettings(user);
    const input = within(dialog).getByLabelText("URL da API");
    await user.clear(input);
    await user.type(input, "https://outra.api");
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(screen.queryByText(/2 alertas/)).not.toBeInTheDocument();
    expect(screen.getByText(/Uma nova conversa foi iniciada/)).toBeInTheDocument();
  });

  it("Restaurar padrão restores the default URL", async () => {
    localStorage.setItem(STORAGE_KEYS.apiUrl, "https://api.exemplo.com");
    const { user } = renderApp();
    const dialog = await openSettings(user);
    const input = within(dialog).getByLabelText("URL da API");
    expect(input).toHaveValue("https://api.exemplo.com");
    await user.click(within(dialog).getByRole("button", { name: "Restaurar padrão" }));
    expect(input).toHaveValue(DEFAULT_API_URL);
    await user.click(within(dialog).getByRole("button", { name: "Salvar" }));
    expect(localStorage.getItem(STORAGE_KEYS.apiUrl)).toBeNull();
  });

  it.each([
    ["ok", "API respondeu."],
    ["unreachable", "Não foi possível alcançar a API (verifique a URL ou se ela está no ar)."],
    ["cors", "A API recusou esta origem (CORS)"],
  ] as const)("Testar conexão reports %s", async (outcome, message) => {
    const { user, clientFor } = renderApp();
    clientFor(DEFAULT_API_URL).ping.mockResolvedValue(outcome);
    const dialog = await openSettings(user);
    await user.click(within(dialog).getByRole("button", { name: "Testar conexão" }));
    expect(await within(dialog).findByText(new RegExp(message.replace(/[().]/g, "\\$&")))).toHaveAttribute(
      "role",
      "status",
    );
  });

  it("applies and persists the theme immediately", async () => {
    const { user } = renderApp();
    const dialog = await openSettings(user);
    const group = within(dialog).getByRole("group", { name: "Tema" });
    await user.click(within(group).getByRole("radio", { name: "Escuro" }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEYS.theme)).toBe("dark");
    await user.click(within(group).getByRole("radio", { name: "Sistema" }));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("warns when the storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const { user } = renderApp();
    const dialog = await openSettings(user);
    expect(within(dialog).getByText(/a configuração não será lembrada/)).toBeInTheDocument();
  });

  it("closes on Esc returning focus to the gear", async () => {
    const { user } = renderApp();
    await openSettings(user);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Configurações" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Configurações" })).toHaveFocus();
  });

  it("has no axe violations", async () => {
    const { user, container } = renderApp();
    await openSettings(user);
    await expectNoAxeViolations(container);
  });
});
