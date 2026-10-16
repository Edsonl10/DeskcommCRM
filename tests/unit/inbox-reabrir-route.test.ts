import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const rpc = vi.hoisted(() => vi.fn());
const audit = vi.hoisted(() => vi.fn());
const activity = vi.hoisted(() => vi.fn());
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: async () => null }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: async () => ({ ok: true, user: { id: "me" }, org: { orgId: "org", role: "agent" } }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc }) }));
vi.mock("@/lib/audit", () => ({ audit }));
vi.mock("@/lib/inbox/atividade-de-comando", () => ({ registrarTrocaDeComando: activity }));
import { POST } from "@/app/api/v1/conversations/[id]/reopen/route";
const id="90060000-0000-4000-8000-000000000006";
const conv={ id, contact_id: "contact", assigned_to_user_id: "me", status: "claimed" };
const request=(body: unknown = { expected_revision: 3 }) => POST(new NextRequest(`http://localhost/api/v1/conversations/${id}/reopen`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
beforeEach(() => vi.clearAllMocks());
describe("reabrir pela rota", () => {
  it.each([false,true])("retorno composto em array=%s mantém contrato e atividade", async (array) => {
    rpc.mockResolvedValue({ data: array ? [conv] : conv, error: null });
    const res=await request();
    expect(res.status).toBe(200); expect(await res.json()).toMatchObject({ data: conv });
    expect(activity).toHaveBeenCalledWith(expect.objectContaining({ contactId: "contact", conversationId: id, tipo: "conversation_claimed" }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "conversation.reopened" }));
    expect(rpc).toHaveBeenCalledWith("fn_reopen_inbox", { p_org: "org", p_conversation: id, p_expected: 3 });
  });
  it("revisão vencida devolve 409 sem registrar reabertura", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PT409" } });
    expect((await request()).status).toBe(409); expect(audit).not.toHaveBeenCalled(); expect(activity).not.toHaveBeenCalled();
  });
  it("sem revisão não tenta modificar o banco", async () => {
    expect((await request({})).status).toBe(422); expect(rpc).not.toHaveBeenCalled();
  });
});
