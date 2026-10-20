import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Message } from "@/lib/types/messaging";
import { ContactCard } from "./ContactCard";

const { push, error } = vi.hoisted(() => ({ push: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { error } }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
const fetchMock = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: { conversation_id: "conv" } }) });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
function montar() {
  const qc = new QueryClient();
  const message = { type: "contact", body: null, channel_session_id: "canal", metadata: {
    shared_contact: { contact_id: "contato", name: "Contato Sintético", phone_number: "+5511999990000" },
  } } as unknown as Message;
  render(<QueryClientProvider client={qc}><ContactCard message={message} /></QueryClientProvider>);
}

it("cartão compartilhado assume antes de abrir a conversa em Ativos", async () => {
  montar();
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/app/inbox?id=conv&filter=active"));
  expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/v1/conversations/conv/claim", expect.objectContaining({
    method: "POST", body: JSON.stringify({ expected_assignee: null }),
  }));
});

it("não navega quando outro atendente assumiu após a abertura", async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ data: { conversation_id: "conv" } }) });
  fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: { message: "Outro atendente já assumiu." } }) });
  montar();
  fireEvent.click(screen.getByRole("button"));
  await waitFor(() => expect(error).toHaveBeenCalledWith("Outro atendente já assumiu."));
  expect(push).not.toHaveBeenCalled();
});
