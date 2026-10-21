import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NomeDoContatoEditavel } from "./NomeDoContatoEditavel";
import { SobreCliente } from "./SobreCliente";
const state = vi.hoisted(() => ({
  role: "agent",
  readonly: false,
  name: "Maria",
  texto: "Cliente antiga",
  anonimizado: false,
}));
const save = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { support: state.readonly ? { access_mode: "support_readonly" } : null },
    activeOrg: { role: state.role },
  }),
}));
vi.mock("@/hooks/contacts/useUpdateContact", () => ({
  useUpdateContact: () => ({ mutateAsync: save, isPending: false }),
}));
vi.mock("@/hooks/contacts/useContact", () => ({
  useContact: () => ({
    data: {
      data: { custom_fields: { __sobre_cliente: state.texto }, is_anonymized: state.anonimizado },
    },
  }),
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.role = "agent";
  state.readonly = false;
  state.anonimizado = false;
  save.mockResolvedValue(undefined);
});
describe("edição direta do cadastro", () => {
  it("salva o nome escolhido sem alterar o nome informado pelo canal", async () => {
    render(
      <NomeDoContatoEditavel
        contact={{ id: "c1", name: "Maria", display_name: "Perfil" }}
        as="h2"
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Editar nome do contato" }));
    await userEvent.clear(screen.getByRole("textbox", { name: "Nome do contato" }));
    expect(screen.getByRole("button", { name: /^Salvar$/ })).toBeDisabled();
    await userEvent.type(screen.getByRole("textbox"), " Maria Silva ");
    await userEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));
    expect(save).toHaveBeenCalledWith({ name: "Maria Silva" });
  });
  it("cancelar o nome não dispara escrita", async () => {
    render(<NomeDoContatoEditavel contact={{ id: "c1", name: "Maria" }} />);
    await userEvent.click(screen.getByRole("button", { name: "Editar nome do contato" }));
    await userEvent.type(screen.getByRole("textbox"), " outro");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Maria")).toBeVisible();
  });
  it("falha ao gravar preserva o texto para nova tentativa", async () => {
    save.mockRejectedValueOnce(new Error("Falha simulada"));
    render(<SobreCliente contactId="c1" />);
    await userEvent.click(screen.getByRole("button", { name: "Editar Sobre o Cliente" }));
    await userEvent.clear(screen.getByRole("textbox"));
    await userEvent.type(screen.getByRole("textbox"), "Texto a preservar");
    await userEvent.click(screen.getByRole("button", { name: /^Salvar$/ }));
    await waitFor(() => expect(save).toHaveBeenCalledWith({ sobre_cliente: "Texto a preservar" }));
    expect(screen.getByRole("textbox")).toHaveValue("Texto a preservar");
  });
  it.each(["viewer", "support", "anonimizado"])("%s permanece somente leitura", (tipo) => {
    state.role = tipo === "viewer" ? "viewer" : "admin";
    state.readonly = tipo === "support";
    state.anonimizado = tipo === "anonimizado";
    render(
      <>
        <NomeDoContatoEditavel
          contact={{ id: "c1", name: "Maria", is_anonymized: state.anonimizado }}
        />
        <SobreCliente contactId="c1" />
      </>,
    );
    expect(screen.queryByRole("button", { name: "Editar nome do contato" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Editar Sobre o Cliente" })).toBeNull();
  });
});
