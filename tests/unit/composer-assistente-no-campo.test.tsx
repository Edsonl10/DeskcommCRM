import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const generate = vi.fn(),
  send = vi.fn(),
  note = vi.fn();
vi.mock("@/hooks/inbox/useDraftReply", () => ({
  useDraftReply: () => ({ mutate: generate, isPending: false }),
}));
vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: send, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: note, isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({ useMessageTemplates: () => ({ data: [] }) }));
import { Composer } from "@/components/inbox/Composer";

function mount(id = "conversation-a", props = {}) {
  const qc = new QueryClient();
  const ui = (conversationId: string) => (
    <QueryClientProvider client={qc}>
      <Composer conversationId={conversationId} {...props} />
    </QueryClientProvider>
  );
  const result = render(ui(id));
  return { ...result, changeConversation: (next: string) => result.rerender(ui(next)) };
}
function finish() {
  const options = generate.mock.calls[0]![1] as {
    onSuccess: (r: { data: { draft: string } }) => void;
  };
  act(() => options.onSuccess({ data: { draft: "Sugestão do agente" } }));
}
beforeEach(() => vi.clearAllMocks());

describe("Assistente junto aos modos da conversa", () => {
  it("fica antes de Nota interna, sem painel sobre o histórico", () => {
    mount();
    const assistant = screen.getByRole("button", { name: "Sugerir resposta" });
    const internal = screen.getByRole("button", { name: "Nota interna" });
    expect(
      assistant.compareDocumentPosition(internal) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(assistant.parentElement).toBe(internal.parentElement);
    expect(screen.queryByRole("region", { name: "Assistência do agente" })).not.toBeInTheDocument();
  });
  it("preenche Mensagem, permite editar e só envia após o clique do atendente", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Sugerir resposta" }));
    finish();
    const field = screen.getByLabelText("Mensagem", { exact: true });
    expect(field).toHaveValue("Sugestão do agente");
    expect(send).not.toHaveBeenCalled();
    expect(note).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: "Texto conferido pelo atendente" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: "conversation-a",
        body: "Texto conferido pelo atendente",
      }),
      expect.anything(),
    );
  });
  it("não substitui rascunho existente", () => {
    mount();
    fireEvent.change(screen.getByLabelText("Mensagem", { exact: true }), {
      target: { value: "Meu rascunho" },
    });
    expect(screen.getByRole("button", { name: "Sugerir resposta" })).toBeDisabled();
  });
  it("preserva texto digitado enquanto a sugestão é gerada", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Sugerir resposta" }));
    fireEvent.change(screen.getByLabelText("Mensagem", { exact: true }), {
      target: { value: "Comecei a responder" },
    });
    finish();
    expect(screen.getByLabelText("Mensagem", { exact: true })).toHaveValue("Comecei a responder");
  });
  it("descarta resultado que chegou depois de trocar de conversa", () => {
    const view = mount();
    fireEvent.click(screen.getByRole("button", { name: "Sugerir resposta" }));
    view.changeConversation("conversation-b");
    finish();
    expect(screen.getByLabelText("Mensagem", { exact: true })).toHaveValue("");
    expect(send).not.toHaveBeenCalled();
  });
  it("não insere uma resposta do cliente em Nota interna", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Sugerir resposta" }));
    fireEvent.click(screen.getByRole("button", { name: "Nota interna" }));
    finish();
    expect(screen.getByRole("textbox")).toHaveValue("");
    expect(screen.queryByRole("button", { name: "Sugerir resposta" })).not.toBeInTheDocument();
  });
  it("respeita a janela de resposta fechada", () => {
    mount("conversation-a", { janelaFechada: "Janela fechada" });
    expect(screen.getByRole("button", { name: "Sugerir resposta" })).toBeDisabled();
  });
});
