import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { departamentosPermitidosNoInbox } from "@/lib/inbox/escopo-do-setor";
import { fail } from "@/lib/api/wrappers";
import { GET, PATCH } from "./route";
vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/inbox/escopo-do-setor", () => ({ departamentosPermitidosNoInbox: vi.fn() }));
const org = "11111111-1111-4111-8111-111111111111",
  dept = "22222222-2222-4222-8222-222222222222";
const settings = { preservar: true, inbox_kanban_barras: { padrao: ["geral"], outro: ["outra"] } };
let patch: unknown, conflict: boolean, deptExiste: boolean;
const filtros: Array<[string, string, unknown]> = [];
function client() {
  return {
    from: (table: string) => {
      const q = {
        select: () => q,
        eq: (col: string, v: unknown) => {
          filtros.push([table, col, v]);
          return q;
        },
        is: () => q,
        order: async () => ({ data: [{ id: dept, name: "Comercial" }], error: null }),
        single: async () => ({ data: { settings }, error: null }),
        maybeSingle: async () => ({
          data: (table === "departments" ? deptExiste : !conflict) ? { id: dept } : null,
          error: null,
        }),
        update: (v: unknown) => {
          patch = v;
          return q;
        },
      };
      return q;
    },
  };
}
function req(input: unknown) {
  return new NextRequest("http://localhost/api/v1/settings/inbox-kanban", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  patch = undefined;
  conflict = false;
  deptExiste = true;
  filtros.length = 0;
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(departamentosPermitidosNoInbox).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: org, idioma: "pt-BR" },
    org: { orgId: org },
  } as never);
  vi.mocked(createAdminClient).mockReturnValue(client() as never);
  vi.mocked(createClient).mockResolvedValue(client() as never);
});
describe("configuração Kanban", () => {
  it("lê barras e departamentos só da organização autenticada", async () => {
    const r = await GET();
    expect(r.status).toBe(200);
    expect((await r.json()).data.barras).toEqual(settings.inbox_kanban_barras);
    expect(filtros).toContainEqual(["organizations", "id", org]);
    expect(filtros).toContainEqual(["departments", "organization_id", org]);
  });
  it("um atendente recebe somente a configuração de seus setores", async () => {
    vi.mocked(departamentosPermitidosNoInbox).mockResolvedValue([dept]);
    const response = await GET();
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.departamentos).toEqual([{ id: dept, name: "Comercial" }]);
    expect(json.data.barras).toEqual({});
    expect(departamentosPermitidosNoInbox).toHaveBeenCalledWith(org, org, undefined);
  });
  it("salva por departamento, preserva outros departamentos/settings e audita", async () => {
    const r = await PATCH(req({ departamento_id: dept, etiquetas: ["fechado", "em andamento"] }));
    expect(r.status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith("admin", expect.anything());
    expect(patch).toEqual({
      settings: {
        ...settings,
        inbox_kanban_barras: {
          ...settings.inbox_kanban_barras,
          [dept]: ["fechado", "em andamento"],
        },
      },
    });
    expect(filtros).toContainEqual(["organizations", "settings", JSON.stringify(settings)]);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: org, action: "settings.inbox_kanban_updated" }),
    );
  });
  it("departamento de outra organização é recusado sem escrita", async () => {
    deptExiste = false;
    expect((await PATCH(req({ departamento_id: dept, etiquetas: ["x"] }))).status).toBe(404);
    expect(filtros).toContainEqual(["departments", "organization_id", org]);
    expect(patch).toBeUndefined();
  });
  it("revisão concorrente vira conflito e não anuncia sucesso", async () => {
    conflict = true;
    expect((await PATCH(req({ departamento_id: null, etiquetas: [] }))).status).toBe(409);
    expect(audit).not.toHaveBeenCalled();
  });
  it("viewer e suporte de consulta não gravam", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "Sem permissão.", 403),
    });
    expect((await PATCH(req({ departamento_id: null, etiquetas: [] }))).status).toBe(403);
    expect(patch).toBeUndefined();
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("forbidden", "Consulta.", 403));
    expect((await PATCH(req({ departamento_id: null, etiquetas: [] }))).status).toBe(403);
    expect(patch).toBeUndefined();
  });
  it("valida nomes e limite antes de tocar o banco", async () => {
    expect((await PATCH(req({ departamento_id: null, etiquetas: [""] }))).status).toBe(422);
    expect(patch).toBeUndefined();
  });
});
