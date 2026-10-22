import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { InboxAdvancedFilters } from "@/components/inbox/InboxAdvancedFilters";
import {
  aplicarFiltrosAvancados,
  filtrosAvancadosSchema,
  periodoDasDatas,
  serializarFiltrosAvancados,
} from "@/lib/inbox/filtros-avancados";
import { listConversationsQuerySchema } from "@/lib/schemas";
import { filtrosAuxiliaresAtivos } from "@/lib/inbox/filtros-ativos";

const departamento = "a1000000-0000-4000-8000-000000000001";
const atendente = "a1000000-0000-4000-8000-000000000002";
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({ activeOrg: { role: "admin", orgId: "org" } }),
}));
vi.mock("@/hooks/team/useDepartments", () => ({
  useDepartments: () => ({
    data: { data: [{ id: departamento, name: "Financeiro", color: "#008800" }] },
  }),
}));
vi.mock("@/hooks/inbox/useAssignableMembers", () => ({
  useAssignableMembers: () => ({ data: [{ user_id: atendente, full_name: "Ana", role: "agent" }] }),
}));
afterEach(cleanup);

describe("Filtros avançados da Inbox", () => {
  it("valida IDs, limites e período nas duas portas HTTP", () => {
    for (const schema of [filtrosAvancadosSchema, listConversationsQuerySchema]) {
      expect(
        schema.safeParse({ department_ids: [departamento], assigned_user_ids: [atendente] })
          .success,
      ).toBe(true);
      expect(schema.safeParse({ department_ids: ["x),id.not.is.null"] }).success).toBe(false);
      expect(schema.safeParse({ assigned_user_ids: Array(51).fill(atendente) }).success).toBe(
        false,
      );
      expect(schema.safeParse({ last_message_from: "ontem" }).success).toBe(false);
      expect(
        schema.safeParse({
          last_message_from: "2026-10-23T00:00:00Z",
          last_message_before: "2026-10-22T00:00:00Z",
        }).success,
      ).toBe(false);
    }
  });
  it("leva todos os IDs e os limites até a query sem filtrar uma página em memória", () => {
    const chamadas: unknown[][] = [];
    const q = {
      in: (c: string, v: readonly string[]) => {
        chamadas.push(["in", c, v]);
        return q;
      },
      gte: (c: string, v: string) => {
        chamadas.push(["gte", c, v]);
        return q;
      },
      lt: (c: string, v: string) => {
        chamadas.push(["lt", c, v]);
        return q;
      },
    };
    const filtros = {
      department_ids: [departamento, atendente],
      assigned_user_ids: [atendente],
      ...periodoDasDatas("2026-10-22", "2026-10-22"),
    };
    aplicarFiltrosAvancados(q, filtros);
    expect(chamadas).toEqual([
      ["in", "assigned_department_id", [departamento, atendente]],
      ["in", "assigned_to_user_id", [atendente]],
      ["gte", "last_message_at", filtros.last_message_from],
      ["lt", "last_message_at", filtros.last_message_before],
    ]);
    const qs = new URLSearchParams();
    serializarFiltrosAvancados(qs, filtros);
    expect(qs.getAll("department_ids")).toEqual([departamento, atendente]);
    expect(qs.getAll("assigned_user_ids")).toEqual([atendente]);
    expect(qs.get("last_message_before")).toBe(filtros.last_message_before);
    expect(filtrosAuxiliaresAtivos(filtros)).toEqual(["Departamento", "Atendente", "Período"]);
  });
  it("inclui o dia final inteiro e aceita intervalo aberto", () => {
    const periodo = periodoDasDatas("2026-10-22", "2026-10-22");
    expect(new Date(periodo.last_message_from!).getDate()).toBe(22);
    expect(new Date(periodo.last_message_before!).getDate()).toBe(23);
    expect(periodoDasDatas("", "")).toEqual({
      last_message_from: undefined,
      last_message_before: undefined,
    });
  });
  it("edita em rascunho, combina escolhas e só aplica ao salvar", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <InboxAdvancedFilters
        value={{ tab: "all", search: "Maria", onlyUnread: false }}
        onChange={onChange}
        onClose={onClose}
        channels={[]}
        tags={["vip", "urgente"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Financeiro" }));
    fireEvent.click(screen.getByRole("button", { name: "Ana" }));
    fireEvent.click(screen.getByRole("button", { name: "vip" }));
    fireEvent.click(screen.getByRole("button", { name: "urgente" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Mensagens não lidas" }));
    fireEvent.change(screen.getByLabelText("Data inicial"), { target: { value: "2026-10-22" } });
    fireEvent.change(screen.getByLabelText("Data final"), { target: { value: "2026-10-22" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tab: "all",
        search: "Maria",
        onlyUnread: true,
        department_ids: [departamento],
        assigned_user_ids: [atendente],
        tag: ["vip", "urgente"],
        ...periodoDasDatas("2026-10-22", "2026-10-22"),
      }),
    );
    expect(onClose).toHaveBeenCalledOnce();
  });
  it("limpar remove filtros anteriores, preservando busca e aba", () => {
    const onChange = vi.fn();
    const onClose = vi.fn();
    render(
      <InboxAdvancedFilters
        value={{
          tab: "closed",
          search: "Maria",
          onlyUnread: true,
          channel_session_id: departamento,
          department_ids: [departamento],
          assigned_user_ids: [atendente],
          tag: "vip",
          ...periodoDasDatas("2026-10-22", "2026-10-22"),
        }}
        onChange={onChange}
        onClose={onClose}
        channels={[]}
        tags={["vip"]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        tab: "closed",
        search: "Maria",
        onlyUnread: false,
        channel_session_id: undefined,
        department_ids: undefined,
        assigned_user_ids: undefined,
        tag: undefined,
        last_message_from: undefined,
        last_message_before: undefined,
      }),
    );
  });
});
