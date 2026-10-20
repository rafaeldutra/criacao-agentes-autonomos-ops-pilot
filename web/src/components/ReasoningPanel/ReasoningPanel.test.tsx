import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "../../test/axe";
import { chatFinal, createFakeClient } from "../../test/fakeClient";
import { chat200, chatTeam200 } from "../../test/fixtures";
import { renderChat } from "../../test/renderChat";

async function openPanel(body: unknown = chat200()) {
  const user = userEvent.setup();
  const client = createFakeClient();
  client.postChat.mockResolvedValue(chatFinal(body));
  const utils = renderChat(client);
  await user.type(screen.getByLabelText("Mensagem"), "oi");
  await user.click(screen.getByRole("button", { name: "Enviar" }));
  const trigger = await screen.findByRole("button", { name: "Ver raciocínio" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Raciocínio" });
  return { ...utils, user, trigger, dialog };
}

describe("ReasoningPanel", () => {
  it("opens as a dialog with one ordered step per event", async () => {
    const { dialog } = await openPanel();
    const list = within(dialog).getByRole("list", { name: "Passos do raciocínio" });
    // only the top-level steps (plan sub-steps live in a nested list)
    const topLevel = within(list)
      .getAllByRole("listitem")
      .filter((item) => item.parentElement === list);
    expect(topLevel).toHaveLength(10);
    expect(topLevel[0]).toHaveTextContent("Rota");
    expect(topLevel[0]).toHaveTextContent("Roteador");
    expect(topLevel[9]).toHaveTextContent("Evento: telemetry");
    expect(topLevel[9]).toHaveTextContent('"foo": 1');
  });

  it("shows plan statuses as text and action args as formatted JSON", async () => {
    const { dialog } = await openPanel();
    expect(within(dialog).getByText("Concluído")).toBeInTheDocument();
    expect(within(dialog).getByText("Pendente")).toBeInTheDocument();
    expect(within(dialog).getByText("Falhou")).toBeInTheDocument();
    const pre = Array.from(dialog.querySelectorAll("pre")).find((element) => element.textContent?.includes("severity"));
    expect(pre?.textContent).toBe('{\n  "service": "checkout",\n  "severity": "SEV1"\n}');
  });

  it("shows the metrics summary", async () => {
    const { dialog } = await openPanel();
    const metrics = dialog.querySelector("dl");
    expect(metrics).not.toBeNull();
    const text = metrics?.textContent ?? "";
    expect(text).toContain("openai/gpt-4o-mini");
    expect(text).toContain("Chamadas ao modelo4");
    expect(text).toContain("Tokens do prompt2.048");
    expect(text).toContain("Latência1,2 s");
  });

  it("collapses content longer than 600 characters", async () => {
    const long = "x".repeat(700);
    const body = { ...chat200(), trace: [{ type: "thought", content: long, node: "react" }] };
    const { dialog, user } = await openPanel(body);
    expect(within(dialog).queryByText(long)).not.toBeInTheDocument();
    const toggle = within(dialog).getByRole("button", { name: "Mostrar tudo" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(within(dialog).getByText(long)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Mostrar menos" })).toBeInTheDocument();
  });

  it("explains an empty trace", async () => {
    const { dialog } = await openPanel({ ...chat200(), trace: [] });
    expect(within(dialog).getByText("Nenhum passo registrado")).toBeInTheDocument();
  });

  it("closes on Esc and returns focus to the trigger", async () => {
    const { user, trigger } = await openPanel();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Raciocínio" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it.each(["light", "dark"])("has no axe violations (%s theme)", async (theme) => {
    document.documentElement.dataset.theme = theme;
    const { container } = await openPanel();
    await expectNoAxeViolations(container);
  });

  it("renders supervisor handoffs as plain-text steps labeled by role", async () => {
    const { dialog } = await openPanel(chatTeam200());
    const steps = within(dialog).getAllByText("Passagem");
    expect(steps).toHaveLength(4);
    expect(within(dialog).getAllByText("Passagem para", { exact: false })[0]?.closest("p")?.textContent).toBe(
      "Para: Passagem para Analista",
    );
    // The brief is text, never markup.
    expect(within(dialog).getByText("Planeje a resposta ao alerta <b>al-1</b>.")).toBeInTheDocument();
    expect(dialog.querySelector("b")).toBeNull();
    expect(within(dialog).getByText("Teto de 8 passagens atingido")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Analista").length).toBeGreaterThan(1);
    expect(within(dialog).getAllByText("Executor").length).toBeGreaterThan(1);
    await expectNoAxeViolations(dialog);
  });
});
