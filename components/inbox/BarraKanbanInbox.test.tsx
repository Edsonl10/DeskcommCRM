import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BarraKanbanInbox } from "./BarraKanbanInbox";
import { EtiquetasKanbanConversa } from "./EtiquetasKanbanConversa";
import { conversaDeExemplo } from "./__fixtures__/conversa";
const { salvar, atualizar } = vi.hoisted(() => ({ salvar: vi.fn(), atualizar: vi.fn() }));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { id: "a", support: null }, activeOrg: { orgId: "org", role: "admin" } }),
}));
vi.mock("@/hooks/inbox/useInboxKanban", () => ({
  useInboxKanban: () => ({ data: { barras: {}, departamentos: [] } }),
  useSalvarBarraKanban: () => ({ mutate: salvar, isPending: false }),
  useContagensKanban: () => ({ data: [{ tag: "em andamento", total: 12, novas: 4 }] }),
}));
vi.mock("@/hooks/inbox/useConversationTags", () => ({
  useConversationTagVocabulary: () => ({ data: [] }),
  useUpdateConversationTags: () => ({ mutate: atualizar, isPending: false }),
}));
beforeEach(() => vi.clearAllMocks());
describe("controles Kanban", () => {
  it("mostra dois contadores e aplica/desliga a etapa preservando os demais filtros", () => {
    const onChange = vi.fn();
    const value = { tab: "active" as const, search: "Ana", onlyUnread: false };
    const { rerender } = render(
      <BarraKanbanInbox value={value} filtros={{ view: "active" }} onChange={onChange} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "em andamento: 12 cards, 4 conversas novas" }),
    );
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
  it("o ícone abre seleção múltipla; salvar leva o responsável e as etiquetas observadas", () => {
    const conversa = {
      ...conversaDeExemplo.conversation,
      id: "conv",
      assigned_to_user_id: "a",
      assigned_to_user_name: "Ana",
      tags: ["em andamento"],
      contacts: { ...conversaDeExemplo.conversation.contacts!, display_name: "Cliente sintético" },
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
        conversa={
          {
            ...conversaDeExemplo.conversation,
            id: "conv",
            assigned_to_user_id: null,
            tags: [],
            contacts: { ...conversaDeExemplo.conversation.contacts!, display_name: "Fila" },
          }
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Etiquetas Kanban — Fila" }));
    expect(screen.getByRole("checkbox", { name: "em andamento" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Concluir" }));
    expect(atualizar).not.toHaveBeenCalled();
  });
});
