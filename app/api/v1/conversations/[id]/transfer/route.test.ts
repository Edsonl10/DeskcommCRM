import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const fixtures = vi.hoisted(() => ({
  id: "11111111-1111-4111-8111-111111111111",
  org: "22222222-2222-4222-8222-222222222222",
  destino: "33333333-3333-4333-8333-333333333333",
  setor: "44444444-4444-4444-8444-444444444444",
  outroSetor: "55555555-5555-4555-8555-555555555555",
  vinculos: [] as { department_id: string }[],
  setores: [] as { id: string }[],
  chamadas: [] as { fn: string; params: Record<string, unknown> }[],
  filtros: [] as { table: string; column: string; value: unknown }[],
}));

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn(async () => null) }));
vi.mock("@/lib/auth/require-role", () => ({
  requireRole: vi.fn(async () => ({
    ok: true,
    user: { id: fixtures.destino, idioma: "pt-BR" },
    org: { orgId: fixtures.org, role: "admin" },
  })),
}));
vi.mock("@/lib/audit", () => ({
  audit: vi.fn(async () => {}),
  isServiceRoleConfigured: vi.fn(() => false),
}));
vi.mock("@/lib/inbox/atividade-de-comando", () => ({
  registrarTrocaDeComando: vi.fn(async () => {}),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      const query = {
        select: () => query,
        eq: (column: string, value: unknown) => {
          fixtures.filtros.push({ table, column, value });
          return query;
        },
        in: async () => ({ data: fixtures.setores, error: null }),
        then: (resolve: (result: unknown) => unknown) =>
          Promise.resolve({
            data: table === "department_members" ? fixtures.vinculos : [],
            error: null,
          }).then(resolve),
      };
      return query;
    },
    rpc: async (fn: string, params: Record<string, unknown>) => {
      fixtures.chamadas.push({ fn, params });
      return {
        data: fn === "emit_event" ? null : [{
          id: fixtures.id,
          organization_id: fixtures.org,
          contact_id: fixtures.destino,
          assigned_to_user_id: fixtures.destino,
          assigned_department_id: params.p_department_id ?? fixtures.setor,
        }],
        error: null,
      };
    },
  })),
}));

const ctx = { params: Promise.resolve({ id: fixtures.id }) };
function request(payload: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/v1/conversations/${fixtures.id}/transfer`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  fixtures.vinculos = [{ department_id: fixtures.setor }];
  fixtures.setores = [{ id: fixtures.setor }];
  fixtures.chamadas.length = 0;
  fixtures.filtros.length = 0;
});

describe("transferência entre departamentos", () => {
  it("transferência direta muda responsável E departamento atomicamente", async () => {
    const r = await POST(request({ to_user_id: fixtures.destino, reason: "Atendimento do administrativo" }), ctx);
    expect(r.status).toBe(200);
    expect(fixtures.chamadas.find((c) => c.fn === "fn_conversation_assign_department")?.params).toEqual({
      p_organization_id: fixtures.org,
      p_conversation_id: fixtures.id,
      p_department_id: fixtures.setor,
      p_to_user_id: fixtures.destino,
    });
    expect(fixtures.chamadas.some((c) => c.fn === "fn_conversation_assign")).toBe(false);
    expect((await r.json()).data.assigned_department_id).toBe(fixtures.setor);
    expect(fixtures.filtros).toContainEqual({ table: "department_members", column: "organization_id", value: fixtures.org });
    expect(fixtures.filtros).toContainEqual({ table: "department_members", column: "user_id", value: fixtures.destino });
  });

  it("transferência explícita usa o setor escolhido, sem inferir do atual", async () => {
    const r = await POST(request({ department_id: fixtures.outroSetor, to_user_id: fixtures.destino }), ctx);
    expect(r.status).toBe(200);
    expect(fixtures.chamadas.find((c) => c.fn === "fn_conversation_assign_department")?.params)
      .toMatchObject({ p_department_id: fixtures.outroSetor, p_to_user_id: fixtures.destino });
    expect(fixtures.filtros).toHaveLength(0);
  });

  it("dois setores para o mesmo atendente exigem escolha explícita", async () => {
    fixtures.vinculos.push({ department_id: fixtures.outroSetor });
    fixtures.setores.push({ id: fixtures.outroSetor });
    const r = await POST(request({ to_user_id: fixtures.destino }), ctx);
    expect(r.status).toBe(422);
    expect(fixtures.chamadas).toHaveLength(0);
  });

  it("não transfere automaticamente para atendente sem setor ativo", async () => {
    fixtures.setores = [];
    const r = await POST(request({ to_user_id: fixtures.destino }), ctx);
    expect(r.status).toBe(422);
    expect(fixtures.chamadas).toHaveLength(0);
  });
});
