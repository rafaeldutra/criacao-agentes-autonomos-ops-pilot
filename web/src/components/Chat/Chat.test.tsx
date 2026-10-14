import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { chatFinal, createFakeClient, hangingChat, httpFailure, networkFailure } from "../../test/fakeClient";
import { chat200 } from "../../test/fixtures";
import { renderChat } from "../../test/renderChat";

afterEach(() => {
  vi.useRealTimers();
});

describe("Chat", () => {
  it("shows the empty state with 3 examples; clicking one sends it", async () => {
    const client = createFakeClient();
    client.postChat.mockResolvedValue(chatFinal(chat200()));
    renderChat(client);
    expect(screen.getByRole("heading", { name: "Como posso ajudar no plantão?" })).toBeInTheDocument();
    const examples = within(screen.getByRole("list", { name: "Exemplos de perguntas" })).getAllByRole("button");
    expect(examples).toHaveLength(3);
    await userEvent.click(examples[1]!);
    expect(client.postChat).toHaveBeenCalledWith({ message: "Liste os incidentes abertos" }, expect.anything());
    expect(await screen.findByText(/2 alertas/)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Como posso ajudar no plantão?" })).not.toBeInTheDocument();
  });

  it("sends with Ctrl+Enter and reuses the conversationId", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    client.postChat.mockResolvedValue(chatFinal(chat200()));
    renderChat(client);
    const input = screen.getByLabelText("Mensagem");
    await user.type(input, "primeira");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(client.postChat).toHaveBeenLastCalledWith({ message: "primeira" }, expect.anything());
    await screen.findByText(/2 alertas/);
    await user.type(input, "segunda");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(client.postChat).toHaveBeenLastCalledWith(
      { message: "segunda", conversationId: chat200().conversationId },
      expect.anything(),
    );
  });

  it("disables Enviar for empty text and while waiting", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    client.postChat.mockImplementation(hangingChat());
    renderChat(client);
    const send = screen.getByRole("button", { name: "Enviar" });
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText("Mensagem"), "   ");
    expect(send).toBeDisabled();
    await user.type(screen.getByLabelText("Mensagem"), "oi");
    expect(send).toBeEnabled();
    await user.click(send);
    await user.type(screen.getByLabelText("Mensagem"), "outra");
    expect(send).toBeDisabled();
    expect(screen.getByText("Aguardando a resposta do agente.")).toBeInTheDocument();
  });

  it("shows 'processando' only after 300 ms and offers to stop waiting after 10 s", async () => {
    vi.useFakeTimers();
    const client = createFakeClient();
    client.postChat.mockImplementation(hangingChat());
    renderChat(client);
    fireEvent.change(screen.getByLabelText("Mensagem"), { target: { value: "oi" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));

    act(() => vi.advanceTimersByTime(299));
    expect(screen.queryByText(/processando/i)).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(/processando/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Parar de esperar" })).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByText("Ainda trabalhando…")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Parar de esperar" }));
    await act(async () => {});
    expect(screen.getByRole("alert")).toHaveTextContent("Espera cancelada");
    expect(screen.queryByText("Ainda trabalhando…")).not.toBeInTheDocument();
  });

  it("504 shows a clear error with retry and a copyable request id", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    client.postChat
      .mockResolvedValueOnce(httpFailure(504, { requestId: "req-504", error: "timeout", code: "CHAT_TIMEOUT" }))
      .mockResolvedValueOnce(chatFinal(chat200()));
    renderChat(client);
    await user.type(screen.getByLabelText("Mensagem"), "lento");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("O agente demorou demais");
    expect(alert).not.toHaveTextContent("timeout");
    await user.click(within(alert).getByText("ID da requisição"));
    expect(within(alert).getByText("req-504")).toBeInTheDocument();
    await user.click(within(alert).getByRole("button", { name: "Copiar" }));
    expect(await navigator.clipboard.readText()).toBe("req-504");
    expect(within(alert).getByRole("status")).toHaveTextContent("Copiado");

    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(client.postChat).toHaveBeenLastCalledWith({ message: "lento" }, expect.anything());
    expect(await screen.findByText(/2 alertas/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("network failure offers to open the settings", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    client.postChat.mockResolvedValue(networkFailure());
    const { onOpenSettings } = renderChat(client);
    await user.type(screen.getByLabelText("Mensagem"), "oi");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível falar com a API");
    await user.click(within(alert).getByRole("button", { name: "Abrir configurações" }));
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("renders HTML from the agent as inert (no element created)", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    client.postChat.mockResolvedValue(
      chatFinal({ ...chat200(), answer: 'Olá <img src=x onerror="alert(1)"> <script>alert(2)</script> **fim**' }),
    );
    const { container } = renderChat(client);
    await user.type(screen.getByLabelText("Mensagem"), "oi");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText("fim")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("[onerror]")).toBeNull();
  });

  it.each(["light", "dark"])("has no axe violations (%s theme)", async (theme) => {
    document.documentElement.dataset.theme = theme;
    const user = userEvent.setup();
    const client = createFakeClient();
    client.postChat.mockResolvedValue(chatFinal(chat200()));
    const { container } = renderChat(client);
    await expectNoAxeViolations(container);
    await user.type(screen.getByLabelText("Mensagem"), "oi");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText(/2 alertas/);
    await expectNoAxeViolations(container);
  });
});
