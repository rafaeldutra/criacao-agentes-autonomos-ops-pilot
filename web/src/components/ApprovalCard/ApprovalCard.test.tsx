import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { DISABLED_REASONS } from "../Chat/Chat";
import { expectNoAxeViolations } from "../../test/axe";
import {
  approvalFinal,
  chatPending,
  createFakeClient,
  decisionFinal,
  httpFailure,
  networkFailure,
  type FakeClient,
} from "../../test/fakeClient";
import { chat202, decision409, decisionApprove200 } from "../../test/fixtures";
import { renderChat } from "../../test/renderChat";

async function renderPendingCard(setup?: (client: FakeClient) => void) {
  const user = userEvent.setup();
  const client = createFakeClient();
  client.postChat.mockResolvedValue(chatPending(chat202()));
  setup?.(client);
  const utils = renderChat(client);
  await user.type(screen.getByLabelText("Mensagem"), "resolva o inc-1");
  await user.click(screen.getByRole("button", { name: "Enviar" }));
  const card = await screen.findByRole("article", { name: "Aprovação necessária" });
  return { ...utils, user, client, card };
}

describe("ApprovalCard", () => {
  it("shows the action, params without reason, the reason and both buttons", async () => {
    const { card } = await renderPendingCard();
    expect(within(card).getByText("Resolver incidente inc-1")).toBeInTheDocument();
    const params = card.querySelector("dl");
    expect(params).toHaveTextContent("Incidenteinc-1");
    expect(params).toHaveTextContent("Latência normalizada após rollback");
    expect(params).not.toHaveTextContent("Métricas estáveis");
    expect(within(card).getByText("Métricas estáveis há 30 min")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Aprovar" })).toBeEnabled();
    expect(within(card).getByRole("button", { name: "Negar" })).toBeEnabled();
    expect(within(card).getByRole("status")).toHaveTextContent("Aguardando sua decisão");
  });

  it("blocks the composer with an explanation while pending", async () => {
    const { user } = await renderPendingCard();
    await user.type(screen.getByLabelText("Mensagem"), "outra pergunta");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    expect(screen.getByText(DISABLED_REASONS.pendingApproval)).toBeInTheDocument();
    expect(DISABLED_REASONS.pendingApproval).toContain("Há uma decisão pendente");
  });

  it("Aprovar disables both buttons, then shows Aprovado and the final answer", async () => {
    let resolveDecision: (value: ReturnType<typeof decisionFinal>) => void = () => {};
    const { user, card, client } = await renderPendingCard((fake) => {
      fake.postDecision.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveDecision = resolve;
          }),
      );
    });
    await user.click(within(card).getByRole("button", { name: "Aprovar" }));
    expect(client.postDecision).toHaveBeenCalledWith(chat202().approval.id, "approve");
    expect(within(card).getByRole("button", { name: "Aprovar" })).toBeDisabled();
    expect(within(card).getByRole("button", { name: "Negar" })).toBeDisabled();
    expect(within(card).getByRole("status")).toHaveTextContent("Enviando decisão…");

    resolveDecision(decisionFinal(decisionApprove200()));
    expect(await within(card).findByText("Aprovado")).toBeInTheDocument();
    expect(card.querySelector("[role=status] time")).toHaveAttribute("datetime", "2026-10-14T12:01:30.000Z");
    expect(within(card).queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
    expect(screen.getByText("Incidente inc-1 resolvido com o resumo informado.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled(); // still empty text
    await user.type(screen.getByLabelText("Mensagem"), "obrigado");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });

  it("Negar shows Negado", async () => {
    const denied = decisionApprove200();
    denied.approval.status = "denied";
    denied.answer = "Ok, não vou resolver o incidente.";
    const { user, card } = await renderPendingCard((fake) => {
      fake.postDecision.mockResolvedValue(decisionFinal(denied));
    });
    await user.click(within(card).getByRole("button", { name: "Negar" }));
    expect(await within(card).findByText("Negado")).toBeInTheDocument();
    expect(screen.getByText("Ok, não vou resolver o incidente.")).toBeInTheDocument();
  });

  it("409 already decided shows the final state without buttons", async () => {
    const { user, card, client } = await renderPendingCard((fake) => {
      fake.postDecision.mockResolvedValue(httpFailure(409, decision409()));
      fake.getApproval.mockResolvedValue(approvalFinal(decision409().approval));
    });
    await user.click(within(card).getByRole("button", { name: "Aprovar" }));
    expect(await within(card).findByText("Negado")).toBeInTheDocument();
    expect(client.getApproval).toHaveBeenCalledWith(chat202().approval.id);
    expect(within(card).queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Negar" })).not.toBeInTheDocument();
  });

  it("409 expired shows Expirado", async () => {
    const { user, card } = await renderPendingCard((fake) => {
      fake.postDecision.mockResolvedValue(
        httpFailure(409, { ...decision409(), code: "APPROVAL_EXPIRED", approval: { ...decision409().approval, status: "expired" } }),
      );
    });
    await user.click(within(card).getByRole("button", { name: "Negar" }));
    expect(await within(card).findByText("Expirado")).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Negar" })).not.toBeInTheDocument();
  });

  it("network error re-enables the buttons with an ErrorNotice", async () => {
    const { user, card, client } = await renderPendingCard((fake) => {
      fake.postDecision.mockResolvedValueOnce(networkFailure()).mockResolvedValueOnce(decisionFinal(decisionApprove200()));
    });
    await user.click(within(card).getByRole("button", { name: "Aprovar" }));
    const alert = await within(card).findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível falar com a API");
    expect(within(card).getByRole("button", { name: "Aprovar" })).toBeEnabled();
    await user.click(within(alert).getByRole("button", { name: "Tentar novamente" }));
    expect(client.postDecision).toHaveBeenCalledTimes(2);
    expect(await within(card).findByText("Aprovado")).toBeInTheDocument();
  });

  it("restores the card when /chat answers 409 APPROVAL_PENDING", async () => {
    const user = userEvent.setup();
    const client = createFakeClient();
    client.postChat.mockResolvedValue(
      httpFailure(409, { requestId: "r", error: "x", code: "APPROVAL_PENDING", approvalId: chat202().approval.id }),
    );
    client.getApproval.mockResolvedValue(approvalFinal(chat202().approval));
    renderChat(client);
    await user.type(screen.getByLabelText("Mensagem"), "oi");
    await user.click(screen.getByRole("button", { name: "Enviar" }));
    const card = await screen.findByRole("article", { name: "Aprovação necessária" });
    await user.click(within(screen.getByRole("alert")).getByRole("button", { name: "Ir para a decisão" }));
    expect(card).toHaveFocus();
  });

  it.each(["light", "dark"])("has no axe violations (%s theme)", async (theme) => {
    document.documentElement.dataset.theme = theme;
    const { container } = await renderPendingCard();
    await expectNoAxeViolations(container);
  });
});
