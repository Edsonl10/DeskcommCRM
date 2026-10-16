import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { registrarTrocaDeComando } from "@/lib/inbox/atividade-de-comando";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const denied = await requireSupportWrite();
  if (denied) return denied;
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return fail("not_found", "Conversa não encontrada.", 404, { requestId });
  const input = z.object({ expected_revision: z.number().int().nonnegative() }).strict().safeParse(await req.json().catch(() => null));
  if (!input.success) return fail("validation_error", "Informe a revisão do atendimento.", 422, { requestId });
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("fn_reopen_inbox", {
    p_org: authz.org.orgId, p_conversation: id, p_expected: input.data.expected_revision,
  });
  if (error) {
    if (error.code === "PT409" || error.code === "40001") return fail("state_conflict", "O atendimento mudou. Atualize e tente novamente.", 409, { requestId });
    if (error.code === "P0002") return fail("not_found", "Conversa não encontrada.", 404, { requestId });
    if (error.code === "42501") return fail("forbidden", "Sem permissão para reabrir este atendimento.", 403, { requestId });
    return fail("internal_error", "Não foi possível reabrir o atendimento.", 500, { requestId });
  }
  await audit({ action: "conversation.reopened", actorUserId: authz.user.id, organizationId: authz.org.orgId, resourceType: "conversation", resourceId: id, requestId });
  await registrarTrocaDeComando({ supabase, organizationId: authz.org.orgId, conversationId: id, contactId: data.contact_id,
    tipo: "conversation_claimed", actor: { type: "user", id: authz.user.id, role: authz.org.role }, motivo: "Reabriu e assumiu o atendimento desta conversa" });
  return ok(data, { requestId });
}
