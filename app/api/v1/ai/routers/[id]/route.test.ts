import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/v1/ai/routers/:id é a rota que o editor rebusca depois de salvar.
 * Se ela não devolve `flow_pointer_id`, o baseline do editor vira "nenhuma
 * intenção tem roteiro": o Salvar fica ligado depois de vincular, e escolher
 * "Nenhum" deixa o draft igual ao baseline — o desvínculo nunca é gravado e a
 * intenção segue disparando o roteiro.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const ROUTER_ID = "55555555-5555-4555-8555-555555555555";

describe("GET /api/v1/ai/routers/:id", () => {
  it("devolve flow_pointer_id de cada membro", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: true,
      user: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "a@example.com",
        full_name: null,
        avatar_url: null,
        is_platform_admin: false,
        idioma: "pt-BR" as const,
        organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: "agent" }],
      },
      org: { orgId: ORG_ID, name: "Org", role: "agent" },
    } as Awaited<ReturnType<typeof requireRole>>);

    const selects: Record<string, string> = {};
    const chain = (table: string, result: unknown) => {
      const q = {
        select(cols: string) {
          selects[table] = cols;
          return q;
        },
        eq() {
          return q;
        },
        maybeSingle: () => Promise.resolve({ data: result, error: null }),
        order: () => Promise.resolve({ data: result, error: null }),
      };
      return q;
    };
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) =>
        table === "ai_routers"
          ? chain(table, { id: ROUTER_ID, name: "R" })
          : chain(table, [{ id: "m1", flow_pointer_id: "77777777-7777-4777-8777-777777777777" }]),
    } as unknown as ReturnType<typeof createAdminClient>);

    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://x/api/v1/ai/routers/${ROUTER_ID}`), {
      params: Promise.resolve({ id: ROUTER_ID }),
    });

    expect(res.status).toBe(200);
    expect(selects.ai_router_members).toContain("flow_pointer_id");
  });
});

describe('PATCH destino humano', () => {
  const dept = '66666666-6666-4666-8666-666666666666';
  const human = { fallback_department_id: dept, routes: [{ intent_name: 'Cobrança', intent_description: 'Boleto existente', examples: [], department_id: dept }] };
  async function patch(config: unknown, found: string[]) {
    vi.mocked(requireRole).mockResolvedValue({ ok: true, user: { id: 'u', idioma: 'pt-BR' }, org: { orgId: ORG_ID } } as never);
    const filters: unknown[][] = []; const writes: unknown[] = [];
    vi.mocked(createAdminClient).mockReturnValue({ from(table: string) {
      const q = {
        select: () => q,
        eq: (...args: unknown[]) => { filters.push([table, ...args]); return q; },
        maybeSingle: async () => ({ data: { id: ROUTER_ID, config: {}, fallback_agent_id: null }, error: null }),
        in: async () => ({ data: found.map((id) => ({ id })), error: null }),
        update: (value: unknown) => { writes.push(value); return q; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
      }; return q;
    } } as never);
    const { PATCH } = await import('./route');
    const response = await PATCH(new NextRequest(`http://x/api/v1/ai/routers/${ROUTER_ID}`, { method: 'PATCH', body: JSON.stringify({ is_active: false, fallback_agent_id: null, config: { human_routing: config } }) }), { params: Promise.resolve({ id: ROUTER_ID }) });
    return { response, filters, writes };
  }
  it('salva no roteador existente, conferindo os setores ativos da organização', async () => {
    const { response, filters, writes } = await patch(human, [dept]);
    expect(response.status).toBe(200);
    expect(filters).toContainEqual(['departments', 'organization_id', ORG_ID]);
    expect(filters).toContainEqual(['departments', 'is_active', true]);
    expect(writes).toEqual([expect.objectContaining({ is_active: false, config: { human_routing: human } })]);
  });
  it('recusa setor de outra organização ou inativo sem atualizar o roteador', async () => {
    const { response, writes } = await patch(human, []);
    expect(response.status).toBe(422); expect(writes).toEqual([]);
  });
  it('recusa política inválida e intenções repetidas', async () => {
    for (const config of [{}, { ...human, routes: [...human.routes, { ...human.routes[0], intent_name: ' cobrança ' }] }]) {
      const { response, writes } = await patch(config, [dept]);
      expect(response.status).toBe(422); expect(writes).toEqual([]);
    }
  });
});
