import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactsListClient } from "@/app/app/contacts/_client";
import { ContactCreatedDialog } from "@/components/contacts/ContactCreatedDialog";
import type { Contact } from "@/lib/types/contacts";

const deps = vi.hoisted(() => ({ push: vi.fn(), error: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: deps.push }) }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useActiveOrg: () => ({ country: null }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: deps.error } }));
vi.mock("@/hooks/contacts/useContactList", () => ({
  useContactList: () => ({ data: { pages: [{ data: [] }] } }),
}));
vi.mock("@/components/contacts/ContactsTable", () => ({ ContactsTable: () => null }));
vi.mock("@/components/contacts/ImportContactsDialog", () => ({ ImportContactsDialog: () => null }));
vi.mock("@/components/contacts/MergeDialog", () => ({ MergeDialog: () => null }));
vi.mock("@/components/empty", () => ({ EmptyContacts: () => <p>Nenhum contato</p> }));

const contact = {
  id: "contato-salvo",
  name: "Joana Teste",
  display_name: null,
  phone_number: "+5511999998888",
  email: null,
} as Contact;
const fetchMock = vi.fn();
const close = vi.fn();
let channels: Record<string, unknown>[] = [];

function montar(ui = <ContactCreatedDialog contact={contact} onClose={close} />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}
function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
function aberturas() {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/v1/conversations/open-with-contact");
}
beforeEach(() => {
  vi.clearAllMocks();
  channels = [];
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/v1/channel-sessions") return response({ data: channels });
    if (url === "/api/v1/contacts") return response({ data: { contact, action: "created" } }, 201);
    if (url === "/api/v1/conversations/open-with-contact")
      return response({ data: { conversation_id: "conversa-nova" } });
    if (url === "/api/v1/conversations/conversa-nova/claim")
      return response({ data: { id: "conversa-nova" } });
    throw new Error(`Requisição inesperada: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("conversa depois do cadastro", () => {
  it("o cadastro real oferece o contato retornado e só abre por escolha explícita", async () => {
    const user = userEvent.setup();
    montar(<ContactsListClient />);
    await user.click(screen.getByRole("button", { name: "Novo contato" }));
    await user.type(screen.getByLabelText("Nome", { exact: true }), "Joana Teste");
    await user.type(screen.getByLabelText(/Telefone/), contact.phone_number!);
    await user.click(screen.getByRole("button", { name: "Criar contato" }));
    await screen.findByRole("dialog", { name: "Contato criado" });
    expect(aberturas()).toHaveLength(0);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/claim"))).toBe(false);
    await user.click(screen.getByRole("button", { name: "Iniciar conversa" }));
    await waitFor(() => expect(deps.push).toHaveBeenCalledWith("/app/inbox?id=conversa-nova&filter=active"));
    expect(JSON.parse(aberturas()[0]![1].body)).toEqual({ contact_id: contact.id });
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/v1/contacts")).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/claim"))).toHaveLength(1);
  });

  it("Concluir mantém só o cadastro, sem abrir atendimento", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(close).toHaveBeenCalledOnce();
    expect(aberturas()).toHaveLength(0);
    expect(deps.push).not.toHaveBeenCalled();
  });

  it("sem telefone explica o próximo passo e permite concluir", () => {
    montar(<ContactCreatedDialog contact={{ ...contact, phone_number: null }} onClose={close} />);
    expect(screen.queryByRole("button", { name: "Iniciar conversa" })).not.toBeInTheDocument();
    expect(
      screen.getByText("Adicione um telefone ao contato para iniciar uma conversa."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Concluir" })).toBeEnabled();
  });

  it("falha ao abrir conserva o contato e oferece nova tentativa sem recadastro", async () => {
    const normalFetch = fetchMock.getMockImplementation()!;
    let fail = true;
    fetchMock.mockImplementation(async (url: string, ...args: unknown[]) => {
      if (url.endsWith("open-with-contact") && fail) {
        fail = false;
        return response(
          { error: { message: "Este contato já está em atendimento com Maria Teste." } },
          409,
        );
      }
      return normalFetch(url, ...args);
    });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar conversa" }));
    await waitFor(() =>
      expect(deps.error).toHaveBeenCalledWith(
        "Este contato já está em atendimento com Maria Teste.",
      ),
    );
    expect(close).not.toHaveBeenCalled();
    expect(deps.push).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Iniciar conversa" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Iniciar conversa" }));
    await waitFor(() => expect(deps.push).toHaveBeenCalledOnce());
    expect(aberturas()).toHaveLength(2);
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/v1/contacts")).toBe(false);
  });

  it("cancelar o canal devolve o contato salvo; escolher usa o canal selecionado", async () => {
    channels = ["Comercial", "Oficina"].map((name, index) => ({
      id: `canal-${index}`,
      display_name: name,
      provider: "waha",
      status: "WORKING",
      phone_number: `+551199999000${index}`,
      waha_session_name: `sessao-${name}`,
      metadata: {},
    }));
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar conversa" }));
    await screen.findByRole("dialog", { name: "Escolha o canal para iniciar a conversa" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(aberturas()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await screen.findByRole("dialog", { name: "Contato criado" });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar conversa" }));
    await screen.findByRole("dialog", { name: "Escolha o canal para iniciar a conversa" });
    fireEvent.click(screen.getByRole("radio", { name: /Oficina/ }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar conversa" }));
    await waitFor(() => expect(deps.push).toHaveBeenCalledOnce());
    expect(JSON.parse(aberturas()[0]![1].body)).toEqual({
      contact_id: contact.id,
      channel_session_id: "canal-1",
    });
  });

  it("se o aceite falha, permanece na confirmação sem navegar nem tomar outro atendimento", async () => {
    const normalFetch = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation(async (url: string, ...args: unknown[]) => {
      if (url.endsWith("/claim"))
        return response({ error: { message: "Outro atendente já assumiu." } }, 409);
      return normalFetch(url, ...args);
    });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Iniciar conversa" }));
    await waitFor(() => expect(deps.error).toHaveBeenCalledWith("Outro atendente já assumiu."));
    expect(deps.push).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Contato criado" })).toBeVisible();
    const claim = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/claim"));
    expect(JSON.parse(claim![1].body)).toEqual({ expected_assignee: null });
  });
});
