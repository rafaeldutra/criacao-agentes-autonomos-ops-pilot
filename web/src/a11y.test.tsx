import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it } from "vitest";
import { App } from "./App";
import { expectNoAxeViolations } from "./test/axe";
import { chatFinal, chatPending, createFakeClient, httpFailure, type FakeClient } from "./test/fakeClient";
import { chat200, chat202, chatTeam200 } from "./test/fixtures";

type Scenario = (client: FakeClient, user: ReturnType<typeof userEvent.setup>) => Promise<void>;

async function sendMessage(user: ReturnType<typeof userEvent.setup>, text = "oi") {
  await user.type(screen.getByLabelText("Mensagem"), text);
  await user.click(screen.getByRole("button", { name: "Enviar" }));
}

const scenarios: Record<string, Scenario> = {
  empty: async () => {},
  "conversation with error": async (client, user) => {
    client.postChat.mockResolvedValue(httpFailure(503, { requestId: "r-1", error: "x", code: "MODEL_SERVICE_UNAVAILABLE" }));
    await sendMessage(user);
    await screen.findByRole("alert");
  },
  "reasoning panel open": async (client, user) => {
    client.postChat.mockResolvedValue(chatFinal(chat200()));
    await sendMessage(user);
    await user.click(await screen.findByRole("button", { name: "Ver raciocínio" }));
    screen.getByRole("dialog", { name: "Raciocínio" });
  },
  "team reasoning panel open": async (client, user) => {
    client.postChat.mockResolvedValue(chatFinal(chatTeam200()));
    await sendMessage(user);
    await user.click(await screen.findByRole("button", { name: "Ver raciocínio" }));
    screen.getByRole("dialog", { name: "Raciocínio" });
  },
  "pending approval card": async (client, user) => {
    client.postChat.mockResolvedValue(chatPending(chat202()));
    await sendMessage(user, "resolva o inc-1");
    await screen.findByRole("article", { name: "Aprovação necessária" });
  },
};

describe("accessibility (SC-008)", () => {
  for (const theme of ["light", "dark"] as const) {
    for (const [name, scenario] of Object.entries(scenarios)) {
      it(`${name} — ${theme} theme`, async () => {
        document.documentElement.dataset.theme = theme;
        const client = createFakeClient();
        const user = userEvent.setup();
        const { container } = render(<App createClient={() => client} />);
        await scenario(client, user);
        await expectNoAxeViolations(container);
      });
    }
  }
});
