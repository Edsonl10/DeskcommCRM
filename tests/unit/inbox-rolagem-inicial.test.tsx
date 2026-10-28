import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => ({
  carregando: false,
  paginas: [] as Array<{ data: Array<{ id: string; sent_at: string; body: string }> }>,
  notas: [] as Array<{ id: string; created_at: string; created_by_user_id: string }>,
  altura: 1000,
  temMais: false,
  carregarMais: vi.fn(),
}));

vi.mock("@/hooks/inbox/useMessagesRealtime", () => ({
  useMessagesRealtime: () => ({
    data: { pages: estado.paginas },
    isLoading: estado.carregando,
    isError: false,
    hasNextPage: estado.temMais,
    isFetchingNextPage: false,
    fetchNextPage: estado.carregarMais,
    refetch: vi.fn(),
  }),
}));
vi.mock("@/hooks/inbox/useConversationNotes", () => ({ useConversationNotes: () => estado.notas }));
vi.mock("@/hooks/inbox/usePassagensDaConversa", () => ({ usePassagensDaConversa: () => [] }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({ useClaimConversation: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/inbox/useDeleteNote", () => ({ useDeleteNote: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/inbox/useAlterarMensagem", () => ({
  useAlterarMensagem: () => ({ editar: {}, apagar: {}, ocultar: {}, restaurar: {} }),
}));
vi.mock("@/hooks/ai/useDebugToggle", () => ({ useDebugToggle: () => ({ enabled: false }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ role: "agent" }),
  useUser: () => ({ id: "u-1" }),
}));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (texto: string) => texto }));
vi.mock("@/components/inbox/MessageBubble", () => ({
  MessageBubble: ({ message }: { message: { body: string } }) => <div>{message.body}</div>,
}));
vi.mock("@/components/inbox/NoteCard", () => ({ NoteCard: () => <div>Nota interna</div> }));
vi.mock("@/components/inbox/PassagemCard", () => ({ PassagemCard: () => null }));

import { ChatThread } from "@/components/inbox/ChatThread";

const mensagem = (id: string) => ({ id, body: id, sent_at: "2026-10-27T12:00:00.000Z" });
let dispararRedimensionamento = () => {};
let alturaOriginal: PropertyDescriptor | undefined;
let clienteOriginal: PropertyDescriptor | undefined;
let scrollOriginal: typeof Element.prototype.scrollIntoView;

beforeEach(() => {
  estado.carregando = false;
  estado.paginas = [{ data: [mensagem("última")] }];
  estado.notas = [];
  estado.altura = 1000;
  estado.temMais = false;
  estado.carregarMais.mockReset();
  dispararRedimensionamento = () => {};
  alturaOriginal = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollHeight");
  clienteOriginal = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientHeight");
  scrollOriginal = Element.prototype.scrollIntoView;
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => estado.altura });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 400 });
  Element.prototype.scrollIntoView = function () {
    const scroller = this.closest<HTMLElement>('[data-testid="chat-thread-scroller"]');
    if (scroller) scroller.scrollTop = estado.altura;
  };
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) {
      dispararRedimensionamento = () => callback([], this as unknown as ResizeObserver);
    }
    observe() {}
    disconnect() {}
  });
});

afterEach(() => {
  if (alturaOriginal) Object.defineProperty(HTMLElement.prototype, "scrollHeight", alturaOriginal);
  else delete (HTMLElement.prototype as unknown as { scrollHeight?: number }).scrollHeight;
  if (clienteOriginal) Object.defineProperty(HTMLElement.prototype, "clientHeight", clienteOriginal);
  else delete (HTMLElement.prototype as unknown as { clientHeight?: number }).clientHeight;
  Element.prototype.scrollIntoView = scrollOriginal;
  vi.unstubAllGlobals();
});

function fio() {
  return screen.getByTestId("chat-thread-scroller");
}

