import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Message } from "@/lib/types/messaging";

const buscar = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/inbox/useMessagesRealtime", async () => {
  const { useInfiniteQuery } = await import("@tanstack/react-query");
  return { useMessagesRealtime: (id: string) => useInfiniteQuery({
    queryKey: ["messages", id], initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => buscar(id, pageParam),
    getNextPageParam: (last: { meta: { cursor: string | null } }) => last.meta.cursor ?? undefined,
    retry: false,
  }) };
});
vi.mock("@/hooks/inbox/useConversationNotes", () => ({ useConversationNotes: () => [] }));
vi.mock("@/hooks/inbox/usePassagensDaConversa", () => ({ usePassagensDaConversa: () => [] }));
vi.mock("@/hooks/inbox/useClaimConversation", () => ({ useClaimConversation: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/inbox/useDeleteNote", () => ({ useDeleteNote: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/ai/useDebugToggle", () => ({ useDebugToggle: () => ({ enabled: false }) }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useActiveOrg: () => ({ role: "agent" }), useUser: () => ({ id: "ana" }),
}));
vi.mock("@/hooks/i18n/useLocaleDeData", () => ({ useLocaleDeData: () => undefined }));
vi.mock("@/components/inbox/NoteCard", () => ({ NoteCard: () => null }));
vi.mock("@/components/inbox/PassagemCard", () => ({ PassagemCard: () => null }));
import { ChatThread } from "@/components/inbox/ChatThread";

function msg(id: string, reply: string | null = null): Message {
  return { id, body: id, direction: "inbound", type: "text", metadata: {},
    sent_at: "2026-10-19T12:00:00Z", reply_to_message_id: reply } as Message;
}
const pagina = (data: Message[], cursor: string | null = null) => ({ data, meta: { cursor, has_more: !!cursor } });
let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const rolar = vi.fn();
const original = Element.prototype.scrollIntoView;

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  buscar.mockReset(); rolar.mockClear(); Element.prototype.scrollIntoView = rolar;
});
afterEach(() => { Element.prototype.scrollIntoView = original; qc.clear(); });

async function clicarCitacao() {
  fireEvent.click(await screen.findByRole("button", { name: "Ir para a mensagem citada" }));
}
function rolouNaOriginal() {
  return (rolar.mock.contexts as Element[]).some((el, i) =>
    el.getAttribute("data-message-id") === "original" && rolar.mock.calls[i]?.[0]?.block === "center");
}

describe("clique na citação", () => {
  it("vai à original já carregada e a destaca sem nova consulta", async () => {
    buscar.mockResolvedValue(pagina([msg("original"), msg("resposta", "original")]));
    const { container } = render(<ChatThread conversationId="c1" />, { wrapper });
    await clicarCitacao();
    await waitFor(() => expect(rolouNaOriginal()).toBe(true));
    expect(container.querySelector('[data-message-id="original"]')).toHaveAttribute("data-message-highlighted", "true");
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("carrega as páginas antigas até encontrar a original e preserva as recentes", async () => {
    buscar.mockResolvedValueOnce(pagina([msg("resposta", "original")], "p2"))
      .mockResolvedValueOnce(pagina([msg("intermediaria")], "p3"))
      .mockResolvedValueOnce(pagina([msg("original")]));
    render(<ChatThread conversationId="c1" />, { wrapper });
    await clicarCitacao();
    await waitFor(() => expect(rolouNaOriginal()).toBe(true));
    expect(buscar.mock.calls).toEqual([["c1", undefined], ["c1", "p2"], ["c1", "p3"]]);
    expect(screen.getAllByTestId("message-bubble")).toHaveLength(3);
  });

  it("informa quando a original não existe sem ficar carregando para sempre", async () => {
    buscar.mockResolvedValue(pagina([msg("resposta", "original")]));
    render(<ChatThread conversationId="c1" />, { wrapper });
    await clicarCitacao();
    expect(await screen.findByRole("status")).toHaveTextContent("A mensagem citada não está disponível");
    expect(rolouNaOriginal()).toBe(false);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("falha de página permite tentar outra vez", async () => {
    buscar.mockResolvedValueOnce(pagina([msg("resposta", "original")], "p2"))
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(pagina([msg("original")]));
    render(<ChatThread conversationId="c1" />, { wrapper });
    await clicarCitacao();
    expect(await screen.findByRole("status")).toHaveTextContent("Não foi possível carregar");
    await clicarCitacao();
    await waitFor(() => expect(rolouNaOriginal()).toBe(true));
  });

  it("trocar de conversa interrompe a navegação anterior mesmo com resposta atrasada", async () => {
    let concluir!: (value: ReturnType<typeof pagina>) => void;
    buscar.mockResolvedValueOnce(pagina([msg("resposta", "original")], "p2"))
      .mockImplementationOnce(() => new Promise((resolve) => { concluir = resolve; }))
      .mockResolvedValueOnce(pagina([msg("outra conversa")]));
    const { rerender, container } = render(<ChatThread conversationId="c1" />, { wrapper });
    await clicarCitacao();
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(2));
    rerender(<ChatThread conversationId="c2" />);
    expect(await screen.findByText("outra conversa")).toBeInTheDocument();
    concluir(pagina([msg("original")], "p3"));
    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(3));
    expect(rolouNaOriginal()).toBe(false);
    expect(container.querySelector('[data-message-highlighted="true"]')).toBeNull();
  });
});
