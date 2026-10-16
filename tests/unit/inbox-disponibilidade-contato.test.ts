import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  conversation: { id: "90060000-0000-4000-8000-000000000006", contact_id: "contact", status: "claimed", assigned_to_user_id: "other", assigned_to_user_name: "Maria" } as Record<string, unknown> | null,
  contact: { id: "contact" } as { id: string } | null,
  visible: { id: "cv" } as { id: string } | null,
  filters: [] as unknown[][],
}));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: async () => ({ ok: true, user: { id: "me" }, org: { orgId: "org" } }) }));
vi.mock("@/lib/users/com-nome-do-atendente", () => ({ comNomeDoAtendente: async (rows: unknown[]) => rows }));
function chain(data: unknown) {
  const q = { select: () => q, eq: (...args: unknown[]) => { state.filters.push(args); return q; }, maybeSingle: async () => ({ data, error: null }) };
  return q;
}
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => chain(state.conversation) }) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => chain(table === "contacts" ? state.contact : state.visible) }) }));
import { GET } from "@/app/api/v1/conversations/[id]/availability/route";
const id = "90060000-0000-4000-8000-000000000006";
const request = () => GET(new Request(`http://localhost/api/v1/conversations/${id}/availability`), { params: Promise.resolve({ id }) });
beforeEach(() => {
  state.conversation = { id, contact_id: "contact", status: "claimed", assigned_to_user_id: "other", assigned_to_user_name: "Maria" };
  state.contact = { id: "contact" }; state.visible = { id }; state.filters = [];
});
describe("disponibilidade do atalho de contatos", () => {
  it("informa o responsável sem devolver a conversa", async () => {
    const res = await request(); expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: { message: "Este contato já está em atendimento com Maria." } });
    expect(state.filters).toContainEqual(["organization_id", "org"]);
  });
  it("não dá o nome se o contato estiver fora do acesso", async () => {
    state.contact = null; const res = await request(); expect(res.status).toBe(404);
    expect(JSON.stringify(await res.json())).not.toContain("Maria");
  });
  it("permite abrir conversa própria", async () => {
    state.conversation!.assigned_to_user_id = "me";
    const res = await request(); expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ data: { available: true } });
  });
  it("conversa fechada visível abre para leitura sem reabrir", async () => {
    state.conversation!.status = "closed";
    expect((await request()).status).toBe(200);
  });
  it("conversa fechada oculta continua protegida", async () => {
    state.conversation!.status = "closed"; state.visible = null;
    expect((await request()).status).toBe(404);
  });
});