describe("rolagem da conversa", () => {
  it("aguarda as mensagens mesmo quando a nota chega durante o esqueleto", () => {
    estado.carregando = true;
    estado.paginas = [];
    estado.notas = [{ id: "n1", created_at: "2026-10-27T12:00:00.000Z", created_by_user_id: "u-1" }];
    const tela = render(<ChatThread conversationId="a" />);
    expect(screen.queryByTestId("chat-thread-scroller")).toBeNull();
    estado.carregando = false;
    tela.rerender(<ChatThread conversationId="a" />);
    expect(screen.getByText("Nota interna")).toBeInTheDocument();
    expect(fio().scrollTop).toBe(1000);
  });

  it("abre outra conversa no fim, mas não interrompe quem subiu para ler", () => {
    const tela = render(<ChatThread conversationId="a" />);
    expect(fio().scrollTop).toBe(1000);
    fio().scrollTop = 100;
    fireEvent.scroll(fio());
    estado.altura = 1500;
    estado.paginas = [{ data: [mensagem("antiga"), mensagem("nova")] }];
    tela.rerender(<ChatThread conversationId="a" />);
    expect(fio().scrollTop).toBe(100);
    tela.rerender(<ChatThread conversationId="b" />);
    expect(fio().scrollTop).toBe(1500);
  });

  it("acompanha uma mensagem alta nova quando a pessoa já estava no fim", () => {
    const tela = render(<ChatThread conversationId="a" />);
    estado.altura = 1600;
    estado.paginas = [{ data: [mensagem("anterior"), mensagem("nova")] }];
    tela.rerender(<ChatThread conversationId="a" />);
    expect(fio().scrollTop).toBe(1600);
  });

  it("a pessoa pode interromper a animação para ler mensagens anteriores", () => {
    const tela = render(<ChatThread conversationId="a" />);
    estado.altura = 1600;
    estado.paginas = [{ data: [mensagem("anterior"), mensagem("nova")] }];
    tela.rerender(<ChatThread conversationId="a" />);
    fireEvent.wheel(fio());
    fio().scrollTop = 200;
    fireEvent.scroll(fio());
    estado.altura = 2000;
    estado.paginas = [{ data: [mensagem("anterior"), mensagem("nova"), mensagem("mais nova")] }];
    tela.rerender(<ChatThread conversationId="a" />);
    expect(fio().scrollTop).toBe(200);
  });

  it("não confunde uma posição intermediária da animação com leitura do histórico", () => {
    const tela = render(<ChatThread conversationId="a" />);
    estado.altura = 1600;
    estado.paginas = [{ data: [mensagem("anterior"), mensagem("nova")] }];
    tela.rerender(<ChatThread conversationId="a" />);
    fio().scrollTop = 500;
    fireEvent.scroll(fio());
    estado.altura = 1900;
    act(() => dispararRedimensionamento());
    expect(fio().scrollTop).toBe(1900);
  });

  it("acompanha conteúdo que cresce depois, somente enquanto está no fim", () => {
    render(<ChatThread conversationId="a" />);
    estado.altura = 1600;
    act(() => dispararRedimensionamento());
    expect(fio().scrollTop).toBe(1600);
    fio().scrollTop = 200;
    fireEvent.scroll(fio());
    estado.altura = 1900;
    act(() => dispararRedimensionamento());
    expect(fio().scrollTop).toBe(200);
  });

  it("não volta ao fim quando a pessoa pede mensagens antigas", () => {
    estado.temMais = true;
    const tela = render(<ChatThread conversationId="a" />);
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais antigas" }));
    expect(estado.carregarMais).toHaveBeenCalledOnce();
    estado.altura = 1700;
    estado.paginas = [{ data: [mensagem("última")] }, { data: [mensagem("antiga")] }];
    tela.rerender(<ChatThread conversationId="a" />);
    act(() => dispararRedimensionamento());
    expect(fio().scrollTop).toBe(1000);
  });
});
