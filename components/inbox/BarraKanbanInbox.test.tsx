import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarraKanbanInbox } from "./BarraKanbanInbox";
import { EtiquetasKanbanConversa } from "./EtiquetasKanbanConversa";
import { conversaDeExemplo } from "./__fixtures__/conversa";
const { salvar, atualizar, contagens, estado } = vi.hoisted(() => ({
  salvar: vi.fn(),
  atualizar: vi.fn(),
  estado: {
    role: "admin" as "admin" | "manager" | "agent",
    config: { barras: {} as Record<string, string[]>, departamentos: [] as { id: string; name: string }[] },
  },
  contagens: {
    data: [{ tag: "em andamento", total: 12, novas: 4 }] as
      { tag: string; total: number; novas: number }[] | undefined,
  },
}));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "a", support: null }, activeOrg: { orgId: "org", role: estado.role } }),
}));
vi.mock("@/hooks/inbox/useInboxKanban", () => ({
  useInboxKanban: () => ({ data: estado.config }),
  useSalvarBarraKanban: () => ({ mutate: salvar, isPending: false }),
  useContagensKanban: () => contagens,
}));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: [] }),
  useUpdateConversationTags: () => ({ mutate: atualizar, isPending: false }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  estado.role = "admin";
  estado.config = { barras: {}, departamentos: [] };
  contagens.data = [{ tag: "em andamento", total: 12, novas: 4 }];
});
describe("controles Kanban", () => {
  it("atendente não troca de setor nem vê etapas de outro departamento", () => {
    const setor = "22222222-2222-4222-8222-222222222222";
    estado.role = "agent";
    estado.config = {
      barras: { [setor]: ["proposta enviada"] },
      departamentos: [{ id: setor, name: "Arte/Designer" }],
    };
    const valor = { tab: "active" as const, search: "", onlyUnread: false };
    render(<BarraKanbanInbox value={valor} filtros={{ view: "active" }} onChange={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: "Departamento da barra Kanban" })).not.toBeInTheDocument();
    expect(screen.getByText("Arte/Designer")).toBeVisible();
    expect(screen.getByRole("button", { name: /proposta enviada: .* cards/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /em andamento: .* cards/ })).not.toBeInTheDocument();
  });
  it("mostra dois contadores e aplica/desliga a etapa preservando os demais filtros", () => {
    const onChange = vi.fn();
    const value = { tab: "active" as const, search: "Ana", onlyUnread: false };
    const { rerender } = render(
      <BarraKanbanInbox value={value} filtros={{ view: "active" }} onChange={onChange} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "em andamento: 12 cards, 4 conversas novas" }),
    );
    expect(
      within(
        screen.getByRole("button", { name: "em andamento: 12 cards, 4 conversas novas" }),
      ).getByText("4"),
    ).toBeVisible();
    expect(onChange).toHaveBeenCalledWith({ ...value, kanban_tag: "em andamento" });
    rerender(
      <BarraKanbanInbox
        value={{ ...value, kanban_tag: "em andamento" }}
        filtros={{ view: "active" }}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", { name: "em andamento: 12 cards, 4 conversas novas" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "em andamento: 12 cards, 4 conversas novas" }),
    );
    expect(onChange).toHaveBeenLastCalledWith({ ...value, kanban_tag: undefined });
  });
  it("não mostra aviso de novas conversas quando a quantidade é zero ou ainda não carregou", () => {
    const value = { tab: "active" as const, search: "", onlyUnread: false };
    contagens.data = [{ tag: "em andamento", total: 12, novas: 0 }];
    const { rerender } = render(
      <BarraKanbanInbox value={value} filtros={{ view: "active" }} onChange={vi.fn()} />,
    );
    const etapa = screen.getByRole("button", { name: "em andamento: 12 cards, 0 conversas novas" });
    expect(within(etapa).getByText("12")).toBeVisible();
    expect(within(etapa).queryByText("0")).not.toBeInTheDocument();
    contagens.data = undefined;
    rerender(<BarraKanbanInbox value={value} filtros={{ view: "active" }} onChange={vi.fn()} />);
    const carregando = screen.getByRole("button", {
      name: "em andamento: … cards, … conversas novas",
    });
    expect(within(carregando).getAllByText("…")).toHaveLength(1);
  });
  it("o ícone abre seleção múltipla; salvar leva o responsável e as etiquetas observadas", () => {
    const conversa = {
      ...conversaDeExemplo.conversation,
      id: "conv",
      assigned_to_user_id: "a",
      assigned_to_user_name: "Ana",
      tags: ["em andamento"],
      contacts: {
        ...conversaDeExemplo.conversation.contacts!,
        name: "Cliente sintético",
        display_name: "Nome do canal",
      },
    };
    render(<EtiquetasKanbanConversa conversa={conversa} />);
    fireEvent.click(screen.getByRole("button", { name: "Etiquetas Kanban — Cliente sintético" }));
    expect(screen.getByRole("checkbox", { name: "em andamento" })).toBeChecked();
    fireEvent.click(screen.getByRole("checkbox", { name: "proposta enviada" }));
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(atualizar).toHaveBeenCalledWith(
      {
        conversation_id: "conv",
        tags: ["em andamento", "proposta enviada"],
        expected_assignee: "a",
        expected_tags: ["em andamento"],
      },
      expect.anything(),
    );
  });
  it("uma conversa sem atendente oferece consulta e não grava etiquetas", () => {
    render(
      <EtiquetasKanbanConversa
        conversa={{
          ...conversaDeExemplo.conversation,
          id: "conv",
          assigned_to_user_id: null,
          tags: [],
          contacts: {
            ...conversaDeExemplo.conversation.contacts!,
            name: "Fila",
            display_name: "Fila",
          },
        }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Etiquetas Kanban — Fila" }));
    expect(screen.getByRole("checkbox", { name: "em andamento" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(atualizar).not.toHaveBeenCalled();
  });
});
