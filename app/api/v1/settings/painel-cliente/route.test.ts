import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { fail } from "@/lib/api/wrappers";
import { BLOCOS_DO_PAINEL } from "@/lib/inbox/painel-do-cliente";
import { GET, PATCH } from "./route";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
const org = "22222222-2222-4222-8222-222222222222";
const user = "11111111-1111-4111-8111-111111111111";
const settings = { proposals: { enabled: true }, crm: { cliente_pela_agenda: true } };
let patch: Record<string, unknown> | null;
let filtros: Array<[string, unknown]>;
let readError: boolean, conflict: boolean;
function client() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((field: string, value: unknown) => {
      filtros.push([field, value]);
      return query;
    }),
    is: vi.fn(() => query),
    single: vi.fn(async () => ({
      data: readError ? null : { settings },
      error: readError ? {} : null,
    })),
    maybeSingle: vi.fn(async () => ({ data: conflict ? null : { id: org }, error: null })),
    update: vi.fn((value: Record<string, unknown>) => {
      patch = value;
      return query;
    }),
  };
  return {
    from: vi.fn((table: string) => {
      expect(table).toBe("organizations");
      return query;
    }),
  };
}
function request(body: unknown) {
  return new NextRequest("http://localhost/api/v1/settings/painel-cliente", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  patch = null;
  filtros = [];
  readError = false;
  conflict = false;
  vi.mocked(requireSupportWrite).mockResolvedValue(null);
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: user, idioma: "pt-BR" },
    org: { orgId: org },
  } as never);
  vi.mocked(createClient).mockResolvedValue(client() as never);
  vi.mocked(createAdminClient).mockReturnValue(client() as never);
});
describe("configuração do painel por organização", () => {
  it("qualquer membro lê somente a ordem da organização da sessão", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({ ordem: BLOCOS_DO_PAINEL });
    expect(requireRole).toHaveBeenCalledWith("viewer", expect.anything());
    expect(filtros).toContainEqual(["id", org]);
  });
  it("somente admin escreve, preserva outras configurações e audita", async () => {
    const ordem = [...BLOCOS_DO_PAINEL].reverse();
    expect((await PATCH(request({ ordem }))).status).toBe(200);
    expect(requireRole).toHaveBeenCalledWith("admin", expect.anything());
    expect(patch).toEqual({ settings: { ...settings, painel_cliente_ordem: ordem } });
    expect(filtros).toContainEqual(["id", org]);
    expect(filtros).toContainEqual(["settings", JSON.stringify(settings)]);
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: org, actorUserId: user }),
    );
  });
  it("não grava se leitura falha ou se houve alteração concorrente", async () => {
    readError = true;
    expect((await PATCH(request({ ordem: BLOCOS_DO_PAINEL }))).status).toBe(500);
    expect(patch).toBeNull();
    readError = false;
    conflict = true;
    expect((await PATCH(request({ ordem: BLOCOS_DO_PAINEL }))).status).toBe(409);
    expect(audit).not.toHaveBeenCalled();
  });
  it("recusa ordem duplicada, incompleta e organização enviada pelo cliente", async () => {
    for (const body of [
      { ordem: ["contato"] },
      { ordem: BLOCOS_DO_PAINEL.map(() => "contato") },
      { ordem: BLOCOS_DO_PAINEL, organization_id: org },
    ]) {
      expect((await PATCH(request(body))).status).toBe(422);
    }
    expect(patch).toBeNull();
  });
  it("respeita bloqueios de RBAC e suporte antes de acessar o banco", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    } as never);
    expect((await PATCH(request({ ordem: BLOCOS_DO_PAINEL }))).status).toBe(403);
    expect(createAdminClient).not.toHaveBeenCalled();
    vi.mocked(requireSupportWrite).mockResolvedValue(fail("forbidden_scope", "Somente leitura.", 403));
    expect((await PATCH(request({ ordem: BLOCOS_DO_PAINEL }))).status).toBe(403);
  });
});
