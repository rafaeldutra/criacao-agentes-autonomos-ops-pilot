import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { expectNoAxeViolations } from "./test/axe";
import { chatFinal, createFakeClient } from "./test/fakeClient";
import { chat200 } from "./test/fixtures";

describe("App shell", () => {
  it("renders one h1 and the banner/main landmarks", () => {
    render(<App createClient={() => createFakeClient()} />);
    const headings = screen.getAllByRole("heading", { level: 1 });
    expect(headings).toHaveLength(1);
    expect(headings[0]).toHaveTextContent("OpsPilot — War Room");
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("has a skip link targeting the conversation", () => {
    render(<App createClient={() => createFakeClient()} />);
    const skip = screen.getByRole("link", { name: "Pular para a conversa" });
    expect(skip).toHaveAttribute("href", "#conversa");
    expect(document.getElementById("conversa")).toHaveAccessibleName("Conversa");
  });

  it("Nova conversa clears the conversation and focuses the composer", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    client.postChat.mockResolvedValue(chatFinal(chat200()));
    render(<App createClient={() => client} />);
    await user.type(screen.getByLabelText("Mensagem"), "oi");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await screen.findByText(/2 alertas/);
    await user.click(screen.getByRole("button", { name: "Nova conversa" }));
    expect(screen.queryByText(/2 alertas/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Como posso ajudar no plantão?" })).toBeInTheDocument();
    expect(screen.getByLabelText("Mensagem")).toHaveFocus();
    await user.type(screen.getByLabelText("Mensagem"), "nova");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    expect(client.postChat).toHaveBeenLastCalledWith({ message: "nova" }, expect.anything());
  });

  it("has no axe violations", async () => {
    const { container } = render(<App createClient={() => createFakeClient()} />);
    await expectNoAxeViolations(container);
  });
});
